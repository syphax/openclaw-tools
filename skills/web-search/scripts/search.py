#!/usr/bin/env python3
"""
Web search script using DuckDuckGo.
Outputs JSON results to stdout, errors to stderr.
"""

import argparse
import json
import subprocess
import sys

# Try to import duckduckgo_search, auto-install if missing
try:
    from duckduckgo_search import DDGS
except ImportError:
    print("Installing duckduckgo-search library...", file=sys.stderr)
    try:
        subprocess.check_call(
            [sys.executable, "-m", "pip", "install", "duckduckgo-search",
             "--break-system-packages", "--quiet"],
            stderr=subprocess.DEVNULL
        )
        from duckduckgo_search import DDGS
        print("Installation complete.", file=sys.stderr)
    except Exception as e:
        print(f"Error: Failed to install duckduckgo-search: {e}", file=sys.stderr)
        print("Please install manually: pip install duckduckgo-search", file=sys.stderr)
        sys.exit(2)


def parse_args():
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Search the web using DuckDuckGo"
    )
    parser.add_argument(
        "query",
        type=str,
        help="Search query string"
    )
    parser.add_argument(
        "--max-results",
        type=int,
        default=5,
        help="Maximum number of results to return (default: 5, max: 10)"
    )
    parser.add_argument(
        "--time-range",
        type=str,
        choices=["d", "w", "m", "y"],
        help="Filter results by time: d=day, w=week, m=month, y=year"
    )
    parser.add_argument(
        "--news",
        action="store_true",
        help="Search news instead of general web"
    )
    parser.add_argument(
        "--region",
        type=str,
        default="us-en",
        help="Region code for localized results (default: us-en)"
    )

    return parser.parse_args()


def search_web(query, max_results=5, time_range=None, region="us-en"):
    """
    Search the web using DuckDuckGo.

    Args:
        query: Search query string
        max_results: Maximum number of results
        time_range: Time filter (d/w/m/y)
        region: Region code

    Returns:
        List of result dictionaries
    """
    try:
        ddgs = DDGS()

        # Build search parameters
        search_params = {
            "keywords": query,
            "region": region,
            "max_results": min(max_results, 10)  # Cap at 10
        }

        # Add time range if specified
        if time_range:
            search_params["timelimit"] = time_range

        # Perform search
        results = ddgs.text(**search_params)

        # Format results
        formatted_results = []
        for result in results:
            formatted_results.append({
                "title": result.get("title", ""),
                "url": result.get("href", result.get("url", "")),
                "snippet": result.get("body", result.get("snippet", ""))
            })

        return formatted_results

    except Exception as e:
        print(f"Error during web search: {e}", file=sys.stderr)
        return []


def search_news(query, max_results=5, time_range=None, region="us-en"):
    """
    Search news using DuckDuckGo.

    Args:
        query: Search query string
        max_results: Maximum number of results
        time_range: Time filter (d/w/m/y)
        region: Region code

    Returns:
        List of result dictionaries
    """
    try:
        ddgs = DDGS()

        # Build search parameters
        search_params = {
            "keywords": query,
            "region": region,
            "max_results": min(max_results, 10)  # Cap at 10
        }

        # Add time range if specified
        if time_range:
            search_params["timelimit"] = time_range

        # Perform news search
        results = ddgs.news(**search_params)

        # Format results
        formatted_results = []
        for result in results:
            formatted_results.append({
                "title": result.get("title", ""),
                "url": result.get("url", result.get("href", "")),
                "snippet": result.get("body", result.get("excerpt", ""))
            })

        return formatted_results

    except Exception as e:
        print(f"Error during news search: {e}", file=sys.stderr)
        return []


def main():
    """Main entry point."""
    args = parse_args()

    # Validate query
    if not args.query or not args.query.strip():
        print("Error: Query cannot be empty", file=sys.stderr)
        sys.exit(1)

    # Perform search
    if args.news:
        results = search_news(
            args.query,
            max_results=args.max_results,
            time_range=args.time_range,
            region=args.region
        )
    else:
        results = search_web(
            args.query,
            max_results=args.max_results,
            time_range=args.time_range,
            region=args.region
        )

    # Output JSON
    output = {
        "results": results,
        "query": args.query,
        "result_count": len(results)
    }

    print(json.dumps(output, indent=2, ensure_ascii=False))

    # Exit with appropriate code
    if not results:
        print("Warning: No results found", file=sys.stderr)

    sys.exit(0)


if __name__ == "__main__":
    main()
