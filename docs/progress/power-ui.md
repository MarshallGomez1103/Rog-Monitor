# Progreso — A-POWER-UI (rama `v13/power-ui`)

Centro de Poder seguro (UI). Dueño de `desktop/renderer/power.js` y
`desktop/renderer/styles/power.css`; toca `index.html` SOLO dentro del bloque
`<!-- v13 POWER-UI -->`.

## Hecho

1. **Detección por-cambio al Aplicar** — `buildChangeList()` compara
   `pendingChanges` contra el valor leído del hardware (`ctrl.value`, o
   `ctrl.default` si no hay lectura) y devuelve SOLO lo movido, con dirección
   (`up`/`down`) y bandera `beyondSafe`. `applyPower()` arma el resumen de
   confirmación únicamente con esos cambios ("Moviste X from→to unit"). No
   menciona controles intactos.
2. **Franja de PELIGRO** (`#power-danger-strip`, `renderDangerStrip()`) — se
   muestra en vivo al mover cualquier control (no solo al aplicar). Por control
   cambiado lista la **consecuencia concreta** de subirlo/bajarlo (tablas
   `DANGER_UP` / `DANGER_DOWN` para pl1, pl2, dynamic_boost, thermal_target,
   base_clock_offset, mem_clock_offset). Color/estilo de peligro vía token
   `--danger` definido en `power.css` con fallback (`var(--hot)`), que los temas
   pueden sobrescribir.
3. **Rieles de seguridad / doble recorte** — texto fijo `#power-safety-rails`
   (HTML, bloque v13) + nota `.power-danger-rails` al pie de la franja +
   `power.confirm.rails` en el diálogo de aplicar. Mensaje tranquilizador pero
   honesto: doble recorte (app + firmware), topes del firmware, recuperación con
   reinicio + Reset a fábrica.
4. **Doble consentimiento para exceder el rango seguro** (hacia abs_min/abs_max):
   - Vía A (offsets GPU): checkbox "modo avanzado" del control → `window.confirm`
     antes de ampliar el rango del slider (ya existente, conservado).
   - Vía B (al aplicar): si algún cambio queda `beyondSafe`, segundo
     `window.confirm` adicional (`power.confirm.beyond*`) listando los valores
     fuera del rango seguro. Como los sliders normales están clampados a
     `min/max`, `beyondSafe` solo ocurre con offsets en modo avanzado — coherente.
5. **Botón "Avanzado"** a la derecha del título (`#power-title-row` +
   `#power-advanced-btn`). Abre `#power-advanced-panel` con:
   - selector **marca** + **componente** poblado desde `device_docs.json`;
   - por entrada: **rangos seguros** (`safe_range_rules`), **links a docs
     oficiales** (abren en navegador externo vía `window.rog.openExternal` o
     `window.open`), y la **fuente** citada;
   - carga vía `window.rog.getDeviceDocs()` si existe, si no `fetch()` de varias
     rutas relativas; **tolera ausencia** del archivo (mensaje claro y sigue
     permitiendo ajustar dentro de rangos seguros);
   - `normalizeDocs()` acepta varias formas de JSON (array, `entries`, `docs`,
     `vendors{}`, plano `{marca:{componente:{}}}`) por si A-POWER-BE cambia el
     esquema;
   - check **"Entiendo los riesgos"** (`#power-advanced-ack`): con el panel
     abierto, `refreshApplyState()` deshabilita APLICAR hasta marcarlo;
     `applyPower()` lo revalida y avisa por toast si falta.
6. **i18n** — todo texto nuevo pasa por `t()`/`tf()` (fallback español si la
   clave aún no está cableada). Además se registran TODAS las claves nuevas con
   `window.i18n.register({clave:{es,en,…}})` dentro de `power.js`
   (`registerPowerUiKeys()`), para que funcionen aunque el orquestador no las
   consolide. Las claves visibles cortas llevan los 8 idiomas; el resto es+en
   (el motor cae a `es` si falta un idioma).

## Pendiente / fuera de alcance

