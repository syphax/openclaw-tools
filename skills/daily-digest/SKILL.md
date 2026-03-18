---
name: daily-digest
description: Daily digest pipeline — LinkedIn + Reddit keyword hunt, Reddit pulse, sports scores, LLM synthesis, and email/WhatsApp/Telegram delivery
metadata:
  openclaw:
    emoji: "🔎"
    requires:
      bins: ["node", "npx"]
      packages: ["playwright", "tsx"]
---

# Daily Digest Skill

Hunts for new social media posts across LinkedIn and Reddit based on configurable keywords, gathers Reddit pulse and sports scores, then synthesizes everything via LLM and delivers a digest via email, WhatsApp, and Telegram.

## Pipeline

The full daily pipeline runs via `run-daily-digest.sh` and executes in order:

1. **Keyword Hunt** (`social-searcher.ts`) — LinkedIn + Reddit keyword search
2. **Reddit Pulse** (`reddit-pulse.ts`) — Subreddit top/trending posts
3. **Sports Pulse** (`sports-pulse.ts`) — ESPN scoreboard for tracked teams
4. **Rex Engine** (`rex-engine.ts`) — LLM synthesis + email/WhatsApp/Telegram delivery

## Usage

```bash
# Full pipeline
./run-daily-digest.sh

# Individual steps
./run-hunt.sh               # Keyword hunt only (uses last check date)
./run-hunt.sh --days 7      # Override: search last 7 days
./run-pulse.sh              # Reddit pulse only
```

## Configuration

**Keywords & subreddits:** `cfg/social-search-config.json`

```json
{
  "linkedin": {
    "keywords": ["agrivoltaics", "#agrivoltaics", "solar warehouse", "solar"],
    "last_successful_search": "2026-03-17T..."
  },
  "reddit": {
    "monitors": [
      { "sub": "agrivoltaics", "keywords": ["agrivoltaics"] }
    ],
    "last_successful_search": "2026-03-17T..."
  }
}
```

**Delivery targets:** `cfg/addresses.json` — email, phone, and Telegram chat IDs.

**Sports teams:** `cfg/sports-config.json` — teams with ESPN sport/ID + extra leagues.

## Output

Daily JSON files in `~/.openclaw/data/social-searcher/`:

| File | Contents |
|------|----------|
| `search-results-YYYY-MM-DD.json` | LinkedIn + Reddit keyword hunt |
| `reddit-pulse-YYYY-MM-DD.json` | Reddit pulse |
| `sports-raw-YYYY-MM-DD.json` | Raw ESPN data |
| `raw-data-YYYY-MM-DD.json` | Merged data for Rex Engine |
| `delivery-status-YYYY-MM-DD.json` | Delivery results per channel |

## Implementation Details

### LinkedIn Search

- **Technology:** Playwright with Chrome (non-headless, persistent profile)
- **Browser profile:** `~/.openclaw/browser-profiles/social-searcher`
- **Container selector:** `div[role="listitem"]` — LinkedIn uses obfuscated CSS classes that rotate on deploys, so we target ARIA roles which are stable (accessibility contract)
- **Author extraction:** Profile links (`a[href*="/in/"]`, `a[href*="/company/"]`) with timestamp/degree stripping; `span[aria-hidden="true"]` fallback
- **Content extraction:** `span[dir="ltr"]` for post body text, with UI chrome cleanup
- **URL extraction:** Activity URN links → `/posts/` links → profile link fallback
- **Deduplication:** URL-based dedup across keywords within a run
- **Diagnostics:** If extraction returns 0 posts but profile links exist on the page, logs a warning with count details and saves a debug screenshot — prevents silent failures when LinkedIn changes DOM structure

### Reddit Search

- **Technology:** Direct HTTPS to Reddit JSON API (no auth required)
- **Filtering:** `sort=new&t=week`, filtered by `created_utc` since last run
- **Rate limiting:** 500ms between requests

### Rex Engine (LLM Synthesis)

- **LLM:** OpenRouter API (`google/gemini-2.0-flash-001`)
- **Delivery:** Email (via `gog`), WhatsApp and Telegram (via `openclaw message`)
- **Credentials:** `~/.openclaw/credentials/.env` — `OPENROUTER_API_KEY`, `GOG_KEYRING_PASSWORD`

### Sports Pipeline

- **Source:** ESPN scoreboard API
- **Sections:** RESULTS (past 3 days), UPCOMING (today through today+2), QUIET STADIUM
- **Config:** `cfg/sports-config.json` with team ESPN IDs + extra leagues

## Logs

| Log | Purpose |
|-----|---------|
| `logs/daily-digest-run.log` | Master pipeline log |
| `logs/hunt-run.log` | Keyword hunt log |
| `logs/pulse-run.log` | Reddit pulse log |
| `logs/last-run-status.json` | Delivery status |

## Troubleshooting

### LinkedIn returns 0 posts

LinkedIn deliberately rotates CSS class names and DOM structure as an anti-scraping measure. If extraction breaks:

1. Check logs for the diagnostic warning — it reports profile link counts and listitem div counts
2. Look at the debug screenshot saved to `logs/debug-linkedin-*.png`
3. The current extractor uses `div[role="listitem"]` — if that stops working, trace backwards from profile links (`a[href*="/in/"]`) to find their new container element
4. The Voyager API route is currently not viable — search results are server-side rendered (React Server Components), and the `linkedin-api` Python library's queryId hash is stale

### Browser profile locked

If you see "Failed to create ProcessSingleton":
```bash
# Kill orphaned Chrome processes
ps aux | grep 'social-searcher' | grep -v grep | awk '{print $2}' | xargs kill
rm ~/.openclaw/browser-profiles/social-searcher/SingletonLock
```

### LinkedIn session expired

Delete the browser profile and re-authenticate:
```bash
rm -rf ~/.openclaw/browser-profiles/social-searcher
# Run script manually, log in when browser opens
./run-hunt.sh --days 1
```

## Runtime

- Uses `npx tsx` (NOT `ts-node --esm`)
- TypeScript config: `module: "NodeNext"`, imports use `.js` extensions
- `tsx` is installed as a devDependency
