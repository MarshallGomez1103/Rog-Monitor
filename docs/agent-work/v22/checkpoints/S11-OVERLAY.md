# S11 — Overlay: acceso visible, monitor/anclaje reales (XWayland), rediseño y modo juego MangoHud
Estado: **TESTED** (parte automatizable de S11 + corte S08 `overlay-window.js`) · S12 juego real: **BLOCKED_OWNER** (OWNER-03)
Agente: Claude (Opus) · Rama: `feat/v22-overlay` (base `feat/v22` `c40116c`) · Commits: `2e02084`..`ba927df` (ver `git log feat/v22..feat/v22-overlay`)
Decisión: ADR-0007 **accepted (A2 + capa B)**; el propietario delegó la elección ("acábalo"), ver V22-D12.

## Quejas del propietario y qué se hizo
| Queja | Causa | Cambio |
|---|---|---|
| "Muy difícil de encontrar" | solo existía dentro de HERRAMIENTAS | botón **OVERLAY** en la barra superior (1 clic, lámpara cuadrada, `aria-pressed`), botón de ajustes al lado, atajo **Ctrl+Shift+O** (app en primer plano) y entrada en el menú de la bandeja (para mientras se juega). Documentado en el `title` y en el modal |
| No aparece en monitor 1 arriba-derecha | Wayland nativo ignora `setPosition` (S10, 8/8) | **modo compatibilidad (XWayland)**: preferencia `overlay_xwayland` en `config.json`; al arrancar la app se relanza con `--ozone-platform=x11`. Monitor por índice estable (orden x,y), 7 anclajes + desplazamiento X/Y sobre `bounds` + 18 DIP, la ventana se ajusta a la tarjeta, recolocación en `display-added/removed/metrics-changed`, caída al primario con aviso |
| "Está muy feo" | tarjeta redondeada/píldora, letra 8-9 px | rediseño cuadrado (Carbon/ROG): fondo `rgba(22,22,22,.78)`, borde 1 px, barra de acento del tema a la izquierda, texto claro con sombra, números monoespaciados tabulares, separadores finos; fila o cuadro |
| 1–4 monitores, ventana/borderless/pantalla completa "como Steam", con plan B | — | capa A (XWayland) + capa B **modo juego MangoHud** (bloque marcado propio en `MangoHud.conf`, mismas métricas y anclaje, `center`→`top-center`, sin `exec=`) |

## Hallazgo medido que corrige el ADR
`app.commandLine.appendSwitch('ozone-platform','x11')` en `main.js` **no** cambia la plataforma en Electron 44.7.0: las escalas siguen siendo las de Wayland nativo (1.2 / 1) y el proceso GPU cayó con código 139. Con `app.relaunch({args: [...argv, '--ozone-platform=x11']})` + `app.exit(0)` el proceso nuevo ve la escala global de XWayland (1.203125). Por eso A2 se implementa como **auto-relanzamiento temprano** (antes del bloqueo de instancia única y de crear ventanas); en AppImage se relanza `$APPIMAGE`. Coste: un arranque extra del proceso principal (sin ventana) cuando el modo está activo. `ponytail:` `start.sh` podría pasar la bandera directamente para ahorrarlo; no se hizo para no parsear JSON en bash.

## Archivos
- Nuevos (lógica pura con tests): `desktop/overlay-window.js`, `desktop/mangohud-block.js`, `desktop/renderer/overlay-prefs.js` (UMD, registra 32 claves × 8 idiomas).
- Nuevo (solo cableado DOM, sale de `app.js`): `desktop/renderer/overlay-editor.js`; estilos `desktop/renderer/styles/overlay-ui.css`.
- Tests: `desktop/test/overlay-window.test.js` (12), `mangohud-block.test.js` (10), `overlay-prefs.test.js` (9), `overlay-fit.test.js` (4).
- Modificados: `desktop/main.js` (1736 → 1713 líneas: bloque overlay + MangoHud reescritos sobre los módulos, relanzamiento, bandeja, `display-*`), `desktop/preload.js` (6 canales), `desktop/renderer/app.js` (3886 → 3791: el bloque overlay pasó a `overlay-editor.js`), `overlay.html/.js` (rediseño + `overlayFit` + separadores), `index.html` (grupo de la barra, modal reestructurado, carga de módulos), `i18n.js` (`modal.overlay_sub` sin la promesa de pantalla completa), `scripts/validate-i18n.mjs` (carga `overlay-prefs.js` antes de `app.js`), `README.md`, `docs/adr/0007-overlay-strategy.md`.
- Evidencia: `docs/agent-work/v22/evidence/S11/check-overlay-ui.mjs` (CDP), `measure-overlay-x11.mjs` + `measure-x11-raw.txt` (ventana real en XWayland).

