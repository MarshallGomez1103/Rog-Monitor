#!/usr/bin/env bash
# Integración de sistema de ROG Monitor (requiere root). La llama install.sh
# (con sudo) y la app (REINSTALAR / REPARAR, con pkexec) tras avisar al usuario.
#
#   sudo bash scripts/install-system.sh [--dry-run]
#
# INVARIANTE DE SEGURIDAD: nada de lo que corre como root (pkexec o unidades
# systemd) se ejecuta ni se importa desde un archivo escribible por el usuario.
# Este script copia TODO lo privilegiado a rutas root:root:
#   /usr/local/libexec/rog-monitor/   ayudantes (0755) + VERSION
#   /usr/local/lib/rog-monitor/       paquete Python rog_monitor (dirs 0755, archivos 0644)
# Python como root corre SIEMPRE aislado (rog-py.sh = python3 -I + sys.path fijo).
# Esta es la única acción que ejecuta código del repo como root, y solo cuando
# el usuario la confirma de forma explícita.
#
# Instala SOLO lo seguro y necesario:
#   - servicio de ventiladores (rog-profile-sync)
#   - unidad del guardián térmico (NO se habilita: es opt-in desde la app)
#   - límite de carga (unidad + hook de reanudación; se habilita desde la app)
#   - lectura de potencia CPU sin root (RAPL)
#   - smartmontools (panel SMART)
#
# NO instala el auto-cambio de perfil por fuente de poder (rog-power-source +
# udev): queda como opt-in manual; el usuario manda el perfil. NO habilita nada
# que llame a supergfxctl.
#
# Pruebas sin root:
#   bash scripts/install-system.sh --dry-run            # solo imprime
#   ROG_PREFIX=/tmp/x bash scripts/install-system.sh    # instala bajo /tmp/x
#     (con ROG_PREFIX no se toca systemd ni paquetes ni se exige root)
set -euo pipefail
umask 022

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DRY=0
for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY=1 ;;
        -*) printf 'Opción desconocida: %s\n' "$arg" >&2; exit 2 ;;
        *) ;;  # ruta de repo posicional (compat. antigua): se ignora, REPO sale de este script
    esac
done

PREFIX="${ROG_PREFIX:-}"
PREFIX="${PREFIX%/}"
LIBEXEC="$PREFIX/usr/local/libexec/rog-monitor"
PYLIB="$PREFIX/usr/local/lib/rog-monitor"
SBIN="$PREFIX/usr/local/sbin"          # solo para limpiar copias antiguas
UNITS="$PREFIX/etc/systemd/system"
SLEEP_DIR="$PREFIX/etc/systemd/system-sleep"
ETC_ROG="$PREFIX/etc/rog-monitor"

# Ayudantes que corren como root (todos salen de scripts/).
HELPERS=(
    rog-py.sh rog-ctl.sh
    apply-power-control.sh apply-gpu-clocks.sh calibrate-fans.sh
    enable-asusd.sh enable-cpu-power.sh
    rog-profile-sync.sh rog-thermal-guardian.sh rog-power-source.sh
    rog-battery-limit.sh rog-monitor-safe-mode.sh
)

die() { printf 'Error: %s\n' "$*" >&2; exit 1; }

# Acción con efecto: en --dry-run solo se imprime.
act() {
    if (( DRY )); then printf '[dry-run] %s\n' "$*"; else "$@"; fi
}
# Acción sobre el SISTEMA VIVO (systemd, paquetes): se omite con ROG_PREFIX.
sysact() {
    if [[ -n "$PREFIX" ]]; then printf '[prefix: omitido] %s\n' "$*"; else act "$@"; fi
}

if [[ -z "$PREFIX" && "$DRY" -eq 0 && "$(id -u)" -ne 0 ]]; then
    die "debe ejecutarse como root (sudo). Para probar sin root usa --dry-run o ROG_PREFIX=/ruta."
fi

# Las rutas bajo las que hacemos rm -rf son constantes + prefijo; defensa extra.
case "$PYLIB" in
    */usr/local/lib/rog-monitor) ;;
    *) die "ruta interna inesperada: $PYLIB" ;;
esac

# Origen: ningún symlink (root no debe leer un archivo ajeno vía un enlace del repo).
need_file() { [[ -f "$1" && ! -L "$1" ]] || die "falta (o es un symlink): $1"; }
for h in "${HELPERS[@]}"; do need_file "$REPO/scripts/$h"; done
for f in rog-profile-sync.service rog-thermal-guardian.service rog-battery-limit.service rog-power-source.service; do
    need_file "$REPO/systemd/$f"
done
need_file "$REPO/scripts/rog-battery-limit-resume.sh"
need_file "$REPO/VERSION"
[[ -d "$REPO/src/rog_monitor" && ! -L "$REPO/src/rog_monitor" ]] || die "falta $REPO/src/rog_monitor"

