#!/usr/bin/env bash
# codex-bridge-dispatch.sh - Dispatch a task to OpenAI Codex via the local CLI bridge.

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "$0")" && pwd)"
BRIDGE_HOME="${HOME}/.codex-bridge"
TASKS_DIR="${BRIDGE_HOME}/tasks"

TASK_ID=""
WORKDIR="$(pwd)"
PROMPT=""

usage() {
    cat <<EOF
Usage: codex-bridge-dispatch.sh [OPTIONS]

Dispatch a coding task to Codex with status polling and answerable clarifying questions.

Options:
  -t, --task-id NAME    task identifier (default: task-<timestamp>)
  -w, --workdir DIR     working directory for Codex (default: cwd)
  -p, --prompt TEXT     prompt to send to Codex (required)
  -h, --help            show this help

Examples:
  codex-bridge-dispatch.sh -t fix-api -w ~/projects/myapp -p "Fix the null check in api.py"
  codex-bridge-dispatch.sh --prompt "Write a Python CSV parser"
EOF
    exit 0
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        -t|--task-id) TASK_ID="$2"; shift 2 ;;
        -w|--workdir) WORKDIR="$2"; shift 2 ;;
        -p|--prompt)  PROMPT="$2"; shift 2 ;;
        -h|--help)    usage ;;
        *) echo "Unknown option: $1"; usage ;;
    esac
done

if [[ -z "$PROMPT" ]]; then
    echo "Error: --prompt is required"
    exit 1
fi

if ! command -v codex >/dev/null 2>&1; then
    echo "Error: codex CLI not found in PATH"
    echo "Install Codex desktop/CLI and ensure 'codex' is available."
    exit 1
fi

if [[ ! -d "$WORKDIR" ]]; then
    echo "Error: workdir does not exist: $WORKDIR"
    exit 1
fi

if [[ -z "$TASK_ID" ]]; then
    TASK_ID="task-$(date +%Y%m%d-%H%M%S)"
fi

if [[ -d "$TASKS_DIR/$TASK_ID" ]]; then
    echo "Error: task '$TASK_ID' already exists at $TASKS_DIR/$TASK_ID"
    exit 1
fi

mkdir -p "$TASKS_DIR/$TASK_ID"

nohup python3 "$SKILL_DIR/bridge.py" \
    --task-id "$TASK_ID" \
    --workdir "$WORKDIR" \
    --prompt "$PROMPT" \
    >> "$TASKS_DIR/$TASK_ID/bridge.launch.log" 2>&1 &

BRIDGE_PID=$!
echo "$BRIDGE_PID" > "$TASKS_DIR/$TASK_ID/bridge.pid"

sleep 1
if ! kill -0 "$BRIDGE_PID" 2>/dev/null; then
    echo "Error: bridge failed to start. Check: $TASKS_DIR/$TASK_ID/bridge.launch.log"
    exit 1
fi

echo "Task '$TASK_ID' dispatched."
echo ""
echo "  Status:    $SKILL_DIR/codex-bridge-status.sh -t $TASK_ID"
echo "  Output:    $SKILL_DIR/codex-bridge-status.sh -t $TASK_ID --output"
echo "  Question:  $SKILL_DIR/codex-bridge-status.sh -t $TASK_ID --question"
echo "  Answer:    $SKILL_DIR/codex-bridge-answer.sh -t $TASK_ID -a '<text>'"
echo "  Result:    $SKILL_DIR/codex-bridge-status.sh -t $TASK_ID --result"
echo "  Kill:      kill $BRIDGE_PID"
echo "  Log:       $TASKS_DIR/$TASK_ID/bridge.log"
