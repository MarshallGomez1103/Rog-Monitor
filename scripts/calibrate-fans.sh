#!/usr/bin/bash
set -euo pipefail

# Calibración PWM→RPM de los ventiladores (corre como root vía pkexec).
#
# Detecta cuántos ventiladores expone asus_custom_fan_curve (1, 2, 3, 4…) y
# para cada escalón de PWM espera a que estabilicen y mide las RPM reales.
# Con esa tabla la app puede traducir un cap en RPM al PWM correcto de cada
# ventilador (la relación NO es lineal, por eso un cap calculado con regla de
# tres se pasaba 200-400 RPM).
#
# Salida (stdout, una línea por medición):
#   labels,cpu_fan,gpu_fan,mid_fan
#   pwm,90,2520,2410,2630
#   ...
#   pwm,255,7040,6910,7460
# Dura ~70 s. Al salir restaura el servicio de curvas (que reaplica el perfil).

# Descendente: entre escalones consecutivos el salto es pequeño. OJO: estos
# ventiladores aceleran Y desaceleran lento (medido: la GPU tardó >10 s en
# pasar de reposo a tope), así que NO sirve un sleep fijo — se espera hasta
# que las RPM se estabilicen (delta < 75 RPM entre lecturas de 2 s).
PWM_STEPS=(255 235 210 180 150 120 90)
SETTLE_MAX_POLLS=12

if [[ "$(id -u)" -ne 0 ]]; then
    printf 'This calibration must run as root.\n' >&2
    exit 1
fi

get_hwmon() {
    local expected="$1"
    local dir

    for dir in /sys/class/hwmon/hwmon*; do
        if [[ -r "$dir/name" ]] && [[ "$(cat "$dir/name")" == "$expected" ]]; then
            printf '%s\n' "$dir"
            return 0
        fi
    done

    return 1
}

restore_profile_service() {
    systemctl start rog-profile-sync.service
}

trap restore_profile_service EXIT
systemctl stop rog-profile-sync.service

CURVE_HWMON="$(get_hwmon asus_custom_fan_curve)"
RPM_HWMON="$(get_hwmon asus)"

# Ventiladores disponibles: índices con curva editable. No asumimos 3.
FAN_IDS=()
for fan in 1 2 3 4 5 6; do
    [[ -w "$CURVE_HWMON/pwm${fan}_auto_point1_pwm" ]] && FAN_IDS+=("$fan")
done
if [[ "${#FAN_IDS[@]}" -eq 0 ]]; then
    printf 'No encontré curvas de ventilador editables en %s\n' "$CURVE_HWMON" >&2
    exit 1
fi

labels="labels"
for fan in "${FAN_IDS[@]}"; do
    if [[ -r "$RPM_HWMON/fan${fan}_label" ]]; then
        labels+=",$(cat "$RPM_HWMON/fan${fan}_label")"
    else
        labels+=",fan${fan}"
    fi
done
printf '%s\n' "$labels"

set_all_points() {
    local pwm="$1"
    local fan point
    for fan in "${FAN_IDS[@]}"; do
        for point in 1 2 3 4 5 6 7 8; do
            printf '%s\n' "$pwm" > "$CURVE_HWMON/pwm${fan}_auto_point${point}_pwm"
        done
        printf '1\n' > "$CURVE_HWMON/pwm${fan}_enable"
    done
}

read_rpms() {
    local fan out=""
    for fan in "${FAN_IDS[@]}"; do
        out+="$(cat "$RPM_HWMON/fan${fan}_input" 2>/dev/null || printf '0') "
    done
    printf '%s\n' "$out"
}

# Espera a que TODOS los ventiladores se estabilicen en el escalón actual.
# Exige DOS lecturas estables seguidas: el ventilador de la GPU sube tan
# lento cerca del tope que una sola delta < 75 puede ser una pausa de la
# rampa, no el régimen final (visto en la práctica: "estabilizó" en 6000
# cuando su tope real era ~6800).
wait_settle() {
    local min_wait="${1:-0}"
    local prev="" cur="" i idx delta stable streak=0
    local -a a b
    [[ "$min_wait" -gt 0 ]] && sleep "$min_wait"
    for i in $(seq 1 "$SETTLE_MAX_POLLS"); do
        sleep 2
        cur="$(read_rpms)"
        if [[ -n "$prev" ]]; then
            stable=1
            read -r -a a <<< "$prev"
            read -r -a b <<< "$cur"
            for idx in "${!b[@]}"; do
                delta=$(( b[idx] - a[idx] ))
                (( delta < 0 )) && delta=$(( -delta ))
                (( delta > 75 )) && { stable=0; break; }
            done
            if (( stable )); then
                streak=$((streak + 1))
                (( streak >= 2 )) && return 0
            else
                streak=0
            fi
        fi
        prev="$cur"
    done
    return 0
}

first=1
for pwm in "${PWM_STEPS[@]}"; do
    set_all_points "$pwm"
    # el primer escalón (255) es el salto más grande: espera mínima extra
    wait_settle "$(( first ? 14 : 0 ))"
    first=0
    row="pwm,$pwm"
    for rpm in $(read_rpms); do
        row+=",$rpm"
    done
    printf '%s\n' "$row"
done

restore_profile_service
trap - EXIT
