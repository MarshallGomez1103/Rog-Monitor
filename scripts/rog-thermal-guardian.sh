#!/usr/bin/env bash
# rog-thermal-guardian.sh — Guardián térmico GPU: VENTILADORES PRIMERO
#
# Filosofía (elegida por Marshall):
#   1. GPU demasiado caliente → subir ventiladores primero.
#   2. Si sigue subiendo → recortar nv_dynamic_boost y, si hace falta, PL.
#   3. Al enfriar → revertir suavemente.
#   FALLA-SEGURO: si no puede leer temperatura → sube fans, NO sube potencia.
#
# v11 (A1): además del techo térmico, el guardián ahora MODULA la
# agresividad de fans según CARGA (uso CPU/GPU) + TEMPERATURA + TENDENCIA,
# con tres modos: silence/normal/high. Antes solo reaccionaba al techo de
# emergencia, así que en escritorio con perfil performance los fans no
# bajaban (idle alto horneado en la curva). Ahora, si la carga y la
# temperatura son bajas, pide agresividad "quiet" aunque el perfil activo de
# Windows^H^H ASUS sea performance — y al terminar carga, BAJA ESCALONADO
# con histéresis temporal (no de golpe) para no oscilar.
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
#   - Publica su estado (modo silence/normal/high + motivo) en un JSON de
#     SOLO LECTURA para la app: ~/.local/share/rog-monitor/
#     thermal-guardian-state.json (glob de home como rog-profile-sync.sh,
#     porque este script corre como root). La app (fans.py:guardian_status)
#     lo lee para mostrarlo en el stream NDJSON; nunca lo escribe.
#
# Configuración (variables de entorno o argumentos):
#   ROG_THERMAL_CEILING     — techo en °C (default 83, máx firmware 87)
#   ROG_THERMAL_WARN        — umbral de alerta en °C (default ceiling-5)
#   ROG_THERMAL_INTERVAL    — intervalo del loop en segundos (default 2)
#   ROG_THERMAL_DB_PATH     — ruta a nv_dynamic_boost sysfs
#   ROG_THERMAL_PL2_PATH    — ruta a ppt_pl2_sppt sysfs
#   ROG_THERMAL_LOAD_IDLE   — % de carga (CPU o GPU) bajo el cual se considera
#                             "idle" para entrar en modo silencio (default 15)
#   ROG_THERMAL_LOAD_HIGH   — % de carga desde el cual se considera "carga
#                             alta" y se pide modo alto (default 60)
#   ROG_THERMAL_COOLDOWN    — segundos que debe mantenerse la carga/temp baja
#                             ANTES de empezar a bajar un escalón (default 20)
#   ROG_THERMAL_STEP_DELAY  — segundos entre cada escalón de bajada una vez
#                             iniciada (default 10) — bajada ESCALONADA, no
#                             de golpe, para que no "rebote" para arriba.
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
LOAD_IDLE="${ROG_THERMAL_LOAD_IDLE:-15}"
LOAD_HIGH="${ROG_THERMAL_LOAD_HIGH:-60}"
COOLDOWN="${ROG_THERMAL_COOLDOWN:-20}"
STEP_DELAY="${ROG_THERMAL_STEP_DELAY:-10}"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --ceiling)  CEILING="$2";  shift 2 ;;
        --warn)     WARN_OFFSET="$2"; shift 2 ;;
        --interval) INTERVAL="$2"; shift 2 ;;
        --load-idle) LOAD_IDLE="$2"; shift 2 ;;
        --load-high) LOAD_HIGH="$2"; shift 2 ;;
        --cooldown) COOLDOWN="$2"; shift 2 ;;
        --step-delay) STEP_DELAY="$2"; shift 2 ;;
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
# Leer carga CPU/GPU (falla-segura: "" si no se puede → se trata como ALTA,
# nunca como idle, para no relajar fans por error de lectura)
# ------------------------------------------------------------------
PREV_CPU_TOTAL=""
PREV_CPU_IDLE=""

read_cpu_load() {
    # % de uso CPU total desde /proc/stat (delta entre dos lecturas).
    local line rest user nice system idle iowait irq softirq steal
    read -r line < /proc/stat 2>/dev/null || { echo ""; return; }
    # shellcheck disable=SC2034
    read -r _ user nice system idle iowait irq softirq steal rest <<< "$line"
    local total=$(( user + nice + system + idle + iowait + irq + softirq + steal ))
    local idle_all=$(( idle + iowait ))

    if [[ -n "$PREV_CPU_TOTAL" && -n "$PREV_CPU_IDLE" ]]; then
        local dtotal=$(( total - PREV_CPU_TOTAL ))
        local didle=$(( idle_all - PREV_CPU_IDLE ))
        PREV_CPU_TOTAL="$total"; PREV_CPU_IDLE="$idle_all"
        if (( dtotal > 0 )); then
            echo $(( 100 - (didle * 100 / dtotal) ))
            return 0
        fi
    fi
    PREV_CPU_TOTAL="$total"; PREV_CPU_IDLE="$idle_all"
    echo ""
}

read_gpu_load() {
    if command -v nvidia-smi &>/dev/null; then
        local u
        u=$(nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits 2>/dev/null | head -1 | tr -d ' ')
        [[ "$u" =~ ^[0-9]+$ ]] && { echo "$u"; return 0; }
    fi
    echo ""
}

