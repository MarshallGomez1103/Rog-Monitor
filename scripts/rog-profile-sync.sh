#!/usr/bin/bash
set -u

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
find_curves_json() {
    local f
    for f in /var/home/*/.config/rog-monitor/fan-curves.json \
             /home/*/.config/rog-monitor/fan-curves.json; do
        [[ -r "$f" ]] && { printf '%s\n' "$f"; return 0; }
    done
    return 1
}

find_rog_monitor_repo() {
    local repo

    for repo in "${ROG_MONITOR_REPO:-}" \
        /var/home/*/MyFiles/Dev/Rog-Monitor \
        /home/*/MyFiles/Dev/Rog-Monitor \
        /var/home/*/Rog-Monitor \
        /home/*/Rog-Monitor; do
        [[ -n "$repo" && -r "$repo/src/rog_monitor/power_control.py" ]] ||
            continue
        printf '%s\n' "$repo"
        return 0
    done

    return 1
}

apply_profile_power() {
    local profile="$1"
    local repo
    local py
    local out

    repo="$(find_rog_monitor_repo || true)"
    if [[ -z "$repo" ]]; then
        log "Power limits skipped: ROG Monitor repo not found"
        return 0
    fi

    if [[ -x "$repo/.venv/bin/python" ]]; then
        py="$repo/.venv/bin/python"
    else
        py="$(command -v python3 || true)"
    fi
    if [[ -z "$py" ]]; then
        log "Power limits skipped: python3 not found"
        return 0
    fi

    if out="$(PYTHONPATH="$repo/src" "$py" -m rog_monitor.power_control apply-profile "$profile" 2>&1)"; then
        log "Applied $profile power limits"
    else
        log "Could not apply $profile power limits: $out"
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
        performance:gpu) printf '30 50 60 65 72 76 80 83|26 38 71 107 158 204 250 250\n' ;;
        performance:mid) printf '30 50 60 70 80 85 90 95|26 41 66 107 158 204 247 247\n' ;;
        performance:*)   printf '30 50 60 70 80 85 90 95|31 46 69 115 166 207 247 247\n' ;;
        balanced:gpu)    printf '30 50 60 65 72 76 80 83|18 30 56 92 133 168 200 205\n' ;;
        balanced:mid)    printf '30 50 60 70 80 85 90 95|18 33 56 92 133 168 200 205\n' ;;
        balanced:*)      printf '30 50 60 70 80 85 90 95|20 36 56 92 138 173 205 205\n' ;;
        quiet:gpu)       printf '30 50 60 65 72 76 80 83|13 23 43 66 99 128 160 170\n' ;;
        quiet:mid)       printf '30 50 60 70 80 85 90 95|13 26 46 72 105 135 165 170\n' ;;
        quiet:*)         printf '30 50 60 70 80 85 90 95|15 28 46 72 105 135 165 170\n' ;;
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
    python3 - "$file" "$profile" "$fan" "$def_temps" "$def_pwms" <<'PY' 2>/dev/null
import json, sys
path, profile, fan = sys.argv[1], sys.argv[2], sys.argv[3]
temps = [int(x) for x in sys.argv[4].split()]
pwms = [int(x) for x in sys.argv[5].split()]
try:
    data = json.load(open(path))
except Exception:
    data = {}

try:
    c = data["profiles"][profile][fan]
    t, p = c["temps"], c["pwms"]
    if len(t) == 8 and len(p) == 8:
        temps = [max(0, min(110, int(round(float(x))))) for x in t]
        pwms = [max(0, min(255, int(round(float(x))))) for x in p]
except Exception:
    pass  # sin curva guardada para este perfil/fan: defaults + cap

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

profile_cap = (((data.get("profiles") or {}).get(profile) or {}).get("cap_rpm") or {}).get(fan)
cap = profile_cap or (data.get("cap_rpm") or {}).get(fan)
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
            > "$hwmon/pwm${fan}_auto_point${point}_temp"
        printf '%s\n' "${pwms[$index]}" \
            > "$hwmon/pwm${fan}_auto_point${point}_pwm"
    done

    # ASUS custom curves use 1=enabled and 2=disabled.
    printf '1\n' > "$hwmon/pwm${fan}_enable"
}

# ¿La curva aplicada en hardware coincide con la esperada? Mira el punto 8
# (el tope, donde vive el cap) de cada ventilador. Detecta cuando el firmware
# o asusd resetean las curvas al cambiar de perfil sin que cambie el PPD.
curves_match() {
    local hwmon="$1"
    local fan="$2"
    local pwm_values="$3"
    local -a pwms
    local current

    read -r -a pwms <<< "$pwm_values"
    IFS= read -r current < "$hwmon/pwm${fan}_auto_point8_pwm" || return 1
    [[ "$current" == "${pwms[7]}" ]]
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
            curves_match "$hwmon" "$fan" "$pwms" || return 1
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

sync_once() {
    local ppd_profile
    local target
    local current
    local profile_changed=0

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

    if [[ "${LAST_POWER_PROFILE:-}" != "$target" ]]; then
        apply_profile_power "$target"
        LAST_POWER_PROFILE="$target"
    fi

    # Reaplica si cambió el perfil, si las curvas quedaron deshabilitadas o si
    # alguien (firmware/asusd al cambiar de perfil) pisó los valores — esto
    # protege el cap durante el juego, en ≤30 s por iteración del loop.
    if [[ "$profile_changed" -eq 1 ]] ||
        [[ "${LAST_PROFILE:-}" != "$target" ]] ||
        ! curves_enabled "$CURVE_HWMON" ||
        ! apply_curves "$target" "$CURVE_HWMON" check-only; then
        apply_curves "$target" "$CURVE_HWMON" || return 1
    fi

    LAST_PROFILE="$target"
}

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
