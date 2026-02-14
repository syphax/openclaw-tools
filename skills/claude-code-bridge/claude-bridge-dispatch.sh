#!/usr/bin/env bash
# claude-bridge-dispatch.sh — Dispatch a task to Claude Code via the Python bridge.
# No external dependencies beyond python3 (with claude-agent-sdk in venv).

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_PYTHON="${SKILL_DIR}/.venv/bin/python3"
BRIDGE_HOME="${HOME}/.claude-bridge"
TASKS_DIR="${BRIDGE_HOME}/tasks"

TASK_ID=""
WORKDIR="$(pwd)"
PROMPT=""

# ── Usage ─────────────────────────────────────────────────
usage() {
    cat <<EOF
Usage: claude-bridge-dispatch.sh [OPTIONS]

Dispatch a coding task to Claude Code with two-way communication.

Options:
  -t, --task-id NAME    task identifier (default: task-<timestamp>)
  -w, --workdir DIR     working directory for Claude Code (default: cwd)
  -p, --prompt TEXT     prompt to send to Claude Code (required)
  -h, --help            show this help

Examples:
  claude-bridge-dispatch.sh -t fix-api -w ~/projects/myapp -p "Fix the null check in api.py"
  claude-bridge-dispatch.sh --prompt "Write a Python CSV parser"
EOF
    exit 0
}

# ── Parse args ────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        -t|--task-id)  TASK_ID="$2";  shift 2 ;;
        -w|--workdir)  WORKDIR="$2";  shift 2 ;;
        -p|--prompt)   PROMPT="$2";   shift 2 ;;
        -h|--help)     usage ;;
        *) echo "Unknown option: $1"; usage ;;
    esac
done

# ── Validate ──────────────────────────────────────────────
if [[ -z "$PROMPT" ]]; then
    echo "Error: --prompt is required"
    exit 1
fi

if [[ ! -x "$VENV_PYTHON" ]]; then
    echo "Error: Python venv not found at $VENV_PYTHON"
    echo "Run: uv venv ${SKILL_DIR}/.venv --python 3.14 && uv pip install claude-agent-sdk --python ${SKILL_DIR}/.venv/bin/python3"
    exit 1
fi

if ! "$VENV_PYTHON" -c "import claude_agent_sdk" 2>/dev/null; then
    echo "Error: claude_agent_sdk not installed in venv"
    echo "Run: uv pip install claude-agent-sdk --python ${SKILL_DIR}/.venv/bin/python3"
    exit 1
fi

if [[ ! -d "$WORKDIR" ]]; then
    echo "Error: workdir does not exist: $WORKDIR"
    exit 1
fi

# ── Generate task ID if not provided ──────────────────────
if [[ -z "$TASK_ID" ]]; then
    TASK_ID="task-$(date +%Y%m%d-%H%M%S)"
fi

# ── Check for duplicate task ─────────────────────────────
if [[ -d "$TASKS_DIR/$TASK_ID" ]]; then
    echo "Error: task '$TASK_ID' already exists at $TASKS_DIR/$TASK_ID"
    exit 1
fi

# ── Create task directory ────────────────────────────────
mkdir -p "$TASKS_DIR/$TASK_ID"

# ── Launch bridge in background ──────────────────────────
nohup "$VENV_PYTHON" "$SKILL_DIR/bridge.py" \
    --task-id "$TASK_ID" \
    --workdir "$WORKDIR" \
    --prompt "$PROMPT" \
    >> "$TASKS_DIR/$TASK_ID/bridge.log" 2>&1 &

BRIDGE_PID=$!
echo "$BRIDGE_PID" > "$TASKS_DIR/$TASK_ID/bridge.pid"

# Wait briefly to verify the process started
sleep 1
if ! kill -0 "$BRIDGE_PID" 2>/dev/null; then
    echo "Error: Bridge process failed to start. Check: $TASKS_DIR/$TASK_ID/bridge.log"
    exit 1
fi

echo "Task '$TASK_ID' dispatched."
echo ""
echo "  Status:    $SKILL_DIR/claude-bridge-status.sh -t $TASK_ID"
echo "  Output:    $SKILL_DIR/claude-bridge-status.sh -t $TASK_ID --output"
echo "  Question:  $SKILL_DIR/claude-bridge-status.sh -t $TASK_ID --question"
echo "  Answer:    $SKILL_DIR/claude-bridge-answer.sh -t $TASK_ID -a '<text>'"
echo "  Kill:      kill $BRIDGE_PID"
echo "  Log:       $TASKS_DIR/$TASK_ID/bridge.log"
