/**
 * content.js — ISOLATED world
 *
 * Relays tile data from injected.js (MAIN world) to background.js, and
 * forwards scan start/stop commands from background.js down to injected.js.
 *
 * No mouse simulation — the page is never touched. injected.js replays
 * the seatmap tile API directly using captured session headers/cookies.
 */

// ── Tile relay ──────────────────────────────────────────────────────

window.addEventListener("__fifaTileCapture", (event) => {
  const { url, data } = event.detail;
  chrome.runtime.sendMessage({
    type: "TILE_DATA",
    url,
    features: data.features || [],
  });
});

window.addEventListener("__fifaTileCaptcha", (event) => {
  chrome.runtime.sendMessage({
    type: "LOG",
    msg: `Captcha on bbox=${event.detail.bbox}`,
  });
});

window.addEventListener("__fifaScanDone", (event) => {
  const reason = event.detail?.reason || "done";
  chrome.runtime.sendMessage({ type: "LOG", msg: `Scan finished: ${reason}` });
  chrome.runtime.sendMessage({ type: "AUTOPAN_STATUS", status: "done" });
});

// ── Scan trigger ────────────────────────────────────────────────────

function extractPerformanceId() {
  const m = location.pathname.match(/\/seat\/performance\/(\d+)/);
  return m ? m[1] : null;
}

function extractProductIdFromPage() {
  // Best-effort: try to read it from a script or data attribute. injected.js
  // also captures productId passively from the first real seatmap request,
  // so this is just a fast-path for when the page already embeds it.
  const scripts = document.querySelectorAll("script");
  for (const s of scripts) {
    const txt = s.textContent || "";
    const m = txt.match(/productId["':\s]+(\d{10,})/);
    if (m) return m[1];
  }
  return null;
}

function startScan() {
  const performanceId = extractPerformanceId();
  if (!performanceId) {
    chrome.runtime.sendMessage({ type: "LOG", msg: "Not on a seatmap page — no performanceId." });
    chrome.runtime.sendMessage({ type: "AUTOPAN_STATUS", status: "done" });
    return;
  }
  const productId = extractProductIdFromPage();
  chrome.runtime.sendMessage({
    type: "LOG",
    msg: `Starting scan perf=${performanceId}${productId ? ` prod=${productId}` : " (prod from capture)"}`,
  });
  chrome.runtime.sendMessage({ type: "AUTOPAN_STATUS", status: "running" });
  window.dispatchEvent(
    new CustomEvent("__fifaStartScan", { detail: { productId, performanceId } })
  );
}

function stopScan() {
  window.dispatchEvent(new CustomEvent("__fifaStopScan"));
}

async function waitForSeatmapRequest(timeoutMs = 20000) {
  // Wait until the page has made at least one real seatmap fetch/XHR so
  // that injected.js has had a chance to capture headers + productId.
  // We can't read injected.js state from here, so we just wait for the
  // first __fifaTileCapture event to fire — or timeout.
  return new Promise((resolve) => {
    let done = false;
    const onCapture = () => {
      if (done) return;
      done = true;
      window.removeEventListener("__fifaTileCapture", onCapture);
      resolve(true);
    };
    window.addEventListener("__fifaTileCapture", onCapture);
    setTimeout(() => {
      if (done) return;
      done = true;
      window.removeEventListener("__fifaTileCapture", onCapture);
      resolve(false);
    }, timeoutMs);
  });
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "START_AUTOPAN") {
    // Wait for the page to make its own first seatmap request — that's
    // our signal that headers + productId have been captured by injected.js
    // and the Datadome cookie is warm. Then start the bbox replay.
    waitForSeatmapRequest().then((captured) => {
      if (!captured) {
        chrome.runtime.sendMessage({
          type: "LOG",
          msg: "No organic seatmap request observed — scanning anyway with best-effort.",
        });
      }
      startScan();
    });
  }

  if (msg.type === "STOP_AUTOPAN") {
    stopScan();
  }

  if (msg.type === "PING") {
    chrome.runtime.sendMessage({
      type: "PONG",
      onSeatmap: location.href.includes("seat/performance"),
    });
  }
});
