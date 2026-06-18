#!/usr/bin/env bash
# One-command user install for ROG Monitor.
#
# Run without sudo:
#   bash scripts/install-all.sh

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

bash "$REPO/scripts/install.sh"

if command -v npm >/dev/null 2>&1; then
    bash "$REPO/scripts/install-desktop.sh"
else
    printf '\nSkipping desktop app: npm was not found.\n'
    printf 'Install Node.js/npm and run: bash %s/scripts/install-desktop.sh\n' "$REPO"
fi

printf '\nInstalled user-facing pieces.\n'
printf 'Terminal: monitor\n'
printf 'Desktop: ROG Monitor app menu entry when npm was available.\n'
printf '\nOptional privileged helpers:\n'
printf '  sudo bash %s/scripts/enable-cpu-power.sh\n' "$REPO"
printf '\nEmergency disable from TTY:\n'
printf '  sudo bash %s/scripts/rog-monitor-safe-mode.sh disable\n' "$REPO"
