#!/usr/bin/env bash
# rog-thermal-guardian.sh — Guardián térmico CPU/GPU: VENTILADORES PRIMERO
#
# Filosofía de diseño:
#   1. CPU/GPU demasiado caliente → subir ventiladores primero.
#   2. Si sigue subiendo → recortar nv_dynamic_boost y, si hace falta, PL.
#   3. Al enfriar → revertir suavemente.
#   FALLA-SEGURO: si no puede leer temperatura → sube fans, NO sube potencia.
#
# v13 (guardian suave): por defecto NO modula platform_profile por carga.
# El guardián solo empuja ventiladores cuando la temperatura se acerca al
# techo; el recorte real de potencia espera un exceso sostenido. Esto evita
# que una sesión de juego se sienta peor con el guardián activo que sin él.
# Si alguien quiere la modulación por carga anterior, puede activar
# ROG_THERMAL_MODULATE_LOAD=1 en un override de systemd.
#
# v12 (A-FANS): corrección de histéresis — cada escalón de bajada reinicia su
# propio contador COOLDOWN (antes el segundo escalón se aplicaba STEP_DELAY
# después del primero sin esperar COOLDOWN de nuevo). Esto evita que los fans
# bajen de golpe en 2 escalones en COOLDOWN+STEP_DELAY s. Con la corrección,
# cada escalón requiere COOLDOWN s de carga baja sostenida (≈ 20 s quiet,
# 20 s balanced → 40 s totales para ir de high a silence). Esto es
# exactamente el comportamiento buscado: "bajan pero no de golpe".
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
#   ROG_THERMAL_CPU_CEILING — techo CPU en °C (default 92, rango UI 70-100)
#   ROG_THERMAL_GPU_CEILING — techo GPU en °C (default 83, máx firmware 87)
#   ROG_THERMAL_CEILING     — alias legacy para GPU ceiling
#   ROG_THERMAL_WARN        — umbral GPU legacy (default gpu_ceiling-5)
#   ROG_THERMAL_INTERVAL    — intervalo del loop en segundos (default 2)
#   ROG_THERMAL_DB_PATH     — ruta a nv_dynamic_boost sysfs
#   ROG_THERMAL_PL2_PATH    — ruta a ppt_pl2_sppt sysfs
#   ROG_THERMAL_LOAD_IDLE   — % de carga (CPU o GPU) bajo el cual se considera
#                             "idle" para entrar en modo silencio (default 15)
#   ROG_THERMAL_LOAD_HIGH   — % de carga desde el cual se considera "carga
#                             alta" y se pide modo alto (default 60)
#   ROG_THERMAL_MODULATE_LOAD — 1 para permitir que el guardián cambie
#                             platform_profile por carga; default 0
#   ROG_THERMAL_OVER_GRACE  — segundos sobre el techo antes de recortar
#                             potencia; default 12
#   ROG_THERMAL_DB_STEP     — W por paso al recortar nv_dynamic_boost; default 2
#   ROG_THERMAL_PL2_STEP    — W por paso al recortar PL2/SPPT; default 5
#   ROG_THERMAL_CUT_INTERVAL — segundos minimos entre recortes; default 10
#   ROG_THERMAL_RESTORE_MARGIN — margen bajo el techo para restaurar; default 4
#   ROG_THERMAL_COOLDOWN    — segundos que debe mantenerse la carga/temp baja
#                             ANTES de empezar a bajar un escalón (default 20)
#   ROG_THERMAL_STEP_DELAY  — segundos entre cada escalón de bajada una vez
#                             iniciada (default 10) — bajada ESCALONADA, no
#                             de golpe, para que no "rebote" para arriba.
#
# Uso:
#   rog-thermal-guardian.sh [--cpu-ceiling 92] [--gpu-ceiling 83] [--interval 2]
#
# Instalación:
#   Ver systemd/rog-thermal-guardian.service — instalar con pkexec.
#   Para recuperación desde TTY: scripts/rog-monitor-safe-mode.sh.

set -euo pipefail

