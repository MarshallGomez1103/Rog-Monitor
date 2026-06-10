#!/usr/bin/bash
# ROG Monitor installer: creates a venv, installs dependencies and the
# `monitor` command in ~/.local/bin. Run WITHOUT sudo:  bash scripts/install.sh
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="${HOME}/.local/bin"
LAUNCHER="$BIN_DIR/monitor"

if ! command -v python3 >/dev/null; then
    printf 'python3 is required.\n' >&2
    exit 1
fi

if [[ ! -x "$REPO/.venv/bin/python" ]]; then
    printf 'Creating virtualenv...\n'
    python3 -m venv "$REPO/.venv"
fi
"$REPO/.venv/bin/pip" install --quiet --upgrade -r "$REPO/requirements.txt"

mkdir -p "$BIN_DIR"
cat > "$LAUNCHER" <<EOF
#!/bin/bash
# ROG Monitor launcher (installed by scripts/install.sh)
REPO="$REPO"

if [[ -x "\$REPO/.venv/bin/python" ]]; then
    PY="\$REPO/.venv/bin/python"
else
    PY="\$(command -v python3)"
fi

exec env PYTHONPATH="\$REPO/src" "\$PY" -m rog_monitor "\$@"
EOF
chmod +x "$LAUNCHER"

printf 'Installed. Run with:  monitor\n'
case ":$PATH:" in
    *":$BIN_DIR:"*) ;;
    *) printf 'Note: add %s to your PATH.\n' "$BIN_DIR" ;;
esac

printf '\nOptional (sudo): readable CPU power for the Power row:\n'
printf '  sudo bash %s/scripts/enable-cpu-power.sh\n' "$REPO"
