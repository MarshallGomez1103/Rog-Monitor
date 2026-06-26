#!/usr/bin/bash
# Launch the ROG Monitor desktop app.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="$HOME/.local/bin:$HOME/.linuxbrew/bin:$HOME/.linuxbrew/sbin:/home/linuxbrew/.linuxbrew/bin:/home/linuxbrew/.linuxbrew/sbin:/usr/local/bin:/usr/local/sbin:/usr/bin:/usr/sbin:/bin:/sbin:${PATH:-}"

if [[ ! -d "$DIR/node_modules" ]]; then
    printf 'Installing desktop dependencies (first run)...\n'
    (cd "$DIR" && npm install --no-audit --no-fund)
fi

# --class/--name make the window match rog-monitor.desktop (taskbar icon/name)
# ponytail: exec the real electron binary, not the node .bin shim — the shim is a node
# process that just spawns electron and idles holding ~45MB. The packaged AppImage already
# launches the binary directly; this makes dev match it. Falls back to the shim if the
# electron layout ever changes.
BIN="$DIR/node_modules/electron/dist/electron"
[[ -x "$BIN" ]] || BIN="$DIR/node_modules/.bin/electron"
exec "$BIN" "$DIR" --class=rog-monitor --name=rog-monitor "$@"
