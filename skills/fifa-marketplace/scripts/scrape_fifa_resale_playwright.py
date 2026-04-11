#!/usr/bin/env python3
"""
FIFA World Cup 2026 Ticket Resale Marketplace Scraper
======================================================================
GENERATION 3: Playwright — attached Chrome, JS fetch() injection

Limitation: Even when attached to a real Chrome instance, Playwright's
CDP connection is detected by DataDome's JS sensor, triggering immediate
"unusual activity" blocks.

Superseded by: scrape_fifa_resale_cdp.py (Gen 4)
======================================================================

(Playwright / attached Chrome mode)
==========================================================================================
APPROACH: Attach to your running Chrome instance via remote debugging and fire
fetch() calls from within the real browser context.

Why this works where the cookie script doesn't:
  DataDome's JS sensor runs inside the browser and continuously refreshes the
  `datadome` cookie. A static cookie copy (used by scrape_fifa_resale_cookies.py)
  goes stale after a few minutes/requests. By making requests through the real
  browser, the sensor keeps running naturally and the session never expires.

Replaces: scrape_fifa_resale_cookies.py (static cookies + curl_cffi)
==========================================================================================

Setup (one-time):
  pip install playwright
  playwright install chromium   # only needed if using the fallback launch mode

Usage:
  1. Launch Chrome with remote debugging enabled:
       /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome
         --remote-debugging-port=9222 --profile-directory="Default"
  2. In that Chrome, log into https://fwc26-resale-usd.tickets.fifa.com
  3. Run this script:
       python3 scripts/scrape_fifa_resale_playwright.py

The script connects to the running Chrome on port 9222 and fires all API
requests via page.evaluate() (JavaScript fetch) inside that browser context.
"""

import csv
import json
import logging
import os
import re
import sys
import random
import time
from datetime import datetime
from urllib.parse import urlencode

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

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

CHROME_DEBUGGING_PORT = int(os.environ.get("CHROME_PORT", "9222"))
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


# ── Config ──────────────────────────────────────────────────────────

def load_config():
    cfg_path = os.path.join(CFG_DIR, "fifa-marketplace-config.json")
    with open(cfg_path) as f:
        return json.load(f)


# ── Browser connection ───────────────────────────────────────────────

def connect_to_chrome(playwright):
    """Connect to the already-running Chrome instance via CDP."""
    try:
        browser = playwright.chromium.connect_over_cdp(
            f"http://127.0.0.1:{CHROME_DEBUGGING_PORT}"
        )
        logger.info(f"Connected to Chrome on port {CHROME_DEBUGGING_PORT}")
        return browser
    except Exception as e:
        print(f"\nFailed to connect to Chrome on port {CHROME_DEBUGGING_PORT}: {e}")
        print()
        print("Make sure Chrome is running with remote debugging enabled.")
        print("Quit Chrome completely first, then run:")
        print()
        print(f'  /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port={CHROME_DEBUGGING_PORT} --profile-directory="Default"')
        print()
        print("Then log into https://fwc26-resale-usd.tickets.fifa.com in that window.")
        sys.exit(1)


def get_or_create_page(browser):
    """Return a page already on the FIFA resale site, or navigate one there."""
    resale_pages = [
        p for ctx in browser.contexts
        for p in ctx.pages
        if RESALE_BASE_URL in p.url
    ]
    if resale_pages:
        page = resale_pages[0]
        logger.info(f"Using existing page: {page.url}")
        return page

    # No page on the site yet — use the first available page and navigate
    all_pages = [p for ctx in browser.contexts for p in ctx.pages]
    page = all_pages[0] if all_pages else browser.contexts[0].new_page()
    print(f"\nNo open tab found on {RESALE_BASE_URL}.")
    print("Navigating there now — please log in if prompted, then press ENTER here.")
    page.goto(RESALE_BASE_URL, wait_until="domcontentloaded")
    input("> ")
    return page


