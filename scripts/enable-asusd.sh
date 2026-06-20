#!/usr/bin/bash
# Habilita el demonio asusd (Homebrew) para Aura / LEDs sin desactivar el
# sistema actual de perfiles y curvas (`rog-profile-sync.service`).
#
# El acuerdo del roadmap es este:
# - `asusd` / `asusctl` se usan SOLO para iluminación Aura
# - `rog-profile-sync.service` sigue dueño de platform_profile + fan curves
# - no usar `asusctl profile` ni `asusctl fan-curve` mientras convivan ambos
#
# Ejecutar con: sudo bash enable-asusd.sh
set -euo pipefail

AUTO_YES=0
if [[ "${1:-}" == "--yes" ]]; then
    AUTO_YES=1
fi

if [[ "$(id -u)" -ne 0 ]]; then
    printf 'Este script debe ejecutarse como root (sudo).\n' >&2
    exit 1
fi

BREW_PREFIX="/home/linuxbrew/.linuxbrew"
ASUSD_BIN="$BREW_PREFIX/bin/asusd"
ASUSCTL_CASK_DIR="$(ls -d "$BREW_PREFIX"/Caskroom/asusctl-linux/*/asusctl-* 2>/dev/null | head -1)"
ASUSCTL_ROOT="/usr/local"
ASUSCTL_SHARE_ROOT="$ASUSCTL_ROOT/share"
ASUSD_EXEC="$ASUSCTL_ROOT/bin/asusd"
ASUSD_ENV_DIR="/etc/asusd"
ASUSD_UNIT="/etc/systemd/system/asusd.service"

if [[ ! -x "$ASUSD_BIN" ]]; then
    printf 'No se encontró asusd en %s\n' "$ASUSD_BIN" >&2
    exit 1
fi

if [[ -z "$ASUSCTL_CASK_DIR" || ! -d "$ASUSCTL_CASK_DIR/usr" ]]; then
    printf 'No encontré el payload instalado de asusctl-linux en Homebrew.\n' >&2
    exit 1
fi

if [[ "$AUTO_YES" -ne 1 ]]; then
    read -r -p "Esto habilita asusd para Aura y MANTIENE rog-profile-sync activo. ¿Continuar? [s/N] " answer
    [[ "${answer,,}" == "s" ]] || { printf 'Cancelado.\n'; exit 0; }
fi

install -d -m 0755 "$ASUSCTL_ROOT/bin" "$ASUSCTL_SHARE_ROOT" "$ASUSD_ENV_DIR"
install -m 0755 "$ASUSCTL_CASK_DIR/usr/bin/asusd" "$ASUSD_EXEC"
rm -rf "$ASUSCTL_SHARE_ROOT/asusd" "$ASUSCTL_SHARE_ROOT/dbus-1"
cp -a "$ASUSCTL_CASK_DIR/usr/share/asusd" "$ASUSCTL_SHARE_ROOT/"
cp -a "$ASUSCTL_CASK_DIR/usr/share/dbus-1" "$ASUSCTL_SHARE_ROOT/"
chown -R root:root "$ASUSCTL_SHARE_ROOT/asusd" "$ASUSCTL_SHARE_ROOT/dbus-1" "$ASUSD_EXEC"
restorecon -Rv "$ASUSD_EXEC" "$ASUSCTL_SHARE_ROOT/asusd" "$ASUSCTL_SHARE_ROOT/dbus-1" >/dev/null 2>&1 || true

install -m 0644 "$BREW_PREFIX/Caskroom/asusctl-linux/"*/asusd.env "$ASUSD_ENV_DIR/asusd.env"
sed -i \
    -e "s|/opt/ublue-asusctl/share/asusd|$ASUSCTL_SHARE_ROOT/asusd|g" \
    -e "s|/opt/ublue-asusctl/share|$ASUSCTL_SHARE_ROOT|g" \
    "$ASUSD_ENV_DIR/asusd.env"

sed \
    -e "/^Environment=ASUSD_EXEC=/d" \
    -e "s|^ExecStart=.*|ExecStart=$ASUSD_EXEC|" \
    "$ASUSCTL_CASK_DIR/usr/lib/systemd/system/asusd.service" \
    > "$ASUSD_UNIT"
restorecon -v "$ASUSD_UNIT" >/dev/null 2>&1 || true

if ! grep -q '^\[Install\]' "$ASUSD_UNIT"; then
    cat >> "$ASUSD_UNIT" <<'EOF'

[Install]
WantedBy=multi-user.target
EOF
fi

# asusd necesita su política dbus en el bus de sistema
if [[ -f "$ASUSCTL_CASK_DIR/usr/share/dbus-1/system.d/asusd.conf" ]]; then
    install -m 0644 "$ASUSCTL_CASK_DIR/usr/share/dbus-1/system.d/asusd.conf" \
        /etc/dbus-1/system.d/asusd.conf
fi

systemctl daemon-reload
systemctl enable --now asusd.service
systemctl enable --now rog-profile-sync.service

printf '\nEstado rápido:\n'
systemctl is-enabled asusd.service || true
systemctl is-active asusd.service || true
systemctl is-enabled rog-profile-sync.service || true
systemctl is-active rog-profile-sync.service || true

cat > /etc/profile.d/rog-aura-only.sh <<'EOF'
# asusd convive con rog-profile-sync en este equipo.
# Para evitar peleas:
#   - usa asusctl/asusd solo para Aura / LEDs
#   - deja perfiles y curvas a rog-profile-sync / ROG Monitor
export ROG_AURA_ONLY=1
EOF

systemctl status asusd.service --no-pager | head -5

printf '\nListo. asusd quedó habilitado para Aura y rog-profile-sync siguió activo.\n'
printf 'Usa ROG Monitor / asusctl aura / asusctl leds para luces.\n'
