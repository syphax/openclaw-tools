# Claude Code Bridge — OpenClaw Skill

A two-way communication bridge between OpenClaw and Claude Code. Unlike the one-way `claude-code-dispatch` skill, this bridge can relay clarifying questions from Claude Code back to OpenClaw and forward answers.

## Architecture

```
OpenClaw Agent
    |
    |-- claude-bridge-dispatch.sh  (launch a task)
    |-- claude-bridge-status.sh    (check status, read questions/results)
    |-- claude-bridge-answer.sh    (send answer to a question)
    |
    v
bridge.py (Python, background process)
    |-- Uses claude-agent-sdk with can_use_tool callback
    |-- Intercepts AskUserQuestion tool calls
    |-- File-based IPC via ~/.claude-bridge/tasks/<id>/
    |
    v
Claude Code (subprocess via SDK)
```

## Files

| File | Purpose |
|---|---|
| `bridge.py` | Core Python bridge using Claude Agent SDK |
| `claude-bridge-dispatch.sh` | Launch a task in the background |
| `claude-bridge-status.sh` | Check status, list tasks, read output/questions/results |
| `claude-bridge-answer.sh` | Send an answer to a pending question |
| `SKILL.md` | OpenClaw skill definition (agent instructions) |
| `.venv/` | Python virtual environment with claude-agent-sdk |

## What This Does NOT Do

- **No auto-approver for dangerous ops** — Claude runs in `acceptEdits` mode (auto-approves file edits) but AskUserQuestion is relayed for human decision
- **No network calls** — nothing phones home, no telemetry
- **No eval or encoded content** — plain Python and bash
- **No system modification** — doesn't touch crontab, launchctl, or services
- **No hidden files** — task state goes to `~/.claude-bridge/tasks/` and nowhere else

## Install

```bash
# 1. Create venv and install SDK
uv venv ~/.openclaw/skills/claude-code-bridge/.venv --python 3.14
uv pip install claude-agent-sdk --python ~/.openclaw/skills/claude-code-bridge/.venv/bin/python3

# 2. Make scripts executable
chmod +x ~/.openclaw/skills/claude-code-bridge/bridge.py
chmod +x ~/.openclaw/skills/claude-code-bridge/claude-bridge-dispatch.sh
chmod +x ~/.openclaw/skills/claude-code-bridge/claude-bridge-status.sh
chmod +x ~/.openclaw/skills/claude-code-bridge/claude-bridge-answer.sh

# 3. Create runtime directory
mkdir -p ~/.claude-bridge/tasks

# 4. Restart OpenClaw gateway
openclaw gateway restart
```

## Requirements

- Python 3.10+ (tested with 3.14)
- `claude-agent-sdk` Python package
- `claude` CLI (Claude Code)

## Manual Usage (outside OpenClaw)

```bash
# Dispatch a task
./claude-bridge-dispatch.sh -t my-task -w ~/projects/app -p "Build a REST API in Flask"

# Check status
./claude-bridge-status.sh --list
./claude-bridge-status.sh -t my-task
./claude-bridge-status.sh -t my-task --output

# If Claude asks a question
./claude-bridge-status.sh -t my-task --question
./claude-bridge-answer.sh -t my-task -a "Use PostgreSQL"

# View result when done
./claude-bridge-status.sh -t my-task --result

# Kill a running task
kill $(cat ~/.claude-bridge/tasks/my-task/bridge.pid)
```

## Task States

| Status | Meaning |
|---|---|
| `starting` | Bridge is initializing |
| `running` | Claude Code is working |
| `waiting_for_answer` | Claude asked a question — check `--question` and send `--answer` |
| `complete` | Task finished — check `--result` |
| `error` | Something went wrong — check `--output` and `--log` |
