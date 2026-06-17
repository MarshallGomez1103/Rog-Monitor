# Build spec v13 — multiagente (orquesta: Opus)

Objetivo de la versión: dejar la app **lista para publicar open source** —
sin datos personales, idiomas completos, versión unificada, roadmap honesto— y
subir de nivel **Centro de Poder (seguro)**, **Sesión de juego/benchmarks**,
**Núcleos/Procesos** y los **bugs de perfiles/idioma**.

> Reglas de oro (heredadas de AGENTS.md): **NUNCA `git push`**. Solo commit.
> No telemetría. Nada de rutas `/home/<usuario>` hardcodeadas. Archivar, no borrar.

---

## 0. Reglas para TODA instancia

1. **Trabajas SOLO en tu worktree y tu rama** (ver tu sección). No toques `master`.
2. **Commitea seguido** con mensajes claros (`feat(area): …`, `fix(area): …`).
   Tus commits en tu rama son la única memoria durable si la sesión se corta.
3. Al terminar (o si te cortan), escribe/actualiza **`docs/progress/<tu-id>.md`**
   en tu worktree con: qué quedó hecho, qué falta, decisiones, archivos tocados,
   y un checklist de los criterios de aceptación de tu sección. Commitea ese
   archivo. El orquestador lo lee para fusionar/retomar.
4. **NO toques estos archivos** (los integra el orquestador para evitar
   colisiones): `desktop/renderer/i18n.js`, `desktop/renderer/app.js`,
   `desktop/renderer/styles/neon.css`, `desktop/renderer/roadmap.js`,
   `desktop/package.json`, `README.md`, `CHANGELOG.md`, `docs/HANDOFF.md`,
   `docs/roadmap.md`.
5. **i18n**: NO edites `i18n.js`. En tu código usa `t('clave', 'Texto español
   de respaldo')` (la función global `t` ya existe; si abres ventana nueva,
   reexpón el mismo motor). Al final, **lista en tu `progress/<id>.md` TODAS las
   claves nuevas** con su texto en español e inglés; el orquestador las cablea
   en `i18n.js` en los 8 idiomas. Todo texto visible nuevo DEBE pasar por `t()`.
6. **Sin datos personales** en nada que escribas: nada de "Marshall", "Redragon",
   ni el modelo exacto del equipo del dueño como si fuera el único. Textos
   genéricos para cualquier usuario.
7. Mantén el contrato NDJSON del backend y los shapes IPC existentes; si agregas
   campos, que sean aditivos y opcionales.
8. `index.html`: evítalo. Prefiere DOM creado por JS o un `.html` nuevo propio.
   Si es inevitable, edita solo dentro de un bloque `<!-- v13 <TU-ID> ... -->`.

---

## A-POWER-UI — Centro de Poder seguro (UI)  ·  rama `v13/power-ui`
**Dueño de:** `desktop/renderer/power.js`, `desktop/renderer/styles/power.css`.
Lee primero esos archivos enteros y `device_profiles.json`.

Qué construir:
1. **Detección por-cambio**: al "Aplicar", detecta qué controles cambiaron
   respecto al estado leído. El resumen de confirmación habla SOLO de lo que
   moviste (ej.: "Moviste GPU Dynamic Boost 25→18 W"). No menciones lo que no
   tocaste.
2. **Aviso de PELIGRO** antes de aplicar: una franja con color de peligro
   (`--danger`, defínelo en power.css si falta) que liste, por cada control
   cambiado, la **consecuencia concreta** de subirlo mucho o bajarlo mucho
   (ej. PL2 muy alto → más calor/throttling; techo térmico muy alto → la GPU
   corre más caliente; offset de reloj muy alto → inestabilidad/cuelgues).
3. **Rieles de seguridad**: la UI debe DEJAR CLARO que el equipo está protegido:
   los valores se recortan al rango seguro del dispositivo (doble recorte) y el
   firmware impone topes propios. Texto tranquilizador pero honesto.
4. **Rango seguro vs absoluto**: respeta `min/max` (seguro). Para exceder hacia
   `abs_min/abs_max` exige **doble consentimiento** explícito (ya existe la idea
   para offsets GPU; aplícala consistente).
