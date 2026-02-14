---
name: web-search
description: Search the web using DuckDuckGo for current information, recent events, real-time data, and fact-checking beyond training cutoff
metadata:
  openclaw:
    emoji: "🔍"
    requires:
      bins: ["python3"]
---

# Web Search Skill

This skill enables Claude to search the web using DuckDuckGo to access current information, recent events, and real-time data beyond the training cutoff.

## When to Use

Use this skill when you need:

- **Current events and breaking news** — Latest happenings, political updates, global events
- **Recent information after training cutoff** — New releases, updates, or changes since training data
- **Real-time data** — Current weather, sports scores, stock prices, cryptocurrency values
- **Fact-checking verifiable claims** — Confirm accuracy of statements, dates, statistics
- **Fast-changing topics** — Tech releases, API documentation updates, library versions
- **Finding recent examples or tutorials** — Latest best practices, code examples, how-to guides
- **Availability checks** — Is a service up? Is an event still happening?
- **Contact information** — Business hours, addresses, phone numbers for services

## When NOT to Use

Avoid using this skill for:

- **Basic knowledge questions** — Information well within training data (historical facts, established concepts)
- **Math or logic problems** — Calculations, reasoning tasks that don't require external data
- **Coding help** — Writing code, debugging, or explaining programming concepts (unless searching for recent API changes)
- **Creative writing or brainstorming** — Tasks requiring imagination rather than facts
- **Deep analysis** — Tasks requiring understanding beyond surface-level facts from search results
- **Private or local information** — User's personal files, codebase details, local configurations
- **Opinion or subjective matters** — When training data provides sufficient context for reasoned opinions

## Usage

The skill is invoked by running the search script with a query:

```bash
python ~/.openclaw/skills/web-search/scripts/search.py "your search query" [options]
```

### Options

- `--max-results N` — Number of results to return (default: 5, max: 10)
- `--time-range d|w|m|y` — Filter results by time: d=day, w=week, m=month, y=year
- `--news` — Search news sources instead of general web
- `--region CODE` — Region code for localized results (default: "us-en")

### Common Region Codes

- `us-en` — United States (English)
- `uk-en` — United Kingdom (English)
- `ca-en` — Canada (English)
- `au-en` — Australia (English)
- `de-de` — Germany (German)
- `fr-fr` — France (French)
- `jp-jp` — Japan (Japanese)

## Examples

### 1. Check Current Weather

```bash
python ~/.openclaw/skills/web-search/scripts/search.py "current weather Hartford CT"
```

### 2. Find Recent News

```bash
python ~/.openclaw/skills/web-search/scripts/search.py "latest AI developments" --news --max-results 3
```

### 3. Search for Recent Releases

```bash
python ~/.openclaw/skills/web-search/scripts/search.py "Python 3.13 release notes" --time-range m
```

### 4. Get Stock Information

```bash
python ~/.openclaw/skills/web-search/scripts/search.py "AAPL stock price"
```

### 5. Find API Documentation

```bash
python ~/.openclaw/skills/web-search/scripts/search.py "OpenAI API rate limits 2026"
```

## Workflow

When using this skill, follow this workflow:

1. **Run the search** — Execute the script with your query
2. **Parse JSON output** — The script outputs structured JSON with results
3. **Synthesize results** — Read through results and extract relevant information
4. **Attribute sources** — When presenting findings, cite sources with URLs
5. **Refine if needed** — If results are insufficient, try:
   - Different keywords (more specific or more general)
   - Time range filtering (--time-range)
   - News search (--news flag)
   - Multiple searches for complex topics

### JSON Output Structure

The script returns JSON in this format:

```json
{
  "results": [
    {
      "title": "Page Title",
      "url": "https://example.com/page",
      "snippet": "Preview text from the page..."
    }
  ],
  "query": "original search query",
  "result_count": 5
}
```

### Attribution Guidelines

When presenting search results to users:

- **Always include sources** — Provide URLs in markdown format: `[Title](URL)`
- **Cite multiple sources** — For important claims, reference 2-3 sources
- **Format sources section** — End responses with a "Sources:" section listing all URLs
- **Be transparent** — Make it clear when information comes from search results vs. training data

Example:

```
Based on recent reports, Python 3.13 was released in October 2024 with
several performance improvements and new features.

Sources:
- [Python 3.13 Release Notes](https://docs.python.org/3/whatsnew/3.13.html)
- [Python Insider: Python 3.13.0 is now available](https://blog.python.org/...)
```

## Best Practices

### Query Formulation

