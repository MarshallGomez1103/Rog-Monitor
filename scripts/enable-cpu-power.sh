#!/usr/bin/bash
# Hace legible la potencia de la CPU (Intel RAPL) para usuarios normales,
# para que ROG Monitor pueda mostrar los watts de la CPU.
#
# El kernel restringe energy_uj a root como mitigación del side-channel
# PLATYPUS (CVE-2020-8694). En un portátil personal de un solo usuario el
# riesgo es despreciable. Ejecutar con: sudo bash enable-cpu-power.sh
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
    printf 'Este script debe ejecutarse como root (sudo).\n' >&2
    exit 1
fi

TMPFILES_RULE="/etc/tmpfiles.d/rog-monitor-rapl.conf"

{
    printf '# ROG Monitor: lectura de potencia CPU (Intel RAPL) sin root\n'
    for f in /sys/class/powercap/intel-rapl:*/energy_uj \
        /sys/class/powercap/intel-rapl:*:*/energy_uj; do
        [[ -e "$f" ]] && printf 'z %s 0444 - - -\n' "$f"
    done
} > "$TMPFILES_RULE"

systemd-tmpfiles --create "$TMPFILES_RULE"

printf 'Listo. Reglas en %s (persisten tras reiniciar).\n' "$TMPFILES_RULE"
printf 'Verificación: '
if [[ -r /sys/class/powercap/intel-rapl:0/energy_uj ]] &&
    sudo -u "${SUDO_USER:-nobody}" cat /sys/class/powercap/intel-rapl:0/energy_uj >/dev/null 2>&1; then
    printf 'OK, energy_uj legible.\n'
else
    printf 'aún no legible, revisa permisos.\n'
fi
