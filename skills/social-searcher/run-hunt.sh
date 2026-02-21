#!/bin/bash
# Wrapper script to run the Social Searcher hunt
# This script ensures proper execution environment and error handling

set -euo pipefail

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Change to the script directory
cd "$SCRIPT_DIR"

# Check if node is available
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed or not in PATH" >&2
    echo "Please install Node.js from https://nodejs.org/" >&2
    exit 1
fi

# Check if npx is available
if ! command -v npx &> /dev/null; then
    echo "ERROR: npx is not available (should come with npm)" >&2
    exit 1
fi

# Check if node_modules exists, if not run npm install
if [ ! -d "node_modules" ]; then
    echo "Dependencies not found. Installing..." >&2
    if ! npm install; then
        echo "ERROR: Failed to install dependencies" >&2
        exit 1
    fi
fi

# Check if required files exist
if [ ! -f "social-searcher.ts" ]; then
    echo "ERROR: social-searcher.ts not found" >&2
    exit 1
fi

if [ ! -f "social-search-config.json" ]; then
    echo "ERROR: social-search-config.json not found" >&2
    exit 1
fi

# Create browser profile directory if it doesn't exist
BROWSER_PROFILE_DIR="$HOME/.openclaw/browser-profiles/social-searcher"
if [ ! -d "$BROWSER_PROFILE_DIR" ]; then
    mkdir -p "$BROWSER_PROFILE_DIR"
fi

# Run the TypeScript script, forwarding all arguments
echo "Starting social media hunt..." >&2
if npx ts-node social-searcher.ts "$@"; then
    echo "Hunt completed successfully!" >&2
    exit 0
else
    EXIT_CODE=$?
    echo "ERROR: Hunt failed with exit code $EXIT_CODE" >&2
    exit $EXIT_CODE
fi
