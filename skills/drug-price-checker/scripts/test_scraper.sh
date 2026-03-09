#!/bin/bash
# Quick test script for the GovRX scraper

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"

echo "🧪 Testing GovRX Scraper"
echo "========================"
echo ""

# Check Python
echo "1. Checking Python..."
if ! command -v python3 &> /dev/null; then
    echo "   ❌ Python 3 not found"
    exit 1
fi
PYTHON_VERSION=$(python3 --version)
echo "   ✅ $PYTHON_VERSION"
echo ""

# Check syntax
echo "2. Validating Python syntax..."
if python3 -m py_compile "$SCRIPT_DIR/scrape_drugs.py" 2>/dev/null; then
    echo "   ✅ Syntax is valid"
else
    echo "   ❌ Syntax error in scrape_drugs.py"
    python3 -m py_compile "$SCRIPT_DIR/scrape_drugs.py"
    exit 1
fi
echo ""

# Check config
echo "3. Checking configuration..."
if [ -f "$SKILL_DIR/cfg/govrx-config.json" ]; then
    echo "   ✅ Config file exists"
    if python3 -c "import json; json.load(open('$SKILL_DIR/cfg/govrx-config.json'))" 2>/dev/null; then
        echo "   ✅ Config JSON is valid"
    else
        echo "   ❌ Config JSON is invalid"
        exit 1
    fi
else
    echo "   ❌ Config file not found"
    exit 1
fi
echo ""

# Check directories
echo "4. Checking directory structure..."
for dir in cfg data logs scripts; do
    if [ -d "$SKILL_DIR/$dir" ]; then
        echo "   ✅ $dir/"
    else
        echo "   ❌ $dir/ missing"
        exit 1
    fi
done
echo ""

# Dry run check
echo "5. Testing scraper (this will install dependencies and run)..."
echo "   Note: First run may take a few minutes to install Playwright"
echo ""

cd "$SKILL_DIR"
python3 "$SCRIPT_DIR/scrape_drugs.py"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Test completed successfully!"
    echo ""
    echo "Check the output:"
    echo "  - CSV: data/prescription-drugs.csv"
    echo "  - Logs: logs/govrx.log"
else
    echo ""
    echo "❌ Test failed. Check logs/govrx.log for details"
    exit 1
fi
