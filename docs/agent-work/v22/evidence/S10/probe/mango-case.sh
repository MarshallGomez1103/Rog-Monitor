#!/usr/bin/env bash
# MangoHud sobre una app Vulkan de demostracion (vkcube, NO es un juego):
# comprueba que position=... se respeta dentro de la ventana de la app.
#   mango-case.sh <position> [wsi: xcb|wayland]
# Usa un MANGOHUD_CONFIGFILE temporal (no toca ~/.config/MangoHud). El HUD usa
# fondo magenta opaco para localizarlo por pixeles. Mata solo su PID.
set -u
POS="${1:?position}"; WSI="${2:-xcb}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONF="$(mktemp "${TMPDIR:-/tmp}/rogprobe-mango-XXXXXX.conf")"
cat > "$CONF" <<EOF
position=$POS
font_size=22
background_color=FF00FF
background_alpha=1.0
text_color=FFFF00
legacy_layout=0
fps
cpu_stats
gpu_stats
ram
vram
EOF
echo "=== MANGO position=$POS wsi=$WSI ==="
MANGOHUD=1 MANGOHUD_CONFIGFILE="$CONF" setsid vkcube --wsi "$WSI" >/dev/null 2>&1 &
PID=$!
sleep 5
"$HERE/kwin-dump.sh" vkcube
SHOT="${TMPDIR:-/tmp}/rogprobe-shot-$$.png"
spectacle -b -n -f -o "$SHOT" >/dev/null 2>&1
if [ -s "$SHOT" ]; then python3 -I "$HERE/shot-analyze.py" "$SHOT" | grep -E 'size|magenta'; else echo "SHOT no disponible"; fi
rm -f "$SHOT" "$CONF"
kill "$PID" 2>/dev/null; sleep 1; kill -9 "$PID" 2>/dev/null
