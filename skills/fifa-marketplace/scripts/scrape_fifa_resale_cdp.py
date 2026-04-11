#!/usr/bin/env python3
"""
FIFA World Cup 2026 Ticket Resale Marketplace Scraper
======================================================================
GENERATION 4: Raw WebSocket CDP — passive capture + simulated navigation

Approach:
  - Connects to your running Chrome via raw WebSocket CDP (no Playwright)
  - Navigates Chrome to each match page via Page.navigate
  - Passively intercepts seatmap tile responses via Network.getResponseBody
  - Simulates realistic mouse pan/zoom events to cover the full venue map
  - Zero synthetic Python HTTP requests — everything goes through real Chrome

Status: FAILED — CDP Input.dispatchMouseEvent did not trigger seatmap tile
  requests. The seatmap JS ignores synthetic mouse events at the CDP level
  and requires real interaction. Zero seats captured.

Superseded by: scrape_fifa_resale_hybrid.py (Gen 5)

Why this works where previous generations failed:
  Gen 1 (scrape_fifa_resale.py): Playwright opened its own browser — detected
    because Playwright sets navigator.webdriver=true.
  Gen 2 (scrape_fifa_resale_cookies.py): Static cookies expired quickly because
    DataDome's JS sensor continuously refreshes the datadome cookie in a real
    browser; our static copy went stale. Also missing X-CSRF-Token header.
  Gen 3 (scrape_fifa_resale_playwright.py): Playwright fetch() injection into
    attached Chrome — CDP connection itself flagged by DataDome sensor.
  Gen 4 (this script): No JS injection, no synthetic requests. We navigate real
    Chrome and record what it naturally fetches. DataDome sees only real Chrome.
======================================================================

Setup (one-time):
  pip install websocket-client requests

Usage:
  1. Launch Chrome with remote debugging:
       /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \\
         --remote-debugging-port=9222 \\
         --user-data-dir=/tmp/chrome-debug \\
         "--remote-allow-origins=*" &
  2. Log into https://fwc26-resale-usd.tickets.fifa.com in that window
  3. Run this script:
       python3 scripts/scrape_fifa_resale_cdp.py
"""

import csv
import json
import logging
import os
import re
import sys
import time
import threading
import queue
from datetime import datetime
from urllib.parse import urlencode, urlparse, parse_qs

import websocket
import requests as pyrequests

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SKILL_DIR = os.path.dirname(SCRIPT_DIR)
CFG_DIR = os.path.join(SKILL_DIR, "cfg")
DATA_DIR = os.path.join(SKILL_DIR, "data")
LOG_DIR = os.path.join(SKILL_DIR, "logs")
DEBUG_DIR = os.path.join(SKILL_DIR, "debug")

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(LOG_DIR, exist_ok=True)
os.makedirs(DEBUG_DIR, exist_ok=True)

LOG_PATH = os.path.join(LOG_DIR, "fifa-marketplace.log")
MATCHES_CACHE_PATH = os.path.join(CFG_DIR, "matches.json")
DEBUG_MODE = os.environ.get("DEBUG", "").lower() in ("1", "true", "yes")

CHROME_PORT = int(os.environ.get("CHROME_PORT", "9222"))
RESALE_BASE_URL = "https://fwc26-resale-usd.tickets.fifa.com"
SEATMAP_PATH = "/tnwr/v1/secure/seatmap/seats/free/ol"

logging.basicConfig(
    level=logging.DEBUG if DEBUG_MODE else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_PATH),
        logging.StreamHandler(sys.stderr),
    ],
)
logger = logging.getLogger("fifa-marketplace")


# ── Config ──────────────────────────────────────────────────────────

def load_config():
    cfg_path = os.path.join(CFG_DIR, "fifa-marketplace-config.json")
    with open(cfg_path) as f:
        return json.load(f)


# ── CDP session ──────────────────────────────────────────────────────

