# Social Searcher - OpenClaw Skill

An OpenClaw skill for automated social media monitoring across LinkedIn and Reddit. This skill hunts for new posts based on configurable keywords and subreddits, saving results to daily JSON files for analysis.

## 🎯 Purpose

Monitor social media platforms for specific keywords, hashtags, and discussions to:
- Track industry trends and conversations
- Discover relevant content for research or business development
- Generate leads by identifying interested parties
- Stay informed about specific topics across multiple platforms

## 🚀 Quick Start

### Prerequisites

- Node.js (v18+) and npm
- Chrome/Chromium browser (for Playwright)
- Active LinkedIn account (for LinkedIn searches)

### Installation

```bash
# Navigate to skill directory
cd ~/.openclaw/skills/social-searcher

# Install dependencies
npm install

# Install Playwright browsers (if not already installed)
npx playwright install chrome
```

### First Run

1. **Configure keywords**:
   Edit `cfg/social-search-config.json` with your desired keywords and subreddits:
   ```json
   {
     "linkedin": {
       "keywords": ["agrivoltaics", "#solar", "renewable energy"],
       "last_successful_search": "2026-01-01T00:00:00.000Z"
     },
     "reddit": {
       "subreddits": ["renewableenergy", "solar"],
       "keywords": ["agrivoltaics", "solar"],
       "last_successful_search": "2026-01-01T00:00:00.000Z"
     }
   }
   ```

2. **Authenticate LinkedIn** (first time only):
   ```bash
   ./run-hunt.sh
   ```
   - A Chrome window will open
   - Log in to LinkedIn manually
   - Your session will be saved for future runs

3. **Run the full daily digest**:
   ```bash
   ./run-daily-digest.sh
   ```
   This builds TypeScript, then runs the full pipeline: keyword hunt → Reddit pulse → sports → LLM synthesis and delivery.

   Or run the keyword hunt only:
   ```bash
   ./run-hunt.sh           # searches since last check
   ./run-hunt.sh --days 5  # override to last 5 days
   ```
   Results are saved to `~/.openclaw/data/social-searcher/`

## 📋 How It Works

### LinkedIn Search
- Uses Playwright to automate Chrome browser
- Maintains persistent login session in `~/.openclaw/browser-profiles/social-searcher`
- Searches each keyword using LinkedIn's search with date sorting
- Extracts post content, author, and URL from search results
- Waits 6 seconds between searches to avoid rate limiting

### Reddit Search
- Uses Reddit's public JSON API
- No authentication required
- Searches specified subreddits for keywords
- Filters results by `created_utc` timestamp
- Only returns posts newer than `last_successful_search`

### Data Flow

```
Configuration (cfg/social-search-config.json)
    ↓
1. social-searcher.ts  → search-results-YYYY-MM-DD.json  (LinkedIn + Reddit keywords)
    ↓
2. reddit-pulse.ts     → reddit-pulse-YYYY-MM-DD.json    (subreddit top posts)
    ↓
3. sports-pulse.ts     → sports-raw-YYYY-MM-DD.json      (scores + upcoming matches)
    ↓
4. Merge              → raw-data-YYYY-MM-DD.json          (combined for LLM)
    ↓
5. rex-engine.ts      → LLM synthesis → email + mobile delivery
    ↓
delivery-status-YYYY-MM-DD.json
```

All output files are written to `~/.openclaw/data/social-searcher/`.

## 📁 File Structure

```
social-searcher/
├── SKILL.md                      # OpenClaw skill definition (for AI)
├── README.md                     # This file (for humans)
├── run-daily-digest.sh           # Primary cron/execution script (full pipeline)
├── run-hunt.sh                   # Keyword hunt only
├── run-pulse.sh                  # Reddit pulse only
├── daily-digest.ts / .js         # Pipeline orchestrator
├── social-searcher.ts            # LinkedIn + Reddit keyword search
├── reddit-pulse.ts               # Reddit subreddit top posts
├── sports-pulse.ts               # Sports results + upcoming matches
├── rex-engine.ts                 # LLM synthesis and delivery
├── digest-utils.ts               # Content balancing + link formatting
├── sports-engine.ts              # Sports data processing
├── sports-utils.ts               # Sports formatting utilities
├── cfg/
│   ├── social-search-config.json # Keywords and subreddits config
│   └── addresses.json            # Email/mobile delivery addresses
├── logs/                         # Run logs (gitignored)
│   ├── cron-digest-run.log
│   └── last-run-status.json
├── package.json                  # NPM dependencies
├── tsconfig.json                 # TypeScript config
└── node_modules/                 # Installed packages
```

