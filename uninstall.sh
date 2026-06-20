#!/usr/bin/env bash
# Desinstalador de una línea (atajo de scripts/uninstall.sh).
#   bash uninstall.sh           # conserva configuraciones
#   bash uninstall.sh --purge   # borra también las configuraciones
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$REPO/scripts/uninstall.sh" "$@"
