#!/usr/bin/env bash
# Conjunto de casos "encima de pantalla completa" usado en la ficha F6-01/F6-02.
# Uso: ELECTRON=/ruta/electron ./run-fullscreen.sh > fullscreen-raw.txt
# Nota: durante unos segundos aparece una ventana fullscreen azul en un monitor.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Wayland nativo: overlay y fullscreen nativos (fullscreen en HDMI-A-3 al estar activo ese monitor)
NO_ACTIVATE=1 "$HERE/fs-case.sh" wayland 1 1
FS_OUTPUT=HDMI-A-3 OV_OUTPUT=HDMI-A-3 "$HERE/fs-case.sh" wayland 1 1
# XWayland: overlay x11 sobre fullscreen x11, en cada monitor
"$HERE/fs-case.sh" x11 0 0
"$HERE/fs-case.sh" x11 1 1
# XWayland: overlay x11 sobre fullscreen Wayland nativo (juego Wayland nativo)
FS_MODE=wayland FS_OUTPUT=HDMI-A-3 "$HERE/fs-case.sh" x11 1 1
# MangoHud (dentro del juego), app Vulkan de demostracion vkcube
"$HERE/mango-case.sh" top-right xcb
"$HERE/mango-case.sh" bottom-left xcb
"$HERE/mango-case.sh" top-right wayland
