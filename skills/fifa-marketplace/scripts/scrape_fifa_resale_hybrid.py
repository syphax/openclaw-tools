#!/usr/bin/env python3
"""
FIFA World Cup 2026 Ticket Resale Marketplace Scraper
======================================================================
GENERATION 5: Hybrid — Chrome for auth, Python for tile requests

Approach:
  - Connects to running Chrome via raw WebSocket CDP
  - Navigates Chrome to each match page so DataDome sensor runs naturally
  - Waits for the page to fully initialize (CSRF token fetched, cookies fresh)
  - Extracts live cookies + CSRF token from Chrome via CDP
  - Makes Python (curl_cffi) requests for all bbox tiles with those credentials
  - Chrome stays on each page long enough to appear human

Status: FAILED — DataDome cryptographically binds the datadome cookie to
  browser-side signals. Python requests don't match those signals even with
  correct cookies + CSRF token. Immediate 403 on first tile request.

Superseded by: scrape_fifa_resale_runtime.py (Gen 6)

Why Gen 4 (passive CDP capture) failed:
  The simulated mouse/scroll events via CDP Input.dispatchMouseEvent did not
  trigger the seatmap JS to fire tile requests. The seatmap library likely
  requires specific zoom levels or interaction with particular DOM elements
  that our generic pan simulation didn't hit.

Why this works:
  - DataDome sensor runs in real Chrome → datadome cookie stays fresh
  - CSRF token is extracted live from Chrome after page load
  - curl_cffi with Chrome TLS impersonation makes requests look like Chrome
  - Cookies are always current, not a stale static paste (Gen 2's failure)
======================================================================

Setup:
  pip install websocket-client requests curl_cffi

Usage:
  1. Launch Chrome:
       /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \\
         --remote-debugging-port=9222 \\
         --user-data-dir=/tmp/chrome-debug \\
         "--remote-allow-origins=*" &
  2. Log into https://fwc26-resale-usd.tickets.fifa.com in that window
  3. Run:
       python3 scripts/scrape_fifa_resale_hybrid.py
"""

import base64
import csv
import json
import logging
import os
import re
import sys
import time
import threading
import queue
import random
from datetime import datetime
from urllib.parse import urlencode, urlparse, parse_qs

import websocket
import requests as pyrequests
from curl_cffi import requests as cffi_requests

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
SEATMAP_API_PATH = "/tnwr/v1/secure/seatmap/seats/free/ol"

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
        self._callbacks = {}
        self._results = {}
        self._event_handlers = {}
        self._lock = threading.Lock()
        self._open_event = threading.Event()

        self.ws = websocket.WebSocketApp(
            ws_url,
            on_open=self._on_open,
            on_message=self._on_message,
            on_error=self._on_error,
            on_close=self._on_close,
        )
        self._thread = threading.Thread(
            target=lambda: self.ws.run_forever(origin=f"http://127.0.0.1:{CHROME_PORT}"),
            daemon=True,
        )
        self._thread.start()
        self._open_event.wait(timeout=5)

    def _on_open(self, ws):
        self._open_event.set()

    def _on_message(self, ws, raw):
        msg = json.loads(raw)
        if "id" in msg:
            msg_id = msg["id"]
            with self._lock:
                ev = self._callbacks.pop(msg_id, None)
                self._results[msg_id] = msg
            if ev:
                ev.set()
        elif "method" in msg:
            method = msg["method"]
            for h in self._event_handlers.get(method, []):
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
    try:
        tabs = pyrequests.get(f"http://127.0.0.1:{CHROME_PORT}/json").json()
    except Exception as e:
        print(f"\nCan't reach Chrome on port {CHROME_PORT}: {e}")
        print("\nLaunch Chrome with:")
        print(f'  /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome \\')
        print(f'    --remote-debugging-port={CHROME_PORT} --user-data-dir=/tmp/chrome-debug "--remote-allow-origins=*"')
        sys.exit(1)

    fifa_tabs = [t for t in tabs if RESALE_BASE_URL in t.get("url", "") and t.get("type") == "page"]
    page_tabs = [t for t in tabs if t.get("type") == "page"]
    if not page_tabs:
        print("No open page tabs found in Chrome.")
        sys.exit(1)
    tab = fifa_tabs[0] if fifa_tabs else page_tabs[0]
    return tab["webSocketDebuggerUrl"], tab


