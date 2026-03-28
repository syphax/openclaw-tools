#!/bin/bash
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT=3100
BASE="http://localhost:${PORT}/api"

# Check if server is running
server_alive() {
  curl -sf "${BASE}/pomo/status" >/dev/null 2>&1
}

# Start server if not running
ensure_server() {
  if server_alive; then
    return 0
  fi

  echo "Starting time-tracker server..." >&2
  bash "${SKILL_DIR}/scripts/start.sh" &
  disown

  # Wait up to 10 seconds for it to come up
  for i in $(seq 1 20); do
    sleep 0.5
    if server_alive; then
      echo "Server ready." >&2
      return 0
    fi
  done

  echo "Error: server failed to start within 10 seconds." >&2
  exit 1
}

ensure_server

# Parse arguments
ACTION="start"
TASK=""
PROJECT=""
WORK=""
CYCLE=""
EXTEND=""
ORIGIN="${POMO_ORIGIN:-cli}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -t) TASK="$2"; shift 2 ;;
    -p) PROJECT="$2"; shift 2 ;;
    -w) WORK="$2"; shift 2 ;;
    -c) CYCLE="$2"; shift 2 ;;
    -s) ACTION="stop"; shift ;;
    -e) ACTION="extend"; EXTEND="$2"; shift 2 ;;
    -h) ACTION="help"; shift ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

case "$ACTION" in
  help)
    curl -s "${BASE}/pomo/help" | python3 -m json.tool
    ;;
  stop)
    curl -s -X POST "${BASE}/pomo/stop" | python3 -m json.tool
    ;;
  extend)
    curl -s -X POST "${BASE}/pomo/extend" \
      -H 'Content-Type: application/json' \
      -d "{\"minutes\":${EXTEND}}" | python3 -m json.tool
    ;;
  start)
    # Build JSON body with only provided fields
    BODY="{\"origin\":\"${ORIGIN}\""
    [[ -n "$TASK" ]]    && BODY="${BODY},\"task\":\"${TASK}\""
    [[ -n "$PROJECT" ]] && BODY="${BODY},\"project\":\"${PROJECT}\""
    [[ -n "$WORK" ]]    && BODY="${BODY},\"work\":${WORK}"
    [[ -n "$CYCLE" ]]   && BODY="${BODY},\"cycle\":${CYCLE}"
    BODY="${BODY}}"

    curl -s -X POST "${BASE}/pomo/start" \
      -H 'Content-Type: application/json' \
      -d "$BODY" | python3 -m json.tool
    ;;
esac
