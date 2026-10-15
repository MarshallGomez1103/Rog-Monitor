#!/usr/bin/env bash
# Mide RSS total (suma del arbol de procesos de la sonda) y CPU acumulada en
# Wayland nativo y XWayland, con la ventana overlay estatica abierta ~6 s.
# Uso: ELECTRON=/ruta/electron ./measure-rss.sh
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ELECTRON="${ELECTRON:?definir ELECTRON}"
for MODE in wayland x11; do
  PLAT=(); [ "$MODE" = x11 ] && PLAT=(--ozone-platform=x11)
  setsid "$ELECTRON" "$HERE" "${PLAT[@]}" --monitor=1 --corner=top-right --secs=9 >/dev/null 2>&1 &
  PID=$!
  sleep 7
  # setsid => el id de sesion es el PID lanzado; ps -s lista todo el arbol de la sonda
  RSS=$(ps -s "$PID" -o rss= | awk '{s+=$1} END {printf "%d", s/1024}')
  NPROC=$(ps -s "$PID" -o pid= | wc -l)
  CPU=$(ps -s "$PID" -o cputimes= | awk '{s+=$1} END {print s}')
  echo "MEASURE mode=$MODE procesos=$NPROC rss_total_MiB=$RSS cpu_segundos_acumulados=$CPU"
  kill "$PID" 2>/dev/null; sleep 1; kill -9 "$PID" 2>/dev/null
  sleep 1
done
