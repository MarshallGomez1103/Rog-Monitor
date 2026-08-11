#!/usr/bin/env bash
# Apply the ASUS battery end-charge threshold, including at boot.
# The kernel exposes this per battery as charge_control_end_threshold.
set -euo pipefail

CONFIG=/etc/rog-monitor/battery.conf
limit=""

usage() { echo "Uso: $0 [--limit 20..100]" >&2; exit 2; }
while [[ $# -gt 0 ]]; do
  case "$1" in
    --limit) [[ $# -ge 2 ]] || usage; limit="$2"; shift 2 ;;
    *) usage ;;
  esac
done

if [[ -z "$limit" && -r "$CONFIG" ]]; then
  # shellcheck disable=SC1090
  source "$CONFIG"
  limit="${CHARGE_LIMIT:-}"
fi
[[ "$limit" =~ ^[0-9]+$ ]] && (( limit >= 20 && limit <= 100 )) || {
  echo "Límite inválido: se permite un entero entre 20 y 100." >&2; exit 2;
}

found=0
for bat in /sys/class/power_supply/BAT*; do
  [[ -d "$bat" ]] || continue
  threshold="$bat/charge_control_end_threshold"
  [[ -e "$threshold" ]] || continue
  found=1
  printf '%s\n' "$limit" > "$threshold"
  actual=$(<"$threshold")
  [[ "$actual" == "$limit" ]] || {
    echo "El firmware devolvió $actual en lugar de $limit para $bat." >&2; exit 1;
  }
  echo "${bat##*/}: límite de carga aplicado: $actual%"
done
(( found )) || { echo "Este equipo no expone charge_control_end_threshold." >&2; exit 1; }
