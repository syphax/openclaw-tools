#!/usr/bin/env python3
"""
World Cup Ticket Price Tracker - Scrapes StubHub for ticket prices
and stores results in a CSV file and Google Sheet.
"""

import csv
import json
import logging
import os
import random
import re
import subprocess
import sys
import time
from datetime import datetime
from urllib.parse import urlencode, urlparse, parse_qs, urlunparse

import yaml


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SKILL_DIR = os.path.dirname(SCRIPT_DIR)
CFG_DIR = os.path.join(SKILL_DIR, "cfg")
LOG_DIR = os.path.join(SKILL_DIR, "logs")
DEBUG_DIR = os.path.join(SKILL_DIR, "debug")
CSV_PATH = os.path.join(SKILL_DIR, "ticket-price-history.csv")
LOG_PATH = os.path.join(LOG_DIR, "world-cup-tickets.log")

os.makedirs(LOG_DIR, exist_ok=True)
os.makedirs(DEBUG_DIR, exist_ok=True)

# Debug mode - set via environment variable DEBUG=1
DEBUG_MODE = os.environ.get("DEBUG", "").lower() in ("1", "true", "yes")

logging.basicConfig(
    level=logging.DEBUG if DEBUG_MODE else logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_PATH),
        logging.StreamHandler(sys.stderr),
    ],
)
logger = logging.getLogger("scrape_tickets")


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

    # Ensure playwright browsers are installed
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
    """Load the YAML configuration file."""
    config_path = os.path.join(CFG_DIR, "wct-config.yaml")
    with open(config_path) as f:
        return yaml.safe_load(f)


def build_url(base_url, quantity):
    """Insert the quantity parameter into a StubHub URL."""
    parsed = urlparse(base_url)
    params = parse_qs(parsed.query, keep_blank_values=True)
    params["quantity"] = [str(quantity)]
    new_query = urlencode(params, doseq=True)
    return urlunparse(parsed._replace(query=new_query))


