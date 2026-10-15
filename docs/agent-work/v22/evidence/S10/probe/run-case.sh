#!/usr/bin/env bash
# Ejecuta UN caso de la matriz y imprime la medicion.
#   run-case.sh <wayland|x11> <display-idx> <corner|fullscreen> [extra args de la sonda]
# Variables: ELECTRON (binario), PROBE_SECS (defecto 7).
# Guarda el PID, mata siempre solo el proceso lanzado (y su grupo) al terminar.
set -u
MODE="$1"; DISP="$2"; CORNER="$3"; shift 3
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ELECTRON="${ELECTRON:?definir ELECTRON}"
SECS="${PROBE_SECS:-7}"
LOG="$(mktemp "${TMPDIR:-/tmp}/rogprobe-case-XXXXXX.log")"
ARGS=(--display="$DISP" --secs="$SECS")
if [ "$CORNER" = fullscreen ]; then ARGS+=(--fullscreen --title="ROG Overlay Probe FS"); else ARGS+=(--corner="$CORNER"); fi
PLAT=()
[ "$MODE" = x11 ] && PLAT=(--ozone-platform=x11)

echo "=== CASE mode=$MODE display=$DISP anchor=$CORNER ==="
setsid "$ELECTRON" "$HERE" "${PLAT[@]}" "${ARGS[@]}" "$@" >"$LOG" 2>&1 &
PID=$!
sleep $((SECS - 3))
"$HERE/kwin-dump.sh"
if [ "$MODE" = x11 ]; then
  for id in $(xdotool search --name "ROG Overlay Probe" 2>/dev/null); do
    echo "XDOTOOL|$id|$(xdotool getwindowgeometry --shell "$id" 2>/dev/null | tr '\n' ' ')"
  done
  xwininfo -name "ROG Overlay Probe" 2>/dev/null | grep -E 'Absolute|Width|Height' | tr '\n' ' ' | sed 's/^/XWININFO|/'; echo
fi
for _ in $(seq 1 20); do kill -0 "$PID" 2>/dev/null || break; sleep 0.5; done
if kill -0 "$PID" 2>/dev/null; then kill "$PID"; sleep 1; kill -9 "$PID" 2>/dev/null; echo "(forzado kill de $PID)"; fi
grep '^PROBE ' "$LOG" | sed 's/^/ELECTRON|/'
grep -iE 'ozone|wayland|error' "$LOG" | grep -v '^PROBE' | head -3 | sed 's/^/LOG|/'
rm -f "$LOG"
