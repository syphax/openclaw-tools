#!/usr/bin/env python3
"""
FIFA World Cup 2026 Ticket Resale Marketplace Scraper (Cookie mode)

No browser automation — you log in with your normal browser, grab the
cookies from dev tools, and paste them here. The script uses plain HTTP
requests with your session cookies to hit the seatmap API.

Usage:
    python3 scripts/scrape_fifa_resale_cookies.py

On first run it will ask you to paste cookies. They get saved to
cfg/cookies.txt so you don't have to paste them every time. Delete
that file or re-run with --new-cookies to refresh.
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

import requests

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
COOKIES_PATH = os.path.join(CFG_DIR, "cookies.txt")
MATCHES_CACHE_PATH = os.path.join(CFG_DIR, "matches.json")
DEBUG_MODE = os.environ.get("DEBUG", "").lower() in ("1", "true", "yes")

logging.basicConfig(
    level=logging.DEBUG if DEBUG_MODE else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_PATH),
        logging.StreamHandler(sys.stderr),
    ],
)
logger = logging.getLogger("fifa-marketplace")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://fwc26-resale-usd.tickets.fifa.com/",
    "X-Secutix-Host": "fwc26-resale-usd.tickets.fifa.com",
}


# ── Config ──────────────────────────────────────────────────────────

def load_config():
    cfg_path = os.path.join(CFG_DIR, "fifa-marketplace-config.json")
    with open(cfg_path) as f:
        return json.load(f)


# ── Cookies ─────────────────────────────────────────────────────────

def parse_cookie_string(cookie_str):
    """Parse a 'key=value; key2=value2' cookie header string into a dict."""
    cookies = {}
    for part in cookie_str.split(";"):
        part = part.strip()
        if "=" in part:
            key, value = part.split("=", 1)
            cookies[key.strip()] = value.strip()
    return cookies


def get_cookies(force_new=False):
    """Load cookies from cache or prompt user to paste them."""
    if not force_new and os.path.exists(COOKIES_PATH):
        with open(COOKIES_PATH) as f:
            cookie_str = f.read().strip()
        if cookie_str:
            cookies = parse_cookie_string(cookie_str)
            logger.info(f"Loaded {len(cookies)} cookies from {COOKIES_PATH}")
            return cookies

    print("\n" + "=" * 70)
    print("COOKIE SETUP")
    print("=" * 70)
    print()
    print("1. Open your browser and log into the FIFA resale site")
    print("2. Open DevTools (F12) > Network tab")
    print("3. Click on any request to fwc26-resale-usd.tickets.fifa.com")
    print("4. Find the 'Cookie' request header")
    print("5. Copy the entire cookie string and paste it below")
    print()
    print("Paste your cookies (single line), then press ENTER:")
    cookie_str = input("> ").strip()

    if not cookie_str:
        print("No cookies provided. Exiting.")
        sys.exit(1)

    # Save for reuse
    with open(COOKIES_PATH, "w") as f:
        f.write(cookie_str)
    print(f"Cookies saved to {COOKIES_PATH}")

    return parse_cookie_string(cookie_str)


def build_session(cookies):
    """Build a requests.Session with the cookies and headers."""
    session = requests.Session()
    session.headers.update(HEADERS)
    session.cookies.update(cookies)
    return session


# ── Match list ──────────────────────────────────────────────────────

def load_cached_matches():
    """Load previously scraped match list from disk."""
    if os.path.exists(MATCHES_CACHE_PATH):
        with open(MATCHES_CACHE_PATH) as f:
            matches = json.load(f)
        logger.info(f"Loaded {len(matches)} cached matches from {MATCHES_CACHE_PATH}")
        return matches
    return None


def save_matches_cache(matches):
    """Save scraped match list to disk for reuse."""
    with open(MATCHES_CACHE_PATH, "w") as f:
        json.dump(matches, f, indent=2)
    logger.info(f"Saved {len(matches)} matches to {MATCHES_CACHE_PATH}")


def parse_matches_from_html(html):
    """Parse match info from the event list page HTML.

    Each match is a <li> block containing:
    - aria-labelledby with event_code_MXX
    - onclick with perfId=NNNN in the URL (this is the real performanceId)
    - class with availability info (limited, sold_out, etc.)
    """
    matches = []
    # Match each <li ...> block that contains 'performance' in its class
    li_pattern = re.compile(
        r'<li\b([^>]*class="[^"]*performance[^"]*"[^>]*)>',
        re.DOTALL,
    )
    for li_match in li_pattern.finditer(html):
        attrs = li_match.group(1)

        # Extract perfId from the onclick URL — this is the correct performanceId
        perf_match = re.search(r'perfId=(\d+)', attrs)
        if not perf_match:
            # Also check the text after the <li> tag for the onclick
            # (onclick content may span past the attrs we captured)
            chunk = html[li_match.start():li_match.start() + 2000]
            perf_match = re.search(r'perfId=(\d+)', chunk)
        if not perf_match:
            continue
        perf_id = perf_match.group(1)

        # Extract match code from aria-labelledby
        match_code = ""
        aria_match = re.search(r'aria-labelledby="([^"]*)"', attrs)
        if not aria_match:
            chunk = html[li_match.start():li_match.start() + 2000]
            aria_match = re.search(r'aria-labelledby="([^"]*)"', chunk)
        if aria_match:
            code_match = re.search(r'event_code_(\w+)', aria_match.group(1))
            if code_match:
                raw_code = code_match.group(1)
                # Zero-pad to M001 format (M1 → M001, M12 → M012, M104 → M104)
                num_match = re.match(r'^(M)(\d+)$', raw_code)
                if num_match:
                    match_code = f"M{int(num_match.group(2)):03d}"
                else:
                    match_code = raw_code

        # Location: extract venue_XX id from aria-labelledby, then find matching element
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

        # Availability from class
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
        resp = session.get(url)
        if resp.status_code != 200:
            body = resp.text[:500]
            logger.warning(f"  bbox ({x},{y},{w},{h}): HTTP {resp.status_code} — {body}")
            if resp.status_code == 403 and "captcha-delivery.com" in body:
                logger.error("CAPTCHA detected — stopping immediately")
                return "CAPTCHA"
            return []
        data = resp.json()
        features = data.get("features", [])
        logger.debug(f"  bbox ({x},{y},{w},{h}): {len(features)} seats")
        return features
    except Exception as e:
        logger.error(f"  bbox ({x},{y},{w},{h}): error: {e}")
        return []


def scrape_match(session, config, performance_id, match_label):
    """Scrape all seats for a match by tiling bbox across the venue.

    Returns list of seat features, or "CAPTCHA" if captcha was triggered.
    """
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
            features = fetch_seats_for_bbox(session, config, performance_id, x, y, tile_size, tile_size)
            if features == "CAPTCHA":
                print(f"\n  CAPTCHA detected at tile {tile_count}/{total_tiles}!")
                return "CAPTCHA"
            for feat in features:
                seat_id = feat.get("id") or feat.get("properties", {}).get("id")
                if seat_id and seat_id not in all_seats:
                    all_seats[seat_id] = feat

            # Progress indicator
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
    """Convert raw seat features to flat CSV rows."""
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
    force_new_cookies = "--new-cookies" in sys.argv

    print("=" * 70)
    print("FIFA World Cup 2026 - Ticket Resale Marketplace Scraper")
    print("(Cookie mode — no browser automation)")
    print("=" * 70)

    # Get cookies
    cookies = get_cookies(force_new=force_new_cookies)
    session = build_session(cookies)

    # Test the session with a quick request
    print("\nTesting session...")
    test_resp = session.get(config["seatmap_api_base"].rsplit("/", 3)[0])
    if test_resp.status_code == 403:
        print("Session returned 403 — cookies may be expired.")
        print("Re-run with --new-cookies to paste fresh cookies.")
        sys.exit(1)
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

    # Select matches
    selected = prompt_match_selection(matches)
    if not selected:
        print("No matches selected. Exiting.")
        return

    csv_path = make_csv_path()
    print(f"\nWill scrape {len(selected)} match(es).")
    print(f"Output: {csv_path}\n")

    total_seats = 0
    last_success = None
    captcha_hit = False
    for i, match in enumerate(selected):
        label = match["match_code"] if match["match_code"] else match["performance_id"]
        seats = scrape_match(session, config, match["performance_id"], label)

        if seats == "CAPTCHA":
            captcha_hit = True
            print(f"\n{'!'*70}")
            print(f"CAPTCHA triggered during match {label} (#{i+1} of {len(selected)}).")
            if last_success:
                print(f"Last successful match: {last_success}")
            else:
                print("No matches were completed successfully.")
            print(f"Total seats saved before stop: {total_seats}")
            print(f"Re-run with --new-cookies and resume from where you left off.")
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
            last_success = label  # still counts as successful (just empty)

        # Pause between matches (skip after the last one)
        if i < len(selected) - 1:
            pause = random.uniform(8, 12)
            print(f"  Pausing {pause:.0f}s before next match...")
            time.sleep(pause)

    if not captcha_hit:
        print(f"\nDone! Total: {total_seats} seat records saved.")
    else:
        print(f"\nPartial run. Total: {total_seats} seat records saved.")
    print(f"Timestamped: {csv_path}")
    print(f"Combined:    {COMBINED_CSV_PATH}")


if __name__ == "__main__":
    main()