# ------------------------------------------------------------------
# Publicar estado para la UI (solo lectura para la app; este script es la
# única fuente de escritura). Falla en silencio si no hay home de usuario.
# ------------------------------------------------------------------
write_guardian_state() {
    local mode="$1" reason="$2"
    local f
    for f in /var/home/*/.local/share/rog-monitor /home/*/.local/share/rog-monitor; do
        [[ -d "$f" ]] || continue
        printf '{"mode":"%s","reason":"%s","updated":%s}\n' \
            "$mode" "$reason" "$(date +%s)" \
            > "$f/thermal-guardian-state.json.tmp" 2>/dev/null &&
            mv -f "$f/thermal-guardian-state.json.tmp" "$f/thermal-guardian-state.json" 2>/dev/null
    done
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
# Modulación por carga: silence/normal/high con bajada escalonada
# ------------------------------------------------------------------
# Niveles ordenados de menos a más agresivo, para poder "bajar un escalón"
# en vez de saltar directo a silencio (evita el rebote típico cuando la
# temperatura aún no bajó aunque la carga ya terminó).
LOAD_LEVELS=(quiet balanced performance)
LOAD_MODE_NAMES=(silence normal high)

level_index() {
    local lvl="$1" i
    for i in "${!LOAD_LEVELS[@]}"; do
        [[ "${LOAD_LEVELS[$i]}" == "$lvl" ]] && { echo "$i"; return 0; }
    done
    echo "1"  # balanced/normal por defecto
}

CURRENT_LOAD_LEVEL=1   # índice en LOAD_LEVELS — arranca en "balanced/normal"
LOW_SINCE=0             # epoch desde que carga+temp llevan bajas sin interrupción
LAST_STEP_DOWN=0        # epoch del último escalón de bajada aplicado

# Decide el nivel DESEADO según carga+temp (sin histéresis); la histéresis
# de bajada se aplica en evaluate_load() comparando contra CURRENT_LOAD_LEVEL.
desired_load_level() {
    local cpu_load="$1" gpu_load="$2" temp="$3"

    # Falla-segura: cualquier lectura ausente → pedir el nivel más agresivo.
    if [[ -z "$cpu_load" || -z "$gpu_load" || -z "$temp" ]]; then
        echo 2; return
    fi

    local max_load=$(( cpu_load > gpu_load ? cpu_load : gpu_load ))

    if (( temp >= WARN_TEMP || max_load >= LOAD_HIGH )); then
        echo 2   # performance/high
    elif (( max_load <= LOAD_IDLE && temp < (WARN_TEMP - 10) )); then
        echo 0   # quiet/silence — frío e idle de verdad
    else
        echo 1   # balanced/normal
    fi
}

# evaluate_load <cpu_load> <gpu_load> <temp> — aplica histéresis temporal:
# subir es INMEDIATO (proteger primero); bajar requiere COOLDOWN segundos
# continuos de "podríamos bajar" y luego un escalón cada STEP_DELAY s (nunca
# de golpe a silencio).
evaluate_load() {
    local cpu_load="$1" gpu_load="$2" temp="$3" now want
    now=$(date +%s)
    want="$(desired_load_level "$cpu_load" "$gpu_load" "$temp")"

    if (( want > CURRENT_LOAD_LEVEL )); then
        # Subir agresividad: inmediato, sin esperar.
        CURRENT_LOAD_LEVEL="$want"
        LOW_SINCE=0
        LAST_STEP_DOWN="$now"
    elif (( want < CURRENT_LOAD_LEVEL )); then
        if (( LOW_SINCE == 0 )); then
            LOW_SINCE="$now"
        elif (( now - LOW_SINCE >= COOLDOWN && now - LAST_STEP_DOWN >= STEP_DELAY )); then
            CURRENT_LOAD_LEVEL=$(( CURRENT_LOAD_LEVEL - 1 ))
            LAST_STEP_DOWN="$now"
            log "Carga baja sostenida ${COOLDOWN}s+ — bajando un escalón a ${LOAD_LEVELS[$CURRENT_LOAD_LEVEL]}"
        fi
    else
        LOW_SINCE=0
    fi

    set_fan_aggression "${LOAD_LEVELS[$CURRENT_LOAD_LEVEL]}"
    write_guardian_state "${LOAD_MODE_NAMES[$CURRENT_LOAD_LEVEL]}" \
        "cpu=${cpu_load:-?}% gpu=${gpu_load:-?}% temp=${temp:-?}C"
}

# ------------------------------------------------------------------
# Estado del guardián (emergencia térmica — para evitar oscilaciones)
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
    # La modulación por carga solo decide la agresividad de fans cuando NO
    # hay una emergencia térmica activa — durante "fans-up"/"boost-down"/
    # "pl-down" handle_temp ya forzó "performance" y eso manda (falla-segura:
    # nunca relajar fans mientras el techo está en juego).
    if [[ "$GUARDIAN_STATE" == "normal" ]]; then
        CPU_LOAD="$(read_cpu_load)"
        GPU_LOAD="$(read_gpu_load)"
        evaluate_load "$CPU_LOAD" "$GPU_LOAD" "$TEMP"
    else
        write_guardian_state "high" "emergencia térmica: ${GUARDIAN_STATE}"
    fi
    sleep "$INTERVAL"
done
