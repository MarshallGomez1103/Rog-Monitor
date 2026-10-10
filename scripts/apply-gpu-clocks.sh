#!/usr/bin/env bash
# apply-gpu-clocks.sh — Aplica offsets de reloj GPU vía NVML (requiere root)
#
# SOLO puede hacer:
#   - set --core <MHz>  (rango: -1000..+1000)
#   - set --mem  <MHz>  (rango: -2000..+6000)
#   - read               (lectura sin root, por completitud)
#
# Llamado por power_control.py vía pkexec (copia de sistema, root:root):
#   pkexec /usr/local/libexec/rog-monitor/apply-gpu-clocks.sh set --core 100 --mem 500
#
# Doble recorte:
#   1. Este script valida rangos absolutos (allowlist).
#   2. gpu_clocks.py también recorta a los límites reportados por NVML.
#
# Root es REQUERIDO para set. La lectura no necesita root.

set -euo pipefail

# ------------------------------------------------------------------
# Python: SIEMPRE el lanzador aislado de sistema (python3 -I, paquete en
# /usr/local/lib/rog-monitor, root:root). Este script corre como root, así que
# jamás importa código del repo ni del home del usuario.
# ------------------------------------------------------------------
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ROG_PY=/usr/local/libexec/rog-monitor/rog-py.sh
if [[ ! -x "$ROG_PY" ]]; then
    echo '{"ok":false,"err":"Falta la integración de sistema (scripts/install-system.sh)"}' >&2
    exit 1
fi

# ------------------------------------------------------------------
# Allowlist de rangos absolutos (doble recorte: aquí + Python)
# ------------------------------------------------------------------
readonly CORE_MIN=-1000
readonly CORE_MAX=1000
readonly MEM_MIN=-2000
readonly MEM_MAX=6000

die() {
    echo "{\"ok\":false,\"err\":\"$*\"}" >&2
    exit 1
}

clamp_int() {
    local val="$1" lo="$2" hi="$3"
    (( val < lo )) && val="$lo"
    (( val > hi )) && val="$hi"
    echo "$val"
}

# ------------------------------------------------------------------
# Subcomando: read
# ------------------------------------------------------------------
if [[ "${1:-}" == "read" ]]; then
    exec "$ROG_PY" rog_monitor.gpu_clocks read "${@:2}"
fi

# ------------------------------------------------------------------
# Subcomando: set (requiere root)
# ------------------------------------------------------------------
if [[ "${1:-}" != "set" ]]; then
    die "Uso: $0 set --core <MHz> --mem <MHz> | read"
fi

shift  # quitar "set"

CORE_VAL=""
MEM_VAL=""
DEVICE=0

while [[ $# -gt 0 ]]; do
    case "$1" in
        --core)
            [[ -z "${2:-}" ]] && die "--core requiere un valor en MHz"
            [[ "${2}" =~ ^-?[0-9]+$ ]] || die "--core debe ser entero: ${2}"
            CORE_VAL="$(clamp_int "$2" "$CORE_MIN" "$CORE_MAX")"
            shift 2 ;;
        --mem)
            [[ -z "${2:-}" ]] && die "--mem requiere un valor en MHz"
            [[ "${2}" =~ ^-?[0-9]+$ ]] || die "--mem debe ser entero: ${2}"
            MEM_VAL="$(clamp_int "$2" "$MEM_MIN" "$MEM_MAX")"
            shift 2 ;;
        --device)
            [[ "${2:-}" =~ ^[0-9]+$ ]] || die "--device debe ser entero positivo: ${2:-}"
            DEVICE="$2"
            shift 2 ;;
        *)
            die "Argumento desconocido: $1" ;;
    esac
done

[[ -z "$CORE_VAL" ]] && die "Falta --core"
[[ -z "$MEM_VAL"  ]] && die "Falta --mem"

# Verificar root
if [[ "$(id -u)" -ne 0 ]]; then
    die "Este script requiere root. Úsalo vía pkexec."
fi

# Delegar al helper Python (que hace el segundo recorte + NVML real).
exec "$ROG_PY" rog_monitor.gpu_clocks --device "$DEVICE" set \
    --core "$CORE_VAL" --mem "$MEM_VAL"