## 🔧 Configuration

### Keywords and Subreddits

Edit `cfg/social-search-config.json`:

```json
{
  "linkedin": {
    "keywords": [
      "keyword1",
      "#hashtag1",
      "multi word phrase"
    ],
    "last_successful_search": "2026-02-18T18:43:13.407Z"
  },
  "reddit": {
    "subreddits": [
      "subreddit1",
      "subreddit2"
    ],
    "keywords": [
      "keyword1",
      "keyword2"
    ],
    "last_successful_search": "2026-02-18T18:43:13.407Z"
  }
}
```

**Tips:**
- LinkedIn keywords can include hashtags (#hashtag)
- Multi-word phrases work for both platforms
- Subreddit names should not include the `/r/` prefix
- Timestamps are automatically updated after each run

### Resetting Search History

To re-scan older content, manually edit the `last_successful_search` timestamps in `cfg/social-search-config.json` to an earlier date.

### Time Period Override

Use the `--days` parameter to override the default time filtering:

```bash
# Search the last 5 days (ignores last_successful_search)
./run-hunt.sh --days 5

# Search the last 30 days
./run-hunt.sh --days 30
```

**Behavior:**
- **Without `--days`**: Searches for posts since the `last_successful_search` timestamp in config
- **With `--days N`**: Searches for posts from the last N days
- **Config updates**: When using `--days`, the `last_successful_search` timestamps are NOT updated in the config file

**Use cases:**
- One-time historical searches without affecting your regular tracking
- Testing new keywords on recent content
- Filling gaps after missed scheduled runs
- Auditing specific time periods

## 📊 Output Format

Results are saved to `~/.openclaw/data/social-searcher/`. The keyword hunt output (`search-results-YYYY-MM-DD.json`) has this structure:

```json
[
  {
    "platform": "linkedin",
    "keyword": "search term",
    "author": "John Doe",
    "content": "Post content text...",
    "url": "https://www.linkedin.com/feed/update/..."
  },
  {
    "platform": "reddit",
    "title": "Post title",
    "content": "Post text content...",
    "author": "reddit_username",
    "subreddit": "subreddit_name",
    "url": "https://reddit.com/r/subreddit/comments/..."
  }
]
```

## 🐛 Troubleshooting

### LinkedIn Login Required

**Symptom**: Empty LinkedIn results or authentication errors

**Solution**:
```bash
# Delete saved browser profile
rm -rf ~/.openclaw/browser-profiles/social-searcher

# Run script and log in manually
./run-hunt.sh
```

### Script Permission Denied

**Symptom**: `bash: ./run-daily-digest.sh: Permission denied`

**Solution**:
```bash
chmod +x run-daily-digest.sh run-hunt.sh run-pulse.sh
```

### Node/NPM Not Found

**Symptom**: `command not found: node` or `command not found: npm`

**Solution**:
- Install Node.js from https://nodejs.org/
- Or use a version manager like nvm

### Playwright Browser Not Found

**Symptom**: `browserType.launch: Executable doesn't exist`

**Solution**:
```bash
npx playwright install chrome
```

### No Results Despite Valid Keywords

**Possible causes**:
1. `last_successful_search` is too recent - try setting it to an earlier date
2. Keywords don't match any recent posts
3. LinkedIn session expired - re-authenticate
4. Rate limiting - wait 15 minutes and try again

### TypeScript Compilation Errors

**Solution**:
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

## ⚡ Usage with OpenClaw

Once installed, Claude can use this skill via the `social_searcher_daily_digest` tool:

**User**: "Run the daily digest"

**Claude**: *Executes `~/.openclaw/skills/social-searcher/run-daily-digest.sh`*

**Output**: Full pipeline runs — hunt, pulse, sports, LLM synthesis, email + mobile delivery. Logs at `logs/cron-digest-run.log`.

## 🔒 Security & Privacy

### LinkedIn Authentication
- Your LinkedIn credentials are stored in the persistent browser profile
- Profile directory: `~/.openclaw/browser-profiles/social-searcher`
- This is a local Chrome profile, similar to using Chrome yourself
- Credentials are never transmitted to third parties

### Reddit Access
- No authentication required
- Uses public JSON API
- No personal data stored

### Data Storage
- All results are stored locally in JSON files
- No external services or databases used
- You control all data

## 🎛️ Advanced Usage

### Running from OpenClaw

The skill is automatically available in OpenClaw via `SKILL.md`. Claude will invoke it as needed.

### Manual Execution

```bash
# Full pipeline (recommended)
./run-daily-digest.sh

# Keyword hunt only
./run-hunt.sh
./run-hunt.sh --days 7   # with time override

# Reddit pulse only
./run-pulse.sh

# Direct TypeScript execution (for debugging)
npx ts-node --esm social-searcher.ts
npx ts-node --esm daily-digest.ts
```

### Scheduling Automated Runs

Use cron to run periodic searches:

```bash
# Edit crontab
crontab -e

# Add entry (runs daily at 7 AM)
0 7 * * * /Users/you/.openclaw/skills/social-searcher/run-daily-digest.sh
```

### Processing Results

Example Python script to analyze results:

```python
import json
from pathlib import Path
from datetime import date

# Load today's results
results_file = Path.home() / f".openclaw/data/social-searcher/search-results-{date.today()}.json"
if results_file.exists():
    with open(results_file) as f:
        posts = json.load(f)

    # Filter by platform
    linkedin_posts = [p for p in posts if p['platform'] == 'linkedin']
    reddit_posts = [p for p in posts if p['platform'] == 'reddit']

    print(f"LinkedIn: {len(linkedin_posts)} posts")
    print(f"Reddit: {len(reddit_posts)} posts")

    # Analyze content...
```

## 📝 Best Practices

### Keyword Selection
- Start with 3-5 focused keywords per platform
- Use specific industry terms, not generic words
- Include relevant hashtags for LinkedIn
- Test keywords manually before automating

### Search Frequency
- Daily searches work well for active topics
- Weekly searches for slower-moving industries
- Avoid running more than once per hour (rate limiting)

### Data Management
- Archive old JSON files monthly
- Keep config file backed up
- Review and update keywords quarterly

### Rate Limiting
- LinkedIn: Max 10-15 keyword searches per run
- Reddit: Max 50-100 API calls per run
- Space out executions by at least 1 hour

## 🛠️ Development

### Modifying the Code

Key source files:
- `social-searcher.ts` — LinkedIn + Reddit keyword search
- `reddit-pulse.ts` — Reddit subreddit top posts
- `sports-pulse.ts` — Sports scores and upcoming matches
- `rex-engine.ts` — LLM synthesis and delivery
- `daily-digest.ts` — Pipeline orchestrator
- `digest-utils.ts` — Content balancing, link formatting
- `sports-engine.ts` / `sports-utils.ts` — Sports data processing

### Testing Changes

```bash
# Type-check without emitting
npx tsc --noEmit

# Build
npx tsc

# Run full pipeline
./run-daily-digest.sh

# Run individual scripts with ts-node
npx ts-node --esm social-searcher.ts
```

### Adding New Platforms

To add support for another platform:

1. Add platform config to `social-search-config.json`
2. Create new search function in `social-searcher.ts`
3. Call function from `main()` and merge results
4. Update `SKILL.md` and this README

## 📄 License

Part of the OpenClaw Tools repository. See main repository for license information.

## 🤝 Contributing

This is part of a personal OpenClaw tools collection. Feel free to fork and adapt for your own use.

## 🔗 Related Skills

- **web-search**: General web search for current information
- **wikipedia-search**: Encyclopedic knowledge from Wikipedia
- **finance-tracker**: Financial data and market analysis

## 📧 Support

For issues or questions:
1. Check troubleshooting section above
2. Review OpenClaw documentation
3. Check GitHub issues in main repository

---

**Note**: This skill scrapes LinkedIn, which may violate LinkedIn's Terms of Service. Use responsibly and at your own risk. Reddit's public API usage is within their terms as long as rate limits are respected.
