# S11b — Overlay v2: estilo MangoHud, tamaños S/M/L/XL, métricas elegibles una a una
Estado: **TESTED** (unidad + CDP real + ventana real en XWayland) · juego real: **BLOCKED_OWNER** (sigue OWNER-03 de S11)
Agente: Claude (Opus) · Rama: `feat/v22-overlay2` (base `feat/v22` `3668a1a`) · Commits: `f105789`..HEAD (ver `git log feat/v22..feat/v22-overlay2`)

## Pedido del propietario → qué se hizo
| Pedido | Cambio |
|---|---|
| Estilo MangoHud, alto contraste (ve mal) | fondo `rgba(0,0,0,.85)`, valores **blanco puro, negrita 700, mono**, unidades `#d0d0d0`, etiqueta de color fijo por fila (CPU `#4fb3ff`, GPU `#42d77d`, RAM `#ff85c0`, VRAM `#c4a1ff`, FPS `#ffd84d`, FAN `#4fe3e8`, perfil `#ffab5c`), borde 1 px, esquinas cuadradas, contorno de texto negro. Contraste comprobado en test contra el **peor caso** (fondo 85 % negro sobre escena blanca = `#262626`): mínimo 5,45:1 (rojo crítico), blanco 15,1:1 |
| Botones S/M/L/XL (100/125/150/200 %), default M, en vivo, persistente | segmento cuadrado en el editor (`aria-pressed`); variable CSS `--scale` en la ventana del overlay; la ventana se reajusta sola a la tarjeta (`overlayFit` de S11). Persiste en `overlayPrefs.scale` (localStorage del perfil de la app); prefs sin escala → M |
| Vertical, una métrica por fila | una fila por componente (CPU, GPU, RAM, VRAM, FPS, FAN), una celda por métrica; `layout` (fila/cuadro) se ignora al migrar y desaparece el selector |
| Cada métrica activable por separado; temperatura por defecto; faltaba uso % de CPU | 12 casillas (CPU/GPU: uso %, temperatura, W, frecuencia; RAM usada GB; VRAM usada GB; FPS; FAN RPM). Defaults: CPU uso+temp+W, GPU uso+temp+W, FPS, FAN. Fila sin métricas = no se pinta. Prefs antiguas `show.{cpu,gpu,fans,fps}=false` → se quitan esas filas de los defaults |
| Modo juego MangoHud con las mismas métricas y escala | cada métrica → su clave (`cpu_stats`, `cpu_temp`, `cpu_power`, `cpu_mhz`, `gpu_stats`, `gpu_temp`, `gpu_power`, `gpu_core_clock`, `ram`, `vram`, `fps`+`frametime`); las no elegidas se escriben `clave=0`; `font_size = 24 × escala` (24/30/36/48); `background_alpha=0.85`, `background_color=000000`, `text_color=FFFFFF`, colores de fila; sin `horizontal`, sin `exec=`, líneas del usuario intactas |

## Decisiones (con alternativa descartada)
- **Temperatura con color de nivel** solo por encima del umbral del dashboard (amarillo/naranja/rojo claro, todos ≥ 5,4:1); en rango normal es blanca. Se conserva la alerta que ya tenía el overlay; descartado "todo blanco siempre" porque perdía el aviso térmico.
- **FPS elegido sin dato → `—`** (antes la fila se ocultaba sin MangoHud). Regla de S03/pedido: nunca esconder ni 0 falso.
- **MangoHud solo dibuja la fila CPU/GPU con `cpu_stats`/`gpu_stats`**: si eliges p. ej. solo "CPU temperatura", el modo juego enciende `cpu_stats` y MangoHud mostrará también el % de uso. Limitación de MangoHud, no del overlay de la app.
- **Sin acento del tema** en overlay ni MangoHud: colores fijos por fila (lo pidió el propietario). Se quitaron `accent`/`ACCENT_RE` de `normalizeCfg` y el segundo `pushOverlay` en `DOMContentLoaded` que solo existía para el acento.
- **Prefs siguen en `v: 2`** con campos añadidos (`metrics`, `scale`): la migración se decide por la presencia de `metrics`, así el check S11 (`v === 2`) sigue válido.
- **VRAM en GB** = `vram_used` (MiB) / 1024, un decimal, como la RAM. `ram_used_gb <= 0` se trata como sin dato (schema 1 manda 0).
- Un solo módulo puro compartido `desktop/renderer/overlay-metrics.js` (UMD): lo usan overlay.js, editor, `overlay-window.js` (main valida) y `mangohud-block.js` (main mapea).

