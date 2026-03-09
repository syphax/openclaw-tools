#!/bin/bash
# Setup daily cron jobs for Drug Price Checker scrapers
# - trumprx.gov scraper:    3:00 AM daily  (via run_daily_govdrugstats.sh)
# - costplusdrugs.com scraper: 3:23 AM daily (via run_daily_costplus.sh)

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"

install_cron() {
    local run_script="$1"
    local cron_schedule="$2"
    local label="$3"

    local cron_entry="$cron_schedule bash $run_script"

    if crontab -l 2>/dev/null | grep -F "$run_script" > /dev/null; then
        echo "Cron job already exists for $label."
        echo "Current entry:"
        crontab -l | grep -F "$run_script"
        echo ""
        read -p "Replace it? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "Skipping $label."
            return
        fi
        crontab -l | grep -v -F "$run_script" | crontab -
    fi

    (crontab -l 2>/dev/null; echo "$cron_entry") | crontab -
    echo "Cron job installed for $label"
    echo "   Schedule: $cron_schedule"
    echo "   Logs: $SKILL_DIR/logs/"
    echo ""
}

install_cron "$SCRIPT_DIR/run_daily_govdrugstats.sh" "0 3 * * *"  "GovDrugStats (trumprx.gov)"
install_cron "$SCRIPT_DIR/run_daily_costplus.sh"     "23 3 * * *" "Cost Plus Drugs"

echo "To view all cron jobs: crontab -l"
echo "To remove a job: crontab -e"
