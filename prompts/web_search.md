# Build an OpenClaw Skill: Web Search via DuckDuckGo

## Goal

Create an OpenClaw skill called `web-search` that gives Claude the ability to search the web using the Python `duckduckgo-search` library. This should be a simple, free, no-API-key-required search capability.

Install the skill in ~/.openclaw/skills/web-search/

## Architecture & Design Principles

- **Provider-agnostic design**: The skill should be structured so that swapping in a different search backend later (e.g., Tavily, Serper.dev, Brave Search API) requires changing only the search provider script — not the SKILL.md instructions or the interface contract.
- **Simple Python script approach**: The skill should work by having Claude execute a Python script via bash, not by requiring MCP servers or complex infrastructure.
- **Minimal dependencies**: The only external dependency should be `duckduckgo-search`. The script should handle its own installation (`pip install duckduckgo-search --break-system-packages --quiet`) if the library isn't already available.

## Skill Structure

```
web-search/
├── SKILL.md                    # Main skill instructions
├── scripts/
│   └── search.py               # The search script Claude will invoke
└── references/
    └── providers.md            # Notes on alternative providers for future use
```

## SKILL.md Requirements

The frontmatter `description` field is critical — it controls when the skill triggers. Make it pushy per OpenClaw conventions. It should trigger whenever Claude needs current information, real-time data, recent events, fact-checking, or anything beyond its training cutoff.

The body of SKILL.md should instruct Claude to:

1. Run the search script via bash: `python /path/to/scripts/search.py "query" [--max-results N] [--time-range d|w|m|y]`
2. Parse the JSON output (the script returns structured JSON to stdout)
3. Synthesize results into a natural response with source attribution
4. Use multiple searches when a topic is complex or the first search doesn't fully answer the question
5. Keep queries short and specific (1-6 words) for best results

Include guidance on:
- When to search (current events, recent info, verifiable claims, fast-changing topics)
- When NOT to search (basic knowledge questions, math, coding help, creative writing)
- How to refine searches if initial results are insufficient
- How to handle errors gracefully (network failures, rate limits, no results)

## search.py Requirements

The script should:

- Accept a search query as a positional argument
- Accept optional flags: `--max-results` (default 5, max 10), `--time-range` (d/w/m/y for day/week/month/year), `--news` (search news instead of web), `--region` (default "us-en")
- Auto-install `duckduckgo-search` if not present
- Output clean JSON to stdout with this structure per result:
  ```json
  {
    "results": [
      {
        "title": "...",
        "url": "...",
        "snippet": "..."
      }
    ],
    "query": "original query",
    "result_count": 5
  }
  ```
- Print errors to stderr (not stdout) so they don't corrupt the JSON output
- Handle common exceptions: rate limiting, network errors, no results, import failures
- Exit with code 0 on success, non-zero on failure

## references/providers.md

Include a brief reference doc noting that the skill is designed for easy provider swapping. List these future options with a sentence each about what they offer and what would need to change:

- **Tavily** — AI-optimized search API, returns pre-extracted content, requires API key
- **Serper.dev** — Google Search API wrapper, very accurate results, requires API key  
- **Brave Search API** — Privacy-focused, generous free tier, requires API key
- **SearXNG** — Self-hosted metasearch engine, no API key needed but requires server

Note the interface contract: any replacement provider script should accept the same CLI arguments and produce the same JSON output structure.

## Testing

After building the skill, test it with these queries to verify it works:

1. `python scripts/search.py "current weather Hartford CT"` — basic search
2. `python scripts/search.py "latest AI news" --news --max-results 3` — news search
3. `python scripts/search.py "Python 3.13 release" --time-range y` — time-filtered search
4. `python scripts/search.py ""` — should handle empty query gracefully
5. `python scripts/search.py "asdkjfhaskjdfh"` — should handle no-results gracefully

## Important Notes

- Do NOT use the DDGS class in a `with` statement if the library version doesn't support it — check the API and use the simplest working pattern.
- The `duckduckgo-search` library updates frequently and its API changes. Use the latest stable patterns. If `DDGS().text()` works, prefer that over more complex approaches.
- Keep the SKILL.md under 500 lines per OpenClaw conventions.
- Remember this will run in environments where `pip install` needs the `--break-system-packages` flag.