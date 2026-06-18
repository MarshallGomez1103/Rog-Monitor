#!/usr/bin/env bash
# Emergency/system control for ROG Monitor root integrations.
#
# Usage:
#   sudo bash scripts/rog-monitor-safe-mode.sh status
#   sudo bash scripts/rog-monitor-safe-mode.sh disable
#   sudo bash scripts/rog-monitor-safe-mode.sh uninstall
#
# "disable" is the safe recovery action from a TTY: it stops automatic root
# services without deleting user config. "uninstall" removes installed root
# units/scripts/rules, leaving the user-owned repo and ~/.config intact.

set -euo pipefail

ACTION="${1:-status}"

if [[ "$(id -u)" -ne 0 ]]; then
    printf 'Run with sudo.\n' >&2
    exit 1
fi

SYSTEM_SERVICES=(
    rog-power-source.service
    rog-profile-sync.service
    rog-thermal-guardian.service
)

USER_SERVICES=(
    rog-power-notify.service
)

status_services() {
    local svc
    for svc in "${SYSTEM_SERVICES[@]}"; do
        printf '%-32s active=%-10s enabled=%s\n' \
            "$svc" \
            "$(systemctl is-active "$svc" 2>/dev/null || true)" \
            "$(systemctl is-enabled "$svc" 2>/dev/null || true)"
    done
}

disable_system() {
    local svc
    for svc in "${SYSTEM_SERVICES[@]}"; do
        systemctl disable --now "$svc" 2>/dev/null || true
    done
    udevadm control --reload-rules 2>/dev/null || true
    systemctl daemon-reload
}

uninstall_system() {
    disable_system
    rm -f \
        /etc/systemd/system/rog-power-source.service \
        /etc/systemd/system/rog-profile-sync.service \
        /etc/systemd/system/rog-thermal-guardian.service \
        /etc/udev/rules.d/99-rog-power-source.rules \
        /usr/local/sbin/rog-power-source \
        /usr/local/sbin/rog-profile-sync
    rm -rf /etc/systemd/system/rog-thermal-guardian.service.d
    udevadm control --reload-rules 2>/dev/null || true
    systemctl daemon-reload
}

case "$ACTION" in
    status)
        status_services
        ;;
    disable)
        disable_system
        printf 'ROG Monitor root services disabled. Reboot when ready.\n'
        ;;
    uninstall)
        uninstall_system
        printf 'ROG Monitor root integrations uninstalled. User config was kept.\n'
        ;;
    *)
        printf 'Usage: sudo bash %s {status|disable|uninstall}\n' "$0" >&2
        exit 2
        ;;
esac
