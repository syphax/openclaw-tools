#!/bin/bash
# Setup daily cron jobs for GovRX scrapers
# - trumprx.gov scraper:    3:00 AM daily
# - costplusdrugs.com scraper: 3:23 AM daily

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
PYTHON_PATH=$(which python3)

install_cron() {
    local scraper_script="$1"
    local cron_schedule="$2"
    local log_file="$3"
    local label="$4"

    local cron_command="cd $SKILL_DIR && $PYTHON_PATH $scraper_script >> $SKILL_DIR/logs/$log_file 2>&1"
    local cron_entry="$cron_schedule $cron_command"

    if crontab -l 2>/dev/null | grep -F "$scraper_script" > /dev/null; then
        echo "Cron job already exists for $label."
        echo "Current entry:"
        crontab -l | grep -F "$scraper_script"
        echo ""
        read -p "Replace it? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "Skipping $label."
            return
        fi
        crontab -l | grep -v -F "$scraper_script" | crontab -
    fi

    (crontab -l 2>/dev/null; echo "$cron_entry") | crontab -
    echo "✅ Cron job installed for $label"
    echo "   Schedule: $cron_schedule"
    echo "   Logs: $SKILL_DIR/logs/$log_file"
    echo ""
}

install_cron "$SCRIPT_DIR/scrape_drugs.py"    "0 3 * * *"    "cron.log"         "GovRX (trumprx.gov)"
install_cron "$SCRIPT_DIR/scrape_costplus.py" "23 3 * * *"   "cron-costplus.log" "Cost Plus Drugs"

echo "To view all cron jobs: crontab -l"
echo "To remove a job: crontab -e"
