#!/bin/bash
# run-pulse.sh - Run the Reddit Pulse summarization mode
set -e
cd "$(dirname "$0")"
npx ts-node reddit-pulse.ts "$@"
