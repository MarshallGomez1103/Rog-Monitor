# ROG Monitor — Plan maestro verificable post-auditoría (v22 propuesta)

> **Estado:** PROPUESTA DE TRABAJO · **Origen:** paquete `rog-monitor-auditoria-post90.zip` del 2026-10-10 · **Base auditada:** `7d49333` (v21 local) · **No equivale a validación propia del checkout:** AEVA analizó el ZIP de informes y logs; **no recibió el código fuente completo** ni ejecutó el proyecto. Cada agente debe revalidar el HEAD actual antes de tocar código.
>
> **Destino:** colocar este archivo como `PLAN_MAESTRO_ROG_MONITOR.md` en la raíz, versionarlo tras revisión humana. **No ejecutar los 100 checkpoints de manera autónoma sin gates.**

## 1. Visión y alcance

Convertir ROG Monitor en un monitor Linux/ASUS ROG estable, ligero, verificable, con métrica y visualización coherentes, TUI resistente, GUI clara, overlay configurable y control de hardware seguro. **No reescribir desde cero.** Priorizar seguridad del host y exactitud frente a estética. El plan existente de 90 checkpoints **ya fue ejecutado** y es insumo histórico; este documento representa el trabajo restante con base en la auditoría posterior.

### Qué sabemos, según informes del ZIP (evidencia de segunda mano)

| Observación reportada | Evidencia principal | Estado de confianza |
|---|---|---|
| HEAD `7d49333`, master 54 commits por delante del upstream local `fbfee52` y 124 archivos cambiados | `01-GIT-FORENSICS.md`, `14-LOCAL-VALIDATION-AND-PUBLISH-GATES.md` | Observado por agente; **sin `git fetch`**: remoto no comprobado |
| Python **162/162**, Node **46/46** (usando glob), smoke Electron **29/29**, traducciones **1009 claves × 8** | `11-TESTS-CI-BENCHMARKS.md`, `evidencia/test-*` | Probado por el agente; primera corrida Python falló por aislamiento de `rich` |
| Backend: media CPU base 3.53% / HEAD 3.65%; spawns 1.47/s → 0.18/s; periodo 1s → gap real ~1128ms | `11-TESTS-CI-BENCHMARKS.md`, `evidencia/measure-backend-interval1-HEAD.txt` | Medición con ruido; **no prueba mejora de CPU** |
| CPU utilization no se ve en tarjeta CPU; RAM/swap histórico en %, serie autoescala y hay duplicación | `05-METRICS-PIPELINE.md`, `06-GUI-UX-CHARTS.md` y capturas del propietario | Código observado + experiencia reportada |
| Stream esquema 1 transmite historial completo por muestra; carece de timestamps fiables de frescura | `04-REAL-ARCHITECTURE.md`, `12-TECHNICAL-DEBT.md` | Código observado por agente |
| Overlay Electron existe, pero no se probó en KDE Wayland ni sobre juegos; persistencia limitada | `07-OVERLAY-AUDIT.md` | Código observado; funcionalidad real no probada |
| TUI corrige entradas erráticas en pruebas PTY, pero sin TTY puede consumir ~94% CPU | `08-TUI-AUDIT.md`, `15-HANDOFF-FOR-AEVA.md` | Prueba reportada y fallo observado |
| Guardián en simulación, no validado en modo real; conflicto posible con asusd/profile-sync y restauración incompleta | `09-GUARDIAN-HARDWARE.md` | Riesgo crítico; **no habilitar** |
| Instalador VM, recuperación TTY y pipeline CI remoto: sin verificar | `10-INSTALLER-OS-SAFETY.md`, `14-LOCAL-VALIDATION-AND-PUBLISH-GATES.md` | Pendientes; **bloquean publicación estable** |

### Arquitectura actual reconstruida por auditoría

```text
/proc /sys NVML smartctl/etc.
          │
          ▼
Python src/rog_monitor/ (CPU/GPU/sysinfo/hwmon/cache/history)
          │ JSON lines: schema 1, historial completo
          ├─────────────────► TUI rich.Live
          ▼
Electron desktop/main.js ─► preload.js (IPC) ─► renderer/app.js / dashboard / canvas
        │                                  └──► overlay BrowserWindow
        ▼
desktop/priv.js ─► pkexec ─► rog-ctl.sh root-owned ─► helpers de hardware
        ▲                           ▲
        └──── Python power_control.py (segunda ruta a verificar)
systemd: rog-profile-sync, rog-thermal-guardian, rog-battery-limit, etc.
```

**Orientación:** separar responsabilidades mediante módulos graduales, contratos y dependencias explícitas, no introducir Clean Architecture ornamental ni cambiar de stack.

## 2. Reglas innegociables para agentes

1. **No ejecutar `sudo`, `pkexec`, `systemctl enable/start`, `modprobe`, scripts de instalación, cambios en `/sys`, modificaciones de arranque, reboots ni uninstall en el host** sin una autorización humana concreta para cada acción. `--dry-run` puede inspeccionarse primero; nunca asumir que es inocuo.
2. **No hacer push, merge, tag, force-push, rebase destructivo, reset --hard ni borrar branches** sin autorización del propietario. Siempre crear bundle y verificar.
3. Inspeccionar `AGENTS.md`, instrucciones del repo, ADRs, `docs/roadmap.md`, historial y `docs/agent-work` cuando estén disponibles; no confiar en el estado marcado DONE.
4. **Un checkpoint = una unidad verificable, preferentemente un commit**. No acumular 10 cambios heterogéneos en un commit. Checkpoints con hardware privilegiado se trabajan primero con fakes.
5. Antes de implementar, enlazar evidencia `archivo:línea`, causa y test que falla (salvo UX, donde se exige baseline visual).
6. **Nunca alterar valores reales de potencia, ventiladores, batería o térmicos** durante test automático. Mocks/fake sysfs/VM aislada con snapshot.
7. Capturar estado de soporte (ASUS/no ASUS, NVML/no NVML, SMART/no SMART, Linux Wayland/X11) y distinguir 0, N/A, stale, no permitido y error.
8. Mantener compatibilidad TUI/GUI/overlay de contratos mientras se migra; validar las tres superficies.
9. Toda tarea debe declarar rollback, test de regresión, métricas antes/después si rendimiento, y documentación impactada.
10. Proteger secretos, hostnames, seriales, UUID, capturas privadas y logs: sanitizar evidencias que se compartan o versionen.

