#!/bin/bash
# Setup script for wikipedia-search skill

echo "Setting up wikipedia-search skill..."

# Make the script executable
chmod +x /Users/bcc/Code/git/openclaw-tools/skills/wikipedia-search/scripts/wiki.py
echo "✓ Made wiki.py executable"

# Create symbolic link
ln -sf /Users/bcc/Code/git/openclaw-tools/skills/wikipedia-search /Users/bcc/.openclaw/skills/wikipedia-search
echo "✓ Created symbolic link"

# Verify setup
echo ""
echo "Verification:"
ls -la /Users/bcc/Code/git/openclaw-tools/skills/wikipedia-search/scripts/wiki.py
echo ""
ls -la /Users/bcc/.openclaw/skills/ | grep wikipedia

echo ""
echo "Setup complete! Test with:"
echo "python3 ~/.openclaw/skills/wikipedia-search/scripts/wiki.py --help"
