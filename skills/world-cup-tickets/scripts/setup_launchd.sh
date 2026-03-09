#!/bin/bash
set -euo pipefail

SKILL_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
LAUNCHD_DIR="$SKILL_DIR/launchd"
AGENTS_DIR="$HOME/Library/LaunchAgents"
UID_VAL=$(id -u)

# Detect PATH to inject into launchd environment (no shell profile is sourced by launchd)
detect_launch_path() {
  local parts=()

  # NVM node (for npx/node) — resolve alias chain up to 3 levels
  local nvm_dir="${NVM_DIR:-$HOME/.nvm}"
  if [[ -f "$nvm_dir/alias/default" ]]; then
    local nvm_ver
    nvm_ver=$(cat "$nvm_dir/alias/default")
    for _ in 1 2 3; do
      [[ "$nvm_ver" == v* ]] && break
      [[ -f "$nvm_dir/alias/$nvm_ver" ]] && nvm_ver=$(cat "$nvm_dir/alias/$nvm_ver") || break
    done
    local nvm_bin="$nvm_dir/versions/node/${nvm_ver}/bin"
    if [[ -d "$nvm_bin" ]]; then
      parts+=("$nvm_bin")
      echo "  node/npx: $nvm_bin (nvm $nvm_ver)" >&2
    fi
  fi

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

echo "Installing World Cup Tickets launchd agents..."
echo "Detected paths:"
LAUNCH_PATH=$(detect_launch_path)
echo ""

install_agent "com.openclaw.world-cup-tickets"

echo "Done. To check status:"
echo "  launchctl print gui/${UID_VAL}/com.openclaw.world-cup-tickets"
echo ""
echo "To uninstall:"
echo "  launchctl bootout gui/${UID_VAL} ~/Library/LaunchAgents/com.openclaw.world-cup-tickets.plist"
