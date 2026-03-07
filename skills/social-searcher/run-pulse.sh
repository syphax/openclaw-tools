#!/bin/bash
# run-pulse.sh - Run the Reddit Pulse summarization mode
set -e
cd "$(dirname "$0")"
npx tsx reddit-pulse.ts "$@"
