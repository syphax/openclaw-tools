#!/usr/bin/env python3
"""
FIFA Resale — Request Diagnostics (raw WebSocket CDP)

Connects directly to the Chrome DevTools WebSocket for the FIFA seatmap tab
and listens for Network events. The WebSocket is local-only (127.0.0.1) and
invisible to FIFA/DataDome — all requests still originate from real Chrome.

Usage:
  1. Launch Chrome:
       /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
         --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug
  2. Log in and open a match seatmap page
  3. Run this script, then REFRESH the seatmap page in Chrome
"""

import json
import sys
import time
import threading
import websocket  # pip install websocket-client
import requests
from urllib.parse import urlparse, parse_qs

CHROME_PORT = 9222
FIFA_HOST = "fwc26-resale-usd.tickets.fifa.com"
SKIP_EXTS = (".js", ".css", ".png", ".ico", ".woff", ".woff2", ".svg", ".gif")
msg_id = [1]


def is_interesting(url):
    if FIFA_HOST not in url:
        return False
    return not any(url.split("?")[0].endswith(ext) for ext in SKIP_EXTS)


def on_message(ws, raw):
    msg = json.loads(raw)
    method = msg.get("method", "")

    if method == "Network.requestWillBeSent":
        params = msg["params"]
        url = params["request"]["url"]
        if not is_interesting(url):
            return
        headers = params["request"]["headers"]
        parsed = urlparse(url)
        qs = parse_qs(parsed.query)

        print("\n" + "=" * 70)
        print(f"REQUEST: {params['request']['method']} {parsed.path}")
        print("=" * 70)
        print(f"Full URL: {url[:200]}")
        if qs:
            print("\nQuery params:")
            for k, v in sorted(qs.items()):
                print(f"  {k}: {v[0]}")
        print("\nHeaders:")
        for k, v in sorted(headers.items()):
            print(f"  {k}: {v}")
        print()

    elif method == "Network.responseReceived":
        params = msg["params"]
        url = params["response"]["url"]
        if not is_interesting(url):
            return
        status = params["response"]["status"]
        parsed = urlparse(url)
        print(f"  → HTTP {status} {parsed.path}")


def on_error(ws, error):
    print(f"WebSocket error: {error}")


def on_close(ws, *args):
    print("WebSocket closed.")


def on_open(ws):
    # Enable Network domain
    ws.send(json.dumps({"id": msg_id[0], "method": "Network.enable", "params": {}}))
    msg_id[0] += 1
    print("Network monitoring enabled. REFRESH the seatmap page in Chrome now.\n")


def main():
    print("=" * 70)
    print("FIFA Resale — Request Diagnostics (raw WebSocket CDP)")
    print("=" * 70)

    # Find the FIFA seatmap tab
    try:
        tabs = requests.get(f"http://127.0.0.1:{CHROME_PORT}/json").json()
    except Exception as e:
        print(f"Can't reach Chrome on port {CHROME_PORT}: {e}")
        sys.exit(1)

    fifa_tabs = [t for t in tabs if FIFA_HOST in t.get("url", "") and t.get("type") == "page"]
    if not fifa_tabs:
        print(f"No open tab found for {FIFA_HOST}.")
        print("Open the seatmap page in Chrome first.")
        sys.exit(1)

    tab = fifa_tabs[0]
    ws_url = tab["webSocketDebuggerUrl"]
    print(f"\nConnecting to tab: {tab['title'][:60]}")
    print(f"WebSocket: {ws_url}\n")

    ws = websocket.WebSocketApp(
        ws_url,
        on_open=on_open,
        on_message=on_message,
        on_error=on_error,
        on_close=on_close,
    )

    print("Press Ctrl+C to stop.\n")
    try:
        ws.run_forever(origin=f"http://127.0.0.1:{CHROME_PORT}")
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
