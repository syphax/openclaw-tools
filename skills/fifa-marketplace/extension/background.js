/**
 * background.js — service worker
 *
 * Responsibilities:
 *   1. Relay tile data from content.js to local Python receiver
 *   2. Relay log/status messages to the popup
 *   3. Orchestrate automated match cycling:
 *        navigate tab → wait for page ready → start autopan
 *        → on autopan done → next match
 */

const RECEIVER_URL   = "http://127.0.0.1:7227/tile";
const RECEIVER_PING  = "http://127.0.0.1:7227/ping";
const MATCHES_URL    = "http://127.0.0.1:7227/matches";
const COMPLETIONS_URL = "http://127.0.0.1:7227/completions";
const COMPLETE_URL   = "http://127.0.0.1:7227/complete";
const RESALE_BASE    = "https://fwc26-resale-usd.tickets.fifa.com";

// Extra settle time after page load before starting autopan (ms)
// Gives DataDome sensor time to initialize
const PAGE_SETTLE_MS = 4000;

// Completed-match window: skip matches finished within this many seconds
const RECENT_CUTOFF_S = 6 * 3600;

// Session break: pause after this many matches (randomized per cycle)
function randomBreakAfter() { return 7 + Math.floor(Math.random() * 6); } // 7-12

let stats = { tiles: 0, seats: 0, errors: 0 };
let receiverOnline = false;
let logBuffer = [];

// Match cycling state
let cycleActive    = false;
let cycleQueue     = [];   // [{performance_id, match_code, location}, ...]
let cycleIndex     = 0;
let cycleTabId     = null;
let waitingForLoad = false;

// Session break tracking
let matchesThisSession = 0;
let nextBreakAt = 10;

// Reason reported by the most recent scan (set via AUTOPAN_STATUS done).
let lastScanReason = null;
// Count of consecutive rate-limited scans — escalates cool-down.
let consecutiveRateLimited = 0;

// Proactive reset ritual: visit the events list + date pages every N matches
// to refresh the Datadome session before it gets suspicious.
let matchesSinceReset = 0;
function randomResetEvery() { return 4 + Math.floor(Math.random() * 3); } // 4-6
let nextResetAt = randomResetEvery();

const RESET_URLS = [
  `${RESALE_BASE}/secured/list/events`,
  `${RESALE_BASE}/secured/selection/event/date?productId=10229225515651`,
];

function addLog(msg) {
  const line = `${new Date().toLocaleTimeString()} ${msg}`;
  logBuffer.push(line);
  if (logBuffer.length > 100) logBuffer.shift();
  chrome.runtime.sendMessage({ type: "LOG_UPDATE", log: logBuffer, stats }).catch(() => {});
}

async function checkReceiver() {
  try {
    const r = await fetch(RECEIVER_PING, { signal: AbortSignal.timeout(2000) });
    receiverOnline = r.ok;
  } catch {
    receiverOnline = false;
  }
  chrome.runtime.sendMessage({ type: "RECEIVER_STATUS", online: receiverOnline, stats }).catch(() => {});
  return receiverOnline;
}

setInterval(checkReceiver, 5000);
checkReceiver();

// ── Helpers ──────────────────────────────────────────────────────────

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Skewed random delay: mostly short end of [minMs, maxMs], occasionally long
function skewedDelay(minMs, maxMs) {
  return minMs + Math.pow(Math.random(), 1.5) * (maxMs - minMs);
}

async function recordCompletion(match, reason) {
  try {
    await fetch(COMPLETE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        performance_id: match.performance_id,
        match_code: match.match_code,
        reason: reason || "done",
      }),
    });
  } catch (e) {
    addLog(`Completion record failed: ${e.message}`);
  }
}

// ── Match cycling ────────────────────────────────────────────────────

function broadcastCycleState() {
  chrome.runtime.sendMessage({
    type: "CYCLE_STATE",
    active: cycleActive,
    index: cycleIndex,
    total: cycleQueue.length,
    current: cycleQueue[cycleIndex]?.match_code || null,
    stats,
  }).catch(() => {});
}

async function navigateTabAndWait(tabId, url, timeoutMs = 20000) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(ok);
    };
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId !== tabId) return;
      if (changeInfo.status === "complete") done(true);
    };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.update(tabId, { url, active: true }).catch(() => done(false));
    setTimeout(() => done(false), timeoutMs);
  });
}

async function performResetRitual(trigger) {
  if (!cycleTabId) {
    // Find or open a FIFA tab to run the ritual on
    const tabs = await chrome.tabs.query({ url: `${RESALE_BASE}/*` });
    if (tabs.length > 0) cycleTabId = tabs[0].id;
    else {
      const tab = await chrome.tabs.create({ url: RESET_URLS[0], active: true });
      cycleTabId = tab.id;
    }
  }
  addLog(`Reset ritual (${trigger}): refreshing Datadome session...`);
  for (let i = 0; i < RESET_URLS.length; i++) {
    if (!cycleActive) return;
    const ok = await navigateTabAndWait(cycleTabId, RESET_URLS[i]);
    addLog(`  Reset step ${i + 1}/${RESET_URLS.length}: ${ok ? "loaded" : "timeout"}`);
    // Dwell on the page for 3-6s — mimics a human browsing
    await new Promise(r => setTimeout(r, 3000 + Math.random() * 3000));
  }
  matchesSinceReset = 0;
  nextResetAt = randomResetEvery();
  addLog(`Reset complete. Next proactive reset after ${nextResetAt} matches.`);
}

