#!/usr/bin/env python3
"""
bridge.py - Two-way bridge between OpenClaw and Claude Code.

Uses the Claude Agent SDK to run Claude Code with a can_use_tool callback
that intercepts AskUserQuestion, enabling OpenClaw to relay questions to
users and return answers via file-based IPC.

Usage:
    python3 bridge.py --task-id <id> --workdir <dir> --prompt <text>
"""

import asyncio
import argparse
import json
import os
import signal
import sys
import time
from datetime import datetime
from pathlib import Path

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    HookMatcher,
    PermissionResultAllow,
    PermissionResultDeny,
    ResultMessage,
    TextBlock,
    ToolPermissionContext,
    ToolUseBlock,
    query,
)

BRIDGE_HOME = Path.home() / ".claude-bridge"
TASKS_DIR = BRIDGE_HOME / "tasks"
POLL_INTERVAL = 2.0
ANSWER_TIMEOUT = 600  # 10 minutes


# ── File I/O helpers ─────────────────────────────────────

def write_json_atomic(filepath: Path, data: dict):
    """Write JSON atomically via tmp+rename."""
    tmp = filepath.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2, default=str))
    tmp.rename(filepath)


def read_json(filepath: Path) -> dict | None:
    if filepath.exists():
        return json.loads(filepath.read_text())
    return None


def write_status(task_dir: Path, status: str, detail: str = ""):
    write_json_atomic(task_dir / "status.json", {
        "status": status,
        "detail": detail,
        "updated_at": datetime.now().isoformat(),
        "pid": os.getpid(),
    })


def append_log(task_dir: Path, text: str):
    with open(task_dir / "output.log", "a") as f:
        f.write(text)


# ── can_use_tool callback ───────────────────────────────

async def can_use_tool(
    tool_name: str, input_data: dict, context: ToolPermissionContext
) -> PermissionResultAllow | PermissionResultDeny:
    """Intercept AskUserQuestion for relay to OpenClaw; auto-approve everything else."""
    if tool_name == "AskUserQuestion":
        return await handle_ask_user_question(input_data)
    return PermissionResultAllow(updated_input=input_data)


async def handle_ask_user_question(input_data: dict):
    """Write question to disk, poll for answer file, return answer to Claude."""
    global _task_dir

    questions = input_data.get("questions", [])

    # Write question for OpenClaw to read
    write_json_atomic(_task_dir / "question.json", {
        "questions": questions,
        "asked_at": datetime.now().isoformat(),
    })
    write_status(_task_dir, "waiting_for_answer", "Claude is asking a clarifying question")

    # Remove any stale answer
    answer_path = _task_dir / "answer.json"
    if answer_path.exists():
        answer_path.unlink()

    # Poll for answer
    start_time = time.time()
    while True:
        if answer_path.exists():
            answer_data = read_json(answer_path)

            # Clean up IPC files
            (_task_dir / "question.json").unlink(missing_ok=True)
            answer_path.unlink(missing_ok=True)
            write_status(_task_dir, "running", "Received answer, continuing")

            # Map answer to SDK format
            answers = {}
            if answer_data and "answers" in answer_data:
                answers = answer_data["answers"]
            elif answer_data and "text" in answer_data:
                # Simple text answer — map to first question
                if questions:
                    answers = {questions[0]["question"]: answer_data["text"]}

            return PermissionResultAllow(updated_input={
                "questions": questions,
                "answers": answers,
            })

        # Check timeout
        if time.time() - start_time > ANSWER_TIMEOUT:
            (_task_dir / "question.json").unlink(missing_ok=True)
            write_status(_task_dir, "running", "Answer timed out, continuing with default")

            # Default: pick first option for each question
            default_answers = {}
            for q in questions:
                options = q.get("options", [])
                if options:
                    default_answers[q["question"]] = options[0]["label"]
                else:
                    default_answers[q["question"]] = "No preference"

            return PermissionResultAllow(updated_input={
                "questions": questions,
                "answers": default_answers,
            })

        await asyncio.sleep(POLL_INTERVAL)


