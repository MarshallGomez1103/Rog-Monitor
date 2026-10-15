#!/usr/bin/env bash
# Vuelca por KWin (D-Bus) el estado de las ventanas cuyo caption contiene
# "ROG Overlay" (Wayland nativo y XWayland). Imprime lineas
#   KW|caption|x,y WxH|keepAbove|fullScreen|layer|stackIdx|output|resourceClass|noBorder
# Uso: kwin-dump.sh [filtro-de-caption|ALL]   (defecto: "ROG Overlay"; ALL = todas)
set -u
FILTER="${1:-ROG Overlay}"
NAME="rogprobe$$"
JS="$(mktemp "${TMPDIR:-/tmp}/rogprobe-XXXXXX.js")"
cat > "$JS" <<EOF
var order = workspace.stackingOrder;
var aw = workspace.activeWindow;
// privacidad: solo se imprime el caption si es de la sonda o de vkcube; de otras ventanas, nada
console.warn("KWPROBE|ACTIVE=" + (aw ? ((aw.caption.indexOf("ROG Overlay") >= 0 || aw.caption.toLowerCase().indexOf("kcube") >= 0) ? aw.caption : "(otra ventana)") : "none"));
var list = workspace.windowList();
for (var i = 0; i < list.length; i++) {
  var w = list[i];
  if ("$FILTER" == "ALL" || w.caption.indexOf("$FILTER") >= 0) {
   try {
    var g = w.frameGeometry;
    console.warn("KWPROBE|" + w.caption + "|" + Math.round(g.x) + "," + Math.round(g.y) + " " + Math.round(g.width) + "x" + Math.round(g.height) +
      "|keepAbove=" + w.keepAbove + "|fullScreen=" + w.fullScreen + "|layer=" + w.layer +
      "|stack=" + order.indexOf(w) + "/" + order.length + "|out=" + (w.output ? w.output.name : "?") +
      "|class=" + w.resourceClass + "|noBorder=" + w.noBorder + "|onAllDesktops=" + w.onAllDesktops + "|skipTaskbar=" + w.skipTaskbar + "|type=" + w.windowType);
   } catch (e) { console.warn("KWPROBE|ERR " + w.caption + " " + e); }
  }
}
EOF
SINCE="$(date '+%Y-%m-%d %H:%M:%S')"
ID="$(qdbus org.kde.KWin /Scripting org.kde.kwin.Scripting.loadScript "$JS" "$NAME")"
qdbus org.kde.KWin "/Scripting/Script${ID}" org.kde.kwin.Script.run >/dev/null
sleep 0.6
journalctl --user --since "$SINCE" --no-pager -o cat 2>/dev/null | grep -a 'KWPROBE' | sed 's/^.*KWPROBE|/KW|/'
qdbus org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript "$NAME" >/dev/null
rm -f "$JS"