## 3. Protocolo persistente: exactamente diez checkpoints por fase

Crear (si no existe) `docs/agent-work/v22/STATUS.md`, `DECISIONS.md`, `EVIDENCE.md`, `HANDOFF.md`, `RISKS.md` y `checkpoints/`. **Estos son nuevos artefactos a versionar si están sanitizados**; no reescribir el historial ignorado de los 90 CP. Guardar los logs pesados en `.ai/private/rog-v22/` ignorado, o fuera del repositorio.

**Formato de cada ficha** `docs/agent-work/v22/checkpoints/Fx-yy.md`:

```md
# F2-03 — RAM GiB
Estado: TODO | DOING | BLOCKED | TESTED | ACCEPTED
Agente: ... | Base SHA: ... | Commit SHA: ...
Objetivo:
Evidencia previa: rutas archivo:línea + enlace a informe del ZIP
Cambios previstos / archivos afectados:
Tests primero (comando exacto):
Implementación y resultado:
Criterios de aceptación (checklist):
Antes/después (captura/CSV si aplica):
Riesgos y rollback:
Limitaciones / no verificado:
Siguiente checkpoint desbloqueado:
```

**Handoff al agotar contexto:** escribir `HANDOFF.md` antes de cerrar sesión: HEAD, rama, árbol limpio/sucio, último CP completado, tests ejecutados con RC, archivos pendientes, decisiones, riesgos y siguiente comando seguro. Al retomar: leer `STATUS`, `HANDOFF`, ADRs y `git status` **antes** de ejecutar acciones. Los agentes implementadores no se autoconceden gates humanos.

**Roles sugeridos:** coordinador/arquitecto; seguridad Linux; backend de telemetría; frontend GUI/UX; overlay/compatibilidad; TUI; QA/performance; release/documentación. Un agente integra y reconcilia; subagentes pueden leer o trabajar en ramas/worktrees separados con interfaces acordadas, nunca editar el mismo archivo simultáneamente.

**Definición de DONE:** cambio implementado, test unitario/contrato, integración pertinente, evidencia guardada, sin regresión, documentación y rollback, aprobación de revisión cuando aplique. La ausencia de test manual se marca **PARTIAL**, no DONE.

## 4. Dependencias, orden sugerido y gates

`F0 → F1 (seguridad mínima) → [F2 + F3] → [F4 + F5] → F6 → F7 → F8 → F9`.

- **Gate A — antes de escribir:** respaldo Git, baseline reproducible y matriz de riesgos del host (`F0`).
- **Gate B — antes de instalaciones/operaciones privilegiadas:** corregir rutas y recuperación, VM con snapshot y aprobación humana (`F1`).
- **Gate C — antes de contratos nuevos:** fixtures y compatibilidad schema 1↔2; no migrar todo a la vez (`F2/F3`).
- **Gate D — antes de declarar overlay compatible:** pruebas reales Wayland/X11 sobre aplicaciones y juegos (`F6`).
- **Gate E — antes de habilitar Guardian real:** un único dueño por atributo + restauración comprobada + permiso humano separado (`F7`).
- **Gate F — antes de publicar:** pruebas, CI real en PR, checklist VM/TTY, revisión de diffs root (`F9`).

**Publicación:** primer push solo a rama de release y con permiso expreso. No publicar directo a `master`. El informe `14` propone que el propietario haga el push; adoptar esa política por defecto.

## 5. Checkpoints ejecutables (100 nuevos, no repetir los 90 históricos)

Cada checkpoint tiene ID estable, implementación objetivo y salida verificable. **El agente debe confirmar la ruta/función exacta contra su checkout vigente antes de editar.**

### F0 · Congelar, respaldar y reproducir — prioridad P0
- [ ] **F0-01 — Registrar Git y versión.** Trabajo: git status, remotos, HEAD, tags, upstream y working tree; comparar con informe 01. **Aceptación:** snapshot Git firmado y diferencias anotadas. Evidencia: ficha `F0-01.md`, test/log/captura y commit identificado.
- [ ] **F0-02 — Respaldo reversible.** Trabajo: crear git bundle --all y copia separada de archivos ignorados; verificar restaurabilidad sin reset. **Aceptación:** bundle verificable y ubicación documentada. Evidencia: ficha `F0-02.md`, test/log/captura y commit identificado.
- [ ] **F0-03 — Conciliar 54 commits.** Trabajo: git fetch origin solo con permiso de red, comparar ancestry y 54 commits reportados. **Aceptación:** tabla actualizada de commits y cambios remotos. Evidencia: ficha `F0-03.md`, test/log/captura y commit identificado.
- [ ] **F0-04 — Crear rama de trabajo.** Trabajo: rama feature sin alterar master, sin push. **Aceptación:** rama nombrada y working tree limpio. Evidencia: ficha `F0-04.md`, test/log/captura y commit identificado.
- [ ] **F0-05 — Preparar entorno limpio.** Trabajo: venv con rich y dependencias bloqueadas; documentar Node/Electron. **Aceptación:** 162 tests reproducibles sin user site. Evidencia: ficha `F0-05.md`, test/log/captura y commit identificado.
- [ ] **F0-06 — Baseline tests Python.** Trabajo: ejecutar suite y archivar logs y versiones. **Aceptación:** todas las pruebas pasan o fallos triados. Evidencia: ficha `F0-06.md`, test/log/captura y commit identificado.
- [ ] **F0-07 — Baseline Node/i18n.** Trabajo: ejecutar glob de tests, validación i18n y sintaxis. **Aceptación:** 46 pruebas o diferencias justificadas. Evidencia: ficha `F0-07.md`, test/log/captura y commit identificado.
- [ ] **F0-08 — Baseline e2e.** Trabajo: ejecutar smoke con entorno controlado, capturas y logs. **Aceptación:** 29 assertions o diferencias documentadas. Evidencia: ficha `F0-08.md`, test/log/captura y commit identificado.
- [ ] **F0-09 — Baseline métricas.** Trabajo: medir backend/TUI/Electron 3×120s a 1s con host equivalente y ruido registrado. **Aceptación:** tabla media/p95 RSS/PSS, intervalos, spawns, errores. Evidencia: ficha `F0-09.md`, test/log/captura y commit identificado.
- [ ] **F0-10 — Triage y decisiones.** Trabajo: crear matriz de defectos y ADR inicial de seguridad. **Aceptación:** P0/P1/P2 y bloqueos priorizados. Evidencia: ficha `F0-10.md`, test/log/captura y commit identificado.