## Verificación (comandos y resultados reales, 2026-10-15)
```
node --test --experimental-test-coverage --test-coverage-lines=90 desktop/test/*.test.js
  -> 337 tests, 337 pass, 0 fail; all files 99.63 % líneas (overlay-window.js 100, mangohud-block.js 100, overlay-prefs.js 100)
HOME=<tmp> PYTHONPATH=src .ai/private/rog-v22/venv-clean/bin/python -s -m coverage run --source=src/rog_monitor -m unittest discover -s tests
  -> Ran 1009 tests, OK (skipped=1); coverage TOTAL 95.20 % (--fail-under=80 OK)   [Python no se tocó]
node scripts/validate-i18n.mjs   -> ✓ 1104 claves × 8 idiomas; 288 refs en index.html
node scripts/check-docs.mjs      -> OK (36 reglas + rutas privadas + enlaces relativos)
node scripts/bump-version.mjs --check -> OK (22.0.0, sin subir versión)
ROG_ELECTRON=<electron del checkout> node scripts/e2e-smoke.mjs --out <tmp> -> 31 pass, 0 fail, 0 exceptions, 0 console.error
ROG_APP_ROOT=<worktree> node .ai/private/rog-v22/tools/cdp.mjs <abs>/evidence/S11/check-overlay-ui.mjs -> 33/33 PASS, RESULT: PASS
ROG_APP_ROOT=<worktree> node .ai/private/rog-v22/tools/cdp.mjs <abs>/evidence/S02/check-drag-mouse.mjs -> 20/20, RESULT: PASS
ROG_APP_ROOT=<worktree> node .ai/private/rog-v22/tools/cdp.mjs <abs>/evidence/S03/check-states.mjs   -> RESULT: PASS
ELECTRON=<electron> ROG_APP_ROOT=<worktree> node evidence/S11/measure-overlay-x11.mjs -> 17/17 PASS, RESULT: PASS
```
- CDP S11 (eventos reales `Input.dispatchMouseEvent`/`dispatchKeyEvent`, NOANIM, HOME temporal del arnés): botón visible fuera de menús y con el atajo en el `title`; clic → `aria-pressed=true` y `enabled=true` en main; Ctrl+Shift+O lo apaga; modal con una opción por monitor ("Monitor 1 · 1600×1000 · …"), 7 anclajes, desplazamientos; en Wayland nativo aviso `warn` con botón "Activar modo compatibilidad"; monitor/anclaje/offset llegan a main y se guardan como prefs v2; casilla de compatibilidad → confirmación de reinicio → "Más tarde" → `compat=true` sin reiniciar y aviso "reinicia para aplicarlo"; modo juego escribe y quita su bloque (en el HOME temporal); la fila de ventiladores se declara no disponible en MangoHud; Escape cierra y devuelve el foco; a 980 px la barra no se desborda.
- Medición real (no la sonda): con `config.json {overlay_xwayland:true}` la app se relanza sola con `--ozone-platform=x11`; la ventana "ROG Overlay" del producto cae en monitor 1 (eDP-1) y monitor 2 (HDMI-A-3) en arriba-derecha, arriba-izquierda y abajo-derecha a 20-21 px X11 (=18 DIP × 1.203) del borde, `Override Redirect State: yes` (sin foco ni barra de tareas) en 6/6; apagar la cierra; 0 procesos vivos al terminar. Capturas solo de la página del overlay (fila y cuadro), revisadas y borradas.

