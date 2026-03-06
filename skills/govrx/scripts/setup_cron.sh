#!/bin/bash
# Setup daily cron job for GovRX scraper
# Runs daily at 3:00 AM

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
SCRAPER_SCRIPT="$SCRIPT_DIR/scrape_drugs.py"

# Get the python path
PYTHON_PATH=$(which python3)

# Cron entry
CRON_SCHEDULE="0 3 * * *"
CRON_COMMAND="cd $SKILL_DIR && $PYTHON_PATH $SCRAPER_SCRIPT >> $SKILL_DIR/logs/cron.log 2>&1"
CRON_ENTRY="$CRON_SCHEDULE $CRON_COMMAND"

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -F "$SCRAPER_SCRIPT" > /dev/null; then
    echo "Cron job already exists for GovRX scraper."
    echo "Current cron entry:"
    crontab -l | grep -F "$SCRAPER_SCRIPT"
    echo ""
    read -p "Do you want to replace it? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 0
    fi
    # Remove old entry
    crontab -l | grep -v -F "$SCRAPER_SCRIPT" | crontab -
fi

# Add new cron entry
(crontab -l 2>/dev/null; echo "$CRON_ENTRY") | crontab -

echo "✅ Cron job installed successfully!"
echo ""
echo "Schedule: Daily at 3:00 AM"
echo "Script: $SCRAPER_SCRIPT"
echo "Logs: $SKILL_DIR/logs/cron.log"
echo ""
echo "To view cron jobs: crontab -l"
echo "To remove this job: crontab -e (then delete the line with 'scrape_drugs.py')"