**Gate F0:** no cerrar la fase con checkpoints en estado PARTIAL/BLOCKED; registrar excepciones y aprobación explícita.

### F1 · Seguridad del SO y vías privilegiadas — prioridad P0
- [ ] **F1-01 — Revisar helper root.** Trabajo: auditar rog-ctl, rog-py, PATH, env, argv, symlinks y ownership. **Aceptación:** amenazas y tests de inputs. Evidencia: ficha `F1-01.md`, test/log/captura y commit identificado.
- [ ] **F1-02 — Unificar validación de versiones.** Trabajo: reconciliar priv.js y power_control.py frente a libexec. **Aceptación:** dos rutas rechazan helper incompatible. Evidencia: ficha `F1-02.md`, test/log/captura y commit identificado.
- [ ] **F1-03 — Proteger instalación.** Trabajo: hacer opt-in profile-sync y RAPL, revisar permisos y reversibilidad. **Aceptación:** dry-run sin activar hardware por defecto. Evidencia: ficha `F1-03.md`, test/log/captura y commit identificado.
- [ ] **F1-04 — Arreglar RECOVERY.** Trabajo: alinear comandos documentados con safe-mode instalado y acciones reales. **Aceptación:** instrucciones correctas y reproducibles. Evidencia: ficha `F1-04.md`, test/log/captura y commit identificado.
- [ ] **F1-05 — Arreglar uninstall.** Trabajo: preferir copia root-owned de safe-mode y rollback consistente. **Aceptación:** pruebas de uninstall en prefijo aislado. Evidencia: ficha `F1-05.md`, test/log/captura y commit identificado.
- [ ] **F1-06 — Escritura atómica.** Trabajo: config.json y fan-curves.json vía tmp+fsync+rename con recovery. **Aceptación:** fallos simulados sin archivos truncados. Evidencia: ficha `F1-06.md`, test/log/captura y commit identificado.
- [ ] **F1-07 — Limitar procesos sync.** Trabajo: timeouts para spawnSync y operaciones potencialmente bloqueantes. **Aceptación:** UI no se congela frente a comando colgado. Evidencia: ficha `F1-07.md`, test/log/captura y commit identificado.
- [ ] **F1-08 — VM con snapshot.** Trabajo: instalar/reiniciar/desactivar/desinstalar en Fedora/Bazzite VM, previo permiso. **Aceptación:** arranque exitoso y log de restauración. Evidencia: ficha `F1-08.md`, test/log/captura y commit identificado.
- [ ] **F1-09 — Prueba TTY recovery.** Trabajo: simular error de servicio y restaurar exclusivamente en VM. **Aceptación:** pasos de recuperación repetibles. Evidencia: ficha `F1-09.md`, test/log/captura y commit identificado.
- [ ] **F1-10 — Gate humano de root.** Trabajo: inspección explícita de diffs de scripts/systemd antes de release. **Aceptación:** aprobación escrita del propietario. Evidencia: ficha `F1-10.md`, test/log/captura y commit identificado.

**Gate F1:** no cerrar la fase con checkpoints en estado PARTIAL/BLOCKED; registrar excepciones y aprobación explícita.

### F2 · Contrato y exactitud de telemetría — prioridad P1
- [ ] **F2-01 — Mapa de métricas.** Trabajo: documentar campo/fuente/unidad/frecuencia/coste para CPU RAM swap disk GPU. **Aceptación:** contrato versionado y fixtures. Evidencia: ficha `F2-01.md`, test/log/captura y commit identificado.
- [ ] **F2-02 — CPU usage directo.** Trabajo: hacer visible usage % en CPU tile preservando temperatura; total/per-core. **Aceptación:** tile muestra uso y °C simultáneamente. Evidencia: ficha `F2-02.md`, test/log/captura y commit identificado.
- [ ] **F2-03 — RAM GiB.** Trabajo: guardar used/available/total en GiB y modo porcentaje configurable. **Aceptación:** 13.5/47 GiB congruente con /proc/meminfo. Evidencia: ficha `F2-03.md`, test/log/captura y commit identificado.
- [ ] **F2-04 — Swap GiB.** Trabajo: guardar y dibujar used/total; caso total=0. **Aceptación:** sin división cero; etiqueta 'sin swap'. Evidencia: ficha `F2-04.md`, test/log/captura y commit identificado.
- [ ] **F2-05 — Ejes y dominios.** Trabajo: porcentajes siempre 0..100; GiB 0..total; límites coherentes. **Aceptación:** snapshot visual con escala correcta. Evidencia: ficha `F2-05.md`, test/log/captura y commit identificado.
- [ ] **F2-06 — Disk I/O.** Trabajo: mostrar IOPS, MB/s y busy solo cuando fuente existe. **Aceptación:** unidades y degradación sin disco elegible. Evidencia: ficha `F2-06.md`, test/log/captura y commit identificado.
- [ ] **F2-07 — Corregir red.** Trabajo: clamp frente a counter-reset, wrap y cambio de interfaz. **Aceptación:** tasas no negativas y tests. Evidencia: ficha `F2-07.md`, test/log/captura y commit identificado.
- [ ] **F2-08 — Timestamps y stale.** Trabajo: ts por muestra, edad y estado stale para caché TTL. **Aceptación:** congelación distinguible de cero real. Evidencia: ficha `F2-08.md`, test/log/captura y commit identificado.
- [ ] **F2-09 — Schema 2 compatible.** Trabajo: mensajes snapshot inicial + delta de historia sin romper clientes schema 1. **Aceptación:** contract tests TUI/Electron/overlay con negociación. Evidencia: ficha `F2-09.md`, test/log/captura y commit identificado.
- [ ] **F2-10 — Backpressure y reconexión.** Trabajo: parser robusto, límites de buffer, backend caído y recuperación. **Aceptación:** sin crecimiento ilimitado de RAM ni UI engañosa. Evidencia: ficha `F2-10.md`, test/log/captura y commit identificado.

