#!/bin/bash
set -euo pipefail

HEALTH_LOG="$HOME/.openclaw/logs/daily-cron-status.log"

now=$(date +%s)
THRESHOLD_SEC=7200 # 2 hours
SUMMARY=""

function check_file_recent() {
  local f="$1"
  if [[ -f "$f" ]]; then
    local m=$(stat -f %m "$f" 2>/dev/null)
    if [[ -n "$m" ]]; then
      local diff=$((now - m))
      if (( diff < THRESHOLD_SEC )); then
        return 0
      fi
    fi
  fi
  return 1
}

run_ok=true

# 1. Check Daily Digest
DIGEST_LOG="/Users/bcc/Code/git/openclaw-tools/skills/daily-digest/logs/daily-digest-run.log"
if check_file_recent "$DIGEST_LOG"; then
  SUMMARY+="DailyDigest:OK. "
else
  SUMMARY+="DailyDigest:MISSING(running now). "
  run_ok=false
  /Users/bcc/Code/git/openclaw-tools/skills/daily-digest/run-daily-digest.sh >> "$DIGEST_LOG" 2>&1 || SUMMARY+="DailyDigest:RE-RUN_FAILED. "
fi

# 2. Check World Cup Tickets
WC_LOG="/Users/bcc/Code/git/openclaw-tools/skills/world-cup-tickets/logs/world-cup-tickets-run.log"
if check_file_recent "$WC_LOG"; then
  SUMMARY+="WorldCup:OK. "
else
  SUMMARY+="WorldCup:MISSING(running scripts). "
  run_ok=false
  /Users/bcc/Code/git/openclaw-tools/skills/world-cup-tickets/scripts/run_daily.sh >> "$WC_LOG" 2>&1 || SUMMARY+="WorldCup:RE-RUN_FAILED. "
fi

# 3. Check Drug Price Checker
DPC_LOG="/Users/bcc/Code/git/openclaw-tools/skills/drug-price-checker/logs/drug-price-checker-run.log"
if check_file_recent "$DPC_LOG"; then
  SUMMARY+="DrugPriceChecker:OK. "
else
  SUMMARY+="DrugPriceChecker:MISSING(running now). "
  run_ok=false
  /Users/bcc/Code/git/openclaw-tools/skills/drug-price-checker/scripts/run_daily.sh >> "$DPC_LOG" 2>&1 || SUMMARY+="DrugPriceChecker:RE-RUN_FAILED. "
fi

# Log the summary
mkdir -p "$HOME/.openclaw/logs"
DATE_STR=$(date)
echo "[$DATE_STR] Status: $run_ok | Summary: $SUMMARY" >> "$HEALTH_LOG"
