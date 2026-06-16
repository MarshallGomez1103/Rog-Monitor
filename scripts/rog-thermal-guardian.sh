#!/usr/bin/env bash
# rog-thermal-guardian.sh — Guardián térmico GPU: VENTILADORES PRIMERO
#
# Filosofía (elegida por Marshall):
#   1. GPU demasiado caliente → subir ventiladores primero.
#   2. Si sigue subiendo → recortar nv_dynamic_boost y, si hace falta, PL.
#   3. Al enfriar → revertir suavemente.
#   FALLA-SEGURO: si no puede leer temperatura → sube fans, NO sube potencia.
#
# Integración con rog-profile-sync:
#   - Este daemon NUNCA escribe directamente a pwm*_auto_pointN (eso lo hace
#     rog-profile-sync.sh). Solo modifica throttle_thermal_policy para pedir
#     más o menos agresividad al firmware, y escribe a nv_dynamic_boost y
#     ppt_pl2_sppt cuando hay emergencia térmica.
#   - Se comunica con rog-profile-sync.sh a través de la política de plataforma
#     (/sys/firmware/acpi/platform_profile) — cuando el guardián quiere más
#     ventiladores, escribe "performance" ahí y deja que rog-profile-sync haga
#     su trabajo sin pelea de daemons por el mismo sysfs.
#
# Configuración (variables de entorno o argumentos):
#   ROG_THERMAL_CEILING   — techo en °C (default 83, máx firmware 87)
#   ROG_THERMAL_WARN      — umbral de alerta en °C (default ceiling-5)
#   ROG_THERMAL_INTERVAL  — intervalo del loop en segundos (default 2)
#   ROG_THERMAL_DB_PATH   — ruta a nv_dynamic_boost sysfs
#   ROG_THERMAL_PL2_PATH  — ruta a ppt_pl2_sppt sysfs
#
# Uso:
#   rog-thermal-guardian.sh [--ceiling 83] [--warn 78] [--interval 2]
#
# Instalación:
#   Ver systemd/rog-thermal-guardian.service — instalar con pkexec.
#   El orquestador documenta los comandos sudo en docs/SUDO-PENDIENTE-v10.md.

set -euo pipefail

# ------------------------------------------------------------------
# Parseo de argumentos
# ------------------------------------------------------------------
CEILING="${ROG_THERMAL_CEILING:-83}"
INTERVAL="${ROG_THERMAL_INTERVAL:-2}"
WARN_DELTA=5

while [[ $# -gt 0 ]]; do
    case "$1" in
        --ceiling)  CEILING="$2";  shift 2 ;;
        --warn)     WARN_OFFSET="$2"; shift 2 ;;
        --interval) INTERVAL="$2"; shift 2 ;;
        --) shift; break ;;
        *) echo "Argumento desconocido: $1" >&2; exit 1 ;;
    esac
done

WARN_TEMP="${WARN_OFFSET:-$(( CEILING - WARN_DELTA ))}"

# ------------------------------------------------------------------
# Rutas sysfs con overrides por entorno (facilita testing)
# ------------------------------------------------------------------
ATTRS_BASE="${ROG_FW_ATTRS_DIR:-/sys/class/firmware-attributes/asus-armoury/attributes}"
DB_PATH="${ROG_THERMAL_DB_PATH:-$ATTRS_BASE/nv_dynamic_boost}"
PL2_PATH="${ROG_THERMAL_PL2_PATH:-$ATTRS_BASE/ppt_pl2_sppt}"
PLATFORM_PROFILE="/sys/firmware/acpi/platform_profile"
THROTTLE_POLICY="/sys/devices/platform/asus-nb-wmi/throttle_thermal_policy"

# Fuentes de temperatura GPU (se prueban en orden).
GPU_TEMP_SOURCES=(
    # nvidia-smi más fiable (instantánea real del sensor)
    ""   # marcador; se rellena al inicio
    # sysfs hwmon asus o nvidia
)

# ------------------------------------------------------------------
# Helpers de logging
# ------------------------------------------------------------------
log() {
    echo "[ROG-THERMAL $(date '+%H:%M:%S')] $*" >&2
}

warn_log() {
    echo "[ROG-THERMAL WARN $(date '+%H:%M:%S')] $*" >&2
}

# ------------------------------------------------------------------
# Leer temperatura GPU (falla-seguro: devuelve "" si no puede)
# ------------------------------------------------------------------
read_gpu_temp() {
    # Intento 1: nvidia-smi
    if command -v nvidia-smi &>/dev/null; then
        local t
        t=$(nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader,nounits 2>/dev/null | head -1 | tr -d ' ')
        if [[ "$t" =~ ^[0-9]+$ ]]; then
            echo "$t"
            return 0
        fi
    fi

    # Intento 2: hwmon nvidia
    for hwmon_dir in /sys/class/hwmon/hwmon*; do
        local name_file="$hwmon_dir/name"
        [[ -f "$name_file" ]] || continue
        local hw_name
        hw_name=$(cat "$name_file" 2>/dev/null || echo "")
        if [[ "$hw_name" == *nvidia* ]] || [[ "$hw_name" == *nouveau* ]]; then
            for temp_file in "$hwmon_dir"/temp*_input; do
                [[ -f "$temp_file" ]] || continue
                local raw
                raw=$(cat "$temp_file" 2>/dev/null || echo "")
                if [[ "$raw" =~ ^[0-9]+$ ]] && (( raw > 1000 )); then
                    echo "$(( raw / 1000 ))"
                    return 0
                fi
            done
        fi
    done

    # No se pudo leer temperatura
    echo ""
}