- `device_docs.json` lo crea A-POWER-BE; aquí solo se consume con tolerancia a
  su ausencia. El IPC `window.rog.getDeviceDocs()` / `window.rog.openExternal()`
  los expone main.js/preload (orquestador); si no están, hay fallback por fetch
  y `window.open`.
- Consolidar/traducir las claves es+en a los 8 idiomas en `i18n.js` (orquestador).
- Verificación visual en la app real (no ejecutada aquí). `node --check` pasa.

## Decisiones

- `--danger` se declara en `.modal-card` del Centro de Poder con fallback, para
  no depender de que el tema/`neon.css` (prohibido tocar) lo declare.
- Reusé las clases `.power-advanced-toggle` (offsets, preexistente) y las nuevas
  `.power-advanced-*` (panel) sin colisión de nombres.
- La franja de peligro se actualiza en cada `recordChange` (no solo al aplicar),
  para que el usuario vea la consecuencia mientras mueve el slider.
- `index.html` tocado solo dentro de `<!-- v13 POWER-UI -->`.

## Claves i18n nuevas (es / en)

| clave | es | en |
|---|---|---|
| power.advancedBtn | Avanzado | Advanced |
| power.safetyRails | Tu equipo está protegido… (doble recorte app+firmware) | Your machine is protected… (double clamp) |
| power.danger.heading | Peligro: revisa qué vas a mover | Danger: review what you’re about to change |
| power.danger.moved | Moviste {label} {from}→{to} {unit} | You moved {label} {from}→{to} {unit} |
| power.danger.beyondSafe | Fuera del rango seguro: requiere confirmación adicional al aplicar. | Outside the safe range: requires extra confirmation when applying. |
| power.danger.railsNote | Cada valor se recorta al rango seguro… reinicia y usa Reset a fábrica. | Every value is clamped to the safe range… reboot and use Factory Reset. |
| power.danger.pl1.up | PL1 muy alto: la CPU se mantiene caliente… throttling. | PL1 too high: the CPU stays hot… throttling. |
| power.danger.pl2.up | PL2 muy alto: picos de temperatura… throttling y ruido. | PL2 too high: sharper temperature spikes… throttling and fan noise. |
| power.danger.dynamic_boost.up | Dynamic Boost muy alto: la GPU consume y se calienta más. | Dynamic Boost too high: GPU draws more and runs hotter. |
| power.danger.thermal_target.up | Techo térmico muy alto: la GPU correrá más caliente. | Thermal ceiling too high: the GPU will run hotter. |
| power.danger.base_clock_offset.up | Offset base muy alto (OC): inestabilidad, artefactos, cuelgues. | Base clock offset too high (OC): instability, artifacts, crashes. |
| power.danger.mem_clock_offset.up | Offset de memoria muy alto: artefactos y cierres de juego. | Memory offset too high: artifacts and game crashes. |
| power.danger.pl1.down | PL1 muy bajo: la CPU rinde mucho menos en cargas largas. | PL1 too low: CPU performs much worse on sustained loads. |
| power.danger.pl2.down | PL2 muy bajo (bajo PL1): la ráfaga deja de tener efecto. | PL2 too low (below PL1): the burst stops having effect. |
| power.danger.dynamic_boost.down | Dynamic Boost muy bajo: menos FPS. | Dynamic Boost too low: fewer FPS. |
| power.danger.thermal_target.down | Techo térmico muy bajo: throttling antes, menos rendimiento. | Thermal ceiling too low: throttles sooner, less performance. |
| power.danger.base_clock_offset.down | Offset base muy bajo (undervolt): congelarse/apagarse/reiniciar. | Base clock offset too low (undervolt): freeze/power-off/reboot. |
| power.danger.mem_clock_offset.down | Offset de memoria muy bajo: pérdida de ancho de banda. | Memory offset too low: bandwidth loss. |
| power.confirm.title | CENTRO DE PODER — Confirmar cambios | POWER CENTER — Confirm changes |
| power.confirm.onlyChanged | Vas a aplicar SOLO estos cambios: | You’re applying ONLY these changes: |
| power.confirm.rails | Los valores van acotados a los rangos seguros (doble recorte)… | Values are clamped to the safe ranges (double clamp)… |
| power.confirm.question | ¿Aplicar? | Apply? |
| power.confirm.beyondTitle | CONFIRMACIÓN ADICIONAL — Fuera del rango seguro | EXTRA CONFIRMATION — Outside the safe range |
| power.confirm.beyondBody | Estos valores superan el rango seguro… riesgo MAYOR: | These values exceed the safe range… HIGHER risk: |
| power.confirm.beyondQuestion | ¿Aplicar fuera del rango seguro? | Apply outside the safe range? |
| power.advanced.intro | Modo avanzado: elige marca y componente… consulta la fuente oficial. | Advanced mode: pick brand and component… check the official source. |
| power.advanced.unavailable | La base de documentación aún no está disponible… | The device documentation database isn’t available yet… |
| power.advanced.brand | Marca | Brand |
| power.advanced.component | Componente | Component |
| power.advanced.safeRangeRules | Rangos seguros | Safe ranges |
| power.advanced.officialDocs | Documentación oficial | Official documentation |
| power.advanced.source | Fuente | Source |
| power.advanced.ack | Entiendo los riesgos | I understand the risks |
| power.advanced.needAck | Marca "Entiendo los riesgos" en el panel Avanzado para aplicar. | Tick “I understand the risks” in the Advanced panel to apply. |
| power.advanced.cc.cpuLaptop | CPU (portátil) | CPU (laptop) |
| power.advanced.cc.cpuDesktop | CPU (escritorio) | CPU (desktop) |
| power.advanced.cc.gpuLaptop | GPU (portátil) | GPU (laptop) |
| power.advanced.cc.gpuDesktop | GPU (escritorio) | GPU (desktop) |
| power.reset.title / power.reset | RESET A FÁBRICA | FACTORY RESET |
| power.reset.body | Restaura los límites de potencia a los valores de fábrica… | Restores power limits to the factory values… |
| power.reset.question | ¿Continuar? | Continue? |
| power.resetting | RESETEANDO… | RESETTING… |
| power.apply | APLICAR | APPLY |
| power.applying | APLICANDO… | APPLYING… |
| power.err | Error | Error |
| power.err_fetch | No se pudo obtener el estado de potencia | Could not read the power state |
| power.err_no_response | Sin respuesta del backend | No response from the backend |
| power.err_apply | No se aplicó | Not applied |
| power.err_reset | No se pudo resetear | Could not reset |
| power.err_unknown | error desconocido | unknown error |
| power.notAvailableConfig | No disponible en esta configuración | Not available in this configuration |
| power.consentRecover | Si el sistema se cuelga tras aplicar, reinicia. | If the system hangs after applying, reboot. |

> Nota: algunas claves de error/acción/reset pueden ya existir en el CORE de
> i18n.js; el registro local es aditivo (`Object.assign` por idioma) y no pisa
> idiomas ya presentes salvo el mismo idioma. Revisar al consolidar.

## Checklist de aceptación §A-POWER-UI

- [x] Aplicar solo-DynamicBoost dice solo eso (detección por-cambio).
- [x] Franja de peligro con consecuencias concretas por control (`--danger`).
- [x] Rieles de seguridad / doble recorte visibles y honestos.
- [x] Doble consentimiento para exceder el rango seguro (offsets + al aplicar).
- [x] Botón "Avanzado" a la derecha del título.
- [x] Panel avanzado: marca + componente, links a docs oficiales, rangos seguros
      desde device_docs.json (tolera ausencia).
- [x] Check "Entiendo los riesgos" deshabilita Aplicar hasta marcarlo.
- [x] Todo texto vía `t()`/`tf()` + claves registradas con `window.i18n.register`.
- [x] `node --check desktop/renderer/power.js` pasa.
- [x] Sin datos personales.