## Archivos
- Nuevo: `desktop/renderer/overlay-metrics.js` (catálogo, defaults, migración, escala, `fmt` con `—`, filas, nivel de temperatura, contraste WCAG, claves MangoHud, 12 textos × 8 idiomas); `desktop/test/overlay-metrics.test.js` (15).
- Modificados: `desktop/renderer/overlay.html` / `overlay.js` (reescritos: vertical, `--scale`), `overlay-prefs.js` (migración), `overlay-editor.js` (S/M/L/XL + casillas por delegación), `styles/overlay-ui.css`, `index.html` (modal + `<script src="overlay-metrics.js">`), `desktop/overlay-window.js` (solo `normalizeCfg` y tamaño por defecto vertical 300×230), `desktop/mangohud-block.js`, `desktop/main.js` (4 líneas: config al overlay, `fitSize`, `missingRows`), `scripts/validate-i18n.mjs` (carga overlay-metrics), `README.md`.
- Tests actualizados: `overlay-prefs.test.js`, `overlay-window.test.js`, `mangohud-block.test.js`, `overlay-stale.test.js`, `overlay-fit.test.js`.
- Evidencia: `docs/agent-work/v22/evidence/S11b/check-overlay-v2.mjs` (CDP), `shot-overlay-x11.mjs` (XWayland), `overlay-M.png`, `overlay-XL.png` (solo la página del overlay; el gris `#262626` del fondo es el 85 % negro compuesto sobre blanco por la captura, el peor caso del test).

## TDD (RED → GREEN, salidas reales)
| CP | RED | GREEN | Commit |
|---|---|---|---|
| 1 modelo | `Error: Cannot find module '../renderer/overlay-metrics.js'` · pass 0 fail 1 | 13/13 | `f105789` |
| 2 prefs + main + MangoHud | 8 fail / 24 pass (parse, migración, normalize, fitSize, normalizeCfg, gameModeLines ×2, missingRows) | 32/32 | `b797b0e` |
| 3 ventana del overlay | 9 fail / 9 pass (filas por defecto, `—`, métricas sueltas, nivel, `--scale`, FPS 0, overlay-fit ×3) | 18/18 | `9f28f83` |
| 4 editor | 2 fail / 13 pass (`toggleMetric`, `scaleOptions`) | 15/15 | `af472d9` |
| 5 evidencia | — | CDP 56/56, XWayland 9/9 | `13eb328` |