async function navigateToMatch(match) {
  const url = `${RESALE_BASE}/secure/selection/event/seat/performance/${match.performance_id}/lang/en`;
  addLog(`Navigating to ${match.match_code} (${match.performance_id})...`);
  waitingForLoad = true;

  // Find or reuse the FIFA tab
  const tabs = await chrome.tabs.query({ url: `${RESALE_BASE}/*` });
  if (tabs.length > 0 && cycleTabId === null) {
    cycleTabId = tabs[0].id;
  }

  if (cycleTabId !== null) {
    await chrome.tabs.update(cycleTabId, { url, active: true });
  } else {
    const tab = await chrome.tabs.create({ url, active: true });
    cycleTabId = tab.id;
  }

  broadcastCycleState();
}

async function startAutopanOnTab() {
  if (!cycleTabId) return;
  addLog(`Page settled. Starting autopan for ${cycleQueue[cycleIndex]?.match_code}...`);
  try {
    await chrome.tabs.sendMessage(cycleTabId, { type: "START_AUTOPAN" });
  } catch (e) {
    addLog(`Failed to send START_AUTOPAN: ${e.message}`);
    advanceCycle();
  }
}

async function advanceCycle() {
  if (!cycleActive) return;

  // Record the match we just finished
  const justDone = cycleQueue[cycleIndex];
  if (justDone) {
    await recordCompletion(justDone, lastScanReason);
    matchesThisSession++;
    matchesSinceReset++;
  }

  cycleIndex++;
  if (cycleIndex >= cycleQueue.length) {
    cycleActive = false;
    cycleIndex  = 0;
    addLog("All matches complete!");
    broadcastCycleState();
    chrome.runtime.sendMessage({ type: "CYCLE_DONE", stats }).catch(() => {});
    return;
  }

  broadcastCycleState();

  // Rate-limit handling: short cool-down + reset ritual. Escalates cool-down
  // on consecutive blocks (30s, 60s, 120s cap), then refreshes the session.
  if (lastScanReason === "rate_limited") {
    consecutiveRateLimited++;
    const coolMs = Math.min(30000 * Math.pow(2, consecutiveRateLimited - 1), 120000);
    const jitterMs = coolMs + Math.random() * 10000;
    addLog(`Flagged (${consecutiveRateLimited}× consecutive) — cooling down ${Math.round(jitterMs / 1000)}s then resetting...`);
    await new Promise(r => setTimeout(r, jitterMs));
    if (!cycleActive) return;
    await performResetRitual("flagged");
    if (!cycleActive) return;
  } else {
    consecutiveRateLimited = 0;
    // Proactive reset every N matches to keep Datadome happy.
    if (matchesSinceReset >= nextResetAt) {
      await performResetRitual("proactive");
      if (!cycleActive) return;
    }
  }

  // Session break check
  if (matchesThisSession >= nextBreakAt) {
    const breakMs = 60000 + Math.random() * 30000; // 60-90s
    addLog(`Session break: ${Math.round(breakMs / 1000)}s (${matchesThisSession} matches done this session)...`);
    await new Promise(r => setTimeout(r, breakMs));
    matchesThisSession = 0;
    nextBreakAt = randomBreakAfter();
    if (!cycleActive) return;
  }

  // Between-match pause: skewed distribution, mostly 10-20s, occasionally up to 30s
  const betweenMs = skewedDelay(10000, 30000);
  addLog(`Pausing ${(betweenMs / 1000).toFixed(1)}s before next match (${cycleIndex + 1}/${cycleQueue.length})...`);
  await new Promise(r => setTimeout(r, betweenMs));

  if (!cycleActive) return;
  await navigateToMatch(cycleQueue[cycleIndex]);
}

