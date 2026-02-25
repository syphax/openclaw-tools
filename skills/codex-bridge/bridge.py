#!/usr/bin/env python3
"""
bridge.py - File-based task bridge between OpenClaw and OpenAI Codex CLI.

The bridge runs `codex exec --json` in the background, stores status/results on disk,
and supports basic two-way clarification by asking Codex to emit a structured question
marker that OpenClaw can relay to the user. Answers are written to `answer.json`, then
the bridge resumes the same Codex session with `codex exec resume`.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import signal
import subprocess
import sys
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

BRIDGE_HOME = Path.home() / ".codex-bridge"
TASKS_DIR = BRIDGE_HOME / "tasks"
POLL_INTERVAL = 2.0
ANSWER_TIMEOUT = 600  # 10 minutes

QUESTION_RE = re.compile(
    r"\[\[OPENCLAW_QUESTION\]\]\s*(.*?)\s*\[\[/OPENCLAW_QUESTION\]\]",
    re.DOTALL,
)
OPTIONS_RE = re.compile(
    r"\[\[OPENCLAW_OPTIONS\]\]\s*(.*?)\s*\[\[/OPENCLAW_OPTIONS\]\]",
    re.DOTALL,
)


def now_iso() -> str:
    return datetime.now().isoformat()


def write_json_atomic(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, default=str))
    tmp.rename(path)


def read_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    return json.loads(path.read_text())


def append_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(text)


def write_status(task_dir: Path, status: str, detail: str = "") -> None:
    payload = {
        "status": status,
        "detail": detail,
        "updated_at": now_iso(),
        "pid": os.getpid(),
    }
    # Preserve thread id and round in status for easier debugging.
    task = read_json(task_dir / "task.json") or {}
    if "thread_id" in task:
        payload["thread_id"] = task["thread_id"]
    if "round" in task:
        payload["round"] = task["round"]
    write_json_atomic(task_dir / "status.json", payload)


def update_task(task_dir: Path, **updates: Any) -> dict[str, Any]:
    task = read_json(task_dir / "task.json") or {}
    task.update(updates)
    write_json_atomic(task_dir / "task.json", task)
    return task


def build_initial_prompt(user_prompt: str) -> str:
    protocol = """
You are operating as a coding sub-agent behind an OpenClaw bridge.

Follow this clarification protocol exactly when blocked by missing requirements:
1. If you need user input before proceeding safely, STOP and reply using only:
[[OPENCLAW_QUESTION]]
<single concise question>
[[/OPENCLAW_QUESTION]]
2. If useful, add options using only:
[[OPENCLAW_OPTIONS]]
<option 1>
<option 2>
...
[[/OPENCLAW_OPTIONS]]
3. Do not include any other text when asking a clarification question.
4. After receiving an answer, continue work immediately.

