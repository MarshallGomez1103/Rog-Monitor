# 13 · Reconciliación del roadmap y lo implementado

Fuentes comparadas:
- (a) `docs/roadmap.md`, el roadmap público versionado, cuyo último cambio es `824be80`.
- (b) `desktop/renderer/roadmap.js`, el "qué hay de nuevo" dentro de la app.
- (c) El plan maestro de 90 CP (`ROG_MONITOR_PLAN_MAESTRO_IA.md`, ignorado por Git).
- (d) `docs/agent-work/BACKLOG.md` (ignorado).
- (e) El código en HEAD `7d49333`.

El detalle de los 90 CP está en `02-CHECKPOINTS-90-TRACEABILITY.md`.

## 1. Desfase entre documentos (OBSERVADO)
| Documento | Dice | Realidad |
|---|---|---|
| `docs/roadmap.md:26` | "Current (done) — through v20" | El código está en 21.0.0 (`VERSION`, `CHANGELOG.md`). El roadmap público no menciona v21 |
| `desktop/renderer/roadmap.js:20` | Última entrada `v20.0.0` | La app no lista los cambios de v21 en su roadmap; CHANGELOG sí |
| `roadmap.js:539-540` | Overlay "siempre encima … (KDE/Wayland)" entregado | No probado en Wayland (informe 07, OVL-01/02) |
| `README.md:107` | Anuncia el overlay | Igual |
| `STATUS.md` | 3.03/3.05/3.09/4.09 TODO y DONE a la vez | DONE en código (`acaa388`, `c4bb0d6`), ver 02 |
| `CP-8.10.md` | "node 36/36", "991 claves" | Hoy: node 46/46 (glob), 1009 claves (informe 11) |

## 2. Plan de 90 CP: resumen por fase
Conteo del informe 02, revisado por el orquestador. "Verificado" significa que hay un test o una comprobación directa, no que funcione en hardware real.

| Fase | Tema | Estado global | Pendiente real |
|---|---|---|---|
| F0 | Auditoría y baseline | Hecha (archivos CP-0.0x) | Evidencia no versionada |
| F1 | Seguridad e instalación | Mayormente hecha: frontera root ADR-001, validación, hardening de unidades, uninstall completo, RECOVERY.md | CP-1.09 recuperación TTY en VM (**no probada**); RECOVERY con pasos incorrectos (informe 10); profile-sync activado por defecto |
| F2 | Contratos | Hecha: schema 1, contract tests, NVML, TTL, eventos unificados | 2.05 decidido no hacer (puertos); falta timestamp por muestra |
| F3 | CPU/RAM/discos | Backend hecho con fixtures; series de uso en %; SMART con caché | **Lo visible para el usuario falta**: uso % en la tarjeta CPU, RAM/swap en GiB, escalas 0..100, disk_io sin mostrar |
| F4 | TUI | Hecha y probada (pty): el bug "galería" no se reproduce | CP-4.06 (sin flicker): 02 lo marca ausente, pero el orquestador lo deja en **parcial**. No hay redibujado parcial propio, porque `rich.Live(screen=True)` repinta la pantalla. Aun así, las teclas basura ya no generan cuadros (informe 08: 63 eventos → 0 cuadros) y el flicker no se midió; TUI-02 busy-loop sin TTY |
| F5 | Diseño | Tokens, estados, a11y parcial, captura CDP | 5.10 FPS y latencia de UI sin medir; duplicación History/System; editor de gráficas |
| F6 | Eventos y Guardián 2.0 | Eventos con ctx/cooldown/histéresis; Guardián con simulación, ABI corregido y restauración | 6.10 habilitar (propietario); GRD-03 restauración incompleta; RAM/disco sin eventos; conflicto con asusd y profile-sync |
| F7 | Overlay y benchmarks | Benchmarks p50/p95/p99 hechos | **Overlay 7.01–7.04 parcial**, sin prueba en Wayland ni sobre juegos |
| F8 | Calidad y release | 162 tests py, 46 node, e2e 29/29, CI ampliado, ADRs | CI nunca corrió en GitHub; 8.05 instalador en VM; 8.10 aprobación humana |

