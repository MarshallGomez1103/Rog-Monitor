# Build spec v12 — orquestación multiagente (Opus 4.8 orquesta, 5× Sonnet en worktrees)

> Contrato para esta tanda. Cada agente trabaja en SU worktree aislado (rama
> `worktree-agent-*`), commitea seguido y **NUNCA hace push** (regla de oro #1).
> El orquestador (Opus) fusiona archivo-por-archivo al final. Reparto pensado
> para que **ningún archivo tenga dos dueños** → cero conflictos de merge.

## Reglas de oro (de Marshall — ver AGENTS.md)
1. **NUNCA `git push`.** Solo commit local. Marshall revisa y pushea él mismo.
2. No dañar el equipo: cambios root van por pkexec / scripts, nunca a ciegas.
3. Sin telemetría. Única red: botón actualizar (git) y reportar (abre GitHub).
4. TUI y app de escritorio a la par. UI en **español primero** (i18n es/en + 6 más).
5. Rutas genéricas en docs/tutoriales (nada de /home/marshall hardcodeado).
6. **Archivar, nunca borrar** archivos preexistentes.
7. Que **NO parezca hecho por IA**: paletas propias, tipografía grande y clara.

## Verificación obligatoria antes de cada commit
- JS tocado: `node --check <archivo>`
- Python tocado: `python3 -m py_compile <archivo>`
- No tocar archivos fuera de tu propiedad. Commitea por sub-tarea (resiliencia
  ante cortes de cuenta: si te cortan, lo ya commiteado se conserva).

---

## Diagnóstico en vivo (G614JV, 2026-06-17) — contexto para A-FANS
- Ahora: Package 76°C, fans cpu 5100 / gpu 4000 / mid 5300 RPM.
- Carga real: `systemd-journal` 62% CPU (logging desbocado), 2× `electron` ~60%,
  `chrome` 30%. **Sunshine corriendo (pid 2704)** = el "proceso malo" que
  mantiene carga. No es idle real.
- `rog-thermal-guardian.service` = **INACTIVO** (system y user). No hay archivo
  `~/.local/share/rog-monitor/thermal-guardian-state.json` → **nunca ha corrido**.
- Curvas aplicadas en `~/Rog-Monitor-Scripts/scripts/rog-profile-sync.sh` = las
  VIEJAS agresivas, NO las suaves de A1 (quedaron pendientes de aplicar).
- Conclusión: el "fans no bajan" es mitad código (curvas/guardián) y mitad
  **paso de sistema (pkexec) que Marshall nunca aplicó** → A-FANS entrega el doc.

---

## CONTRATOS COMPARTIDOS (respétalos al pie de la letra)

### C1 · Neón por nivel (números de temperatura)
`tempClass()` en `app.js:119` YA emite una de estas clases en los elementos de
número de temp CPU/GPU: `t-cold`, `t-normal`, `t-hot`, `t-critical`.
- **A-VISUAL** estiliza SOLO esas clases. El glow/neón detrás del número depende
  del NIVEL, no del color del tema: `t-cold`=azul, `t-normal`=verde,
  `t-hot`=amarillo/naranja, `t-critical`=rojo. Debe seguir viéndose bien en los
  12 temas y en claro/oscuro (reactivo al tema en saturación/fondo, pero el
  matiz lo manda el nivel).
- **A-DASH** garantiza que `tempClass()` siga emitiendo exactamente esos nombres.

### C2 · Grilla de gráficas legible en modo claro
Las 3 líneas horizontales se dibujan en CANVAS dentro de `drawChart()` (app.js).
- **A-DASH**: `drawChart()` toma el color de grilla de `cssVar('--chart-grid')`.
- **A-VISUAL**: define `--chart-grid` por tema/modo (mucho más tenue en claro).

### C3 · Curvas de ventilador por perfil
`~/.config/rog-monitor/fan-curves.json` YA tiene los 3 perfiles
(`performance`/`balanced`/`quiet`) con `{temps[8],pwms[8]}` por fan
(`cpu`/`gpu`/`mid`) y `cap_rpm.{cpu,gpu,mid}`.
- **A-FANS**: `fans.py` debe leer/escribir LOS TRES perfiles. Mantén la CLI
  retrocompatible (añade subcomandos; NO cambies las firmas existentes que usa
  `main.js`). Entrega curvas-default nuevas más suaves (sección A-FANS).
- **A-DASH**: el `#fan-modal` gana un selector de perfil (AHORRO/BALANCED/
  PERFORMANCE) para editar cap+curva de CADA perfil y verlos distintos. Usa la
  ruta de guardado existente (escribe el objeto completo de los 3 perfiles).

### C4 · IPC
`main.js`/`preload.js` los toca **solo A-GAME** (añadidos del game-session, de
forma aditiva). Si A-DASH necesitara IPC nuevo, lo deja anotado en su mensaje
final y el orquestador lo cablea en integración (no lo toca A-DASH).

---

## REPARTO POR AGENTE (propiedad de archivos — exclusiva)

### A-VISUAL — neón por nivel + temas con carácter + grilla
**Dueño de:** `desktop/renderer/style.css`, `desktop/renderer/styles/neon.css`,
`desktop/renderer/styles/dashboard.css`.
Tareas (prioridad ↓):
1. **(TOP) Números de temp CPU/GPU bonitos.** Neón/glow por NIVEL (contrato C1).
   Quitar el feo actual: el resplandor NO debe ser del color del tema. Que se
   vea premium, no de IA. Reactivo: al cambiar tema sigue mandando el nivel.
2. **Temas con CARÁCTER** (no solo cambiar color). Acentos animados BARATOS
   (solo `transform`/`opacity`, GPU-friendly, baja frecuencia, respeta
   `prefers-reduced-motion`): Magma=brasa/rojo fundido sutil, Océano=agua que se
   mueve, Glaciar=hielo, Reactor=pulso de energía, etc. OJO: una sesión anterior
   los volvió estáticos "para no castigar la CPU" — el balance correcto es
   animación barata y pausable, NO barridos pesados. Modos claros: menos planos/
   pastel, con identidad real por paleta.
3. Definir token `--chart-grid` por tema y modo (contrato C2), muy tenue en claro.
4. Modo edición: realce visual claro cuando `html[data-edit-mode="on"]`; y
   **arreglar el "temblor" en hover**: las tarjetas NO deben reaccionar al hover
   cuando el modo edición está OFF.
Aceptación: 12 temas se ven distintos y con carácter; números legibles y con
glow por nivel; claro no encandila; sin jank de animación.

### A-I18N — roadmap + idiomas + tutorial + textos de poder + overlay
**Dueño de:** `desktop/renderer/roadmap.js`, `desktop/renderer/i18n.js`,
`src/rog_monitor/i18n.py`, `desktop/renderer/wizard.js`,
`desktop/renderer/power.js`, `desktop/renderer/overlay.html`,
`desktop/renderer/overlay.js`.
Tareas:
1. **Roadmap orden cronológico**: lo MÁS VIEJO arriba, lo hecho en orden
   ascendente, y lo hecho más reciente JUSTO encima de "POR HACER" (hoy hace
   `.reverse()` en roadmap.js:304 → invertir). Verifica que el modal cargue
   contenido (no vacío).
2. **Limpiar POR HACER**: audita `ROADMAP_TODO` contra `git log` y MUEVE a hecho
   todo lo ya entregado: Centro de Poder, wizard/asistente, 4 estados de widget,
   grid Aura 9 modos, temas (incl. +4), internacionalización 8 idiomas, tablero
   reordenable/arrastrable, guardar+aplicar ventiladores, neón por nivel, modo
   edición, sesión de juego, offsets GPU NVML, guardián térmico, menú núcleos,
   modal detalle de benchmark. Deja en POR HACER solo lo realmente pendiente.
3. **Tutorial/wizard 100% i18n**: CADA texto de CADA paso cambia con el idioma
   (hoy queda en español al cambiar). Maneja el texto del wizard vía `window.t`/
   claves i18n desde `wizard.js` (NO edites index.html; eso es de A-DASH).
4. **Selector de idioma SIN emojis** (quita banderas/emojis de la metadata de
   idiomas en i18n.js).
5. **Traducir claves nuevas** (`dash.*`, `gamesession.*` y cualquier es/en-only)
   a fr/it/pt/zh/ja/ko en `i18n.js` y reflejar lo equivalente en `i18n.py` (TUI).
6. **power.js**: explica BIEN en español qué hace CADA control de CPU y GPU
   (PL1/PL2/boost/térmico/offsets…), texto claro para humano no técnico.
7. **Overlay**: mejorarlo bastante (diseño + i18n) en overlay.html/overlay.js.

### A-GAME — sesión de juego (bug del resumen vacío + comparación)
**Dueño de:** `desktop/renderer/game-session.js`,
`desktop/renderer/styles/game-session.css`, `src/rog_monitor/game_session.py`,
`desktop/main.js`, `desktop/preload.js` (IPC aditivo de game-session).
Tareas:
1. **BUG: "Resumen de la sesión" sale vacío** tras grabar (~100 min grabados,
   clic en resumen → nada). Diagnostica la causa (¿datos no persistidos? ¿id
   mal? ¿render no encuentra el contenedor?) y arréglalo de raíz.
2. Resumen con min/máx/promedio de: temp CPU, temp GPU, RPM de los 3 fans, uso
   CPU/GPU, RAM. Gráficas comprimidas con **hover** (eje X = duración real de la
   sesión, p.ej. 10 min).
3. **Comparar dos sesiones**: deltas en %, veredicto explícito (mejor/peor/igual)
   en una ventanita lado a lado; detecta y muestra el nombre del juego.
4. Flujo de onboarding: sugerir grabar una sesión "original" antes de tunear y
   luego comparar mejoras (p.ej. "−15% de calor vs la original").
Aceptación: grabar → resumen se ve completo; comparar dos da % y veredicto.

### A-FANS — ventiladores inteligentes (bajan al enfriar) + curvas por perfil
**Dueño de:** `src/rog_monitor/fans.py`, `src/rog_monitor/config.py`,
`scripts/rog-thermal-guardian.sh`, `docs/APPLY-FANS-v12.md` (NUEVO).
Tareas:
1. **Que los fans BAJEN al dejar de exigir.** Revisa/mejora
   `rog-thermal-guardian.sh`: consciente de carga CPU/GPU con histéresis (subir
   inmediato; bajar tras ~20 s y por escalones). Emergencia térmica siempre
   gana (falla-seguro). Escribe estado en
   `~/.local/share/rog-monitor/thermal-guardian-state.json`.
2. **Curvas-default nuevas más suaves** por perfil (idle bajo; quiet arranca en
   PWM 0 = fan apagado hasta ~40°C). Formato `t1..t8|p1..p8`:
   - `performance:gpu` `35 45 55 62 70 75 80 83|30 46 70 100 150 195 235 250`
   - `performance:mid` `35 45 55 65 75 82 88 95|30 50 80 115 158 198 232 247`
   - `performance:*`   `35 45 55 65 75 82 88 95|35 55 85 120 160 200 235 247`
   - `balanced:gpu`    `35 48 58 64 71 76 80 83|15 26 46 75 112 150 185 195`
   - `balanced:mid`    `35 48 58 68 78 84 90 95|16 30 52 85 122 158 190 200`
   - `balanced:*`      `35 48 58 68 78 84 90 95|18 32 55 88 128 165 200 210`
   - `quiet:gpu`       `40 52 62 68 74 78 82 85|0 14 26 46 72 98 128 140`
   - `quiet:mid`       `40 52 62 70 80 85 90 95|0 18 32 56 84 112 140 150`
   - `quiet:*`         `40 52 62 70 80 85 90 95|0 16 30 52 80 110 140 150`
   Los 3 perfiles deben quedar claramente distintos (cap + curva).
3. `fans.py`: leer/escribir LOS TRES perfiles (contrato C3), CLI retrocompatible.
4. **`docs/APPLY-FANS-v12.md`**: pasos EXACTOS de sistema para Marshall (pkexec):
   (a) instalar el bloque de curvas nuevo en `~/Rog-Monitor-Scripts/scripts/
   rog-profile-sync.sh` (incluye el bloque `case` corregido verbatim), (b)
   `systemctl enable --now rog-thermal-guardian.service` (o el unit correcto),
   (c) cómo verificar (sensors + el state.json). Explica que sin este paso los
   fans siguen como antes aunque el código esté bien.
NO toques app.js ni main.js.

### A-DASH — app.js: fan-UI por perfil, benchmarks, procs/núcleos, topbar, edición
**Dueño de:** `desktop/renderer/app.js`, `desktop/renderer/index.html`,
`desktop/renderer/styles/extras.css`, `desktop/renderer/cores.js`,
`desktop/renderer/styles/cores.css`, `src/rog_monitor/procs.py`.
Tareas:
1. **Fan modal por perfil** (contrato C3): selector AHORRO/BALANCED/PERFORMANCE;
   editar cap+curva de cada perfil; ver que son distintos. Guarda con la ruta
   existente (objeto completo de los 3 perfiles).
2. **Benchmarks: lista bonita.** `_benchCardHtml`/`renderBenchmarkHistory`
   (app.js ~772/848) + `extras.css`: tarjetas del historial atractivas (hoy se
   ven pobres). El modal de detalle (bench-detail.js) ya está bien — no lo rompas.
   Mantén borrar-uno y BORRAR TODOS.
3. **Procesos por núcleo.** `procs.py` ya expone `cpu_core` (estilo top). Muestra
   conciencia por núcleo (Chrome marca 10% del total pero usa ~1 núcleo). Integra
   la vista de NÚCLEOS dentro del panel de Procesos (entrada desde procesos), no
   como botón suelto.
4. **Consolidar la barra de arriba** (hay demasiados botones): mete sesión de
   juego junto a benchmarks y núcleos dentro de procesos; reduce el desorden.
5. **Modo edición / layout**: el botón de layout deja el tablero bien; las
   tarjetas NO deben "temblar" en hover cuando el modo edición está OFF (coordina
   con A-VISUAL: tú controlas el estado/lógica, A-VISUAL el estilo).
6. **Grilla de gráficas** (contrato C2): `drawChart()` usa `cssVar('--chart-grid')`.
7. Verifica que `tempClass()` siga emitiendo `t-cold/t-normal/t-hot/t-critical`
   (contrato C1).

---

## Integración (la hace el orquestador)
- Merge archivo-por-archivo (cada archivo tiene un solo dueño → `git checkout
  <rama> -- <archivos>`), `node --check` + `py_compile` global, actualizar
  CHANGELOG + HANDOFF, commit local (SIN push). Podar worktrees solo tras fusionar.
