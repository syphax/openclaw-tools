#!/usr/bin/env python3
"""
FIFA World Cup 2026 Ticket Resale Marketplace Scraper
======================================================================
GENERATION 1: Playwright — own browser instance

Limitation: Playwright sets navigator.webdriver=true in the browser it
launches, which DataDome detects immediately and blocks.

Superseded by: scrape_fifa_resale_cookies.py (Gen 2)
======================================================================

Interactive script that:
1. Opens a Playwright browser so you can manually log in
2. Scrapes the event list to find all matches and their performanceIds
3. Lets you pick which matches to scrape
4. Tiles the venue seatmap with bbox queries to collect all available seats
5. Deduplicates and saves to CSV
"""

import csv
import json
import logging
import os
import re
import sys
import time
from datetime import datetime
from urllib.parse import urlencode

from playwright.sync_api import sync_playwright

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


def load_config():
    cfg_path = os.path.join(CFG_DIR, "fifa-marketplace-config.json")
    with open(cfg_path) as f:
        return json.load(f)


def parse_matches_from_page(page):
    """Parse the event list page HTML to extract match info and performanceIds."""
    matches = []
    # The event list has <li> elements with performance data
    elements = page.query_selector_all("li.performance")
    for el in elements:
        perf_id = el.get_attribute("id")
        if not perf_id:
            continue

        # Extract match code from aria-labelledby (e.g., "event_code_M74")
        aria = el.get_attribute("aria-labelledby") or ""
        match_code = ""
        code_match = re.search(r"event_code_(\w+)", aria)
        if code_match:
            match_code = code_match.group(1)

        # Try to get visible text for match description
        text = el.inner_text().strip()
        # Clean up whitespace
        text = re.sub(r"\s+", " ", text)

        # Extract availability status from class
        availability = "available"
        classes = el.get_attribute("class") or ""
        if "sold_out" in classes:
            availability = "sold_out"
        elif "limited" in classes:
            availability = "limited"

        matches.append({
            "performance_id": perf_id,
            "match_code": match_code,
            "description": text[:120],  # truncate long descriptions
            "availability": availability,
        })

    logger.info(f"Found {len(matches)} matches on event list page")
    return matches


def fetch_seats_for_bbox(page, config, performance_id, x, y, w, h):
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
        response = page.request.get(url)
        if response.status != 200:
            logger.warning(f"  bbox ({x},{y},{w},{h}): HTTP {response.status}")
            return []
        data = response.json()
        features = data.get("features", [])
        logger.debug(f"  bbox ({x},{y},{w},{h}): {len(features)} seats")
        return features
    except Exception as e:
        logger.error(f"  bbox ({x},{y},{w},{h}): error: {e}")
        return []


def scrape_match(page, config, performance_id, match_label):
    """Scrape all seats for a match by tiling bbox across the venue."""
    tile_size = config.get("bbox_tile_size", 5000)
    max_coord = config.get("bbox_max_coord", 30000)

    all_seats = {}  # keyed by seat id for dedup
    tile_count = 0

    logger.info(f"Scraping {match_label} (perf={performance_id})...")
    logger.info(f"  Tiling {max_coord}x{max_coord} with {tile_size}x{tile_size} tiles")

    for x in range(0, max_coord, tile_size):
        for y in range(0, max_coord, tile_size):
            tile_count += 1
            features = fetch_seats_for_bbox(page, config, performance_id, x, y, tile_size, tile_size)
            for feat in features:
                seat_id = feat.get("id") or feat.get("properties", {}).get("id")
                if seat_id and seat_id not in all_seats:
                    all_seats[seat_id] = feat
            # Small delay to avoid hammering the server
            time.sleep(0.15)

    logger.info(f"  Scanned {tile_count} tiles, found {len(all_seats)} unique seats")
    return list(all_seats.values())


def seats_to_rows(seats, match_label):
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
        # Amount is in cents
        amount_cents = props.get("amount", 0)
        price = amount_cents / 100.0

        rows.append({
            "Pull Date": pull_date,
            "Pull Time": pull_time,
            "Match": match_label,
            "Category": category,
            "Section": block_name,
            "Area": area_name,
            "Row": row,
            "Seat": seat_num,
            "Price": f"{price:.2f}",
        })
    return rows


def make_csv_path():
    """Generate a timestamped CSV filename."""
    ts = datetime.now().strftime("%Y-%m-%d-%H-%M")
    return os.path.join(DATA_DIR, f"fifa-resale-tickets-{ts}.csv")


COMBINED_CSV_PATH = os.path.join(DATA_DIR, "fifa-resale-tickets.csv")
CSV_FIELDNAMES = ["Pull Date", "Pull Time", "Match", "Category", "Section", "Area", "Row", "Seat", "Price"]


def append_to_csv(rows, csv_path):
    """Append rows to a CSV file, writing header if needed."""
    file_exists = os.path.exists(csv_path) and os.path.getsize(csv_path) > 0
    with open(csv_path, "a", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDNAMES)
        if not file_exists:
            writer.writeheader()
        writer.writerows(rows)