**Gate F2:** no cerrar la fase con checkpoints en estado PARTIAL/BLOCKED; registrar excepciones y aprobación explícita.

### F3 · Estructura de arquitectura y confiabilidad — prioridad P1
- [ ] **F3-01 — ADR de límites.** Trabajo: definir monitor collector, aggregator, transport, app controller, renderers y privileged boundary. **Aceptación:** diagrama C4 actual y ADR. Evidencia: ficha `F3-01.md`, test/log/captura y commit identificado.
- [ ] **F3-02 — Refactor app.js.** Trabajo: extraer módulos por dashboard/history/events/config con API estable. **Aceptación:** e2e sin cambios de comportamiento. Evidencia: ficha `F3-02.md`, test/log/captura y commit identificado.
- [ ] **F3-03 — Refactor main.js.** Trabajo: extraer lifecycle/backend/ipc/overlay/windows. **Aceptación:** tests de IPC y lifecycle. Evidencia: ficha `F3-03.md`, test/log/captura y commit identificado.
- [ ] **F3-04 — Composición y DI mínima.** Trabajo: inyectar reloj, fuentes sysfs/NVML y runner de comandos donde aporta testabilidad. **Aceptación:** tests con fakes sin privilegios. Evidencia: ficha `F3-04.md`, test/log/captura y commit identificado.
- [ ] **F3-05 — Lifecycle suspend/resume.** Trabajo: resolver SIGSTOP/SIGCONT y procesos detenidos al reabrir/minimizar. **Aceptación:** sin procesos en estado T y datos frescos. Evidencia: ficha `F3-05.md`, test/log/captura y commit identificado.
- [ ] **F3-06 — NVML timeout.** Trabajo: evitar bloqueo del tick por fallo VRAM de 6.5s. **Aceptación:** timeout recuperable y tick bajo presupuesto. Evidencia: ficha `F3-06.md`, test/log/captura y commit identificado.
- [ ] **F3-07 — Cadencia monotónica.** Trabajo: muestreo con deadline monotonic, compensando duración de colección. **Aceptación:** gap media <1030ms a 1s en entorno controlado. Evidencia: ficha `F3-07.md`, test/log/captura y commit identificado.
- [ ] **F3-08 — TTL y concurrencia.** Trabajo: perfilar cached.py y eliminar threads/wakeups superfluos. **Aceptación:** evidencia de perfiles antes/después. Evidencia: ficha `F3-08.md`, test/log/captura y commit identificado.
- [ ] **F3-09 — Errores y logs.** Trabajo: niveles, códigos tipados, mensajes útiles y logs sin secretos. **Aceptación:** errores se reportan sin bloquear UI. Evidencia: ficha `F3-09.md`, test/log/captura y commit identificado.
- [ ] **F3-10 — Documentación arquitectura.** Trabajo: actualizar árbol, diagramas, módulos y contratos. **Aceptación:** navegación clara y ADRs trazables. Evidencia: ficha `F3-10.md`, test/log/captura y commit identificado.

**Gate F3:** no cerrar la fase con checkpoints en estado PARTIAL/BLOCKED; registrar excepciones y aprobación explícita.

### F4 · UX simplificada y diseño visual coherente — prioridad P1
- [ ] **F4-01 — Inventario de información.** Trabajo: definir dato primario por bloque y qué queda en History/System. **Aceptación:** matriz sin duplicaciones accidentales. Evidencia: ficha `F4-01.md`, test/log/captura y commit identificado.
- [ ] **F4-02 — CPU y GPU cards.** Trabajo: uniformar uso, temperatura, potencia y jerarquía visual. **Aceptación:** uso CPU visible arriba, no oculto. Evidencia: ficha `F4-02.md`, test/log/captura y commit identificado.
- [ ] **F4-03 — RAM en System.** Trabajo: tarjeta compacta en GiB, sin duplicaciones innecesarias. **Aceptación:** GiB y porcentaje secundarios claros. Evidencia: ficha `F4-03.md`, test/log/captura y commit identificado.
- [ ] **F4-04 — History configurables.** Trabajo: registro de series con ids estables y fuente/unidad. **Aceptación:** catálogo coherente con métricas reales. Evidencia: ficha `F4-04.md`, test/log/captura y commit identificado.
- [ ] **F4-05 — Agregar/quitar gráficos.** Trabajo: selector explícito por tarjeta o modal. **Aceptación:** puede añadir/remove sin reinicio. Evidencia: ficha `F4-05.md`, test/log/captura y commit identificado.
- [ ] **F4-06 — Reordenar gráficos.** Trabajo: drag-drop y alternativa de teclado subir/bajar. **Aceptación:** orden persiste y es accesible. Evidencia: ficha `F4-06.md`, test/log/captura y commit identificado.
- [ ] **F4-07 — Personalizar escala.** Trabajo: GiB o % para RAM/swap, ejes fijos y tooltips. **Aceptación:** modo seleccionado persiste y gráficos correctos. Evidencia: ficha `F4-07.md`, test/log/captura y commit identificado.
- [ ] **F4-08 — Jerarquía de topbar.** Trabajo: reagrupar layout, power, GPU, tools, help y estados. **Aceptación:** navegación entendible a 1280 y 1920 px. Evidencia: ficha `F4-08.md`, test/log/captura y commit identificado.
- [ ] **F4-09 — Accesibilidad modales.** Trabajo: Escape, focus trap, labels canvas y soporte teclado en fans. **Aceptación:** 16 modales accesibles y e2e. Evidencia: ficha `F4-09.md`, test/log/captura y commit identificado.
- [ ] **F4-10 — Tokens y regresión visual.** Trabajo: consolidar tokens ROG sin migración masiva a framework externo. **Aceptación:** capturas comparables y contraste suficiente. Evidencia: ficha `F4-10.md`, test/log/captura y commit identificado.

