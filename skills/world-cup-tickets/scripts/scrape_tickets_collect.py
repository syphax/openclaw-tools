#!/usr/bin/env python3
"""
World Cup Ticket Price Tracker - FIFA Collect Scraper

Scrapes fifacollect.info for World Cup 2026 ticket price data
and stores results in a local CSV and Google Sheet (Prices-FC tab).
"""

import csv
import json
import logging
import os
import re
import subprocess
import sys
import time
import random
from datetime import datetime

import yaml


SCRIPT_NAME = "scrape_tickets_collect"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SKILL_DIR = os.path.dirname(SCRIPT_DIR)
CFG_DIR = os.path.join(SKILL_DIR, "cfg")
LOG_DIR = os.path.join(SKILL_DIR, "logs")
DEBUG_DIR = os.path.join(SKILL_DIR, "debug")
CSV_PATH = os.path.join(SKILL_DIR, "ticket-price-history-fc.csv")
LOG_PATH = os.path.join(LOG_DIR, "world-cup-tickets.log")

SOURCE_URL = "https://www.fifacollect.info/tickets/world-cup-2026/listings?sort=sale-volume-desc"
CSV_HEADERS = [
    "Date", "Match", "Category", "Face Value",
    "Sales Volume", "Sales Amount", "Avg. Price",
    "Last Sale", "Starting at", "URL",
]

# Debug mode - set via environment variable DEBUG=1
DEBUG_MODE = os.environ.get("DEBUG", "").lower() in ("1", "true", "yes")

os.makedirs(LOG_DIR, exist_ok=True)
os.makedirs(DEBUG_DIR, exist_ok=True)

logging.basicConfig(
    level=logging.DEBUG if DEBUG_MODE else logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_PATH),
        logging.StreamHandler(sys.stderr),
    ],
)
logger = logging.getLogger(SCRIPT_NAME)


def ensure_dependencies():
    """Auto-install required packages if not available."""
    deps = {"playwright": "playwright", "yaml": "pyyaml", "gspread": "gspread"}
    for module, package in deps.items():
        try:
            __import__(module)
        except ImportError:
            logger.info(f"Installing {package}...")
            try:
                subprocess.check_call(
                    [sys.executable, "-m", "pip", "install", "-q", "--user", package]
                )
            except subprocess.CalledProcessError:
                subprocess.check_call(
                    [sys.executable, "-m", "pip", "install", "-q", "--break-system-packages", package]
                )

    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            try:
                p.chromium.launch(headless=True).close()
            except Exception:
                logger.info("Installing Playwright Chromium browser...")
                subprocess.check_call([sys.executable, "-m", "playwright", "install", "chromium"])
    except Exception as e:
        logger.warning(f"Playwright browser check failed: {e}")


def load_config():
    """Load the wct-collect.yaml configuration file."""
    config_path = os.path.join(CFG_DIR, "wct-collect.yaml")
    with open(config_path) as f:
        return yaml.safe_load(f)


def parse_price(text):
    """Parse a price string like '$1,234.56' into a float, or None."""
    if not text:
        return None
    m = re.search(r'[\d,]+(?:\.\d{1,2})?', text.replace('$', ''))
    if m:
        return float(m.group(0).replace(',', ''))
    return None


def parse_volume(text):
    """
    Parse volume text like '$116,215 | 130 sales' into
    (sales_amount, sales_volume, avg_price).

    The field contains two pieces of info on the page:
      - Dollar amount (e.g. $116,215)  → Sales Amount
      - Count (e.g. 130 sales)         → Sales Volume
    Avg. Price is computed as Sales Amount / Sales Volume.
    """
    if not text:
        return None, None, None

    amount_match = re.search(r'\$([\d,]+(?:\.\d{1,2})?)', text)
    count_match = re.search(r'([\d,]+)\s*sales', text, re.IGNORECASE)

    sales_amount = float(amount_match.group(1).replace(',', '')) if amount_match else None
    sales_volume = int(count_match.group(1).replace(',', '')) if count_match else None

    avg_price = None
    if sales_amount is not None and sales_volume:
        avg_price = round(sales_amount / sales_volume, 2)

    return sales_amount, sales_volume, avg_price


