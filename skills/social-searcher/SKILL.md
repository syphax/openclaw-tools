---
name: social-searcher
description: Search LinkedIn and Reddit for specific keywords/subreddits to identify new, relevant posts and save results to daily JSON files
metadata:
  openclaw:
    emoji: "🔎"
    requires:
      bins: ["node", "npx"]
      packages: ["playwright", "typescript", "ts-node"]
---

# Social Searcher Skill

This skill enables Claude to hunt for new social media posts across LinkedIn and Reddit based on configurable keywords and subreddits. Results are saved to daily JSON files for later analysis and summarization.

## When to Use

Use this skill when you need:

- **Track industry keywords** — Monitor specific terms like "agrivoltaics", "solar energy", etc.
- **Subreddit monitoring** — Watch specific Reddit communities for relevant discussions
- **Social media intelligence** — Gather recent posts for market research or trend analysis
- **Content discovery** — Find new, relevant content based on your interests
- **Automated social monitoring** — Run periodic searches to stay updated on topics
- **Lead generation** — Identify potential business opportunities or collaborations

## When NOT to Use

Avoid using this skill for:

- **Real-time monitoring** — This is for periodic searches, not live streaming
- **Historical deep dives** — Only fetches recent content (filtered by last search timestamp)
- **Private content** — Can only access publicly visible posts
- **Twitter/X or other platforms** — Only supports LinkedIn and Reddit currently
- **Detailed content analysis** — This skill collects posts; analysis is done separately

## Usage

The skill is invoked by running the hunt script:

```bash
~/.openclaw/skills/social-searcher/run-hunt.sh
```

### Tools

#### `social_searcher_hunt`

Runs the search across LinkedIn and Reddit using the configured keywords and time-filtering.

**Command:** `~/.openclaw/skills/social-searcher/run-hunt.sh [--days N]`

...

#### `social_searcher_pulse`

Scans subreddits for top/trending posts to get a "pulse" of current discussions.

**Command:** `~/.openclaw/skills/social-searcher/run-pulse.sh [--days N]`

**Parameters:**
- `--days N` (optional) — Look back N days for top content (default: 7).

**Parameters:**
- `--days N` (optional) — Override the time period to search the last N days instead of using `last_successful_search` from config
  - When provided, searches posts from the last N days (e.g., `--days 5` searches the last 5 days)
  - When omitted, defaults to searching since the `last_successful_search` timestamp in config
  - Using `--days` will NOT update the `last_successful_search` config values

**Returns:** JSON output with search results and status

**Example invocations:**
- "Run a social hunt for my keywords" — Uses last check date from config
- "Search LinkedIn and Reddit for new posts from the last 7 days" — Uses `--days 7` override
- "Hunt for social posts in the last 3 days" — Uses `--days 3` override

## Configuration

The keywords and subreddits are managed in:
`~/.openclaw/skills/social-searcher/social-search-config.json`

### Configuration Structure

```json
{
  "linkedin": {
    "keywords": ["keyword1", "#hashtag1", "keyword2"],
    "last_successful_search": "2026-02-18T18:43:13.407Z"
  },
  "reddit": {
    "subreddits": ["subreddit1", "subreddit2"],
    "keywords": ["keyword1", "keyword2"],
    "last_successful_search": "2026-02-18T18:43:13.407Z"
  }
}
```

### Modifying Configuration

To update keywords or subreddits, edit the config file directly. The timestamps are automatically updated after each successful search run.

## Output

Results are saved to daily JSON files in the skill directory:
`search-results-YYYY-MM-DD.json`

### Output Structure

```json
[
  {
    "platform": "linkedin",
    "keyword": "search term",
    "author": "Author Name",
    "content": "Post content...",
    "url": "https://linkedin.com/..."
  },
  {
    "platform": "reddit",
    "subreddit": "subreddit_name",
    "title": "Post title",
    "content": "Post text...",
    "author": "username",
    "url": "https://reddit.com/..."
  }
]
```

## Implementation Details

### LinkedIn Search
- **Technology:** Playwright with Chrome in non-headless mode
- **Authentication:** Uses persistent browser profile at `~/.openclaw/browser-profiles/social-searcher`
- **Search Method:** Scrapes LinkedIn search results pages sorted by date
- **Filtering:** Searches by keyword with date-based sorting
- **Rate Limiting:** 6-second wait between searches to avoid detection

### Reddit Search
- **Technology:** Direct HTTPS calls to Reddit's JSON API
- **Authentication:** None required (public API)
- **Search Method:** Uses Reddit's search API with `sort=new&t=week`
- **Filtering:** Filters by `created_utc` timestamp to get only new posts since last run
- **Rate Limiting:** 500ms delay between API calls

### Deduplication
- URL-based deduplication is handled naturally by the data structure
- Timestamp filtering ensures only new content since last successful search

### Persistence
- `last_successful_search` timestamp is updated in config file after each run
- Ensures only "new" content is captured in subsequent runs
- Prevents duplicate results across multiple executions

## Workflow

When using this skill, follow this workflow:

1. **Configure keywords** — Edit `social-search-config.json` with desired keywords and subreddits
2. **Run the hunt** — Execute the search script via the OpenClaw tool
   - Normal run: `./run-hunt.sh` (uses last check date from config)
   - Time override: `./run-hunt.sh --days 5` (searches last 5 days)
