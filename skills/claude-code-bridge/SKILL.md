---
name: claude-code-bridge
description: Dispatch coding tasks to Claude Code with two-way communication. Send tasks, receive status updates, answer clarifying questions, and get results.
metadata:
  openclaw:
    emoji: "\U0001F309"
    requires:
      bins: ["python3"]
---

# Claude Code Bridge

Send coding tasks to Claude Code and handle two-way communication. When Claude needs clarification, it writes a question that you can relay to the user and answer back.

## When to Use

- User asks to **build a script** (Python, bash, etc.)
- User asks to **fix, refactor, or modify code** in a project
- User asks for **multi-file code generation** or large refactors
- User wants a **long coding task** in the background
- User wants **parallel coding tasks** across different projects
- Task may require **back-and-forth clarification**

## When NOT to Use

- Quick questions or explanations (just answer directly)
- Simple single-file reads
- Planning or design discussions
- Non-coding tasks

## Dispatching a Task

```bash
~/.openclaw/skills/claude-code-bridge/claude-bridge-dispatch.sh \
  --task-id <descriptive-name> \
  --workdir <project-directory> \
  --prompt "<detailed task description>"
```

### Naming Conventions

Use descriptive task IDs with project prefixes:
- `myapp-fix-auth` — bug fix
- `myapp-add-csv-export` — feature work
- `scripts-build-parser` — new script creation

### Writing Good Prompts

Be specific. Include:
- What to build or fix
- File paths if known
- Expected behavior or output format
- Language and framework preferences

**Example:**
```bash
~/.openclaw/skills/claude-code-bridge/claude-bridge-dispatch.sh \
  --task-id scripts-csv-parser \
  --workdir ~/projects/data-tools \
  --prompt "Create a Python script called parse_orders.py that reads a CSV file of orders, filters rows where status is 'shipped', groups by customer_id, and outputs a summary CSV with columns: customer_id, order_count, total_amount. Use pandas."
```

## Checking Status

**Quick status check:**
```bash
~/.openclaw/skills/claude-code-bridge/claude-bridge-status.sh --task-id <id>
```

**Get recent output from Claude:**
```bash
~/.openclaw/skills/claude-code-bridge/claude-bridge-status.sh --task-id <id> --output
```

**Get more output lines:**
```bash
~/.openclaw/skills/claude-code-bridge/claude-bridge-status.sh --task-id <id> --output -n 100
```

**List all tasks:**
```bash
~/.openclaw/skills/claude-code-bridge/claude-bridge-status.sh --list
```

**View the result when complete:**
```bash
~/.openclaw/skills/claude-code-bridge/claude-bridge-status.sh --task-id <id> --result
```

## Answering Questions (Two-Way Communication)

When status shows `waiting_for_answer`, Claude is asking a clarifying question.

**Read the question:**
```bash
~/.openclaw/skills/claude-code-bridge/claude-bridge-status.sh --task-id <id> --question
```

The output is JSON with a `questions` array. Each question has `question` text and `options` with labels.

**Send the answer:**
```bash
~/.openclaw/skills/claude-code-bridge/claude-bridge-answer.sh \
  --task-id <id> \
  --answer "<the answer text or selected option label>"
```

After answering, Claude resumes work automatically.

## Workflow

1. User requests a coding task
2. You dispatch a task with a clear, detailed prompt
3. Report the task ID and how to monitor it
4. Periodically check status (every 30-60 seconds for active tasks, or when the user asks)
5. **If status is `waiting_for_answer`**: read the question with `--question`, present it to the user, then send their answer with `claude-bridge-answer.sh`
6. When status is `complete`: read the result with `--result` and report to the user
7. If status is `error`: check `--output` and `--log` for details

## Important Notes

- Claude Code runs in `acceptEdits` mode: it auto-approves file edits and bash commands. Only `AskUserQuestion` triggers the question relay.
- Tasks persist across OpenClaw restarts (state is in `~/.claude-bridge/tasks/`).
- Each task runs in its own Python process.
- If no answer is provided within 10 minutes, the bridge times out and picks the first option as default.
- Kill a task: `kill $(cat ~/.claude-bridge/tasks/<id>/bridge.pid)`