# ------------------------------------------------------------------
# Parseo de argumentos
# ------------------------------------------------------------------
CPU_CEILING="${ROG_THERMAL_CPU_CEILING:-92}"
GPU_CEILING="${ROG_THERMAL_GPU_CEILING:-${ROG_THERMAL_CEILING:-83}}"
INTERVAL="${ROG_THERMAL_INTERVAL:-2}"
WARN_DELTA="${ROG_THERMAL_WARN_DELTA:-3}"
LOAD_IDLE="${ROG_THERMAL_LOAD_IDLE:-15}"
LOAD_HIGH="${ROG_THERMAL_LOAD_HIGH:-60}"
LOAD_MODULATION="${ROG_THERMAL_MODULATE_LOAD:-0}"
COOLDOWN="${ROG_THERMAL_COOLDOWN:-20}"
STEP_DELAY="${ROG_THERMAL_STEP_DELAY:-10}"
OVER_GRACE="${ROG_THERMAL_OVER_GRACE:-12}"
DB_STEP="${ROG_THERMAL_DB_STEP:-2}"
PL2_STEP="${ROG_THERMAL_PL2_STEP:-5}"
CUT_INTERVAL="${ROG_THERMAL_CUT_INTERVAL:-10}"
RESTORE_MARGIN="${ROG_THERMAL_RESTORE_MARGIN:-4}"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --ceiling|--gpu-ceiling)  GPU_CEILING="$2";  shift 2 ;;
        --cpu-ceiling) CPU_CEILING="$2"; shift 2 ;;
        --warn)     WARN_OFFSET="$2"; shift 2 ;;
        --interval) INTERVAL="$2"; shift 2 ;;
        --load-idle) LOAD_IDLE="$2"; shift 2 ;;
        --load-high) LOAD_HIGH="$2"; shift 2 ;;
        --modulate-load) LOAD_MODULATION=1; shift ;;
        --over-grace) OVER_GRACE="$2"; shift 2 ;;
        --db-step) DB_STEP="$2"; shift 2 ;;
        --pl2-step) PL2_STEP="$2"; shift 2 ;;
        --cut-interval) CUT_INTERVAL="$2"; shift 2 ;;
        --cooldown) COOLDOWN="$2"; shift 2 ;;
        --step-delay) STEP_DELAY="$2"; shift 2 ;;
        --) shift; break ;;
        *) echo "Argumento desconocido: $1" >&2; exit 1 ;;
    esac
done

(( CPU_CEILING < 70 )) && CPU_CEILING=70
(( CPU_CEILING > 100 )) && CPU_CEILING=100
(( GPU_CEILING < 70 )) && GPU_CEILING=70
(( GPU_CEILING > 87 )) && GPU_CEILING=87
GPU_WARN_TEMP="${WARN_OFFSET:-$(( GPU_CEILING - WARN_DELTA ))}"
CPU_WARN_TEMP="${ROG_THERMAL_CPU_WARN:-$(( CPU_CEILING - WARN_DELTA ))}"

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

