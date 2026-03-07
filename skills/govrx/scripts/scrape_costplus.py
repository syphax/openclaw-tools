#!/usr/bin/env python3
"""
Cost Plus Drugs Scraper - Scrapes costplusdrugs.com for prescription drug prices
via their GraphQL API, and stores results in a CSV file and Google Sheet.

Columns: Date, Category, Medication, Form, Retail, Home Delivery, Savings
Dedup key: (Date, Medication, Form)
"""

import csv
import json
import logging
import os
import subprocess
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
LOG_PATH = os.path.join(LOG_DIR, "costplus.log")

GRAPHQL_URL = "https://www.costplusdrugs.com/graphql/"
PAGE_SIZE = 100

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
logger = logging.getLogger("costplus")

COLLECTIONS_QUERY = """
query GetCollections($first: Int, $channel: String) {
  collections(first: $first, channel: $channel) {
    edges {
      node {
        id
        name
        slug
      }
    }
  }
}
"""

PRODUCTS_QUERY = """
query GetAllProducts($first: Int, $direction: OrderDirection!, $productOrderField: ProductOrderField!, $collection: [ID!], $channel: String, $offset: Int) {
  products(
    first: $first
    channel: $channel
    sortBy: {direction: $direction, field: $productOrderField}
    filter: {collections: $collection}
    offset: $offset
  ) {
    edges {
      node {
        name
        collections { name }
        priceCalculation
        retailPrice
        variants {
          metafields(keys: ["form", "retailPricePerUnit", "is_active"])
        }
      }
    }
    totalCount
    pageInfo { hasNextPage }
  }
}
"""


def ensure_dependencies():
    """Auto-install required packages if not available."""
    deps = {"requests": "requests"}

    try:
        config = load_config()
        if config.get("google_sheet_id"):
            deps["gspread"] = "gspread"
    except Exception:
        pass

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


def graphql_post(payload, retries=3):
    """POST a GraphQL payload; returns parsed JSON. Retries on transient errors."""
    import requests

    headers = {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; CostPlusDrugsScraper/1.0)",
    }

    for attempt in range(1, retries + 1):
        try:
            response = requests.post(
                GRAPHQL_URL, json=payload, headers=headers, timeout=30
            )
            response.raise_for_status()
            data = response.json()
            if "errors" in data:
                logger.warning(f"GraphQL errors: {data['errors']}")
            return data
        except Exception as e:
            if attempt == retries:
                raise
            logger.warning(f"Request failed (attempt {attempt}/{retries}): {e}. Retrying...")
            time.sleep(2 * attempt)


def fetch_collections():
    """Fetch all drug categories from the GraphQL collections endpoint."""
    payload = {
        "operationName": "GetCollections",
        "variables": {"first": 200, "channel": "default-channel"},
        "query": COLLECTIONS_QUERY,
    }
    data = graphql_post(payload)
    edges = data["data"]["collections"]["edges"]
    collections = [
        {"id": e["node"]["id"], "name": e["node"]["name"], "slug": e["node"]["slug"]}
        for e in edges
    ]
    logger.info(f"Found {len(collections)} categories")
    return collections


def fetch_products_for_collection(collection_id, collection_name):
    """Fetch all products for a collection, paginating with offset."""
    rows = []
    offset = 0

    while True:
        payload = {
            "operationName": "GetAllProducts",
            "variables": {
                "first": PAGE_SIZE,
                "direction": "ASC",
                "productOrderField": "NAME",
                "collection": [collection_id],
                "channel": "default-channel",
                "offset": offset,
            },
            "query": PRODUCTS_QUERY,
        }
        data = graphql_post(payload)
        products_data = data["data"]["products"]
        edges = products_data["edges"]
        total = products_data["totalCount"]

        for edge in edges:
            node = edge["node"]
            # Product-level prices (package price, not per-unit)
            retail_raw = node.get("retailPrice")
            home_delivery_raw = node.get("priceCalculation")

            retail = float(retail_raw) if retail_raw is not None else None
            home_delivery = float(home_delivery_raw) if home_delivery_raw is not None else None
            savings = round(retail - home_delivery, 2) if retail is not None and home_delivery is not None else None

            seen_forms = set()
            for variant in node.get("variants", []):
                meta = variant.get("metafields") or {}
                if meta.get("is_active") == "false":
                    continue

                form = meta.get("form") or ""

                # Skip duplicate (medication, form) within the same product
                if form in seen_forms:
                    continue
                seen_forms.add(form)

                rows.append({
                    "category": collection_name,
                    "medication": node["name"],
                    "form": form,
                    "retail": f"{retail:.2f}" if retail is not None else "",
                    "home_delivery": f"{home_delivery:.2f}" if home_delivery is not None else "",
                    "savings": f"{savings:.2f}" if savings is not None else "",
                })

        offset += len(edges)
        if offset >= total or not edges:
            break

    return rows


