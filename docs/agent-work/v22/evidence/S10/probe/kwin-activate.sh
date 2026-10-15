#!/usr/bin/env bash
# Activa (da foco) por KWin a la ventana cuyo caption contiene $1, como si el
# juego fuese la ventana en primer plano. Solo para la prueba de apilado.
set -u
FILTER="${1:?caption}"
NAME="rogprobeact$$"
JS="$(mktemp "${TMPDIR:-/tmp}/rogprobe-act-XXXXXX.js")"
cat > "$JS" <<EOF
var list = workspace.windowList();
for (var i = 0; i < list.length; i++) {
  if (list[i].caption.indexOf("$FILTER") >= 0) { workspace.activeWindow = list[i]; }
}
EOF
ID="$(qdbus org.kde.KWin /Scripting org.kde.kwin.Scripting.loadScript "$JS" "$NAME")"
qdbus org.kde.KWin "/Scripting/Script${ID}" org.kde.kwin.Script.run >/dev/null
sleep 1
qdbus org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript "$NAME" >/dev/null
rm -f "$JS"
