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
   Edit `social-search-config.json` with your desired keywords and subreddits:
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

3. **Run searches**:
   ```bash
   # Use default behavior (searches since last check)
   ./run-hunt.sh

   # Override time period (search last 5 days)
   ./run-hunt.sh --days 5
   ```
   Results are saved to `search-results-YYYY-MM-DD.json`

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
Configuration (social-search-config.json)
    ↓
LinkedIn Search → Extract Posts
    ↓
Reddit Search → Extract Posts
    ↓
Merge Results → Deduplicate
    ↓
Save to search-results-YYYY-MM-DD.json
    ↓
Update last_successful_search timestamps
```

## 📁 File Structure

```
social-searcher/
├── SKILL.md                      # OpenClaw skill definition (for AI)
├── README.md                     # This file (for humans)
├── run-hunt.sh                   # Main execution script
├── social-searcher.ts            # TypeScript implementation
├── social-search-config.json     # Configuration file
├── search-results-*.json         # Daily result files
├── package.json                  # NPM dependencies
├── package-lock.json             # Locked dependencies
├── tsconfig.json                 # TypeScript config
└── node_modules/                 # Installed packages
```

## 🔧 Configuration

### Keywords and Subreddits

Edit `social-search-config.json`:

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

To re-scan older content, manually edit the `last_successful_search` timestamps in the config file to an earlier date.

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

Results are saved to `search-results-YYYY-MM-DD.json` with this structure:

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

**Symptom**: `bash: ./run-hunt.sh: Permission denied`

**Solution**:
```bash
chmod +x run-hunt.sh
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

Once installed, Claude can use this skill via the `social_searcher_hunt` tool:

**User**: "Run a social media hunt for my keywords"

**Claude**: *Executes `~/.openclaw/skills/social-searcher/run-hunt.sh`*

**Output**: Results are saved and can be analyzed by Claude in subsequent requests.

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
# Direct TypeScript execution
npx ts-node social-searcher.ts

# With time override (last 7 days)
npx ts-node social-searcher.ts --days 7

# Via wrapper script (recommended)
./run-hunt.sh

# Via wrapper script with time override
./run-hunt.sh --days 7
```

### Scheduling Automated Runs

Use cron to run periodic searches:

```bash
# Edit crontab
crontab -e

# Add entry (runs daily at 9 AM)
0 9 * * * cd ~/.openclaw/skills/social-searcher && ./run-hunt.sh
```

### Processing Results

Example Python script to analyze results:

```python
import json
from pathlib import Path
from datetime import date

# Load today's results
results_file = Path(f"search-results-{date.today()}.json")
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

The main logic is in `social-searcher.ts`:

```typescript
// Key functions:
- loadConfig()          // Load configuration
- searchLinkedIn()      // LinkedIn scraping logic
- searchReddit()        // Reddit API calls
- main()                // Orchestration
```

### Testing Changes

```bash
# Compile TypeScript
npm run build

# Run compiled version
npm start

# Or run directly with ts-node
npx ts-node social-searcher.ts
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