def extract_table_data(page):
    """
    Use JavaScript to extract headers and all data rows from the
    Angular Material table on the fifacollect.info listings page.

    Returns (headers: list[str], rows: list[list[str]]).
    """
    result = page.evaluate("""
        () => {
            // Detect header cells across several Angular Material patterns
            const headerSelectors = [
                'tr[mat-header-row] th',
                'tr[mat-header-row] mat-header-cell',
                '.mat-mdc-header-row th',
                '.mat-mdc-header-row .mat-mdc-header-cell',
                'thead th',
            ];
            let headers = [];
            for (const sel of headerSelectors) {
                const cells = document.querySelectorAll(sel);
                if (cells.length > 0) {
                    headers = Array.from(cells).map(c => c.innerText.trim().toLowerCase());
                    break;
                }
            }

            // Detect data rows
            const rowSelectors = [
                'tr[mat-row]',
                '.mat-mdc-row',
                'mat-row',
                'tbody tr',
            ];
            let rows = [];
            for (const sel of rowSelectors) {
                const found = document.querySelectorAll(sel);
                if (found.length > 0) {
                    rows = Array.from(found);
                    break;
                }
            }

            // Extract cell text for each row
            const cellSelectors = [
                'td[mat-cell]',
                'td.mat-mdc-cell',
                'mat-cell',
                'td',
            ];
            const rowData = [];
            for (const row of rows) {
                let cells = [];
                for (const sel of cellSelectors) {
                    const found = row.querySelectorAll(sel);
                    if (found.length > 0) {
                        cells = Array.from(found).map(c => c.innerText.trim());
                        break;
                    }
                }
                if (cells.length > 0) {
                    rowData.push(cells);
                }
            }

            return { headers, rows: rowData };
        }
    """)

    return result.get('headers', []), result.get('rows', [])


def build_column_map(headers):
    """
    Build a dict mapping lowercase column name → cell index.
    Falls back to the known column order from the site spec if
    headers cannot be detected.
    """
    if not headers:
        logger.warning("No headers detected; using assumed column order")
        return {
            'match': 0,
            'location': 1,
            'round': 2,
            'category': 3,
            'face value': 4,
            'volume': 5,
            'last sale': 6,
            'starting at': 7,
        }

    logger.info(f"Detected columns: {headers}")
    # Keep first occurrence so duplicate column names (the site has 'match' twice)
    # don't overwrite the correct earlier index.
    col_map = {}
    for i, h in enumerate(headers):
        if h and h not in col_map:
            col_map[h] = i
    return col_map


def scrape(page, matches_config):
    """
    Navigate to the FIFA Collect listings page and extract data
    for the tracked matches only.

    Returns a list of result dicts keyed by CSV_HEADERS.
    """
    # Build reverse lookup: site match label → our internal ID
    # e.g. {"M9": "M09", "M18": "M18", ...}
    site_to_our = {v: k for k, v in matches_config.items()}

    logger.info(f"Fetching {SOURCE_URL}")
    try:
        response = page.goto(SOURCE_URL, wait_until="domcontentloaded", timeout=30000)
        if response and response.status >= 400:
            logger.error(f"HTTP {response.status} returned from {SOURCE_URL}")
            return []
    except Exception as e:
        logger.error(f"Failed to load {SOURCE_URL}: {e}")
        return []

    # Wait for Angular to populate table cells, not just row shells.
    # Angular creates tr[mat-row] elements immediately but fills td[mat-cell]
    # children in a second change-detection pass, so we must wait for cells.
    logger.info("Waiting for table cells to render...")
    cell_appeared = False
    for selector in ['td[mat-cell]', 'td.mat-mdc-cell', 'mat-cell']:
        try:
            page.wait_for_selector(selector, timeout=20000)
            logger.info(f"Table cells rendered (matched '{selector}')")
            cell_appeared = True
            break
        except Exception:
            continue

    if not cell_appeared:
        logger.warning("Cell selector not found; falling back to networkidle wait")
        try:
            page.wait_for_load_state("networkidle", timeout=15000)
        except Exception:
            pass

    # Brief additional wait for Angular change detection to finish all rows
    try:
        page.wait_for_load_state("networkidle", timeout=8000)
    except Exception:
        pass
    time.sleep(1)

    headers, rows = extract_table_data(page)
    if not rows:
        logger.error("No rows extracted from page")
        if DEBUG_MODE:
            ts = int(time.time())
            html_file = os.path.join(DEBUG_DIR, f"collect_page_{ts}.html")
            screenshot_file = os.path.join(DEBUG_DIR, f"collect_page_{ts}.png")
            with open(html_file, "w", encoding="utf-8") as f:
                f.write(page.content())
            page.screenshot(path=screenshot_file, full_page=True)
            logger.debug(f"Saved HTML to {html_file}")
            logger.debug(f"Saved screenshot to {screenshot_file}")
        return []

    logger.info(f"Extracted {len(rows)} raw rows")
    col = build_column_map(headers)

    def get_cell(row_cells, name):
        idx = col.get(name)
        if idx is not None and idx < len(row_cells):
            return row_cells[idx]
        return ''

    results = []
    today = datetime.now().strftime("%Y-%m-%d")
    skipped = 0

    for row_cells in rows:
        match_cell = get_cell(row_cells, 'match').strip()
        if not match_cell:
            continue

        # The cell may contain more than just the identifier (e.g. date, teams).
        # Extract the match number token like "M9" or "M18".
        m = re.search(r'\bM(\d+)\b', match_cell, re.IGNORECASE)
        match_site = f"M{m.group(1)}" if m else match_cell

        our_match_id = site_to_our.get(match_site)
        if our_match_id is None:
            skipped += 1
            logger.debug(f"Skipping untracked match: {match_site!r} (cell: {match_cell!r})")
            continue

        category_raw = get_cell(row_cells, 'category')
        face_value_raw = get_cell(row_cells, 'face value')
        volume_raw = get_cell(row_cells, 'volume')
        last_sale_raw = get_cell(row_cells, 'last sale')
        starting_at_raw = get_cell(row_cells, 'starting at')

        cat_match = re.search(r'\d+', category_raw)
        category = int(cat_match.group(0)) if cat_match else None

        face_value = parse_price(face_value_raw)
        last_sale = parse_price(last_sale_raw)
        starting_at = parse_price(starting_at_raw)
        sales_amount, sales_volume, avg_price = parse_volume(volume_raw)

        logger.info(
            f"  {our_match_id} Cat{category}: "
            f"face={face_value} vol={sales_volume} amt={sales_amount} "
            f"avg={avg_price} last={last_sale} start={starting_at}"
        )

        results.append({
            'Date': today,
            'Match': our_match_id,
            'Category': category,
            'Face Value': face_value,
            'Sales Volume': sales_volume,
            'Sales Amount': sales_amount,
            'Avg. Price': avg_price,
            'Last Sale': last_sale,
            'Starting at': starting_at,
            'URL': SOURCE_URL,
        })

    if skipped:
        logger.info(f"Skipped {skipped} rows for untracked matches")

    return results