class CDPSession:
    """Raw WebSocket CDP session for a single Chrome tab."""

    def __init__(self, ws_url):
        self._msg_id = 1
        self._callbacks = {}          # id → Event (for awaiting responses)
        self._results = {}            # id → response payload
        self._event_handlers = {}     # method → list of callables
        self._lock = threading.Lock()
        self._event_queue = queue.Queue()

        self.ws = websocket.WebSocketApp(
            ws_url,
            on_open=self._on_open,
            on_message=self._on_message,
            on_error=self._on_error,
            on_close=self._on_close,
        )
        self._thread = threading.Thread(target=lambda: self.ws.run_forever(
            origin=f"http://127.0.0.1:{CHROME_PORT}"
        ), daemon=True)
        self._thread.start()

        # Wait for connection
        self._open_event = threading.Event()
        self._open_event.wait(timeout=5)

    def _on_open(self, ws):
        self._open_event.set()

    def _on_message(self, ws, raw):
        msg = json.loads(raw)
        if "id" in msg:
            # Response to a command
            msg_id = msg["id"]
            with self._lock:
                ev = self._callbacks.pop(msg_id, None)
                self._results[msg_id] = msg
            if ev:
                ev.set()
        elif "method" in msg:
            # Event notification — dispatch to handlers
            method = msg["method"]
            handlers = self._event_handlers.get(method, [])
            for h in handlers:
                try:
                    h(msg.get("params", {}))
                except Exception as e:
                    logger.debug(f"Event handler error ({method}): {e}")

    def _on_error(self, ws, error):
        logger.error(f"CDP WebSocket error: {error}")

    def _on_close(self, ws, *args):
        logger.debug("CDP WebSocket closed")

    def on(self, method, handler):
        self._event_handlers.setdefault(method, []).append(handler)

    def send(self, method, params=None, timeout=10):
        """Send a CDP command and wait for its response."""
        with self._lock:
            msg_id = self._msg_id
            self._msg_id += 1
            ev = threading.Event()
            self._callbacks[msg_id] = ev

        self.ws.send(json.dumps({"id": msg_id, "method": method, "params": params or {}}))
        ev.wait(timeout=timeout)

        with self._lock:
            result = self._results.pop(msg_id, {})
        return result.get("result", {})

    def close(self):
        self.ws.close()


def get_fifa_tab_ws_url():
    """Find the FIFA seatmap tab's WebSocket debugger URL."""
    try:
        tabs = pyrequests.get(f"http://127.0.0.1:{CHROME_PORT}/json").json()
    except Exception as e:
        print(f"\nCan't reach Chrome on port {CHROME_PORT}: {e}")
        print("\nLaunch Chrome with:")
        print(f'  /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome \\')
        print(f'    --remote-debugging-port={CHROME_PORT} \\')
        print(f'    --user-data-dir=/tmp/chrome-debug \\')
        print(f'    "--remote-allow-origins=*"')
        sys.exit(1)

    # Prefer a tab already on the resale site; fall back to any page tab
    fifa_tabs = [t for t in tabs if RESALE_BASE_URL in t.get("url", "") and t.get("type") == "page"]
    page_tabs = [t for t in tabs if t.get("type") == "page"]

    if not page_tabs:
        print("No open page tabs found in Chrome.")
        sys.exit(1)

    tab = fifa_tabs[0] if fifa_tabs else page_tabs[0]
    return tab["webSocketDebuggerUrl"], tab


# ── Match list ───────────────────────────────────────────────────────

def load_cached_matches():
    if os.path.exists(MATCHES_CACHE_PATH):
        with open(MATCHES_CACHE_PATH) as f:
            matches = json.load(f)
        logger.info(f"Loaded {len(matches)} cached matches")
        return matches
    return None


def save_matches_cache(matches):
    with open(MATCHES_CACHE_PATH, "w") as f:
        json.dump(matches, f, indent=2)
    logger.info(f"Saved {len(matches)} matches")