read_cpu_temp() {
    local best=""
    local hwmon_dir name_file hw_name temp_file raw c

    for hwmon_dir in /sys/class/hwmon/hwmon*; do
        name_file="$hwmon_dir/name"
        [[ -f "$name_file" ]] || continue
        hw_name=$(cat "$name_file" 2>/dev/null || echo "")
        case "$hw_name" in
            coretemp|k10temp|zenpower|cpu_thermal|acpitz) ;;
            *) continue ;;
        esac
        for temp_file in "$hwmon_dir"/temp*_input; do
            [[ -f "$temp_file" ]] || continue
            raw=$(cat "$temp_file" 2>/dev/null || echo "")
            if [[ "$raw" =~ ^[0-9]+$ ]] && (( raw > 1000 )); then
                c=$(( raw / 1000 ))
                if [[ -z "$best" || "$c" -gt "$best" ]]; then
                    best="$c"
                fi
            fi
        done
    done

    echo "$best"
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
# Formato: {"mode": "silence|normal|high", "reason": str, "updated": epoch,
#           "aggression": "quiet|balanced|performance",
#           "thermal_state": "normal|fans-up|boost-down|pl-down",
#           "cooldown_remaining": segundos hasta siguiente escalón (0 si no aplica),
#           "interventions": N}
# ------------------------------------------------------------------
write_guardian_state() {
    local mode="$1" reason="$2"
    local now; now="$(date +%s)"
    local remaining=0
    # Calcular segundos restantes hasta el próximo escalón (para la UI).
    if (( LOW_SINCE > 0 && CURRENT_LOAD_LEVEL > 0 )); then
        local elapsed=$(( now - LOW_SINCE ))
        remaining=$(( COOLDOWN - elapsed ))
        (( remaining < 0 )) && remaining=0
    fi
    local payload
    printf -v payload \
        '{"mode":"%s","reason":"%s","updated":%s,"aggression":"%s","thermal_state":"%s","cooldown_remaining":%s,"interventions":%s,"cpu_ceiling":%s,"gpu_ceiling":%s,"cpu_temp":"%s","gpu_temp":"%s"}' \
        "$mode" "$reason" "$now" \
        "${LOAD_LEVELS[$CURRENT_LOAD_LEVEL]:-balanced}" \
        "${GUARDIAN_STATE:-normal}" \
        "$remaining" \
        "${INTERVENTION_COUNT:-0}" \
        "$CPU_CEILING" "$GPU_CEILING" \
        "${CPU_TEMP:-}" "${GPU_TEMP:-}"
    local f
    for f in /var/home/*/.local/share/rog-monitor /home/*/.local/share/rog-monitor; do
        [[ -d "$f" ]] || continue
        if printf '%s\n' "$payload" > "$f/thermal-guardian-state.json.tmp" 2>/dev/null; then
            mv -f "$f/thermal-guardian-state.json.tmp" "$f/thermal-guardian-state.json" 2>/dev/null || true
        fi
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
    local cpu_load="$1" gpu_load="$2" cpu_temp="$3" gpu_temp="$4"

    # Falla-segura: cualquier lectura ausente → pedir el nivel más agresivo.
    if [[ -z "$cpu_load" || -z "$gpu_load" || -z "$cpu_temp" || -z "$gpu_temp" ]]; then
        echo 2; return
    fi

    local max_load=$(( cpu_load > gpu_load ? cpu_load : gpu_load ))

    if (( cpu_temp >= CPU_WARN_TEMP || gpu_temp >= GPU_WARN_TEMP || max_load >= LOAD_HIGH )); then
        echo 2   # performance/high
    elif (( max_load <= LOAD_IDLE && cpu_temp < (CPU_WARN_TEMP - 10) && gpu_temp < (GPU_WARN_TEMP - 10) )); then
        echo 0   # quiet/silence — frío e idle de verdad
    else
        echo 1   # balanced/normal
    fi
}