# ── Dummy PreToolUse hook (required Python SDK workaround) ──

async def dummy_pre_tool_hook(input_data, tool_use_id, context):
    """Keeps the stream open so can_use_tool callbacks fire."""
    return {"continue_": True}


# ── Prompt stream helper ────────────────────────────────

async def prompt_stream(prompt_text: str):
    """Yield the initial user prompt as required by query() with can_use_tool."""
    yield {
        "type": "user",
        "message": {
            "role": "user",
            "content": prompt_text,
        },
    }


# ── Main execution ──────────────────────────────────────

async def run_bridge(task_id: str, workdir: str, prompt: str):
    global _task_dir
    _task_dir = TASKS_DIR / task_id
    _task_dir.mkdir(parents=True, exist_ok=True)

    # Write PID
    (_task_dir / "bridge.pid").write_text(str(os.getpid()))

    # Write task metadata
    write_json_atomic(_task_dir / "task.json", {
        "task_id": task_id,
        "workdir": workdir,
        "prompt": prompt,
        "created_at": datetime.now().isoformat(),
    })
    write_status(_task_dir, "starting", "Initializing Claude Code session")

    # Ensure output.log exists
    (_task_dir / "output.log").touch()

    options = ClaudeAgentOptions(
        permission_mode="acceptEdits",
        cwd=workdir,
        can_use_tool=can_use_tool,
        hooks={
            "PreToolUse": [HookMatcher(matcher=None, hooks=[dummy_pre_tool_hook])],
        },
    )

    write_status(_task_dir, "running", "Claude Code session active")

    try:
        async for message in query(
            prompt=prompt_stream(prompt),
            options=options,
        ):
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, TextBlock):
                        append_log(_task_dir, block.text + "\n")
                    elif isinstance(block, ToolUseBlock):
                        append_log(_task_dir, f"[Tool: {block.name}]\n")

            elif isinstance(message, ResultMessage):
                result_data = {
                    "subtype": message.subtype,
                    "completed_at": datetime.now().isoformat(),
                }
                # Extract result text if available
                if hasattr(message, "result"):
                    result_data["result"] = message.result
                if hasattr(message, "session_id"):
                    result_data["session_id"] = message.session_id
                if hasattr(message, "num_turns"):
                    result_data["num_turns"] = message.num_turns
                if hasattr(message, "total_cost_usd"):
                    result_data["total_cost_usd"] = message.total_cost_usd
                if hasattr(message, "is_error"):
                    result_data["is_error"] = message.is_error

                write_json_atomic(_task_dir / "result.json", result_data)

                is_error = getattr(message, "is_error", False)
                if is_error:
                    write_status(_task_dir, "error", "Claude Code reported an error")
                else:
                    write_status(_task_dir, "complete", "Task finished successfully")

    except Exception as e:
        write_status(_task_dir, "error", f"{type(e).__name__}: {str(e)}")
        append_log(_task_dir, f"\n[BRIDGE ERROR] {type(e).__name__}: {str(e)}\n")
        raise


def main():
    parser = argparse.ArgumentParser(description="Claude Code Bridge")
    parser.add_argument("--task-id", required=True, help="Unique task identifier")
    parser.add_argument("--workdir", required=True, help="Working directory")
    parser.add_argument("--prompt", required=True, help="Prompt to send")
    args = parser.parse_args()

    # SIGTERM handler
    def sigterm_handler(signum, frame):
        task_dir = TASKS_DIR / args.task_id
        write_status(task_dir, "error", "Process terminated by signal")
        sys.exit(1)
    signal.signal(signal.SIGTERM, sigterm_handler)

    asyncio.run(run_bridge(args.task_id, args.workdir, args.prompt))


# Global reference to task directory for the can_use_tool callback
_task_dir: Path = Path()

if __name__ == "__main__":
    main()
