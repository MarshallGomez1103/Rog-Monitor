#!/usr/bin/env bash
# Caso "encima de pantalla completa": una ventana fullscreen de prueba (titulo
# "ROG Overlay Probe FS", fondo azul #0000a0) y el overlay de la sonda (fondo
# magenta semitransparente rgba(255,0,255,.5)).
#   fs-case.sh <wayland|x11> <fs-monitor-idx> <overlay-monitor-idx> [extra args del overlay, p. ej. --type=notification]
# Mediciones: KWin (geometria, keepAbove, fullScreen, layer, indice de apilado,
# ventana activa), arbol X11 y una captura de pantalla (spectacle) analizada por
# pixeles: si el overlay esta encima del fullscreen aparece el color mezcla
# (128,0,208); si esta tapado solo hay azul. La captura se borra siempre.
# Variables: ELECTRON, TMPDIR, FS_MODE (opcional), FS_OUTPUT (opcional), NO_ACTIVATE=1 (no da foco al fullscreen). Mata solo sus propios PIDs.
set -u
MODE="$1"; FSD="$2"; OVD="$3"; shift 3
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ELECTRON="${ELECTRON:?definir ELECTRON}"
LOG1="$(mktemp "${TMPDIR:-/tmp}/rogprobe-fs-XXXXXX.log")"
LOG2="$(mktemp "${TMPDIR:-/tmp}/rogprobe-ov-XXXXXX.log")"
PLAT=(); [ "$MODE" = x11 ] && PLAT=(--ozone-platform=x11)
# FS_MODE (opcional) fuerza otra plataforma para la ventana fullscreen (p. ej. juego Wayland nativo + overlay x11)
FSMODE="${FS_MODE:-$MODE}"; PLATFS=(); [ "$FSMODE" = x11 ] && PLATFS=(--ozone-platform=x11)
echo "=== FSCASE mode=$MODE fs-platform=$FSMODE fullscreen-monitor=$FSD overlay-monitor=$OVD extra=$* ==="
setsid "$ELECTRON" "$HERE" "${PLATFS[@]}" --fullscreen --monitor="$FSD" --secs=16 --title="ROG Overlay Probe FS" --bg="#0000a0" >"$LOG1" 2>&1 &
PID1=$!
sleep 3
setsid "$ELECTRON" "$HERE" "${PLAT[@]}" --corner=top-right --monitor="$OVD" --secs=12 --bg="rgba(255,0,255,0.5)" "$@" >"$LOG2" 2>&1 &
PID2=$!
# espera a que ambas sondas hayan reportado (1,5 s tras mostrarse), max 15 s
for _ in $(seq 1 30); do
  grep -q '^PROBE ' "$LOG1" && grep -q '^PROBE ' "$LOG2" && break
  sleep 0.5
done
sleep 1
# FS_OUTPUT (opcional): mueve el fullscreen a esa salida de KWin (p. ej. HDMI-A-3)
[ -n "${FS_OUTPUT:-}" ] && { "$HERE/kwin-move.sh" "ROG Overlay Probe FS" "$FS_OUTPUT"; sleep 1; }
# el juego real seria la ventana activa: damos foco al fullscreen de prueba
if [ "${NO_ACTIVATE:-0}" != 1 ]; then
  for _ in 1 2 3 4 5; do
    "$HERE/kwin-activate.sh" "ROG Overlay Probe FS"
    "$HERE/kwin-dump.sh" "ROG Overlay Probe FS" | grep -q 'ACTIVE=ROG Overlay Probe FS' && break
  done
fi
"$HERE/kwin-dump.sh"
if [ "$MODE" = x11 ]; then xwininfo -root -tree | grep -E "ROG Overlay" | sed "s/^ */XTREE|/" | cut -c1-150; fi
SHOT="${TMPDIR:-/tmp}/rogprobe-shot-$$.png"
for try in 1 2 3; do
  rm -f "$SHOT"
  spectacle -b -n -f -o "$SHOT" >/dev/null 2>&1
  if [ -s "$SHOT" ]; then OUT="$(python3 -I "$HERE/shot-analyze.py" "$SHOT")"; else OUT="SHOT no disponible"; fi
  # se acepta en cuanto se ve el fullscreen de prueba (si no, reintenta: el usuario puede cambiar de foco)
  echo "$OUT" | grep -q 'azul_fs: n=[1-9]' && break
  [ "$try" = 3 ] || sleep 1
done
echo "SHOT intento=$try"; echo "$OUT"
rm -f "$SHOT"
for p in "$PID1" "$PID2"; do
  kill "$p" 2>/dev/null
done
sleep 1
for p in "$PID1" "$PID2"; do
  if kill -0 "$p" 2>/dev/null; then kill -9 "$p" 2>/dev/null; echo "(forzado kill de $p)"; fi
done
grep -h '^PROBE ' "$LOG1" "$LOG2" | sed 's/^PROBE /ELECTRON|/' | cut -c1-420
rm -f "$LOG1" "$LOG2"