# evaluate_load <cpu_load> <gpu_load> <cpu_temp> <gpu_temp> — aplica histéresis temporal:
# subir es INMEDIATO (proteger primero); bajar requiere COOLDOWN segundos
# continuos de "podríamos bajar" y luego un escalón cada STEP_DELAY s (nunca
# de golpe a silencio).
evaluate_load() {
    local cpu_load="$1" gpu_load="$2" cpu_temp="$3" gpu_temp="$4" now want
    now=$(date +%s)
    want="$(desired_load_level "$cpu_load" "$gpu_load" "$cpu_temp" "$gpu_temp")"

    if (( want > CURRENT_LOAD_LEVEL )); then
        # Subir agresividad: inmediato, sin esperar.
        CURRENT_LOAD_LEVEL="$want"
        LOW_SINCE=0          # cancelar cualquier cooldown en curso
        LAST_STEP_DOWN="$now"
    elif (( want < CURRENT_LOAD_LEVEL )); then
        if (( LOW_SINCE == 0 )); then
            # Primera vez que detectamos que podríamos bajar: iniciar contador.
            LOW_SINCE="$now"
            log "Carga/temp baja detectada — esperando ${COOLDOWN}s para bajar a ${LOAD_LEVELS[$((CURRENT_LOAD_LEVEL-1))]}"
        elif (( now - LOW_SINCE >= COOLDOWN && now - LAST_STEP_DOWN >= STEP_DELAY )); then
            # COOLDOWN cumplido: dar un escalón de bajada.
            CURRENT_LOAD_LEVEL=$(( CURRENT_LOAD_LEVEL - 1 ))
            LAST_STEP_DOWN="$now"
            # IMPORTANTE (fix v12): cada escalón reinicia LOW_SINCE para que
            # el SIGUIENTE escalón también espere COOLDOWN segundos de carga
            # baja sostenida, no solo STEP_DELAY. Sin esto los fans bajan 2
            # escalones en COOLDOWN+STEP_DELAY s (demasiado rápido).
            LOW_SINCE="$now"
            log "Carga baja sostenida ${COOLDOWN}s → escalón a ${LOAD_LEVELS[$CURRENT_LOAD_LEVEL]}"
        fi
    else
        # want == CURRENT_LOAD_LEVEL: carga en el nivel actual → cancelar cooldown.
        LOW_SINCE=0
    fi

    set_fan_aggression "${LOAD_LEVELS[$CURRENT_LOAD_LEVEL]}"
    write_guardian_state "${LOAD_MODE_NAMES[$CURRENT_LOAD_LEVEL]}" \
        "load cpu=${cpu_load:-?}% gpu=${gpu_load:-?}% temp cpu=${cpu_temp:-?}C gpu=${gpu_temp:-?}C"
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
OVER_SINCE=0
LAST_POWER_CUT=0

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
    local cpu_temp="$1"
    local gpu_temp="$2"

    if [[ -z "$cpu_temp" && -z "$gpu_temp" ]]; then
        # FALLA-SEGURO: sin temperaturas → subir fans, NO tocar potencia
        warn_log "No se pudo leer temp CPU/GPU → modo falla-seguro (fans max)"
        set_fan_aggression "performance"
        FAN_PROFILE_PUSHED=true
        GUARDIAN_STATE="fans-up"
        return
    fi

    local cpu_over=0 gpu_over=0 cpu_warn=0 gpu_warn=0
    [[ -n "$cpu_temp" ]] && (( cpu_temp >= CPU_CEILING )) && cpu_over=1
    [[ -n "$gpu_temp" ]] && (( gpu_temp >= GPU_CEILING )) && gpu_over=1
    [[ -n "$cpu_temp" ]] && (( cpu_temp >= CPU_WARN_TEMP )) && cpu_warn=1
    [[ -n "$gpu_temp" ]] && (( gpu_temp >= GPU_WARN_TEMP )) && gpu_warn=1

    if (( cpu_over == 1 || gpu_over == 1 )); then
        # TECHO: fans primero. El recorte de potencia espera un exceso sostenido
        # para no castigar picos cortos normales durante juego.
        save_originals_once
        set_fan_aggression "performance"
        FAN_PROFILE_PUSHED=true
        local now over_for
        now=$(date +%s)
        if (( OVER_SINCE == 0 )); then
            OVER_SINCE="$now"
            log "Temp cpu=${cpu_temp:-?}°C/gpu=${gpu_temp:-?}°C >= techo cpu=${CPU_CEILING}°C/gpu=${GPU_CEILING}°C — fans alto; esperando ${OVER_GRACE}s antes de recortar potencia"
        fi
        over_for=$(( now - OVER_SINCE ))
        if (( over_for < OVER_GRACE )); then
            GUARDIAN_STATE="fans-up"
            return
        fi

        if (( LAST_POWER_CUT > 0 && now - LAST_POWER_CUT < CUT_INTERVAL )); then
            return
        fi
        LAST_POWER_CUT="$now"

        log "Temp sobre techo por ${over_for}s — recorte suave de potencia"

        # Recortar nv_dynamic_boost
        local db_lo db_hi db_cur db_cut=0
        read -r db_lo db_hi db_cur <<< "$(get_db_range)"
        local new_db
        new_db="$(clamp_int $(( db_cur - DB_STEP )) "$db_lo" "$db_hi")"
        if (( new_db < db_cur )); then
            if [[ -d "$DB_PATH" ]]; then
                write_sysfs_int "$DB_PATH/current_value" "$new_db" && \
                    log "nv_dynamic_boost: ${db_cur} → ${new_db} W"
                db_cut=1
            fi
        fi

        # PL2/SPPT solo entra si el boost ya se tocó antes o si dynamic_boost
        # no puede bajar más. Es el segundo escalón, no la primera reacción.
        if [[ "$GUARDIAN_STATE" == "boost-down" || "$GUARDIAN_STATE" == "pl-down" || "$db_cut" == "0" ]]; then
            local pl_lo pl_hi pl_cur
            read -r pl_lo pl_hi pl_cur <<< "$(get_pl2_range)"
            local new_pl
            new_pl="$(clamp_int $(( pl_cur - PL2_STEP )) "$pl_lo" "$pl_hi")"
            if (( new_pl < pl_cur )); then
                if [[ -d "$PL2_PATH" ]]; then
                    write_sysfs_int "$PL2_PATH/current_value" "$new_pl" && \
                        log "ppt_pl2_sppt: ${pl_cur} → ${new_pl} W (sostenido)"
                fi
            fi
            GUARDIAN_STATE="pl-down"
        else
            GUARDIAN_STATE="boost-down"
        fi
        INTERVENTION_COUNT=$(( INTERVENTION_COUNT + 1 ))

    elif (( cpu_warn == 1 || gpu_warn == 1 )); then
        # ADVERTENCIA: acercándose al techo → solo fans
        save_originals_once
        OVER_SINCE=0
        if [[ "$GUARDIAN_STATE" == "normal" ]]; then
            log "Temp cpu=${cpu_temp:-?}°C/gpu=${gpu_temp:-?}°C >= umbral alerta cpu=${CPU_WARN_TEMP}°C/gpu=${GPU_WARN_TEMP}°C — subir fans"
            set_fan_aggression "performance"
            FAN_PROFILE_PUSHED=true
            GUARDIAN_STATE="fans-up"
        fi
        # Si ya estábamos con fans up y sigue igual → no hacer nada extra

    else
        # NORMAL: por debajo del umbral → revertir suavemente
        OVER_SINCE=0
        if [[ "$GUARDIAN_STATE" != "normal" ]]; then
            local cpu_margin=99 gpu_margin=99
            [[ -n "$cpu_temp" ]] && cpu_margin=$(( CPU_CEILING - cpu_temp ))
            [[ -n "$gpu_temp" ]] && gpu_margin=$(( GPU_CEILING - gpu_temp ))
            if (( cpu_margin >= RESTORE_MARGIN && gpu_margin >= RESTORE_MARGIN )); then
                # Suficiente margen: restaurar
                log "Temp cpu=${cpu_temp:-?}°C/gpu=${gpu_temp:-?}°C — margen suficiente — restaurando configuración"

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
                OVER_SINCE=0
                LAST_POWER_CUT=0
            fi
            # Si el margen es bajo, esperar otro ciclo antes de revertir (evitar oscilación)
        fi
    fi
}

