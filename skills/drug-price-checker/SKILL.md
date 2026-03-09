# govrx

Track prescription drug prices from trumprx.gov on a daily basis.

## Usage

```bash
# Run the scraper manually
python3 scripts/scrape_drugs.py

# Setup automated daily runs at 3:00 AM
bash scripts/setup_cron.sh
```

## What it does

Scrapes the trumprx.gov/browse page for prescription drug prices and stores the results in both a local CSV file and optionally a Google Sheet. The script:

1. Fetches drug listings from the website using Playwright
2. Extracts drug name, discounted price, and list price
3. Appends new data to CSV (avoiding duplicates for the same date)
4. Optionally appends to Google Sheet (if configured)
5. Sends Telegram notification with run summary (if configured)

## Configuration

**`cfg/govrx-config.json`** - Main configuration file:

```json
{
  "url": "https://trumprx.gov/browse",
  "csv_file": "data/prescription-drugs.csv",
  "google_sheet_id": "",
  "telegram_bot_token": "",
  "telegram_chat_id": ""
}
```

### Configuration Options

- **url**: The URL to scrape (default: https://trumprx.gov/browse)
- **csv_file**: Path to CSV file relative to skill directory (default: data/prescription-drugs.csv)
- **google_sheet_id**: (Optional) Google Sheet ID for cloud storage
- **telegram_bot_token**: (Optional) Telegram bot token for notifications
- **telegram_chat_id**: (Optional) Telegram chat ID for notifications

### Google Sheets Setup (Optional)

To enable Google Sheets integration:

1. Create a Google Cloud project and enable the Google Sheets API
2. Create a service account and download the JSON key file
3. Save the key file as `cfg/google-service-account.json`
4. Share your Google Sheet with the service account email
5. Add the Sheet ID to `cfg/govrx-config.json`

### Telegram Notifications (Optional)

To enable Telegram notifications:

1. Create a bot via [@BotFather](https://t.me/botfather) and get the bot token
2. Get your chat ID (send a message to your bot, then visit `https://api.telegram.org/bot<TOKEN>/getUpdates`)
3. Add both values to `cfg/govrx-config.json`

## Output

### CSV Format
**File**: `data/prescription-drugs.csv`

Columns:
- **Date**: Date of data collection (YYYY-MM-DD)
- **Drug**: Drug name (e.g., "Cetrotide®")
- **Price**: Discounted price (e.g., "$22.50")
- **List Price**: Original list price (e.g., "$316.12")

### Telegram Notification

When configured, sends a message like:

```
✅ GovRX Scraper Success

Date: 2026-03-05
Drugs captured: 44
New drugs added: 2
New rows in CSV: 44
New rows in Sheet: 44
```

### JSON Output

The script outputs a JSON summary to stdout:

```json
{
  "success": true,
  "date": "2026-03-05",
  "drugs_captured": 44,
  "new_drugs": 2,
  "new_rows_csv": 44,
  "new_rows_sheet": 44
}
```

## Deduplication

The script prevents duplicate entries:
- Same drug on the same date will not be added twice
- Existing data is checked before appending
- "New drugs" count tracks drugs never seen before in the CSV

## Dependencies

Auto-installed on first run:
- `playwright` (with Chromium browser)
- `requests` (for Telegram notifications)
- `gspread` (if Google Sheets is configured)

## Implementation

- **Main Script**: `scripts/scrape_drugs.py`
- **Config**: `cfg/govrx-config.json`
- **Cron Setup**: `scripts/setup_cron.sh`
- **Language**: Python 3
- **Scraping**: Playwright (headless Chromium)
- **Sheets API**: gspread with service account auth

## Logs

- **Application Log**: `logs/govrx.log`
- **Cron Log**: `logs/cron.log` (if running via cron)

## Troubleshooting

### No drugs captured
- Check if the website structure has changed
- Review logs in `logs/govrx.log`
- Try running with `DEBUG=1 python3 scripts/scrape_drugs.py`

### Google Sheets not updating
- Verify service account JSON exists at `cfg/google-service-account.json`
- Ensure the Sheet is shared with the service account email
- Check that the Sheet ID in config is correct

### Telegram notifications not working
- Verify bot token and chat ID are correct
- Test with: `curl "https://api.telegram.org/bot<TOKEN>/getMe"`
- Ensure your bot can send messages to the chat

## Manual Testing

```bash
# Test scraper
python3 scripts/scrape_drugs.py

# Check output
cat data/prescription-drugs.csv

# View logs
tail -f logs/govrx.log
```