**Gate F4:** no cerrar la fase con checkpoints en estado PARTIAL/BLOCKED; registrar excepciones y aprobación explícita.

### F5 · Eventos, alertas y salud de disco — prioridad P1
- [ ] **F5-01 — Inventariar productores.** Trabajo: mapear tipo de evento y filtros disponibles. **Aceptación:** filtro solo ofrece fuentes reales. Evidencia: ficha `F5-01.md`, test/log/captura y commit identificado.
- [ ] **F5-02 — Alertas RAM.** Trabajo: umbrales, duración, histéresis y cooldown de RAM. **Aceptación:** tests positivos/negativos sin spam. Evidencia: ficha `F5-02.md`, test/log/captura y commit identificado.
- [ ] **F5-03 — Alertas swap.** Trabajo: presión de swap con mensaje contextual y threshold. **Aceptación:** fixtures de baja/alta presión. Evidencia: ficha `F5-03.md`, test/log/captura y commit identificado.
- [ ] **F5-04 — Alertas disco.** Trabajo: capacidad, SMART/temperatura si disponible y fuentes seguras. **Aceptación:** degradación 'no compatible' diferenciada. Evidencia: ficha `F5-04.md`, test/log/captura y commit identificado.
- [ ] **F5-05 — Eventos CPU.** Trabajo: umbral, throttling, package y temperatura desduplicados. **Aceptación:** filtros CPU funcionan. Evidencia: ficha `F5-05.md`, test/log/captura y commit identificado.
- [ ] **F5-06 — Eventos GPU y cores.** Trabajo: normalizar severidad, origen e id estable. **Aceptación:** filtros y conteos consistentes. Evidencia: ficha `F5-06.md`, test/log/captura y commit identificado.
- [ ] **F5-07 — Modelo de eventos.** Trabajo: schema, timestamps, fuentes, severidad y retención acotada. **Aceptación:** mismo evento en GUI/TUI/overlay donde proceda. Evidencia: ficha `F5-07.md`, test/log/captura y commit identificado.
- [ ] **F5-08 — Panel de eventos.** Trabajo: filtrar/ordenar/explicar alertas y estados vacíos. **Aceptación:** filtros sin duplicar ni perder resultados. Evidencia: ficha `F5-08.md`, test/log/captura y commit identificado.
- [ ] **F5-09 — SMART capability.** Trabajo: detectar SAT/NVMe/permisos sin declarar disco roto. **Aceptación:** casos no soportados explícitos. Evidencia: ficha `F5-09.md`, test/log/captura y commit identificado.
- [ ] **F5-10 — Historial de disco.** Trabajo: temperatura/health donde disponible con muestreo prudente. **Aceptación:** sin invocar smartctl continuamente. Evidencia: ficha `F5-10.md`, test/log/captura y commit identificado.

**Gate F5:** no cerrar la fase con checkpoints en estado PARTIAL/BLOCKED; registrar excepciones y aprobación explícita.

### F6 · Overlay sencillo y compatible — prioridad P1
- [ ] **F6-01 — Matriz Wayland/X11.** Trabajo: probar KDE Wayland, XWayland y X11 sobre ventana y fullscreen. **Aceptación:** capacidades verificadas por sesión. Evidencia: ficha `F6-01.md`, test/log/captura y commit identificado.
- [ ] **F6-02 — Decisión técnica.** Trabajo: ADR Electron vs layer-shell vs MangoHud según restricciones. **Aceptación:** opción recomendada basada en pruebas. Evidencia: ficha `F6-02.md`, test/log/captura y commit identificado.
- [ ] **F6-03 — Editor único.** Trabajo: panel accesible para activar/ocultar y editar overlay. **Aceptación:** sin editar JSON a mano. Evidencia: ficha `F6-03.md`, test/log/captura y commit identificado.
- [ ] **F6-04 — Selector métricas.** Trabajo: CPU usage/temp, RAM GiB/%, GPU usage/temp, FPS si disponible, swap. **Aceptación:** selección de métricas disponibles. Evidencia: ficha `F6-04.md`, test/log/captura y commit identificado.
- [ ] **F6-05 — Orden y disposición.** Trabajo: reordenar, filas/columnas, tamaño, densidad y vista compacta. **Aceptación:** preview idéntica a overlay. Evidencia: ficha `F6-05.md`, test/log/captura y commit identificado.
- [ ] **F6-06 — Posición y monitores.** Trabajo: esquinas/márgenes/monitor; fallback si compositor lo impide. **Aceptación:** monitor removido no deja overlay perdido. Evidencia: ficha `F6-06.md`, test/log/captura y commit identificado.
- [ ] **F6-07 — Previsualización segura.** Trabajo: preview sin juego y botón restaurar defaults. **Aceptación:** flujo configurar -> previsualizar -> aplicar. Evidencia: ficha `F6-07.md`, test/log/captura y commit identificado.
- [ ] **F6-08 — Persistencia resiliente.** Trabajo: schema de preferencias, validación JSON, migración, export/import. **Aceptación:** JSON corrupto se recupera sin crash. Evidencia: ficha `F6-08.md`, test/log/captura y commit identificado.
- [ ] **F6-09 — Tolerancia a fallos.** Trabajo: backend caído, stale, ausencia de FPS, reconexión y click-through. **Aceptación:** sin dato falso y sin bloquear interacción. Evidencia: ficha `F6-09.md`, test/log/captura y commit identificado.
- [ ] **F6-10 — Pruebas overlay.** Trabajo: unit IPC + e2e ventanas + matriz manual sobre juego real. **Aceptación:** capturas, sesiones y limitaciones documentadas. Evidencia: ficha `F6-10.md`, test/log/captura y commit identificado.