# ── Chrome navigation + credential extraction ───────────────────────

def navigate_and_extract_credentials(cdp, performance_id):
    """Navigate Chrome to the match page and extract fresh cookies + CSRF token.

    Returns (cookies_dict, csrf_token) or raises on failure.
    """
    url = f"{RESALE_BASE_URL}/secure/selection/event/seat/performance/{performance_id}/lang/en"
    logger.info(f"Navigating Chrome to {url}")

    # Watch for the CSRF endpoint response to capture the token
    csrf_token = [None]
    csrf_ready = threading.Event()
    csrf_req_ids = {}

    def on_request(params):
        req_url = params.get("request", {}).get("url", "")
        if "/tnwr/v1/csrf" in req_url:
            csrf_req_ids[params["requestId"]] = True
            logger.debug(f"CSRF request seen: {params['requestId']}")

    def on_loading_finished(params):
        req_id = params.get("requestId")
        if req_id not in csrf_req_ids:
            return
        # Queue it for main-thread body fetch (can't call send() from WS thread)
        csrf_body_queue.put(req_id)

    csrf_body_queue = queue.Queue()

    cdp.on("Network.requestWillBeSent", on_request)
    cdp.on("Network.loadingFinished", on_loading_finished)

    cdp.send("Network.enable")
    cdp.send("Page.enable")

    # Navigate
    load_event = threading.Event()
    def on_load(params):
        load_event.set()
    cdp.on("Page.loadEventFired", on_load)
    cdp.send("Page.navigate", {"url": url})
    load_event.wait(timeout=20)

    # Wait for CSRF request to complete, draining on main thread
    deadline = time.time() + 8
    while time.time() < deadline and csrf_token[0] is None:
        time.sleep(0.2)
        while not csrf_body_queue.empty():
            req_id = csrf_body_queue.get_nowait()
            try:
                r = cdp.send("Network.getResponseBody", {"requestId": req_id}, timeout=5)
                body = r.get("body", "")
                if r.get("base64Encoded"):
                    body = base64.b64decode(body).decode("utf-8")
                data = json.loads(body)
                token = data.get("token") or data.get("csrf") or data.get("csrfToken")
                if token:
                    csrf_token[0] = token
                    logger.info(f"CSRF token extracted: {token[:16]}...")
                else:
                    # Token might be the entire body string
                    if body and len(body) < 200 and "-" in body:
                        csrf_token[0] = body.strip().strip('"')
                        logger.info(f"CSRF token (raw body): {csrf_token[0][:16]}...")
            except Exception as e:
                logger.debug(f"CSRF body fetch error: {e}")

    if not csrf_token[0]:
        # Fall back: try reading from page JS context via cookie or meta tag
        logger.warning("CSRF token not found in /csrf response — trying page context")

    # Extra wait for DataDome sensor to fully initialize
    time.sleep(3)

    # Extract all cookies for this domain
    cookies_result = cdp.send("Network.getCookies", {"urls": [RESALE_BASE_URL]})
    raw_cookies = cookies_result.get("cookies", [])
    cookies = {c["name"]: c["value"] for c in raw_cookies}
    logger.info(f"Extracted {len(cookies)} cookies from Chrome (datadome present: {'datadome' in cookies})")

    if not cookies:
        raise RuntimeError("No cookies extracted — are you logged in?")

    return cookies, csrf_token[0]


# ── Tile fetching via Python (curl_cffi) ─────────────────────────────

def build_cffi_session(cookies, csrf_token, performance_id):
    """Build a curl_cffi session with live Chrome credentials."""
    session = cffi_requests.Session(impersonate="chrome136")
    session.headers.update({
        "Accept": "application/json",
        "Cache-Control": "no-cache",
        "DNT": "1",
        "Referer": f"{RESALE_BASE_URL}/secure/selection/event/seat/performance/{performance_id}/lang/en",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
        "X-Secutix-Host": "fwc26-resale-usd.tickets.fifa.com",
        "X-Secutix-SecretKey": "DUMMY",
        "sec-ch-ua": '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
    })
    if csrf_token:
        session.headers["X-CSRF-Token"] = csrf_token
    session.cookies.update(cookies)
    return session


