#!/usr/bin/env bash
# rog-thermal-guardian.sh — Guardián térmico CPU/GPU 2.0: VENTILADORES PRIMERO
#
# Filosofía de diseño:
#   1. CPU/GPU demasiado caliente → subir ventiladores primero.
#   2. Si sigue subiendo → recortar nv_dynamic_boost y, si hace falta, PL2.
#   3. Al enfriar → revertir GRADUALMENTE (mismo escalón por intervalo de corte,
#      solo tras `restore_hold` s por debajo de techo-margen) y NUNCA por encima
#      del objetivo del perfil activo.
#   FALLA-SEGURO: si no puede leer una temperatura → ventiladores arriba, NUNCA
#   recorta ni sube potencia por falta de datos (ver "Sensor ausente" abajo).
#
# Guardián 2.0 (CP-6.06..6.09):
#   - TODA escritura de hardware pasa por hw_write(). ROG_THERMAL_DRY=1 solo
#     registra "[SIM] would write <ruta>=<valor> (motivo)" y NO escribe; en
#     simulación las lecturas ven los valores simulados, así se ve la rampa.
#   - ROG_SYSFS_ROOT antepone un prefijo a TODA ruta sysfs/proc/run (pruebas
#     como usuario normal contra un árbol falso). ROG_THERMAL_FAKE_TEMPS=<archivo>
#     ("cpu gpu", "-" = ausente) sustituye a los sensores, releído cada ciclo.
#   - Cada decisión deja UNA línea de journal estructurada:
#       decision=<cut|restore|hold|boost|unboost> reason=<..> cpu=<t> gpu=<t>
#       ceiling=<cpu>/<gpu> pl2=<antes>-><después> db=<antes>-><después> sim=<0|1>
#     y el JSON de estado trae `last_decision` y `history` (últimas 20).
#   - throttle_thermal_policy YA NO se escribe (ver set_fan_aggression, H3).
#   - Antes del primer recorte se persiste /run/rog-monitor/guardian-precut; si el
#     proceso muere (SIGKILL/OOM/corte), el siguiente arranque restaura primero.
#
# Sensor ausente (decisión documentada, M3): si falta UNO o AMBOS sensores, se
# suben ventiladores (performance) y se registra; NUNCA se recorta ni se
# restaura potencia por la sola falta de dato. Con un sensor presente, ESE dato
# sí puede recortar (es un dato real). La restauración exige ambos sensores.
# Un sensor que no vuelve deja los ventiladores arriba y los límites como
# estaban hasta que vuelva o se detenga el servicio (la parada restaura).
#
# Limitación conocida (M5/H2): si el usuario cambia a mano de perfil mientras el
# guardián tiene los ventiladores en "performance", no se puede distinguir de la
# subida del guardián si el nuevo perfil es "performance"; en cualquier otro
# caso se respeta el perfil del usuario y NO se pisa al restaurar.
#
# v13 (guardian suave): por defecto NO modula platform_profile por carga.
# Si alguien quiere la modulación por carga, ROG_THERMAL_MODULATE_LOAD=1.
# v12: cada escalón de bajada de la modulación reinicia su COOLDOWN.
#
# Integración con rog-profile-sync:
#   - Este daemon NUNCA escribe a pwm*_auto_pointN (eso lo hace
#     rog-profile-sync.sh). Pide ventiladores vía /sys/firmware/acpi/platform_profile
#     y recorta nv_dynamic_boost / ppt_pl2_sppt en emergencia térmica.
#   - Publica su estado en ~/.local/share/rog-monitor/thermal-guardian-state.json
#     (glob de home como rog-profile-sync.sh, porque corre como root). La app
#     (fans.py:guardian_status) lo lee; nunca lo escribe.
#
# Configuración (variables de entorno o argumentos):
#   ROG_THERMAL_CPU_CEILING — techo CPU en °C (default 92, rango UI 70-100)
#   ROG_THERMAL_GPU_CEILING — techo GPU en °C (default 83, máx firmware 87)
#   ROG_THERMAL_CEILING     — alias legacy para GPU ceiling
#   ROG_THERMAL_INTERVAL    — intervalo del loop en segundos (default 2)
#   ROG_THERMAL_DB_PATH / ROG_THERMAL_PL2_PATH — rutas sysfs de nv_dynamic_boost / ppt_pl2_sppt
#   ROG_THERMAL_LOAD_IDLE / LOAD_HIGH / MODULATE_LOAD — modulación por carga (default OFF)
#   ROG_THERMAL_OVER_GRACE  — segundos sobre el techo antes de recortar; default 12
#   ROG_THERMAL_BAND_MEMORY — segundos que la gracia sobrevive en banda de alerta; default max(30, 3*gracia)
#   ROG_THERMAL_DB_STEP / PL2_STEP — W por paso (recorte Y restauración); default 2 / 5
#   ROG_THERMAL_CUT_INTERVAL — segundos mínimos entre recortes/restauraciones; default 10
#   ROG_THERMAL_RESTORE_MARGIN — °C bajo el techo para empezar a restaurar; default 4
#   ROG_THERMAL_RESTORE_HOLD — s sostenidos bajo techo-margen antes de restaurar; default 20
#   ROG_THERMAL_DRY         — 1 = simulación (no toca hardware); default 0
#   ROG_SYSFS_ROOT          — prefijo de rutas (pruebas); default vacío
#   ROG_THERMAL_FAKE_TEMPS  — archivo "cpu gpu" que sustituye los sensores (pruebas)
#   ROG_THERMAL_STATE_DIR   — único directorio para el JSON de estado (pruebas)
#   ROG_PY_LAUNCHER         — lanzador python aislado (default /usr/local/libexec/rog-monitor/rog-py.sh)
#
# Uso:
#   rog-thermal-guardian.sh [--cpu-ceiling 92] [--gpu-ceiling 83] [--interval 2]
#
# Instalación:
#   Ver systemd/rog-thermal-guardian.service — instalar con scripts/install-system.sh.
#   Para recuperación desde TTY: scripts/rog-monitor-safe-mode.sh.