# ------------------------------------------------------------------
# Leer/escribir sysfs con seguridad
# ------------------------------------------------------------------
read_sysfs_int() {
    local path="$1"
    [[ -f "$path" ]] || { echo ""; return; }
    local v
    v=$(cat "$path" 2>/dev/null || echo "")
    [[ "$v" =~ ^-?[0-9]+$ ]] && echo "$v" || echo ""
}

write_sysfs_int() {
    local path="$1" val="$2"
    [[ -f "$path" ]] || { warn_log "No existe: $path"; return 1; }
    printf '%s' "$val" > "$path" 2>/dev/null || {
        warn_log "No se pudo escribir $val en $path (¿root?)"; return 1;
    }
}

clamp_int() {
    local v="$1" lo="$2" hi="$3"
    (( v < lo )) && v="$lo"
    (( v > hi )) && v="$hi"
    echo "$v"
}

# ------------------------------------------------------------------
# Leer rangos de dynamic_boost y PL2
# ------------------------------------------------------------------
get_db_range() {
    local lo hi cur
    lo=$(read_sysfs_int "$DB_PATH/min_value")
    hi=$(read_sysfs_int "$DB_PATH/max_value")
    cur=$(read_sysfs_int "$DB_PATH/current_value")
    echo "${lo:-5} ${hi:-25} ${cur:-25}"
}

get_pl2_range() {
    local lo hi cur
    lo=$(read_sysfs_int "$PL2_PATH/min_value")
    hi=$(read_sysfs_int "$PL2_PATH/max_value")
    cur=$(read_sysfs_int "$PL2_PATH/current_value")
    echo "${lo:-28} ${hi:-175} ${cur:-175}"
}

# ------------------------------------------------------------------
# Escribir platform_profile para pedir agresividad de ventiladores
# ------------------------------------------------------------------
set_fan_aggression() {
    local level="$1"   # "performance" | "balanced" | "quiet"
    if [[ -f "$PLATFORM_PROFILE" ]]; then
        printf '%s' "$level" > "$PLATFORM_PROFILE" 2>/dev/null || true
    fi
    # También escribir throttle_policy directo como respaldo
    if [[ -f "$THROTTLE_POLICY" ]]; then
        local want
        case "$level" in
            performance) want=2 ;;
            balanced)    want=1 ;;
            quiet)       want=0 ;;
            *)           want=1 ;;
        esac
        local n=0
        while (( n < 3 )); do
            printf '%s' "$want" > "$THROTTLE_POLICY" 2>/dev/null && break || true
            n=$(( n + 1 ))
            sleep 0.3
        done
    fi
}

# ------------------------------------------------------------------
# Estado del guardián (para evitar oscilaciones)
# ------------------------------------------------------------------
GUARDIAN_STATE="normal"   # "normal" | "fans-up" | "boost-down" | "pl-down"
ORIGINAL_DB=""
ORIGINAL_PL2=""
ORIGINAL_PROFILE=""
FAN_PROFILE_PUSHED=false
INTERVENTION_COUNT=0

save_originals_once() {
    if [[ -z "$ORIGINAL_PROFILE" ]]; then
        ORIGINAL_PROFILE=$(cat "$PLATFORM_PROFILE" 2>/dev/null || echo "balanced")
    fi
    if [[ -z "$ORIGINAL_DB" ]]; then
        local range
        read -r _ _ cur <<< "$(get_db_range)"
        ORIGINAL_DB="${cur:-25}"
    fi
    if [[ -z "$ORIGINAL_PL2" ]]; then
        local range
        read -r _ _ cur <<< "$(get_pl2_range)"
        ORIGINAL_PL2="${cur:-175}"
    fi
}

