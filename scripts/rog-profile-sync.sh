#!/usr/bin/bash
# -u + pipefail, pero NO -e: es un bucle de servicio y varias rutas dependen de
# códigos de retorno distintos de 0 (p. ej. `sync_once || true`, curvas ausentes);
# con -e un fallo puntual de sysfs mataría el servicio. Los errores se comprueban
# de forma explícita.
set -uo pipefail
# Root: PATH fijo del sistema (nunca el del usuario).
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# ROG platform-profile + fan-curve sync.
#
# Las curvas de ventilador se editan desde la app ROG Monitor y se guardan en
# un JSON del usuario (NO en este script):
#   ~/.config/rog-monitor/fan-curves.json
# Este servicio (root) lee ese JSON en cada cambio de perfil y aplica las
# curvas a /sys/class/hwmon/<asus_custom_fan_curve>. Si el JSON no existe o un
# perfil no es válido, cae a las curvas por defecto de abajo.
#
# El cap de RPM NO va horneado en la curva guardada: se aplica AQUÍ, en el
# momento de escribir al hardware. La curva del usuario queda prístina, así
# subir o quitar el cap desbloquea los ventiladores al instante. El cap en RPM
# se traduce a PWM con la tabla de calibración medida (calibrate-fans.sh);
# sin calibración cae a una regla de tres con max_rpm.
#
# No asume 3 ventiladores: aplica a todos los pwmN con curva editable
# (1=cpu, 2=gpu, 3=mid, 4+=fanN; los extra usan la curva de cpu por defecto).

# Calibración en curso (la escribe calibrate-fans.sh, root, en /run = tmpfs):
# mientras su PID viva este servicio NO toca las curvas; si el PID murió (p. ej.
# SIGKILL, que ningún trap atrapa) el marcador es huérfano y aquí se restauran
# las curvas en la siguiente vuelta (<= 30 s) o al arrancar.
CALIB_MARKER="/run/rog-monitor/calibrating"

PROFILE_FILE="/sys/firmware/acpi/platform_profile"
PPD_SERVICE="org.freedesktop.UPower.PowerProfiles"
PPD_PATH="/org/freedesktop/UPower/PowerProfiles"
PPD_INTERFACE="org.freedesktop.UPower.PowerProfiles"
MAX_FAN_ID=6

log() {
    printf '%s\n' "$*" >&2
}

get_ppd_profile() {
    busctl --system get-property \
        "$PPD_SERVICE" \
        "$PPD_PATH" \
        "$PPD_INTERFACE" \
        ActiveProfile 2>/dev/null | awk -F'"' '{print $2}'
}

get_curve_hwmon() {
    local dir
    local name

    for dir in /sys/class/hwmon/hwmon*; do
        if [[ -r "$dir/name" ]]; then
            IFS= read -r name < "$dir/name"
        else
            continue
        fi
        if [[ "$name" == "asus_custom_fan_curve" ]]; then
            printf '%s\n' "$dir"
            return 0
        fi
    done

    return 1
}

# Localiza el fan-curves.json del usuario (corremos como root, así que $HOME
# no sirve). En Bazzite/ostree el home real es /var/home/<user>.
# Es un archivo que controla un usuario sin privilegios: solo se acepta un
# archivo REGULAR (no symlink, ni FIFO/dispositivo) de <= 256 KiB, en un
# directorio que tampoco sea symlink. El Python de abajo vuelve a comprobarlo
# al abrir (O_NOFOLLOW) para cerrar la carrera comprobar/usar.
MAX_JSON_BYTES=262144
find_curves_json() {
    local f size
    for f in /var/home/*/.config/rog-monitor/fan-curves.json \
             /home/*/.config/rog-monitor/fan-curves.json; do
        [[ -f "$f" && ! -L "$f" && ! -L "${f%/*}" && -r "$f" ]] || continue
        size="$(stat -c %s -- "$f" 2>/dev/null)" || continue
        if [[ "$size" =~ ^[0-9]+$ ]] && (( size <= MAX_JSON_BYTES )); then
            printf '%s\n' "$f"
            return 0
        fi
        log "Ignoring $f: larger than $MAX_JSON_BYTES bytes"
    done
    return 1
}

