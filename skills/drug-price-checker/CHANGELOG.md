# Changelog - GovRX Price Tracker

## 2026-03-05 - Initial Release

### Features Implemented

#### Core Functionality
- ✅ **Web Scraping**: Playwright-based scraper for trumprx.gov/browse
  - Handles dynamic React/Next.js content
  - Extracts drug names, discounted prices, and list prices
  - Robust error handling and fallback parsing methods

- ✅ **Data Storage**:
  - CSV storage with automatic header creation
  - Deduplication: prevents duplicate entries for same drug on same date
  - Tracks truly new drugs (never seen before)

- ✅ **Google Sheets Integration** (Optional):
  - Service account authentication
  - Automatic deduplication in sheets
  - Append-only updates

- ✅ **Telegram Notifications** (Optional):
  - Success/failure notifications
  - Run statistics (drugs captured, new drugs, rows added)
  - Formatted markdown messages

- ✅ **Automation**:
  - Cron setup script for daily 3:00 AM runs
  - Automatic dependency installation
  - Comprehensive logging

#### Configuration
- JSON-based configuration file
- All optional features can be disabled
- Example Google service account template provided

#### Documentation
- Complete README with setup instructions
- SKILL.md for quick reference
- Troubleshooting guides
- Google Sheets and Telegram setup instructions

### File Structure

```
govrx/
├── cfg/
│   ├── govrx-config.json                   # Main configuration
│   └── google-service-account.json.example # Google credentials template
├── data/                                   # CSV data storage
├── logs/                                   # Application logs
├── scripts/
│   ├── scrape_drugs.py                     # Main scraper (15KB)
│   └── setup_cron.sh                       # Cron installation
├── .gitignore                              # Git ignore rules
├── CHANGELOG.md                            # This file
├── README.md                               # Comprehensive documentation
└── SKILL.md                                # Skill reference
```

### Dependencies
- playwright (with Chromium)
- requests
- gspread (optional)
- oauth2client (optional)

All auto-installed on first run.

### Technical Details
- **Language**: Python 3.7+
- **Browser**: Chromium (headless)
- **Data Format**: CSV with Date, Drug, Price, List Price columns
- **Logging**: Dual output to file and stderr
- **Exit Codes**: 0 for success, 1 for failure

### Known Limitations
- Currently supports single-page listings only (44 drugs as of 2026-03-05)
- Requires internet connection for scraping
- Google Sheets requires manual service account setup
- Telegram requires manual bot creation

### Future Considerations
- Support for multi-page pagination if drug list grows
- Price change alerts (detect when prices change)
- Historical price analysis and trending
- Export to additional formats (JSON, Excel)
- Web dashboard for visualization