- **Keep queries short** — 1-6 words works best (e.g., "React hooks documentation")
- **Use specific keywords** — Instead of "how to make cake", use "chocolate cake recipe"
- **Include year for recent info** — "TypeScript features 2026" vs. "TypeScript features"
- **Use quotation marks for phrases** — Not in the script args, but in the query string itself

### Time Filtering

- Use `--time-range d` for breaking news or very recent events
- Use `--time-range w` for current events and weekly updates
- Use `--time-range m` for recent developments and monthly changes
- Use `--time-range y` for annual updates and year-over-year changes

### Multiple Searches

For complex questions, break them into multiple searches:

- **Bad:** "What are the differences between React and Vue and which is better for large projects"
- **Good:**
  1. "React vs Vue comparison 2026"
  2. "React large projects scalability"
  3. "Vue large applications performance"

### Result Verification

- **Cross-reference** — Check multiple sources for important facts
- **Check dates** — Ensure information is current enough for the query
- **Assess authority** — Official docs, established news sites, and recognized experts are more reliable
- **Be skeptical** — Search results may contain outdated, biased, or incorrect information

## Error Handling

The script handles common errors gracefully:

### Network Failures

If the search fails due to network issues:
- Error message will be printed to stderr
- Exit code will be non-zero
- Retry after a moment or check internet connection

### Rate Limiting

DuckDuckGo may rate-limit requests:
- Wait 30-60 seconds before retrying
- Reduce search frequency if hitting limits repeatedly
- Consider alternative providers (see `references/providers.md`)

### No Results Found

If a query returns no results:
- JSON will contain empty results array: `{"results": [], ...}`
- Try rephrasing the query with different keywords
- Remove time filters if using them
- Check for typos in the query

### Import Errors

If `duckduckgo-search` library is missing:
- Script automatically attempts to install it
- Requires `pip` to be available
- May require `--break-system-packages` flag in some environments
- If auto-install fails, manually install: `pip install duckduckgo-search`

## Technical Details

### Dependencies

- **Python 3.x** — Required (python3 command must be available)
- **duckduckgo-search** — Auto-installed if missing
- **pip** — Required for dependency installation

### Auto-Installation

The script automatically installs missing dependencies:

```python
subprocess.check_call([
    sys.executable, "-m", "pip", "install",
    "duckduckgo-search", "--break-system-packages", "--quiet"
])
```

The `--break-system-packages` flag is needed for externally-managed Python environments (common on modern Linux distributions and macOS with Homebrew Python).

### Provider Design

This skill uses a provider-agnostic architecture:
- Search provider can be swapped by replacing `scripts/search.py`
- CLI interface remains consistent (same arguments)
- JSON output format stays the same
- See `references/providers.md` for alternative providers

### Exit Codes

- `0` — Success
- `1` — General error (network failure, invalid query, etc.)
- `2` — Import error (dependency installation failed)

## Limitations

### DuckDuckGo Constraints

- **Rate limiting** — Frequent searches may be throttled
- **No API key** — Cannot authenticate for higher limits
- **Basic search** — Less sophisticated than paid APIs (no filters for academic papers, patents, etc.)
- **No search history** — Each search is independent
- **Result quality** — May be less relevant than Google/Bing for niche topics

### General Limitations

- **Surface-level information** — Search results provide snippets, not deep analysis
- **No PDF/file downloads** — Only returns web page URLs, not file contents
- **No image search** — Text search only (web and news)
- **English-centric** — Best results for English queries, though region codes help
- **Recency bias** — Very recent events (< 1 hour) may not be indexed yet

## Troubleshooting

### Script Not Executable

If you get "Permission denied" error:

```bash
chmod +x ~/.openclaw/skills/web-search/scripts/search.py
```

### Python Not Found

If `python3` command doesn't exist, create an alias or use full path to Python interpreter.

### Installation Fails in Virtual Environment

If auto-install fails due to venv restrictions, manually install globally:

```bash
python3 -m pip install duckduckgo-search --user
```

### No Results for Valid Query

- Try removing time filters
- Use more general keywords
- Check if the topic is too recent (< 1 hour)
- Verify spelling and phrasing

## See Also

- `references/providers.md` — Alternative search providers and migration guide
- [DuckDuckGo Search Python Library](https://github.com/deedy5/duckduckgo_search) — Upstream library documentation

## Notes

- The skill is designed to be **proactive** — Claude should use it whenever current information would improve the response
- Always **cite sources** when using search results
- For **controversial or critical information**, cross-reference multiple sources
- **Privacy-respecting** — DuckDuckGo doesn't track searches or build user profiles