def extract_from_network_data(network_data):
    """
    Extract price data from intercepted network responses.

    Args:
        network_data: List of captured network response bodies

    Returns:
        dict: Mapping of category number to price
    """
    prices_by_category = {}

    # Map of StubHub category IDs to our category numbers
    CATEGORY_ID_MAP = {
        1245: 1,  # Category 1
        1246: 2,  # Category 2
        1247: 3,  # Category 3
        1327: 4,  # Category 4
    }

    for response_body in network_data:
        try:
            if not response_body:
                continue

            # FIRST: Check if this is HTML containing <script id='app-context'>
            # This handles cases where the app-context data is in the initial HTML response
            if isinstance(response_body, (str, bytes)):
                body_str = response_body if isinstance(response_body, str) else response_body.decode('utf-8', errors='ignore')

                if "<script id='app-context'>" in body_str or '<script id="app-context">' in body_str:
                    logger.debug("Found <script id='app-context'> in network response HTML")

                    # Extract the JSON from the script tag
                    script_match = re.search(
                        r"<script\s+id=['\"]app-context['\"]>\s*(\{.*?\})\s*</script>",
                        body_str,
                        re.DOTALL
                    )

                    if script_match:
                        try:
                            app_context_json = script_match.group(1)
                            app_context_data = json.loads(app_context_json)
                            logger.debug("Successfully parsed app-context JSON from network HTML")

                            if DEBUG_MODE:
                                debug_file = os.path.join(DEBUG_DIR, f"network_app_context_{int(time.time())}.json")
                                with open(debug_file, "w") as f:
                                    json.dump(app_context_data, f, indent=2)
                                logger.debug(f"Saved network app-context data to {debug_file}")

                            # PREFERRED: Extract from ticketClassPopupData
                            ticket_class_popup_data = app_context_data.get("ticketClassPopupData", {})
                            if ticket_class_popup_data:
                                logger.debug("Found ticketClassPopupData in network app-context")
                                for cat_id_str, cat_data in ticket_class_popup_data.items():
                                    try:
                                        cat_id = int(cat_id_str)
                                        if cat_id in CATEGORY_ID_MAP:
                                            category_num = CATEGORY_ID_MAP[cat_id]
                                            raw_min_price = cat_data.get("rawMinPrice")
                                            if raw_min_price is not None:
                                                price = float(raw_min_price)
                                                if category_num not in prices_by_category or price < prices_by_category[category_num]:
                                                    prices_by_category[category_num] = price
                                                    logger.debug(f"  Found from network app-context (ticketClassPopupData) - Category {category_num}: ${price}")
                                    except (ValueError, TypeError) as e:
                                        logger.debug(f"Failed to parse ticketClassPopupData entry: {e}")
                                        continue

                            # FALLBACK: Extract from grid -> items
                            if not prices_by_category:
                                logger.debug("ticketClassPopupData empty, trying grid -> items from network app-context")
                                grid_data = app_context_data.get("grid", {})
                                items = grid_data.get("items", [])

                                for item in items:
                                    if not isinstance(item, dict):
                                        continue

                                    ticket_class_id = item.get("ticketClass")
                                    if ticket_class_id and ticket_class_id in CATEGORY_ID_MAP:
                                        category_num = CATEGORY_ID_MAP[ticket_class_id]

                                        price = None
                                        low_price = item.get("lowPrice")
                                        if low_price:
                                            if isinstance(low_price, (int, float)):
                                                price = float(low_price)
                                            elif isinstance(low_price, str):
                                                price_match = re.search(r'[\d,]+(?:\.\d{2})?', low_price.replace("$", ""))
                                                if price_match:
                                                    price = float(price_match.group(0).replace(",", ""))

                                        if price and (category_num not in prices_by_category or price < prices_by_category[category_num]):
                                            prices_by_category[category_num] = price
                                            logger.debug(f"  Found from network app-context (grid items) - Category {category_num}: ${price}")

                            # If we found prices from app-context, skip JSON parsing below
                            if prices_by_category:
                                continue

                        except json.JSONDecodeError as e:
                            logger.debug(f"Failed to parse app-context JSON from network HTML: {e}")

            # SECOND: Try parsing as JSON API response
            data = json.loads(response_body) if isinstance(response_body, str) else response_body

            # Look for listing data in various API response structures
            listings = []
            if isinstance(data, dict):
                # Common StubHub API patterns
                listings = (
                    data.get("listings", []) or
                    data.get("eventTicketListings", []) or
                    data.get("data", {}).get("listings", []) or
                    data.get("response", {}).get("listings", [])
                )
            elif isinstance(data, list):
                listings = data

            # Extract category and price from each listing
            for listing in listings:
                if not isinstance(listing, dict):
                    continue

                # Try to find category information
                category = None
                section_name = listing.get("sectionName", "") or listing.get("section", "")
                zone_name = listing.get("zoneName", "") or listing.get("zone", "")

                # Parse category from section/zone names
                for text in [section_name, zone_name]:
                    cat_match = re.search(r'(?:Cat(?:egory)?)\s*(\d)', str(text), re.IGNORECASE)
                    if cat_match:
                        category = int(cat_match.group(1))
                        break

                # Try explicit category field
                if category is None:
                    category = listing.get("category") or listing.get("ticketClass")
                    if category:
                        try:
                            category = int(category)
                        except (ValueError, TypeError):
                            continue

                # Extract price
                price = None
                price_info = listing.get("priceWithFees") or listing.get("currentPrice") or listing.get("price")

                if isinstance(price_info, dict):
                    price = price_info.get("amount") or price_info.get("value")
                elif isinstance(price_info, (int, float)):
                    price = price_info
                elif isinstance(price_info, str):
                    price_match = re.search(r'[\d,]+(?:\.\d{2})?', price_info.replace("$", ""))
                    if price_match:
                        price = float(price_match.group(0).replace(",", ""))

                # Store the price if we found both category and price
                if category and price and 1 <= category <= 4:
                    if category not in prices_by_category or price < prices_by_category[category]:
                        prices_by_category[category] = float(price)
                        logger.debug(f"  Found from network data API - Category {category}: ${price}")

        except Exception as e:
            logger.debug(f"Failed to parse network data: {e}")
            continue

    return prices_by_category


