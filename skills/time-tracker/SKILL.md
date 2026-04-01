# Time Tracker (Pomo)

Pomodoro-style time tracker for OpenClaw. Tracks work sessions with configurable work/rest cycles, sends notifications when phases end, and provides a web UI with countdown timer and reporting.

## Trigger

Activate when the user sends a message matching:
- `pomo -t [task] -p [project] -w [work] -c [cycle]`
- `pomo -s` (stop)
- `pomo -e [minutes]` (extend)
- Or natural language like "start a pomodoro", "start tracking time on [task]", "stop the timer"

## Commands

| Command | Description |
|---------|-------------|
| `pomo` | Start with defaults (25m work / 30m cycle) |
| `pomo -t "task name"` | Start with a named task |
| `pomo -p "project"` | Start under a specific project |
| `pomo -w 45 -c 55` | Custom work/cycle times (minutes) |
| `pomo -w 25 -r 5` | Work + rest times (cycle = 30m) |
| `pomo -r 10 -c 40` | Rest + cycle (work = 30m) |
| `pomo -s` | Stop the active timer (records actual work time) |
| `pomo -e 10` | Extend work time by 10 minutes |
| `pomo -h` | Show help with all options and examples |

All flags are optional. Defaults are configured in `cfg/time-tracker-config.json`.

**Time flags:** Use any two of `-w` (work), `-r` (rest), `-c` (cycle). The third is derived (cycle = work + rest). If all three are given, they must be consistent (work + rest = cycle) or the command returns an error.

## How It Works

**Use the wrapper script** — it auto-starts the server if it's not running:

```bash
# Set POMO_ORIGIN to the channel the command came from (telegram, whatsapp, cli)
# so notifications are sent back to the right place.
POMO_ORIGIN=telegram bash /Users/bcc/Code/git/openclaw-tools/skills/time-tracker/scripts/pomo.sh -t "coding" -p "openclaw"
POMO_ORIGIN=telegram bash /Users/bcc/Code/git/openclaw-tools/skills/time-tracker/scripts/pomo.sh -s
POMO_ORIGIN=telegram bash /Users/bcc/Code/git/openclaw-tools/skills/time-tracker/scripts/pomo.sh -e 10
POMO_ORIGIN=telegram bash /Users/bcc/Code/git/openclaw-tools/skills/time-tracker/scripts/pomo.sh -h
```

The wrapper (`scripts/pomo.sh`) checks if the server is listening on port 3100. If not, it starts the server in the background, waits for it to be ready, then executes the command. This means the server does not need to be pre-started or installed as a launchd service — it starts on first use.

### Direct API (advanced)

The server also exposes a REST API if you prefer direct calls:

| Method | Path | Body |
|--------|------|------|
| `POST` | `/api/pomo/start` | `{"task","project","work","cycle","origin"}` |
| `POST` | `/api/pomo/stop` | — |
| `POST` | `/api/pomo/extend` | `{"minutes"}` |
| `GET` | `/api/pomo/status` | — |
| `GET` | `/api/pomo/help` | — |
| `GET` | `/api/sessions/recent` | — |
| `GET` | `/api/reports/by-project` | query: `start`, `end` |

## Notifications

- **Work phase ends**: "Time's up! Take a break." sent to originating channel
- **Cycle ends**: "Cycle complete! Start working!" sent to originating channel
- Web UI always shows current state via polling

## Web UI

Available at `http://localhost:3100` when the service is running.

- **Timer page** (`/`): Live countdown, start/stop/extend controls, last 10 sessions
- **Reports page** (`/report`): Total work time by project with date range filter

## Setup

```bash
cd skills/time-tracker

# Install backend dependencies
npm install

# Install frontend dependencies and build
bash scripts/build-frontend.sh

# Install as persistent launchd service
bash setup_launchd.sh
```

## Requirements

- Node.js (via nvm)
- `npx`, `tsx` (devDependency)
- `openclaw` CLI (for message notifications)

## Data

- Database: `~/.openclaw/data/time-tracker/pomodoro.duckdb`
- Config: `cfg/time-tracker-config.json`
- Logs: `logs/server.log`
