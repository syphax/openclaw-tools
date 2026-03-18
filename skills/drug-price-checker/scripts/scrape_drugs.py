#!/usr/bin/env python3
"""
Government RX Price Tracker - Scrapes trumprx.gov for prescription drug prices
and stores results in a CSV file and optionally a Google Sheet.
"""

import csv
import json
import logging
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path

# Path setup
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SKILL_DIR = os.path.dirname(SCRIPT_DIR)
CFG_DIR = os.path.join(SKILL_DIR, "cfg")
LOG_DIR = os.path.join(SKILL_DIR, "logs")
DATA_DIR = os.path.join(SKILL_DIR, "data")
CONFIG_PATH = os.path.join(CFG_DIR, "govrx-config.json")
LOG_PATH = os.path.join(LOG_DIR, "govrx.log")

# Ensure directories exist
os.makedirs(LOG_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_PATH),
        logging.StreamHandler(sys.stderr),
    ],
)
logger = logging.getLogger("govrx")




def load_config():
    """Load the JSON configuration file."""
    try:
        with open(CONFIG_PATH) as f:
            return json.load(f)
    except FileNotFoundError:
        logger.error(f"Config file not found: {CONFIG_PATH}")
        sys.exit(1)
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON in config file: {e}")
        sys.exit(1)


def parse_price(price_str):
    """Extract a clean numeric price string (e.g. '1349.02') from a raw price string."""
    if not price_str:
        return None
    # Take only the part before · (e.g. "$1,349.02  ·  89% off" → "$1,349.02")
    price_part = price_str.split('·')[0]
    match = re.search(r'[\d,]+(?:\.\d+)?', price_part)
    if not match:
        return None
    try:
        return f"{float(match.group(0).replace(',', '')):.2f}"
    except ValueError:
        return None


def scrape_drug_data(url):
    """
    Scrape drug price data from the website using Playwright.

    Returns:
        List of dicts with keys: drug, price, list_price
    """
    from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

    logger.info(f"Scraping data from {url}")
    drugs = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        try:
            # Navigate to the page
            page.goto(url, wait_until="networkidle", timeout=30000)

            # Wait for content to load - look for drug listings
            page.wait_for_selector("text=Cetrotide", timeout=10000)

            # Give it a moment for all content to render
            time.sleep(2)

            # Get the page content
            content = page.content()

            # Extract drug data using Playwright's selector capabilities
            # The structure appears to be: drug name, then prices
            # We'll look for patterns of drug names followed by prices

            # Try to find drug cards or listings
            # Based on the structure, we'll look for links to /p/ pages which contain drug info
            drug_links = page.query_selector_all('a[href^="/p/"]')

            logger.info(f"Found {len(drug_links)} drug links")

            for link in drug_links:
                try:
                    href = link.get_attribute('href') or ''
                    if not href.startswith('/p/'):
                        continue

                    # Extract drug name from URL slug (reliable regardless of DOM structure)
                    slug = href.split('/p/')[-1].split('?')[0].split('/')[0]
                    if not slug:
                        continue
                    drug_name = ' '.join(word.capitalize() for word in slug.replace('-', ' ').split())

                    # Walk up the DOM to find a container with price info
                    parent_text = link.evaluate("""el => {
                        let node = el.parentElement;
                        for (let i = 0; i < 6; i++) {
                            if (!node) break;
                            const text = node.innerText || '';
                            if (text.includes('$')) return text;
                            node = node.parentElement;
                        }
                        return '';
                    }""")

                    price = None
                    list_price = None

                    if parent_text:
                        lines = [line.strip() for line in parent_text.split('\n') if line.strip()]
                        for line in lines:
                            if re.match(r'starting\s+(at|from)\s+\$', line, re.IGNORECASE):
                                # e.g. "Starting at $149.00" — this is the government price
                                if price is None:
                                    price = parse_price(line)
                            elif '·' in line and '$' in line:
                                # e.g. "$1,349.02  ·  89% off" — this is the list/original price
                                if list_price is None:
                                    list_price = parse_price(line)
                            elif line.startswith('$'):
                                # Plain price line
                                if price is None:
                                    price = parse_price(line)

                    # If only a "· X% off" line was found with no other price, its amount IS the gov price
                    if price is None and list_price is not None:
                        price = list_price
                        list_price = None

                    if drug_name and price:
                        drugs.append({
                            "drug": drug_name,
                            "price": price,
                            "list_price": list_price or "N/A"
                        })
                        logger.debug(f"Extracted: {drug_name} - {price} (was {list_price})")

                except Exception as e:
                    logger.warning(f"Error extracting drug data from link: {e}")
                    continue

        except PlaywrightTimeout:
            logger.error("Timeout waiting for page to load")
        except Exception as e:
            logger.error(f"Error during scraping: {e}")
        finally:
            browser.close()

    logger.info(f"Successfully scraped {len(drugs)} drugs")
    return drugs


