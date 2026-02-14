# Search Provider Reference

This document describes the provider-agnostic design of the web-search skill and provides information about alternative search providers.

## Provider-Agnostic Design

The web-search skill is designed to make switching search providers easy. All provider implementations must maintain the same **interface contract** to ensure compatibility with Claude's expectations.

### Interface Contract

Any search provider implementation must:

1. **Accept the same CLI arguments:**
   - Positional argument: `query` (required)
   - `--max-results N` (optional, default: 5, max: 10)
   - `--time-range d|w|m|y` (optional)
   - `--news` (optional, flag)
   - `--region CODE` (optional, default: "us-en")

2. **Output JSON to stdout in this format:**
   ```json
   {
     "results": [
       {
         "title": "Result Title",
         "url": "https://example.com/page",
         "snippet": "Preview or excerpt text..."
       }
     ],
     "query": "original search query",
     "result_count": 5
   }
   ```

3. **Follow error handling conventions:**
   - Print errors to stderr (not stdout)
   - Exit with code 0 on success
   - Exit with non-zero code on failure
   - Return empty results array if no results found (not an error)

4. **Be executable:**
   - Include shebang: `#!/usr/bin/env python3`
   - Have executable permissions (755)

By maintaining this contract, you can swap providers without changing SKILL.md or Claude's understanding of the skill.

## Current Provider: DuckDuckGo

