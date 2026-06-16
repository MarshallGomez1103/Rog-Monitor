#!/usr/bin/env bash
# apply-gpu-clocks.sh — Aplica offsets de reloj GPU vía NVML (requiere root)
#
# SOLO puede hacer:
#   - set --core <MHz>  (rango: -1000..+1000)
#   - set --mem  <MHz>  (rango: -2000..+6000)
#   - read               (lectura sin root, por completitud)
#
# Llamado por la app Electron vía pkexec:
#   pkexec bash scripts/apply-gpu-clocks.sh set --core 100 --mem 500
#
# Doble recorte:
#   1. Este script valida rangos absolutos (allowlist).
#   2. gpu_clocks.py también recorta a los límites reportados por NVML.
#
# Root es REQUERIDO para set. La lectura no necesita root.

set -euo pipefail

# ------------------------------------------------------------------
# Rutas (resueltas relativas a este script para portabilidad)
# ------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

# Python del venv de la app (preferido) o el del sistema.
if [[ -x "$REPO_ROOT/.venv/bin/python" ]]; then
    PYTHON="$REPO_ROOT/.venv/bin/python"
elif command -v python3 &>/dev/null; then
    PYTHON="python3"
else
    echo '{"ok":false,"err":"Python3 no encontrado"}' >&2
    exit 1
fi

# gpu_clocks.py vive en src/rog_monitor/
export PYTHONPATH="$REPO_ROOT/src"

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
    exec "$PYTHON" -m rog_monitor.gpu_clocks read "${@:2}"
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
exec "$PYTHON" -m rog_monitor.gpu_clocks --device "$DEVICE" set \
    --core "$CORE_VAL" --mem "$MEM_VAL"