# ¿Hay una calibración viva? (marcador con PID de un calibrate-fans.sh en marcha)
calibration_running() {
    local pid
    [[ -f "$CALIB_MARKER" && ! -L "$CALIB_MARKER" ]] || return 1
    IFS= read -r pid < "$CALIB_MARKER" || return 1
    [[ "$pid" =~ ^[0-9]+$ && -r "/proc/$pid/cmdline" ]] || return 1
    tr '\0' ' ' < "/proc/$pid/cmdline" | grep -q 'calibrate-fans'
}

# Límites de potencia por perfil: usa SOLO la copia de sistema del paquete
# (instalada por scripts/install-system.sh, root:root) vía el lanzador aislado.
# Nunca busca ni ejecuta código del repo/home del usuario.
ROG_PY=/usr/local/libexec/rog-monitor/rog-py.sh

apply_profile_power() {
    local profile="$1"
    local out

    if [[ ! -x "$ROG_PY" ]]; then
        log "Power limits skipped: $ROG_PY not installed (run scripts/install-system.sh)"
        return 0
    fi

    if out="$("$ROG_PY" rog_monitor.power_control apply-profile "$profile" 2>&1)"; then
        log "Applied $profile power limits"
    else
        log "Could not apply $profile power limits: $out"
        return 1
    fi
}

# Justo tras cambiar platform_profile el firmware responde EBUSY a ppt_* durante unos
# segundos: casi todas las aplicaciones fallaban y no se reintentaban hasta el siguiente
# cambio de perfil. Ahora se reintenta en cada vuelta (≤30 s) hasta POWER_MAX_TRIES.
POWER_MAX_TRIES=5
POWER_TRIES=0
sync_power() {
    local target="$1"
    [[ "${LAST_POWER_PROFILE:-}" != "$target" ]] || return 0
    if apply_profile_power "$target"; then
        LAST_POWER_PROFILE="$target"
        POWER_TRIES=0
        return 0
    fi
    POWER_TRIES=$((POWER_TRIES + 1))
    if (( POWER_TRIES >= POWER_MAX_TRIES )); then
        log "Giving up on $target power limits after $POWER_TRIES tries (until the next profile change)"
        LAST_POWER_PROFILE="$target"
        POWER_TRIES=0
    fi
}

# Clave JSON de cada índice de ventilador del hwmon.
fan_key() {
    case "$1" in
        1) printf 'cpu\n' ;;
        2) printf 'gpu\n' ;;
        3) printf 'mid\n' ;;
        *) printf 'fan%s\n' "$1" ;;
    esac
}

# Curvas por defecto (fallback). performance va casi al tope; balanced queda
# ~80% y quiet ~67%, para que cambiar de perfil SÍ baje las RPM. Formato
# "t1 .. t8|p1 .. p8". Ventiladores extra (fan4+) usan la curva de cpu.
default_curve_for() {
    local profile="$1"
    local key="$2"
    case "$profile:$key" in
        performance:gpu) printf '50 58 64 70 75 79 83 87|46 66 97 127 168 209 242 255\n' ;;
        performance:mid) printf '50 60 68 75 82 88 92 96|46 66 97 127 168 209 242 255\n' ;;
        performance:*)   printf '50 60 68 75 82 88 92 96|46 66 97 127 168 209 242 255\n' ;;
        balanced:gpu)    printf '50 58 64 70 75 79 83 87|33 51 76 107 143 178 209 224\n' ;;
        balanced:mid)    printf '50 60 68 75 82 88 92 96|33 51 76 107 143 178 209 224\n' ;;
        balanced:*)      printf '50 60 68 75 82 88 92 96|33 51 76 107 143 178 209 224\n' ;;
        quiet:gpu)       printf '50 58 64 70 75 79 83 87|20 36 56 82 112 143 168 184\n' ;;
        quiet:mid)       printf '50 60 68 75 82 88 92 96|20 36 56 82 112 143 168 184\n' ;;
        quiet:*)         printf '50 60 68 75 82 88 92 96|20 36 56 82 112 143 168 184\n' ;;
        *) return 1 ;;
    esac
}