# ------------------------------------------------------------------
# Loop principal
# ------------------------------------------------------------------
log "Iniciando guardián térmico CPU/GPU (cpu=${CPU_CEILING}°C, gpu=${GPU_CEILING}°C, warn cpu=${CPU_WARN_TEMP}°C/gpu=${GPU_WARN_TEMP}°C, gracia=${OVER_GRACE}s, recorte_cada=${CUT_INTERVAL}s, intervalo=${INTERVAL}s, modula_carga=${LOAD_MODULATION})"

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
    CPU_TEMP="$(read_cpu_temp)"
    GPU_TEMP="$(read_gpu_temp)"
    handle_temp "$CPU_TEMP" "$GPU_TEMP"
    # La modulación por carga solo decide la agresividad de fans cuando NO
    # hay una emergencia térmica activa — durante "fans-up"/"boost-down"/
    # "pl-down" handle_temp ya forzó "performance" y eso manda (falla-segura:
    # nunca relajar fans mientras el techo está en juego).
    if [[ "$GUARDIAN_STATE" == "normal" && "$LOAD_MODULATION" == "1" ]]; then
        CPU_LOAD="$(read_cpu_load)"
        GPU_LOAD="$(read_gpu_load)"
        evaluate_load "$CPU_LOAD" "$GPU_LOAD" "$CPU_TEMP" "$GPU_TEMP"
    elif [[ "$GUARDIAN_STATE" == "normal" ]]; then
        write_guardian_state "normal" "monitorizando; sin modular perfil por carga"
    else
        write_guardian_state "high" "emergencia térmica: ${GUARDIAN_STATE}"
    fi
    sleep "$INTERVAL"
done
