# ROG Monitor v11 — Build spec (orquestación multiagente)

> **Orquestador:** Opus 4.8. **Trabajadores:** 5× Sonnet (CloudSonnet) en
> *worktrees* aislados. El orquestador NO programa: reparte trabajo, define
> contratos de interfaz, y fusiona. Patrón idéntico a v9/v10.
>
> **Antes de tocar nada, todo agente lee:** `AGENTS.md` y `docs/HANDOFF.md`.
> Reglas de oro que NO se rompen: (1) **nunca `git push`** — solo commit; (2)
> no dañar el equipo: cambios de root SOLO vía pkexec desde la app o script,
> nunca aplicar curvas peligrosas; (3) sin telemetría; (4) TUI y app a la par;
> (5) rutas genéricas, nada hardcodeado; (6) **archivar, nunca borrar**; (7) que
> NO parezca hecho por IA — paletas propias, tipografía grande y clara.
> i18n es/en primero (ahora 8 idiomas: es/en/fr/it/pt/zh/ja/ko).

## Contexto: qué está mal en v10 (retroalimentación de Marshall)

1. **Números de temperatura CPU/GPU feos.** El neón detrás de los números usa
   el color del TEMA. Debe usar el **color del nivel de alerta** y ser reactivo:
   azul (frío/normal-bajo) → verde (normal) → amarillo/naranja (caliente) → rojo
   (muy caliente). Debe seguir cambiando con el tema, pero el glow lo manda la
   temperatura, no el acento.
2. **Ventiladores nunca bajan.** En *performance* en escritorio sin hacer nada:
   CPU a ~6300 RPM. Tras jugar, las RPM se quedan arriba aunque CPU/GPU ya estén
   frías: la curva no tiene bajada/histéresis y no es consciente de la carga.
3. **Sin curvas por perfil visibles/configurables.** Marshall quiere editar y
   VER curva + tope de RPM distintos para *ahorro / balance / performance*.
4. **Modo edición del tablero.** Hoy al pasar el cursor sobre cualquier tarjeta
   se activa el arrastre ("malo"). Quiere un toggle **MODO EDICIÓN** en la barra
   superior: solo ahí se mueven/ocultan/arrastran bloques; apagado = quietos.
5. **Tutorial/wizard no cambia de idioma.** Eliges idioma y la bienvenida,
   "ventiladores detectados", etc. quedan en otro idioma.
6. **Roadmap roto:** abre un cuadradito vacío, no carga nada.
7. **Benchmarks rotos:** se ven los cuadritos previos pero vacíos; no se puede
   entrar a uno, ni borrarlos. Falta botón "eliminar benchmarks anteriores".
8. **Idiomas:** quitar emojis del selector. Mejorar cobertura long-tail.
9. **Temas poco expresivos.** Solo cambian color. Quiere temas con
   personalidad: Magma = lava escurriendo, Océano = agua en movimiento, Glaciar
   = hielo, Reactor = energía. Neón en los **bordes/márgenes** de las tarjetas.
   Modos claros menos pastel; proponer paletas con más carácter.
10. **Centro de Poder:** explicar bien en español qué hace **cada** control de
    CPU y GPU, una por una.
11. **Overlay de alertas:** mejorarlo bastante (hoy es básico).
12. **Sesión de juego (feature nueva grande).** Ver §Agente A5.

No llegó la imagen adjunta de los números, pero la descripción de Marshall es
inequívoca (punto 1) y basta para implementar.

---

## Arquitectura tocada (recordatorio)

- Números: `#cpu-temp`/`#gpu-temp` en `app.js` reciben clase `tempClass()` →
  `t-cold | t-normal | t-hot | t-very-hot`. El glow neón hoy sale de `--accent`.
- Curvas del sistema: `~/.config/rog-monitor/fan-curves.json` (editado por la
  app), aplicado por root `~/Rog-Monitor-Scripts/scripts/rog-profile-sync.sh`
  por perfil (quiet/balanced/performance). Cap RPM se aplica al escribir HW.
  El firmware `asus_custom_fan_curve` es **solo por temperatura** → para hacerlo
  consciente de carga e histéresis hace falta lógica en userspace: el
  **guardián térmico** (`scripts/rog-thermal-guardian.sh`, ya instalado como
  systemd unit, hoy `disabled/inactive`).
- Lectura de fans sin root: `src/rog_monitor/fans.py` (% relativo al cap).

---

## Contrato de interfaz compartido (para evitar choques de merge)

Pocos archivos los tocan varios agentes. Reglas de propiedad:

- **`desktop/renderer/app.js`** — dueño único: **A3**. Otros NO lo editan;
  A5 expone `window.RogGameSession.init()` y A3 mete UNA línea de arranque.
- **`desktop/renderer/style.css` + `styles/*.css`** — dueño: **A2**. A5 crea
  `styles/game-session.css` nuevo (sin conflicto). A3 NO edita CSS: pide a A2
  las clases que necesite por el contrato de abajo.
- **`i18n.js` / `i18n.py`** — dueño: **A4**. A3 y A5 que necesiten claves
  nuevas las dejan listadas en su HANDOFF con texto es/en; **A4 las integra**.
  Nadie más edita estos dos archivos.
