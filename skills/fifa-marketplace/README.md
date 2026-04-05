# FIFA Marketplace — Resale Ticket Scraper

Semi-manual tool for pulling seat-level ticket data from the FIFA World Cup 2026 official resale marketplace (`fwc26-resale-usd.tickets.fifa.com`).

The site has aggressive bot detection, so the script uses your real browser session cookies rather than browser automation. You log in manually, copy your cookies, and the script handles the rest via plain HTTP requests.

## Prerequisites

- Python 3.10+
- A FIFA tickets account with access to the resale marketplace

Install dependencies (from the `fifa-marketplace/` directory):

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## First-time setup

There are two one-time setup steps: providing session cookies and building the match list.

### 1. Get your session cookies

1. Open your browser and go to `https://fwc26-resale-usd.tickets.fifa.com`
2. Log in (you'll need to complete email verification)
3. Open DevTools (F12) > **Network** tab
4. Click on any request to `fwc26-resale-usd.tickets.fifa.com`
5. Find the **Cookie** request header and copy the entire value

On first run the script will prompt you to paste this string. It gets saved to `cfg/cookies.txt` for reuse.

### 2. Build the match list

The FIFA tickets page is a React SPA, so match data can't be fetched via HTTP. You need to provide the rendered HTML once:

1. In your browser, go to `https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/tickets`
2. Wait for the full match list to load
3. Open DevTools > **Console** tab and run:
   ```js
   copy(document.documentElement.outerHTML)
   ```
4. Paste the clipboard contents into `cfg/event-page.html`

On first run (when `cfg/matches.json` doesn't exist), the script will parse this HTML and cache the match list. Delete `cfg/matches.json` to regenerate it.

## Running the scraper

```bash
source venv/bin/activate
python3 scripts/scrape_fifa_resale_cookies.py
```

The script will:
1. Validate your session cookies
2. Load the cached match list
3. Show available matches and prompt you to select which to scrape

### Selecting matches

At the selection prompt you can enter:
- Individual numbers: `1,3,5`
- Ranges: `10-20` (matches 10 through 20 inclusive)
- Open ranges: `-10` (first 10), `20-` (20 through the end)
- Mix: `1,3,10-20,50-`
- `all` for everything, `q` to quit

### Flags

| Flag | Description |
|------|-------------|
| `--new-cookies` | Force re-paste of cookies (use when session expires) |

Set `DEBUG=1` to enable verbose logging and save raw API responses to `debug/`.

## Output

Each run produces two CSV files:

- `data/fifa-resale-tickets-YYYY-MM-DD-HH-MM.csv` — timestamped snapshot
- `data/fifa-resale-tickets.csv` — combined/appended across all runs

CSV columns:

| Column | Description |
|--------|-------------|
| Pull Date | Date of the data pull (YYYY-MM-DD) |
| Pull Time | Time of the data pull (HH:MM) |
| Match | Match code (M001-M104) |
| Category | Seat category (e.g. CAT1, CAT2) |
| Section | Section/block name |
| Area | Area name |
| Row | Row identifier |
| Seat | Seat number |
| Raw Amount | Raw price from API (thousandths of dollars) |
| Price | Base price in USD (Raw Amount / 1000) |
| Price w/ Fees | Price including FIFA's 15% service fee |
| Location | Stadium name (e.g. "Boston Stadium") |

There is also a helper script to export the match list:

```bash
python3 scripts/matches_to_csv.py
```

This writes `data/matches.csv` from `cfg/matches.json`.

## CAPTCHA / rate limiting

The site will eventually trigger a CAPTCHA if it detects too many requests. The script adds random delays between tiles (0.4-1.2s) and between matches (8-12s) to reduce this risk.

If a CAPTCHA is triggered, the script hard-stops immediately and reports which match it was on and the last match completed successfully. To resume:

1. Re-login in your browser (the CAPTCHA will have invalidated your session)
2. Copy fresh cookies
3. Re-run with `--new-cookies` and select the remaining matches using a range (e.g. `15-` to resume from match 15)

## File layout

```
fifa-marketplace/
  cfg/
    fifa-marketplace-config.json   # API endpoints and parameters
    matches.json                   # Cached match list (generated, gitignored content)
    cookies.txt                    # Session cookies (gitignored)
    event-page.html                # Rendered HTML for match parsing (gitignored)
  data/
    fifa-resale-tickets.csv        # Combined results (gitignored)
    fifa-resale-tickets-*.csv      # Timestamped snapshots (gitignored)
    matches.csv                    # Match list export (gitignored)
  scripts/
    scrape_fifa_resale_cookies.py  # Main scraper
    matches_to_csv.py              # Match list CSV exporter
  logs/
    fifa-marketplace.log           # Scraper log
  debug/                           # Raw API responses (when DEBUG=1)
  requirements.txt
```