# Imprime "t1 .. t8|p1 .. p8" para profile/fan: toma la curva del JSON (o la
# por defecto que recibe), valida y acota (temp 0-110, pwm 0-255) y le aplica
# el cap de RPM traducido a PWM con la calibración. Devuelve 1 si no hay dato
# usable (el caller usa entonces los defaults sin cap).
json_curve() {
    local profile="$1"
    local fan="$2"
    local file="$3"
    local def_temps="$4"
    local def_pwms="$5"

    [[ -n "$file" && -r "$file" ]] || return 1
    /usr/bin/python3 -I - "$file" "$profile" "$fan" "$def_temps" "$def_pwms" <<'PY'
import json, os, stat, sys
path, profile, fan = sys.argv[1], sys.argv[2], sys.argv[3]
temps = [int(x) for x in sys.argv[4].split()]
pwms = [int(x) for x in sys.argv[5].split()]

MAX_JSON = 256 * 1024

def read_user_json(p):
    """JSON de un usuario sin privilegios leído como root: nunca sigue un
    symlink (O_NOFOLLOW), no se cuelga con FIFOs (O_NONBLOCK), solo archivos
    regulares y como mucho 256 KiB."""
    fd = os.open(p, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC)
    with os.fdopen(fd, "rb") as fh:
        st = os.fstat(fh.fileno())
        if not stat.S_ISREG(st.st_mode) or st.st_size > MAX_JSON:
            raise ValueError("not a regular file or too large")
        raw = fh.read(MAX_JSON + 1)
    if len(raw) > MAX_JSON:
        raise ValueError("too large")
    return json.loads(raw)

try:
    data = read_user_json(path)
    if not isinstance(data, dict):
        data = {}
except Exception as exc:
    print(f"fan-curves.json ignored: {exc}", file=sys.stderr)
    data = {}

# Misma regla que validateFanCurve() en desktop/priv.js (si cambias una, cambia
# la otra): 8 puntos, temps enteras estrictamente crecientes en 20..105 °C, PWM
# entero 0..255 y, con calor, nunca ventiladores (casi) parados: el último punto
# y cualquier punto >= 90 °C suben a >= 150. Una estructura inválida se
# DESCARTA (defaults); un PWM bajo el suelo se sube al suelo.
HOT_C, PWM_FLOOR = 90, 150

def num(x):
    if isinstance(x, bool) or not isinstance(x, (int, float)) or x != x:
        raise ValueError("not a number")
    return int(round(x))

def checked_curve(t, p):
    if not isinstance(t, list) or not isinstance(p, list) or len(t) != 8 or len(p) != 8:
        raise ValueError("need 8 points")
    t = [num(x) for x in t]
    p = [num(x) for x in p]
    if any(not 20 <= x <= 105 for x in t) or any(b <= a for a, b in zip(t, t[1:])):
        raise ValueError("temps must be strictly increasing within 20..105")
    if any(not 0 <= x <= 255 for x in p):
        raise ValueError("pwm out of 0..255")
    p = [max(v, PWM_FLOOR) if (i == 7 or t[i] >= HOT_C) else v for i, v in enumerate(p)]
    return t, p

try:
    c = data["profiles"][profile][fan]
    temps, pwms = checked_curve(c["temps"], c["pwms"])
except KeyError:
    pass  # sin curva guardada para este perfil/fan: defaults + cap
except Exception as exc:
    print(f"saved curve {profile}/{fan} rejected, using defaults: {exc}", file=sys.stderr)

def cap_to_pwm(cap, calib, max_rpm):
    """PWM máximo para no pasar de `cap` RPM. Margen 1.5% para quedar EN o
    BAJO el cap (las RPM oscilan ±50 y la interpolación no es exacta)."""
    target = cap * 0.985
    pts = sorted(
        (int(p), int(r))
        for p, r in (calib or [])
        if isinstance(p, (int, float)) and isinstance(r, (int, float)) and r > 0
    )
    if len(pts) >= 2:
        if target >= pts[-1][1]:
            return 255
        prev = (0, 0)
        for p, r in pts:
            if r >= target:
                if r == prev[1]:
                    return p
                frac = (target - prev[1]) / (r - prev[1])
                return int(prev[0] + frac * (p - prev[0]))
            prev = (p, r)
        return pts[-1][0]
    if isinstance(max_rpm, (int, float)) and max_rpm > 0:
        return int(target * 255 / max_rpm)
    return None

# Estimados de fábrica para portátiles ASUS gaming si aún no se corrió calibrate-fans.sh:
# mejor un cap aproximado que ignorarlo en silencio.
FALLBACK_MAX = {"cpu": 7000, "gpu": 6900, "mid": 7500}

# Override de Gaming: si el guardián térmico está en modo "gaming" y activo,
# permitir un tope más alto (data["gaming_cap_rpm"]) para refrigerar a tope sin
# recorte de potencia. Desacoplado: solo LEE el estado que el guardián publica.
gaming_cap = None
try:
    gc = data.get("gaming_cap_rpm")
    if gc and float(gc) > 0:
        import glob, time
        for sp in (glob.glob("/var/home/*/.local/share/rog-monitor/thermal-guardian-state.json")
                   + glob.glob("/home/*/.local/share/rog-monitor/thermal-guardian-state.json")):
            try:
                st = read_user_json(sp)
            except Exception:
                continue
            if not isinstance(st, dict):
                continue
            if st.get("guardian_mode") == "gaming" and (time.time() - float(st.get("updated", 0)) < 30):
                gaming_cap = float(gc)
                break
except Exception:
    gaming_cap = None

profile_cap = (((data.get("profiles") or {}).get(profile) or {}).get("cap_rpm") or {}).get(fan)
cap = gaming_cap or profile_cap or (data.get("cap_rpm") or {}).get(fan)
if isinstance(cap, (int, float)) and cap > 0:
    limit = cap_to_pwm(
        cap,
        (data.get("calibration") or {}).get(fan),
        (data.get("max_rpm") or {}).get(fan) or FALLBACK_MAX.get(fan, 7000),
    )
    if limit is not None:
        limit = max(0, min(255, limit))
        pwms = [min(v, limit) for v in pwms]

print(" ".join(map(str, temps)) + "|" + " ".join(map(str, pwms)))
PY
}

