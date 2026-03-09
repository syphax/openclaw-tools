#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$SCRIPT_DIR/logs"
ARC_DIR="$LOG_DIR/arc"
RUN_LOG="$LOG_DIR/pulse-run.log"

mkdir -p "$LOG_DIR" "$ARC_DIR"
cd "$SCRIPT_DIR"

# Weekly log rotation: archive if log is from a previous week
if [[ -f "$RUN_LOG" ]]; then
  log_mod=$(stat -f %m "$RUN_LOG")
  log_week=$(date -r "$log_mod" +%G-%V)
  curr_week=$(date +%G-%V)
  if [[ "$log_week" != "$curr_week" ]]; then
    log_date=$(date -r "$log_mod" +%Y-%m-%d)
    mv "$RUN_LOG" "$ARC_DIR/pulse-run-${log_date}.log"
  fi
fi

{
  echo "[$(date +"%Y-%m-%d %H:%M:%S %Z")] Starting Reddit pulse"
  npx tsx reddit-pulse.ts "$@"
  echo "[$(date +"%Y-%m-%d %H:%M:%S %Z")] Reddit pulse completed successfully"
} >> "$RUN_LOG" 2>&1
