#!/usr/bin/env python3
"""
fix_midnight_timestamps.py

For rows where Pull Time is before 3:00am, re-dates them to the prior day
and maps the time into the 23:50–23:59 range so they group with the
previous day's data.

Mapping: 00:01 → 23:50, 03:00 → 23:59 (linear scale)

Usage:
    python fix_midnight_timestamps.py [path/to/fifa-resale-tickets.csv]

Defaults to skills/fifa-marketplace/data/fifa-resale-tickets.csv relative
to the repository root (the script's grandparent directory).
"""

import csv
import shutil
import sys
from datetime import date, timedelta
from pathlib import Path

CUTOFF_MINUTES = 3 * 60          # 03:00
OUT_START_MINUTES = 23 * 60 + 50  # 23:50
OUT_END_MINUTES   = 23 * 60 + 59  # 23:59


def remap_time(pull_time: str) -> tuple[bool, str, bool]:
    """
    Returns (should_remap, new_time_str, was_remapped).
    If the time is >= 03:00, returns (False, pull_time, False).
    """
    h, m = map(int, pull_time.split(":"))
    in_minutes = h * 60 + m

    if in_minutes >= CUTOFF_MINUTES:
        return False, pull_time, False

    # Linear map: [1, 180] → [1430, 1439]
    # Clamp input to at least 1 minute so 00:00 lands at 23:50.
    clamped = max(in_minutes, 1)
    ratio = (clamped - 1) / (CUTOFF_MINUTES - 1)  # 0.0 at 00:01, 1.0 at 03:00
    out_minutes = round(OUT_START_MINUTES + ratio * (OUT_END_MINUTES - OUT_START_MINUTES))
    out_h, out_m = divmod(out_minutes, 60)
    return True, f"{out_h:02d}:{out_m:02d}", True


def process(csv_path: Path) -> None:
    # --- backup ---
    backup_path = csv_path.with_suffix(".csv.bak")
    shutil.copy2(csv_path, backup_path)
    print(f"Backup written to {backup_path}")

    rows = []
    with csv_path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        for row in reader:
            rows.append(row)

    remapped = 0
    for row in rows:
        pull_time = row["Pull Time"]
        should_remap, new_time, was_remapped = remap_time(pull_time)
        if was_remapped:
            pull_date = date.fromisoformat(row["Pull Date"])
            row["Pull Date"] = (pull_date - timedelta(days=1)).isoformat()
            row["Pull Time"] = new_time
            remapped += 1

    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Done. {remapped} row(s) remapped out of {len(rows)} total.")


def main():
    if len(sys.argv) > 1:
        csv_path = Path(sys.argv[1])
    else:
        script_dir = Path(__file__).resolve().parent
        csv_path = script_dir.parent / "data" / "fifa-resale-tickets.csv"

    if not csv_path.exists():
        print(f"Error: file not found: {csv_path}", file=sys.stderr)
        sys.exit(1)

    process(csv_path)


if __name__ == "__main__":
    main()