def scrape_all(date_str):
    """
    Scrape all categories and their drugs.

    Deduplicates by (Medication, Form) across categories — when a drug belongs
    to multiple collections (e.g. Premarin in both "Hormone Therapy" and
    "Women's Health"), only the first category encountered is kept.

    Returns: (all_rows, categories_count)
    """
    collections = fetch_collections()
    all_rows = []
    seen_med_form = set()  # Global dedup across categories

    for coll in collections:
        logger.info(f"Scraping category: {coll['name']} ({coll['id']})")
        try:
            rows = fetch_products_for_collection(coll["id"], coll["name"])
            unique_rows = []
            for r in rows:
                key = (r["medication"], r["form"])
                if key not in seen_med_form:
                    seen_med_form.add(key)
                    unique_rows.append(r)
            skipped = len(rows) - len(unique_rows)
            if skipped:
                logger.info(f"  → {len(unique_rows)} variants in '{coll['name']}' ({skipped} cross-category duplicates skipped)")
            else:
                logger.info(f"  → {len(unique_rows)} variants in '{coll['name']}'")
            all_rows.extend(unique_rows)
        except Exception as e:
            logger.error(f"Error scraping '{coll['name']}': {e}")

    return all_rows, len(collections)


def load_existing_data(csv_path):
    """Load (Date, Medication, Form) tuples from existing CSV for dedup."""
    existing = set()
    if not os.path.exists(csv_path):
        return existing
    try:
        with open(csv_path, "r", newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                existing.add((row["Date"], row["Medication"], row["Form"]))
    except Exception as e:
        logger.warning(f"Error reading existing CSV: {e}")
    return existing


def count_historically_new(rows, csv_path):
    """Count rows whose (Medication, Form) combination has never been seen before."""
    seen = set()
    if os.path.exists(csv_path):
        try:
            with open(csv_path, "r", newline="", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    seen.add((row["Medication"], row["Form"]))
        except Exception as e:
            logger.warning(f"Error reading CSV for new-drug count: {e}")

    return sum(1 for r in rows if (r["medication"], r["form"]) not in seen)


def append_to_csv(csv_path, rows, date_str):
    """Append new rows to CSV, skipping duplicates. Returns count of rows added."""
    existing = load_existing_data(csv_path)
    new_rows = []
    seen_in_batch = set()
    for r in rows:
        key = (date_str, r["medication"], r["form"])
        if key not in existing and key not in seen_in_batch:
            new_rows.append(r)
            seen_in_batch.add(key)

    if not new_rows:
        logger.info("No new rows to add to CSV")
        return 0

    file_exists = os.path.exists(csv_path)
    fieldnames = ["Date", "Category", "Medication", "Form", "Retail", "Home Delivery", "Savings"]

    with open(csv_path, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        if not file_exists:
            writer.writeheader()
        for r in new_rows:
            writer.writerow({
                "Date": date_str,
                "Category": r["category"],
                "Medication": r["medication"],
                "Form": r["form"],
                "Retail": r["retail"],
                "Home Delivery": r["home_delivery"],
                "Savings": r["savings"],
            })

    logger.info(f"Appended {len(new_rows)} new rows to CSV")
    return len(new_rows)


def append_to_google_sheet(sheet_id, sheet_name, rows, date_str):
    """Append new rows to Google Sheet, skipping duplicates. Returns count added."""
    try:
        import gspread
    except ImportError:
        logger.error("gspread not installed")
        return 0

    try:
        gc = gspread.service_account()
        sheet = gc.open_by_key(sheet_id).worksheet(sheet_name)

        existing_rows = sheet.get_all_values()
        existing_set = set()
        if len(existing_rows) > 1:
            for row in existing_rows[1:]:
                if len(row) >= 3:
                    existing_set.add((row[0], row[2], row[3]))  # Date, Medication, Form

        new_sheet_rows = []
        for r in rows:
            key = (date_str, r["medication"], r["form"])
            if key not in existing_set:
                new_sheet_rows.append([
                    date_str,
                    r["category"],
                    r["medication"],
                    r["form"],
                    r["retail"],
                    r["home_delivery"],
                    r["savings"],
                ])

        if not new_sheet_rows:
            logger.info("No new rows to add to Google Sheet")
            return 0

        sheet.append_rows(new_sheet_rows)
        logger.info(f"Appended {len(new_sheet_rows)} rows to Google Sheet")
        return len(new_sheet_rows)

    except Exception as e:
        logger.error(f"Error updating Google Sheet: {type(e).__name__}: {e}", exc_info=True)
        return 0


def send_telegram_notification(bot_token, chat_id, message):
    """Send a Telegram notification."""
    try:
        import requests

        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        response = requests.post(
            url,
            json={"chat_id": chat_id, "text": message, "parse_mode": "Markdown"},
            timeout=10,
        )
        if response.status_code == 200:
            logger.info("Telegram notification sent")
        else:
            logger.error(f"Telegram failed: {response.status_code} - {response.text}")
    except Exception as e:
        logger.error(f"Error sending Telegram notification: {e}")


def main():
    logger.info("=" * 60)
    logger.info("Starting Cost Plus Drugs Scraper")
    logger.info("=" * 60)

    config = load_config()
    ensure_dependencies()

    date_str = datetime.now().strftime("%Y-%m-%d")
    csv_path = os.path.join(SKILL_DIR, "data", "cost-plus-drugs.csv")

    rows, categories_count = scrape_all(date_str)

    if not rows:
        logger.error("No data scraped. Aborting.")
        if config.get("telegram_bot_token") and config.get("telegram_chat_id"):
            send_telegram_notification(
                config["telegram_bot_token"],
                config["telegram_chat_id"],
                f"🚨 *Cost Plus Drugs Scraper Failed*\n\nDate: {date_str}\nNo data was captured.",
            )
        sys.exit(1)

    new_drugs_count = count_historically_new(rows, csv_path)
    new_rows_csv = append_to_csv(csv_path, rows, date_str)

    new_rows_sheet = 0
    if config.get("google_sheet_id"):
        sheet_name = config.get("google_sheet_name_cpd", "CostPlusDrugs")
        new_rows_sheet = append_to_google_sheet(
            config["google_sheet_id"], sheet_name, rows, date_str
        )

    if config.get("telegram_bot_token") and config.get("telegram_chat_id"):
        message = (
            f"✅ *Cost Plus Drugs Scraper Success*\n\n"
            f"Date: {date_str}\n"
            f"Categories scanned: {categories_count}\n"
            f"Drug variants found: {len(rows)}\n"
            f"New drug/form combinations: {new_drugs_count}\n"
            f"New rows in CSV: {new_rows_csv}"
        )
        if config.get("google_sheet_id"):
            message += f"\nNew rows in Sheet: {new_rows_sheet}"
        send_telegram_notification(
            config["telegram_bot_token"], config["telegram_chat_id"], message
        )

    summary = {
        "success": True,
        "date": date_str,
        "categories_scanned": categories_count,
        "variants_found": len(rows),
        "new_drug_forms": new_drugs_count,
        "new_rows_csv": new_rows_csv,
        "new_rows_sheet": new_rows_sheet if config.get("google_sheet_id") else None,
    }
    print(json.dumps(summary, indent=2))

    logger.info("Script completed successfully")
    logger.info("=" * 60)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        logger.info("Interrupted by user")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Unexpected error: {e}", exc_info=True)
        sys.exit(1)