**Gate F6:** no cerrar la fase con checkpoints en estado PARTIAL/BLOCKED; registrar excepciones y aprobación explícita.

### F7 · Guardian 2.0 y control seguro — prioridad P0/P1
- [ ] **F7-01 — Mapear escritores.** Trabajo: inventario asusd, rog-profile-sync, guardian, UI y attrs sysfs. **Aceptación:** tabla única de dueños y prioridad. Evidencia: ficha `F7-01.md`, test/log/captura y commit identificado.
- [ ] **F7-02 — Arbitraje.** Trabajo: establecer dueño único por perfil, ventiladores y power limit. **Aceptación:** sin escritores concurrentes. Evidencia: ficha `F7-02.md`, test/log/captura y commit identificado.
- [ ] **F7-03 — Mantener simulación default.** Trabajo: no habilitar escrituras reales automáticamente. **Aceptación:** test de instalación limpia sin modo real. Evidencia: ficha `F7-03.md`, test/log/captura y commit identificado.
- [ ] **F7-04 — Restauración transaccional.** Trabajo: capturar valores previos y restaurar al fallar cualquier paso. **Aceptación:** fakes prueban error intermedio. Evidencia: ficha `F7-04.md`, test/log/captura y commit identificado.
- [ ] **F7-05 — Estados seguros.** Trabajo: idle, observe, recommend, simulate, active, degraded y failed. **Aceptación:** transiciones con tests. Evidencia: ficha `F7-05.md`, test/log/captura y commit identificado.
- [ ] **F7-06 — Curvas y límites.** Trabajo: validación por hardware compatible, topes y rampas prudentes. **Aceptación:** entradas fuera de rango rechazadas. Evidencia: ficha `F7-06.md`, test/log/captura y commit identificado.
- [ ] **F7-07 — Conflictos asusd.** Trabajo: detectar propiedad del perfil y degradar sin pisar. **Aceptación:** logs explican por qué no se escribe. Evidencia: ficha `F7-07.md`, test/log/captura y commit identificado.
- [ ] **F7-08 — Logs auditables.** Trabajo: decisión, motivo, source, valor anterior/nuevo sin PII. **Aceptación:** journal legible, rate-limit. Evidencia: ficha `F7-08.md`, test/log/captura y commit identificado.
- [ ] **F7-09 — Harness hardware.** Trabajo: fake sysfs, fallos EIO, permisos, suspend/resume y crash. **Aceptación:** suite de regresión sin root. Evidencia: ficha `F7-09.md`, test/log/captura y commit identificado.
- [ ] **F7-10 — Validación gradual.** Trabajo: simulación host -> VM/harness -> modo real solo permiso separado. **Aceptación:** aprobación explícita antes de sysfs real. Evidencia: ficha `F7-10.md`, test/log/captura y commit identificado.

**Gate F7:** no cerrar la fase con checkpoints en estado PARTIAL/BLOCKED; registrar excepciones y aprobación explícita.

### F8 · TUI, usabilidad terminal y portabilidad — prioridad P2
- [ ] **F8-01 — Baseline TUI PTY.** Trabajo: conservar tests de rueda, clic, teclas basura, resize. **Aceptación:** regresiones 0 frente a auditoría. Evidencia: ficha `F8-01.md`, test/log/captura y commit identificado.
- [ ] **F8-02 — No-TTY.** Trabajo: corregir busy-loop reportado (~94% CPU) al redirigir stdin. **Aceptación:** terminación limpia y CPU estable. Evidencia: ficha `F8-02.md`, test/log/captura y commit identificado.
- [ ] **F8-03 — Acciones async.** Trabajo: aislar busctl de teclas p/e sin congelar UI. **Aceptación:** latencia de input bajo comando bloqueado. Evidencia: ficha `F8-03.md`, test/log/captura y commit identificado.
- [ ] **F8-04 — Tabla teclado.** Trabajo: mostrar ayuda y mapeo real de teclas. **Aceptación:** documentación y handlers concordantes. Evidencia: ficha `F8-04.md`, test/log/captura y commit identificado.
- [ ] **F8-05 — Mouse y foco.** Trabajo: scroll, clic y wheel consistentes entre terminales. **Aceptación:** prueba con PTY y manual. Evidencia: ficha `F8-05.md`, test/log/captura y commit identificado.
- [ ] **F8-06 — Historia acotada.** Trabajo: ring buffer y número exacto de muestras. **Aceptación:** sin fuga de memoria. Evidencia: ficha `F8-06.md`, test/log/captura y commit identificado.
- [ ] **F8-07 — Export CSV.** Trabajo: unidades, timestamp, errores de permiso y header estable. **Aceptación:** comparación con stream. Evidencia: ficha `F8-07.md`, test/log/captura y commit identificado.
- [ ] **F8-08 — Sensores ausentes.** Trabajo: render N/A no cero en temperaturas/SMART. **Aceptación:** TUI portable a equipo sin ASUS. Evidencia: ficha `F8-08.md`, test/log/captura y commit identificado.
- [ ] **F8-09 — Recuperación terminal.** Trabajo: SIGINT SIGHUP SIGTERM y excepciones. **Aceptación:** cursor y modo restaurados. Evidencia: ficha `F8-09.md`, test/log/captura y commit identificado.
- [ ] **F8-10 — Pruebas cross-host.** Trabajo: fixture AMD/no NVML/no smartctl. **Aceptación:** sin stacktraces y capacidad explicada. Evidencia: ficha `F8-10.md`, test/log/captura y commit identificado.

