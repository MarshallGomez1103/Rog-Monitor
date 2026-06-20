#!/usr/bin/bash
# Notificación de escritorio al conectar/desconectar el cargador.
# Corre como servicio de usuario (systemd --user), ver systemd/rog-power-notify.service
set -u

NOTIFY_SEND="/usr/bin/notify-send"

get_state() {
    local supply
    for supply in /sys/class/power_supply/ADP*/online \
        /sys/class/power_supply/AC*/online; do
        if [[ -r "$supply" ]]; then
            cat "$supply"
            return 0
        fi
    done
    printf 'unknown\n'
}

get_profile() {
    busctl --system get-property \
        org.freedesktop.UPower.PowerProfiles \
        /org/freedesktop/UPower/PowerProfiles \
        org.freedesktop.UPower.PowerProfiles \
        ActiveProfile 2>/dev/null | awk -F'"' '{print $2}'
}

notify() {
    local icon="$1" title="$2" body="$3"
    "$NOTIFY_SEND" --app-name="ROG Monitor" --icon="$icon" \
        --urgency=normal "$title" "$body" 2>/dev/null || true
}

last="$(get_state)"

while true; do
    sleep 2
    cur="$(get_state)"
    [[ "$cur" == "$last" ]] && continue

    # rog-power-source (udev) cambia el perfil casi al instante; pequeña espera
    sleep 1
    profile="$(get_profile)"

    if [[ "$cur" == "1" ]]; then
        notify battery-full-charging "Conectado a corriente" \
            "Perfil de energía: ${profile} · Gráficos: Hybrid"
    else
        notify battery-low "Funcionando con batería" \
            "Perfil de energía: ${profile} · Gráficos: Integrated (requiere cerrar sesión)"
    fi

    last="$cur"
done