printf 'ROG Monitor — integración de sistema%s\n' "$( ((DRY)) && printf ' (DRY-RUN: no se cambia nada)')"
printf '  repo (origen)  : %s\n  ayudantes      : %s\n  paquete Python : %s\n\n' "$REPO" "$LIBEXEC" "$PYLIB"

# 0) Directorios root:root 0755 (cada nivel con modo explícito).
for d in "$PREFIX/usr/local" "$PREFIX/usr/local/libexec" "$LIBEXEC" "$PREFIX/usr/local/lib" "$PYLIB" \
         "$PREFIX/etc" "$PREFIX/etc/systemd" "$UNITS" "$SLEEP_DIR" "$ETC_ROG"; do
    act install -d -m 0755 "$d"
done

# 1) Ayudantes de root.
for h in "${HELPERS[@]}"; do
    act install -m 0755 "$REPO/scripts/$h" "$LIBEXEC/$h"
done

# 2) Paquete Python: se prepara aparte y se cambia de un golpe (sin __pycache__).
STAGE="$PYLIB/.rog_monitor.new"
act rm -rf -- "$STAGE"
act install -d -m 0755 "$STAGE"
SRC="$REPO/src/rog_monitor"
while IFS= read -r -d '' f; do
    rel="${f#"$SRC"/}"
    act install -D -m 0644 "$f" "$STAGE/$rel"
done < <(find "$SRC" -type d -name __pycache__ -prune -o -type f ! -name '*.pyc' -print0)
act rm -rf -- "$PYLIB/rog_monitor"
act mv -- "$STAGE" "$PYLIB/rog_monitor"

# 3) Unidades systemd (ExecStart apunta a /usr/local/libexec/rog-monitor/...).
act install -m 0644 "$REPO/systemd/rog-profile-sync.service" "$UNITS/rog-profile-sync.service"
act install -m 0644 "$REPO/systemd/rog-thermal-guardian.service" "$UNITS/rog-thermal-guardian.service"  # sin habilitar
act install -m 0644 "$REPO/systemd/rog-battery-limit.service" "$UNITS/rog-battery-limit.service"
# /usr es de solo lectura en Fedora Atomic: /etc/systemd/system-sleep es el sitio soportado.
act install -m 0755 "$REPO/scripts/rog-battery-limit-resume.sh" "$SLEEP_DIR/rog-battery-limit"
# El auto-perfil sigue siendo opt-in: solo se REFRESCA su unidad si ya existía.
if [[ -f "$UNITS/rog-power-source.service" ]]; then
    act install -m 0644 "$REPO/systemd/rog-power-source.service" "$UNITS/rog-power-source.service"
fi

# 4) Etiquetas SELinux para lo recién copiado (no fatal).
if command -v restorecon >/dev/null 2>&1; then
    sysact restorecon -R "$LIBEXEC" "$PYLIB" || true
fi

# 5) VERSION al final: si algo falló antes, la app ve versión distinta y pide reinstalar.
act install -m 0644 "$REPO/VERSION" "$LIBEXEC/VERSION"

# 6) Activar: servicio de ventiladores (como antes) y recargar el guardián si ya corría.
sysact systemctl daemon-reload
sysact systemctl enable rog-profile-sync.service
sysact systemctl restart rog-profile-sync.service || true
if [[ -z "$PREFIX" ]] && systemctl is-active --quiet rog-thermal-guardian.service 2>/dev/null; then
    act systemctl restart rog-thermal-guardian.service || true
fi

# 7) Copias antiguas en /usr/local/sbin (ejecutaban código del repo del usuario).
for old in rog-profile-sync rog-battery-limit rog-power-source; do
    act rm -f -- "$SBIN/$old"
done

# 8) Lectura de potencia CPU sin root (RAPL).
sysact bash "$LIBEXEC/enable-cpu-power.sh" || true

# 9) smartmontools — necesario para el panel SMART de discos.
if [[ -n "$PREFIX" ]]; then
    printf '[prefix: omitido] comprobar/instalar smartmontools\n'
elif command -v smartctl >/dev/null 2>&1; then
    printf 'smartmontools ya instalado (%s).\n' "$(smartctl --version | head -1)"
elif (( DRY )); then
    printf '[dry-run] instalar smartmontools con el gestor de paquetes disponible\n'
else
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
fi

printf '\nIntegración de sistema lista%s (ventiladores activos; guardián listo para activar desde la app).\n' \
    "$( ((DRY)) && printf ' [DRY-RUN: no se cambió nada]')"
printf 'El auto-perfil por fuente de poder NO se instaló (opt-in). Tú mandas el perfil.\n'
printf 'Verifica el dueño:  ls -ld %s %s   (deben ser root root)\n' "$LIBEXEC" "$PYLIB"
