#!/bin/bash
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SKILL_DIR"

# Source credentials (for openclaw message send)
source ~/.openclaw/credentials/.env 2>/dev/null || true

exec npx tsx src/server.ts
