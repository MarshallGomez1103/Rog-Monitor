#!/usr/bin/env bash
# Vuelca por KWin (D-Bus) el estado de las ventanas cuyo caption contiene
# "ROG Overlay" (Wayland nativo y XWayland). Imprime lineas
#   KW|caption|x,y WxH|keepAbove|fullScreen|layer|stackIdx|output|resourceClass|noBorder
# Uso: kwin-dump.sh [filtro-de-caption]   (defecto: "ROG Overlay")
set -u
FILTER="${1:-ROG Overlay}"
NAME="rogprobe$$"
JS="$(mktemp "${TMPDIR:-/tmp}/rogprobe-XXXXXX.js")"
cat > "$JS" <<EOF
var order = workspace.stackingOrder;
var list = workspace.windowList();
for (var i = 0; i < list.length; i++) {
  var w = list[i];
  if (w.caption.indexOf("$FILTER") >= 0) {
    var g = w.frameGeometry;
    print("KWPROBE|" + w.caption + "|" + Math.round(g.x) + "," + Math.round(g.y) + " " + Math.round(g.width) + "x" + Math.round(g.height) +
      "|keepAbove=" + w.keepAbove + "|fullScreen=" + w.fullScreen + "|layer=" + w.layer +
      "|stack=" + order.indexOf(w) + "/" + order.length + "|out=" + (w.output ? w.output.name : "?") +
      "|class=" + w.resourceClass + "|wl=" + (w.resourceName !== undefined ? "" : "") + "|noBorder=" + w.noBorder);
  }
}
EOF
SINCE="$(date '+%Y-%m-%d %H:%M:%S')"
ID="$(qdbus org.kde.KWin /Scripting org.kde.kwin.Scripting.loadScript "$JS" "$NAME")"
qdbus org.kde.KWin "/Scripting/Script$ID" org.kde.kwin.Script.run >/dev/null
sleep 0.6
journalctl --user --since "$SINCE" --no-pager -o cat 2>/dev/null | grep 'KWPROBE' | sed 's/^.*KWPROBE|/KW|/'
qdbus org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript "$NAME" >/dev/null
rm -f "$JS"
