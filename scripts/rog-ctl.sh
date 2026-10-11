#!/usr/bin/bash
# rog-ctl — acciones de sistema de ROG Monitor con argumentos VALIDADOS.
#
# Reemplaza los antiguos `pkexec sh -c "<cadena armada por la app>"`: la app ya
# no construye shell para root, solo llama a este ayudante (root:root, en
# /usr/local/libexec/rog-monitor/) con argv fijo:
#
#   rog-ctl.sh fans-restart
#   rog-ctl.sh battery-limit <20..100>
#   rog-ctl.sh guardian --enabled 0|1 --mode protection|gaming --cpu 70..100 --gpu 70..87
#   rog-ctl.sh smart-summary
#   rog-ctl.sh smart-json /dev/nvme0n1|/dev/sda
#
# Nunca llama a supergfxctl.
set -euo pipefail
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin  # root: PATH fijo del sistema

LIBEXEC=/usr/local/libexec/rog-monitor
UNIT_DIR=/etc/systemd/system
GUARDIAN=rog-thermal-guardian.service

die() { printf 'rog-ctl: %s\n' "$*" >&2; exit 2; }

[[ "$(id -u)" -eq 0 ]] || die "requiere root (la app lo invoca con pkexec)"

int_in() { # int_in <valor> <min> <max>
    [[ "$1" =~ ^[0-9]+$ ]] && (( 10#$1 >= $2 && 10#$1 <= $3 ))
}

valid_dev() { [[ "$1" =~ ^/dev/(nvme[0-9]+n[0-9]+|sd[a-z]+)$ ]]; }

cmd="${1:-}"
[[ $# -gt 0 ]] && shift

case "$cmd" in
    fans-restart)
        systemctl restart rog-profile-sync.service
        ;;

    battery-limit)
        limit="${1:-}"
        int_in "$limit" 20 100 || die "límite inválido (entero 20..100): $limit"
        limit=$((10#$limit))
        [[ -f "$UNIT_DIR/rog-battery-limit.service" && -x "$LIBEXEC/rog-battery-limit.sh" ]] ||
            die "falta la integración de sistema (scripts/install-system.sh)"
        install -d -m 0755 /etc/rog-monitor
        printf 'CHARGE_LIMIT=%s\n' "$limit" > /etc/rog-monitor/battery.conf
        "$LIBEXEC/rog-battery-limit.sh" --limit "$limit"
        # Migra la unidad antigua de un solo propósito (corría antes que asusd).
        systemctl disable --now battery-charge-limit.service 2>/dev/null || true
        systemctl enable rog-battery-limit.service
        ;;

    guardian)
        enabled=""; mode=""; cpu=""; gpu=""; dry=0
        while [[ $# -gt 0 ]]; do
            [[ $# -ge 2 ]] || die "falta valor para $1"
            case "$1" in
                --enabled) enabled="$2" ;;
                --mode)    mode="$2" ;;
                --cpu)     cpu="$2" ;;
                --gpu)     gpu="$2" ;;
                --dry)     dry="$2" ;;   # 1 = simulación (no toca hardware)
                *) die "argumento desconocido: $1" ;;
            esac
            shift 2
        done
        [[ "$enabled" == 0 || "$enabled" == 1 ]] || die "--enabled debe ser 0 o 1"
        [[ "$mode" == protection || "$mode" == gaming ]] || die "--mode debe ser protection o gaming"
        [[ "$dry" == 0 || "$dry" == 1 ]] || die "--dry debe ser 0 o 1"
        int_in "$cpu" 70 100 || die "--cpu fuera de rango 70..100"
        int_in "$gpu" 70 87 || die "--gpu fuera de rango 70..87"
        cpu=$((10#$cpu)); gpu=$((10#$gpu))
        [[ -f "$UNIT_DIR/$GUARDIAN" ]] ||
            die "falta la unidad $GUARDIAN (scripts/install-system.sh)"
        install -d -m 0755 "$UNIT_DIR/$GUARDIAN.d"
        {
            printf '[Service]\n'
            printf 'Environment="ROG_THERMAL_MODE=%s"\n' "$mode"
            printf 'Environment="ROG_THERMAL_CPU_CEILING=%s"\n' "$cpu"
            printf 'Environment="ROG_THERMAL_GPU_CEILING=%s"\n' "$gpu"
            printf 'Environment="ROG_THERMAL_CEILING=%s"\n' "$gpu"
            printf 'Environment="ROG_THERMAL_DRY=%s"\n' "$dry"
        } > "$UNIT_DIR/$GUARDIAN.d/override.conf"
        systemctl daemon-reload
        if [[ "$enabled" == 1 ]]; then
            systemctl enable --now "$GUARDIAN"
            systemctl restart "$GUARDIAN"   # recoge techos/modo nuevos si ya corría
        else
            systemctl disable --now "$GUARDIAN"
        fi
        ;;

    smart-summary)
        found=0
        for d in /sys/block/*; do
            name="${d##*/}"
            [[ "$name" =~ ^(nvme[0-9]+n[0-9]+|sd[a-z]+)$ ]] || continue
            found=1
            echo "===/dev/$name"
            smartctl -H -A "/dev/$name" 2>&1 |
                grep -iE "result|percentage used|temperature|power_on|available spare:|reallocated|wear" || true
        done
        (( found )) || die "no encontré discos"
        ;;

    smart-json)
        dev="${1:-}"
        valid_dev "$dev" || die "dispositivo no permitido: $dev"
        exec smartctl -j -a "$dev"
        ;;

    *)
        die "uso: rog-ctl.sh {fans-restart|battery-limit N|guardian ...|smart-summary|smart-json DEV}"
        ;;
esac