**Library:** [duckduckgo_search](https://github.com/deedy5/duckduckgo_search)

### Advantages

- **Free** — No API key required, no cost
- **Privacy-respecting** — No tracking, no user profiling
- **No setup** — Works immediately, auto-installs dependencies
- **Simple** — Easy to use, minimal configuration
- **Decent coverage** — Good for general queries

### Limitations

- **Rate limiting** — Frequent requests may be throttled
- **Basic relevance** — Results may be less accurate than Google/Bing
- **No advanced features** — Limited filtering options
- **Unstable API** — The library API changes frequently
- **No support** — Community-maintained, no official support

### When to Consider Alternatives

Consider switching from DuckDuckGo when:
- You need more accurate results for specialized queries
- Rate limiting becomes a problem
- You need advanced features (academic papers, patents, code search)
- Result quality is consistently poor for your use cases

## Alternative Providers

### 1. Tavily

**Website:** https://tavily.com
**Best for:** AI-optimized search with pre-extracted content

#### Advantages

- **AI-optimized** — Results designed for LLM consumption
- **Pre-extracted content** — Returns full text, not just snippets
- **Structured data** — Rich metadata for better parsing
- **Answer mode** — Can return direct answers, not just links
- **Good relevance** — High-quality, curated results

#### Limitations

- **Requires API key** — Must sign up and authenticate
- **Costs money** — Paid service (though has free tier)
- **Rate limits** — Based on your plan
- **Less control** — More opinionated about what results to return

#### Migration Notes

To switch to Tavily:
1. Sign up at https://tavily.com and get an API key
2. Store API key in environment variable: `TAVILY_API_KEY`
3. Replace `search.py` with Tavily implementation:
   ```python
   from tavily import TavilyClient
   client = TavilyClient(api_key=os.environ["TAVILY_API_KEY"])
   results = client.search(query, max_results=max_results)
   ```
4. Format results to match the interface contract
5. Update dependencies in SKILL.md frontmatter (if needed)

### 2. Serper.dev

**Website:** https://serper.dev
**Best for:** Google Search API with accurate results

#### Advantages

- **Google results** — Uses Google Search, very accurate
- **Fast** — Optimized API, low latency
- **Rich features** — Supports images, news, shopping, places, etc.
- **Good documentation** — Clear API docs and examples
- **Reasonable pricing** — Competitive rates

#### Limitations

- **Requires API key** — Must sign up and pay
- **Costs money** — No free tier (though cheap per request)
- **Rate limits** — Based on your plan
- **Privacy** — Routes through Google (not privacy-focused)

#### Migration Notes

To switch to Serper.dev:
1. Sign up at https://serper.dev and get an API key
2. Store API key securely
3. Replace `search.py` with Serper implementation using `requests`:
   ```python
   import requests
   headers = {"X-API-KEY": api_key, "Content-Type": "application/json"}
   data = {"q": query, "num": max_results}
   response = requests.post("https://google.serper.dev/search",
                           headers=headers, json=data)
   ```
4. Parse response and format to match interface contract

### 3. Brave Search API

**Website:** https://brave.com/search/api/
**Best for:** Privacy-focused search with generous free tier

#### Advantages

- **Privacy-focused** — No tracking, independent index
- **Generous free tier** — 2,000 queries/month free
- **Good quality** — Brave's own search index
- **Rich features** — Web, news, images support
- **Ethical** — Independent, not tied to Google/Bing

#### Limitations

- **Requires API key** — Must sign up
- **Rate limits** — 1 request/second on free tier
- **Newer service** — Less mature than Google/Bing
- **Smaller index** — May miss some niche content

#### Migration Notes

To switch to Brave Search:
1. Sign up at https://brave.com/search/api/ and get an API key
2. Store API key securely
3. Replace `search.py` with Brave API implementation
4. Use their REST API with `requests` library
5. Map their response format to the interface contract

### 4. SearXNG (Self-Hosted)

**Website:** https://github.com/searxng/searxng
**Best for:** Self-hosted metasearch with full control

#### Advantages

- **Self-hosted** — Run your own instance, full control
- **No API key** — You own the infrastructure
- **Metasearch** — Aggregates results from multiple sources
- **Privacy** — No external tracking
- **Highly configurable** — Customize everything

#### Limitations

- **Requires server** — Must host and maintain
- **Complexity** — Setup and maintenance overhead
- **Rate limits** — Still subject to upstream provider limits
- **Maintenance** — You're responsible for uptime and updates

#### Migration Notes

To use SearXNG:
1. Deploy SearXNG instance (Docker recommended)
2. Configure search engines and settings
3. Replace `search.py` to query your SearXNG instance REST API
4. No API key needed if you trust your network
5. Consider authentication if exposed to internet

### 5. Bing Search API

**Website:** https://www.microsoft.com/en-us/bing/apis/bing-web-search-api
**Best for:** Microsoft ecosystem integration

#### Advantages

- **Official API** — Direct from Microsoft
- **High quality** — Bing search results
- **Rich features** — Web, news, images, videos, etc.
- **Enterprise support** — SLAs and support options
- **Azure integration** — Works well with Azure services

#### Limitations

- **Requires API key** — Azure subscription needed
- **Costs money** — Paid tiers only
- **Microsoft-centric** — Tied to Azure ecosystem
- **Complex pricing** — Multiple tiers and options

#### Migration Notes

To switch to Bing:
1. Create Azure account and Bing Search resource
2. Get API key from Azure portal
3. Replace `search.py` with Bing Search API calls
4. Use `requests` library with Bing API endpoint
5. Handle Bing's response format and map to interface contract

## Migration Guide

To migrate from one provider to another:

### Step 1: Prepare New Implementation

1. Write new `search.py` script using alternative provider
2. Ensure it accepts all required CLI arguments
3. Format output JSON to match the interface contract
4. Test thoroughly with various queries

### Step 2: Update Dependencies

If new provider requires additional libraries:
1. Update auto-install logic in script
2. Add new libraries to SKILL.md requirements (if needed)
3. Document any API key requirements in SKILL.md

### Step 3: Replace Script

```bash
# Backup current script
cp ~/.openclaw/skills/web-search/scripts/search.py \
   ~/.openclaw/skills/web-search/scripts/search.py.backup

# Deploy new script
cp new-search-implementation.py \
   ~/.openclaw/skills/web-search/scripts/search.py

# Ensure executable
chmod +x ~/.openclaw/skills/web-search/scripts/search.py
```

### Step 4: Update Documentation (Optional)

If the new provider adds features or has different limitations:
1. Update SKILL.md "Limitations" section
2. Add provider-specific notes if needed
3. Update examples if new capabilities exist

You do NOT need to update:
- Usage examples (CLI interface is the same)
- JSON output format documentation
- Workflow or best practices

### Step 5: Test

Run test queries to verify:

```bash
# Basic search
python ~/.openclaw/skills/web-search/scripts/search.py "test query"

# News search
python ~/.openclaw/skills/web-search/scripts/search.py "test" --news

# Time filtering
python ~/.openclaw/skills/web-search/scripts/search.py "test" --time-range w

# Max results
python ~/.openclaw/skills/web-search/scripts/search.py "test" --max-results 3

# Error handling
python ~/.openclaw/skills/web-search/scripts/search.py ""
```

### Step 6: Monitor

After switching providers:
- Watch for errors in Claude's usage
- Monitor costs if using paid provider
- Check result quality and relevance
- Adjust as needed

## Comparing Providers

| Provider | Cost | API Key | Quality | Speed | Privacy | Setup |
|----------|------|---------|---------|-------|---------|-------|
| DuckDuckGo | Free | No | Good | Fast | High | Easy |
| Tavily | Paid (free tier) | Yes | Excellent | Fast | Medium | Easy |
| Serper.dev | Paid | Yes | Excellent | Very Fast | Low | Easy |
| Brave | Free tier / Paid | Yes | Very Good | Fast | High | Easy |
| SearXNG | Free (hosting cost) | No | Good | Varies | High | Complex |
| Bing | Paid | Yes | Excellent | Fast | Low | Medium |

## Recommendations

### For Most Users
**Start with DuckDuckGo** — It's free, private, and works immediately. Only switch if you encounter specific limitations.

### For High-Volume Usage
**Consider Brave** — Generous free tier (2,000/month), good quality, privacy-focused.

### For Best Quality
**Use Serper.dev or Bing** — Google/Bing results are generally most accurate, especially for commercial queries.

### For AI/LLM Optimization
**Use Tavily** — Purpose-built for AI applications, returns structured data optimized for LLMs.

### For Privacy/Control
**Self-host SearXNG** — Full control, no external tracking, aggregate multiple sources.

## Future Considerations

Potential improvements to the provider system:

1. **Multi-provider fallback** — Try DuckDuckGo first, fall back to paid API if needed
2. **Provider selection via flag** — `--provider tavily` to choose at runtime
3. **Result aggregation** — Combine results from multiple providers
4. **Caching layer** — Cache results to reduce API calls and costs
5. **Rate limit handling** — Automatic backoff and retry logic

These improvements would require changes to the interface contract and SKILL.md.

## Contributing

To add a new provider to this reference:

1. Test the provider thoroughly
2. Document advantages and limitations
3. Provide clear migration steps
4. Include code examples
5. Add to comparison table

## Resources

- [DuckDuckGo Search Library](https://github.com/deedy5/duckduckgo_search)
- [Tavily Documentation](https://docs.tavily.com)
- [Serper.dev API Docs](https://serper.dev/docs)
- [Brave Search API](https://brave.com/search/api/)
- [SearXNG Documentation](https://docs.searxng.org)
- [Bing Search API](https://www.microsoft.com/en-us/bing/apis/bing-web-search-api)