# ------------------------------------------------------------------
# Lógica principal por ciclo
# ------------------------------------------------------------------
handle_temp() {
    local temp="$1"

    if [[ -z "$temp" ]]; then
        # FALLA-SEGURO: sin temperatura → subir fans, NO tocar potencia
        warn_log "No se pudo leer temp GPU → modo falla-seguro (fans max)"
        set_fan_aggression "performance"
        FAN_PROFILE_PUSHED=true
        GUARDIAN_STATE="fans-up"
        return
    fi

    if (( temp >= CEILING )); then
        # EMERGENCIA: al techo
        save_originals_once
        log "Temp ${temp}°C >= techo ${CEILING}°C — subir fans + recortar boost"
        set_fan_aggression "performance"
        FAN_PROFILE_PUSHED=true

        # Recortar nv_dynamic_boost
        local db_lo db_hi db_cur
        read -r db_lo db_hi db_cur <<< "$(get_db_range)"
        local new_db
        new_db="$(clamp_int $(( db_cur - 5 )) "$db_lo" "$db_hi")"
        if (( new_db < db_cur )); then
            if [[ -d "$DB_PATH" ]]; then
                write_sysfs_int "$DB_PATH/current_value" "$new_db" && \
                    log "nv_dynamic_boost: ${db_cur} → ${new_db} W"
            fi
        fi

        # Si ya estamos en boost_down y sigue subiendo → recortar PL2
        if [[ "$GUARDIAN_STATE" == "boost-down" || "$GUARDIAN_STATE" == "pl-down" ]]; then
            local pl_lo pl_hi pl_cur
            read -r pl_lo pl_hi pl_cur <<< "$(get_pl2_range)"
            local new_pl
            new_pl="$(clamp_int $(( pl_cur - 10 )) "$pl_lo" "$pl_hi")"
            if (( new_pl < pl_cur )); then
                if [[ -d "$PL2_PATH" ]]; then
                    write_sysfs_int "$PL2_PATH/current_value" "$new_pl" && \
                        log "ppt_pl2_sppt: ${pl_cur} → ${new_pl} W (emergencia)"
                fi
            fi
            GUARDIAN_STATE="pl-down"
        else
            GUARDIAN_STATE="boost-down"
        fi
        INTERVENTION_COUNT=$(( INTERVENTION_COUNT + 1 ))

    elif (( temp >= WARN_TEMP )); then
        # ADVERTENCIA: acercándose al techo → solo fans
        save_originals_once
        if [[ "$GUARDIAN_STATE" == "normal" ]]; then
            log "Temp ${temp}°C >= umbral alerta ${WARN_TEMP}°C — subir fans"
            set_fan_aggression "performance"
            FAN_PROFILE_PUSHED=true
            GUARDIAN_STATE="fans-up"
        fi
        # Si ya estábamos con fans up y sigue igual → no hacer nada extra

    else
        # NORMAL: por debajo del umbral → revertir suavemente
        if [[ "$GUARDIAN_STATE" != "normal" ]]; then
            local margin=$(( CEILING - temp ))
            if (( margin >= 8 )); then
                # Suficiente margen: restaurar
                log "Temp ${temp}°C — margen ${margin}°C — restaurando configuración"

                # Restaurar dynamic_boost
                if [[ -n "$ORIGINAL_DB" && -d "$DB_PATH" ]]; then
                    write_sysfs_int "$DB_PATH/current_value" "$ORIGINAL_DB" && \
                        log "nv_dynamic_boost restaurado a ${ORIGINAL_DB} W"
                fi

                # Restaurar PL2
                if [[ -n "$ORIGINAL_PL2" && -d "$PL2_PATH" ]]; then
                    write_sysfs_int "$PL2_PATH/current_value" "$ORIGINAL_PL2" && \
                        log "ppt_pl2_sppt restaurado a ${ORIGINAL_PL2} W"
                fi

                # Restaurar perfil de ventiladores
                if [[ "$FAN_PROFILE_PUSHED" == "true" && -n "$ORIGINAL_PROFILE" ]]; then
                    set_fan_aggression "$ORIGINAL_PROFILE"
                    FAN_PROFILE_PUSHED=false
                fi

                GUARDIAN_STATE="normal"
                ORIGINAL_DB=""
                ORIGINAL_PL2=""
                ORIGINAL_PROFILE=""
                INTERVENTION_COUNT=0
            fi
            # Si el margen es < 8°C, esperar otro ciclo antes de revertir (evitar oscilación)
        fi
    fi
}

# ------------------------------------------------------------------
# Loop principal
# ------------------------------------------------------------------
log "Iniciando guardián térmico GPU (techo=${CEILING}°C, alerta=${WARN_TEMP}°C, intervalo=${INTERVAL}s)"

# Trap para limpieza al detener el servicio
cleanup() {
    log "Deteniendo guardián — restaurando configuración de emergencia si aplica"
    if [[ "$GUARDIAN_STATE" != "normal" ]]; then
        [[ -n "$ORIGINAL_DB"  && -d "$DB_PATH"  ]] && \
            write_sysfs_int "$DB_PATH/current_value"  "$ORIGINAL_DB"  2>/dev/null || true
        [[ -n "$ORIGINAL_PL2" && -d "$PL2_PATH" ]] && \
            write_sysfs_int "$PL2_PATH/current_value" "$ORIGINAL_PL2" 2>/dev/null || true
        [[ "$FAN_PROFILE_PUSHED" == "true" && -n "$ORIGINAL_PROFILE" ]] && \
            set_fan_aggression "$ORIGINAL_PROFILE" 2>/dev/null || true
    fi
    log "Guardián detenido limpiamente."
    exit 0
}
trap cleanup SIGTERM SIGINT SIGHUP

while true; do
    TEMP="$(read_gpu_temp)"
    handle_temp "$TEMP"
    sleep "$INTERVAL"
done
