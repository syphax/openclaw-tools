#!/usr/bin/env python3
"""
FIFA Resale — Local Tile Receiver
===================================
GENERATION 7 companion: receives seatmap tile data from the Chrome extension
and writes to CSV. No HTTP requests, no browser automation — pure data sink.

Usage:
  python3 scripts/receive_tiles.py

Then install the extension in Chrome (chrome://extensions → Load unpacked →
select skills/fifa-marketplace/extension/) and browse the seatmap. The popup
will show "Receiver: online" when this server is running.

Output files are written to data/ as tiles arrive. Press Ctrl+C to stop and
finalize the CSV.
"""

import csv
import json
import logging
import os
import re
import sys
import time
from datetime import datetime
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SKILL_DIR  = os.path.dirname(SCRIPT_DIR)
DATA_DIR   = os.path.join(SKILL_DIR, "data")
LOG_DIR    = os.path.join(SKILL_DIR, "logs")
DEBUG_DIR  = os.path.join(SKILL_DIR, "debug")

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(LOG_DIR, exist_ok=True)
os.makedirs(DEBUG_DIR, exist_ok=True)

PORT = 7227
LOG_PATH = os.path.join(LOG_DIR, "fifa-marketplace.log")
COMBINED_CSV_PATH = os.path.join(DATA_DIR, "fifa-resale-tickets.csv")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_PATH),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("fifa-receiver")

CSV_FIELDNAMES = [
    "Pull Date", "Pull Time", "Match", "Category", "Section",
    "Area", "Row", "Seat", "Raw Amount", "Price", "Price w/ Fees", "Location",
]

# ── State ─────────────────────────────────────────────────────────────

# Global dedup set: (match_label, seat_id)
seen_seats = set()
total_tiles = 0
total_seats = 0
run_start = time.time()

# Timestamped CSV for this run
run_csv_path = os.path.join(DATA_DIR, f"fifa-resale-tickets-{datetime.now().strftime('%Y-%m-%d-%H-%M')}.csv")


def extract_match_label(url):
    """Extract performanceId from the tile URL and use as match label.

    If we have a cached matches.json, try to look up the match code.
    """
    qs = parse_qs(urlparse(url).query)
    perf_id = qs.get("performanceId", ["unknown"])[0]

    # Try to look up a friendly code from matches.json
    matches_path = os.path.join(SKILL_DIR, "cfg", "matches.json")
    if os.path.exists(matches_path):
        try:
            with open(matches_path) as f:
                matches = json.load(f)
            for m in matches:
                if m.get("performance_id") == perf_id:
                    return m.get("match_code") or perf_id, m.get("location", "")
        except Exception:
            pass

    return perf_id, ""


def seat_to_row(feat, match_label, location):
    props = feat.get("properties", {})
    raw_amount = props.get("amount", 0)
    price = raw_amount / 1000.0
    now = datetime.now()
    return {
        "Pull Date":     now.strftime("%Y-%m-%d"),
        "Pull Time":     now.strftime("%H:%M"),
        "Match":         match_label,
        "Category":      props.get("seatCategory", ""),
        "Section":       props.get("block", {}).get("name", {}).get("en", ""),
        "Area":          props.get("area", {}).get("name", {}).get("en", ""),
        "Row":           props.get("row", ""),
        "Seat":          props.get("number", ""),
        "Raw Amount":    raw_amount,
        "Price":         f"{price:.2f}",
        "Price w/ Fees": f"{price * 1.15:.2f}",
        "Location":      location,
    }


def append_rows(rows):
    for path in (run_csv_path, COMBINED_CSV_PATH):
        file_exists = os.path.exists(path) and os.path.getsize(path) > 0
        with open(path, "a", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=CSV_FIELDNAMES)
            if not file_exists:
                writer.writeheader()
            writer.writerows(rows)


# ── HTTP handler ──────────────────────────────────────────────────────

class TileHandler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        pass  # suppress default access log; we have our own

    def send_cors(self):
        self.send_header("Access-Control-Allow-Origin", "https://fwc26-resale-usd.tickets.fifa.com")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_cors()
        self.end_headers()

    def do_GET(self):
        if self.path == "/ping":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_cors()
            self.end_headers()
            self.wfile.write(json.dumps({
                "status": "ok",
                "tiles": total_tiles,
                "seats": total_seats,
                "uptime": int(time.time() - run_start),
            }).encode())

        elif self.path == "/matches":
            matches_path = os.path.join(SKILL_DIR, "cfg", "matches.json")
            if not os.path.exists(matches_path):
                self.send_response(404)
                self.send_header("Content-Type", "application/json")
                self.send_cors()
                self.end_headers()
                self.wfile.write(b'{"error":"matches.json not found"}')
                return
            with open(matches_path) as f:
                matches = json.load(f)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_cors()
            self.end_headers()
            self.wfile.write(json.dumps(matches).encode())

        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        global total_tiles, total_seats

        if self.path != "/tile":
            self.send_response(404)
            self.end_headers()
            return

        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_cors()
        self.end_headers()
        self.wfile.write(b'{"ok":true}')

        try:
            payload = json.loads(body)
        except Exception as e:
            logger.warning(f"JSON parse error: {e}")
            return

        url      = payload.get("url", "")
        features = payload.get("features", [])
        total_tiles += 1

        match_label, location = extract_match_label(url)

        new_rows = []
        for feat in features:
            seat_id = feat.get("id") or feat.get("properties", {}).get("id")
            key = (match_label, seat_id)
            if seat_id and key not in seen_seats:
                seen_seats.add(key)
                new_rows.append(seat_to_row(feat, match_label, location))

        if new_rows:
            append_rows(new_rows)
            total_seats += len(new_rows)

        elapsed = int(time.time() - run_start)
        print(
            f"\r  [{elapsed:4d}s] tiles={total_tiles:4d}  seats={total_seats:5d}  "
            f"match={match_label}  +{len(new_rows)} new",
            end="", flush=True,
        )


# ── Main ──────────────────────────────────────────────────────────────

def main():
    print("=" * 70)
    print("FIFA Resale — Tile Receiver")
    print("=" * 70)
    print(f"\nListening on http://127.0.0.1:{PORT}")
    print(f"Run CSV:  {run_csv_path}")
    print(f"Combined: {COMBINED_CSV_PATH}")
    print()
    print("Install the extension, navigate to a match seatmap, then either:")
    print("  • Browse manually (pan/zoom) — tiles are captured as they load")
    print("  • Click 'Start Autopan' in the extension popup")
    print()
    print("Press Ctrl+C to stop.\n")

    server = HTTPServer(("127.0.0.1", PORT), TileHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print(f"\n\nStopped. Final: {total_tiles} tiles, {total_seats} unique seats.")
        print(f"Run CSV:  {run_csv_path}")
        print(f"Combined: {COMBINED_CSV_PATH}")
        logger.info(f"Session ended: {total_tiles} tiles, {total_seats} seats")


if __name__ == "__main__":
    main()