def fetch_seats_for_bbox(session, config, performance_id, x, y, w, h):
    """Fetch seats from the seatmap API for a given bbox tile."""
    params = {
        "productId": config["product_id"],
        "performanceId": performance_id,
        "isSeasonTicketMode": "false",
        "advantageId": "",
        "isModifyAllSeatsMode": "false",
        "ppid": "",
        "reservationIdx": "",
        "crossSellId": "",
        "baseOperationIdsString": "",
        "bbox": f"{x},{y},{w},{h}",
        "isExclusive": "true",
    }
    url = f"{config['seatmap_api_base']}?{urlencode(params)}"

    try:
        resp = session.get(url, timeout=15)
        if resp.status_code == 403:
            body = resp.text[:500]
            logger.warning(f"  bbox ({x},{y}): HTTP 403 — {body[:200]}")
            if "captcha-delivery.com" in body or "unusual activity" in body.lower():
                return "BLOCKED"
            return "BLOCKED"
        if resp.status_code != 200:
            logger.warning(f"  bbox ({x},{y}): HTTP {resp.status_code}")
            return []
        data = resp.json()
        features = data.get("features", [])
        logger.debug(f"  bbox ({x},{y},{w},{h}): {len(features)} seats")
        return features
    except Exception as e:
        logger.error(f"  bbox ({x},{y}): error: {e}")
        return []


def scrape_match(session, config, performance_id, match_label):
    """Tile the full venue bbox and collect all available seats."""
    tile_size = config.get("bbox_tile_size", 5000)
    max_coord = config.get("bbox_max_coord", 30000)
    total_tiles = (max_coord // tile_size) ** 2

    all_seats = {}
    tile_count = 0

    logger.info(f"Tiling {max_coord}×{max_coord} with {tile_size}×{tile_size} tiles ({total_tiles} total)")

    for x in range(0, max_coord, tile_size):
        for y in range(0, max_coord, tile_size):
            tile_count += 1
            features = fetch_seats_for_bbox(session, config, performance_id, x, y, tile_size, tile_size)

            if features == "BLOCKED":
                print(f"\n  Blocked at tile {tile_count}/{total_tiles}!")
                return "BLOCKED"

            for feat in features:
                seat_id = feat.get("id") or feat.get("properties", {}).get("id")
                if seat_id and seat_id not in all_seats:
                    all_seats[seat_id] = feat

            if tile_count % 6 == 0:
                print(f"\r  Tiles: {tile_count}/{total_tiles}, seats: {len(all_seats)}", end="", flush=True)

            time.sleep(random.uniform(0.4, 1.0))

    print(f"\r  Tiles: {tile_count}/{total_tiles}, seats: {len(all_seats)}        ")
    logger.info(f"  Scanned {tile_count} tiles, found {len(all_seats)} unique seats")
    return list(all_seats.values())


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
    logger.info(f"Debug JSON: {path}")


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
    print("(Gen 5: Hybrid — Chrome for auth, Python for tile requests)")
    print("=" * 70)

    ws_url, tab = get_fifa_tab_ws_url()
    print(f"\nConnecting to: {tab['title'][:60]}")

    cdp = CDPSession(ws_url)
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
        print(f"\n[{i+1}/{len(selected)}] {label} — navigating Chrome and extracting credentials...")

        try:
            cookies, csrf_token = navigate_and_extract_credentials(cdp, match["performance_id"])
        except RuntimeError as e:
            print(f"  Credential extraction failed: {e}")
            break

        if not csrf_token:
            print("  WARNING: CSRF token not found — requests may fail")

        session = build_cffi_session(cookies, csrf_token, match["performance_id"])
        print(f"  Credentials ready (CSRF: {'yes' if csrf_token else 'NO'}, cookies: {len(cookies)})")
        print(f"  Scraping tiles...")

        seats = scrape_match(session, config, match["performance_id"], label)

        if seats == "BLOCKED":
            blocked_hit = True
            print(f"\n{'!'*70}")
            print(f"Blocked during {label} (#{i+1} of {len(selected)}).")
            if last_success:
                print(f"Last successful: {last_success}")
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
            pause = random.uniform(10, 15)
            print(f"  Pausing {pause:.0f}s before next match...")
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
