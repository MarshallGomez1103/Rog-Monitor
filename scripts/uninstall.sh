#!/usr/bin/env bash
# Desinstalador de una línea para ROG Monitor.
#
#   bash scripts/uninstall.sh            # quita app + integraciones, CONSERVA configs
#   bash scripts/uninstall.sh --purge    # quita TODO, incluidas las configuraciones
#
# Qué hace:
#   - Nivel usuario (sin sudo): launcher ~/.local/bin/monitor, entrada de menú,
#     entrada de autostart.
#   - Nivel sistema (pide sudo UNA vez, con aviso previo): deshabilita y borra
#     los servicios systemd (ventiladores, guardián, power-source), su udev rule
#     y los scripts en /usr/local/sbin. Reusa rog-monitor-safe-mode.sh.
#   - Con --purge: además borra ~/.config/rog-monitor y ~/.local/share/rog-monitor.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="${HOME}/.local/bin"
APPS_DIR="${HOME}/.local/share/applications"
AUTOSTART="${HOME}/.config/autostart/rog-monitor.desktop"
CONFIG_DIR="${HOME}/.config/rog-monitor"
DATA_DIR="${HOME}/.local/share/rog-monitor"
PURGE=0
[[ "${1:-}" == "--purge" ]] && PURGE=1

printf '== Desinstalando ROG Monitor ==\n\n'

# --- Nivel usuario (sin privilegios) ---
rm -f "$BIN_DIR/monitor" "$APPS_DIR/rog-monitor.desktop" "$AUTOSTART"
update-desktop-database "$APPS_DIR" 2>/dev/null || true
printf 'Quitados: launcher, entrada de menú y autoarranque.\n'

# --- Nivel sistema (sudo, con aviso) ---
SAFE_MODE="$REPO/scripts/rog-monitor-safe-mode.sh"
if [[ -f "$SAFE_MODE" ]]; then
    printf '\nSe pedirá sudo para quitar las integraciones de sistema:\n'
    printf '  - deshabilitar y borrar servicios systemd (ventiladores, guardián, power-source)\n'
    printf '  - borrar la udev rule y los scripts en /usr/local/sbin\n'
    if sudo bash "$SAFE_MODE" uninstall; then
        printf 'Integraciones de sistema removidas.\n'
    else
        printf 'No se pudieron remover las integraciones de sistema (sin sudo o cancelado).\n' >&2
        printf 'Puedes hacerlo luego con: sudo bash %s uninstall\n' "$SAFE_MODE" >&2
    fi
fi

# --- Configuraciones ---
if [[ "$PURGE" -eq 1 ]]; then
    rm -rf "$CONFIG_DIR" "$DATA_DIR"
    printf '\nConfiguraciones y datos borrados (--purge).\n'
else
    printf '\nSe conservaron tus configuraciones en:\n  %s\n  %s\n' "$CONFIG_DIR" "$DATA_DIR"
    printf 'Para borrarlas también: bash %s --purge\n' "$0"
fi

printf '\nListo. ROG Monitor fue desinstalado.\n'
