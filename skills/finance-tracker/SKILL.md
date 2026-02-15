# finance-tracker

Fetch comprehensive financial data for stocks, ETFs, and cryptocurrencies with historical comparisons and trend analysis.

## Usage

```bash
finance-tracker SYMBOL
```

### Examples

```bash
# Stock analysis
finance-tracker AAPL

# ETF analysis
finance-tracker QQQ

# Cryptocurrency analysis
finance-tracker BTC-USD
```

## What it provides

- **Current Snapshot**: Current price, change vs today's open, last close
- **Weekly Comparison**: Compare current price with same day last week
- **Long-term Trends**: 3-month and 1-year performance

## Output

Returns JSON with:
- `symbol`: Ticker symbol
- `current_price`: Current market price
- `change_vs_open_pct`: Percentage change from today's open
- `last_close`: Previous closing price
- `last_week_close`: Closing price from same day last week
- `last_week_change_pct`: Weekly performance percentage
- `three_month_change_pct`: 3-month performance percentage
- `one_year_change_pct`: 1-year performance percentage

## Dependencies

The skill automatically installs `yfinance` if not present.

## Implementation

- **Script**: `scripts/finance.py`
- **Language**: Python 3
- **API**: Yahoo Finance (via yfinance library)
