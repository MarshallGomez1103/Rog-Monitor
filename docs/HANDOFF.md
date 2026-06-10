# HANDOFF — memoria compartida entre agentes

> Cada agente actualiza esta sección al terminar. El siguiente la lee primero.

## Última sesión: Claude (Fable 5) — 2026-06-10

### Estado: v7.1.0 lista y commiteada (sin push, como siempre)

Hecho en esta sesión (todo probado con `--once`, `--json` y `node --check`):
- Procesos: % del **CPU total** por defecto (`procs.py` también expone
  `cpu_core` estilo top por si se quiere un toggle en la UI).
- `procs.top_memory()` + clic en la barra de RAM → modal con top consumo
  de memoria y cierre de procesos.
- Historial 2×2 con eje de tiempo ("hace N min" → "ahora") en `drawChart`.
- Botón REPORTAR ERROR → `report-issue` IPC → abre GitHub issue con info
  del sistema precargada (deriva la URL del remote origin).
- SALUD DE DISCOS en Sistema → `disk-health` IPC → pkexec + smartctl -H -A,
  filtra líneas clave (result, percentage used, temperature, spare, wear).
- Editor de curvas ahora en **% del máximo** (convierte a PWM 0-255 al
  guardar); texto explicativo; cap individual editando la fila de cada fan.
- Tamaño de letra en modal TEMA (A−/Normal/A+/A++) con zoom persistido
  (`zoomLevel` en localStorage, aplicado al arrancar vía webFrame).
- Scrollbars finas con color de tema; sin barra fea del body.
- TUI: mouse tracking (ESC[?1000h) en `keys.py` — la rueda ya no descuadra;
  las secuencias escape se descartan en `get()`.

### Pendiente INMEDIATO (siguiente sesión — Codex puedes arrancar aquí)

1. **v8 RGB/Aura**: plan paso a paso en `docs/roadmap.md` sección v8.
   Empezar por verificar asusd vs rog-profile-sync (paso 1). No saltarse el
   orden. El hardware de prueba: G614JV con teclado RGB + periférico Redragon.
2. Benchmarks térmicos CPU/GPU (paso 6 del plan v8).
3. Umbrales de alertas editables desde la app (quedó en v9 pero es corto:
   editar config.json vía IPC y recargar AlertEngine).
4. Probar en vivo: el botón de salud de discos y el editor de curvas en %
   (solo se probaron por unidad, no con clics reales).

### Decisiones tomadas (no re-litigar sin Marshall)

- Open source es LO ÚLTIMO (v11). No publicar nada aún.
- Temas: paletas propias, no copiar las de otras apps.
- Throttling: solo log de eventos, nunca notificación de escritorio.
- Caps de ventiladores actuales: ~6800 RPM (PWM 248/251/231) en los tres,
  aplicados en el repo de scripts del sistema.

### Contexto del sistema de Marshall

- Bazzite (ostree), KDE Wayland, sin sudo sin clave (usar pkexec).
- Repo de scripts del sistema: `~/Rog-Monitor-Scripts` (servicios
  rog-profile-sync, rog-power-source, rog-power-notify ya activos).
- supergfxctl modos: Integrated / Hybrid / AsusMuxDgpu (este último = reinicio).
- Máximos reales de ventiladores aún sin medir con el benchmark de la app
  (estimados: CPU 7000 / GPU 6900 / MID 7500).
