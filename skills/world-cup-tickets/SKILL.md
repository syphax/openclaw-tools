# world-cup-tickets

Track 2026 FIFA World Cup ticket prices on StubHub across matches, categories, and quantities.

## Usage

```bash
# Run the price scraper
python3 scripts/scrape_tickets.py
```

## What it does

Scrapes StubHub for ticket prices for configured World Cup matches. For each match, it checks prices across all configured ticket categories (1-4) and quantities (1-4), then stores the results in both a local CSV and a Google Sheet.

Each run produces one row per (date, match, category, quantity) combination.

## Configuration

- **`cfg/wct-config.yaml`** - Main config with match URLs, categories, quantities, and Google Sheet ID
- **`cfg/private-info.json`** - Reference file with raw StubHub URLs and spreadsheet link

## Output

- **CSV**: `ticket-price-history.csv` - Local append-only price history
- **Google Sheet**: Configured in `wct-config.yaml` with columns: Date, Match, Category, Quantity, Price
- **Logs**: `logs/world-cup-tickets.log`
- **stdout**: JSON summary of the run

## Dependencies

Auto-installed on first run:
- `playwright` (with Chromium browser)
- `pyyaml`
- `gspread` (for Google Sheets integration)

## Implementation

- **Script**: `scripts/scrape_tickets.py`
- **Config**: `cfg/wct-config.yaml`
- **Language**: Python 3
- **Scraping**: Playwright (headless Chromium)
- **Sheets API**: gspread with service account auth
