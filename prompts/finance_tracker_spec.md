# Skill Spec: finance-tracker

## Goal
Create an OpenClaw skill to fetch financial data for stocks, ETFs (like QQQ), and cryptocurrencies. The goal is to provide a comprehensive snapshot including current performance, historical comparisons, and long-term trends.

## Requirements

### 1. Structure
- **Location:** `/Users/bcc/Code/git/openclaw-tools/skills/finance-tracker/`
- **Symlink:** `~/.openclaw/skills/finance-tracker` -> repo location
- **Files:**
  - `SKILL.md`: Documentation and usage instructions.
  - `scripts/finance.py`: The main executable script.

### 2. Implementation details (scripts/finance.py)
- **Language:** Python 3
- **Dependencies:** `yfinance` (auto-install via pip if missing).
- **Functionality:**
  - **Current Snapshot:** Current price, relative change vs. today's Open, and Last Close price.
  - **Weekly Comparison:** Compare current price/last close with the price from the same day last week.
  - **Long-term Trends:** Calculate relative performance (percentage change) over the past 3 months and past 1 year.
- **CLI Arguments:**
  - `symbol`: The ticker symbol (e.g., AAPL, QQQ, BTC-USD).
  - `--json`: Output full raw data in JSON (default: True for machine readability).

### 3. Output Requirements (JSON)
The script should return a JSON object with:
- `symbol`: string
- `current_price`: float
- `change_vs_open_pct`: float
- `last_close`: float
- `last_week_close`: float
- `last_week_change_pct`: float
- `three_month_change_pct`: float
- `one_year_change_pct`: float

## Final Steps for Agent
- Make script executable (`chmod +x`).
- Create the symlink to `~/.openclaw/skills/`.
