#!/usr/bin/env bash
# Integración de sistema de ROG Monitor (requiere root). La llama install.sh
# tras avisar al usuario. Instala SOLO lo seguro y necesario:
#   - servicio de ventiladores (rog-profile-sync) + script en /usr/local/sbin
#   - unidad del guardián térmico (NO se habilita: es opt-in desde la app)
#   - lectura de potencia CPU sin root (RAPL)
#
# NO instala el auto-cambio de perfil por fuente de poder (rog-power-source +
# udev): eso movía el perfil solo y contribuyó a un arranque problemático en
# batería. Queda como opt-in manual; el usuario manda el perfil.
set -euo pipefail

REPO="${1:?uso: install-system.sh <ruta-repo>}"
SBIN=/usr/local/sbin
UNITS=/etc/systemd/system

if [[ "$(id -u)" -ne 0 ]]; then
    printf 'Debe ejecutarse como root.\n' >&2
    exit 1
fi

# 1) Servicio de ventiladores/perfil.
install -m 0755 "$REPO/scripts/rog-profile-sync.sh" "$SBIN/rog-profile-sync"
install -m 0644 "$REPO/systemd/rog-profile-sync.service" "$UNITS/rog-profile-sync.service"

# 2) Unidad del guardián térmico (sin habilitar — se activa desde la app).
sed "s#__ROG_MONITOR_REPO__#$REPO#g" \
    "$REPO/systemd/rog-thermal-guardian.service" > "$UNITS/rog-thermal-guardian.service"

systemctl daemon-reload
systemctl enable --now rog-profile-sync.service || true

# 3) Lectura de potencia CPU sin root (RAPL).
bash "$REPO/scripts/enable-cpu-power.sh" || true

# 4) smartmontools — necesario para el panel SMART de discos (pkexec smartctl -j -a).
#    Se instala si no está presente; se detecta el gestor de paquetes disponible.
if ! command -v smartctl >/dev/null 2>&1; then
    printf 'Instalando smartmontools (necesario para Salud SMART de discos)…\n'
    if command -v dnf >/dev/null 2>&1; then
        dnf install -y smartmontools || true
    elif command -v apt-get >/dev/null 2>&1; then
        apt-get install -y --no-install-recommends smartmontools || true
    elif command -v pacman >/dev/null 2>&1; then
        pacman -S --noconfirm smartmontools || true
    elif command -v zypper >/dev/null 2>&1; then
        zypper install -y smartmontools || true
    else
        printf 'No se pudo detectar el gestor de paquetes. Instala smartmontools manualmente.\n' >&2
    fi
else
    printf 'smartmontools ya instalado (%s).\n' "$(smartctl --version | head -1)"
fi

printf 'Integración de sistema instalada (ventiladores activos; guardián listo para activar desde la app).\n'
printf 'El auto-perfil por fuente de poder NO se instaló (opt-in). Tú mandas el perfil.\n'