set_curve() {
    local hwmon="$1"
    local fan="$2"
    local temperatures="$3"
    local pwm_values="$4"
    local -a temps
    local -a pwms
    local index
    local point
    local current

    read -r -a temps <<< "$temperatures"
    read -r -a pwms <<< "$pwm_values"

    if [[ "${#temps[@]}" -ne 8 || "${#pwms[@]}" -ne 8 ]]; then
        log "Invalid fan curve for fan $fan"
        return 1
    fi

    for index in "${!temps[@]}"; do
        point=$((index + 1))
        printf '%s\n' "${temps[$index]}" \
            > "$hwmon/pwm${fan}_auto_point${point}_temp" || return 1
        printf '%s\n' "${pwms[$index]}" \
            > "$hwmon/pwm${fan}_auto_point${point}_pwm" || return 1
    done

    # ASUS custom curves use 1=enabled and 2=disabled. Un EINVAL aquí suele ser asusd
    # escribiendo la misma curva a la vez (cambio de perfil): se reintenta una vez.
    printf '1\n' > "$hwmon/pwm${fan}_enable" 2>/dev/null && return 0
    sleep "${CURVE_RETRY_S:-0.5}"
    printf '1\n' > "$hwmon/pwm${fan}_enable" || return 1
}

# ¿La curva aplicada en hardware coincide con la esperada? Compara los 8 puntos
# (temperatura exacta, pwm ±2 por el redondeo a % del driver). Antes solo miraba
# el punto 8 (donde vive el cap): un cambio en la parte baja de la curva —o asusd
# pisando solo esos puntos— pasaba desapercibido hasta el siguiente cambio de perfil.
curves_match() {
    local hwmon="$1"
    local fan="$2"
    local temp_values="$3"
    local pwm_values="$4"
    local -a temps pwms
    local i t p

    read -r -a temps <<< "$temp_values"
    read -r -a pwms <<< "$pwm_values"
    for i in 0 1 2 3 4 5 6 7; do
        IFS= read -r t < "$hwmon/pwm${fan}_auto_point$((i + 1))_temp" || return 1
        IFS= read -r p < "$hwmon/pwm${fan}_auto_point$((i + 1))_pwm" || return 1
        [[ "$t" == "${temps[$i]}" ]] || return 1
        (( p - pwms[i] <= 2 && pwms[i] - p <= 2 )) || return 1
    done
}

