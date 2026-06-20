#!/usr/bin/bash
set -u

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