def verify_session(page, config):
    """Check that the page can reach the seatmap API (i.e. session is live)."""
    test_url = config["seatmap_api_base"] + "?productId=test&performanceId=test&bbox=0,0,1,1&isExclusive=true&isSeasonTicketMode=false&advantageId=&isModifyAllSeatsMode=false&ppid=&reservationIdx=&crossSellId=&baseOperationIdsString="
    result = page.evaluate(f"""
        async () => {{
            try {{
                const r = await fetch({json.dumps(test_url)}, {{credentials: 'include'}});
                return {{ status: r.status }};
            }} catch(e) {{
                return {{ status: 0, error: e.toString() }};
            }}
        }}
    """)
    status = result.get("status", 0)
    if status == 403:
        print("\nSession check returned 403 — you may not be logged in.")
        print(f"Please log into {RESALE_BASE_URL} in the Chrome window, then re-run.")
        sys.exit(1)
    logger.info(f"Session check: HTTP {status} (ok)")


# ── Match list ──────────────────────────────────────────────────────

def load_cached_matches():
    if os.path.exists(MATCHES_CACHE_PATH):
        with open(MATCHES_CACHE_PATH) as f:
            matches = json.load(f)
        logger.info(f"Loaded {len(matches)} cached matches from {MATCHES_CACHE_PATH}")
        return matches
    return None


def save_matches_cache(matches):
    with open(MATCHES_CACHE_PATH, "w") as f:
        json.dump(matches, f, indent=2)
    logger.info(f"Saved {len(matches)} matches to {MATCHES_CACHE_PATH}")


def parse_matches_from_html(html):
    """Parse match info from the event list page HTML."""
    matches = []
    li_pattern = re.compile(
        r'<li\b([^>]*class="[^"]*performance[^"]*"[^>]*)>',
        re.DOTALL,
    )
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
                if num_match:
                    match_code = f"M{int(num_match.group(2)):03d}"
                else:
                    match_code = raw_code

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
    """Ask the user to save rendered HTML to a file, then parse it."""
    print("\n" + "=" * 70)
    print("MATCH LIST SETUP (one-time)")
    print("=" * 70)
    print()
    print("The match list needs to be extracted from the rendered HTML.")
    print("In your browser on the FIFA resale event list page:")
    print()
    print("  1. Right-click > Inspect (or F12)")
    print("  2. In the Elements tab, right-click the <html> tag")
    print("  3. Copy > Copy outerHTML")
    print(f"  4. Save it to: {EVENT_HTML_PATH}")
    print()
    print("Or: In the Console tab, run:")
    print("  copy(document.documentElement.outerHTML)")
    print(f"Then paste into a file at: {EVENT_HTML_PATH}")
    print()
    input("Press ENTER once you've saved the file... ")

    if not os.path.exists(EVENT_HTML_PATH):
        print(f"File not found: {EVENT_HTML_PATH}")
        return []

    with open(EVENT_HTML_PATH) as f:
        html = f.read()
    print(f"Read {len(html)} bytes from {EVENT_HTML_PATH}")
    return parse_matches_from_html(html)


# ── Seat scraping ───────────────────────────────────────────────────

def fetch_seats_for_bbox(page, config, performance_id, x, y, w, h):
    """Fetch seats via fetch() executed inside the real browser context."""
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

    js = f"""
        async () => {{
            const r = await fetch({json.dumps(url)}, {{
                method: 'GET',
                credentials: 'include',
                headers: {{
                    'Accept': 'application/json, text/plain, */*',
                    'X-Secutix-Host': 'fwc26-resale-usd.tickets.fifa.com',
                }}
            }});
            if (!r.ok) {{
                const body = await r.text();
                return {{ error: r.status, body: body.substring(0, 500) }};
            }}
            return {{ data: await r.json() }};
        }}
    """

    try:
        result = page.evaluate(js)
    except Exception as e:
        logger.error(f"  bbox ({x},{y},{w},{h}): JS error: {e}")
        return []

    if "error" in result:
        status = result["error"]
        body = result.get("body", "")
        logger.warning(f"  bbox ({x},{y},{w},{h}): HTTP {status} — {body}")
        if status == 403 and "captcha-delivery.com" in body:
            logger.error("CAPTCHA detected — stopping immediately")
            return "CAPTCHA"
        return []

    features = result.get("data", {}).get("features", [])
    logger.debug(f"  bbox ({x},{y},{w},{h}): {len(features)} seats")
    return features