# apply_curves <profile> <hwmon> [check-only]
# En modo check-only no escribe: devuelve 0 si el hardware ya tiene las
# curvas esperadas (tope del punto 8) y 1 si alguien las pisó.
apply_curves() {
    local profile="$1"
    local hwmon="$2"
    local mode="${3:-write}"
    local json fan key def temps pwms out
    local applied=0

    case "$profile" in
        performance|balanced|quiet) ;;
        *)
            log "Unsupported platform profile: $profile"
            return 1
            ;;
    esac

    json="$(find_curves_json || true)"
    for fan in $(seq 1 "$MAX_FAN_ID"); do
        [[ -w "$hwmon/pwm${fan}_auto_point1_pwm" ]] || continue
        key="$(fan_key "$fan")"
        def="$(default_curve_for "$profile" "$key" \
            || default_curve_for "$profile" cpu)"
        temps="${def%%|*}"
        pwms="${def##*|}"
        if [[ -n "$json" ]] \
            && out="$(json_curve "$profile" "$key" "$json" "$temps" "$pwms")"; then
            temps="${out%%|*}"
            pwms="${out##*|}"
        fi
        if [[ "$mode" == "check-only" ]]; then
            curves_match "$hwmon" "$fan" "$temps" "$pwms" || return 1
            applied=$((applied + 1))
            continue
        fi
        set_curve "$hwmon" "$fan" "$temps" "$pwms" && applied=$((applied + 1))
    done

    [[ "$applied" -gt 0 ]] || return 1
    [[ "$mode" == "check-only" ]] ||
        log "Applied $profile fan curves to $applied fans${json:+ (override/cap: $json)}"
}

curves_enabled() {
    local hwmon="$1"
    local fan
    local state
    local checked=0

    for fan in $(seq 1 "$MAX_FAN_ID"); do
        [[ -r "$hwmon/pwm${fan}_enable" ]] || continue
        IFS= read -r state < "$hwmon/pwm${fan}_enable" || return 1
        [[ "$state" == "1" ]] || return 1
        checked=$((checked + 1))
    done

    [[ "$checked" -gt 0 ]]
}