## No verificado (honesto)
- Juego real (Proton/Wine, Vulkan/OpenGL nativo; ventana, borderless, pantalla completa exclusiva; direct scan-out de KWin). El "encima de pantalla completa" del producto se apoya en S10 (misma clase de ventana override-redirect, 3/3 con una ventana de prueba, no un juego).
- 3-4 monitores, desconectar/reconectar en vivo (la caída al primario está probada solo en unidad).
- Entrada de la bandeja "Overlay: mostrar / ocultar" (no hay arnés de bandeja).
- Relanzamiento desde AppImage (`$APPIMAGE`): no hay AppImage construido.
- Modo juego dentro de un juego: que MangoHud aplique el bloque añadido al final por encima de las líneas del usuario (la última `position=` gana) no se midió con un juego; claves comprobadas contra `/usr/share/doc/mangohud/MangoHud.conf.example` (0.8.4).
- Nitidez de la ventana principal en XWayland sobre el monitor de escala 1 (se avisa en la UI).
- Sesión X11 pura, GNOME, Hyprland, gamescope/Modo Juego de Steam.

## Validación del propietario (BLOCKED_OWNER, OWNER-03) — pasos exactos
1. Abrir ROG Monitor. En la barra superior, junto a HERRAMIENTAS: botón **OVERLAY** (cuadrito) y botón de ajustes (tres barras). Pulsar OVERLAY: aparece la franja; volver a pulsar o `Ctrl+Shift+O`: desaparece.
2. Ajustes → debe verse el aviso naranja "Sesión Wayland nativa…". Pulsar **Activar modo compatibilidad** → **Reiniciar ahora**. La app se cierra y vuelve sola; en ajustes el aviso pasa a verde "Modo compatibilidad activo (XWayland)".
3. Monitor: **Monitor 1** (el de más a la izquierda, se ve el tamaño) · Posición: **Arriba derecha**. Encender el overlay: debe quedar pegado a la esquina superior derecha del monitor 1. Probar Monitor 2 y otra esquina; probar desplazamiento X = -100.
4. Abrir un juego en **ventana**, luego **borderless** y luego **pantalla completa**, en monitor 1 y 2. Anotar OK/FALLA: el overlay se ve encima, el juego no pierde el foco ni el teclado, los clics sobre la franja llegan al juego. Repetir con un juego Proton y uno nativo.
5. Si el overlay desaparece en pantalla completa (direct scan-out): Ajustes → **Activar modo juego**; en Steam, Propiedades del juego → Opciones de lanzamiento → `mangohud %command%`. Lanzar: el HUD de MangoHud aparece en la esquina elegida dentro del juego (Centro = Arriba centro); Shift derecho + F12 lo oculta. Desactivar modo juego y comprobar que `~/.config/MangoHud/MangoHud.conf` conserva tus líneas.
6. Con la app minimizada a la bandeja durante el juego: menú del icono → **Overlay: mostrar / ocultar**.
7. Si hay 3-4 monitores: repetir 3-4 en cada uno; desconectar el monitor elegido con el overlay encendido (debe pasar al principal) y reconectarlo.
8. Mirar la nitidez de la ventana principal en el monitor HDMI (escala 1) con el modo compatibilidad. Si molesta, desactivarlo (ajustes → casilla) y reiniciar.

## Criterios de aceptación
[x] botón visible + atajo + bandeja [x] monitor por índice y 7 anclajes + offset (unidad + CDP + medición real XWayland) [x] modo compatibilidad persistido y con reinicio confirmado [x] aviso honesto en Wayland / sin XWayland [x] rediseño cuadrado legible, acento del tema [x] modo juego MangoHud con bloque propio, sin `exec=`, tests en HOME temporal [x] 8 idiomas [x] app.js y main.js más cortos [ ] juego real, 3-4 monitores, hot-plug (BLOCKED_OWNER)
Riesgos y rollback: revertir los commits de `feat/v22-overlay`; la preferencia `overlay_xwayland` en `config.json` se ignora sin el código nuevo (la app arranca en Wayland nativo). Si el relanzamiento diera problemas, borrar la clave `overlay_xwayland` de `~/.config/rog-monitor/config.json`.