## 3. Roadmap público frente al código
| Ítem (`docs/roadmap.md`) | Estado en código | Evidencia |
|---|---|---|
| P1 Overlay personalizable (temas, posición libre, por monitor, selector de métricas) | **Parcial**. Hay filas configurables, layout fila/cuadro y esquina. No hay selector de orden, CPU uso ni RAM GiB, ni posición libre. Multi-monitor frágil | informe 07 |
| P1 Perfiles por juego | No implementado. Existe `game_session.py` como base (sesiones y registro) | `src/rog_monitor/game_session.py` |
| P1 Benchmarks serios | **Parcial**. Hay benchmark CPU/GPU-local con warm-up, repeticiones, percentiles y export (`4262a1d`). No hay path tracing Vulkan ni separación P/E-core | `benchmarks.py`, docs/BENCHMARKS.md |
| P1 Guardián 2.0 | **Parcial**. Decisiones trazables en el journal y simulación: sí. Modo silencioso programado y curvas de respuesta configurables: no | informe 09 |
| P1 Helper polkit único | **Parcial**. Un único punto `rog-ctl.sh`, con argv validado y allowlist en `priv.js`. Sigue siendo un `pkexec` por acción, con su prompt cada vez | ADR-0001 |
| P2 Batería: límite de carga en la UI | Hecho (`rog-battery-limit`, `rog-ctl`) | host: unidad disabled hasta que se aplique desde la app |
| P2 Profundidad de disco | Parcial: SMART bajo demanda con caché 24 h; sin self-tests ni histórico de temperatura | `c4bb0d6` |
| P2 Layout inteligente | No | – |
| Resto de P2/P3 (AMD, Flatpak, drivers, provenance, OpenRGB, SQLite, Windows) | No implementados | – |

## 4. Estado del backlog del agente (verificación puntual)
| # | Ítem | Estado verificado ahora |
|---|---|---|
| 25 | `disks.js` mostraba `pkexec smartctl` literal | Corregido: `grep "pkexec smartctl" desktop/renderer/disks.js` está vacío |
| 26 | Docs con `/usr/local/sbin/rog-profile-sync` | Corregido: `git grep` vacío en README y docs |
| 29 | Guardián escribía throttle=2 creyendo performance | Corregido: ya no escribe ese atributo (`74fc4ff`, informe 09) |
| 31 | El snapshot manda toda la historia cada segundo (~45 KB/línea con historia llena) | **No verificado como corregido**. El agente lo dejó pendiente (cambio de contrato a schema 2). Coherente con TST-03 (sin mejora de CPU) |
| 24 | NVML reduce spawns | Confirmado: 0.18 spawns/s frente a 1.47 (informe 11) |

## 5. Prioridades propuestas para el siguiente roadmap (para AEVA)
Ordenadas por valor para el propietario, riesgo y esfuerzo. Ninguna está implementada.

1. **Validar lo hecho antes de construir más.**
   - PR en rama con CI de GitHub en verde.
   - Prueba manual de TUI, minimizar y overlay en Wayland (checklist del informe 14).
   - Instalador y recuperación TTY en VM con snapshot.
2. **Métricas visibles correctas** (pedidas explícitamente por el propietario):
   - Uso % en la tarjeta CPU.
   - RAM y swap en GiB con eje 0..total y modo % 0..100.
   - Dominio fijo para las series %.
   - Clamp de red ≥ 0.
3. **Simplificar la interfaz:**
   - Un lugar principal por dato (quitar duplicación History/System/tarjetas).
   - Unidades coherentes (°C, W, GiB).
   - Editor de gráficas: agregar, quitar, reordenar y persistir.
   - Filtros de eventos solo para fuentes que existen (o crear las alertas de RAM y disco).
4. **Overlay usable:**
   - Editor simple (diseño en 07 §4): métricas, orden, tamaño, posición, preview y defaults.
   - Prueba real en KDE Wayland y X11.
   - Si Wayland no permite posicionar, decidir entre forzar XWayland para el overlay o usar layer-shell/MangoHud.
5. **Un solo dueño por atributo de hardware:** resolver el conflicto asusd / profile-sync / guardián antes de habilitar el Guardián en modo real; corregir GRD-03.
6. **Rendimiento del backend:**
   - Descontar el tiempo de recolección del sleep.
   - Enviar solo deltas de historia (schema 2).
   - Medir los hilos de `cached.py`.
   - Objetivo: CPU < 2.5 % a 1 s.
7. **Deuda de estructura:** partir `renderer/app.js` (3993 l.) y `main.js` (1841 l.) por panel, sin cambiar comportamiento y con el e2e como red.
8. **Proceso:** versionar la evidencia de auditoría, crear tags v20/v21 y documentar el venv de tests.