**Gate F8:** no cerrar la fase con checkpoints en estado PARTIAL/BLOCKED; registrar excepciones y aprobación explícita.

### F9 · Performance, CI, release y publicación — prioridad P1
- [ ] **F9-01 — Pruebas coverage.** Trabajo: medir coverage Python/JS y cubrir hotspots P0. **Aceptación:** informe por módulo, sin cifras inventadas. Evidencia: ficha `F9-01.md`, test/log/captura y commit identificado.
- [ ] **F9-02 — CI real.** Trabajo: PR ejecuta Python Node e2e i18n lint y artifact logs. **Aceptación:** workflow verde en remoto. Evidencia: ficha `F9-02.md`, test/log/captura y commit identificado.
- [ ] **F9-03 — Bench reproducible.** Trabajo: 3×120s backend/gui/tui/overlay, baseline controlada. **Aceptación:** CSV y metodología versionados. Evidencia: ficha `F9-03.md`, test/log/captura y commit identificado.
- [ ] **F9-04 — Objetivos de overhead.** Trabajo: CPU backend <2.5% a 1s y gap <1030ms si hardware comparable. **Aceptación:** cumple o ADR justifica límites. Evidencia: ficha `F9-04.md`, test/log/captura y commit identificado.
- [ ] **F9-05 — Latencia UI.** Trabajo: medir FPS, p95 frame, arranque y sesiones largas. **Aceptación:** presupuesto definido con evidencia. Evidencia: ficha `F9-05.md`, test/log/captura y commit identificado.
- [ ] **F9-06 — Prueba larga.** Trabajo: soak >30 min, reconexión, suspend/resume, memoria. **Aceptación:** sin leaks ni eventos duplicados. Evidencia: ficha `F9-06.md`, test/log/captura y commit identificado.
- [ ] **F9-07 — Docs roadmap.** Trabajo: conciliar v20/v21, what's new, README y limitaciones Wayland. **Aceptación:** no anuncia features no verificadas. Evidencia: ficha `F9-07.md`, test/log/captura y commit identificado.
- [ ] **F9-08 — Revisión supply chain.** Trabajo: versiones, licencias, dependencias, secretos, SBOM si viable. **Aceptación:** reporte reproducible. Evidencia: ficha `F9-08.md`, test/log/captura y commit identificado.
- [ ] **F9-09 — Gate release.** Trabajo: VM instalación/TTY, QA visual, root diff review y rollback. **Aceptación:** checklist firmada por propietario. Evidencia: ficha `F9-09.md`, test/log/captura y commit identificado.
- [ ] **F9-10 — Publicación controlada.** Trabajo: rama release PR, CI verde, merge y tag tras autorización explícita. **Aceptación:** sin push automático por agentes. Evidencia: ficha `F9-10.md`, test/log/captura y commit identificado.

**Gate F9:** no cerrar la fase con checkpoints en estado PARTIAL/BLOCKED; registrar excepciones y aprobación explícita.

## 6. Diseño de producto — requisitos de interacción vinculantes

### Tarjeta CPU
- **Uso CPU (%)** visible junto a temperatura (°C), con estilo comparable al **USAGE** de GPU. Temperatura sigue siendo prioritaria o configurable según densidad. Conservar GHz, W, carga, throttling y per-core en detalle, no saturar tarjeta principal.
- Total de CPU representa uso 0..100%; per-core accesible como detalle desplegable y con series propias si se selecciona.
- Advertir fallos y fuentes incompatibles; jamás mostrar 0% para «sin sensor».

### RAM y swap
- Unidad principal **GiB usadas / GiB totales**; ejemplo `13.5 / 47.0 GiB`. Modo secundario en % accesible sin duplicación visual.
- Gráfica GiB: origen **0**, techo **capacidad total**; para porcentaje: 0..100. Swap ausente = «sin swap», sin serie falsa.
- Un medidor primario en System o tarjeta dedicada; History opcional y configurable. La **capacidad no se infiere de las capturas**, sale de snapshot.

### Historial
- Editor «Agregar gráfica»: selector CPU uso/temp, RAM GiB, swap GiB, GPU, discos/IO, red, batería según fuente disponible. «Ocultar» y «reordenar» por teclado y arrastre.
- Persistir seleccionados, orden, ventana y unidad con esquema de configuración migrable; export/import opcional.
- No obligar al usuario a activar un toggle oculto para ver uso frente a temperatura. Los ejes y leyendas deben representar unidades correctas.

### Overlay
- Un flujo en tres pasos: **activar → elegir métricas y orden → previsualizar y colocar**. Defaults sensatos (CPU uso, CPU °C, RAM GiB, GPU uso, GPU °C, FPS opcional).
- Configuración compacta, ajustable por monitor, escala/tamaño, posiciones compatibles con compositor, click-through reversible, indicador de fuente stale.
- No prometer fullscreen Wayland cuando la plataforma no lo permita; documentar fallback y limitaciones reales.
- No abrir un handle FPS nuevo cada segundo si es evitable; comprobar el mecanismo MangoHud.

### Eventos y discos
- El filtro debe corresponder a fuentes reales. Si se ofrece RAM/disco, deben existir productores testados o figurar inactivos explicando el motivo.
- SMART, salud, temperatura e información sensible solo por capacidad y permiso; no despertar hardware innecesariamente ni pedir root a cada tick.

## 7. Arquitectura objetivo incremental

```text
providers: procfs / sysfs / NVML / SMART (lectura, capabilities, TTL)
         ↓
TelemetryCollector + clock + sanitizers
         ↓
Snapshot + per-sample timestamps + ring-buffer/deltas (schema 2 compatible)
         ├────→ TUI presenter
         └────→ Electron backend bridge / main lifecycle
                          ↓
                      IPC contract
                          ↓
              dashboard | history | events | overlay presenters
                          ↓
               design tokens + accessible widgets

HardwareCommandPort (separado de telemetría de lectura)
  → policy/validation/ownership → privileged helper root-owned
  → hardware adapter + rollback/reconciliation
```

