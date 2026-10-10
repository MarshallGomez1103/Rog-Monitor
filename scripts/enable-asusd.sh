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
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin  # root: PATH fijo del sistema

AUTO_YES=0
USER_OWNED_OK=0
for arg in "$@"; do
    case "$arg" in
        --yes) AUTO_YES=1 ;;
        # Sin esta opción se rechaza una fuente que un usuario sin privilegios
        # pueda modificar (Homebrew es del usuario). La app NUNCA la pasa.
        --i-understand-user-owned-source) USER_OWNED_OK=1 ;;
        *) printf 'Opción desconocida: %s\n' "$arg" >&2; exit 2 ;;
    esac
done

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

# Este script COPIA binarios del payload de Homebrew a /usr/local como root.
# Si algún archivo del payload o algún directorio padre es de un usuario sin
# privilegios (o escribible por grupo/otros), ese usuario ejecutaría código como
# root a través de asusd. Se exige que todo sea root:root y no escribible por
# otros, salvo --i-understand-user-owned-source.
not_root_owned() { # not_root_owned <ruta>: verdadero si NO es de root o es g/o+w
    local u m
    read -r u m < <(stat -L -c '%u %a' -- "$1" 2>/dev/null) || return 0
    [[ "$u" != 0 ]] || (( (8#$m & 8#022) != 0 ))
}
untrusted=""
d="$ASUSCTL_CASK_DIR"
while [[ "$d" != "/" && "$d" != "." ]]; do
    not_root_owned "$d" && { untrusted="$d"; break; }
    d="$(dirname -- "$d")"
done
if [[ -z "$untrusted" ]]; then
    untrusted="$(find -L "$ASUSCTL_CASK_DIR/usr" "$BREW_PREFIX/Caskroom/asusctl-linux" \
        \( ! -user root -o -perm /022 \) -print -quit 2>/dev/null || true)"
fi
if [[ -n "$untrusted" && "$USER_OWNED_OK" -ne 1 ]]; then
    printf 'Rechazado: la fuente de asusd no es de root (o es escribible por otros): %s\n' "$untrusted" >&2
    printf 'Copiarla a /usr/local como root dejaría a ese usuario ejecutar código como root.\n' >&2
    printf 'Si confías en ese prefijo, ejecuta a mano:\n  sudo bash %s --i-understand-user-owned-source\n' "$0" >&2
    exit 3
fi
if [[ -n "$untrusted" ]]; then
    printf 'AVISO: instalando asusd desde una fuente no-root (%s), por --i-understand-user-owned-source.\n' "$untrusted" >&2
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
