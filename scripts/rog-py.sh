#!/usr/bin/bash
# Lanzador de Python AISLADO para código que corre como root.
#
# Uso: rog-py.sh <módulo> [args...]      p. ej. rog-py.sh rog_monitor.power_control state
#
# Se instala en /usr/local/libexec/rog-monitor/ (root:root). `-I` ignora
# PYTHONPATH, el site del usuario y el directorio actual; sys.path se fija a la
# copia de sistema del paquete (/usr/local/lib/rog-monitor, root:root). Así root
# nunca importa código del repo ni del home del usuario.
set -eu
exec /usr/bin/python3 -I -c '
import runpy, sys
sys.path.insert(0, "/usr/local/lib/rog-monitor")
mod = sys.argv[1]
sys.argv = [mod] + sys.argv[2:]
runpy.run_module(mod, run_name="__main__", alter_sys=True)
' "$@"
