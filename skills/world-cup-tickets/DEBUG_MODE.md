# Debug Mode for World Cup Ticket Scraper

## Overview
The scraper now includes a comprehensive debug mode that captures screenshots, HTML content, network requests, and JavaScript state to help diagnose scraping issues.

## Enabling Debug Mode

Set the `DEBUG` environment variable to enable debug mode:

```bash
DEBUG=1 python3 scripts/scrape_tickets.py
```

Or:

```bash
export DEBUG=1
python3 scripts/scrape_tickets.py
```

## What Debug Mode Does

When debug mode is enabled, the script will:

1. **Run in Headed Mode**: Browser window will be visible so you can watch the scraping
2. **Save Screenshots**: Full-page screenshots for each URL scraped
3. **Save HTML Content**: Complete HTML of each page
4. **Capture Network Requests**: All API responses containing listing data
5. **Extract JavaScript State**: Global variables like `window.__NEXT_DATA__`
6. **Enhanced Logging**: DEBUG-level log messages showing detailed extraction attempts

## Debug Artifacts Location

All debug artifacts are saved to: `./debug/`

Files include:
- `screenshot_<match>_q<qty>_<timestamp>.png` - Full page screenshots
- `page_<match>_q<qty>_<timestamp>.html` - HTML content
- `network_<hash>_<timestamp>.json` - Captured API responses
- `next_data_<timestamp>.json` - Next.js data structure
- `__INITIAL_STATE__<timestamp>.json` - Other JS state variables

## Extraction Strategy

The scraper tries multiple strategies in order:

1. **Network Interception** (Most Reliable)
   - Captures API responses containing listing data
   - Parses JSON to extract category and price information

2. **JavaScript State Extraction**
   - Extracts data from `window.__NEXT_DATA__`
   - Checks other global state variables

3. **DOM Scraping** (Fallback)
   - Searches for category text in HTML elements
   - Extracts prices from nearby elements

## Retry Logic

The scraper will automatically retry failed extractions up to 3 times with exponential backoff:
- Attempt 1: Immediate
- Attempt 2: Wait 5 seconds
- Attempt 3: Wait 10 seconds

## Using Debug Artifacts

If scraping fails:

1. Check the screenshots to see what the page looks like
2. Examine the HTML to verify the page loaded correctly
3. Look at network JSON files to see what API data was captured
4. Check JavaScript state files to see if data is in `__NEXT_DATA__`

This information will help identify:
- If the page is loading correctly
- If category/price data is available
- Where in the page structure the data lives
- If the extraction logic needs adjustment

## Google Sheets Integration

The scraper writes to the **"Prices"** sheet as configured in `cfg/wct-config.yaml`.

Make sure:
- Service account credentials are properly configured
- The spreadsheet ID is correct
- The "Prices" worksheet exists in the spreadsheet

## Example Debug Output

```
==========================================================
DEBUG MODE ENABLED
Debug artifacts will be saved to: ./debug
==========================================================
2026-02-24 10:30:15 [INFO] Processing match: M9
2026-02-24 10:30:15 [INFO] Fetching: https://www.stubhub.com/... (attempt 1)
2026-02-24 10:30:18 [DEBUG] Captured response from: https://api.stubhub.com/...
2026-02-24 10:30:18 [DEBUG] Saved network response to ./debug/network_1234_1708776618.json
2026-02-24 10:30:20 [DEBUG] Saved screenshot to ./debug/screenshot_M9_q1_1708776620.png
2026-02-24 10:30:20 [DEBUG] Saved HTML to ./debug/page_M9_q1_1708776620.html
2026-02-24 10:30:20 [DEBUG]   Found from network data - Category 1: $250.00
2026-02-24 10:30:20 [INFO] Successfully extracted 4 categories from network data
2026-02-24 10:30:20 [INFO]   Category 1: $250.00
2026-02-24 10:30:20 [INFO]   Category 2: $180.00
2026-02-24 10:30:20 [INFO]   Category 3: $120.00
2026-02-24 10:30:20 [INFO]   Category 4: $85.00
```

## Tips

- Review debug artifacts in the `./debug/` directory after a run
- Screenshots help verify the page loaded correctly
- Network JSON files show the actual API data available
- Check log timestamps to correlate files with specific scraping attempts
- Clean up old debug files periodically as they can accumulate