async function startCycleWithFilter(matches) {
  // Fetch completions and filter out recently-done matches
  try {
    const cr = await fetch(COMPLETIONS_URL, { signal: AbortSignal.timeout(3000) });
    if (cr.ok) {
      const completions = await cr.json();
      const cutoff = Date.now() / 1000 - RECENT_CUTOFF_S;
      const before = matches.length;
      matches = matches.filter(m => {
        const ts = completions[m.performance_id];
        return !ts || ts < cutoff;
      });
      const skipped = before - matches.length;
      if (skipped > 0) {
        addLog(`Skipped ${skipped} match${skipped > 1 ? "es" : ""} done in the last 6h`);
      }
    }
  } catch (e) {
    addLog(`Could not fetch completions (proceeding anyway): ${e.message}`);
  }

  if (!matches.length) {
    addLog("All selected matches were done in the last 6h — nothing to run.");
    cycleActive = false;
    broadcastCycleState();
    chrome.runtime.sendMessage({ type: "CYCLE_DONE", stats }).catch(() => {});
    return;
  }

  // Shuffle for unpredictable traversal order
  matches = shuffle(matches);

  cycleActive = true;
  cycleQueue  = matches;
  cycleIndex  = 0;
  cycleTabId  = null;
  matchesThisSession = 0;
  nextBreakAt = randomBreakAfter();
  matchesSinceReset = 0;
  nextResetAt = randomResetEvery();
  consecutiveRateLimited = 0;
  lastScanReason = null;
  stats = { tiles: 0, seats: 0, errors: 0 };
  addLog(`Starting cycle: ${matches.length} matches (shuffled, break after ~${nextBreakAt})`);
  broadcastCycleState();
  navigateToMatch(cycleQueue[0]);
}

// Listen for tab load completion to trigger autopan
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!cycleActive || tabId !== cycleTabId) return;
  if (changeInfo.status !== "complete") return;
  if (!tab.url || !tab.url.includes("seat/performance")) return;
  if (!waitingForLoad) return;

  waitingForLoad = false;
  addLog(`Page loaded. Settling ${PAGE_SETTLE_MS / 1000}s for DataDome...`);

  // Wait for page JS + DataDome to initialize before starting autopan
  setTimeout(() => {
    if (cycleActive) startAutopanOnTab();
  }, PAGE_SETTLE_MS);
});

// ── Message handler ───────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender) => {

  // ── Tile data from content script ──
  if (msg.type === "TILE_DATA") {
    const { url, features } = msg;
    stats.tiles++;
    stats.seats += features.length;
    addLog(`Tile: ${features.length} seats (total: ${stats.seats})`);
    fetch(RECEIVER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, features }),
    }).catch((e) => {
      stats.errors++;
      addLog(`Relay error: ${e.message}`);
    });
  }

  // ── Autopan status from content script ──
  if (msg.type === "AUTOPAN_STATUS") {
    addLog(`Autopan: ${msg.status}${msg.reason ? ` (${msg.reason})` : ""}`);
    chrome.runtime.sendMessage({ type: "AUTOPAN_STATUS", status: msg.status, stats }).catch(() => {});
    if (msg.status === "done") {
      lastScanReason = msg.reason || "done";
      if (cycleActive) advanceCycle();
    } else if (msg.status === "stopped") {
      if (!cycleActive) broadcastCycleState();
    }
  }

  if (msg.type === "LOG") {
    addLog(msg.msg);
  }

  if (msg.type === "PONG") {
    chrome.runtime.sendMessage({ type: "PONG", onSeatmap: msg.onSeatmap }).catch(() => {});
  }

  // ── Manual autopan (single match, no cycling) ──
  if (msg.type === "START_AUTOPAN" && !cycleActive) {
    chrome.tabs.query({ url: `${RESALE_BASE}/*` }, (tabs) => {
      for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, { type: "START_AUTOPAN" }).catch(() => {});
      }
    });
  }

  if (msg.type === "STOP_AUTOPAN") {
    cycleActive = false;
    waitingForLoad = false;
    addLog("Stopped.");
    broadcastCycleState();
    chrome.tabs.query({ url: `${RESALE_BASE}/*` }, (tabs) => {
      for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, { type: "STOP_AUTOPAN" }).catch(() => {});
      }
    });
  }

  if (msg.type === "PING") {
    chrome.tabs.query({ url: `${RESALE_BASE}/*` }, (tabs) => {
      for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
      }
    });
  }

  // ── Match cycling ──
  if (msg.type === "START_CYCLE") {
    if (cycleActive) return;
    const matches = msg.matches;
    if (!matches || !matches.length) {
      addLog("No matches provided for cycle.");
      return;
    }
    startCycleWithFilter(matches);
  }

  if (msg.type === "STOP_CYCLE") {
    cycleActive    = false;
    waitingForLoad = false;
    addLog("Cycle stopped.");
    broadcastCycleState();
    chrome.tabs.query({ url: `${RESALE_BASE}/*` }, (tabs) => {
      for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, { type: "STOP_AUTOPAN" }).catch(() => {});
      }
    });
  }

  // ── Popup state requests ──
  if (msg.type === "GET_STATE") {
    chrome.runtime.sendMessage({
      type: "STATE",
      stats,
      log: logBuffer,
      receiverOnline,
      cycleActive,
      cycleIndex,
      cycleTotal: cycleQueue.length,
      cycleCurrent: cycleQueue[cycleIndex]?.match_code || null,
    }).catch(() => {});
  }

  if (msg.type === "RESET_STATS") {
    stats = { tiles: 0, seats: 0, errors: 0 };
    logBuffer = [];
    addLog("Stats reset.");
  }
});
