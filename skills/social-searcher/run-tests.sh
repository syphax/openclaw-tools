#!/bin/bash

# Test runner for social-searcher module
# Run from skills/social-searcher directory

set -e  # Exit on first error

echo "🧪 Running social-searcher test suite..."
echo ""

echo "📋 Test 1: digest-utils.test.ts"
npx ts-node --esm digest-utils.test.ts
echo ""

echo "📋 Test 2: sports-utils.test.ts"
npx ts-node --esm sports-utils.test.ts
echo ""

echo "📋 Test 3: rex-engine.test.ts (import compatibility & JSON resilience)"
npx ts-node --esm rex-engine.test.ts
echo ""

echo "✅ All tests passed!"
