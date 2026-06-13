# Contribuir a ROG Monitor

¡Gracias por tu interés! ROG Monitor es un monitor y centro de control de
hardware para portátiles ASUS ROG en Linux, sin telemetría y sin depender de la
nube.

## Reglas del proyecto (importantes)

- **Sin telemetría ni red**, salvo el botón de actualizar (git) y el de reportar
  error (abre GitHub). Nada de analytics.
- **Español primero** en la interfaz (i18n es/en en `src/rog_monitor/i18n.py`).
- **No dañar el equipo:** los cambios de sistema (root) van por `pkexec` desde la
  app o por un script que el usuario ejecuta. El control de poder se recorta a
  los mín/máx del firmware **dos veces** y exige consentimiento.
- **Identidad visual propia:** que no parezca "hecha por IA". Esquinas cortadas,
  placas numeradas inclinadas, paletas propias. Nada de tarjetas redondeadas
  genéricas.
- **Rutas genéricas** en docs y código (nada de `/home/<usuario>` hardcodeado).
- **Archivar, nunca borrar** archivos preexistentes.

## Entorno y pruebas

```bash
# Núcleo Python
bash scripts/install.sh        # venv + deps
PYTHONPATH=src python3 -m rog_monitor --json    # un snapshot JSON
PYTHONPATH=src python3 -m rog_monitor           # TUI

# App de escritorio (Electron)
bash scripts/install-desktop.sh
```

Antes de abrir un PR, comprueba localmente lo que corre la CI:

```bash
python3 -m py_compile src/rog_monitor/*.py
for f in desktop/main.js desktop/preload.js desktop/renderer/*.js; do node --check "$f"; done
python3 -c "import json; json.load(open('src/rog_monitor/device_profiles.json'))"
PYTHONPATH=src python3 -m rog_monitor --json | python3 -m json.tool > /dev/null && echo "JSON OK"
```

## Agregar tu portátil

Mira [`docs/supported-devices.md`](docs/supported-devices.md). En resumen: añade
una entrada a `src/rog_monitor/device_profiles.json` con los rangos seguros de
tu firmware (o de Armoury Crate) y abre un PR, o usa la plantilla de issue
**Solicitud de dispositivo**.

## Estilo

- Python: estándar de la librería, sin dependencias nuevas salvo necesidad real.
- JS del renderer: archivos por feature, suscriptores propios de
  `window.rog.onStats` (no reescribir `update()`); CSS por feature usando las
  variables de tema (`--accent`, `--panel`, etc.).