def append_to_csv(records):
    """Append records to the local CSV file, writing a header if new."""
    file_exists = os.path.exists(CSV_PATH)
    with open(CSV_PATH, 'a', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=CSV_HEADERS)
        if not file_exists:
            writer.writeheader()
        writer.writerows(records)
    logger.info(f"Appended {len(records)} rows to {CSV_PATH}")


def append_to_google_sheet(records, config):
    """Append records to the Prices-FC tab of the Google Sheet."""
    try:
        import gspread
        gc = gspread.service_account()
        spreadsheet_id = config['google_sheet']['spreadsheet_id']
        sheet_name = config['google_sheet'].get('sheet_name', 'Prices-FC')
        sh = gc.open_by_key(spreadsheet_id)
        worksheet = sh.worksheet(sheet_name)
        rows = [[r.get(h, '') for h in CSV_HEADERS] for r in records]
        worksheet.append_rows(rows, value_input_option='USER_ENTERED')
        logger.info(f"Appended {len(records)} rows to Google Sheet tab '{sheet_name}'")
    except Exception as e:
        logger.error(f"Failed to write to Google Sheet: {e}")
        logger.info("Results are still saved in the local CSV file")


def run():
    """Main entry point."""
    ensure_dependencies()

    from playwright.sync_api import sync_playwright

    logger.info("=" * 60)
    logger.info("SCRIPT: scrape_tickets_collect (FIFA Collect)")
    logger.info("=" * 60)

    if DEBUG_MODE:
        logger.info("DEBUG MODE ENABLED")
        logger.info(f"Debug artifacts will be saved to: {DEBUG_DIR}")

    config = load_config()
    matches_config = config['matches']

    max_retries = 3
    records = []

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=['--disable-blink-features=AutomationControlled'],
        )
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1920, "height": 1080},
            locale="en-US",
            timezone_id="America/New_York",
        )
        context.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
            Object.defineProperty(navigator, 'plugins', {get: () => [1, 2, 3, 4, 5]});
            Object.defineProperty(navigator, 'languages', {get: () => ['en-US', 'en']});
        """)
        page = context.new_page()

        for attempt in range(1, max_retries + 1):
            try:
                records = scrape(page, matches_config)
                if records:
                    logger.info(f"✓ Got {len(records)} records on attempt {attempt}")
                    break
                else:
                    logger.warning(f"No records found on attempt {attempt}")
                    if attempt < max_retries:
                        wait = random.uniform(5.0, 10.0)
                        logger.info(f"Retrying in {wait:.1f}s...")
                        time.sleep(wait)
            except Exception as e:
                logger.error(f"Scrape error on attempt {attempt}: {e}")
                if attempt < max_retries:
                    wait = attempt * 5
                    logger.info(f"Retrying in {wait}s...")
                    time.sleep(wait)
                else:
                    logger.error("All attempts failed")

        browser.close()

    logger.info("=" * 60)
    logger.info("SCRAPING COMPLETE")
    logger.info("=" * 60)

    if records:
        append_to_csv(records)
        append_to_google_sheet(records, config)
        logger.info(f"✓ Completed: {len(records)} records saved")
    else:
        logger.warning("✗ No records collected in this run")

    summary = {
        "date": datetime.now().strftime("%Y-%m-%d"),
        "observations": len(records),
        "csv_path": CSV_PATH,
    }
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    run()
