#!/bin/bash
set -euo pipefail

BASE_DIR="/Users/bcc/Code/git/openclaw-tools/skills/world-cup-tickets"
LOG_DIR="$BASE_DIR/logs"
STATUS_FILE="$LOG_DIR/last-run-status.json"
RUN_LOG="$LOG_DIR/cron-stubhub-run.log"

mkdir -p "$LOG_DIR"
cd "$BASE_DIR"

start_ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
local_date=$(date +"%Y-%m-%d")

{
  echo "[$(date +"%Y-%m-%d %H:%M:%S %Z")] Starting StubHub world-cup ticket scrape"
  python3 -c "import runpy; runpy.run_path('scripts/scrape_tickets_stubhub.py', run_name='__main__')"
  echo "[$(date +"%Y-%m-%d %H:%M:%S %Z")] Scrape completed successfully"
} >> "$RUN_LOG" 2>&1 && {
  cat > "$STATUS_FILE" <<EOJSON
{"date":"$local_date","start":"$start_ts","status":"success","error":null}
EOJSON
  exit 0
}

err="Scrape failed. See $RUN_LOG"
cat > "$STATUS_FILE" <<EOJSON
{"date":"$local_date","start":"$start_ts","status":"failure","error":"$err"}
EOJSON
exit 1
