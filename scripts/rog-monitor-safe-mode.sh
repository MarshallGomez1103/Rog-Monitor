#!/usr/bin/env bash
# Emergency/system control for ROG Monitor root integrations.
#
# Usage:
#   sudo bash scripts/rog-monitor-safe-mode.sh status
#   sudo bash scripts/rog-monitor-safe-mode.sh no-auto-profile
#   sudo bash scripts/rog-monitor-safe-mode.sh disable
#   sudo bash scripts/rog-monitor-safe-mode.sh uninstall [--purge]
#        bash scripts/rog-monitor-safe-mode.sh uninstall --dry-run   (sin root)
#
# "no-auto-profile" desactiva SOLO el auto-cambio de perfil por AC/batería
# (evita que el perfil se mueva solo y el arranque problemático en batería).
#
# "disable" is the safe recovery action from a TTY: it stops automatic root
# services without deleting user config. "uninstall" removes installed root
# units/scripts/rules and the root-owned copies in /usr/local/libexec/rog-monitor
# and /usr/local/lib/rog-monitor, leaving the user-owned repo and ~/.config intact.
# It also removes what enable-asusd.sh / enable-cpu-power.sh installed (asusd
# binary + unit + dbus policy, RAPL tmpfiles rule). It is idempotent (running it
# twice is fine). CONFIG is kept by default: /etc/rog-monitor/battery.conf and
# /etc/asusd/ (Aura settings); --purge deletes /etc/rog-monitor and the
# asusd.env we installed.
#
# --dry-run prints every action and changes nothing (no root needed).
# ROG_PREFIX=/tmp/x acts on a scratch tree instead of the live system (no
# systemctl/udevadm/chmod, no root needed) — used by tests/test_install_dryrun.py.

set -euo pipefail
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin  # root: PATH fijo del sistema

DRY=0
PURGE=0
ACTION=""
for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY=1 ;;
        --purge)   PURGE=1 ;;
        -*) printf 'Unknown option: %s\n' "$arg" >&2; exit 2 ;;
        *)  if [[ -z "$ACTION" ]]; then ACTION="$arg"; else printf 'Unexpected argument: %s\n' "$arg" >&2; exit 2; fi ;;
    esac
done
ACTION="${ACTION:-status}"

# Prefijo de pruebas ("/" o vacío = sistema vivo). Rutas literales + prefijo.
P="${ROG_PREFIX:-}"
P="${P%/}"
case "$P" in ''|/?*) ;; *) printf 'ROG_PREFIX must be an absolute path\n' >&2; exit 2 ;; esac

if [[ -z "$P" && "$DRY" -eq 0 && "$(id -u)" -ne 0 ]]; then
    printf 'Run with sudo.\n' >&2
    exit 1
fi

# Acción con efecto: en --dry-run solo se imprime.
act() {
    if (( DRY )); then printf '[dry-run] %s\n' "$*"; else "$@"; fi
}
# Acción sobre el SISTEMA VIVO (systemd, udev, permisos de /sys): se omite con prefijo.
sysact() {
    if [[ -n "$P" ]]; then printf '[prefix: omitido] %s\n' "$*"; else act "$@"; fi
}

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
        sysact systemctl disable --now "$svc" 2>/dev/null || true
    done
    sysact udevadm control --reload-rules 2>/dev/null || true
    sysact systemctl daemon-reload
}

