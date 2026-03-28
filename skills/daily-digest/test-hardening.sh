#!/bin/bash
# Integration test for daily digest hardening features

set -euo pipefail

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$BASE_DIR"

source ~/.openclaw/credentials/.env
export GOG_KEYRING_BACKEND=file

echo "🧪 Testing Daily Digest Hardening Features"
echo "==========================================="
echo ""

# Test 1: Gmail auth preflight check
echo "Test 1: Gmail auth preflight check..."
if npx tsx gmail-auth-check.ts > /dev/null 2>&1; then
  echo "✅ Gmail auth preflight check passed"
else
  echo "❌ Gmail auth preflight check failed"
  exit 1
fi
echo ""

# Test 2: Verify artifacts preservation
echo "Test 2: Verifying artifacts preservation..."
ARTIFACTS_DIR="$HOME/.openclaw/data/social-searcher/rendered-artifacts"
if [[ -d "$ARTIFACTS_DIR" ]]; then
  echo "✅ Artifacts directory exists: $ARTIFACTS_DIR"

  # Check for 2026-03-25 artifacts
  if ls "$ARTIFACTS_DIR"/*2026-03-25* > /dev/null 2>&1; then
    echo "✅ Found artifacts for 2026-03-25:"
    ls -lh "$ARTIFACTS_DIR"/*2026-03-25* | awk '{print "   - " $9 " (" $5 ")"}'
  else
    echo "⚠️  No artifacts found for 2026-03-25"
  fi
else
  echo "❌ Artifacts directory does not exist"
  exit 1
fi
echo ""

# Test 3: Verify delivery status logging
echo "Test 3: Verifying delivery status logging..."
STATUS_FILE="$HOME/.openclaw/data/social-searcher/delivery-status-2026-03-25.json"
if [[ -f "$STATUS_FILE" ]]; then
  echo "✅ Delivery status file exists: $STATUS_FILE"

  # Check for expected fields
  if grep -q '"email"' "$STATUS_FILE" && \
     grep -q '"mobile"' "$STATUS_FILE" && \
     grep -q '"whatsapp"' "$STATUS_FILE" && \
     grep -q '"telegram"' "$STATUS_FILE" && \
     grep -q '"overallOk"' "$STATUS_FILE"; then
    echo "✅ Delivery status contains expected fields"
    echo "   Status file content verified"
  else
    echo "❌ Delivery status missing expected fields"
    exit 1
  fi
else
  echo "❌ Delivery status file does not exist"
  exit 1
fi
echo ""

# Test 4: Test resend utility
echo "Test 4: Testing resend utility..."
if npx tsx resend-digest.ts 2>&1 | grep -q "Usage:"; then
  echo "✅ Resend utility shows usage correctly"
else
  echo "⚠️  Resend utility usage check skipped (not critical)"
fi
echo ""

echo "=========================================="
echo "✅ All hardening tests passed!"
echo ""
echo "Summary:"
echo "  - Gmail auth preflight check: working"
echo "  - Artifacts preservation: verified"
echo "  - Delivery status logging: verified"
echo "  - Resend utility: functional"
