# ROG Monitor — guía para agentes (Claude, Codex, Gemini…)

**Memoria compartida del proyecto.** Todo agente que trabaje aquí debe leer
este archivo y `docs/HANDOFF.md` ANTES de tocar código, y **actualizar
HANDOFF.md al terminar su sesión** (qué hizo, qué queda pendiente, decisiones).

## Reglas de oro (del dueño, Marshall)

1. **NUNCA hacer `git push`.** Solo commit; Marshall revisa y pushea él mismo.
2. No dañar el computador: cambios de sistema (root) se hacen vía pkexec desde
   la app o pidiéndole a Marshall ejecutar el script (no tiene sudo sin clave).
3. Sin telemetría de ningún tipo. La única red permitida: botón actualizar
   (git) y botón reportar error (abre GitHub en el navegador).
4. Mantener TUI y app de escritorio a la par: cada feature de datos debe verse
   en ambas. La UI es en español primero (i18n es/en en `src/rog_monitor/i18n.py`).
5. Rutas genéricas en docs y tutoriales (nada de /home/marshall hardcodeado;
   el repo de scripts del sistema se resuelve con `~/Rog-Monitor-Scripts` o
   `$ROG_SCRIPTS_DIR`).
6. Archivar, nunca borrar archivos preexistentes.
7. Diseño de la app: que NO parezca hecha por una IA — paletas propias
   (Magma/Nébula/Océano/Glaciar/Reactor/Grafito), tipografía grande y clara.

## Arquitectura (resumen)

- `src/rog_monitor/` — núcleo Python (lee sysfs/hwmon directamente, sin root).
  `app.py` orquesta; `--json-stream` emite NDJSON 1/s (API de la app).
- `desktop/` — Electron: `main.js` (spawn del backend, IPC privilegiado con
  pkexec), `preload.js` (contextBridge `window.rog`), `renderer/`.
- TUI: Rich Live, teclas en `keys.py` (cbreak + mouse tracking).
- Curvas/perfiles del SISTEMA viven en otro repo: `~/Rog-Monitor-Scripts`
  (rog-profile-sync.service de root las aplica; la app las edita y reinicia
  el servicio con pkexec).
- Config: `~/.config/rog-monitor/config.json`. Errores: `~/.local/share/rog-monitor/error.log`.

## Trampas conocidas (no tropezar dos veces)

- Subprocesos SIEMPRE con `stdin=subprocess.DEVNULL` (si no, se comen las
  teclas de la TUI).
- `supergfxctl --mode` puede bloquear >15 s: ejecutarlo en hilo aparte.
- **Nunca** ejecutar `supergfxctl --mode` desde hooks automáticos
  (`systemd`, `udev`, boot, AC/batería). Puede parar el display manager durante
  login y dejar la sesión gris. Cambios iGPU/Hybrid/dGPU solo por acción manual
  del usuario desde una sesión gráfica activa, con advertencia de logout/reboot.
- Servicios root no deben usar `pkexec`: si corren como root, llaman los scripts
  de escritura directamente. `pkexec` queda solo para acciones iniciadas desde
  la app de escritorio.
- intel_pstate siempre reporta governor "powersave"; lo real es el EPP.
- Bazzite no tiene `powerprofilesctl`: usar D-Bus org.freedesktop.UPower.PowerProfiles.
- RAPL es root-only (CVE-2020-8694): `scripts/enable-cpu-power.sh`.
- En ostree un mismo device aparece montado en /etc, /var, /var/home:
  dedupe con prioridad de montaje (sysinfo.py).
- KDE no auto-cierra notificaciones critical: usar urgency=normal + expire-time.

## Qué sigue

Ver `docs/roadmap.md` (v8 Iluminación RGB tiene el plan paso a paso) y
`docs/HANDOFF.md` (estado exacto de la última sesión).
