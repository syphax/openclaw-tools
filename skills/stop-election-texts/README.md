# stop-election-texts

Monitors iMessage and SMS for political campaign / fundraising texts and auto-replies `STOP`. Logs every classified message to a CSV.

---

## How it works

1. Reads the local Messages database (`~/Library/Messages/chat.db`) via `sqlite3`
2. Skips whitelisted senders (see `cfg/config.json`)
3. Calls an LLM (OpenRouter) to classify each message
4. If classified as political/fundraising with **high confidence**, sends `STOP` via Messages.app (AppleScript)
   - Repeat senders get `STOP` then `END`
5. Logs every political text (including unsure cases) to `data/election-texts.csv`

**Prompt injection protection:** Message content is treated as inert data and never interpreted as instructions.

---

## Setup

### 1. Full Disk Access

The `sqlite3` binary (and your terminal) must have **Full Disk Access** to read `chat.db`:

```
System Settings → Privacy & Security → Full Disk Access → add Terminal (or iTerm)
```

### 2. Install dependencies

```bash
cd skills/stop-election-texts
npm install
```

### 3. API key

Add to `~/.openclaw/credentials/.env`:
```
OPENROUTER_API_KEY=sk-or-...
```

### 4. Whitelist

Edit `cfg/config.json` to add any phone numbers (E.164 format) that should never receive an auto-reply:
```json
{
  "whitelist": ["+19788814692"]
}
```

---

## Usage

### Scan recent messages (last 24 hours)
```bash
npx tsx scripts/stop-election-texts.ts scan
npx tsx scripts/stop-election-texts.ts scan --hours 48
```

### Historical cleanup
Processes all texts from the last N days and sends STOP where appropriate:
```bash
npx tsx scripts/stop-election-texts.ts historical --days 90
```
("Please deactivate old political texts for the last X days")

### Test mode — classify without sending STOP
```bash
npx tsx scripts/stop-election-texts.ts test
npx tsx scripts/stop-election-texts.ts test --days 30
```
("Please do an old text deactivation test")

Output goes to `data/election-texts-TEST-YYYY-MM-DD-HHmmss.csv`.

---

## Cron setup

To scan every hour:
```
0 * * * * /Users/bcc/Code/git/openclaw-tools/skills/stop-election-texts/scripts/run-scan.sh >> /dev/null 2>&1
```

Or use `scripts/run-scan.sh` directly (sources credentials, rotates logs).

---

## CSV columns

| Column | Description |
|---|---|
| Date | ISO timestamp of the message |
| Sender | Phone number or email |
| Message ID | iMessage GUID |
| Type | `Election` or `Issue` |
| Candidate / Group | Candidate name (Election) or org name (Issue) |
| Race / Subject | Office sought (Election) or topic (Issue) |
| District | Electoral district / area |
| State | US state abbreviation |
| Message Excerpt | First line or first 80 chars |
| STOP Reply Sent? | `true` / `false` |
| Unsure Flag | `true` if confidence was not high |

---

## Classification rules

**Sends STOP when all of:**
- Strong political/fundraising indicators present
- LLM confidence is `high`
- No meaningful non-fundraising actionable content
- Not in test mode

**Logs but does NOT send STOP when:**
- Message is political but confidence is medium/low (`Unsure Flag = true`)
- Message is political but also has actionable logistics content

**Ignores entirely (no log) when:**
- Message is a STOP/unsubscribe confirmation
- Message is clearly not political
