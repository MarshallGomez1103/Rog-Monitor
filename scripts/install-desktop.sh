#!/usr/bin/bash
# Installs the desktop app: npm deps + application menu entry.
# Run WITHOUT sudo:  bash scripts/install-desktop.sh
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APPS_DIR="$HOME/.local/share/applications"

if ! command -v npm >/dev/null; then
    printf 'npm is required for the desktop app.\n' >&2
    exit 1
fi

(cd "$REPO/desktop" && npm install --no-audit --no-fund)
chmod +x "$REPO/desktop/start.sh"

mkdir -p "$APPS_DIR"
cat > "$APPS_DIR/rog-monitor.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=ROG Monitor
Comment=Real-time hardware monitor for ASUS ROG laptops
Exec=$REPO/desktop/start.sh
Icon=$REPO/desktop/assets/icon.png
Terminal=false
Categories=System;Monitor;
StartupWMClass=rog-monitor
EOF

update-desktop-database "$APPS_DIR" 2>/dev/null || true
printf 'Desktop app installed. Find "ROG Monitor" in your application menu,\n'
printf 'or run: %s/desktop/start.sh\n' "$REPO"