3. **Review results** — Check the daily JSON file for new posts
4. **Analyze content** — Use separate analysis tools to process the collected data
5. **Repeat periodically** — Run searches on a schedule to maintain fresh data

## Error Handling

The script handles common errors gracefully:

### LinkedIn Errors
- Network failures are caught and logged
- Browser errors are caught and reported
- Continues to Reddit even if LinkedIn fails

### Reddit Errors
- API failures are caught and ignored per request
- Invalid JSON responses are silently skipped
- Rate limit errors trigger automatic retry with delay

### General Errors
- If both platforms fail, partial results are still saved
- Config file is only updated on successful completion
- Error messages are logged to console for debugging

## Dependencies

### Required Binaries
- **Node.js** — Runtime environment for TypeScript/JavaScript
- **npx** — Node package executor (comes with npm)

### NPM Packages
All dependencies are defined in `package.json` and installed via `npm install`:
- **playwright** (^1.40.0) — Browser automation for LinkedIn
- **typescript** (^5.3.0) — TypeScript compiler
- **ts-node** — TypeScript execution environment
- **@types/node** (^20.10.0) — TypeScript type definitions for Node.js

### Browser Requirements
- **Chrome/Chromium** — Used by Playwright for LinkedIn automation
- Playwright channel set to 'chrome' for native Chrome usage

## Setup

### First-Time Setup

1. **Install Node.js** — Ensure Node.js and npm are available
   ```bash
   node --version
   npm --version
   ```

2. **Install dependencies**
   ```bash
   cd ~/.openclaw/skills/social-searcher
   npm install
   ```

3. **Install Playwright browsers** (if not already installed)
   ```bash
   npx playwright install chrome
   ```

4. **Configure LinkedIn authentication**
   - Run the script once manually to trigger browser login
   - Log in to LinkedIn when prompted
   - Browser profile is saved to `~/.openclaw/browser-profiles/social-searcher`
   - Subsequent runs will use the saved session

5. **Configure keywords**
   - Edit `social-search-config.json` with your keywords and subreddits

### Maintenance

- **Update keywords** — Edit config file as needed
- **Clear cache** — Delete old JSON result files periodically
- **Reset timestamps** — Manually adjust `last_successful_search` to re-scan older content
- **Re-authenticate LinkedIn** — Delete browser profile directory if session expires

## Limitations

### LinkedIn Constraints
- **Authentication required** — Must maintain valid logged-in session
- **Scraping-based** — Subject to LinkedIn UI changes
- **Rate limiting** — Excessive searches may trigger LinkedIn protections
- **Non-headless mode** — Runs visible browser to avoid bot detection
- **Manual login** — Requires manual login on first run or after session expires

### Reddit Constraints
- **Public API only** — Only searches publicly accessible content
- **Rate limits** — Standard Reddit API rate limits apply (600 requests/10 min)
- **Search accuracy** — Reddit search is notoriously unreliable
- **Time filtering** — Limited to recent content (t=week)

### General Limitations
- **No real-time updates** — Periodic polling only, not live streaming
- **No sentiment analysis** — Only collects raw posts, no analysis
- **Storage management** — JSON files accumulate over time
- **No deduplication across days** — Same post may appear in multiple daily files

## Troubleshooting

### Script Fails to Execute

If you get "Permission denied" error:
```bash
chmod +x ~/.openclaw/skills/social-searcher/run-hunt.sh
```

### Node/NPM Not Found

Ensure Node.js is installed and in PATH:
```bash
which node
which npm
```

### LinkedIn Login Required

If LinkedIn search fails with authentication errors:
1. Delete the browser profile: `rm -rf ~/.openclaw/browser-profiles/social-searcher`
2. Run script manually to trigger login prompt
3. Log in when browser opens
4. Profile will be saved for future runs

### No Results Found

- Check that keywords are spelled correctly in config
- Verify subreddit names are valid (without /r/ prefix)
- Check `last_successful_search` timestamp isn't too recent
- Try running with a longer time window by adjusting timestamps

### Playwright Errors

If browser fails to launch:
```bash
npx playwright install chrome
```

## Best Practices

### Keyword Selection
- **Be specific** — Generic terms return too many irrelevant results
- **Use hashtags** — LinkedIn hashtags help filter relevant content
- **Combine terms** — Use multi-word phrases for precision
- **Test manually** — Verify searches on LinkedIn/Reddit before automating

### Scheduling
- **Run periodically** — Daily or weekly searches work well
- **Avoid peak hours** — Run during off-hours to avoid rate limits
- **Stagger searches** — Don't run multiple instances simultaneously

### Data Management
- **Archive old files** — Move old JSON files to archival storage periodically
- **Merge results** — Combine daily files for analysis as needed
- **Backup config** — Keep backup of configuration file

## See Also

- [Playwright Documentation](https://playwright.dev/) — Browser automation framework
- [Reddit JSON API](https://www.reddit.com/dev/api/) — Reddit's developer API
- [LinkedIn Search Tips](https://www.linkedin.com/help/) — Optimize LinkedIn searches

## Notes

- This skill requires manual LinkedIn authentication on first run
- Browser profile persists login session for future automated runs
- Reddit searches are fully automated with no authentication required
- Results are append-only; deduplication should be handled in post-processing
- Consider privacy and terms of service when scraping social media platforms
