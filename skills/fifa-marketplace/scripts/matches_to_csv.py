#!/usr/bin/env python3
"""Convert cfg/matches.json to data/matches.csv."""

import csv
import json
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SKILL_DIR = os.path.dirname(SCRIPT_DIR)

INPUT = os.path.join(SKILL_DIR, "cfg", "matches.json")
OUTPUT = os.path.join(SKILL_DIR, "data", "matches.csv")

with open(INPUT) as f:
    matches = json.load(f)

os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)

fieldnames = list(matches[0].keys())
with open(OUTPUT, "w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(matches)

print(f"Wrote {len(matches)} matches to {OUTPUT}")
