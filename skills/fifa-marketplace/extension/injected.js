/**
 * injected.js — MAIN world
 *
 * Two jobs:
 *   1. Passively observe real seatmap fetch/XHR traffic to capture headers
 *      + productId from the first legitimate request the page makes.
 *   2. On demand, replay GET /tnwr/v1/secure/seatmap/seats/free/ol with a
 *      bbox grid covering the full map, reusing captured headers/cookies.
 *
 * Results are dispatched as CustomEvents for the ISOLATED-world content.js
 * to relay to background.js.
 */

(function () {
  const TILE_PATH = "/tnwr/v1/secure/seatmap/seats/free/ol";
  const originalFetch = window.fetch;

  let capturedHeaders = null;
  let capturedProductId = null;

  function captureFromUrl(url) {
    if (capturedProductId) return;
    try {
      const pid = new URL(url, location.origin).searchParams.get("productId");
      if (pid) capturedProductId = pid;
    } catch {}
  }

  // ── fetch wrapper: capture headers + relay organic tiles ────────────
  window.fetch = async function (...args) {
    const url = typeof args[0] === "string" ? args[0] : (args[0] && args[0].url) || "";
    if (url.includes(TILE_PATH)) {
      captureFromUrl(url);
      if (!capturedHeaders) {
        const init = args[1] || {};
        if (init.headers) {
          capturedHeaders = init.headers instanceof Headers
            ? Object.fromEntries(init.headers.entries())
            : { ...init.headers };
          console.log("[fifa-tile] captured fetch headers:", Object.keys(capturedHeaders).join(","));
        }
      }
    }
    const response = await originalFetch.apply(this, args);
    if (url.includes(TILE_PATH)) {
      response.clone().json().then((data) => {
        if (data && typeof data.url === "string" && data.url.includes("captcha-delivery")) {
          window.dispatchEvent(new CustomEvent("__fifaTileCaptcha", { detail: { url, bbox: new URL(url, location.origin).searchParams.get("bbox") } }));
          return;
        }
        window.dispatchEvent(new CustomEvent("__fifaTileCapture", { detail: { url, data } }));
      }).catch(() => {});
    }
    return response;
  };

  // ── XHR wrapper: header + productId capture ─────────────────────────
  const OrigOpen = XMLHttpRequest.prototype.open;
  const OrigSend = XMLHttpRequest.prototype.send;
  const OrigSetHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__fifaUrl = url;
    this.__fifaHeaders = {};
    return OrigOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    if (this.__fifaHeaders) this.__fifaHeaders[name] = value;
    return OrigSetHeader.call(this, name, value);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    const url = this.__fifaUrl || "";
    if (typeof url === "string" && url.includes(TILE_PATH)) {
      captureFromUrl(url);
      if (!capturedHeaders && this.__fifaHeaders && Object.keys(this.__fifaHeaders).length > 0) {
        capturedHeaders = { ...this.__fifaHeaders };
        console.log("[fifa-tile] captured XHR headers:", Object.keys(capturedHeaders).join(","));
      }
      this.addEventListener("load", () => {
        try {
          const data = JSON.parse(this.responseText);
          if (data && typeof data.url === "string" && data.url.includes("captcha-delivery")) {
            window.dispatchEvent(new CustomEvent("__fifaTileCaptcha", { detail: { url, bbox: new URL(url, location.origin).searchParams.get("bbox") } }));
            return;
          }
          window.dispatchEvent(new CustomEvent("__fifaTileCapture", { detail: { url, data } }));
        } catch {}
      });
    }
    return OrigSend.apply(this, args);
  };

  // ── Scan: direct bbox-grid fetch ────────────────────────────────────

  let scanAbort = false;

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  async function runScan({ productId, performanceId }) {
    scanAbort = false;

    const pid = productId || capturedProductId;
    if (!pid) {
      console.warn("[fifa-tile] no productId — cannot scan");
      window.dispatchEvent(new CustomEvent("__fifaScanDone", { detail: { reason: "no_product_id" } }));
      return;
    }
    if (!performanceId) {
      console.warn("[fifa-tile] no performanceId — cannot scan");
      window.dispatchEvent(new CustomEvent("__fifaScanDone", { detail: { reason: "no_perf_id" } }));
      return;
    }

    const headers = capturedHeaders
      ? { ...capturedHeaders }
      : { Accept: "application/json" };
    if (!headers["X-Secutix-Host"]) headers["X-Secutix-Host"] = location.hostname;

    // 4×4 grid of 10k tiles over the 0-40k seatmap coordinate space.
    const TILE = 10000;
    const MAX = 40000;
    const tiles = [];
    for (let x = 0; x < MAX; x += TILE) {
      for (let y = 0; y < MAX; y += TILE) {
        tiles.push({ x, y });
      }
    }

    // Cautious cadence: 500-900 ms between tiles.
    const DELAY_MIN = 500;
    const DELAY_MAX = 900;

    let consecutiveBlocks = 0;
    const MAX_CONSECUTIVE_BLOCKS = 3;
    const blocked = [];

    console.log(`[fifa-tile] scan start pid=${pid} perf=${performanceId} tiles=${tiles.length}`);

    async function scanTile(tile) {
      const bbox = `${tile.x},${tile.y},${TILE},${TILE}`;
      const url =
        `${TILE_PATH}?productId=${pid}&performanceId=${performanceId}` +
        `&isSeasonTicketMode=false&advantageId=&isModifyAllSeatsMode=false` +
        `&ppid=&reservationIdx=&crossSellId=&baseOperationIdsString=` +
        `&bbox=${bbox}&isExclusive=true`;

      try {
        const resp = await originalFetch(url, { credentials: "include", headers });
        const ct = resp.headers.get("content-type") || "";

        if (resp.ok && ct.includes("application/json")) {
          const data = await resp.json();
          if (data && typeof data.url === "string" && data.url.includes("captcha-delivery")) {
            consecutiveBlocks++;
            console.warn(`[fifa-tile] CAPTCHA bbox=${bbox} (${consecutiveBlocks} consecutive)`);
            window.dispatchEvent(new CustomEvent("__fifaTileCaptcha", { detail: { url, bbox } }));
            return false;
          }
          consecutiveBlocks = 0;
          console.log(`[fifa-tile] bbox=${bbox} features=${data.features?.length ?? 0}`);
          window.dispatchEvent(new CustomEvent("__fifaTileCapture", { detail: { url, data } }));
          return true;
        }

        if (resp.status === 403 || resp.status === 429) {
          consecutiveBlocks++;
          console.warn(`[fifa-tile] bbox=${bbox} blocked ${resp.status} (${consecutiveBlocks} consecutive)`);
          return false;
        }

        console.warn(`[fifa-tile] bbox=${bbox} unexpected ${resp.status} ${ct}`);
        return false;
      } catch (err) {
        console.warn(`[fifa-tile] bbox=${bbox} fetch error:`, err.message);
        return false;
      }
    }

    // First pass
    for (const tile of tiles) {
      if (scanAbort) break;
      if (consecutiveBlocks >= MAX_CONSECUTIVE_BLOCKS) {
        console.warn("[fifa-tile] scan aborted — rate limited");
        window.dispatchEvent(new CustomEvent("__fifaScanDone", { detail: { reason: "rate_limited" } }));
        return;
      }
      const ok = await scanTile(tile);
      if (!ok) blocked.push(tile);
      await sleep(DELAY_MIN + Math.random() * (DELAY_MAX - DELAY_MIN));
    }

    // Retry pass for blocked tiles
    if (blocked.length > 0 && !scanAbort) {
      console.log(`[fifa-tile] retrying ${blocked.length} blocked tiles in 3s...`);
      await sleep(3000);
      consecutiveBlocks = 0;
      for (const tile of blocked) {
        if (scanAbort) break;
        if (consecutiveBlocks >= MAX_CONSECUTIVE_BLOCKS) break;
        await scanTile(tile);
        await sleep(DELAY_MIN + Math.random() * (DELAY_MAX - DELAY_MIN));
      }
    }

    console.log("[fifa-tile] scan done");
    window.dispatchEvent(new CustomEvent("__fifaScanDone", { detail: { reason: scanAbort ? "aborted" : "done" } }));
  }

  window.addEventListener("__fifaStartScan", (e) => {
    runScan(e.detail || {});
  });

  window.addEventListener("__fifaStopScan", () => {
    scanAbort = true;
  });
})();
