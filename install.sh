#!/usr/bin/env bash
# Instalador de UNA LÍNEA para ROG Monitor.
#
#   bash install.sh
#
# Hace primero todo lo de usuario SIN sudo (entorno Python, comando `monitor`,
# icono en el menú y acceso en el escritorio). Solo al final, y avisando
# exactamente para qué, pide sudo una vez para la integración de sistema.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

printf '╔══════════════════════════════════════════╗\n'
printf '║   ROG Monitor — instalación               ║\n'
printf '╚══════════════════════════════════════════╝\n\n'

# 1) Pieza de terminal (venv + comando monitor). Sin sudo.
bash "$REPO/scripts/install.sh"

# 2) App de escritorio (npm + entrada de menú) si hay npm. Sin sudo.
if command -v npm >/dev/null 2>&1; then
    bash "$REPO/scripts/install-desktop.sh"
    # Acceso directo en el escritorio del usuario, además del menú.
    DESKTOP_DIR="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"
    if [[ -d "$DESKTOP_DIR" ]]; then
        cp -f "$HOME/.local/share/applications/rog-monitor.desktop" "$DESKTOP_DIR/" 2>/dev/null || true
        chmod +x "$DESKTOP_DIR/rog-monitor.desktop" 2>/dev/null || true
        gio set "$DESKTOP_DIR/rog-monitor.desktop" metadata::trusted true 2>/dev/null || true
        printf 'Acceso directo creado en el escritorio.\n'
    fi
else
    printf '\nnpm no encontrado: se omite la app de escritorio.\n'
fi

# 3) Integración de sistema (sudo) — con aviso claro ANTES de pedir contraseña.
printf '\n────────────────────────────────────────────\n'
printf 'Falta la integración de sistema (opcional pero recomendada).\n'
printf 'Se pedirá sudo UNA vez para:\n'
printf '  1) Instalar el servicio de control de ventiladores (rog-profile-sync).\n'
printf '  2) Dejar lista la unidad del guardián térmico (se activa luego desde la app).\n'
printf '  3) Permitir leer la potencia de la CPU sin root (RAPL).\n'
printf '  4) Instalar smartmontools (necesario para el panel SMART de discos).\n'
printf 'NO se instalará ningún cambio automático de perfil ni de GPU.\n'
printf '────────────────────────────────────────────\n'
read -r -p '¿Instalar la integración de sistema ahora? [S/n] ' ans
case "${ans:-S}" in
    [nN]*)
        printf '\nSaltada. Puedes instalarla luego con:\n  sudo bash %s/scripts/install-system.sh %s\n' "$REPO" "$REPO"
        ;;
    *)
        sudo bash "$REPO/scripts/install-system.sh" "$REPO"
        ;;
esac

printf '\n✓ Listo.\n'
printf '  Terminal:  monitor\n'
printf '  Escritorio: busca "ROG Monitor" en el menú o en el escritorio.\n'
printf '\nDesinstalar cuando quieras:\n  bash %s/uninstall.sh           (conserva tus configuraciones)\n' "$REPO"
printf '  bash %s/uninstall.sh --purge   (borra también las configuraciones)\n' "$REPO"
printf '\nRescate desde TTY si algo se traba:\n  sudo bash %s/scripts/rog-monitor-safe-mode.sh disable\n' "$REPO"
