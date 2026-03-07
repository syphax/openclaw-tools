#!/bin/bash
set -euo pipefail

BASE_DIR="/Users/bcc/Code/git/openclaw-tools/skills/social-searcher"
LOG_DIR="$BASE_DIR/logs"
STATUS_FILE="$LOG_DIR/last-run-status.json"
RUN_LOG="$LOG_DIR/cron-digest-run.log"

mkdir -p "$LOG_DIR"
cd "$BASE_DIR"

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

{
  echo "[$(date +"%Y-%m-%d %H:%M:%S %Z")] Starting Daily Digest"
  npx tsx daily-digest.ts
  echo "[$(date +"%Y-%m-%d %H:%M:%S %Z")] Daily Digest completed successfully"
} >> "$RUN_LOG" 2>&1 && {
  cat > "$STATUS_FILE" <<EOJSON
{"date":"$local_date","start":"$start_ts","status":"success","error":null}
EOJSON
  exit 0
}

err="Daily Digest failed. See $RUN_LOG"
cat > "$STATUS_FILE" <<EOJSON
{"date":"$local_date","start":"$start_ts","status":"failure","error":"$err"}
EOJSON
exit 1