set -euo pipefail
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin  # root: PATH fijo del sistema

# ------------------------------------------------------------------
# Parseo de argumentos
# ------------------------------------------------------------------
# MODO del guardián:
#   protection (default) → fans primero y, si el exceso es sostenido, recorte
#                          suave de dynamic_boost/PL2. Para uso general.
#   gaming               → SOLO ventiladores: nunca recorta potencia, así no
#                          hay thermal throttling y la sesión de juego no se
#                          siente peor con el guardián activo. Techos altos.
MODE="${ROG_THERMAL_MODE:-protection}"
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
RESTORE_HOLD="${ROG_THERMAL_RESTORE_HOLD:-20}"
DRY="${ROG_THERMAL_DRY:-0}"
SR="${ROG_SYSFS_ROOT:-}"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --ceiling|--gpu-ceiling)  GPU_CEILING="$2";  shift 2 ;;
        --cpu-ceiling) CPU_CEILING="$2"; shift 2 ;;
        --mode)     MODE="$2"; shift 2 ;;
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
        --restore-hold) RESTORE_HOLD="$2"; shift 2 ;;
        --dry) DRY="$2"; shift 2 ;;
        --) shift; break ;;
        *) echo "Argumento desconocido: $1" >&2; exit 1 ;;
    esac
done

[[ "$MODE" == "gaming" || "$MODE" == "protection" ]] || MODE="protection"
[[ "$DRY" == "1" ]] || DRY=0
(( CPU_CEILING < 70 )) && CPU_CEILING=70
(( CPU_CEILING > 100 )) && CPU_CEILING=100
(( GPU_CEILING < 70 )) && GPU_CEILING=70
(( GPU_CEILING > 87 )) && GPU_CEILING=87
GPU_WARN_TEMP="${WARN_OFFSET:-$(( GPU_CEILING - WARN_DELTA ))}"
CPU_WARN_TEMP="${ROG_THERMAL_CPU_WARN:-$(( CPU_CEILING - WARN_DELTA ))}"
BAND_MEMORY="${ROG_THERMAL_BAND_MEMORY:-$(( OVER_GRACE * 3 > 30 ? OVER_GRACE * 3 : 30 ))}"

# ------------------------------------------------------------------
# Rutas (todas bajo $SR para poder probar contra un árbol falso)
# ------------------------------------------------------------------
ATTRS_BASE="${ROG_FW_ATTRS_DIR:-$SR/sys/class/firmware-attributes/asus-armoury/attributes}"
DB_PATH="${ROG_THERMAL_DB_PATH:-$ATTRS_BASE/nv_dynamic_boost}"
PL2_PATH="${ROG_THERMAL_PL2_PATH:-$ATTRS_BASE/ppt_pl2_sppt}"
PLATFORM_PROFILE="$SR/sys/firmware/acpi/platform_profile"
HWMON_GLOB="$SR/sys/class/hwmon/hwmon"
PROC_STAT="$SR/proc/stat"
MARKER_DIR="$SR/run/rog-monitor"
MARKER_FILE="$MARKER_DIR/guardian-precut"
PY_LAUNCHER="${ROG_PY_LAUNCHER:-/usr/local/libexec/rog-monitor/rog-py.sh}"
FAKE_TEMPS="${ROG_THERMAL_FAKE_TEMPS:-}"

# Valores simulados (solo DRY): ruta → último valor "escrito".
declare -A SIM_VALUES=()

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
# Leer/escribir hardware. hw_write es el ÚNICO punto de escritura de hardware.
# ------------------------------------------------------------------
hw_read() {
    local path="$1"
    if [[ -n "${SIM_VALUES[$path]+x}" ]]; then
        printf '%s' "${SIM_VALUES[$path]}"
    else
        cat "$path" 2>/dev/null || true
    fi
}

read_sysfs_int() {
    local path="$1"
    [[ -n "${SIM_VALUES[$path]+x}" || -f "$path" ]] || { echo ""; return 0; }
    local v
    v="$(hw_read "$path")"
    [[ "$v" =~ ^-?[0-9]+$ ]] && echo "$v" || echo ""
}

