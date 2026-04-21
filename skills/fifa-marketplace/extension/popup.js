const RECEIVER_BASE = "http://127.0.0.1:7227";

const btnAutopan    = document.getElementById("btn-autopan");
const btnStop       = document.getElementById("btn-stop");
const btnReset      = document.getElementById("btn-reset");
const btnLoadMatches = document.getElementById("btn-load-matches");
const btnSelectAll  = document.getElementById("btn-select-all");
const btnSelectNone = document.getElementById("btn-select-none");
const btnSelectAvail = document.getElementById("btn-select-avail");
const btnClearCompletions = document.getElementById("btn-clear-completions");
const btnRunCycle   = document.getElementById("btn-run-cycle");
const btnStopCycle  = document.getElementById("btn-stop-cycle");
const logEl         = document.getElementById("log");
const matchListEl   = document.getElementById("match-list");
const cycleProgress = document.getElementById("cycle-progress");
const receiverBadge = document.getElementById("receiver-badge");
const autopanBadge  = document.getElementById("autopan-badge");

let allMatches = [];
let recentDoneSet = new Set();  // performance_ids done in last 6h

// ── Helpers ──────────────────────────────────────────────────────────

function updateStats(stats) {
  if (!stats) return;
  document.getElementById("stat-tiles").textContent  = stats.tiles  ?? 0;
  document.getElementById("stat-seats").textContent  = stats.seats  ?? 0;
  document.getElementById("stat-errors").textContent = stats.errors ?? 0;
}

function updateLog(lines) {
  if (!lines?.length) return;
  logEl.textContent = lines.join("\n");
  logEl.scrollTop = logEl.scrollHeight;
}

function setAutopanBadge(running) {
  autopanBadge.textContent = running ? "running" : "idle";
  autopanBadge.className   = "badge " + (running ? "green" : "gray");
}

function setManualButtons(running) {
  btnAutopan.disabled = running;
  btnStop.disabled    = !running;
}

function setCycleButtons(running) {
  btnRunCycle.disabled  = running || !allMatches.length;
  btnStopCycle.disabled = !running;
  btnLoadMatches.disabled = running;
}

function getSelectedMatches() {
  return allMatches
    .filter((_, i) => {
      const cb = document.getElementById(`match-cb-${i}`);
      return cb && cb.checked;
    })
    .map(m => ({
      ...m,
      force: recentDoneSet.has(m.performance_id),
    }));
}

// ── Match list rendering ─────────────────────────────────────────────

function renderMatches(matches, currentPerfId = null, recentDone = {}) {
  if (!matches.length) {
    matchListEl.innerHTML = '<div style="padding:6px;color:#888">No matches found.</div>';
    return;
  }

  matchListEl.innerHTML = "";
  matches.forEach((m, i) => {
    const isCurrent = m.performance_id === currentPerfId;
    const isDone = !!recentDone[m.performance_id];
    const div = document.createElement("div");
    div.className = "match-item" + (isCurrent ? " current" : "") + (isDone ? " done" : "");

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = `match-cb-${i}`;
    // Uncheck if done in last 6h or sold out; user can re-check manually
    cb.checked = !isDone && m.availability !== "sold_out";

    const code = document.createElement("span");
    code.className = "match-code";
    code.textContent = m.match_code || m.performance_id;

    const loc = document.createElement("span");
    loc.className = "match-loc";
    loc.style.flex = "1";
    loc.textContent = m.location || "";

    const avail = document.createElement("span");
    avail.className = "match-avail";
    if (isDone) {
      avail.textContent = "✓";
      avail.style.color = "#888";
      avail.title = "Done in last 6h";
    } else if (m.availability === "sold_out") {
      avail.textContent = "✗";
      avail.style.color = "#dc3545";
      cb.disabled = true;
    } else if (m.availability === "limited") {
      avail.textContent = "!";
      avail.className += " avail-limited";
    }

    const fromBtn = document.createElement("button");
    fromBtn.textContent = "↓";
    fromBtn.title = "Select from here onwards";
    fromBtn.style.cssText = "flex:unset;padding:1px 4px;font-size:10px;line-height:1.2;border:1px solid #aaa;border-radius:2px;cursor:pointer;background:#f8f9fa;";
    fromBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      allMatches.forEach((_, j) => {
        const jcb = document.getElementById(`match-cb-${j}`);
        if (!jcb) return;
        jcb.checked = j >= i && !jcb.disabled;
      });
    });

    div.appendChild(cb);
    div.appendChild(code);
    div.appendChild(loc);
    div.appendChild(avail);
    div.appendChild(fromBtn);
    div.addEventListener("click", (e) => {
      if (e.target !== cb && e.target !== fromBtn && !cb.disabled) cb.checked = !cb.checked;
    });
    matchListEl.appendChild(div);
  });
}

function updateCycleHighlight(currentCode) {
  document.querySelectorAll(".match-item").forEach((el, i) => {
    const m = allMatches[i];
    el.classList.toggle("current", m?.match_code === currentCode);
  });
}

// ── Load matches ─────────────────────────────────────────────────────

