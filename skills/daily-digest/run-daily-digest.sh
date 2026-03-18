#!/bin/bash
set -euo pipefail

BASE_DIR="/Users/bcc/Code/git/openclaw-tools/skills/daily-digest"
LOG_DIR="$BASE_DIR/logs"
ARC_DIR="$LOG_DIR/arc"
STATUS_FILE="$LOG_DIR/last-run-status.json"
RUN_LOG="$LOG_DIR/daily-digest-run.log"

mkdir -p "$LOG_DIR" "$ARC_DIR"
cd "$BASE_DIR"

# Weekly log rotation: archive if log is from a previous week
if [[ -f "$RUN_LOG" ]]; then
  log_mod=$(stat -f %m "$RUN_LOG")
  log_week=$(date -r "$log_mod" +%G-%V)
  curr_week=$(date +%G-%V)
  if [[ "$log_week" != "$curr_week" ]]; then
    log_date=$(date -r "$log_mod" +%Y-%m-%d)
    mv "$RUN_LOG" "$ARC_DIR/daily-digest-run-${log_date}.log"
  fi
fi

# Load credentials from secure store — overrides any env vars set by calling process
CREDS_ENV="$HOME/.openclaw/credentials/.env"
if [[ -f "$CREDS_ENV" ]]; then
  while IFS='=' read -r key value; do
    [[ "$key" =~ ^#.*$ || -z "$key" ]] && continue
    export "$key=$value"
  done < "$CREDS_ENV"
fi

start_ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
local_date=$(date +"%Y-%m-%d")
current_tz=$(readlink /etc/localtime 2>/dev/null | sed 's#^.*/zoneinfo/##' || echo "unknown")
expected_tz="America/New_York"

# Idempotency guard: skip if already delivered successfully today
if [[ -f "$STATUS_FILE" ]] && \
   grep -q "\"date\":\"${local_date}\"" "$STATUS_FILE" && \
   grep -q "\"status\":\"success\"" "$STATUS_FILE"; then
  echo "[$(date +"%Y-%m-%d %H:%M:%S %Z")] Digest already delivered today (${local_date}), skipping." >> "$RUN_LOG"
  exit 0
fi

set +e
{
  echo "[$(date +"%Y-%m-%d %H:%M:%S %Z")] Starting Daily Digest"
  echo "[$(date +"%Y-%m-%d %H:%M:%S %Z")] Host timezone: ${current_tz} (expected ${expected_tz})"
  if [[ "$current_tz" != "$expected_tz" ]]; then
    echo "[$(date +"%Y-%m-%d %H:%M:%S %Z")] WARNING: Host timezone mismatch may shift launchd schedule."
  fi
  npx tsx daily-digest.ts
}
run_exit=$?
set -e

if [[ $run_exit -eq 0 ]]; then
  echo "[$(date +"%Y-%m-%d %H:%M:%S %Z")] Daily Digest completed successfully" >> "$RUN_LOG"
  cat > "$STATUS_FILE" <<EOJSON
{"date":"$local_date","start":"$start_ts","status":"success","error":null}
EOJSON
  exit 0
fi

echo "[$(date +"%Y-%m-%d %H:%M:%S %Z")] Daily Digest failed (exit $run_exit)" >> "$RUN_LOG"
err="Daily Digest failed with exit $run_exit. See $RUN_LOG"
cat > "$STATUS_FILE" <<EOJSON
{"date":"$local_date","start":"$start_ts","status":"failure","error":"$err"}
EOJSON
exit $run_exit
