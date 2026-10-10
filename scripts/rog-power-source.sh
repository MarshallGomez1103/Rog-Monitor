#!/usr/bin/bash
set -u
# Root: PATH fijo del sistema (nunca el del usuario).
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

PPD_SERVICE="org.freedesktop.UPower.PowerProfiles"
PPD_PATH="/org/freedesktop/UPower/PowerProfiles"
PPD_INTERFACE="org.freedesktop.UPower.PowerProfiles"
BRIGHTNESS_STATE="/run/rog-power-source-brightness"

log() {
    logger -t rog-power-source -- "$*"
    printf '%s\n' "$*" >&2
}

on_ac_power() {
    local supply

    for supply in /sys/class/power_supply/ADP*/online \
        /sys/class/power_supply/AC*/online; do
        if [[ -r "$supply" ]] && [[ "$(cat "$supply")" == "1" ]]; then
            return 0
        fi
    done

    return 1
}

set_ppd_profile() {
    local profile="$1"

    busctl set-property \
        "$PPD_SERVICE" \
        "$PPD_PATH" \
        "$PPD_INTERFACE" \
        ActiveProfile s "$profile"
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
    fi
}

set_brightness() {
    local mode="$1"
    local device
    local current
    local maximum
    local target

    for device in /sys/class/backlight/*; do
        [[ -r "$device/brightness" && -r "$device/max_brightness" ]] ||
            continue

        current="$(cat "$device/brightness")"
        maximum="$(cat "$device/max_brightness")"

        if [[ "$mode" == "battery" ]]; then
            printf '%s\n' "$current" > "$BRIGHTNESS_STATE"
            target=$((maximum * 30 / 100))
        elif [[ -r "$BRIGHTNESS_STATE" ]]; then
            target="$(cat "$BRIGHTNESS_STATE")"
        else
            target=$((maximum * 80 / 100))
        fi

        (( target < 1 )) && target=1
        (( target > maximum )) && target="$maximum"
        printf '%s\n' "$target" > "$device/brightness"
        break
    done
}

if on_ac_power; then
    set_ppd_profile performance || log "Could not set PPD profile to performance"
    set_brightness ac
    apply_profile_power performance
    log "AC connected: performance, brightness restored, GPU mode unchanged"
else
    set_ppd_profile power-saver || log "Could not set PPD profile to power-saver"
    set_brightness battery
    apply_profile_power power-saver
    log "On battery: power-saver, brightness 30%, GPU mode unchanged"
fi
