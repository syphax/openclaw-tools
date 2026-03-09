#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
echo "Running digest-utils.test.ts..."
npx ts-node --esm digest-utils.test.ts
echo "✅ Test passed!"