read_profile() {
    local p
    p="$(hw_read "$PLATFORM_PROFILE" | tr -d '[:space:]')"
    echo "$p"
}

hw_write() {
    local path="$1" val="$2" why="${3:-}"
    if [[ "$DRY" == "1" ]]; then
        log "[SIM] would write ${path}=${val} (${why})"
        SIM_VALUES["$path"]="$val"
        return 0
    fi
    [[ -e "$path" ]] || { warn_log "No existe: $path"; return 1; }
    printf '%s' "$val" > "$path" 2>/dev/null || {
        warn_log "No se pudo escribir $val en $path (¿root?)"; return 1;
    }
    return 0
}

clamp_int() {
    local v="$1" lo="$2" hi="$3"
    (( v < lo )) && v="$lo"
    (( v > hi )) && v="$hi"
    echo "$v"
}

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
# Sensores (falla-seguro: "" si no se puede leer o el valor es implausible)
# ------------------------------------------------------------------
plausible_temp() {   # 20..110 °C o ""
    local t="$1"
    if [[ "$t" =~ ^[0-9]+$ ]] && (( t >= 20 && t <= 110 )); then echo "$t"; else echo ""; fi
}

read_gpu_temp() {
    # Intento 1: nvidia-smi con timeout (un nvidia-smi colgado no debe bloquear el bucle).
    if command -v nvidia-smi &>/dev/null; then
        local t
        t=$(timeout 3 nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader,nounits 2>/dev/null | head -1 | tr -d ' ' || true)
        if [[ "$t" =~ ^[0-9]+$ ]]; then
            echo "$t"
            return 0
        fi
    fi

    # Intento 2: hwmon nvidia
    local hwmon_dir name_file hw_name temp_file raw
    for hwmon_dir in "$HWMON_GLOB"*; do
        name_file="$hwmon_dir/name"
        [[ -f "$name_file" ]] || continue
        hw_name=$(cat "$name_file" 2>/dev/null || echo "")
        if [[ "$hw_name" == *nvidia* ]] || [[ "$hw_name" == *nouveau* ]]; then
            for temp_file in "$hwmon_dir"/temp*_input; do
                [[ -f "$temp_file" ]] || continue
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

    for hwmon_dir in "$HWMON_GLOB"*; do
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

# Rellena CPU_TEMP / GPU_TEMP (con la sustitución de pruebas si hay archivo).
read_temps() {
    if [[ -n "$FAKE_TEMPS" ]]; then
        local c="" g=""
        read -r c g < "$FAKE_TEMPS" 2>/dev/null || true
        CPU_TEMP="$(plausible_temp "${c:-}")"
        GPU_TEMP="$(plausible_temp "${g:-}")"
    else
        CPU_TEMP="$(plausible_temp "$(read_cpu_temp)")"
        GPU_TEMP="$(plausible_temp "$(read_gpu_temp)")"
    fi
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
    read -r line < "$PROC_STAT" 2>/dev/null || { echo ""; return; }
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
    if [[ -z "$FAKE_TEMPS" ]] && command -v nvidia-smi &>/dev/null; then
        local u
        u=$(timeout 3 nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits 2>/dev/null | head -1 | tr -d ' ' || true)
        [[ "$u" =~ ^[0-9]+$ ]] && { echo "$u"; return 0; }
    fi
    echo ""
}

# ------------------------------------------------------------------
# Estado del guardián y trazabilidad (CP-6.08)
# ------------------------------------------------------------------
GUARDIAN_STATE="normal"   # "normal" | "fans-up" | "boost-down" | "pl-down"
PRE_DB=""                 # valores ANTES del primer recorte (también en el marcador)
PRE_PL2=""
ORIGINAL_PROFILE=""       # perfil de plataforma ANTES de subir ventiladores
FAN_PROFILE_PUSHED=false
POWER_CUT=0               # 1 desde el primer recorte del episodio
INTERVENTION_COUNT=0
OVER_SINCE=0              # inicio de la gracia (NO se reinicia en banda de alerta)
LAST_OVER_TS=0
COOL_SINCE=0              # desde cuándo llevamos por debajo de techo-margen
LAST_POWER_CUT=0
LAST_RESTORE=0
LAST_DECISION_KEY=""
LAST_DECISION_JSON="null"
HISTORY=()
NOW=0
CPU_TEMP=""
GPU_TEMP=""

# decide <decision> <motivo> [db_antes db_después pl2_antes pl2_después]
# UNA línea estructurada al journal + last_decision/history del JSON. Los "hold"
# repetidos con el mismo motivo se omiten (si no, 1 línea cada 2 s).
decide() {
    local dec="$1" why="$2" key="$1:$2"
    if [[ "$dec" == "hold" && "$key" == "$LAST_DECISION_KEY" ]]; then
        return 0
    fi
    LAST_DECISION_KEY="$key"
    local db_old db_new pl_old pl_new
    if [[ $# -ge 6 ]]; then
        db_old="$3"; db_new="$4"; pl_old="$5"; pl_new="$6"
    else
        db_old="$(read_sysfs_int "$DB_PATH/current_value")"; db_old="${db_old:--}"; db_new="$db_old"
        pl_old="$(read_sysfs_int "$PL2_PATH/current_value")"; pl_old="${pl_old:--}"; pl_new="$pl_old"
    fi
    log "decision=${dec} reason=${why} cpu=${CPU_TEMP:--} gpu=${GPU_TEMP:--} ceiling=${CPU_CEILING}/${GPU_CEILING} pl2=${pl_old}->${pl_new} db=${db_old}->${db_new} sim=${DRY}"
    local obj
    printf -v obj '{"ts":%s,"decision":"%s","reason":"%s","values":{"cpu":"%s","gpu":"%s","ceiling":"%s/%s","pl2":"%s->%s","db":"%s->%s","sim":%s}}' \
        "$NOW" "$dec" "$why" "${CPU_TEMP:--}" "${GPU_TEMP:--}" "$CPU_CEILING" "$GPU_CEILING" \
        "$pl_old" "$pl_new" "$db_old" "$db_new" "$DRY"
    LAST_DECISION_JSON="$obj"
    HISTORY+=("$obj")
    if (( ${#HISTORY[@]} > 20 )); then
        HISTORY=("${HISTORY[@]: -20}")
    fi
    return 0
}

# ------------------------------------------------------------------
# Publicar estado para la UI (solo lectura para la app; este script es la
# única fuente de escritura). Falla en silencio si no hay home de usuario.
# Campos previos intactos; nuevos: configured_mode, dry, last_decision, history.
# guardian_mode es el modo EFECTIVO: "gaming" solo mientras el guardián está
# activo (state != normal), para que el tope de ventiladores de Gaming
# (rog-profile-sync.sh / fans.py) dependa de la temperatura y no sea permanente (M5).
# ------------------------------------------------------------------
write_guardian_state() {
    local mode="$1" reason="$2"
    local now; now="$(date +%s)"
    local remaining=0
    if (( LOW_SINCE > 0 && CURRENT_LOAD_LEVEL > 0 )); then
        local elapsed=$(( now - LOW_SINCE ))
        remaining=$(( COOLDOWN - elapsed ))
        (( remaining < 0 )) && remaining=0
    fi
    local effective="protection"
    if [[ "$MODE" == "gaming" && "${GUARDIAN_STATE:-normal}" != "normal" ]]; then
        effective="gaming"
    fi
    local hist="" h
    for h in "${HISTORY[@]}"; do
        hist+="${hist:+,}$h"
    done
    local payload
    printf -v payload \
        '{"mode":"%s","reason":"%s","updated":%s,"guardian_mode":"%s","configured_mode":"%s","aggression":"%s","thermal_state":"%s","cooldown_remaining":%s,"interventions":%s,"cpu_ceiling":%s,"gpu_ceiling":%s,"cpu_temp":"%s","gpu_temp":"%s","dry":%s,"last_decision":%s,"history":[%s]}' \
        "$mode" "$reason" "$now" "$effective" "$MODE" \
        "${LOAD_LEVELS[$CURRENT_LOAD_LEVEL]:-balanced}" \
        "${GUARDIAN_STATE:-normal}" \
        "$remaining" \
        "${INTERVENTION_COUNT:-0}" \
        "$CPU_CEILING" "$GPU_CEILING" \
        "${CPU_TEMP:-}" "${GPU_TEMP:-}" \
        "$DRY" "$LAST_DECISION_JSON" "$hist"
    local f dirs
    if [[ -n "${ROG_THERMAL_STATE_DIR:-}" ]]; then
        dirs=("$ROG_THERMAL_STATE_DIR")
    else
        dirs=("$SR"/var/home/*/.local/share/rog-monitor "$SR"/home/*/.local/share/rog-monitor)
    fi
    for f in "${dirs[@]}"; do
        # Un symlink aquí haría que root escriba donde el usuario quiera.
        [[ -d "$f" && ! -L "$f" ]] || continue
        # Root escribe en un directorio que controla el usuario: borrar el .tmp y
        # crearlo con noclobber (O_EXCL) para no seguir un symlink plantado.
        rm -f -- "$f/thermal-guardian-state.json.tmp" 2>/dev/null || true
        if ( set -C; printf '%s\n' "$payload" > "$f/thermal-guardian-state.json.tmp" ) 2>/dev/null; then
            mv -f "$f/thermal-guardian-state.json.tmp" "$f/thermal-guardian-state.json" 2>/dev/null || true
        fi
    done
    return 0
}

# ------------------------------------------------------------------
# Ventiladores vía platform_profile (ÚNICA vía; H3)
# ------------------------------------------------------------------
# NO se escribe throttle_thermal_policy: el ABI de asus-wmi en ROG/TUF es
# 0=default(balanced), 1=overboost(performance), 2=silent, es decir, lo opuesto
# a lo que escribía el guardián v13 (performance→2 pedía SILENCIO). El driver ya
# mantiene throttle_thermal_policy sincronizado con platform_profile, así que
# basta el interfaz estándar /sys/firmware/acpi/platform_profile.
set_fan_aggression() {
    local level="$1" why="${2:-modulacion-por-carga}"   # performance | balanced | quiet
    if [[ -e "$PLATFORM_PROFILE" || "$DRY" == "1" ]]; then
        [[ "$(read_profile)" == "$level" ]] || hw_write "$PLATFORM_PROFILE" "$level" "$why" || true
    fi
    return 0
}

# Perfil que el USUARIO considera activo: si el guardián subió a performance y
# sigue en performance, es el original; si cambió a otro, ese es el del usuario.
effective_profile() {
    local cur; cur="$(read_profile)"
    if [[ "$FAN_PROFILE_PUSHED" == true && "$cur" == "performance" && -n "$ORIGINAL_PROFILE" ]]; then
        echo "$ORIGINAL_PROFILE"
    else
        echo "${cur:-${ORIGINAL_PROFILE:-balanced}}"
    fi
}

# ------------------------------------------------------------------
# Marcador pre-recorte (H5): sobrevive a SIGKILL/OOM; en tmpfs (/run).
# ------------------------------------------------------------------
persist_marker() {
    [[ "$DRY" == "1" ]] && return 0
    [[ -L "$MARKER_DIR" ]] && return 0
    mkdir -p -m 0755 "$MARKER_DIR" 2>/dev/null || return 0
    local tmp="$MARKER_FILE.tmp"
    rm -f -- "$tmp" 2>/dev/null || true
    if printf 'ts=%s\nprofile=%s\ndb=%s\npl2=%s\npushed=%s\ncut=%s\n' \
        "$NOW" "$ORIGINAL_PROFILE" "$PRE_DB" "$PRE_PL2" \
        "$([[ "$FAN_PROFILE_PUSHED" == true ]] && echo 1 || echo 0)" "$POWER_CUT" > "$tmp" 2>/dev/null; then
        mv -f -- "$tmp" "$MARKER_FILE" 2>/dev/null || true
    fi
    return 0
}

clear_marker() {
    [[ "$DRY" == "1" ]] && return 0
    rm -f -- "$MARKER_FILE" "$MARKER_FILE.tmp" 2>/dev/null || true
    return 0
}

capture_pre_power() {
    local cur
    read -r _ _ cur <<< "$(get_db_range)"
    PRE_DB="$cur"
    read -r _ _ cur <<< "$(get_pl2_range)"
    PRE_PL2="$cur"
}

# Sube ventiladores. Guarda ANTES el perfil original y los límites actuales
# (M1: nunca quedar en performance sin saber a qué volver).
push_fans() {
    local why="$1"
    [[ "$FAN_PROFILE_PUSHED" == true ]] && return 0
    if [[ -z "$ORIGINAL_PROFILE" ]]; then
        ORIGINAL_PROFILE="$(read_profile)"
        ORIGINAL_PROFILE="${ORIGINAL_PROFILE:-balanced}"
    fi
    [[ -n "$PRE_DB" ]] || capture_pre_power
    FAN_PROFILE_PUSHED=true
    persist_marker
    hw_write "$PLATFORM_PROFILE" "performance" "$why" || true
    decide boost "$why"
    return 0
}

# Devuelve el perfil original SOLO si lo que hay es lo que escribimos nosotros.
unboost_fans() {
    [[ "$FAN_PROFILE_PUSHED" == true ]] || return 0
    local cur; cur="$(read_profile)"
    if [[ "$cur" == "performance" && -n "$ORIGINAL_PROFILE" && "$ORIGINAL_PROFILE" != "performance" ]]; then
        hw_write "$PLATFORM_PROFILE" "$ORIGINAL_PROFILE" "restaurar-perfil-original" || true
    fi
    FAN_PROFILE_PUSHED=false
    return 0
}

# ------------------------------------------------------------------
# Objetivo de restauración (H2): el del PERFIL ACTUAL, nunca por encima.
# ------------------------------------------------------------------
# Techo de cada límite = objetivo calibrado del perfil activo (subcomando de solo
# lectura `profile-limits` del lanzador python aislado). Si el perfil no cambió
# desde antes del recorte, además se respeta el valor previo si era menor
# (p. ej. un ajuste manual del usuario). Si el perfil cambió, rog-profile-sync
# ya aplicó los límites del perfil nuevo: sin objetivo conocido no se toca nada.
CEIL_DB=""
CEIL_PL2=""

compute_ceilings() {
    local tgt_db="" tgt_pl2="" prof out kv unchanged=1
    prof="$(effective_profile)"
    [[ -z "$ORIGINAL_PROFILE" || "$prof" == "$ORIGINAL_PROFILE" ]] || unchanged=0
    if [[ -x "$PY_LAUNCHER" && "$prof" =~ ^[a-z-]+$ ]]; then
        out="$(timeout 5 "$PY_LAUNCHER" rog_monitor.power_control profile-limits "$prof" 2>/dev/null || true)"
        for kv in $out; do
            case "$kv" in
                pl2=[0-9]*)           tgt_pl2="${kv#*=}" ;;
                dynamic_boost=[0-9]*) tgt_db="${kv#*=}" ;;
            esac
        done
    fi
    [[ "$tgt_db" =~ ^[0-9]+$ ]] || tgt_db=""
    [[ "$tgt_pl2" =~ ^[0-9]+$ ]] || tgt_pl2=""
    CEIL_DB="$tgt_db"; CEIL_PL2="$tgt_pl2"
    if (( unchanged )); then
        [[ "$PRE_DB" =~ ^[0-9]+$ ]] && { [[ -z "$CEIL_DB" || "$PRE_DB" -lt "$CEIL_DB" ]] && CEIL_DB="$PRE_DB"; }
        [[ "$PRE_PL2" =~ ^[0-9]+$ ]] && { [[ -z "$CEIL_PL2" || "$PRE_PL2" -lt "$CEIL_PL2" ]] && CEIL_PL2="$PRE_PL2"; }
    fi
    return 0
}

# restore_power <jump|step> <motivo>: sube DB/PL2 hacia su techo SIN pasarlo y
# NUNCA baja nada. Devuelve 0 si todo está en su techo (o no hay qué restaurar),
# 1 si queda pendiente (o una escritura falló → se reintenta).
restore_power() {
    local how="$1" why="$2"
    (( POWER_CUT )) || return 0
    compute_ceilings
    local db_lo db_hi db_cur pl_lo pl_hi pl_cur want pending=0 changed=0
    read -r db_lo db_hi db_cur <<< "$(get_db_range)"
    read -r pl_lo pl_hi pl_cur <<< "$(get_pl2_range)"
    local db_new="$db_cur" pl_new="$pl_cur"

    if [[ -n "$CEIL_DB" ]] && (( db_cur < CEIL_DB )) && [[ -d "$DB_PATH" ]]; then
        want="$CEIL_DB"
        [[ "$how" == "step" ]] && (( db_cur + DB_STEP < want )) && want=$(( db_cur + DB_STEP ))
        want="$(clamp_int "$want" "$db_lo" "$db_hi")"
        if hw_write "$DB_PATH/current_value" "$want" "restaurar-dynamic-boost"; then
            db_new="$want"; changed=1
        fi
        (( db_new < CEIL_DB )) && pending=1
    fi
    if [[ -n "$CEIL_PL2" ]] && (( pl_cur < CEIL_PL2 )) && [[ -d "$PL2_PATH" ]]; then
        want="$CEIL_PL2"
        [[ "$how" == "step" ]] && (( pl_cur + PL2_STEP < want )) && want=$(( pl_cur + PL2_STEP ))
        want="$(clamp_int "$want" "$pl_lo" "$pl_hi")"
        if hw_write "$PL2_PATH/current_value" "$want" "restaurar-pl2"; then
            pl_new="$want"; changed=1
        fi
        (( pl_new < CEIL_PL2 )) && pending=1
    fi
    LAST_RESTORE="$NOW"
    (( changed )) && decide restore "$why" "$db_cur" "$db_new" "$pl_cur" "$pl_new"
    return "$pending"
}

# Fin de episodio: ventiladores al perfil original, limpiar marcador y estado.
finish_restore() {
    local why="$1"
    local was_pushed="$FAN_PROFILE_PUSHED"
    unboost_fans
    clear_marker
    GUARDIAN_STATE="normal"
    PRE_DB=""; PRE_PL2=""; ORIGINAL_PROFILE=""
    POWER_CUT=0; INTERVENTION_COUNT=0
    OVER_SINCE=0; LAST_OVER_TS=0; COOL_SINCE=0; LAST_POWER_CUT=0; LAST_RESTORE=0
    if [[ "$was_pushed" == true ]]; then decide unboost "$why"; fi
    return 0
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
# Recorte de potencia (un escalón). Persiste el marcador ANTES de escribir.
# ------------------------------------------------------------------
do_cut() {
    local over_for="$1"
    if (( POWER_CUT == 0 )); then
        capture_pre_power      # valores frescos, justo antes del primer recorte
        POWER_CUT=1
        persist_marker
    fi
    LAST_POWER_CUT="$NOW"

    local db_lo db_hi db_cur pl_lo pl_hi pl_cur
    read -r db_lo db_hi db_cur <<< "$(get_db_range)"
    read -r pl_lo pl_hi pl_cur <<< "$(get_pl2_range)"
    local db_new="$db_cur" pl_new="$pl_cur" db_cut=0 pl_cut=0 next="boost-down"

    # 1.er escalón: nv_dynamic_boost
    local want
    want="$(clamp_int $(( db_cur - DB_STEP )) "$db_lo" "$db_hi")"
    if (( want < db_cur )) && [[ -d "$DB_PATH" ]]; then
        if hw_write "$DB_PATH/current_value" "$want" "recorte-dynamic-boost sobre-techo ${over_for}s"; then
            db_new="$want"; db_cut=1
        fi
    fi

    # PL2/SPPT solo entra si el boost ya se tocó antes o si dynamic_boost
    # no puede bajar más. Es el segundo escalón, no la primera reacción.
    if [[ "$GUARDIAN_STATE" == "boost-down" || "$GUARDIAN_STATE" == "pl-down" || "$db_cut" == "0" ]]; then
        want="$(clamp_int $(( pl_cur - PL2_STEP )) "$pl_lo" "$pl_hi")"
        if (( want < pl_cur )) && [[ -d "$PL2_PATH" ]]; then
            if hw_write "$PL2_PATH/current_value" "$want" "recorte-pl2 sostenido"; then
                pl_new="$want"; pl_cut=1
            fi
        fi
        next="pl-down"
    fi

    if (( db_cut == 0 && pl_cut == 0 )); then
        # Nada que bajar (pisos) o la escritura falló: no avanzar el estado (M6).
        decide hold "sin-margen-de-recorte-o-escritura-fallida" "$db_cur" "$db_cur" "$pl_cur" "$pl_cur"
        return 0
    fi
    GUARDIAN_STATE="$next"
    INTERVENTION_COUNT=$(( INTERVENTION_COUNT + 1 ))
    decide cut "sobre-techo-sostenido-${over_for}s" "$db_cur" "$db_new" "$pl_cur" "$pl_new"
    return 0
}

# ------------------------------------------------------------------
# Lógica principal por ciclo
# ------------------------------------------------------------------
handle_temp() {
    local cpu_temp="$1" gpu_temp="$2"

    # --- Sensores ausentes: ventiladores arriba, jamás potencia por falta de dato.
    if [[ -z "$cpu_temp" && -z "$gpu_temp" ]]; then
        COOL_SINCE=0
        push_fans "sensor-ausente-ambos"
        [[ "$GUARDIAN_STATE" == "normal" ]] && GUARDIAN_STATE="fans-up"
        decide hold "sensor-ausente-ambos-failsafe"
        return 0
    fi
    local missing=0
    [[ -z "$cpu_temp" || -z "$gpu_temp" ]] && missing=1

    local cpu_over=0 gpu_over=0 cpu_warn=0 gpu_warn=0
    [[ -n "$cpu_temp" ]] && (( cpu_temp >= CPU_CEILING )) && cpu_over=1
    [[ -n "$gpu_temp" ]] && (( gpu_temp >= GPU_CEILING )) && gpu_over=1
    [[ -n "$cpu_temp" ]] && (( cpu_temp >= CPU_WARN_TEMP )) && cpu_warn=1
    [[ -n "$gpu_temp" ]] && (( gpu_temp >= GPU_WARN_TEMP )) && gpu_warn=1

    if (( cpu_over == 1 || gpu_over == 1 )); then
        # TECHO: fans primero. El recorte de potencia espera un exceso sostenido
        # para no castigar picos cortos normales durante juego.
        COOL_SINCE=0
        push_fans "techo-superado"
        [[ "$GUARDIAN_STATE" == "normal" ]] && GUARDIAN_STATE="fans-up"
        # MODO GAMING: solo ventiladores. Nunca recorta dynamic_boost/PL2.
        if [[ "$MODE" == "gaming" ]]; then
            decide hold "gaming-solo-ventiladores"
            return 0
        fi
        # Gracia acumulada: NO se reinicia en banda de alerta (M4); solo caduca
        # si llevamos más de BAND_MEMORY s sin tocar el techo.
        if (( OVER_SINCE == 0 || NOW - LAST_OVER_TS > BAND_MEMORY )); then
            OVER_SINCE="$NOW"
        fi
        LAST_OVER_TS="$NOW"
        local over_for=$(( NOW - OVER_SINCE ))
        if (( over_for < OVER_GRACE )); then
            decide hold "gracia-antes-de-recortar"
            return 0
        fi
        if (( LAST_POWER_CUT > 0 && NOW - LAST_POWER_CUT < CUT_INTERVAL )); then
            decide hold "intervalo-entre-recortes"
            return 0
        fi
        do_cut "$over_for"
        return 0

    elif (( cpu_warn == 1 || gpu_warn == 1 )); then
        # ALERTA: solo fans. La gracia NO se reinicia aquí (M4).
        COOL_SINCE=0
        push_fans "banda-de-alerta"
        [[ "$GUARDIAN_STATE" == "normal" ]] && GUARDIAN_STATE="fans-up"
        decide hold "banda-de-alerta"
        return 0
    fi

    # --- Por debajo de la alerta.
    OVER_SINCE=0
    if (( missing )); then
        # Un sensor falta: no se puede verificar el margen → ni recortar ni restaurar.
        COOL_SINCE=0
        push_fans "sensor-ausente"
        [[ "$GUARDIAN_STATE" == "normal" ]] && GUARDIAN_STATE="fans-up"
        decide hold "sensor-ausente-failsafe"
        return 0
    fi
    [[ "$GUARDIAN_STATE" != "normal" ]] || return 0

    # --- Restauración con histéresis (M2): margen + retención + escalones.
    local cpu_margin=$(( CPU_CEILING - cpu_temp )) gpu_margin=$(( GPU_CEILING - gpu_temp ))
    if (( cpu_margin < RESTORE_MARGIN || gpu_margin < RESTORE_MARGIN )); then
        COOL_SINCE=0
        decide hold "esperando-margen-de-restauracion"
        return 0
    fi
    (( COOL_SINCE > 0 )) || COOL_SINCE="$NOW"
    if (( NOW - COOL_SINCE < RESTORE_HOLD )); then
        decide hold "retencion-antes-de-restaurar"
        return 0
    fi
    if (( LAST_RESTORE > 0 && NOW - LAST_RESTORE < CUT_INTERVAL )); then
        decide hold "intervalo-entre-restauraciones"
        return 0
    fi
    if restore_power step "temp-bajo-margen"; then
        finish_restore "restauracion-completa"
    fi
    return 0
}

# ------------------------------------------------------------------
# Recuperación de un cierre anormal previo (H5)
# ------------------------------------------------------------------
startup_recover() {
    [[ -f "$MARKER_FILE" && ! -L "$MARKER_FILE" ]] || return 0
    if [[ "$DRY" == "1" ]]; then
        log "Marcador pre-recorte presente: ignorado en simulación (no se toca nada)"
        return 0
    fi
    local k v m_profile="" m_db="" m_pl2="" m_pushed=0 m_cut=0
    while IFS='=' read -r k v; do
        case "$k" in
            profile) [[ "$v" =~ ^[a-z-]*$ ]] && m_profile="$v" ;;
            db)      [[ "$v" =~ ^[0-9]*$ ]] && m_db="$v" ;;
            pl2)     [[ "$v" =~ ^[0-9]*$ ]] && m_pl2="$v" ;;
            pushed)  [[ "$v" == 1 ]] && m_pushed=1 ;;
            cut)     [[ "$v" == 1 ]] && m_cut=1 ;;
        esac
    done < "$MARKER_FILE"
    log "Marcador pre-recorte encontrado (cierre anormal previo): perfil=${m_profile:--} db=${m_db:--} pl2=${m_pl2:--} cut=${m_cut} — recuperando primero"
    ORIGINAL_PROFILE="$m_profile"; PRE_DB="$m_db"; PRE_PL2="$m_pl2"
    POWER_CUT="$m_cut"
    [[ "$m_pushed" == 1 ]] && FAN_PROFILE_PUSHED=true
    GUARDIAN_STATE="fans-up"
    (( POWER_CUT )) && GUARDIAN_STATE="pl-down"

    # Si ya está frío, restaurar de una vez (a lo sumo al objetivo del perfil);
    # si no, adoptar el estado y dejar que la rampa gradual normal lo resuelva.
    read_temps
    if [[ -n "$CPU_TEMP" && -n "$GPU_TEMP" ]] \
        && (( CPU_CEILING - CPU_TEMP >= RESTORE_MARGIN && GPU_CEILING - GPU_TEMP >= RESTORE_MARGIN )); then
        if restore_power jump "recuperacion-de-arranque"; then
            finish_restore "recuperacion-de-arranque"
        else
            warn_log "No se pudo restaurar del todo; se conserva el marcador y se reintenta en el bucle"
        fi
    else
        log "Temperatura alta o desconocida al arrancar: se adopta el estado previo y se restaura gradualmente"
    fi
    return 0
}

