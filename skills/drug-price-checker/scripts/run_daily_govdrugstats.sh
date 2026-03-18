#!/bin/bash
set -euo pipefail

BASE_DIR="/Users/bcc/Code/git/openclaw-tools/skills/drug-price-checker"
LOG_DIR="$BASE_DIR/logs"
ARC_DIR="$LOG_DIR/arc"
STATUS_FILE="$LOG_DIR/last-run-status-govdrugstats.json"
RUN_LOG="$LOG_DIR/govdrugstats-run.log"

mkdir -p "$LOG_DIR" "$ARC_DIR"
cd "$BASE_DIR"

# Weekly log rotation: archive if log is from a previous week
if [[ -f "$RUN_LOG" ]]; then
  log_mod=$(stat -f %m "$RUN_LOG")
  log_week=$(date -r "$log_mod" +%G-%V)
  curr_week=$(date +%G-%V)
  if [[ "$log_week" != "$curr_week" ]]; then
    log_date=$(date -r "$log_mod" +%Y-%m-%d)
    mv "$RUN_LOG" "$ARC_DIR/govdrugstats-run-${log_date}.log"
  fi
fi

PYTHON=/opt/homebrew/bin/python3

start_ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
local_date=$(date +"%Y-%m-%d")

echo "[$(date +"%Y-%m-%d %H:%M:%S %Z")] Starting GovDrugStats (trumprx.gov) scrape" >> "$RUN_LOG" 2>&1
"$PYTHON" -c "import runpy; runpy.run_path('scripts/scrape_drugs.py', run_name='__main__')" >> "$RUN_LOG" 2>&1 && SCRAPE_EXIT=0 || SCRAPE_EXIT=$?

if [[ $SCRAPE_EXIT -eq 0 ]]; then
  echo "[$(date +"%Y-%m-%d %H:%M:%S %Z")] Scrape completed successfully" >> "$RUN_LOG"
  cat > "$STATUS_FILE" <<EOJSON
{"date":"$local_date","start":"$start_ts","status":"success","error":null}
EOJSON
  exit 0
else
  echo "[$(date +"%Y-%m-%d %H:%M:%S %Z")] Scrape FAILED (exit $SCRAPE_EXIT)" >> "$RUN_LOG"
  err="Scrape failed with exit $SCRAPE_EXIT. See $RUN_LOG"
  cat > "$STATUS_FILE" <<EOJSON
{"date":"$local_date","start":"$start_ts","status":"failure","error":"$err"}
EOJSON
  exit 1
fi