# --- Ventiladores pegados arriba (bug reportado 2026-10-12) ---------------------
# El EC puede dejar ventiladores muy por encima de lo que pide la curva aplicada cuando
# la máquina se enfría (performance tras jugar: 6000 rpm con la CPU a 60-74 °C; al cambiar
# de perfil bajaban al instante porque se reescribía la curva). Regla del propietario:
# frío → bajan todos, caliente → suben todos. Cada vuelta (≤30 s) se compara cada
# ventilador con lo que pide SU curva a la temperatura más caliente (paquete CPU o la
# GPU, sin despertarla) pasado a rpm con la calibración medida. Si alguno va más de
# STUCK_MARGIN rpm (o un 25 %, lo mayor) por encima durante ≥60 s, se reescriben TODAS
# las curvas del perfil (enable=2 un segundo —el driver reescribe el modo térmico, igual
# que cambiar de perfil a mano— y otra vez la curva + enable=1). Tras re-aplicar, espera
# 3 min y deja en el journal si funcionó. Medido en este equipo: el EC sube/baja ~60 rpm/s,
# así que 60 s cubren de sobra la rampa normal tras una carga.
# Antes solo miraba ≥4500 rpm: en quiet (cap 4500) y balanced nunca saltaba.
STUCK_MARGIN=900
STUCK_MIN_RPM=3000
STUCK_HOLD_S=60
STUCK_COOLDOWN_S=180
STUCK_VERIFY=0   # 1 = la vuelta siguiente a un re-aplicado comprueba si bajaron
STUCK_SINCE=""   # vacío = sin atasco en curso
STUCK_LAST_FIX=0

hwmon_by_name() {            # <nombre> [raíz sysfs] -> dir del hwmon
    local dir name
    for dir in "${2:-}"/sys/class/hwmon/hwmon*; do
        [[ -r "$dir/name" ]] || continue
        IFS= read -r name < "$dir/name"
        [[ "$name" == "$1" ]] && { printf '%s\n' "$dir"; return 0; }
    done
    return 1
}

gpu_smi_temp() {
    timeout 3 nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader,nounits 2>/dev/null | head -1
}