def parse_matches_from_html(html):
    matches = []
    li_pattern = re.compile(r'<li\b([^>]*class="[^"]*performance[^"]*"[^>]*)>', re.DOTALL)
    for li_match in li_pattern.finditer(html):
        attrs = li_match.group(1)
        perf_match = re.search(r'perfId=(\d+)', attrs)
        if not perf_match:
            chunk = html[li_match.start():li_match.start() + 2000]
            perf_match = re.search(r'perfId=(\d+)', chunk)
        if not perf_match:
            continue
        perf_id = perf_match.group(1)

        match_code = ""
        aria_match = re.search(r'aria-labelledby="([^"]*)"', attrs)
        if not aria_match:
            chunk = html[li_match.start():li_match.start() + 2000]
            aria_match = re.search(r'aria-labelledby="([^"]*)"', chunk)
        if aria_match:
            code_match = re.search(r'event_code_(\w+)', aria_match.group(1))
            if code_match:
                raw_code = code_match.group(1)
                num_match = re.match(r'^(M)(\d+)$', raw_code)
                match_code = f"M{int(num_match.group(2)):03d}" if num_match else raw_code

        location = ""
        venue_id_match = re.search(r'venue_(\w+)', aria_match.group(1) if aria_match else "")
        if venue_id_match:
            venue_el_id = f"venue_{venue_id_match.group(1)}"
            venue_pattern = re.compile(
                rf'id="{re.escape(venue_el_id)}"[^>]*>.*?<span\s+class="site"\s+title="([^"]*)"',
                re.DOTALL,
            )
            venue_hit = venue_pattern.search(html)
            if venue_hit:
                location = venue_hit.group(1)

        availability = "available"
        if "sold_out" in attrs:
            availability = "sold_out"
        elif "limited" in attrs:
            availability = "limited"

        matches.append({
            "performance_id": perf_id,
            "match_code": match_code,
            "description": match_code,
            "availability": availability,
            "location": location,
        })

    logger.info(f"Parsed {len(matches)} matches from HTML")
    return matches


EVENT_HTML_PATH = os.path.join(CFG_DIR, "event-page.html")


def prompt_for_html():
    print("\n" + "=" * 70)
    print("MATCH LIST SETUP (one-time)")
    print("=" * 70)
    print("\nIn your browser on the FIFA resale event list page:")
    print("  1. Open DevTools Console (F12)")
    print("  2. Run: copy(document.documentElement.outerHTML)")
    print(f"  3. Paste into: {EVENT_HTML_PATH}")
    print()
    input("Press ENTER once saved... ")
    if not os.path.exists(EVENT_HTML_PATH):
        print(f"File not found: {EVENT_HTML_PATH}")
        return []
    with open(EVENT_HTML_PATH) as f:
        html = f.read()
    print(f"Read {len(html)} bytes")
    return parse_matches_from_html(html)


# ── Seatmap scraping via CDP ─────────────────────────────────────────

def navigate_to_match(cdp, performance_id):
    """Navigate Chrome to the match seatmap page and wait for it to load."""
    url = f"{RESALE_BASE_URL}/secure/selection/event/seat/performance/{performance_id}/lang/en"
    logger.info(f"Navigating to {url}")

    load_event = threading.Event()
    def on_load(params):
        load_event.set()
    cdp.on("Page.loadEventFired", on_load)

    cdp.send("Page.enable")
    cdp.send("Page.navigate", {"url": url})

    # Wait for page load (up to 20s)
    loaded = load_event.wait(timeout=20)
    if not loaded:
        logger.warning("Page load timeout — continuing anyway")

    # Extra pause for JS/DataDome sensor to initialize
    time.sleep(3)