Mantener una capa de contratos pragmática (dataclasses/JSON fixtures y validación de frontera). No convertir todos los módulos en interfaces abstractas sin necesidad. Preservar Electron/Python/rich salvo ADR fundada en limitación demostrada.

## 8. Matriz de pruebas por funcionalidad

| Capacidad | Unitario / fakes | Contrato | E2E GUI/TUI | Hardware manual |
|---|---|---|---|---|
| CPU/RAM/swap | procfs fixtures, límites, wrap | schema 1/2, unidades y ts | snapshots visuales, ejes | contrastar `/proc` |
| Discos/SMART | fake diskstats/smartctl | soporte/N-A/stale | panel y filtros | SSD/NVMe con permiso |
| Eventos | histéresis, cooldown, orden | tipos/severidad | filtros y vacío | observar alertas sin riesgo |
| Overlay | prefs corruptas, monitor ausente | IPC | ventana y preview | KDE Wayland/X11 + fullscreen |
| TUI | PTY, no-TTY, señales | CSV snapshots | teclado/mouse | terminales distintas |
| Guardian | fake sysfs, EIO, rollback | comandos allowlist | UI simulación | solo autorización explícita |
| Instalación | prefijo aislado | ownership/VERSION | paquete instalado en VM | **no automatizar en host** |
| Rendimiento | clocks deterministas | cadencia y tamaño stream | CDP FPS/p95 | 3 corridas comparables |

## 9. Métricas de éxito y límites de interpretación

- Backend a 1 segundo: **objetivo** CPU media < 2.5%, gap medio < 1030 ms en la misma máquina y escenario comparable, 3 corridas ≥120 s. Objetivo, **no hecho demostrado**.
- Reducir payload JSON por tick vs schema 1 (medir bytes/s p50/p95 y CPU parseo). No fijar porcentaje arbitrario sin baseline.
- Renderer sin degradación perceptible: FPS/p95 frame time medidos y capturas before/after, incluyendo equipos con varias pantallas.
- Ningún test automatizado escribe en `/sys`, activa systemd o invoca pkexec real.
- Instalación: VM arranca, se restaura y desinstala sin dejar servicios activos no deseados; TTY recovery probado.
- Los porcentajes se representan en 0..100 y GiB en 0..capacidad, con 0/N-A/stale tratados separadamente.

## 10. Instrucciones de inicio para el agente principal

```text
Eres el arquitecto-coordinador de ROG Monitor. Lee este PLAN_MAESTRO_ROG_MONITOR.md,
los informes ZIP post-90 y todo AGENTS.md/ADR/roadmap aplicable.
NO reinicies los 90 checkpoints anteriores: ya se ejecutaron.
Primero ejecuta F0-01..F0-03 únicamente, de forma no destructiva.
Reporta HEAD y working tree actuales, verifica si el remoto avanzó,
comprueba si la evidencia del ZIP corresponde al código actual y enumera diferencias.
Antes de tocar servicios root/instalación, detente ante el gate humano.
Trabaja por checkpoint, uno a uno, con evidencia, pruebas y handoff persistente.
No hagas push ni habilites Guardian real. No afirmes que Wayland fullscreen funciona
sin una prueba reproducible. Espera aprobación para abrir F1 tras cerrar F0.
```

## 11. Fuentes del paquete de auditoría

Los informes originales son **evidencia externa al plan**, no sustitutos del código. Se recomienda archivar una copia sanitizada/versionada en `docs/audits/post90/` o conservar ZIP con hash y ruta acordados. Puntos de lectura obligatorios:

- `01-GIT-FORENSICS.md` + `02-CHECKPOINTS-90-TRACEABILITY.md`: procedencia de commits.
- `03-REPOSITORY-INVENTORY.md` + `04-REAL-ARCHITECTURE.md`: módulos y fronteras.
- `05-METRICS-PIPELINE.md` + `06-GUI-UX-CHARTS.md`: telemetría, unidades y UX.
- `07-OVERLAY-AUDIT.md` + `08-TUI-AUDIT.md`: características y compatibilidad.
- `09-GUARDIAN-HARDWARE.md` + `10-INSTALLER-OS-SAFETY.md`: seguridad crítica.
- `11-TESTS-CI-BENCHMARKS.md` + logs: pruebas y rendimiento.
- `12-TECHNICAL-DEBT.md` + `13-ROADMAP-RECONCILIATION.md`: priorización y divergencias.
- `14-LOCAL-VALIDATION-AND-PUBLISH-GATES.md` + `15-HANDOFF-FOR-AEVA.md`: publicación y continuidad.
- `16-OPEN-QUESTIONS.md`: decisiones que requieren al propietario.

## 12. Decisiones que requieren respuesta del propietario

1. ¿Se publica primero v21 como rama/PR de estabilización, o se desarrolla el rediseño en una rama separada antes del release? **Recomendado:** estabilizar y publicar vía PR tras los gates, sin mezclar grandes rediseños.
2. ¿Overlay se usará principalmente en KDE Wayland a pantalla completa? Si sí, exigir prueba/ADR temprana (F6-01/02) antes de prometerlo.
3. ¿Guardian debe quedar solo en simulación hasta demostrar propiedad única y restauración? **Recomendado:** sí.
4. ¿RAM principal en System o tarjeta propia? **Propuesta:** System compacto + gráfica opcional GiB; evitar duplicar.
5. ¿Instalación opcional de servicios de perfiles? **Recomendado:** opt-in explícito.

---

**Regla final:** una fase no está completada porque todos sus checkboxes estén marcados. Solo queda aceptada cuando evidencia, pruebas, compatibilidad, riesgos, rollback y gate correspondiente están registrados y revisados.