def extract_from_app_context(page):
    """
    Extract price data from StubHub's <script id='app-context'> initialization data.
    This is the FASTEST and most reliable method as it doesn't require waiting for DOM rendering.

    Args:
        page: Playwright page object

    Returns:
        dict: Mapping of category number to price
    """
    prices_by_category = {}

    try:
        # Try querySelector first (fastest)
        app_context_data = page.evaluate("""
            () => {
                const script = document.querySelector('script#app-context');
                if (script && script.textContent) {
                    try {
                        return JSON.parse(script.textContent);
                    } catch (e) {
                        return null;
                    }
                }
                return null;
            }
        """)

        # If querySelector failed, try robust regex extraction from page HTML
        if not app_context_data:
            logger.debug("querySelector failed, trying regex extraction from page HTML")
            page_html = page.content()

            # Try both single and double quote variants
            script_match = re.search(
                r"<script\s+id=['\"]app-context['\"]>\s*(\{.*?\})\s*</script>",
                page_html,
                re.DOTALL
            )

            if script_match:
                try:
                    app_context_json = script_match.group(1)
                    app_context_data = json.loads(app_context_json)
                    logger.debug("Successfully extracted app-context via regex")
                except json.JSONDecodeError as e:
                    logger.debug(f"Failed to parse app-context JSON from regex extraction: {e}")
                    return {}
            else:
                logger.debug("No <script id='app-context'> found in page (querySelector and regex both failed)")
                return {}

        logger.debug("Found <script id='app-context'> in page")
        if DEBUG_MODE:
            debug_file = os.path.join(DEBUG_DIR, f"app_context_{int(time.time())}.json")
            with open(debug_file, "w") as f:
                json.dump(app_context_data, f, indent=2)
            logger.debug(f"Saved app-context data to {debug_file}")

        # Map of StubHub category IDs to our category numbers
        CATEGORY_ID_MAP = {
            1245: 1,  # Category 1
            1246: 2,  # Category 2
            1247: 3,  # Category 3
            1327: 4,  # Category 4
        }

        # PREFERRED: Extract from ticketClassPopupData (most reliable)
        ticket_class_popup_data = app_context_data.get("ticketClassPopupData", {})
        if ticket_class_popup_data:
            logger.debug("Found ticketClassPopupData in app-context")
            for cat_id_str, cat_data in ticket_class_popup_data.items():
                try:
                    cat_id = int(cat_id_str)
                    if cat_id in CATEGORY_ID_MAP:
                        category_num = CATEGORY_ID_MAP[cat_id]
                        raw_min_price = cat_data.get("rawMinPrice")
                        if raw_min_price is not None:
                            price = float(raw_min_price)
                            prices_by_category[category_num] = price
                            logger.debug(f"  Found from ticketClassPopupData - Category {category_num}: ${price}")
                except (ValueError, TypeError) as e:
                    logger.debug(f"Failed to parse ticketClassPopupData entry: {e}")
                    continue

        # FALLBACK: Extract from grid -> items (if ticketClassPopupData didn't work)
        if not prices_by_category:
            logger.debug("ticketClassPopupData empty, trying grid -> items")
            grid_data = app_context_data.get("grid", {})
            items = grid_data.get("items", [])

            for item in items:
                if not isinstance(item, dict):
                    continue

                # Extract ticket class ID
                ticket_class_id = item.get("ticketClass")
                if ticket_class_id and ticket_class_id in CATEGORY_ID_MAP:
                    category_num = CATEGORY_ID_MAP[ticket_class_id]

                    # Extract price (could be in different formats)
                    price = None
                    low_price = item.get("lowPrice")
                    if low_price:
                        if isinstance(low_price, (int, float)):
                            price = float(low_price)
                        elif isinstance(low_price, str):
                            price_match = re.search(r'[\d,]+(?:\.\d{2})?', low_price.replace("$", ""))
                            if price_match:
                                price = float(price_match.group(0).replace(",", ""))

                    if price and (category_num not in prices_by_category or price < prices_by_category[category_num]):
                        prices_by_category[category_num] = price
                        logger.debug(f"  Found from grid items - Category {category_num}: ${price}")

    except Exception as e:
        logger.debug(f"App-context extraction failed: {e}")

    return prices_by_category