When no clarification is needed, perform the task normally and provide your usual final response.
""".strip()
    return f"{protocol}\n\nUser task:\n{user_prompt}"


def build_resume_prompt(answer_text: str) -> str:
    return (
        "Bridge answer from OpenClaw user:\n"
        f"{answer_text}\n\n"
        "Continue the task. If more clarification is needed, use the exact OPENCLAW_QUESTION/OPTIONS markers."
    )


def extract_question(text: str) -> dict[str, Any] | None:
    q_match = QUESTION_RE.search(text)
    if not q_match:
        return None
    question = q_match.group(1).strip()
    options: list[dict[str, str]] = []
    opt_match = OPTIONS_RE.search(text)
    if opt_match:
        for line in opt_match.group(1).splitlines():
            line = line.strip().lstrip("-").strip()
            if line:
                options.append({"label": line})
    return {
        "questions": [{"question": question, "options": options}],
        "asked_at": now_iso(),
    }


def collect_strings(value: Any, *, keys: set[str] | None = None) -> list[str]:
    out: list[str] = []
    if isinstance(value, dict):
        for k, v in value.items():
            if keys is None or k in keys:
                if isinstance(v, str):
                    out.append(v)
                else:
                    out.extend(collect_strings(v, keys=keys))
            else:
                out.extend(collect_strings(v, keys=keys))
    elif isinstance(value, list):
        for item in value:
            out.extend(collect_strings(item, keys=keys))
    return out


@dataclass
class RunCapture:
    thread_id: str | None = None
    last_assistant_text: str = ""
    assistant_fragments: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    saw_json_events: int = 0


class CodexRunner:
    def __init__(self, task_dir: Path):
        self.task_dir = task_dir
        self.events_file = task_dir / "events.jsonl"
        self.output_file = task_dir / "output.log"
        self.bridge_log = task_dir / "bridge.log"

    def _read_stdout(self, proc: subprocess.Popen[str], capture: RunCapture) -> None:
        assert proc.stdout is not None
        for raw in proc.stdout:
            line = raw.rstrip("\n")
            append_text(self.bridge_log, f"[stdout] {line}\n")
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                # Some builds may emit non-JSON lines even with --json.
                append_text(self.output_file, raw)
                continue

            capture.saw_json_events += 1
            append_text(self.events_file, json.dumps(event) + "\n")
            self._handle_event(event, capture)

    def _read_stderr(self, proc: subprocess.Popen[str]) -> None:
        assert proc.stderr is not None
        for raw in proc.stderr:
            append_text(self.bridge_log, f"[stderr] {raw}")

    def _handle_event(self, event: dict[str, Any], capture: RunCapture) -> None:
        event_type = str(event.get("type", ""))
        if event_type == "thread.started":
            thread_id = event.get("thread_id")
            if isinstance(thread_id, str):
                capture.thread_id = thread_id
                append_text(self.output_file, f"[thread] {thread_id}\n")
            return

        if event_type == "turn.started":
            append_text(self.output_file, "[turn] started\n")
            return

        if event_type == "turn.completed":
            append_text(self.output_file, "[turn] completed\n")
            return

        if event_type == "error":
            msg = str(event.get("message", "Unknown Codex error"))
            capture.errors.append(msg)
            append_text(self.output_file, f"[error] {msg}\n")
            return

        # Try to harvest textual assistant output from common JSONL event shapes.
        text_fragments: list[str] = []
        if any(token in event_type for token in ("output_text", "assistant", "message", "response")):
            text_fragments = collect_strings(event, keys={"text", "delta", "message", "output_text"})
        if text_fragments:
            merged = "".join(text_fragments).strip()
            if merged:
                # Keep a stitched copy so marker-based questions can survive delta splitting.
                if not capture.assistant_fragments or capture.assistant_fragments[-1] != merged:
                    capture.assistant_fragments.append(merged)
                capture.last_assistant_text = "".join(capture.assistant_fragments)
                # Avoid very noisy duplicate delta spam.
                if not merged.startswith("Reconnecting..."):
                    append_text(self.output_file, merged + "\n")

        # Surface tool/command summaries if present.
        command_texts = collect_strings(event, keys={"command", "cmd"})
        for cmd in command_texts:
            if cmd and len(cmd) < 2000:
                append_text(self.output_file, f"[command] {cmd}\n")

    def run(self, cmd: list[str]) -> tuple[int, RunCapture]:
        capture = RunCapture()
        append_text(self.bridge_log, f"\n[{now_iso()}] RUN {' '.join(cmd)}\n")

        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            stdin=subprocess.DEVNULL,
            text=True,
            bufsize=1,
        )

        t_out = threading.Thread(target=self._read_stdout, args=(proc, capture), daemon=True)
        t_err = threading.Thread(target=self._read_stderr, args=(proc,), daemon=True)
        t_out.start()
        t_err.start()
        returncode = proc.wait()
        t_out.join(timeout=2)
        t_err.join(timeout=2)

        append_text(self.bridge_log, f"[{now_iso()}] EXIT {returncode}\n")
        return returncode, capture


def codex_base_cmd() -> list[str]:
    return ["codex"]


def build_exec_cmd(workdir: str, prompt: str) -> list[str]:
    return (
        codex_base_cmd()
        + [
            "exec",
            "--json",
            "--color",
            "never",
            "--full-auto",
            "--skip-git-repo-check",
            "-C",
            workdir,
            prompt,
        ]
    )


def build_resume_cmd(thread_id: str, answer_prompt: str) -> list[str]:
    return (
        codex_base_cmd()
        + [
            "exec",
            "resume",
            "--json",
            "--full-auto",
            "--skip-git-repo-check",
            thread_id,
            answer_prompt,
        ]
    )


def wait_for_answer(task_dir: Path, question_payload: dict[str, Any]) -> str:
    write_json_atomic(task_dir / "question.json", question_payload)
    write_status(task_dir, "waiting_for_answer", "Codex is asking a clarifying question")
    (task_dir / "answer.json").unlink(missing_ok=True)

    start = time.time()
    while True:
        answer_file = task_dir / "answer.json"
        if answer_file.exists():
            answer_data = read_json(answer_file) or {}
            text = str(answer_data.get("text", "")).strip()
            (task_dir / "question.json").unlink(missing_ok=True)
            answer_file.unlink(missing_ok=True)
            if text:
                write_status(task_dir, "running", "Received answer, resuming Codex")
                return text

        if time.time() - start > ANSWER_TIMEOUT:
            (task_dir / "question.json").unlink(missing_ok=True)
            q = question_payload["questions"][0]
            opts = q.get("options") or []
            fallback = opts[0]["label"] if opts else "Use a sensible default and continue."
            write_status(task_dir, "running", "Answer timed out, continuing with default")
            return fallback

        time.sleep(POLL_INTERVAL)


def write_result(task_dir: Path, status: str, detail: str, capture: RunCapture, returncode: int) -> None:
    result = {
        "status": status,
        "detail": detail,
        "completed_at": now_iso(),
        "returncode": returncode,
        "thread_id": capture.thread_id,
        "last_message": capture.last_assistant_text,
        "errors": capture.errors,
        "json_event_count": capture.saw_json_events,
    }
    write_json_atomic(task_dir / "result.json", result)


def run_bridge(task_id: str, workdir: str, prompt: str) -> None:
    task_dir = TASKS_DIR / task_id
    task_dir.mkdir(parents=True, exist_ok=True)
    (task_dir / "bridge.pid").write_text(str(os.getpid()))

    write_json_atomic(
        task_dir / "task.json",
        {
            "task_id": task_id,
            "workdir": workdir,
            "prompt": prompt,
            "created_at": now_iso(),
            "round": 0,
        },
    )
    (task_dir / "output.log").touch()
    (task_dir / "events.jsonl").touch()
    (task_dir / "bridge.log").touch()

    runner = CodexRunner(task_dir)
    write_status(task_dir, "starting", "Initializing Codex task")

    current_cmd = build_exec_cmd(workdir, build_initial_prompt(prompt))
    thread_id: str | None = None
    rounds = 0

    while True:
        rounds += 1
        update_task(task_dir, round=rounds)
        write_status(task_dir, "running", f"Codex active (round {rounds})")

        returncode, capture = runner.run(current_cmd)
        if capture.thread_id and not thread_id:
            thread_id = capture.thread_id
            update_task(task_dir, thread_id=thread_id)

        question_payload = extract_question(capture.last_assistant_text or "")
        if question_payload and thread_id:
            answer = wait_for_answer(task_dir, question_payload)
            current_cmd = build_resume_cmd(thread_id, build_resume_prompt(answer))
            continue

        if returncode == 0:
            write_result(task_dir, "complete", "Task finished successfully", capture, returncode)
            write_status(task_dir, "complete", "Task finished successfully")
            return

        # If Codex returned non-zero but asked a question and thread_id wasn't detected, record that.
        if question_payload and not thread_id:
            write_result(
                task_dir,
                "error",
                "Codex asked a question but no resumable thread_id was captured",
                capture,
                returncode,
            )
            write_status(task_dir, "error", "Question detected but resume session id missing")
            return

        detail = capture.errors[-1] if capture.errors else f"Codex exited with status {returncode}"
        write_result(task_dir, "error", detail, capture, returncode)
        write_status(task_dir, "error", detail)
        return


def main() -> None:
    parser = argparse.ArgumentParser(description="OpenClaw <-> Codex bridge")
    parser.add_argument("--task-id", required=True, help="Unique task identifier")
    parser.add_argument("--workdir", required=True, help="Working directory for Codex")
    parser.add_argument("--prompt", required=True, help="Prompt to send to Codex")
    args = parser.parse_args()

    if not Path(args.workdir).is_dir():
        print(f"Workdir does not exist: {args.workdir}", file=sys.stderr)
        sys.exit(2)

    def sigterm_handler(signum: int, frame: Any) -> None:
        task_dir = TASKS_DIR / args.task_id
        write_status(task_dir, "error", "Bridge process terminated by signal")
        sys.exit(1)

    signal.signal(signal.SIGTERM, sigterm_handler)
    run_bridge(args.task_id, args.workdir, args.prompt)


if __name__ == "__main__":
    main()