## Verificación (2026-10-16, comandos y resultados reales)
```
node --test --experimental-test-coverage --test-coverage-lines=90 desktop/test/*.test.js
  -> tests 354, pass 354, fail 0; all files 99.65 % líneas (overlay-metrics 100, overlay-prefs 100, overlay-window 100, mangohud-block 100); rc=0
HOME=<tmp> PYTHONPATH=src .ai/private/rog-v22/venv-clean/bin/python -s -m coverage run --source=src/rog_monitor -m unittest discover -s tests
  -> Ran 1009 tests, OK (skipped=1); TOTAL 95.20 % (--fail-under=80 rc=0)   [Python no se tocó]
node scripts/validate-i18n.mjs        -> ✓ 1116 claves × 8 idiomas; 284 refs en index.html
node scripts/check-docs.mjs           -> OK (36 reglas + rutas privadas + enlaces relativos)
node scripts/bump-version.mjs --check -> OK (22.0.0, sin subir versión)
ROG_ELECTRON=<electron del checkout> node scripts/e2e-smoke.mjs --out <tmp> -> 31 pass, 0 fail, 0 exceptions, 0 console.error
ROG_APP_ROOT=<worktree> node .ai/private/rog-v22/tools/cdp.mjs <abs>/evidence/S11b/check-overlay-v2.mjs -> 56/56 PASS, RESULT: PASS
ROG_APP_ROOT=<worktree> node .ai/private/rog-v22/tools/cdp.mjs <abs>/evidence/S11/check-overlay-ui.mjs  -> 33/33 PASS, RESULT: PASS
ROG_APP_ROOT=<worktree> node .ai/private/rog-v22/tools/cdp.mjs <abs>/evidence/S02/check-drag-mouse.mjs  -> 20/20, RESULT: PASS
ROG_APP_ROOT=<worktree> node .ai/private/rog-v22/tools/cdp.mjs <abs>/evidence/S03/check-states.mjs      -> RESULT: PASS
ELECTRON=<electron> ROG_APP_ROOT=<worktree> node evidence/S11b/shot-overlay-x11.mjs --shots=<dir>      -> 9/9 PASS, RESULT: PASS
```
- CDP S11b (clics reales `Input.dispatchMouseEvent` en la ventana principal; la ventana del overlay se lee conectándose a su propia página): 4 botones S/M/L/XL con M pulsado; 12 casillas con los defaults exactos; encender → filas `cpu, gpu, fps, fan` en vertical con **uso de CPU numérico** (p. ej. `9`), temperatura CPU/GPU, FPS `—`; fondo `rgba(0, 0, 0, 0.85)`, radio 0, valor `rgb(255,255,255)` peso 700 a 27,5 px (M), unidad 16,25 px; ventana = tarjeta (548×171). XL → valor 44 px y ventana 875×273 sin reiniciar; S → 22 px y menor que M. Desactivar "CPU temperatura" la quita; activar "CPU frecuencia" la añade (GHz); FAN/FPS fuera → sus filas desaparecen; RAM/VRAM dentro → filas propias; el aviso "no disponible en MangoHud" se vacía al quitar FAN. Modo juego: bloque con `font_size=48`, `cpu_stats`, `cpu_mhz`, `cpu_temp=0`, `ram`, `vram`, `fps=0`, `background_alpha=0.85`, sin `exec=`/`horizontal`; pasar a M reescribe `font_size=30`; quitarlo funciona. Recargar el renderer restaura XL y las métricas en main y en el editor.
- XWayland real (modo compatibilidad, monitor 1 arriba-derecha, override-redirect): ventana X11 659×205 en M y 1052×328 en XL (escala XWayland ~1,2); 0 procesos vivos al terminar.

## No verificado (honesto)
- Juego real con el overlay v2 y con el modo juego (MangoHud aplicando `clave=0` sobre líneas del usuario y `font_size`): sin juego en la sesión; claves comprobadas contra `/usr/share/doc/mangohud/MangoHud.conf.example`.
- "Persiste tras reiniciar": probado recargando el renderer (misma localStorage del perfil); no se cerró y reabrió la app completa en CDP.
- Lectura cómoda para el propietario a distancia de juego (subjetivo): ver capturas y pasos de abajo.

## Validación del propietario (pasos exactos)
1. Abrir ROG Monitor → botón de ajustes junto a **OVERLAY**. Debe verse **Tamaño: S M L XL** con **M** marcado y, en "¿Qué quieres ver…", filas CPU/GPU/RAM/VRAM/FPS/FAN con su etiqueta de color y una casilla por dato.
2. Activar **Mostrar overlay**: panel negro con CPU (uso %, °C, W), GPU (uso %, °C, W), FPS `—` (sin juego con MangoHud) y FAN.
3. Pulsar **XL** y luego **S**: el panel cambia de tamaño al momento. Dejar el que se lea mejor.
4. Dejar solo "CPU frecuencia" y "GPU frecuencia": solo quedan esas dos filas. Volver a activar las temperaturas.
5. Cerrar y abrir la app: el tamaño y las métricas elegidas siguen.
6. (Opcional) Modo juego activado + juego con `mangohud %command%`: el HUD de MangoHud usa las mismas métricas y un tamaño de letra acorde (M=30, XL=48). Si una fila de CPU muestra también el % de uso aunque no lo elegiste, es MangoHud (ver decisiones).
