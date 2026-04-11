#!/usr/bin/env python3
"""
FIFA World Cup 2026 Ticket Resale Marketplace Scraper
======================================================================
GENERATION 6: Raw CDP Runtime.evaluate — fetch() inside live browser

Approach:
  - Connects to running Chrome via raw WebSocket CDP (no Playwright)
  - Navigates Chrome to each match page so DataDome sensor runs naturally
  - Executes all tile fetch() calls via Runtime.evaluate inside the live page
  - Python never makes any HTTP requests — all traffic goes through real Chrome
  - navigator.webdriver is false (user-launched Chrome, not Playwright)

Why Gen 3 (Playwright fetch injection) was detected:
  Playwright sets navigator.webdriver=true in any browser it controls,
  which DataDome checks explicitly.

Why this is different:
  We connect to user-launched Chrome via raw CDP. navigator.webdriver
  stays false. DataDome sees a normal Chrome session.

Why Gen 5 (hybrid curl_cffi) was blocked:
  DataDome cryptographically binds the datadome cookie to browser-side
  signals collected by its JS sensor. Requests from Python don't match
  those signals even with correct cookies + CSRF token.
======================================================================

Setup:
  pip install websocket-client requests

Usage:
  1. Launch Chrome:
       /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \\
         --remote-debugging-port=9222 \\
         --user-data-dir=/tmp/chrome-debug \\
         "--remote-allow-origins=*" &
  2. Log into https://fwc26-resale-usd.tickets.fifa.com in that window
  3. Run:
       python3 scripts/scrape_fifa_resale_runtime.py
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
import random
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

logging.basicConfig(
    level=logging.DEBUG if DEBUG_MODE else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_PATH),
        logging.StreamHandler(sys.stderr),
    ],
)
logger = logging.getLogger("fifa-marketplace")


# ── Config ───────────────────────────────────────────────────────────

def load_config():
    cfg_path = os.path.join(CFG_DIR, "fifa-marketplace-config.json")
    with open(cfg_path) as f:
        return json.load(f)


# ── CDP session ───────────────────────────────────────────────────────

class CDPSession:
    """Raw WebSocket CDP session."""

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
            for h in self._event_handlers.get(msg["method"], []):
                try:
                    h(msg.get("params", {}))
                except Exception as e:
                    logger.debug(f"Event handler error: {e}")

    def _on_error(self, ws, error):
        logger.error(f"CDP WebSocket error: {error}")

    def _on_close(self, ws, *args):
        logger.debug("CDP WebSocket closed")

    def on(self, method, handler):
        self._event_handlers.setdefault(method, []).append(handler)

    def send(self, method, params=None, timeout=15):
        with self._lock:
            msg_id = self._msg_id
            self._msg_id += 1
            ev = threading.Event()
            self._callbacks[msg_id] = ev
        self.ws.send(json.dumps({"id": msg_id, "method": method, "params": params or {}}))
        ev.wait(timeout=timeout)
        with self._lock:
            result = self._results.pop(msg_id, {})
        if "error" in result:
            logger.debug(f"CDP error for {method}: {result['error']}")
        return result.get("result", {})

    def close(self):
        self.ws.close()


def get_fifa_tab():
    try:
        tabs = pyrequests.get(f"http://127.0.0.1:{CHROME_PORT}/json").json()
    except Exception as e:
        print(f"\nCan't reach Chrome on port {CHROME_PORT}: {e}")
        print(f'\n  /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome \\')
        print(f'    --remote-debugging-port={CHROME_PORT} --user-data-dir=/tmp/chrome-debug "--remote-allow-origins=*"')
        sys.exit(1)

    fifa_tabs = [t for t in tabs if RESALE_BASE_URL in t.get("url", "") and t.get("type") == "page"]
    page_tabs = [t for t in tabs if t.get("type") == "page"]
    if not page_tabs:
        print("No open page tabs found.")
        sys.exit(1)
    return (fifa_tabs[0] if fifa_tabs else page_tabs[0])


# ── Navigation ────────────────────────────────────────────────────────

def navigate_to_match(cdp, performance_id):
    """Navigate Chrome to the match seatmap page and wait for full load."""
    url = f"{RESALE_BASE_URL}/secure/selection/event/seat/performance/{performance_id}/lang/en"
    logger.info(f"Navigating to {url}")

    load_event = threading.Event()
    cdp.on("Page.loadEventFired", lambda _: load_event.set())
    cdp.send("Page.enable")
    cdp.send("Page.navigate", {"url": url})
    loaded = load_event.wait(timeout=20)
    if not loaded:
        logger.warning("Page load timeout — continuing")

    # Let DataDome sensor and page JS fully initialize
    time.sleep(4)
    logger.info("Page ready")


# ── Tile fetching via Runtime.evaluate ───────────────────────────────

def fetch_tile_in_browser(cdp, url):
    """Execute a fetch() for one seatmap tile inside the live Chrome page.

    Returns parsed JSON data dict, "BLOCKED" string, or None on error.
    The fetch runs inside the page context so DataDome sees real Chrome.
    """
    # Escape the URL for embedding in JS string literal
    escaped_url = url.replace("\\", "\\\\").replace('"', '\\"')

    js = f"""
    (async () => {{
        try {{
            const resp = await fetch("{escaped_url}", {{
                method: "GET",
                credentials: "include"
            }});
            const status = resp.status;
            if (status !== 200) {{
                const body = await resp.text();
                return JSON.stringify({{ __error: status, __body: body.substring(0, 300) }});
            }}
            const data = await resp.json();
            return JSON.stringify({{ __ok: true, __data: data }});
        }} catch(e) {{
            return JSON.stringify({{ __error: 0, __body: e.toString() }});
        }}
    }})()
    """

    result = cdp.send("Runtime.evaluate", {
        "expression": js,
        "awaitPromise": True,
        "returnByValue": True,
        "timeout": 15000,
    })

    value = result.get("result", {}).get("value")
    if not value:
        logger.debug(f"Runtime.evaluate returned no value for {url[:60]}")
        return None

    try:
        parsed = json.loads(value)
    except Exception as e:
        logger.debug(f"JSON parse error on evaluate result: {e} — {value[:200]}")
        return None

    if "__error" in parsed:
        status = parsed["__error"]
        body = parsed.get("__body", "")
        logger.warning(f"  fetch() returned HTTP {status}: {body[:150]}")
        if status == 403 and ("captcha" in body.lower() or "unusual activity" in body.lower()):
            return "BLOCKED"
        if status == 403:
            return "BLOCKED"
        return None

    return parsed.get("__data")


def scrape_match(cdp, config, performance_id, match_label):
    """Tile the full venue and collect all available seats via in-browser fetch().

    Returns list of seat features, or "BLOCKED".
    """
    tile_size = config.get("bbox_tile_size", 5000)
    max_coord = config.get("bbox_max_coord", 30000)
    total_tiles = (max_coord // tile_size) ** 2

    all_seats = {}
    tile_count = 0

    logger.info(f"Tiling {max_coord}×{max_coord} at {tile_size}×{tile_size} ({total_tiles} tiles)")

    for x in range(0, max_coord, tile_size):
        for y in range(0, max_coord, tile_size):
            tile_count += 1

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
                "bbox": f"{x},{y},{tile_size},{tile_size}",
                "isExclusive": "true",
            }
            url = f"{config['seatmap_api_base']}?{urlencode(params)}"

            data = fetch_tile_in_browser(cdp, url)

            if data == "BLOCKED":
                print(f"\n  Blocked at tile {tile_count}/{total_tiles}!")
                return "BLOCKED"

            if data:
                features = data.get("features", [])
                new_count = 0
                for feat in features:
                    seat_id = feat.get("id") or feat.get("properties", {}).get("id")
                    if seat_id and seat_id not in all_seats:
                        all_seats[seat_id] = feat
                        new_count += 1
                if features:
                    logger.debug(f"  bbox ({x},{y}): {len(features)} seats (+{new_count} new)")

            if tile_count % 6 == 0:
                print(f"\r  Tiles: {tile_count}/{total_tiles}, seats: {len(all_seats)}", end="", flush=True)

            time.sleep(random.uniform(0.3, 0.8))

    print(f"\r  Tiles: {tile_count}/{total_tiles}, seats: {len(all_seats)}        ")
    logger.info(f"  Scanned {tile_count} tiles, found {len(all_seats)} unique seats")
    return list(all_seats.values())


# ── Match list ────────────────────────────────────────────────────────

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


# ── CSV output ────────────────────────────────────────────────────────

CSV_FIELDNAMES = ["Pull Date", "Pull Time", "Match", "Category", "Section", "Area", "Row", "Seat", "Raw Amount", "Price", "Price w/ Fees", "Location"]
COMBINED_CSV_PATH = os.path.join(DATA_DIR, "fifa-resale-tickets.csv")


def seats_to_rows(seats, match_label, location=""):
    now = datetime.now()
    pull_date, pull_time = now.strftime("%Y-%m-%d"), now.strftime("%H:%M")
    rows = []
    for feat in seats:
        props = feat.get("properties", {})
        raw_amount = props.get("amount", 0)
        price = raw_amount / 1000.0
        rows.append({
            "Pull Date": pull_date,
            "Pull Time": pull_time,
            "Match": match_label,
            "Category": props.get("seatCategory", ""),
            "Section": props.get("block", {}).get("name", {}).get("en", ""),
            "Area": props.get("area", {}).get("name", {}).get("en", ""),
            "Row": props.get("row", ""),
            "Seat": props.get("number", ""),
            "Raw Amount": raw_amount,
            "Price": f"{price:.2f}",
            "Price w/ Fees": f"{price * 1.15:.2f}",
            "Location": location,
        })
    return rows


def make_csv_path():
    return os.path.join(DATA_DIR, f"fifa-resale-tickets-{datetime.now().strftime('%Y-%m-%d-%H-%M')}.csv")


def append_to_csv(rows, csv_path):
    file_exists = os.path.exists(csv_path) and os.path.getsize(csv_path) > 0
    with open(csv_path, "a", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDNAMES)
        if not file_exists:
            writer.writeheader()
        writer.writerows(rows)


def save_to_csv(rows, timestamped_path):
    append_to_csv(rows, timestamped_path)
    append_to_csv(rows, COMBINED_CSV_PATH)
    logger.info(f"Saved {len(rows)} rows")


def save_debug_json(seats, match_label):
    safe_label = re.sub(r"[^a-zA-Z0-9_-]", "_", match_label)
    ts = datetime.now().strftime("%Y%m%d_%H%M")
    path = os.path.join(DEBUG_DIR, f"{safe_label}_{ts}.json")
    with open(path, "w") as f:
        json.dump(seats, f, indent=2)
    logger.info(f"Debug JSON: {path}")


# ── Match selection ───────────────────────────────────────────────────

def prompt_match_selection(matches):
    available = [m for m in matches if m["availability"] != "sold_out"]
    if not available:
        print("\nNo matches with available tickets.")
        return []

    print(f"\n{'='*70}")
    print(f"Found {len(available)} matches with tickets available:\n")
    for i, m in enumerate(available, 1):
        status = f"[{m['availability'].upper()}]" if m["availability"] == "limited" else ""
        loc_str = f" — {m['location']}" if m.get("location") else ""
        print(f"  {i:3d}. {m['match_code']:6s}{loc_str} {status}")

    print(f"\n{'='*70}")
    print("Enter match numbers (comma-separated, ranges like 5-10, -10, 20-), 'all', or 'q':")
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
            indices.update(i for i in range(start, end + 1) if 1 <= i <= n)
        elif part.isdigit():
            idx = int(part)
            if 1 <= idx <= n:
                indices.add(idx)

    return [available[i - 1] for i in sorted(indices)]


# ── Main ──────────────────────────────────────────────────────────────

def main():
    config = load_config()

    print("=" * 70)
    print("FIFA World Cup 2026 - Ticket Resale Marketplace Scraper")
    print("(Gen 6: Runtime.evaluate — fetch() inside live Chrome page)")
    print("=" * 70)

    tab = get_fifa_tab()
    print(f"\nConnecting to: {tab['title'][:60]}")
    cdp = CDPSession(tab["webSocketDebuggerUrl"])
    cdp.send("Runtime.enable")
    cdp.send("Page.enable")
    print("CDP session established.\n")

    # Verify navigator.webdriver is false
    wd_check = cdp.send("Runtime.evaluate", {
        "expression": "navigator.webdriver",
        "returnByValue": True,
    })
    wd_value = wd_check.get("result", {}).get("value")
    if wd_value:
        print(f"WARNING: navigator.webdriver={wd_value} — DataDome may detect automation")
    else:
        print(f"navigator.webdriver={wd_value} (good — not detectable as automated)")

    # Load or scrape match list
    matches = load_cached_matches()
    if matches:
        print(f"\nUsing cached match list ({len(matches)} matches).")
    else:
        matches = prompt_for_html()
        if matches:
            save_matches_cache(matches)
        else:
            print("\nNo matches found.")
            sys.exit(1)

    selected = prompt_match_selection(matches)
    if not selected:
        print("No matches selected.")
        return

    csv_path = make_csv_path()
    print(f"\nWill scrape {len(selected)} match(es).")
    print(f"Output: {csv_path}\n")

    def fmt(s):
        return f"{int(s)//3600:02d}:{(int(s)%3600)//60:02d}:{int(s)%60:02d}"

    total_seats = 0
    last_success = None
    blocked_hit = False
    processed = 0
    run_start = time.time()

    for i, match in enumerate(selected):
        label = match["match_code"] or match["performance_id"]
        print(f"\n[{i+1}/{len(selected)}] {label} — navigating Chrome...")

        navigate_to_match(cdp, match["performance_id"])
        print(f"  Scraping tiles via in-browser fetch()...")

        seats = scrape_match(cdp, config, match["performance_id"], label)

        if seats == "BLOCKED":
            blocked_hit = True
            print(f"\n{'!'*70}")
            print(f"Blocked during {label}. Last success: {last_success or 'none'}")
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

        processed += 1

        if i < len(selected) - 1:
            pause = random.uniform(10, 15)
            print(f"  Pausing {pause:.0f}s...")
            time.sleep(pause)

    cdp.close()

    elapsed = time.time() - run_start
    print(f"\n{processed} matches in {fmt(elapsed)} ({fmt(elapsed/processed) if processed else '--'} avg)")
    print(f"{'Done!' if not blocked_hit else 'Partial run.'} Total: {total_seats} seats saved.")
    print(f"Timestamped: {csv_path}")
    print(f"Combined:    {COMBINED_CSV_PATH}")


if __name__ == "__main__":
    main()
