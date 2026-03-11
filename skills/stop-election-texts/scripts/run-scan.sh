#!/usr/bin/env bash
# run-scan.sh — periodic scan wrapper for stop-election-texts
# Intended for cron; sources credentials, logs output.
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="$SKILL_DIR/logs/scan-run.log"
LOG_MAX_LINES=5000

# ── Credentials ──────────────────────────────────────────────────────────────
CREDS="$HOME/.openclaw/credentials/.env"
if [[ -f "$CREDS" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$CREDS"
  set +a
fi

# ── Logging ───────────────────────────────────────────────────────────────────
mkdir -p "$SKILL_DIR/logs"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

# Weekly log rotation
ARC_DIR="$SKILL_DIR/logs/arc"
mkdir -p "$ARC_DIR"
if [[ -f "$LOG_FILE" ]]; then
  line_count=$(wc -l < "$LOG_FILE")
  if (( line_count > LOG_MAX_LINES )); then
    arc_name="$ARC_DIR/scan-run-$(date '+%Y-%m-%d').log"
    mv "$LOG_FILE" "$arc_name"
    log "Log rotated → $arc_name"
  fi
fi

log "=== Stop Election Texts Scan ==="
log "DIR: $SKILL_DIR"

cd "$SKILL_DIR"
npx tsx scripts/stop-election-texts.ts scan "$@" 2>&1 | tee -a "$LOG_FILE"

log "=== Done ==="
