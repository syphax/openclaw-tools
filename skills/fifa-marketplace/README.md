# FIFA Marketplace — Resale Ticket Scraper

Pulls seat-level ticket data from the FIFA World Cup 2026 official resale marketplace (`fwc26-resale-usd.tickets.fifa.com`).

The site has aggressive bot detection (DataDome). Rather than making direct HTTP requests, the tool uses a Chrome extension running in your real browser session. The extension intercepts the seatmap tile API responses that the page itself makes as you browse, then forwards them to a local Python server which writes them to CSV.

## How it works

There are two moving parts that run together:

**Chrome extension** — loaded into your regular Chrome profile, already logged in. It has three layers:
- `injected.js` (MAIN world) — wraps `window.fetch` to intercept seatmap tile API calls (`/tnwr/v1/secure/seatmap/seats/free/ol`). Runs in the page's own JS context, invisible to DataDome.
- `content.js` (ISOLATED world) — receives intercepted tile data via `CustomEvent` and relays it to the background worker. Also drives the autopan logic that physically pans the seatmap to trigger tile loads.
- `background.js` (service worker) — orchestrates match cycling (navigate → settle → autopan → next match), relays tile data to the local Python server, and records match completions.

**`data_receiver.py`** — a local HTTP server on port 7227. Passively receives tile data from the extension and writes it to CSV. Also serves `cfg/matches.json` back to the extension so the popup can display the match list.

### Autopan design

When the extension navigates to a match seatmap, it performs a human-mimicking pan sequence to sweep the entire stadium and trigger all tile loads:

- **Pre-map browsing** — scrolls the page slightly before touching the map (~2s)
- **Mouse approach** — moves the cursor from a random position on the map to the drag start point with eased movement, so the first event on the map is never a cold `mousedown`
- **Randomized zoom-out** — 3-9 scroll events (varying center and delta), with a 30% chance of an over-scroll + correction
- **Variable coverage grid** — rows (3-4) and columns (2-3) chosen randomly each run; starting side (left or right) also randomized
- **Hesitations** — 18% chance per grid position of a 0.6-1.8s pause mid-pan
- **Bezier drag paths** — all mouse drags follow a slightly curved path with ease-in/out timing

### Cycle stealth

- **Shuffled match order** — matches are processed in random order each run, not sequentially
- **Skewed between-match delays** — mostly 4-8s, occasionally up to 18s
- **Session breaks** — every 7-12 matches, the cycle pauses 60-90s before continuing
- **Completion tracking** — finished matches are written to `data/match-completions.json` (with timestamps). On restart, any match done in the past 6 hours is automatically skipped and shown as unchecked in the popup.

## Setup

### Prerequisites

- Python 3.10+
- Chrome (with a FIFA tickets account logged in)

Install Python dependencies (from the `fifa-marketplace/` directory):

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Install the extension

1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select `skills/fifa-marketplace/extension/`

### Build the match list

The match list is stored in `cfg/matches.json`. If it doesn't exist or is stale, regenerate it:

1. In Chrome, go to `https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/tickets`
2. Wait for the full match list to load
3. Open DevTools > **Console** and run:
   ```js
   copy(document.documentElement.outerHTML)
   ```
4. Paste the clipboard into `cfg/event-page.html`
5. Run the parser (TBD — currently matches.json is maintained manually or via a separate parse step)

## Running

Start the receiver first, then use the extension popup to run the cycle:

```bash
source venv/bin/activate
python3 scripts/data_receiver.py
```

Then open the extension popup:

1. Click **Load** to fetch the match list from the receiver
2. Adjust selection (sold-out matches are pre-unchecked; recently-done matches are grayed out)
3. Click **Run Selected** — the extension cycles through all selected matches automatically

You can also click **Start Autopan** to manually pan the current tab without cycling.

## Output

Each run produces two CSV files:

- `data/fifa-resale-tickets-YYYY-MM-DD-HH-MM.csv` — snapshot for this run
- `data/fifa-resale-tickets.csv` — combined across all runs (appended)

CSV columns:

| Column | Description |
|--------|-------------|
| Pull Date | Date of the data pull (YYYY-MM-DD) |
| Pull Time | Time of the data pull (HH:MM) |
| Match | Match code (e.g. M001) or performance ID |
| Category | Seat category (e.g. CAT1, CAT2) |
| Section | Block/section name |
| Area | Area name |
| Row | Row identifier |
| Seat | Seat number |
| Raw Amount | Raw price from API (thousandths of dollars) |
| Price | Base price in USD (Raw Amount / 1000) |
| Price w/ Fees | Price with FIFA's 15% service fee |
| Location | Stadium / city |

There is also a helper script to export the match list to CSV:

```bash
python3 scripts/matches_to_csv.py
```

## File layout

```
fifa-marketplace/
  cfg/
    matches.json                        # Match list with performance IDs (gitignored content)
    event-page.html                     # Source HTML for match parsing (gitignored)
  data/
    fifa-resale-tickets.csv             # Combined results (gitignored)
    fifa-resale-tickets-*.csv           # Per-run snapshots (gitignored)
    match-completions.json              # Completion timestamps for restart filtering (gitignored)
    matches.csv                         # Match list export (gitignored)
  extension/
    manifest.json                       # MV3 Chrome extension manifest
    injected.js                         # fetch() interceptor (MAIN world)
    content.js                          # Autopan driver + tile relay (ISOLATED world)
    background.js                       # Cycle orchestrator + tile forwarder (service worker)
    popup.html / popup.js               # Extension popup UI
  scripts/
    data_receiver.py                    # Local HTTP server (port 7227) — main entry point
    matches_to_csv.py                   # Match list CSV exporter
    fifa-resale-analysis-1.py           # Offline analysis of collected data
  logs/
    fifa-marketplace.log                # Receiver log
  debug/                                # Raw API responses for debugging
  requirements.txt
```

## Bot detection notes

The site uses DataDome. Known signals it watches for:
- Cold `mousedown` with no prior cursor movement on the element
- Perfectly straight or mechanically timed mouse paths
- Consistent session fingerprint (same pattern every match)
- Too-regular timing between actions

The extension's autopan is designed to avoid all of these. If you start getting blocked mid-session, try increasing `PAGE_SETTLE_MS` in `background.js` (currently 4000ms) to give DataDome more initialization time.