def scrape_match(page, config, performance_id, match_label):
    """Scrape all seats for a match by tiling bbox across the venue."""
    tile_size = config.get("bbox_tile_size", 5000)
    max_coord = config.get("bbox_max_coord", 30000)

    all_seats = {}
    tile_count = 0
    total_tiles = (max_coord // tile_size) ** 2

    logger.info(f"Scraping {match_label} (perf={performance_id})...")
    logger.info(f"  Tiling {max_coord}x{max_coord} with {tile_size}x{tile_size} tiles ({total_tiles} tiles)")

    for x in range(0, max_coord, tile_size):
        for y in range(0, max_coord, tile_size):
            tile_count += 1
            features = fetch_seats_for_bbox(page, config, performance_id, x, y, tile_size, tile_size)
            if features == "CAPTCHA":
                print(f"\n  CAPTCHA detected at tile {tile_count}/{total_tiles}!")
                return "CAPTCHA"
            for feat in features:
                seat_id = feat.get("id") or feat.get("properties", {}).get("id")
                if seat_id and seat_id not in all_seats:
                    all_seats[seat_id] = feat

            if tile_count % 6 == 0:
                print(f"\r  Tiles: {tile_count}/{total_tiles}, unique seats so far: {len(all_seats)}", end="", flush=True)

            time.sleep(random.uniform(0.4, 1.2))

    print(f"\r  Tiles: {tile_count}/{total_tiles}, unique seats: {len(all_seats)}       ")
    logger.info(f"  Scanned {tile_count} tiles, found {len(all_seats)} unique seats")
    return list(all_seats.values())


# ── CSV output ──────────────────────────────────────────────────────

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
    logger.info(f"Saved {len(rows)} rows to {timestamped_csv_path} and {COMBINED_CSV_PATH}")


def save_debug_json(seats, match_label):
    safe_label = re.sub(r"[^a-zA-Z0-9_-]", "_", match_label)
    ts = datetime.now().strftime("%Y%m%d_%H%M")
    path = os.path.join(DEBUG_DIR, f"{safe_label}_{ts}.json")
    with open(path, "w") as f:
        json.dump(seats, f, indent=2)
    logger.info(f"Debug data saved to {path}")


# ── Match selection ─────────────────────────────────────────────────

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


# ── Main ────────────────────────────────────────────────────────────

def main():
    config = load_config()

    print("=" * 70)
    print("FIFA World Cup 2026 - Ticket Resale Marketplace Scraper")
    print("(Playwright mode — attached Chrome, requests run in browser context)")
    print("=" * 70)

    with sync_playwright() as playwright:
        browser = connect_to_chrome(playwright)
        page = get_or_create_page(browser)

        print(f"\nConnected. Active page: {page.url}")
        print("Verifying session...")
        verify_session(page, config)
        print("Session looks good.\n")

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
                print("\nNo matches found in the HTML.")
                print("Check that the HTML contains <li> elements with class 'performance'.")
                print(f"You can also manually create {MATCHES_CACHE_PATH}")
                print('Format: [{"performance_id": "123", "match_code": "M01", "description": "...", "availability": "available"}, ...]')
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
        captcha_hit = False
        matches_processed = 0
        run_start = time.time()

        for i, match in enumerate(selected):
            label = match["match_code"] if match["match_code"] else match["performance_id"]
            seats = scrape_match(page, config, match["performance_id"], label)

            if seats == "CAPTCHA":
                captcha_hit = True
                print(f"\n{'!'*70}")
                print(f"CAPTCHA triggered during match {label} (#{i+1} of {len(selected)}).")
                if last_success:
                    print(f"Last successful match: {last_success}")
                else:
                    print("No matches were completed successfully.")
                print(f"Total seats saved before stop: {total_seats}")
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
                pause = random.uniform(8, 12)
                print(f"  Pausing {pause:.0f}s before next match...")
                time.sleep(pause)

    elapsed = time.time() - run_start
    avg = elapsed / matches_processed if matches_processed > 0 else 0
    print(f"\n{matches_processed} matches processed in {fmt_duration(elapsed)} ({fmt_duration(avg)} avg. per match)")

    if not captcha_hit:
        print(f"Done! Total: {total_seats} seat records saved.")
    else:
        print(f"Partial run. Total: {total_seats} seat records saved.")
    print(f"Timestamped: {csv_path}")
    print(f"Combined:    {COMBINED_CSV_PATH}")


if __name__ == "__main__":
    main()