uninstall_system() {
    local ours_asusd=0 f
    # ¿El asusd de /etc/systemd/system lo puso enable-asusd.sh? (apunta a /usr/local/bin)
    if grep -qs '^ExecStart=/usr/local/bin/asusd' "$P/etc/systemd/system/asusd.service"; then
        ours_asusd=1
    fi
    disable_system
    sysact systemctl disable --now rog-battery-limit.service 2>/dev/null || true
    (( ours_asusd )) && { sysact systemctl disable --now asusd.service 2>/dev/null || true; }
    act rm -f -- \
        "$P/etc/systemd/system/rog-power-source.service" \
        "$P/etc/systemd/system/rog-profile-sync.service" \
        "$P/etc/systemd/system/rog-thermal-guardian.service" \
        "$P/etc/systemd/system/rog-battery-limit.service" \
        "$P/etc/systemd/system-sleep/rog-battery-limit" \
        "$P/etc/udev/rules.d/99-rog-power-source.rules" \
        "$P/usr/local/sbin/rog-power-source" \
        "$P/usr/local/sbin/rog-profile-sync" \
        "$P/usr/local/sbin/rog-battery-limit" \
        "$P/etc/tmpfiles.d/rog-monitor-rapl.conf" \
        "$P/etc/profile.d/rog-aura-only.sh" \
        "$P/usr/local/bin/asusd" \
        "$P/usr/local/share/dbus-1/system.d/asusd.conf"
    act rm -rf -- "$P/etc/systemd/system/rog-thermal-guardian.service.d"
    act rm -rf -- "$P/usr/local/share/asusd"
    act rm -rf -- "$P/run/rog-monitor"   # marcador de calibración (tmpfs)
    if (( ours_asusd )); then
        act rm -f -- "$P/etc/systemd/system/asusd.service" "$P/etc/dbus-1/system.d/asusd.conf"
    fi
    # Directorios que quedan vacíos (no falla si no lo están o no existen).
    act rmdir -- "$P/usr/local/share/dbus-1/system.d" "$P/usr/local/share/dbus-1" 2>/dev/null || true
    # Permisos de RAPL: la regla tmpfiles los dejó 0444; el kernel los trae 0400.
    for f in /sys/class/powercap/intel-rapl:*/energy_uj; do   # el glob ya incluye intel-rapl:0:0
        [[ -e "$f" ]] && { sysact chmod 0400 -- "$f" 2>/dev/null || true; }
    done
    # Configuración: se CONSERVA salvo --purge.
    if (( PURGE )); then
        act rm -rf -- "$P/etc/rog-monitor"
        (( ours_asusd )) && act rm -f -- "$P/etc/asusd/asusd.env"
        act rmdir -- "$P/etc/asusd" 2>/dev/null || true
    else
        printf 'Kept config: /etc/rog-monitor/ (battery.conf) and /etc/asusd/ (use --purge to delete).\n'
    fi
    sysact udevadm control --reload-rules 2>/dev/null || true
    sysact systemctl daemon-reload
    # Copias root:root de ayudantes y paquete Python (rutas literales). Va al
    # final: este script puede estar corriendo desde ahí (bash ya lo tiene abierto).
    act rm -rf -- "$P/usr/local/libexec/rog-monitor"
    act rm -rf -- "$P/usr/local/lib/rog-monitor"
}

# Neutraliza SOLO el cambio automático de perfil por fuente de poder
# (rog-power-source + su udev rule + la notificación de usuario). Deja
# ventiladores y guardián intactos. Esto evita que el perfil "se mueva solo"
# (performance→quiet al desconectar) y el escenario de arranque en batería que
# dejó el equipo sin desktop. El usuario manda el perfil; nada lo reescribe.
disable_auto_profile() {
    sysact systemctl disable --now rog-power-source.service 2>/dev/null || true
    act rm -f -- "$P/etc/udev/rules.d/99-rog-power-source.rules"
    sysact udevadm control --reload-rules 2>/dev/null || true
    local home_user
    for home_user in /var/home/* /home/*; do
        [[ -d "$home_user" ]] || continue
        local u; u="$(basename "$home_user")"
        sysact sudo -u "$u" XDG_RUNTIME_DIR="/run/user/$(id -u "$u" 2>/dev/null)" \
            systemctl --user disable --now rog-power-notify.service 2>/dev/null || true
    done
    sysact systemctl daemon-reload
}

case "$ACTION" in
    status)
        status_services
        ;;
    no-auto-profile)
        disable_auto_profile
        printf 'Auto-perfil por fuente de poder DESACTIVADO. El perfil ya no se mueve solo.\n'
        ;;
    disable)
        disable_system
        printf 'ROG Monitor root services disabled. Reboot when ready.\n'
        ;;
    uninstall)
        uninstall_system
        if (( DRY )); then
            printf 'DRY-RUN: nothing was changed.\n'
        elif (( PURGE )); then
            printf 'ROG Monitor root integrations uninstalled; system config purged.\n'
        else
            printf 'ROG Monitor root integrations uninstalled. User config was kept.\n'
        fi
        ;;
    *)
        printf 'Usage: sudo bash %s {status|no-auto-profile|disable|uninstall [--purge]} [--dry-run]\n' "$0" >&2
        exit 2
        ;;
esac
