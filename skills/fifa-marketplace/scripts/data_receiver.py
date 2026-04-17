#!/usr/bin/env python3
"""
FIFA Resale — Local Tile Receiver
===================================
GENERATION 7 companion: receives seatmap tile data from the Chrome extension
and writes to CSV. No HTTP requests, no browser automation — pure data sink.

Usage:
  python3 scripts/data_receiver.py

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
COMPLETIONS_PATH = os.path.join(DATA_DIR, "match-completions.json")

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

# Match completions: {performance_id: unix_timestamp}
# Loaded from disk at startup, updated as matches finish.
def load_completions():
    if os.path.exists(COMPLETIONS_PATH):
        try:
            with open(COMPLETIONS_PATH) as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def save_completions(data):
    with open(COMPLETIONS_PATH, "w") as f:
        json.dump(data, f, indent=2)

match_completions = load_completions()

# Global dedup set: (match_label, seat_id)
seen_seats = set()
total_tiles = 0
total_seats = 0
run_start = time.time()

# Per-match accounting for the current run.
# {perf_id: {"label": str, "seats": int, "tiles": int, "captchas": int}}
match_stats = {}

OUTCOME_LABELS = {
    "done": "clean",
    "rate_limited": "flagged",
    "aborted": "stopped",
    "no_product_id": "other",
    "no_perf_id": "other",
}

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

        elif self.path == "/completions":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_cors()
            self.end_headers()
            self.wfile.write(json.dumps(match_completions).encode())

        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        global total_tiles, total_seats

        if self.path == "/completions/clear":
            global match_completions
            match_completions = {}
            save_completions(match_completions)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_cors()
            self.end_headers()
            self.wfile.write(b'{"ok":true}')
            logger.info("Completions cleared")
            return

        if self.path == "/complete":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_cors()
            self.end_headers()
            self.wfile.write(b'{"ok":true}')
            try:
                payload = json.loads(body)
                perf_id = payload.get("performance_id", "")
                match_code = payload.get("match_code", perf_id)
                reason = payload.get("reason", "done")
                outcome = OUTCOME_LABELS.get(reason, reason)
                if perf_id:
                    stat = match_stats.get(perf_id, {"seats": 0, "tiles": 0})
                    # Newline first so we don't clobber the in-place tile line.
                    print()
                    if stat["seats"] == 0:
                        banner = "!" * 70
                        logger.warning(banner)
                        logger.warning(
                            f"!!! ZERO SEATS: {match_code} ({perf_id}) — "
                            f"{stat['tiles']} tiles, reason={reason}"
                        )
                        logger.warning("!!! NOT marking complete — match stays eligible for retry.")
                        logger.warning(banner)
                    elif outcome == "flagged":
                        logger.warning(
                            f"MATCH {match_code} — {stat['seats']} seats "
                            f"({stat['tiles']} tiles) — FLAGGED (incomplete, not marking complete)"
                        )
                    else:
                        match_completions[perf_id] = time.time()
                        save_completions(match_completions)
                        logger.info(
                            f"MATCH {match_code} — {stat['seats']} seats "
                            f"({stat['tiles']} tiles) — {outcome}"
                        )
            except Exception as e:
                logger.warning(f"Completion parse error: {e}")
            return

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

        # Per-match bookkeeping — key by performanceId so we can summarize
        # on /complete even if the label changes over the run.
        perf_id = parse_qs(urlparse(url).query).get("performanceId", ["unknown"])[0]
        stat = match_stats.setdefault(perf_id, {
            "label": match_label, "seats": 0, "tiles": 0, "captchas": 0,
        })
        stat["label"] = match_label
        stat["tiles"] += 1

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
            stat["seats"] += len(new_rows)

        elapsed = int(time.time() - run_start)
        line = (
            f"  [{elapsed:4d}s] tiles={total_tiles:4d}  seats={total_seats:5d}  "
            f"match={match_label}"
        )
        print("\r" + line.ljust(100), end="", flush=True)


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