5. **Modo AVANZADO**: botón "Avanzado" a la derecha del título "Centro de Poder".
   Abre un panel donde el usuario elige **marca** (ASUS, Lenovo, Gigabyte, MSI,
   HP, Dell, Acer…) y **componente** (CPU/GPU, laptop o escritorio) y muestra los
   **enlaces a documentación oficial** y los **rangos seguros** que provee
   A-POWER-BE en `src/rog_monitor/device_docs.json` (consúmelo vía un IPC nuevo
   `window.rog.getDeviceDocs()` que expondrá main.js/preload — coordínalo; si no
   está listo, léelo con fetch del archivo). Avanzado debe requerir que el
   usuario **lea** (un check "Entiendo los riesgos" deshabilita el aplicar hasta
   marcarlo).
Aceptación: aplicar solo-DynamicBoost dice solo eso; hay franja de peligro con
consecuencias; avanzado lista marcas/componentes con links y rangos; nada se
aplica sin consentimiento; todo texto vía `t()`.

---

## A-POWER-BE — Backend de poder + perfiles↔poder + DB de docs  ·  rama `v13/power-be`
**Dueño de:** `src/rog_monitor/power_control.py`, `src/rog_monitor/device_profiles.json`,
`src/rog_monitor/fans.py`, `scripts/apply-power-control.sh`,
`scripts/enable-cpu-power.sh`. **Crea** `src/rog_monitor/device_docs.json`.

Qué construir:
1. **Perfiles aplican PODER REAL** (decisión del dueño): cuando el sistema
   cambia entre `quiet`/`balanced`/`performance`, además de las curvas de
   ventilador se aplican límites de poder CPU/GPU **desde los rangos seguros ya
   calibrados** (device_profiles.json), con **doble recorte**. Define por perfil
   un set de valores (PL1/PL2/dynamic_boost/thermal_target) tal que:
   - **Ahorro (quiet)**: límites BAJOS → el equipo **no puede** calentarse como en
     performance. Coherente con su curva de ventilador.
   - **Balanced**: intermedio.
   - **Performance**: hasta el máximo seguro de fábrica.
   Estos sets viven en device_profiles.json (campo nuevo `profile_power` por
   dispositivo) y se aplican vía pkexec (mismo camino que hoy). Nunca exceden el
   rango seguro. Documenta el rango térmico estimado por perfil.
2. **Curvas de ventilador**: buenos **valores predeterminados** por perfil para
   usuarios que no quieren tocar curvas, coherentes con (1): en Ahorro el tope de
   temperatura objetivo es menor. Mantén histéresis existente.
3. **`device_docs.json`** (extensible, NO hace falta cada SKU): por marca y clase
   de componente (CPU-laptop, CPU-desktop, GPU-laptop, GPU-desktop), incluye:
   `vendor`, `component_class`, `safe_range_rules` (texto + límites conservadores
   genéricos), y `official_docs` (lista de `{title, url}` a páginas OFICIALES:
   Intel ARK, AMD product pages, NVIDIA specs, ASUS/Lenovo/Gigabyte/MSI soporte).
   Usa WebSearch/WebFetch para verificar URLs reales y rangos. Estructura pensada
   para que la comunidad agregue más. Cita la fuente en cada entrada.
Aceptación: cambiar de perfil cambia poder real con recorte seguro; Ahorro topa
más bajo que Performance; device_docs.json válido (json) con links que resuelven;
sin datos personales.

---

## A-GAME — Sesión de juego + Benchmarks (visual + features)  ·  rama `v13/game`
**Dueño de:** `desktop/renderer/game-session.js`, `desktop/renderer/styles/game-session.css`,
`desktop/renderer/bench-detail.js`, `desktop/renderer/styles/extras.css` (solo
sección de tarjetas de benchmark), `src/rog_monitor/game_session.py`. Lee
`bench-detail.js` para COPIAR el estilo de gráfica neón (imagen 4 del dueño es
ese look; la sesión de juego —imagen 3— se ve negra y fea: igualar al neón).

Qué construir:
1. **Gráficas neón** en el resumen de sesión de juego, idénticas en calidad a las
   de benchmark (`bench-detail.js`): degradado bajo la curva, color por métrica,
   ejes legibles, grilla `--chart-grid`.
2. **Clic en una gráfica → se abre SOLA y grande** (modal estilo NÚCLEOS) con
   **zoom/scroll** para sesiones largas (110 min). Poder navegar el tiempo.