def extract_from_js_state(page):
    """
    Extract price data from global JavaScript state (window.__NEXT_DATA__, etc.).

    Args:
        page: Playwright page object

    Returns:
        dict: Mapping of category number to price
    """
    prices_by_category = {}

    try:
        # Try to extract Next.js data
        if not prices_by_category:
            next_data = page.evaluate("""
                () => {
                    if (window.__NEXT_DATA__) {
                        return window.__NEXT_DATA__;
                    }
                    return null;
                }
            """)

            if next_data:
                logger.debug("Found __NEXT_DATA__ in page")
                if DEBUG_MODE:
                    debug_file = os.path.join(DEBUG_DIR, f"next_data_{int(time.time())}.json")
                    with open(debug_file, "w") as f:
                        json.dump(next_data, f, indent=2)
                    logger.debug(f"Saved __NEXT_DATA__ to {debug_file}")

                # Navigate the Next.js data structure to find listings
                props = next_data.get("props", {})
                page_props = props.get("pageProps", {}) or props.get("initialProps", {})

                # Look for listing data in various locations
                listings = (
                    page_props.get("listings", []) or
                    page_props.get("eventTicketListings", []) or
                    page_props.get("initialState", {}).get("listings", []) or
                    []
                )

                for listing in listings:
                    if not isinstance(listing, dict):
                        continue

                    # Extract category and price using same logic as network data
                    category = None
                    section_name = listing.get("sectionName", "") or listing.get("section", "")
                    zone_name = listing.get("zoneName", "") or listing.get("zone", "")

                    for text in [section_name, zone_name]:
                        cat_match = re.search(r'(?:Cat(?:egory)?)\s*(\d)', str(text), re.IGNORECASE)
                        if cat_match:
                            category = int(cat_match.group(1))
                            break

                    if category is None:
                        category = listing.get("category") or listing.get("ticketClass")
                        if category:
                            try:
                                category = int(category)
                            except (ValueError, TypeError):
                                continue

                    price = None
                    price_info = listing.get("priceWithFees") or listing.get("currentPrice") or listing.get("price")

                    if isinstance(price_info, dict):
                        price = price_info.get("amount") or price_info.get("value")
                    elif isinstance(price_info, (int, float)):
                        price = price_info

                    if category and price and 1 <= category <= 4:
                        if category not in prices_by_category or price < prices_by_category[category]:
                            prices_by_category[category] = float(price)
                            logger.debug(f"  Found from JS state - Category {category}: ${price}")

        # Try other common global state variables
        for var_name in ["__INITIAL_STATE__", "__APP_STATE__", "window.stubhub", "window.SH"]:
            try:
                state = page.evaluate(f"() => {{ return {var_name}; }}")
                if state and DEBUG_MODE:
                    debug_file = os.path.join(DEBUG_DIR, f"{var_name.replace('.', '_')}_{int(time.time())}.json")
                    with open(debug_file, "w") as f:
                        json.dump(state, f, indent=2)
                    logger.debug(f"Saved {var_name} to {debug_file}")
            except Exception:
                pass

    except Exception as e:
        logger.debug(f"JS state extraction failed: {e}")

    return prices_by_category


