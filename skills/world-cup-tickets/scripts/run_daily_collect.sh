#!/bin/bash
set -euo pipefail

BASE_DIR="/Users/bcc/Code/git/openclaw-tools/skills/world-cup-tickets"
LOG_DIR="$BASE_DIR/logs"
ARC_DIR="$LOG_DIR/arc"
STATUS_FILE="$LOG_DIR/last-run-status-collect.json"
RUN_LOG="$LOG_DIR/collect-run.log"

mkdir -p "$LOG_DIR" "$ARC_DIR"
cd "$BASE_DIR"

# Weekly log rotation: archive if log is from a previous week
if [[ -f "$RUN_LOG" ]]; then
  log_mod=$(stat -f %m "$RUN_LOG")
  log_week=$(date -r "$log_mod" +%G-%V)
  curr_week=$(date +%G-%V)
  if [[ "$log_week" != "$curr_week" ]]; then
    log_date=$(date -r "$log_mod" +%Y-%m-%d)
    mv "$RUN_LOG" "$ARC_DIR/collect-run-${log_date}.log"
  fi
fi

start_ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
local_date=$(date +"%Y-%m-%d")

{
  echo "[$(date +"%Y-%m-%d %H:%M:%S %Z")] Starting FIFA Collect ticket scrape"
  python3 -c "import runpy; runpy.run_path('scripts/scrape_tickets_collect.py', run_name='__main__')"
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