3. **Comparación**: el dueño graba una sesión **baseline (original)** y otra
   **nueva** tras ajustar CPU/GPU. Al entrar se muestran **3 paneles**: original,
   nueva, y **tabla de comparación en %** ("CPU 15% más fría", "menos potencia
   GPU", etc.). Clic en una gráfica compara esa métrica de ambas superpuestas.
4. **Costo en $**: calcula energía consumida (∫ potencia CPU+GPU dt) y muéstrala
   en dinero. Precio configurable: campo editable `$/kWh` (default **0.15 USD**,
   persistido en config). Muestra costo en USD; si el locale es es-CO, ofrece
   también COP (tasa editable). Es "por molestar", que sea claro y opcional.
5. **Notas**: campo de notas pequeño por sesión (persistido), sin ocupar mucho.
6. **Tarjetas de benchmark (historial)**: los cuadritos de color (CPU/GPU/etc.)
   se **salen a la derecha** (imagen del dueño). Alinéalos a la derecha y que NO
   desborden; estilo consistente entre tarjetas.
Aceptación: gráficas de sesión = neón; clic abre grande con zoom; existe
comparación original/nueva/%; hay costo $ configurable; hay notas; cuadritos no
desbordan; textos vía `t()`.

---

## A-CORES — Núcleos + datos por núcleo  ·  rama `v13/cores`
**Dueño de:** `desktop/renderer/cores.js`, `desktop/renderer/styles/cores.css`,
`src/rog_monitor/procs.py` (datos por núcleo: freq y temp por núcleo si el HW lo
expone). Lee `cores.js` y cómo se emiten los núcleos hoy.

Qué construir:
1. **Más neón** en el modal de núcleos (que se entiendan los botones/celdas).
2. **Rendimiento vs Eficiencia distintos**: los P-cores con estética "deportiva"
   y los E-cores "ecológica" (color/ícono/acento diferentes). Si la CPU no
   distingue tipos, degradar elegante.
3. **GHz en la propia celda/gráfica** del núcleo (NO toast). **Elimina el toast
   que aparece/desaparece cada segundo** en hover.
4. **Clic en un núcleo → ventana de detalle** (modal): qué procesos corren en ese
   núcleo, su uso %, frecuencia, temperatura; se actualiza cada segundo sin toast.
5. Todo texto (NÚCLEOS, rendimiento/eficiencia, etc.) vía `t()` (lista claves).
Aceptación: P/E cores se ven distintos; GHz inline; sin toast molesto; clic abre
detalle por núcleo; traducible.

> Nota: la separación del **% total vs % por núcleo en la TABLA DE PROCESOS**
> (no en este modal) la hace el orquestador en `app.js`. No la toques aquí.

---

## INTEGRACIÓN — la hace el orquestador (Opus) en master
- `app.js`: **fix rebote de perfiles** (perfil pendiente "pegajoso" hasta que el
  backend confirme el mismo; unificar nombres `quiet`↔`power-saver`); **procesos
  en 2 columnas** (`% CPU` total y `% NÚCLEO`); **alertas estandarizadas**
  (misma cuadrícula/estilo, filas alineadas); nitidez del **neón de los números**
  de temperatura.
- `index.html`: `data-i18n` en TODOS los `<h2>` de bloque (Ventiladores,
  Iluminación, Historial, Sistema, Eventos) y cualquier texto suelto.
- `i18n.js`: cablear todas las claves nuevas de las 4 ramas en los 8 idiomas.
- `neon.css`: nitidez de números + **fix del timeline del roadmap** (bolitas
  centradas en la línea; neón sin cortarse en el margen izquierdo).
- `roadmap.js` + `docs/roadmap.md`: **roadmap real** (Hecho con fechas / Ahora /
  Próximo). Quitar pasos personales/Redragon/Asus-específicos. Incluir idea
  futura: **monitoreo multi-equipo / centro de datos vía agente servidor**
  (NO implementar ahora). Historial honesto: v1→v2→(saltó a)v5→…→v13.
- **Versión unificada = v13.0.0** (fuente única: package.json; roadmap.js y UI
  derivan de ahí).
- **Scrub global** de "Marshall"/"Redragon"/modelo personal en código y docs.
- Actualizar README, CHANGELOG, HANDOFF, AGENTS si aplica.