def load_existing_data(csv_path):
    """
    Load existing data from CSV to avoid duplicates.

    Returns:
        Set of tuples (date, drug) for already recorded entries
    """
    existing = set()

    if not os.path.exists(csv_path):
        return existing

    try:
        with open(csv_path, 'r', newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                existing.add((row['Date'], row['Drug']))
    except Exception as e:
        logger.warning(f"Error reading existing CSV: {e}")

    return existing


def append_to_csv(csv_path, drugs, date_str):
    """
    Append drug data to CSV file, avoiding duplicates.

    Returns:
        Number of new rows added
    """
    # Load existing data
    existing = load_existing_data(csv_path)

    # Filter out duplicates
    new_drugs = []
    for drug_data in drugs:
        key = (date_str, drug_data['drug'])
        if key not in existing:
            new_drugs.append(drug_data)

    if not new_drugs:
        logger.info("No new drugs to add to CSV")
        return 0

    # Write header if file doesn't exist
    file_exists = os.path.exists(csv_path)

    with open(csv_path, 'a', newline='', encoding='utf-8') as f:
        fieldnames = ['Date', 'Drug', 'Price', 'List Price']
        writer = csv.DictWriter(f, fieldnames=fieldnames)

        if not file_exists:
            writer.writeheader()

        for drug_data in new_drugs:
            writer.writerow({
                'Date': date_str,
                'Drug': drug_data['drug'],
                'Price': drug_data['price'],
                'List Price': drug_data['list_price']
            })

    logger.info(f"Appended {len(new_drugs)} new drugs to CSV")
    return len(new_drugs)


def append_to_google_sheet(sheet_id, sheet_name, drugs, date_str):
    """
    Append drug data to Google Sheet, avoiding duplicates.

    Returns:
        Number of new rows added
    """
    try:
        import gspread
    except ImportError:
        logger.error("gspread not installed. Install with: pip install gspread")
        return 0

    try:
        gc = gspread.service_account()
        sheet = gc.open_by_key(sheet_id).worksheet(sheet_name)

        # Get existing data
        existing_rows = sheet.get_all_values()
        existing_set = set()

        if len(existing_rows) > 1:  # Has header + data
            for row in existing_rows[1:]:
                if len(row) >= 2:
                    existing_set.add((row[0], row[1]))  # (Date, Drug)

        # Filter new drugs
        new_rows = []
        for drug_data in drugs:
            key = (date_str, drug_data['drug'])
            if key not in existing_set:
                new_rows.append([
                    date_str,
                    drug_data['drug'],
                    drug_data['price'],
                    drug_data['list_price']
                ])

        if not new_rows:
            logger.info("No new drugs to add to Google Sheet")
            return 0

        # Append new rows
        sheet.append_rows(new_rows)
        logger.info(f"Appended {len(new_rows)} new drugs to Google Sheet")
        return len(new_rows)

    except Exception as e:
        logger.error(f"Error updating Google Sheet: {type(e).__name__}: {e}", exc_info=True)
        return 0


def send_telegram_notification(bot_token, chat_id, message):
    """Send notification via Telegram."""
    try:
        import requests

        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        data = {
            "chat_id": chat_id,
            "text": message,
            "parse_mode": "Markdown"
        }

        response = requests.post(url, json=data, timeout=10)

        if response.status_code == 200:
            logger.info("Telegram notification sent successfully")
        else:
            logger.error(f"Telegram notification failed: {response.status_code} - {response.text}")

    except Exception as e:
        logger.error(f"Error sending Telegram notification: {e}")


def calculate_new_drugs(drugs, csv_path):
    """
    Calculate how many drugs are truly new (never seen before).

    Returns:
        Number of new drugs
    """
    if not os.path.exists(csv_path):
        return len(drugs)

    try:
        # Get all unique drugs from CSV
        seen_drugs = set()
        with open(csv_path, 'r', newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                seen_drugs.add(row['Drug'])

        # Count how many current drugs are new
        new_count = 0
        for drug_data in drugs:
            if drug_data['drug'] not in seen_drugs:
                new_count += 1

        return new_count

    except Exception as e:
        logger.warning(f"Error calculating new drugs: {e}")
        return 0


def main():
    """Main execution function."""
    logger.info("=" * 60)
    logger.info("Starting Government RX Price Tracker")
    logger.info("=" * 60)

    # Load config
    config = load_config()

    # Get today's date
    date_str = datetime.now().strftime("%Y-%m-%d")

    # Scrape data
    drugs = scrape_drug_data(config['url'])

    if not drugs:
        logger.error("No drugs found. Scraping may have failed.")

        # Send failure notification
        if config.get('telegram_bot_token') and config.get('telegram_chat_id'):
            message = f"🚨 *GovRX Scraper Failed*\n\nDate: {date_str}\nNo drugs were captured."
            send_telegram_notification(
                config['telegram_bot_token'],
                config['telegram_chat_id'],
                message
            )

        sys.exit(1)

    # Prepare CSV path
    csv_path = os.path.join(SKILL_DIR, config['csv_file'])

    # Calculate new drugs before writing
    new_drug_count = calculate_new_drugs(drugs, csv_path)

    # Append to CSV
    new_rows_csv = append_to_csv(csv_path, drugs, date_str)

    # Append to Google Sheet if configured
    new_rows_sheet = 0
    if config.get('google_sheet_id'):
        sheet_name = config.get('google_sheet_name', 'Sheet1')
        new_rows_sheet = append_to_google_sheet(config['google_sheet_id'], sheet_name, drugs, date_str)

    # Send Telegram notification if configured
    if config.get('telegram_bot_token') and config.get('telegram_chat_id'):
        message = (
            f"✅ *GovRX Scraper Success*\n\n"
            f"Date: {date_str}\n"
            f"Drugs captured: {len(drugs)}\n"
            f"New drugs added: {new_drug_count}\n"
            f"New rows in CSV: {new_rows_csv}"
        )

        if config.get('google_sheet_id'):
            message += f"\nNew rows in Sheet: {new_rows_sheet}"

        send_telegram_notification(
            config['telegram_bot_token'],
            config['telegram_chat_id'],
            message
        )

    # Output JSON summary
    summary = {
        "success": True,
        "date": date_str,
        "drugs_captured": len(drugs),
        "new_drugs": new_drug_count,
        "new_rows_csv": new_rows_csv,
        "new_rows_sheet": new_rows_sheet if config.get('google_sheet_id') else None
    }

    print(json.dumps(summary, indent=2))

    logger.info("Script completed successfully")
    logger.info("=" * 60)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        logger.info("Script interrupted by user")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Unexpected error: {e}", exc_info=True)
        sys.exit(1)