- **Contrato del neón reactivo (A2↔A3):** el JS pone en el elemento de número
  una de estas clases (ya existen): `t-cold | t-normal | t-hot | t-very-hot`.
  A2 hace que el glow/box-shadow de esas clases use variables de NIVEL
  (`--lvl-cold`,`--lvl-ok`,`--lvl-hot`,`--lvl-crit`) y NO `--accent`. A3 solo
  garantiza que la clase correcta esté siempre puesta (incluye `t-very-hot`).
- **Backend de ventiladores (A1) ↔ UI (A3):** A1 expone el estado y los datos
  de curvas/caps por perfil en el stream NDJSON y/o en `fan-curves.json` con un
  esquema versionado (ver A1). A3/A4 NO tocan la lógica de fans, solo leen.

Merge lo hace el orquestador, en orden: **A1 → A4 → A2 → A3 → A5**.

---

## Agente A1 — Ventiladores inteligentes (sistema/backend) ⭐ PRIORIDAD MÁXIMA

**Dueño de:** `src/rog_monitor/fans.py`, `scripts/rog-thermal-guardian.sh`,
`~/Rog-Monitor-Scripts/scripts/rog-profile-sync.sh` (+ sus defaults),
`src/rog_monitor/device_profiles.json`, partes de fans en
`src/rog_monitor/power_control.py`. **NO toca frontend.**

**Problema raíz:** las curvas son solo por temperatura; en *performance* el
punto de baja temperatura ya pide muchas RPM (idle ruidoso), y al bajar la carga
la temperatura tarda en caer (inercia del disipador) → fans "pegados" arriba.

**Objetivo:**
1. **Curvas por perfil con bajada real e histéresis.** Rebajar los puntos de
   baja temperatura de *balanced* y sobre todo el idle de *performance* para que
   en escritorio las RPM sean bajas o el fan pare (zona de silencio). Garantizar
   monotonía y que cada perfil (quiet/balanced/performance) tenga curva Y tope
   de RPM claramente distintos. Documentar los defaults nuevos en el script.
2. **Control consciente de la carga** (el corazón del pedido). Mejorar
   `rog-thermal-guardian.sh` para que, además de proteger por techo térmico,
   module la agresividad de los fans según **carga (uso CPU/GPU) + temperatura
   + tendencia**: si está frío e idle, baja PWM / entra en zona de silencio; si
   sube la carga o la temperatura, sube; al terminar la carga, **baja con
   histéresis temporal** (p.ej. mantener nivel N segundos y luego escalonar
   hacia abajo) en vez de quedarse arriba. Falla-seguro: ante cualquier duda o
   error de lectura, subir fans (nunca dejar el equipo sin enfriar). Respeta el
   techo `ROG_THERMAL_CEILING` y el `override.conf`.
3. **API para la UI:** define en `fan-curves.json` un esquema versionado que
   guarde, por perfil, la curva (8 puntos temp→pwm) y el `cap_rpm`. Expón en el
   stream NDJSON el perfil activo, RPM/% por fan, y (si es barato) el "modo"
   actual del guardián (silencio/normal/alto). A3 dibujará con esto.
4. **Seguridad:** nada se aplica al hardware sin pkexec. El agente solo edita
   archivos fuente; aplicar/reiniciar el servicio lo hace Marshall o la app.
   Nunca subir el techo por defecto ni desactivar protecciones.

**Aceptación:** `python3 -m py_compile` del paquete; `bash -n` de los scripts;
documentar en HANDOFF las curvas nuevas y cómo probar (sin aplicar a HW).

## Agente A2 — Neón reactivo + temas expresivos (solo CSS)

**Dueño de:** `desktop/renderer/style.css`, `desktop/renderer/styles/*.css`
(menos `game-session.css`, que crea A5). **No toca JS.**

**Objetivo:**
1. **Neón de los números por nivel, no por tema.** El glow/`text-shadow`/halo
   de `#cpu-temp`/`#gpu-temp` y su tarjeta debe venir de variables de NIVEL
   (`--lvl-cold` azul, `--lvl-ok` verde, `--lvl-hot` amarillo/naranja,
   `--lvl-crit` rojo) ligadas a las clases `t-cold/t-normal/t-hot/t-very-hot`.
   Define esas variables por modo (claro/oscuro) para que en claro el azul/etc.
   se vean bien. Quita el `--accent` del glow de esos números.
2. **Neón en bordes/márgenes** de las tarjetas (lo que Marshall realmente
   quería con "neón"): bordes con glow del acento del tema, sutil pero visible.
3. **Temas con personalidad** (animaciones CSS puras, sin JS, respetando
   `prefers-reduced-motion`): Magma = lava/escurrido rojo; Océano = agua en
   movimiento; Glaciar = hielo/escarcha; Reactor = pulso de energía; Nébula,
   Neón, etc. con su propio carácter. Que cambiar de tema cambie MÁS que el
   color. Mantén rendimiento (animaciones GPU-friendly, nada que tire FPS).
4. **Modos claros menos pastel.** Repaleta los light-mode con más carácter y
   contraste (propуestas propias, no genéricas). Conserva legibilidad AA.