def simulate_map_pan(cdp, viewport_width=1280, viewport_height=800, drain_fn=None):
    """Simulate realistic mouse pan movements to cover the full seatmap.

    The seatmap loads tiles based on what's in the viewport. We pan
    systematically in a grid pattern to trigger all tile loads.
    Pan movements use mousedown/mousemove/mouseup sequences.
    """
    cx, cy = viewport_width // 2, viewport_height // 2

    def mouse_move(x, y):
        cdp.send("Input.dispatchMouseEvent", {
            "type": "mouseMoved", "x": x, "y": y, "buttons": 1
        })

    def drag(from_x, from_y, to_x, to_y, steps=12):
        """Simulate a mouse drag with realistic intermediate steps."""
        cdp.send("Input.dispatchMouseEvent", {
            "type": "mousePressed", "x": from_x, "y": from_y,
            "button": "left", "clickCount": 1
        })
        time.sleep(0.05)
        for i in range(1, steps + 1):
            ix = int(from_x + (to_x - from_x) * i / steps)
            iy = int(from_y + (to_y - from_y) * i / steps)
            mouse_move(ix, iy)
            time.sleep(0.02)
        cdp.send("Input.dispatchMouseEvent", {
            "type": "mouseReleased", "x": to_x, "y": to_y,
            "button": "left", "clickCount": 1
        })
        time.sleep(0.1)

    def scroll(x, y, delta):
        """Simulate scroll wheel (for zoom)."""
        cdp.send("Input.dispatchMouseEvent", {
            "type": "mouseWheel", "x": x, "y": y,
            "deltaX": 0, "deltaY": delta
        })
        time.sleep(0.1)

    # First zoom out fully to see as much of the map as possible
    logger.info("  Zooming out to reveal full map...")
    for _ in range(8):
        scroll(cx, cy, 150)  # positive deltaY = scroll down = zoom out
        time.sleep(0.15)
    time.sleep(1.5)

    # Pan in a grid pattern: 4 cols × 3 rows = 12 positions
    # Each drag moves ~40% of viewport width/height
    pan_x = int(viewport_width * 0.4)
    pan_y = int(viewport_height * 0.4)
    cols, rows = 4, 3

    logger.info(f"  Panning {cols}×{rows} grid to cover full venue...")

    # Start from top-left: drag map to bottom-right first
    drag(cx, cy, cx + pan_x * (cols // 2), cy + pan_y * (rows // 2))
    time.sleep(0.8)

    for row in range(rows):
        for col in range(cols):
            time.sleep(0.5)  # pause at each position for tiles to load
            if drain_fn:
                drain_fn()
            if col < cols - 1:
                # Pan left (drag map rightward)
                drag(cx, cy, cx + pan_x, cy)
        if row < rows - 1:
            # Pan up (drag map downward) and reset X
            drag(cx, cy, cx - pan_x * (cols - 1), cy + pan_y)

    # Return to center
    drag(cx, cy, cx + pan_x * (cols // 2 - 1), cy - pan_y * (rows // 2))
    time.sleep(1)
    if drain_fn:
        drain_fn()


def scrape_match_via_cdp(cdp, config, performance_id, match_label):
    """Navigate Chrome to a match and capture all seatmap tile responses.

    Returns list of seat features, or "BLOCKED" if access was denied.

    Network event sequence:
      requestWillBeSent  → headers sent, record requestId + url
      responseReceived   → response headers arrived, record status
      loadingFinished    → body fully buffered, safe to call getResponseBody

    IMPORTANT: getResponseBody must NOT be called from within the WebSocket
    message thread (i.e. from event handlers). Doing so deadlocks because the
    send() call blocks waiting for a response that can never arrive while the
    thread is busy. Instead we queue completed request IDs and drain the queue
    from the main thread.
    """
    import base64

    captured_seats = {}
    blocked = threading.Event()
    # requestId → {url, status}
    pending = {}
    # Queue of requestIds ready to have their body fetched (filled by WS thread,
    # drained by main thread)
    ready_queue = queue.Queue()

    def on_request(params):
        url = params.get("request", {}).get("url", "")
        if SEATMAP_PATH in url:
            pending[params["requestId"]] = {"url": url, "status": None}
            logger.debug(f"  → seatmap request seen: {params['requestId']}")

    def on_response(params):
        req_id = params.get("requestId")
        if req_id not in pending:
            return
        status = params.get("response", {}).get("status", 0)
        pending[req_id]["status"] = status
        logger.debug(f"  → seatmap response: HTTP {status} ({req_id})")

    def on_loading_finished(params):
        req_id = params.get("requestId")
        if req_id in pending:
            # Don't call cdp.send() here — we're in the WS thread, it would deadlock
            ready_queue.put(req_id)

    def drain_queue():
        """Called from the main thread to fetch response bodies without deadlocking."""
        while not ready_queue.empty():
            req_id = ready_queue.get_nowait()
            info = pending.pop(req_id, None)
            if not info:
                continue
            url = info["url"]
            status = info.get("status")

            try:
                r = cdp.send("Network.getResponseBody", {"requestId": req_id}, timeout=5)
            except Exception as e:
                logger.debug(f"  getResponseBody failed for {req_id}: {e}")
                continue

            body = r.get("body", "")
            if r.get("base64Encoded"):
                body = base64.b64decode(body).decode("utf-8")

            if status == 403:
                if "captcha-delivery.com" in body or "unusual activity" in body.lower():
                    logger.error("Blocked by DataDome/captcha")
                    blocked.set()
                else:
                    logger.warning(f"HTTP 403 (non-captcha) on {url[:80]}")
                continue

            if status != 200:
                logger.warning(f"HTTP {status} on seatmap tile, skipping")
                continue

            try:
                data = json.loads(body)
            except Exception as e:
                logger.warning(f"  JSON parse error: {e} — body: {body[:200]}")
                continue

            features = data.get("features", [])
            new_count = 0
            for feat in features:
                seat_id = feat.get("id") or feat.get("properties", {}).get("id")
                if seat_id and seat_id not in captured_seats:
                    captured_seats[seat_id] = feat
                    new_count += 1

            qs = parse_qs(urlparse(url).query)
            bbox = qs.get("bbox", ["?"])[0]
            print(f"  tile bbox={bbox}: {len(features)} seats (+{new_count} new, {len(captured_seats)} total)", flush=True)

    # Sanity check: count ALL network events and log FIFA host requests
    event_counter = [0]
    def on_any_event(params):
        event_counter[0] += 1
        url = params.get("request", {}).get("url", "")
        if "tickets.fifa.com" in url:
            print(f"  [FIFA req] {url[:120]}", flush=True)
    cdp.on("Network.requestWillBeSent", on_any_event)
    cdp.on("Network.loadingFinished", on_any_event)

    cdp.on("Network.requestWillBeSent", on_request)
    cdp.on("Network.responseReceived", on_response)
    cdp.on("Network.loadingFinished", on_loading_finished)

    # Disable cache so Chrome makes fresh requests — cached responses don't
    # trigger Network events and would silently yield zero seats
    cdp.send("Network.setCacheDisabled", {"cacheDisabled": True})
    cdp.send("Network.clearBrowserCache")

    # Navigate to the match page
    navigate_to_match(cdp, performance_id)

    if blocked.is_set():
        return "BLOCKED"

    # Wait for initial tiles after page load, draining the queue as they arrive
    logger.info(f"  Waiting for initial tiles to load...")
    for _ in range(20):  # up to 4s in 0.2s increments
        time.sleep(0.2)
        drain_queue()
        if blocked.is_set():
            return "BLOCKED"

    logger.info(f"  Initial tiles: {len(captured_seats)} seats (total CDP events seen: {event_counter[0]}). Starting pan...")

    # Simulate panning; drain queue periodically during pan pauses
    simulate_map_pan(cdp, drain_fn=drain_queue)

    # Final drain for any in-flight requests
    for _ in range(15):
        time.sleep(0.2)
        drain_queue()

    if blocked.is_set():
        return "BLOCKED"

    # Re-enable cache when done
    cdp.send("Network.setCacheDisabled", {"cacheDisabled": False})
    logger.info(f"  Finished. Total unique seats: {len(captured_seats)} (total CDP events: {event_counter[0]})")
    return list(captured_seats.values())


# ── CSV output ───────────────────────────────────────────────────────

CSV_FIELDNAMES = ["Pull Date", "Pull Time", "Match", "Category", "Section", "Area", "Row", "Seat", "Raw Amount", "Price", "Price w/ Fees", "Location"]
COMBINED_CSV_PATH = os.path.join(DATA_DIR, "fifa-resale-tickets.csv")


def seats_to_rows(seats, match_label, location=""):
    now = datetime.now()
    pull_date = now.strftime("%Y-%m-%d")
    pull_time = now.strftime("%H:%M")
    rows = []
    for feat in seats:
        props = feat.get("properties", {})
        block_name = props.get("block", {}).get("name", {}).get("en", "")
        area_name = props.get("area", {}).get("name", {}).get("en", "")
        category = props.get("seatCategory", "")
        row = props.get("row", "")
        seat_num = props.get("number", "")
        raw_amount = props.get("amount", 0)
        price = raw_amount / 1000.0
        price_with_fees = price * 1.15
        rows.append({
            "Pull Date": pull_date,
            "Pull Time": pull_time,
            "Match": match_label,
            "Category": category,
            "Section": block_name,
            "Area": area_name,
            "Row": row,
            "Seat": seat_num,
            "Raw Amount": raw_amount,
            "Price": f"{price:.2f}",
            "Price w/ Fees": f"{price_with_fees:.2f}",
            "Location": location,
        })
    return rows


def make_csv_path():
    ts = datetime.now().strftime("%Y-%m-%d-%H-%M")
    return os.path.join(DATA_DIR, f"fifa-resale-tickets-{ts}.csv")


def append_to_csv(rows, csv_path):
    file_exists = os.path.exists(csv_path) and os.path.getsize(csv_path) > 0
    with open(csv_path, "a", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDNAMES)
        if not file_exists:
            writer.writeheader()
        writer.writerows(rows)


def save_to_csv(rows, timestamped_csv_path):
    append_to_csv(rows, timestamped_csv_path)
    append_to_csv(rows, COMBINED_CSV_PATH)
    logger.info(f"Saved {len(rows)} rows to CSV")


def save_debug_json(seats, match_label):
    safe_label = re.sub(r"[^a-zA-Z0-9_-]", "_", match_label)
    ts = datetime.now().strftime("%Y%m%d_%H%M")
    path = os.path.join(DEBUG_DIR, f"{safe_label}_{ts}.json")
    with open(path, "w") as f:
        json.dump(seats, f, indent=2)
    logger.info(f"Debug JSON saved to {path}")


# ── Match selection ──────────────────────────────────────────────────

def prompt_match_selection(matches):
    available = [m for m in matches if m["availability"] != "sold_out"]
    if not available:
        print("\nNo matches with available tickets found.")
        return []

    print(f"\n{'='*70}")
    print(f"Found {len(available)} matches with tickets available:\n")
    for i, m in enumerate(available, 1):
        status = f"[{m['availability'].upper()}]" if m["availability"] == "limited" else ""
        desc = m.get("description", m["match_code"]) or m["performance_id"]
        loc = m.get("location", "")
        loc_str = f" — {loc}" if loc else ""
        print(f"  {i:3d}. {m['match_code']:6s} {desc[:80]}{loc_str} {status}")

    print(f"\n{'='*70}")
    print("Enter match numbers (comma-separated, ranges like 5-10, -10, 20-),")
    print("'all', or 'q' to quit:")
    choice = input("> ").strip()

    if choice.lower() == "q":
        return []
    if choice.lower() == "all":
        return available

    indices = set()
    n = len(available)
    for part in choice.split(","):
        part = part.strip()
        range_match = re.match(r'^(\d+)?-(\d+)?$', part)
        if range_match:
            start = int(range_match.group(1)) if range_match.group(1) else 1
            end = int(range_match.group(2)) if range_match.group(2) else n
            for idx in range(start, end + 1):
                if 1 <= idx <= n:
                    indices.add(idx)
        elif part.isdigit():
            idx = int(part)
            if 1 <= idx <= n:
                indices.add(idx)
            else:
                print(f"  Skipping invalid index: {part}")

    return [available[i - 1] for i in sorted(indices)]


# ── Main ─────────────────────────────────────────────────────────────

def main():
    config = load_config()

    print("=" * 70)
    print("FIFA World Cup 2026 - Ticket Resale Marketplace Scraper")
    print("(Gen 4: CDP passive capture + simulated navigation)")
    print("=" * 70)

    ws_url, tab = get_fifa_tab_ws_url()
    print(f"\nConnecting to: {tab['title'][:60]}")

    cdp = CDPSession(ws_url)
    cdp.send("Network.enable")
    cdp.send("Page.enable")
    print("CDP session established.\n")

    # Load or scrape match list
    matches = load_cached_matches()
    if matches:
        print(f"Using cached match list ({len(matches)} matches).")
        print("Delete cfg/matches.json to re-scrape.\n")
    else:
        matches = prompt_for_html()
        if matches:
            save_matches_cache(matches)
            print(f"\nParsed and cached {len(matches)} matches.")
        else:
            print("\nNo matches found.")
            sys.exit(1)

    selected = prompt_match_selection(matches)
    if not selected:
        print("No matches selected. Exiting.")
        return

    csv_path = make_csv_path()
    print(f"\nWill scrape {len(selected)} match(es).")
    print(f"Output: {csv_path}\n")
    print("NOTE: Chrome will navigate automatically. Keep the window visible.")
    print("      Do not click or interact with Chrome during the run.\n")

    def fmt_duration(seconds):
        h = int(seconds) // 3600
        m = (int(seconds) % 3600) // 60
        s = int(seconds) % 60
        return f"{h:02d}:{m:02d}:{s:02d}"

    total_seats = 0
    last_success = None
    blocked_hit = False
    matches_processed = 0
    run_start = time.time()

    for i, match in enumerate(selected):
        label = match["match_code"] if match["match_code"] else match["performance_id"]
        print(f"\n[{i+1}/{len(selected)}] Scraping {label}...")
        seats = scrape_match_via_cdp(cdp, config, match["performance_id"], label)

        if seats == "BLOCKED":
            blocked_hit = True
            print(f"\n{'!'*70}")
            print(f"Blocked during match {label} (#{i+1} of {len(selected)}).")
            if last_success:
                print(f"Last successful match: {last_success}")
            print(f"Total seats saved: {total_seats}")
            print(f"{'!'*70}")
            break

        if seats:
            if DEBUG_MODE:
                save_debug_json(seats, label)
            rows = seats_to_rows(seats, label, location=match.get("location", ""))
            save_to_csv(rows, csv_path)
            total_seats += len(rows)
            last_success = label
            print(f"  {label}: {len(rows)} seats saved")
        else:
            print(f"  {label}: no seats found")
            last_success = label

        matches_processed += 1

        if i < len(selected) - 1:
            pause = 10
            print(f"  Pausing {pause}s before next match...")
            time.sleep(pause)

    cdp.close()

    elapsed = time.time() - run_start
    avg = elapsed / matches_processed if matches_processed > 0 else 0
    print(f"\n{matches_processed} matches processed in {fmt_duration(elapsed)} ({fmt_duration(avg)} avg)")

    if not blocked_hit:
        print(f"Done! Total: {total_seats} seat records saved.")
    else:
        print(f"Partial run. Total: {total_seats} seat records saved.")
    print(f"Timestamped: {csv_path}")
    print(f"Combined:    {COMBINED_CSV_PATH}")


if __name__ == "__main__":
    main()
