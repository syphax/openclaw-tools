#!/usr/bin/env python3
import csv
import json
from collections import defaultdict
from datetime import date
from pathlib import Path

BASE = Path('/Users/bcc/Code/git/openclaw-tools/skills/world-cup-tickets')
CSV_PATH = BASE / 'ticket-price-history.csv'
STATUS_PATH = BASE / 'logs' / 'last-run-status.json'
OUT_PATH = BASE / 'logs' / 'daily-415-summary.json'


def read_status():
    if not STATUS_PATH.exists():
        return {'status': 'failure', 'error': f'Missing status file: {STATUS_PATH}'}
    try:
        return json.loads(STATUS_PATH.read_text())
    except Exception as e:
        return {'status': 'failure', 'error': f'Invalid status file: {e}'}


def compute_avg_for_day(rows, day):
    by_match = defaultdict(list)
    for r in rows:
        if r['Date'] == day and r['Category'] == '1' and r['Quantity'] == '1':
            by_match[r['Match']].append(float(r['Price']))
    if not by_match:
        return None, 0
    # one price per match (qty=1, cat=1); if duplicates exist, average per match then unweighted across matches
    match_vals = [sum(v)/len(v) for _, v in sorted(by_match.items())]
    return sum(match_vals)/len(match_vals), len(match_vals)


def main():
    status = read_status()
    result = {
        'generated_at': str(date.today()),
        'script_status': status.get('status', 'failure'),
        'script_error': status.get('error'),
    }

    if status.get('status') != 'success':
        OUT_PATH.write_text(json.dumps(result, indent=2))
        print(json.dumps(result))
        return

    rows = list(csv.DictReader(CSV_PATH.open()))
    if not rows:
        result.update({'script_status': 'failure', 'script_error': 'CSV has no rows'})
        OUT_PATH.write_text(json.dumps(result, indent=2))
        print(json.dumps(result))
        return

    dates = sorted({r['Date'] for r in rows})
    today = dates[-1]
    prior = dates[-2] if len(dates) >= 2 else None

    avg_today, matches_today = compute_avg_for_day(rows, today)
    avg_prior, matches_prior = (compute_avg_for_day(rows, prior) if prior else (None, 0))

    result.update({
        'date': today,
        'prior_date': prior,
        'category': 1,
        'quantity': 1,
        'matches_count': matches_today,
        'avg_category1_price': round(avg_today, 2) if avg_today is not None else None,
        'prior_avg_category1_price': round(avg_prior, 2) if avg_prior is not None else None,
        'change_vs_prior': round(avg_today - avg_prior, 2) if (avg_today is not None and avg_prior is not None) else None,
        'change_direction': ('up' if avg_today > avg_prior else 'down' if avg_today < avg_prior else 'flat') if (avg_today is not None and avg_prior is not None) else None,
    })

    OUT_PATH.write_text(json.dumps(result, indent=2))
    print(json.dumps(result))


if __name__ == '__main__':
    main()
