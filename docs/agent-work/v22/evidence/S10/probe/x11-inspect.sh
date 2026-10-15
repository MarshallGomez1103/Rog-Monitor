#!/usr/bin/env bash
# Lanza UNA sonda en XWayland y vuelca atributos X11 de su ventana
# (override-redirect, tipo, estado EWMH, geometria), mas el dump de KWin.
#   x11-inspect.sh [args extra de la sonda, p. ej. --type=notification]
# Variables: ELECTRON, TMPDIR.
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ELECTRON="${ELECTRON:?definir ELECTRON}"
LOG="$(mktemp "${TMPDIR:-/tmp}/rogprobe-x11i-XXXXXX.log")"
setsid "$ELECTRON" "$HERE" --ozone-platform=x11 --monitor=0 --corner=top-right --secs=6 "$@" >"$LOG" 2>&1 &
PID=$!
sleep 3.5
echo "--- xwininfo"; xwininfo -name "ROG Overlay Probe" -wm -stats 2>&1 | grep -E 'Absolute|Width|Height|Override|Map State|Window type|Hints|state|Frame'
echo "--- xprop"; xprop -name "ROG Overlay Probe" _NET_WM_WINDOW_TYPE _NET_WM_STATE _NET_FRAME_EXTENTS WM_CLASS _MOTIF_WM_HINTS WM_HINTS 2>&1
echo "--- kwin"; "$HERE/kwin-dump.sh"
for _ in $(seq 1 12); do kill -0 "$PID" 2>/dev/null || break; sleep 0.5; done
if kill -0 "$PID" 2>/dev/null; then kill "$PID"; sleep 1; kill -9 "$PID" 2>/dev/null; echo "(forzado kill de $PID)"; fi
rm -f "$LOG"