def extract_from_dom(page):
    """
    Extract price data from DOM elements.

    Args:
        page: Playwright page object

    Returns:
        dict: Mapping of category number to price
    """
    prices_by_category = {}

    try:
        # PRIMARY: Extract from category filter button aria-labels
        # These buttons have aria-label="Select Category N - $X,XXX"
        buttons = page.query_selector_all('button[aria-label*="Select Category"]')
        if buttons:
            logger.debug(f"Found {len(buttons)} category filter buttons")
            for btn in buttons:
                aria_label = btn.get_attribute("aria-label")
                if aria_label:
                    match = re.search(r'Select Category (\d)\s*-\s*\$([\d,]+(?:\.\d{2})?)', aria_label)
                    if match:
                        cat = int(match.group(1))
                        price = float(match.group(2).replace(",", ""))
                        prices_by_category[cat] = price
                        logger.debug(f"  Found from aria-label - Category {cat}: ${price}")

        if prices_by_category:
            return prices_by_category

        # FALLBACK: Extract from category filter button text content
        # Buttons contain <p>Category N</p><p>$XXX</p> as child elements
        buttons = page.query_selector_all('button[aria-label*="Category"]')
        if buttons:
            logger.debug(f"Found {len(buttons)} category buttons (text fallback)")
            for btn in buttons:
                text = btn.inner_text()
                cat_match = re.search(r'Category\s*(\d)', text)
                price_match = re.search(r'\$([\d,]+(?:\.\d{2})?)', text)
                if cat_match and price_match:
                    cat = int(cat_match.group(1))
                    price = float(price_match.group(1).replace(",", ""))
                    if cat not in prices_by_category:
                        prices_by_category[cat] = price
                        logger.debug(f"  Found from button text - Category {cat}: ${price}")

    except Exception as e:
        logger.debug(f"DOM extraction failed: {e}")

    return prices_by_category


