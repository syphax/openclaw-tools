#!/bin/bash
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Building time-tracker frontend..."
cd "$SKILL_DIR/web"
npm install
npm run build

rm -rf "$SKILL_DIR/public"
cp -r dist "$SKILL_DIR/public"

echo "Frontend built and copied to $SKILL_DIR/public"
