#!/bin/bash
set -euo pipefail

SKILL_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
LAUNCHD_DIR="$SKILL_DIR/launchd"
AGENTS_DIR="$HOME/Library/LaunchAgents"
UID_VAL=$(id -u)

# Detect PATH to inject into launchd environment (no shell profile is sourced by launchd)
detect_launch_path() {
  local parts=()

  # python3 location
  local py3
  py3=$(command -v python3 2>/dev/null || true)
  if [[ -n "$py3" ]]; then
    echo "  python3:  $py3" >&2
  fi

  parts+=("/opt/homebrew/bin" "/usr/local/bin" "/usr/bin" "/bin" "/usr/sbin" "/sbin")
  local IFS=":"
  echo "${parts[*]}"
}

mkdir -p "$AGENTS_DIR"

install_agent() {
    local label="$1"
    local plist_src="$LAUNCHD_DIR/${label}.plist"
    local plist_dst="$AGENTS_DIR/${label}.plist"

    if launchctl print "gui/${UID_VAL}/${label}" &>/dev/null; then
        echo "Unloading existing job: $label"
        launchctl bootout "gui/${UID_VAL}" "$plist_dst" 2>/dev/null || true
    fi

    cp "$plist_src" "$plist_dst"
    /usr/libexec/PlistBuddy -c "Set :EnvironmentVariables:PATH ${LAUNCH_PATH}" "$plist_dst"

    launchctl bootstrap "gui/${UID_VAL}" "$plist_dst"
    echo "Installed: $label"
    launchctl print "gui/${UID_VAL}/${label}" | grep -E "state|next scheduled"
    echo ""
}

echo "Installing Drug Price Checker launchd agents..."
echo "Detected paths:"
LAUNCH_PATH=$(detect_launch_path)
echo ""

install_agent "com.openclaw.drug-price-checker.govdrugstats"
install_agent "com.openclaw.drug-price-checker.costplus"

echo "Done. To check status:"
echo "  launchctl print gui/${UID_VAL}/com.openclaw.drug-price-checker.govdrugstats"
echo "  launchctl print gui/${UID_VAL}/com.openclaw.drug-price-checker.costplus"
echo ""
echo "To uninstall:"
echo "  launchctl bootout gui/${UID_VAL} ~/Library/LaunchAgents/com.openclaw.drug-price-checker.govdrugstats.plist"
echo "  launchctl bootout gui/${UID_VAL} ~/Library/LaunchAgents/com.openclaw.drug-price-checker.costplus.plist"
