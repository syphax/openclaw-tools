#!/usr/bin/env python3
"""
Finance Tracker - Fetch comprehensive financial data for stocks, ETFs, and cryptocurrencies.
"""

import sys
import json
import subprocess
from datetime import datetime, timedelta

def ensure_yfinance():
    """Auto-install yfinance if not available."""
    try:
        import yfinance
        return yfinance
    except ImportError:
        print("Installing yfinance...", file=sys.stderr)
        try:
            # Try with --user flag first
            subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "--user", "yfinance"])
        except subprocess.CalledProcessError:
            # If that fails, try with --break-system-packages for externally-managed environments
            subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "--break-system-packages", "yfinance"])
        import yfinance
        return yfinance

def get_price_on_date(ticker, target_date):
    """Get closing price for a specific date."""
    try:
        # Fetch data for a range around the target date
        start = target_date - timedelta(days=7)
        end = target_date + timedelta(days=1)
        hist = ticker.history(start=start, end=end)

        if hist.empty:
            return None

        # Find the closest date
        closest_date = None
        for date in hist.index:
            if closest_date is None or abs((date.date() - target_date).days) < abs((closest_date.date() - target_date).days):
                if date.date() <= target_date:
                    closest_date = date

        if closest_date is not None:
            return float(hist.loc[closest_date]['Close'])
    except Exception:
        pass
    return None

def calculate_change_pct(current, previous):
    """Calculate percentage change."""
    if previous is None or previous == 0:
        return None
    return ((current - previous) / previous) * 100

def get_financial_data(symbol):
    """Fetch and calculate all financial metrics."""
    yf = ensure_yfinance()

    ticker = yf.Ticker(symbol)

    # Get current info
    try:
        info = ticker.info
        current_price = info.get('currentPrice') or info.get('regularMarketPrice')

        # If current price not in info, try latest from history
        if current_price is None:
            hist = ticker.history(period="5d")
            if not hist.empty:
                current_price = float(hist['Close'].iloc[-1])

        if current_price is None:
            return {"error": f"Could not fetch current price for {symbol}"}

        current_price = float(current_price)

    except Exception as e:
        return {"error": f"Failed to fetch data for {symbol}: {str(e)}"}

    # Get historical data
    try:
        # Get last close (previous day)
        hist_1d = ticker.history(period="5d")
        if len(hist_1d) >= 2:
            last_close = float(hist_1d['Close'].iloc[-2])
        else:
            last_close = current_price

        # Get today's open
        if len(hist_1d) >= 1:
            todays_open = float(hist_1d['Open'].iloc[-1])
        else:
            todays_open = current_price

        # Get last week's close (same day last week)
        today = datetime.now().date()
        last_week_date = today - timedelta(days=7)
        last_week_close = get_price_on_date(ticker, last_week_date)

        # Get 3-month history
        three_months_ago = today - timedelta(days=90)
        three_month_price = get_price_on_date(ticker, three_months_ago)

        # Get 1-year history
        one_year_ago = today - timedelta(days=365)
        one_year_price = get_price_on_date(ticker, one_year_ago)

    except Exception as e:
        return {"error": f"Failed to fetch historical data: {str(e)}"}

    # Calculate changes
    change_vs_open_pct = calculate_change_pct(current_price, todays_open)
    last_week_change_pct = calculate_change_pct(current_price, last_week_close) if last_week_close else None
    three_month_change_pct = calculate_change_pct(current_price, three_month_price) if three_month_price else None
    one_year_change_pct = calculate_change_pct(current_price, one_year_price) if one_year_price else None

    return {
        "symbol": symbol,
        "current_price": round(current_price, 2),
        "change_vs_open_pct": round(change_vs_open_pct, 2) if change_vs_open_pct is not None else None,
        "last_close": round(last_close, 2),
        "last_week_close": round(last_week_close, 2) if last_week_close else None,
        "last_week_change_pct": round(last_week_change_pct, 2) if last_week_change_pct else None,
        "three_month_change_pct": round(three_month_change_pct, 2) if three_month_change_pct else None,
        "one_year_change_pct": round(one_year_change_pct, 2) if one_year_change_pct else None,
    }

def main():
    """Main entry point."""
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: finance.py SYMBOL"}))
        sys.exit(1)

    symbol = sys.argv[1].upper()

    result = get_financial_data(symbol)
    print(json.dumps(result, indent=2))

    if "error" in result:
        sys.exit(1)

if __name__ == "__main__":
    main()
