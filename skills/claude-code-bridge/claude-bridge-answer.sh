#!/usr/bin/env bash
# claude-bridge-answer.sh — Send an answer to a pending Claude Code question.
# Writes answer.json atomically for the bridge to pick up.

set -euo pipefail

BRIDGE_HOME="${HOME}/.claude-bridge"
TASKS_DIR="${BRIDGE_HOME}/tasks"

TASK_ID=""
ANSWER=""

usage() {
    cat <<EOF
Usage: claude-bridge-answer.sh [OPTIONS]

Send an answer to a pending question from Claude Code.

Options:
  -t, --task-id ID      task to answer (required)
  -a, --answer TEXT     answer text (required)
  -h, --help            show this help

Examples:
  claude-bridge-answer.sh -t fix-api -a "Use REST with Flask"
  claude-bridge-answer.sh --task-id my-task --answer "Python"
EOF
    exit 0
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        -t|--task-id)  TASK_ID="$2";  shift 2 ;;
        -a|--answer)   ANSWER="$2";   shift 2 ;;
        -h|--help)     usage ;;
        *) echo "Unknown option: $1"; usage ;;
    esac
done

# ── Validate ──────────────────────────────────────────────
if [[ -z "$TASK_ID" ]]; then
    echo "Error: --task-id is required"
    exit 1
fi

if [[ -z "$ANSWER" ]]; then
    echo "Error: --answer is required"
    exit 1
fi

TASK_DIR="$TASKS_DIR/$TASK_ID"
if [[ ! -d "$TASK_DIR" ]]; then
    echo "Error: task '$TASK_ID' not found"
    exit 1
fi

# Check if task is actually waiting for an answer
if [[ -f "$TASK_DIR/status.json" ]]; then
    STATUS=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('status',''))" "$TASK_DIR/status.json" 2>/dev/null || echo "")
    if [[ "$STATUS" != "waiting_for_answer" ]]; then
        echo "Warning: task status is '$STATUS', not 'waiting_for_answer'"
    fi
fi

# ── Write answer atomically ──────────────────────────────
ANSWER_FILE="$TASK_DIR/answer.json"
TMP_FILE="$TASK_DIR/answer.json.tmp"

python3 -c "
import json, sys
from datetime import datetime
data = {
    'text': sys.argv[1],
    'answered_at': datetime.now().isoformat(),
}
with open(sys.argv[2], 'w') as f:
    json.dump(data, f, indent=2)
" "$ANSWER" "$TMP_FILE"

mv "$TMP_FILE" "$ANSWER_FILE"

echo "Answer sent to task '$TASK_ID'."
