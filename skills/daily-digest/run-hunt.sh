#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$SCRIPT_DIR/logs"
ARC_DIR="$LOG_DIR/arc"
RUN_LOG="$LOG_DIR/hunt-run.log"

mkdir -p "$LOG_DIR" "$ARC_DIR"
cd "$SCRIPT_DIR"

# Weekly log rotation: archive if log is from a previous week
if [[ -f "$RUN_LOG" ]]; then
  log_mod=$(stat -f %m "$RUN_LOG")
  log_week=$(date -r "$log_mod" +%G-%V)
  curr_week=$(date +%G-%V)
  if [[ "$log_week" != "$curr_week" ]]; then
    log_date=$(date -r "$log_mod" +%Y-%m-%d)
    mv "$RUN_LOG" "$ARC_DIR/hunt-run-${log_date}.log"
  fi
fi

if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed or not in PATH" >&2
    exit 1
fi

if ! command -v npx &> /dev/null; then
    echo "ERROR: npx is not available (should come with npm)" >&2
    exit 1
fi

if [ ! -d "node_modules" ]; then
    echo "Dependencies not found. Installing..." >&2
    if ! npm install; then
        echo "ERROR: Failed to install dependencies" >&2
        exit 1
    fi
fi

if [ ! -f "social-searcher.ts" ]; then
    echo "ERROR: social-searcher.ts not found" >&2
    exit 1
fi

if [ ! -f "cfg/social-search-config.json" ]; then
    echo "ERROR: cfg/social-search-config.json not found" >&2
    exit 1
fi

BROWSER_PROFILE_DIR="$HOME/.openclaw/browser-profiles/daily-digest"
mkdir -p "$BROWSER_PROFILE_DIR"

{
  echo "[$(date +"%Y-%m-%d %H:%M:%S %Z")] Starting social media hunt"
  npx tsx social-searcher.ts "$@"
  echo "[$(date +"%Y-%m-%d %H:%M:%S %Z")] Hunt completed successfully"
} >> "$RUN_LOG" 2>&1
