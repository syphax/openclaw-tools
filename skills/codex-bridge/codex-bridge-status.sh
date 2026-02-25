#!/usr/bin/env bash
# codex-bridge-status.sh - Check status/output for Codex bridge tasks.

set -euo pipefail

BRIDGE_HOME="${HOME}/.codex-bridge"
TASKS_DIR="${BRIDGE_HOME}/tasks"

TASK_ID=""
LIST_ALL=false
SHOW_OUTPUT=false
SHOW_QUESTION=false
SHOW_RESULT=false
SHOW_LOG=false
LINES=50

usage() {
    cat <<EOF
Usage: codex-bridge-status.sh [OPTIONS]

Monitor Codex bridge tasks.

Options:
  -t, --task-id ID      check a specific task
  -l, --list            list all tasks
  -o, --output          show recent output from Codex
  -n, --lines N         number of output lines (default: 50)
  -q, --question        show pending clarifying question
  -r, --result          show task result
      --log             show bridge log
  -h, --help            show this help
EOF
    exit 0
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        -t|--task-id) TASK_ID="$2"; shift 2 ;;
        -l|--list) LIST_ALL=true; shift ;;
        -o|--output) SHOW_OUTPUT=true; shift ;;
        -n|--lines) LINES="$2"; shift 2 ;;
        -q|--question) SHOW_QUESTION=true; shift ;;
        -r|--result) SHOW_RESULT=true; shift ;;
        --log) SHOW_LOG=true; shift ;;
        -h|--help) usage ;;
        *) echo "Unknown option: $1"; usage ;;
    esac
done

if $LIST_ALL; then
    echo "Codex Bridge tasks:"
    echo ""
    if [[ -d "$TASKS_DIR" ]] && [[ "$(ls -A "$TASKS_DIR" 2>/dev/null)" ]]; then
        for task_dir in "$TASKS_DIR"/*/; do
            [[ -d "$task_dir" ]] || continue
            task_name="$(basename "$task_dir")"
            status_file="$task_dir/status.json"
            if [[ -f "$status_file" ]]; then
                status=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d.get('status','unknown'))" "$status_file" 2>/dev/null || echo "unknown")
                detail=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d.get('detail',''))" "$status_file" 2>/dev/null || echo "")
                echo "  [$task_name]  $status  $detail"
            else
                echo "  [$task_name]  (no status)"
            fi
        done
    else
        echo "  (none)"
    fi
    exit 0
fi

if [[ -z "$TASK_ID" ]]; then
    echo "Error: specify --task-id ID or --list"
    exit 1
fi

TASK_DIR="$TASKS_DIR/$TASK_ID"
if [[ ! -d "$TASK_DIR" ]]; then
    echo "Error: task '$TASK_ID' not found"
    exit 1
fi

if $SHOW_QUESTION; then
    if [[ -f "$TASK_DIR/question.json" ]]; then
        cat "$TASK_DIR/question.json"
    else
        echo "No pending question for task '$TASK_ID'"
    fi
    exit 0
fi

if $SHOW_RESULT; then
    if [[ -f "$TASK_DIR/result.json" ]]; then
        cat "$TASK_DIR/result.json"
    else
        echo "No result yet for task '$TASK_ID'"
    fi
    exit 0
fi

if $SHOW_LOG; then
    if [[ -f "$TASK_DIR/bridge.log" ]]; then
        cat "$TASK_DIR/bridge.log"
    else
        echo "No bridge log for task '$TASK_ID'"
    fi
    exit 0
fi

if $SHOW_OUTPUT; then
    if [[ -f "$TASK_DIR/output.log" ]]; then
        tail -n "$LINES" "$TASK_DIR/output.log"
    else
        echo "No output yet for task '$TASK_ID'"
    fi
    exit 0
fi

STATUS_FILE="$TASK_DIR/status.json"
if [[ ! -f "$STATUS_FILE" ]]; then
    echo "Task: $TASK_ID"
    echo "Status: unknown (no status.json)"
    exit 1
fi

python3 -c "
import json, os, sys
d = json.load(open(sys.argv[1]))
pid = d.get('pid', 0)
alive = False
if pid:
    try:
        os.kill(pid, 0)
        alive = True
    except (ProcessLookupError, PermissionError):
        pass
print(f'Task: {sys.argv[2]}')
print(f'Status: {d.get(\"status\", \"unknown\")}')
print(f'Detail: {d.get(\"detail\", \"\")}')
print(f'Updated: {d.get(\"updated_at\", \"\")}')
if d.get('thread_id'):
    print(f'Thread: {d.get(\"thread_id\")}')
if d.get('round') is not None:
    print(f'Round: {d.get(\"round\")}')
print(f'PID: {pid} ({\"alive\" if alive else \"dead\"})')
if not alive and d.get('status') in ('running', 'starting', 'waiting_for_answer'):
    print(f'WARNING: Process is dead but status shows {d.get(\"status\")}. Check {sys.argv[3]}/bridge.log')
" "$STATUS_FILE" "$TASK_ID" "$TASK_DIR"
