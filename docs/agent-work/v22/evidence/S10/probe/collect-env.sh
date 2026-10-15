#!/usr/bin/env bash
# Recoge el entorno relevante (sin datos personales) para la ficha F6-01/F6-02.
# Uso: ELECTRON=/ruta/electron ./collect-env.sh > env-raw.txt
echo "## sesion"; echo "XDG_SESSION_TYPE=${XDG_SESSION_TYPE:-} XDG_CURRENT_DESKTOP=${XDG_CURRENT_DESKTOP:-} DISPLAY=${DISPLAY:-} WAYLAND_DISPLAY=${WAYLAND_DISPLAY:-}"
echo "## versiones"
echo "electron: $("${ELECTRON:?}" --version 2>/dev/null)"
echo "kwin_wayland: $(kwin_wayland --version 2>/dev/null)"
echo "mangohud: $(mangohud --version 2>/dev/null)"; echo "vkcube: $(command -v vkcube)"
echo "## kscreen-doctor (salidas)"
kscreen-doctor -o 2>/dev/null | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^Output|Geometry|Scale|enabled|priority"
echo "## xrandr --listmonitors (espacio de coordenadas de XWayland)"; xrandr --listmonitors
echo "## protocolos Wayland relevantes (wayland-info)"
wayland-info 2>/dev/null | grep -E "interface: '(zwlr_layer_shell_v1|xdg_wm_base|org_kde_plasma_shell|wp_fractional_scale_manager_v1|zxdg_output_manager_v1)'" | sed "s/, name.*//"
echo "## LayerShellQt instalado"; ls /usr/lib64 | grep -i layershell | head -2