async function loadMatches() {
  matchListEl.innerHTML = '<div style="padding:6px;color:#888">Loading...</div>';
  try {
    const r = await fetch(`${RECEIVER_BASE}/matches`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    allMatches = await r.json();

    // Fetch completions to auto-uncheck recently-done matches
    let recentDone = {};
    try {
      const cr = await fetch(`${RECEIVER_BASE}/completions`);
      if (cr.ok) {
        const completions = await cr.json();
        const cutoff = Date.now() / 1000 - 6 * 3600;
        for (const [pid, ts] of Object.entries(completions)) {
          if (ts > cutoff) recentDone[pid] = true;
        }
      }
    } catch {}

    recentDoneSet = new Set(Object.keys(recentDone));
    renderMatches(allMatches, null, recentDone);
    btnRunCycle.disabled = false;
    const doneCount = Object.keys(recentDone).length;
    const suffix = doneCount ? ` (${doneCount} done in last 6h — unchecked)` : "";
    cycleProgress.textContent = `${allMatches.length} matches loaded${suffix}. Select and click Run.`;
  } catch (e) {
    matchListEl.innerHTML = `<div style="padding:6px;color:#c00">Error: ${e.message}<br>Is receive_tiles.py running?</div>`;
    cycleProgress.textContent = "Load failed.";
  }
}

// ── Message listener ─────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "LOG_UPDATE") {
    updateLog(msg.log);
    updateStats(msg.stats);
  }

  if (msg.type === "RECEIVER_STATUS") {
    receiverBadge.textContent = msg.online ? "online" : "offline";
    receiverBadge.className   = "badge " + (msg.online ? "green" : "red");
    updateStats(msg.stats);
  }

  if (msg.type === "AUTOPAN_STATUS") {
    setAutopanBadge(msg.status === "running");
    if (!msg.cycleActive) setManualButtons(msg.status === "running");
    updateStats(msg.stats);
  }

  if (msg.type === "CYCLE_STATE") {
    const running = msg.active;
    setCycleButtons(running);
    setAutopanBadge(running);
    setManualButtons(false);
    updateStats(msg.stats);
    if (running) {
      cycleProgress.textContent = `Match ${msg.index + 1}/${msg.total}: ${msg.current || ""}`;
      updateCycleHighlight(msg.current);
    } else {
      cycleProgress.textContent = msg.total
        ? `Idle (${msg.total} matches loaded)`
        : "Select matches and click Run.";
    }
  }

  if (msg.type === "CYCLE_DONE") {
    setCycleButtons(false);
    setAutopanBadge(false);
    cycleProgress.textContent = "Cycle complete!";
    updateStats(msg.stats);
  }

  if (msg.type === "STATE") {
    updateLog(msg.log);
    updateStats(msg.stats);
    receiverBadge.textContent = msg.receiverOnline ? "online" : "offline";
    receiverBadge.className   = "badge " + (msg.receiverOnline ? "green" : "red");
    const cycleRunning = msg.cycleActive;
    setCycleButtons(cycleRunning);
    setManualButtons(false);
    setAutopanBadge(cycleRunning);
    if (cycleRunning && msg.cycleCurrent) {
      cycleProgress.textContent = `Match ${msg.cycleIndex + 1}/${msg.cycleTotal}: ${msg.cycleCurrent}`;
    }
  }
});

// ── Button handlers ───────────────────────────────────────────────────

btnAutopan.addEventListener("click", () => {
  setManualButtons(true);
  setAutopanBadge(true);
  chrome.runtime.sendMessage({ type: "START_AUTOPAN" });
});

btnStop.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "STOP_AUTOPAN" });
  setManualButtons(false);
  setAutopanBadge(false);
});

btnReset.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "RESET_STATS" });
  updateStats({ tiles: 0, seats: 0, errors: 0 });
  logEl.textContent = "Stats reset.";
});

btnLoadMatches.addEventListener("click", loadMatches);

btnClearCompletions.addEventListener("click", async () => {
  try {
    const r = await fetch(`${RECEIVER_BASE}/completions/clear`, { method: "POST" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    cycleProgress.textContent = "Completions cleared.";
    if (allMatches.length) renderMatches(allMatches, null, {});
  } catch (e) {
    cycleProgress.textContent = `Clear failed: ${e.message}`;
  }
});

btnSelectAll.addEventListener("click", () => {
  allMatches.forEach((_, i) => {
    const cb = document.getElementById(`match-cb-${i}`);
    if (cb && !cb.disabled) cb.checked = true;
  });
});

btnSelectNone.addEventListener("click", () => {
  allMatches.forEach((_, i) => {
    const cb = document.getElementById(`match-cb-${i}`);
    if (cb) cb.checked = false;
  });
});

btnSelectAvail.addEventListener("click", () => {
  allMatches.forEach((m, i) => {
    const cb = document.getElementById(`match-cb-${i}`);
    if (cb) cb.checked = (m.availability === "available" || m.availability === "limited");
  });
});

btnRunCycle.addEventListener("click", () => {
  const selected = getSelectedMatches();
  if (!selected.length) {
    cycleProgress.textContent = "No matches selected.";
    return;
  }
  setCycleButtons(true);
  cycleProgress.textContent = `Starting cycle: ${selected.length} matches...`;
  chrome.runtime.sendMessage({ type: "START_CYCLE", matches: selected });
});

btnStopCycle.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "STOP_CYCLE" });
  setCycleButtons(false);
  setAutopanBadge(false);
  cycleProgress.textContent = "Stopped.";
});

// Init
chrome.runtime.sendMessage({ type: "GET_STATE" });