def scrape_prices(page, url, match_name="", quantity=1, attempt=1):
    """
    Navigate to a StubHub listing page and extract category prices.

    Returns a dict mapping category number (int) to price (float),
    e.g. {1: 250.00, 2: 180.00, 3: 120.00, 4: 85.00}
    """
    logger.info(f"Fetching: {url} (attempt {attempt})")

    # Set up network interception to capture API responses
    network_data = []

    def handle_response(response):
        try:
            # Capture relevant API responses
            if "api" in response.url.lower() or "graphql" in response.url.lower() or "listing" in response.url.lower():
                if response.status == 200:
                    try:
                        body = response.body()
                        network_data.append(body)
                        logger.debug(f"Captured response from: {response.url}")

                        if DEBUG_MODE:
                            # Save network response to file
                            url_hash = abs(hash(response.url)) % 10000
                            debug_file = os.path.join(DEBUG_DIR, f"network_{url_hash}_{int(time.time())}.json")
                            with open(debug_file, "wb") as f:
                                f.write(body)
                            logger.debug(f"Saved network response to {debug_file}")
                    except Exception as e:
                        logger.debug(f"Failed to capture response body: {e}")
        except Exception as e:
            logger.debug(f"Response handler error: {e}")

    page.on("response", handle_response)

    try:
        # Navigate to the page
        page.goto(url, wait_until="domcontentloaded", timeout=30000)

        # PHASE 1: Wait for category buttons to render, then extract from DOM
        # The category filter buttons (aria-label="Select Category N - $X") are the
        # most reliable data source on StubHub's current page structure.
        logger.info("Waiting for category buttons to render...")
        try:
            page.wait_for_selector('button[aria-label*="Select Category"]', timeout=15000)
            logger.info("Category buttons found")
        except Exception:
            logger.info("Category buttons not found, waiting for general content...")
            try:
                page.wait_for_load_state("networkidle", timeout=10000)
            except Exception:
                logger.warning("Networkidle timeout, proceeding anyway")
            time.sleep(2)

        prices_by_category = extract_from_dom(page)
        if prices_by_category:
            logger.info(f"✓ Extracted {len(prices_by_category)} categories from DOM")
            for cat, price in sorted(prices_by_category.items()):
                logger.info(f"  Category {cat}: ${price:.2f}")
            return prices_by_category

        # PHASE 2: Try app-context script tag
        logger.info("DOM extraction failed, trying app-context")
        prices_by_category = extract_from_app_context(page)
        if prices_by_category:
            logger.info(f"✓ Extracted {len(prices_by_category)} categories from app-context")
            for cat, price in sorted(prices_by_category.items()):
                logger.info(f"  Category {cat}: ${price:.2f}")
            return prices_by_category

        # PHASE 3: Try network data
        logger.info("Trying network data extraction")
        prices_by_category = extract_from_network_data(network_data)
        if prices_by_category:
            logger.info(f"✓ Extracted {len(prices_by_category)} categories from network data")
            for cat, price in sorted(prices_by_category.items()):
                logger.info(f"  Category {cat}: ${price:.2f}")
            return prices_by_category

        # PHASE 4: Try JS state
        logger.info("Trying JS state extraction")
        prices_by_category = extract_from_js_state(page)
        if prices_by_category:
            logger.info(f"✓ Extracted {len(prices_by_category)} categories from JS state")
            for cat, price in sorted(prices_by_category.items()):
                logger.info(f"  Category {cat}: ${price:.2f}")
            return prices_by_category

        # Save debug artifacts on failure
        if DEBUG_MODE:
            timestamp = int(time.time())
            screenshot_file = os.path.join(DEBUG_DIR, f"screenshot_{match_name}_q{quantity}_{timestamp}.png")
            page.screenshot(path=screenshot_file, full_page=True)
            logger.debug(f"Saved screenshot to {screenshot_file}")
            html_file = os.path.join(DEBUG_DIR, f"page_{match_name}_q{quantity}_{timestamp}.html")
            with open(html_file, "w", encoding="utf-8") as f:
                f.write(page.content())
            logger.debug(f"Saved HTML to {html_file}")

        logger.warning("All extraction methods failed to find category prices")
        return {}

    finally:
        # Clean up event listener
        page.remove_listener("response", handle_response)


def append_to_csv(rows):
    """Append rows to the CSV results file."""
    file_exists = os.path.exists(CSV_PATH)
    with open(CSV_PATH, "a", newline="") as f:
        writer = csv.writer(f)
        if not file_exists:
            writer.writerow(["Date", "Match", "Category", "Quantity", "Price"])
        writer.writerows(rows)
    logger.info(f"Appended {len(rows)} rows to {CSV_PATH}")


def append_to_google_sheet(rows, config):
    """Append rows to the configured Google Sheet."""
    try:
        import gspread

        gc = gspread.service_account()
        spreadsheet_id = config["google_sheet"]["spreadsheet_id"]
        sheet_name = config["google_sheet"].get("sheet_name", "Sheet1")
        sh = gc.open_by_key(spreadsheet_id)
        worksheet = sh.worksheet(sheet_name)
        worksheet.append_rows(rows, value_input_option="USER_ENTERED")
        logger.info(f"Appended {len(rows)} rows to Google Sheet")
    except Exception as e:
        logger.error(f"Failed to write to Google Sheet: {e}")
        logger.info("Results are still saved in the CSV file")


