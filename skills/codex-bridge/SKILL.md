---
name: codex-bridge
description: Dispatch coding tasks to the local OpenAI Codex CLI with background execution, status polling, and answerable clarifying questions. Use when OpenClaw should delegate script building, code edits, refactors, or multi-step coding work to Codex from the command line.
metadata:
  openclaw:
    emoji: "🧰"
    requires:
      bins: ["python3", "codex"]
---

# Codex Bridge

Delegate coding tasks from OpenClaw to the local `codex` CLI and manage them asynchronously.
This skill provides a file-based bridge so OpenClaw can:

- dispatch tasks
- poll status and recent output
- relay clarifying questions
- send answers
- collect final results

## When to Use

- Build scripts (Python, Bash, etc.)
- Implement or refactor code in an existing project
- Run larger multi-file coding tasks in the background
- Delegate coding work while keeping OpenClaw responsive
- Handle tasks that may require clarifying questions mid-run

## When NOT to Use

- Quick factual questions or explanations
- Small code snippets that OpenClaw can write directly
- Non-coding tasks
- Tasks that should not invoke a local coding agent/CLI

## Dispatch a Task

```bash
~/.openclaw/skills/codex-bridge/codex-bridge-dispatch.sh \
  --task-id <descriptive-name> \
  --workdir <project-directory> \
  --prompt "<detailed coding task>"
```

### Prompt Writing

Include:

- what to build/fix
- file paths if known
- expected behavior/output
- language/framework preferences
- constraints (tests, style, no new deps, etc.)

Example:

```bash
~/.openclaw/skills/codex-bridge/codex-bridge-dispatch.sh \
  --task-id scripts-csv-parser \
  --workdir ~/projects/data-tools \
  --prompt "Create parse_orders.py. Read orders CSV, keep shipped rows, group by customer_id, and write summary CSV with columns customer_id, order_count, total_amount. Use pandas. Add basic CLI args and error handling."
```

## Check Status

```bash
~/.openclaw/skills/codex-bridge/codex-bridge-status.sh --task-id <id>
```

Common status commands:

```bash
~/.openclaw/skills/codex-bridge/codex-bridge-status.sh --list
~/.openclaw/skills/codex-bridge/codex-bridge-status.sh --task-id <id> --output
~/.openclaw/skills/codex-bridge/codex-bridge-status.sh --task-id <id> --question
~/.openclaw/skills/codex-bridge/codex-bridge-status.sh --task-id <id> --result
~/.openclaw/skills/codex-bridge/codex-bridge-status.sh --task-id <id> --log
```

## Answer Clarifying Questions

When status is `waiting_for_answer`, read the pending question and send a response:

```bash
~/.openclaw/skills/codex-bridge/codex-bridge-status.sh --task-id <id> --question
~/.openclaw/skills/codex-bridge/codex-bridge-answer.sh --task-id <id> --answer "<answer text>"
```

The bridge resumes the same Codex session after the answer is written.

## Workflow

1. Dispatch task with a clear prompt.
2. Report the task ID.
3. Poll status/output periodically.
4. If status becomes `waiting_for_answer`, read `--question`, relay to user, then write answer with `--answer`.
5. When status is `complete`, read `--result` and summarize outcomes.
6. If status is `error`, inspect `--log` and `--output`.

## Notes and Limits

- Uses the local `codex` CLI (`codex exec` and `codex exec resume`).
- Clarifying questions are implemented via a lightweight text marker protocol in the prompt wrapper.
- Bridge state is stored in `~/.codex-bridge/tasks/<task-id>/`.
- Commands run via Codex in the specified `--workdir`.
- For unattended runs, the bridge times out after 10 minutes waiting for an answer and resumes with a default/sensible fallback.