# ------------------------------------------------------------------
# Parada / salida: restaura al objetivo del perfil (salto, no rampa)
# ------------------------------------------------------------------
CLEANED=0
cleanup() {
    set +e
    (( CLEANED )) && return 0
    CLEANED=1
    trap - EXIT
    log "Deteniendo guardián — restaurando configuración de emergencia si aplica"
    NOW="$(date +%s)"
    if [[ "$GUARDIAN_STATE" != "normal" || "$FAN_PROFILE_PUSHED" == true || "$POWER_CUT" == 1 ]]; then
        if restore_power jump "parada-del-servicio"; then
            finish_restore "parada-del-servicio"
        else
            unboost_fans
            warn_log "Restauración incompleta al parar; se conserva el marcador"
        fi
    fi
    log "Guardián detenido limpiamente."
}

# ------------------------------------------------------------------
# Loop principal
# ------------------------------------------------------------------
log "Iniciando guardián térmico CPU/GPU 2.0 [modo=${MODE}] (cpu=${CPU_CEILING}°C, gpu=${GPU_CEILING}°C, warn cpu=${CPU_WARN_TEMP}°C/gpu=${GPU_WARN_TEMP}°C, gracia=${OVER_GRACE}s, recorte_cada=${CUT_INTERVAL}s, restaurar: margen=${RESTORE_MARGIN}°C retención=${RESTORE_HOLD}s, intervalo=${INTERVAL}s, modula_carga=${LOAD_MODULATION}, sim=${DRY})"
[[ "$MODE" == "gaming" ]] && log "MODO GAMING: solo ventiladores, sin recorte de potencia (cero throttling)."
[[ "$DRY" == "1" ]] && log "SIMULACIÓN: no se escribe NINGÚN valor de hardware; solo se registran las decisiones."

# Señales → salida limpia; EXIT cubre además errores inesperados (set -e).
trap cleanup EXIT
trap 'exit 0' SIGTERM SIGINT SIGHUP

printf -v NOW '%(%s)T' -1
startup_recover

while true; do
    printf -v NOW '%(%s)T' -1
    read_temps
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