# Temperatura de la dGPU NVIDIA en °C sin despertarla: suspendida (runtime PM) = 0 (fría).
gpu_temp() {
    local dev vendor class st t
    for dev in "${ROG_SYSFS_ROOT:-}"/sys/bus/pci/devices/*; do
        IFS= read -r vendor < "$dev/vendor" 2>/dev/null || continue
        IFS= read -r class < "$dev/class" 2>/dev/null || continue
        [[ "$vendor" == 0x10de && "$class" == 0x03* ]] || continue
        IFS= read -r st < "$dev/power/runtime_status" 2>/dev/null || st=active
        [[ "$st" == suspended ]] && { printf '0\n'; return 0; }
        t="$(gpu_smi_temp)"
        [[ "$t" =~ ^[0-9]+$ ]] && { printf '%s\n' "$t"; return 0; }
        return 1
    done
    printf '0\n'   # sin dGPU NVIDIA: nada que la caliente
}

# PWM que pide la curva aplicada en <hwmon> para el ventilador <fan> a <temp> °C (interpolado).
curve_pwm_at() {
    local hwmon="$1" fan="$2" temp="$3" i t p pts=""
    for i in 1 2 3 4 5 6 7 8; do
        IFS= read -r t < "$hwmon/pwm${fan}_auto_point${i}_temp" || return 1
        IFS= read -r p < "$hwmon/pwm${fan}_auto_point${i}_pwm" || return 1
        pts+="$t $p "
    done
    awk -v T="$temp" -v pts="$pts" 'BEGIN{n=split(pts,a," ");
        if (T<=a[1]) {print a[2]; exit} for(i=1;i<n-1;i+=2){t0=a[i];p0=a[i+1];t1=a[i+2];p1=a[i+3];
        if (T<=t1) {print int(p0+(p1-p0)*(T-t0)/(t1>t0?t1-t0:1)); exit}} print a[n]}'
}

# rpm esperadas para <fan_key> a <pwm> según la calibración de fan-curves.json
# (pares [pwm, rpm] medidos por calibrate-fans.sh); sin calibración, regla de tres con max_rpm.
expected_rpm() {
    local key="$1" pwm="$2" json="${3:-}"
    /usr/bin/python3 -I - "$key" "$pwm" "$json" <<'PY'
import json, os, stat, sys
key, pwm, path = sys.argv[1], int(sys.argv[2]), sys.argv[3]
data = {}
if path:
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC)
        with os.fdopen(fd, "rb") as fh:
            st = os.fstat(fh.fileno())
            if stat.S_ISREG(st.st_mode) and st.st_size <= 256 * 1024:
                data = json.loads(fh.read(256 * 1024 + 1)) or {}
    except Exception:
        data = {}
pts = sorted((int(p), int(r)) for p, r in ((data.get("calibration") or {}).get(key) or [])
             if isinstance(p, (int, float)) and isinstance(r, (int, float)))
if pts:
    if pwm <= pts[0][0]:
        print(int(pts[0][1] * pwm / max(pts[0][0], 1)))
    else:
        for (p0, r0), (p1, r1) in zip(pts, pts[1:]):
            if pwm <= p1:
                print(int(r0 + (r1 - r0) * (pwm - p0) / max(p1 - p0, 1)))
                break
        else:
            print(pts[-1][1])
else:
    mx = (data.get("max_rpm") or {}).get(key) or 7000
    print(int(pwm * mx / 255))
PY
}

# 0 si algún ventilador está pegado: <curve_hwmon> <asus_hwmon> <cpu °C> <gpu °C> [json]
fans_stuck_now() {
    local curve="$1" asus="$2" cpu_t="$3" gpu_t="$4" json="${5:-}" fan rpm want exp temp key margin
    for fan in 1 2 3; do
        [[ -r "$asus/fan${fan}_input" ]] || continue
        IFS= read -r rpm < "$asus/fan${fan}_input" || continue
        (( rpm >= STUCK_MIN_RPM )) || continue
        key="$(fan_key "$fan")"
        # Cada ventilador contra SU curva a la temperatura MÁS caliente (CPU o GPU): los
        # tres comparten disipador y el EC sube el de la GPU con la CPU caliente (medido).
        # Frío → todos bajan; caliente → todos suben. Conservador: nunca acusa a un
        # ventilador que gira lo que pide el componente caliente.
        temp=$(( cpu_t > gpu_t ? cpu_t : gpu_t ))
        want="$(curve_pwm_at "$curve" "$fan" "$temp")" || continue
        exp="$(expected_rpm "$key" "$want" "$json")" || continue
        margin=$(( exp / 4 > STUCK_MARGIN ? exp / 4 : STUCK_MARGIN ))
        if (( rpm > exp + margin )); then
            log "Fan $key stuck high: ${rpm} rpm at ${temp} °C (curve asks pwm $want ≈ ${exp} rpm)"
            return 0
        fi
    done
    return 1
}

# Llamado en cada vuelta: re-aplica las curvas si el atasco dura ≥ STUCK_HOLD_S.
check_stuck_fans() {
    local target="$1" now pkg asus fan cpu_t gpu_t
    now="${STUCK_NOW:-$(date +%s)}"
    pkg="$(hwmon_by_name coretemp "${ROG_SYSFS_ROOT:-}")" || return 0
    asus="$(hwmon_by_name asus "${ROG_SYSFS_ROOT:-}")" || return 0
    IFS= read -r cpu_t < "$pkg/temp1_input" 2>/dev/null || return 0
    cpu_t=$((cpu_t / 1000))
    gpu_t="$(gpu_temp)" || gpu_t=100   # sin lectura de GPU: no acusar a su ventilador
    if ! fans_stuck_now "$CURVE_HWMON" "$asus" "$cpu_t" "$gpu_t" "$(find_curves_json || true)"; then
        (( STUCK_VERIFY )) && log "Fans back on their curve after re-apply"
        STUCK_VERIFY=0
        STUCK_SINCE=""
        return 0
    fi
    if (( STUCK_VERIFY )); then
        log "Fans still high right after re-apply (EC ramping down or ignoring the curve)"
        STUCK_VERIFY=0
    fi
    (( now - STUCK_LAST_FIX >= STUCK_COOLDOWN_S )) || return 0
    if [[ -z "$STUCK_SINCE" ]]; then
        STUCK_SINCE="$now"
        return 0
    fi
    (( now - STUCK_SINCE >= STUCK_HOLD_S )) || return 0
    log "Fans stuck high for $((now - STUCK_SINCE)) s (CPU ${cpu_t} °C, GPU ${gpu_t} °C): re-applying $target fan curves"
    for fan in $(seq 1 "$MAX_FAN_ID"); do
        [[ -w "$CURVE_HWMON/pwm${fan}_enable" ]] && printf '2\n' > "$CURVE_HWMON/pwm${fan}_enable"
    done
    sleep "${STUCK_TOGGLE_S:-1}"
    apply_curves "$target" "$CURVE_HWMON"
    STUCK_SINCE=""
    STUCK_LAST_FIX="$now"
    STUCK_VERIFY=1
}

sync_once() {
    local ppd_profile
    local target
    local current
    local profile_changed=0

    # Calibración en curso: no tocar las curvas (calibrate-fans.sh las fija).
    calibration_running && return 0
    if [[ -e "$CALIB_MARKER" || -L "$CALIB_MARKER" ]]; then
        # Marcador huérfano (calibrate-fans.sh murió sin limpiar, p. ej. SIGKILL):
        # los ventiladores pueden haber quedado a PWM fijo => forzar re-aplicar.
        rm -f -- "$CALIB_MARKER"
        LAST_PROFILE=""
        log "Stale calibration marker removed: restoring fan curves"
    fi

    ppd_profile="$(get_ppd_profile)"
    case "$ppd_profile" in
        power-saver) target="quiet" ;;
        balanced) target="balanced" ;;
        performance) target="performance" ;;
        *) return 1 ;;
    esac

    IFS= read -r current < "$PROFILE_FILE" || return 1
    if [[ "$current" != "$target" ]]; then
        printf '%s\n' "$target" > "$PROFILE_FILE"
        sleep 0.3
        profile_changed=1
        log "Mapped PPD $ppd_profile to ASUS $target"
    fi

    sync_power "$target"

    # Reaplica si cambió el perfil, si las curvas quedaron deshabilitadas o si
    # alguien (firmware/asusd al cambiar de perfil) pisó los valores — esto
    # protege el cap durante el juego, en ≤30 s por iteración del loop.
    if [[ "$profile_changed" -eq 1 ]] ||
        [[ "${LAST_PROFILE:-}" != "$target" ]] ||
        ! curves_enabled "$CURVE_HWMON" ||
        ! apply_curves "$target" "$CURVE_HWMON" check-only; then
        apply_curves "$target" "$CURVE_HWMON" || return 1
    else
        check_stuck_fans "$target"
    fi

    LAST_PROFILE="$target"
}

# Importable desde tests (`source`): solo definiciones, sin bucle ni lecturas de /sys.
[[ "${BASH_SOURCE[0]}" == "$0" ]] || return 0

# --defaults <perfil>: imprime las curvas por defecto como JSON (sin root).
# La app lo usa para mostrar la misma base que aplicaría el servicio.
if [[ "${1:-}" == "--defaults" ]]; then
    profile="${2:-performance}"
    out="{"
    sep=""
    for key in cpu gpu mid; do
        def="$(default_curve_for "$profile" "$key")" || continue
        temps="${def%%|*}"
        pwms="${def##*|}"
        out+="$sep\"$key\":{\"temps\":[${temps// /,}],\"pwms\":[${pwms// /,}]}"
        sep=","
    done
    printf '%s}\n' "$out"
    exit 0
fi

CURVE_HWMON="$(get_curve_hwmon)"

if [[ "${1:-}" == "--once" ]]; then
    sync_once
    exit $?
fi

# SIGHUP fuerza re-aplicar (la app lo manda tras guardar el JSON, sin reiniciar).
REAPPLY=0
trap 'REAPPLY=1' HUP

LAST_PROFILE=""
LAST_POWER_PROFILE=""
while true; do
    if [[ "$REAPPLY" -eq 1 ]]; then
        LAST_PROFILE=""
        REAPPLY=0
    fi
    sync_once || true
    busctl --system --timeout=30s wait \
        "$PPD_PATH" \
        org.freedesktop.DBus.Properties \
        PropertiesChanged >/dev/null 2>&1 || true
done
