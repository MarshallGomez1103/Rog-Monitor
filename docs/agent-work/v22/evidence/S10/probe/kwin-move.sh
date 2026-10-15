#!/usr/bin/env bash
# Envia por KWin la ventana cuyo caption contiene $1 a la salida (monitor) $2
# (p. ej. HDMI-A-3). Sirve para colocar la ventana fullscreen Wayland en el
# monitor deseado (en Wayland nativo la app no puede elegirlo).
set -u
FILTER="${1:?caption}"; OUT="${2:?salida}"
NAME="rogprobemove$$"
JS="$(mktemp "${TMPDIR:-/tmp}/rogprobe-mv-XXXXXX.js")"
cat > "$JS" <<EOF
var outs = workspace.screens;
var list = workspace.windowList();
for (var i = 0; i < list.length; i++) {
  if (list[i].caption.indexOf("$FILTER") >= 0) {
    for (var j = 0; j < outs.length; j++) {
      if (outs[j].name == "$OUT") { workspace.sendClientToScreen(list[i], outs[j]); }
    }
  }
}
EOF
ID="$(qdbus org.kde.KWin /Scripting org.kde.kwin.Scripting.loadScript "$JS" "$NAME")"
qdbus org.kde.KWin "/Scripting/Script${ID}" org.kde.kwin.Script.run >/dev/null
sleep 1
qdbus org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript "$NAME" >/dev/null
rm -f "$JS"
