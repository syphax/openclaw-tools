# Time Tracker

I want to build a time-tracker like a Pomodoro app for OpenClaw. I can't find a good Pomodoro app that does basic time tracking. And, I'm too cheap to pay for what is a pretty elementary service.

## Structure

This skill lives at `skills/time-tracker/`, written in TypeScript (consistent with daily-digest and other skills). Config is in `skills/time-tracker/cfg/` as JSON, following the same structure as other skills.

## Main Functionality

I want to be able to tell you when I am starting a task. The command is:

`pomo -t [name of task] -p [name of project] -w [work time] -c [cycle time]`

This command can be issued from the web UI, Telegram, or WhatsApp. No custom listener is needed for Telegram/WhatsApp — OpenClaw already receives inbound messages and routes them. Pomo is implemented as an OpenClaw skill with clear trigger patterns; notifications go back through the same channel the command came from.

The app will record the start date and time, name of task (can be null), name of project (can be null). It will also calculate the end time of the work period based on the work time. The difference between the work time and the cycle time is the rest time.

The app has default settings for work time and cycle time, 25 and 30 minutes. These are set in the config file, along with the default project and task ('General' and 'Unspecified').

Once a task has started, after the work time has elapsed the app sends a "Time's up; take a break" message to the same interface where the initial message came from, as well as displaying it on the web UI (see below).

After the cycle time has elapsed, the app sends a "Cycle complete; start working!" message to the same interface and the web UI. The user then needs to send another pomo command to start. We do this rather than auto-start to ensure data validity (assuming consistency on the part of the user).

Mid-task, the user can send a `pomo -s` command to stop the current task, or `pomo -e [minutes]` to extend the work time by the specified number of minutes from the time the command is issued (so if we're 20 minutes into a 25 minute cycle, and send `pomo -e 15`, it'll extend the work cycle to 35 minutes). When extending, the rest period stays the same — the cycle end time shifts by the same amount. (We specify cycle time rather than rest time in the command, even though rest is the invariant; we may revisit this later.)

There is only one active timer at a time. We might make this multi-user later, but probably not.

## Web Interface

The web UI is built with React 19 + Vite + TypeScript (matching the scimulator project in retiarius). It runs as a persistent service. No authentication — local/trusted network only.

When active, pomo has a simple web interface that shows the current task, project, start time, and end time. It also shows a list of the last 10 tasks, with the same information.

It also shows the time remaining in the current work or rest period.

It also has a reporting view (different page) that lists total work time by project. We'll enhance this later; that's the starting view.

## Data Storage

The app stores data in a DuckDB database at `~/.openclaw/data/time-tracker/`.