def run():
    """Main entry point."""
    ensure_dependencies()

    from playwright.sync_api import sync_playwright

    config = load_config()
    matches = config["matches"]
    categories = config.get("categories", [1, 2, 3, 4])
    quantities = config.get("quantities", [1, 2, 3, 4])
    max_retries = 3
    today = datetime.now().strftime("%Y-%m-%d")

    all_rows = []

    logger.info("=" * 60)
    logger.info("SCRIPT: scrape_tickets (StubHub)")
    logger.info("=" * 60)

    if DEBUG_MODE:
        logger.info("=" * 60)
        logger.info("DEBUG MODE ENABLED")
        logger.info(f"Debug artifacts will be saved to: {DEBUG_DIR}")
        logger.info("=" * 60)

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=not DEBUG_MODE,  # Run in headed mode when debugging
            args=['--disable-blink-features=AutomationControlled']
        )
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1920, "height": 1080},
            locale="en-US",
            timezone_id="America/New_York",
        )

        # Stealth improvements
        context.add_init_script("""
            // Remove webdriver property
            Object.defineProperty(navigator, 'webdriver', {get: () => undefined});

            // Mock plugins and languages
            Object.defineProperty(navigator, 'plugins', {get: () => [1, 2, 3, 4, 5]});
            Object.defineProperty(navigator, 'languages', {get: () => ['en-US', 'en']});
        """)

        page = context.new_page()

        for match_name, base_url in matches.items():
            logger.info("=" * 60)
            logger.info(f"Processing match: {match_name}")
            logger.info("=" * 60)

            for qty in quantities:
                url = build_url(base_url, qty)
                prices = {}
                success = False

                # Retry logic with exponential backoff
                for attempt in range(1, max_retries + 1):
                    try:
                        prices = scrape_prices(page, url, match_name, qty, attempt)

                        # Check if we got at least some category prices
                        if prices:
                            success = True
                            logger.info(f"✓ Successfully scraped {match_name} qty={qty} on attempt {attempt}")
                            break
                        else:
                            logger.warning(f"No prices found for {match_name} qty={qty} on attempt {attempt}")

                            if attempt < max_retries:
                                wait_time = attempt * 5  # Exponential backoff: 5s, 10s, 15s
                                logger.info(f"Retrying in {wait_time}s...")
                                time.sleep(wait_time)

                    except Exception as e:
                        logger.error(f"Error scraping {match_name} qty={qty} on attempt {attempt}: {e}", exc_info=DEBUG_MODE)

                        if attempt < max_retries:
                            wait_time = attempt * 5
                            logger.info(f"Retrying in {wait_time}s...")
                            time.sleep(wait_time)
                        else:
                            logger.error(f"✗ Failed to scrape {match_name} qty={qty} after {max_retries} attempts")

                # Record results for all requested categories
                for cat in categories:
                    price = prices.get(cat)
                    if price is not None:
                        row = [today, match_name, cat, qty, price]
                        all_rows.append(row)
                        logger.info(f"  ✓ Recorded: {match_name} Cat{cat} qty={qty} = ${price:.2f}")
                    else:
                        logger.warning(f"  ✗ Missing: {match_name} Cat{cat} qty={qty}")

                # Courteous pause between requests (only if not retrying)
                if success or attempt >= max_retries:
                    pause = random.uniform(3.0, 7.0)
                    logger.info(f"Pausing {pause:.1f}s before next request")
                    time.sleep(pause)

        browser.close()

    logger.info("=" * 60)
    logger.info("SCRAPING COMPLETE")
    logger.info("=" * 60)

    if all_rows:
        append_to_csv(all_rows)
        append_to_google_sheet(all_rows, config)
        logger.info(f"✓ Completed: {len(all_rows)} price observations recorded")
    else:
        logger.warning("✗ No prices were collected in this run")

    # Output summary as JSON for callers
    summary = {
        "date": today,
        "observations": len(all_rows),
        "matches_processed": list(matches.keys()),
        "csv_path": CSV_PATH,
        "debug_mode": DEBUG_MODE,
        "debug_dir": DEBUG_DIR if DEBUG_MODE else None,
    }
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    run()
