#!/usr/bin/env bash
# Remove user-level ROG Monitor launchers. Root services are handled by
# scripts/rog-monitor-safe-mode.sh.

set -euo pipefail

BIN_DIR="${HOME}/.local/bin"
APPS_DIR="${HOME}/.local/share/applications"

rm -f "$BIN_DIR/monitor" "$APPS_DIR/rog-monitor.desktop"
update-desktop-database "$APPS_DIR" 2>/dev/null || true

printf 'User launchers removed.\n'
printf 'User config was kept under ~/.config/rog-monitor and ~/.local/share/rog-monitor.\n'
printf 'To remove root integrations: sudo bash scripts/rog-monitor-safe-mode.sh uninstall\n'
