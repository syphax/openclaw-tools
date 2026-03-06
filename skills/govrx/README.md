# Government RX Price Tracker

A Python-based scraper that tracks prescription drug prices from [trumprx.gov](https://trumprx.gov/browse) on a daily basis. Stores data in CSV format with optional Google Sheets integration and Telegram notifications.

## Quick Start

### 1. Basic Setup

```bash
# Navigate to the skill directory
cd skills/govrx

# Run the scraper once to test
python3 scripts/scrape_drugs.py
```

The first run will automatically:
- Install required dependencies (playwright, requests)
- Download Chromium browser for Playwright
- Create the CSV file at `data/prescription-drugs.csv`

### 2. Configure (Optional)

Edit `cfg/govrx-config.json`:

```json
{
  "url": "https://trumprx.gov/browse",
  "csv_file": "data/prescription-drugs.csv",
  "google_sheet_id": "YOUR_SHEET_ID_HERE",
  "telegram_bot_token": "YOUR_BOT_TOKEN_HERE",
  "telegram_chat_id": "YOUR_CHAT_ID_HERE"
}
```

### 3. Setup Daily Automation

```bash
# Install cron job to run daily at 3:00 AM
bash scripts/setup_cron.sh
```

## Features

- ✅ **Automated Scraping**: Uses Playwright to handle dynamic content
- ✅ **Duplicate Prevention**: Won't add the same drug twice for the same date
- ✅ **CSV Storage**: Local append-only storage
- ✅ **Google Sheets Integration**: Optional cloud storage (requires setup)
- ✅ **Telegram Notifications**: Daily run summaries via Telegram bot
- ✅ **New Drug Detection**: Tracks when drugs appear for the first time
- ✅ **Comprehensive Logging**: All runs logged to `logs/govrx.log`

## Data Format

### CSV Columns

| Date       | Drug        | Price   | List Price |
|------------|-------------|---------|------------|
| 2026-03-05 | Cetrotide®  | $22.50  | $316.12    |
| 2026-03-05 | Ozempic®    | $145.00 | $968.52    |

### Output JSON

Each run outputs a summary:

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

## Advanced Setup

### Google Sheets Integration

1. **Create a Google Cloud Project**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing one

2. **Enable Google Sheets API**
   - Navigate to "APIs & Services" > "Library"
   - Search for "Google Sheets API"
   - Click "Enable"

3. **Create Service Account**
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "Service Account"
   - Fill in the details and create
   - Click on the created service account
   - Go to "Keys" tab > "Add Key" > "Create New Key"
   - Choose "JSON" and download

4. **Setup Credentials**
   ```bash
   # Save the downloaded JSON as:
   cp ~/Downloads/your-project-*.json cfg/google-service-account.json
   ```

5. **Share Your Sheet**
   - Open the service account JSON
   - Copy the `client_email` value (looks like: `name@project.iam.gserviceaccount.com`)
   - Share your Google Sheet with this email (Editor access)

6. **Get Sheet ID**
   - Open your Google Sheet
   - Copy the ID from the URL: `https://docs.google.com/spreadsheets/d/SHEET_ID_HERE/edit`
   - Add it to `cfg/govrx-config.json`

### Telegram Notifications

1. **Create a Bot**
   - Message [@BotFather](https://t.me/botfather) on Telegram
   - Send `/newbot` and follow instructions
   - Copy the bot token (looks like: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

2. **Get Your Chat ID**
   - Start a chat with your bot (send any message)
   - Visit: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
   - Look for `"chat":{"id":123456789}` in the response
   - Copy the chat ID

3. **Update Config**
   ```json
   {
     "telegram_bot_token": "123456789:ABCdefGHIjklMNOpqrsTUVwxyz",
     "telegram_chat_id": "123456789"
   }
   ```

## File Structure

```
govrx/
├── cfg/
│   ├── govrx-config.json              # Main configuration
│   └── google-service-account.json    # Google credentials (optional)
├── data/
│   └── prescription-drugs.csv         # Price history data
├── logs/
│   ├── govrx.log                      # Application logs
│   └── cron.log                       # Cron execution logs
├── scripts/
│   ├── scrape_drugs.py                # Main scraper script
│   └── setup_cron.sh                  # Cron installation script
├── SKILL.md                           # Skill documentation
└── README.md                          # This file
```

## Monitoring

### View Recent Runs

```bash
# Last 20 lines of application log
tail -20 logs/govrx.log

# Follow log in real-time
tail -f logs/govrx.log

# View cron log
tail -20 logs/cron.log
```

### Check Cron Job

```bash
# List all cron jobs
crontab -l

# Edit cron jobs
crontab -e
```

### Test Run

```bash
# Run scraper manually
cd /Users/bcc/Code/git/openclaw-tools/skills/govrx
python3 scripts/scrape_drugs.py

# Run with verbose output
python3 scripts/scrape_drugs.py 2>&1 | tee test-run.log
```

## Troubleshooting

### Issue: "No drugs found"

**Possible causes:**
- Website structure has changed
- Network timeout
- Playwright browser not installed

**Solutions:**
```bash
# Reinstall Playwright browsers
python3 -m playwright install chromium

# Check if site is accessible
curl -I https://trumprx.gov/browse

# Run with detailed logs
tail -100 logs/govrx.log
```

### Issue: Google Sheets not updating

**Checklist:**
- [ ] Service account JSON exists at `cfg/google-service-account.json`
- [ ] Sheet is shared with service account email
- [ ] Sheet ID in config is correct
- [ ] Internet connection is working

**Test connection:**
```bash
# Check if gspread is installed
python3 -c "import gspread; print('OK')"

# Verify service account file
cat cfg/google-service-account.json | python3 -m json.tool
```

### Issue: Telegram not sending

**Checklist:**
- [ ] Bot token is correct
- [ ] Chat ID is correct
- [ ] Bot has been started (sent at least one message)

**Test manually:**
```bash
# Replace TOKEN and CHAT_ID
curl -X POST "https://api.telegram.org/botTOKEN/sendMessage" \
  -d "chat_id=CHAT_ID" \
  -d "text=Test message"
```

### Issue: Cron job not running

**Checklist:**
- [ ] Cron service is running: `pgrep cron`
- [ ] Job is in crontab: `crontab -l`
- [ ] Script has execute permissions: `ls -l scripts/scrape_drugs.py`
- [ ] Python path is correct in cron entry

**Check cron logs:**
```bash
# View cron execution log
tail -50 logs/cron.log

# System cron logs (varies by OS)
# macOS:
tail -50 /var/log/system.log | grep cron

# Linux:
tail -50 /var/log/syslog | grep CRON
```

## Maintenance

### Update Dependencies

```bash
# Update pip packages
python3 -m pip install --upgrade playwright requests gspread

# Update Playwright browsers
python3 -m playwright install chromium
```

### Backup Data

```bash
# Backup CSV
cp data/prescription-drugs.csv data/prescription-drugs-backup-$(date +%Y%m%d).csv

# Backup config
cp cfg/govrx-config.json cfg/govrx-config.json.backup
```

### Clear Logs

```bash
# Truncate logs (keeps file, clears content)
> logs/govrx.log
> logs/cron.log
```

## Development

### Testing Locally

```bash
# Run scraper without cron
python3 scripts/scrape_drugs.py

# Check CSV output
cat data/prescription-drugs.csv | tail -10

# Validate JSON output
python3 scripts/scrape_drugs.py | python3 -m json.tool
```

### Debug Mode

Set `DEBUG=1` to get more verbose output:

```bash
DEBUG=1 python3 scripts/scrape_drugs.py
```

### Modifying Scraper Logic

The main scraping logic is in `scripts/scrape_drugs.py` in the `scrape_drug_data()` function. If the website structure changes, you'll need to update the selectors and parsing logic there.

## Dependencies

- **Python 3.7+**
- **playwright**: Web scraping with Chromium
- **requests**: HTTP client for Telegram API
- **gspread** (optional): Google Sheets integration
- **oauth2client** (optional): Google authentication

All dependencies are auto-installed on first run.

## License

Part of the openclaw-tools repository. See repository LICENSE for details.

## Support

For issues or questions:
- Check the logs: `logs/govrx.log`
- Review this README
- Check `SKILL.md` for technical details
