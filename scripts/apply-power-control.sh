#!/usr/bin/env bash
# apply-power-control.sh — clamping/allowlist authority for ROG power knobs
#
# Usage: apply-power-control.sh [key=value ...]
#   Accepted keys: pl1  pl2  dynamic_boost  thermal_target
#   Each value is clamped to the attr's live min_value/max_value.
#   Unknown keys are rejected immediately (non-zero exit, no writes).
#   On success, prints "key=resulting_value" for every knob written.
#
# Root is required in production; for tests set ROG_FW_ATTRS_DIR to a
# writable fake sysfs tree (see Makefile / test suite).
#
# Example (production):
#   pkexec bash scripts/apply-power-control.sh pl1=100 pl2=140
# Example (test with fake sysfs):
#   ROG_FW_ATTRS_DIR=/tmp/fake-sysfs bash scripts/apply-power-control.sh pl1=50

set -euo pipefail

# ------------------------------------------------------------------
# Paths
# ------------------------------------------------------------------
ATTRS_BASE="${ROG_FW_ATTRS_DIR:-/sys/class/firmware-attributes/asus-armoury/attributes}"

# ------------------------------------------------------------------
# Allowlist: friendly key -> attribute name
# Any key NOT in this map is rejected.
# ------------------------------------------------------------------
declare -A KEY_TO_ATTR=(
    [pl1]="ppt_pl1_spl"
    [pl2]="ppt_pl2_sppt"
    [dynamic_boost]="nv_dynamic_boost"
    [thermal_target]="nv_temp_target"
)

# GPU clock offset keys are explicitly refused (gated: require X11/Coolbits).
# List them for a clear rejection message.
GATED_KEYS=( base_clock_offset mem_clock_offset )

# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------
die() { echo "ERROR: $*" >&2; exit 1; }

is_gated() {
    local key="$1"
    for gk in "${GATED_KEYS[@]}"; do
        [[ "$gk" == "$key" ]] && return 0
    done
    return 1
}

clamp() {
    local val="$1" lo="$2" hi="$3"
    (( val < lo )) && val="$lo"
    (( val > hi )) && val="$hi"
    echo "$val"
}

read_int() {
    local path="$1"
    local raw
    raw=$(cat "$path" 2>/dev/null) || die "No se puede leer $path"
    [[ "$raw" =~ ^-?[0-9]+$ ]] || die "Valor no entero en $path: $raw"
    echo "$raw"
}

# ------------------------------------------------------------------
# Main
# ------------------------------------------------------------------
(( $# == 0 )) && { echo "Uso: $0 key=value [key=value ...]"; exit 1; }

# First pass: validate ALL arguments before writing anything.
declare -A TO_WRITE  # key -> clamped value

for arg in "$@"; do
    [[ "$arg" == *=* ]] || die "Argumento mal formado (esperado key=value): $arg"
    key="${arg%%=*}"
    raw_val="${arg#*=}"

    # Reject gated keys with a clear message.
    if is_gated "$key"; then
        die "La clave '$key' requiere sesión X11 con Coolbits; no disponible en Wayland. No se escribe nada."
    fi

    # Reject unknown keys.
    [[ -v KEY_TO_ATTR["$key"] ]] || \
        die "Clave desconocida '$key'. Claves aceptadas: ${!KEY_TO_ATTR[*]}. No se escribe nada."

    # Value must be integer.
    [[ "$raw_val" =~ ^-?[0-9]+$ ]] || die "Valor no entero para $key: $raw_val"

    attr="${KEY_TO_ATTR[$key]}"
    attr_dir="$ATTRS_BASE/$attr"

    [[ -d "$attr_dir" ]] || die "Atributo $attr no existe en $ATTRS_BASE. Hardware no soportado."

    lo=$(read_int "$attr_dir/min_value")
    hi=$(read_int "$attr_dir/max_value")

    clamped=$(clamp "$raw_val" "$lo" "$hi")
    TO_WRITE["$key"]="$clamped"
done

# Second pass: write all validated values.
for key in "${!TO_WRITE[@]}"; do
    attr="${KEY_TO_ATTR[$key]}"
    attr_dir="$ATTRS_BASE/$attr"
    clamped="${TO_WRITE[$key]}"

    printf '%s' "$clamped" > "$attr_dir/current_value" \
        || die "No se pudo escribir $clamped en $attr/current_value (¿root?)"

    echo "${key}=${clamped}"
done