**Aceptación:** la app abre sin errores de consola; números cambian de color de
glow al variar la clase (probar forzando clases); reduce-motion respetado.

## Agente A3 — Tablero (modo edición), números, roadmap, benchmarks (app.js)

**Dueño de:** `desktop/renderer/app.js`, `desktop/renderer/dashboard.js`,
`desktop/renderer/widget-states.js`, `desktop/renderer/roadmap.js`. **No toca
CSS ni i18n** (pide clases a A2, claves a A4).

**Objetivo:**
1. **Modo edición.** Botón toggle en la barra superior. Solo con MODO EDICIÓN
   activo se pueden arrastrar/ocultar/reordenar bloques (el arrastre on-hover
   actual debe desaparecer cuando está apagado). Persistir layout y estado de
   widgets. Indicación visual clara de que el modo está activo.
2. **Neón números:** garantizar que `#cpu-temp`/`#gpu-temp` SIEMPRE llevan la
   clase de nivel correcta, incluido `t-very-hot` (crear el umbral si falta), y
   que no se les fuerza color de acento por JS. Coordinar nombres con A2.
3. **Roadmap:** arreglar el render (hoy abre vacío). Que cargue el contenido de
   `roadmap.js`/datos y se vea.
4. **Benchmarks:** arreglar para que cada benchmark previo se pueda ABRIR y ver
   su detalle; añadir borrar (uno y "borrar todos los anteriores"). Persistencia
   de resultados legible.

**Aceptación:** `node --check` de los 4 archivos; abrir app: edición funciona,
roadmap carga, benchmarks abren/borran.

## Agente A4 — i18n total, wizard, Centro de Poder (textos), overlay, idiomas

**Dueño de:** `desktop/renderer/i18n.js`, `src/rog_monitor/i18n.py`,
`desktop/renderer/wizard.js`, `desktop/renderer/power.js` (textos/explicaciones),
`desktop/renderer/overlay.html`, `desktop/renderer/overlay.js`.

**Objetivo:**
1. **Tutorial/wizard 100% i18n reactivo:** todas las cadenas del wizard
   (bienvenida, pasos, "ventiladores detectados", botones) cambian con el idioma
   elegido, en los 8 idiomas. Nada hardcodeado.
2. **Selector de idiomas SIN emojis.** Quitar banderas/emoji; texto limpio.
3. **Cobertura long-tail:** barrer cadenas sueltas que quedaron sin traducir.
4. **Centro de Poder:** explicación clara en español (y traducida) de **cada**
   control CPU y GPU, qué hace, rango seguro, efecto. Una por una.
5. **Overlay de alertas:** rediseñar para que se vea mucho mejor (jerarquía,
   color por nivel, legible, no intrusivo). Mantener urgency=normal+expire.
6. Integrar las claves nuevas que A3/A5 dejen listadas en sus HANDOFF.

**Aceptación:** `node --check`; `py_compile i18n.py`; cambiar idioma en el
wizard traduce todo; selector sin emojis.

## Agente A5 — Sesión de juego (feature nueva)

**Dueño de:** nuevos `src/rog_monitor/game_session.py`,
`desktop/renderer/game-session.js`, `desktop/renderer/styles/game-session.css`,
y registro mínimo (expone `window.RogGameSession.init()`; A3/orquestador mete la
línea de arranque en app.js). Strings nuevos → lista para A4.

**Objetivo:** "Iniciar sesión de juego": graba serie temporal de CPU/GPU temp,
RPM de fans, RAM, watts, uso. Al terminar: **resumen** con mín/máx/promedio de
cada métrica + **gráficas** (eje X = duración real, hover muestra valores).
Guardar sesiones. **Comparar** dos sesiones: % de diferencia por métrica y
veredicto claro ("esta sesión fue 15% más fría", "igual", "peor"), ventana lado
a lado. **Detectar el juego** en ejecución (nombre del proceso) y mostrarlo.
Primera vez = sesión *baseline* "original"; luego recomendar tweaks y comparar
contra la baseline. Persistencia en `~/.local/share/rog-monitor/`.

**Aceptación:** `py_compile`/`node --check`; grabar→resumen→comparar funciona
con datos simulados; no rompe el arranque de la app si no hay sesión.

---

## Orquestación

- Cada agente trabaja en su propio *worktree*, hace `bash -n`/`node --check`/
  `py_compile` de lo suyo, commitea en su worktree (sin push) y deja su parte en
  `docs/HANDOFF.md` (qué hizo, claves i18n pendientes, cómo probar).
- El orquestador fusiona en orden A1→A4→A2→A3→A5, resuelve conflictos
  (principalmente en `app.js`/`i18n.js`), corre verificación global y actualiza
  `CHANGELOG.md`, `AGENTS.md`/`HANDOFF.md`.
- **No se pushea nada.** Marshall revisa y pushea. Aplicar curvas/poder al
  hardware: solo Marshall, vía pkexec desde la app.
- Si la sesión se corta a mitad: los worktrees y este spec sobreviven; una nueva
  sesión retoma desde aquí (como en v9).
