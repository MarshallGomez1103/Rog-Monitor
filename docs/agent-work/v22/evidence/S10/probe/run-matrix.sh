#!/usr/bin/env bash
# Matriz completa: modo (wayland|x11) x monitor (0,1) x anclaje (4). Secuencial.
# Uso: ELECTRON=/ruta/electron ./run-matrix.sh [wayland x11]
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODES=("$@"); [ ${#MODES[@]} -eq 0 ] && MODES=(wayland x11)
for m in "${MODES[@]}"; do
  for d in 0 1; do
    for c in top-left top-right bottom-left bottom-right; do
      "$HERE/run-case.sh" "$m" "$d" "$c"
    done
  done
done
