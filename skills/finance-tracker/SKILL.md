# finance-tracker

Fetch comprehensive financial data for stocks, ETFs, and cryptocurrencies with historical comparisons and trend analysis.

## Usage

```bash
# Fetch data for specific tickers
finance-tracker AAPL MSFT QQQ

# Fetch data for all default tickers (from cfg/tickers.txt)
finance-tracker
```

### Examples

```bash
# Single stock
finance-tracker AAPL

# Multiple ETFs
finance-tracker VOO QQQ VTI

# Mix of stocks, ETFs, and crypto
finance-tracker AAPL QQQ ETH-USD

# All defaults
finance-tracker
```

## Configuration

Default tickers are stored in `cfg/tickers.txt`, one per line. When no tickers are passed as arguments, the script fetches data for all tickers in this file.

## What it provides

- **Current Snapshot**: Current price, change vs today's open, last close
- **Weekly Comparison**: Compare current price with same day last week
- **Long-term Trends**: 3-month and 1-year performance

## Output

Returns JSON keyed by ticker symbol. Each entry contains:
- `symbol`: Ticker symbol
- `current_price`: Current market price
- `change_vs_open_pct`: Percentage change from today's open
- `last_close`: Previous closing price
- `last_week_close`: Closing price from same day last week
- `last_week_change_pct`: Weekly performance percentage
- `three_month_change_pct`: 3-month performance percentage
- `one_year_change_pct`: 1-year performance percentage

Example:
```json
{
  "AAPL": {
    "symbol": "AAPL",
    "current_price": 189.50,
    "change_vs_open_pct": 0.35,
    "last_close": 188.25,
    "last_week_close": 185.00,
    "last_week_change_pct": 2.43,
    "three_month_change_pct": 8.12,
    "one_year_change_pct": 22.50
  },
  "QQQ": { ... }
}
```

## Dependencies

The skill automatically installs `yfinance` if not present.

## Implementation

- **Script**: `scripts/finance.py`
- **Config**: `cfg/tickers.txt`
- **Language**: Python 3
- **API**: Yahoo Finance (via yfinance library)