def save_to_csv(rows, timestamped_csv_path):
    """Save rows to both the timestamped CSV and the combined CSV."""
    append_to_csv(rows, timestamped_csv_path)
    append_to_csv(rows, COMBINED_CSV_PATH)
    logger.info(f"Saved {len(rows)} rows to {timestamped_csv_path} and {COMBINED_CSV_PATH}")


def save_debug_json(seats, match_label):
    """Save raw seat data for debugging."""
    safe_label = re.sub(r"[^a-zA-Z0-9_-]", "_", match_label)
    ts = datetime.now().strftime("%Y%m%d_%H%M")
    path = os.path.join(DEBUG_DIR, f"{safe_label}_{ts}.json")
    with open(path, "w") as f:
        json.dump(seats, f, indent=2)
    logger.info(f"Debug data saved to {path}")


MATCHES_CACHE_PATH = os.path.join(CFG_DIR, "matches.json")


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


def prompt_match_selection(matches):
    """Let the user pick which matches to scrape."""
    available = [m for m in matches if m["availability"] != "sold_out"]
    if not available:
        print("\nNo matches with available tickets found.")
        return []

    print(f"\n{'='*70}")
    print(f"Found {len(available)} matches with tickets available:\n")
    for i, m in enumerate(available, 1):
        status = f"[{m['availability'].upper()}]" if m["availability"] == "limited" else ""
        print(f"  {i:3d}. {m['match_code']:6s} {m['description'][:80]} {status}")

    print(f"\n{'='*70}")
    print("Enter match numbers to scrape (comma-separated), 'all', or 'q' to quit:")
    choice = input("> ").strip()

    if choice.lower() == "q":
        return []
    if choice.lower() == "all":
        return available

    selected = []
    for part in choice.split(","):
        part = part.strip()
        if part.isdigit():
            idx = int(part) - 1
            if 0 <= idx < len(available):
                selected.append(available[idx])
            else:
                print(f"  Skipping invalid index: {part}")
    return selected


def main():
    config = load_config()
    event_url = config["event_list_url"]

    print("=" * 70)
    print("FIFA World Cup 2026 - Ticket Resale Marketplace Scraper")
    print("=" * 70)

    # Check for cached match list
    cached_matches = load_cached_matches()
    if cached_matches:
        print(f"\nUsing cached match list ({len(cached_matches)} matches).")
        print("To re-scrape the match list, delete cfg/matches.json\n")
        matches = cached_matches
    else:
        matches = None  # will scrape from page after login

    print()
    print("A browser window will open. Please:")
    print("  1. Complete the login (robot check + emailed code)")
    print("  2. Come back here and press ENTER to continue")
    print()

    with sync_playwright() as p:
        browser = p.firefox.launch(headless=False)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:137.0) Gecko/20100101 Firefox/137.0",
            viewport={"width": 1440, "height": 900},
            locale="en-US",
        )
        page = context.new_page()

        # Navigate to the event list
        logger.info(f"Opening {event_url}")
        page.goto(event_url, wait_until="domcontentloaded")

        # Wait for user to log in
        input("\nPress ENTER once you're logged in... ")

        # Give the page a moment to settle after any redirects
        page.wait_for_load_state("networkidle")
        time.sleep(1)

        # Scrape match list from page if we don't have a cache
        if matches is None:
            matches = parse_matches_from_page(page)
            if not matches:
                print("\nNo matches found on the page.")
                print("This might mean:")
                print("  - The page structure has changed")
                print("  - You're not on the right page")
                print()
                print(f"Current URL: {page.url}")
                print("\nSaving page HTML to debug/ for inspection...")
                html = page.content()
                debug_path = os.path.join(DEBUG_DIR, f"page_{datetime.now().strftime('%Y%m%d_%H%M')}.html")
                with open(debug_path, "w") as f:
                    f.write(html)
                print(f"Saved to {debug_path}")
                browser.close()
                return
            # Cache for next time
            save_matches_cache(matches)

        # Let user pick matches
        selected = prompt_match_selection(matches)
        if not selected:
            print("No matches selected. Exiting.")
            browser.close()
            return

        csv_path = make_csv_path()
        print(f"\nWill scrape {len(selected)} match(es). This may take a few minutes per match.")
        print(f"Output: {csv_path}\n")

        total_seats = 0
        for match in selected:
            label = f"{match['match_code']}" if match["match_code"] else match["performance_id"]
            seats = scrape_match(page, config, match["performance_id"], label)

            if seats:
                if DEBUG_MODE:
                    save_debug_json(seats, label)
                rows = seats_to_rows(seats, label)
                save_to_csv(rows, csv_path)
                total_seats += len(rows)
                print(f"  {label}: {len(rows)} seats saved")
            else:
                print(f"  {label}: no seats found")

        print(f"\nDone! Total: {total_seats} seat records saved.")
        print(f"CSV: {csv_path}")

        browser.close()


if __name__ == "__main__":
    main()
