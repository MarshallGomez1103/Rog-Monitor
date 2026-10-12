# 12 · Deuda técnica priorizada (P0–P3)

Consolidado por el orquestador (Opus) a partir de los informes 01–11. **Cada severidad la revisó el orquestador**, y donde difiere del informe de origen se explica en la columna "Nota". Los IDs remiten al informe de origen, donde está la evidencia completa (archivo:línea, comando y resultado).

Escala:
- **P0:** puede romper el arranque, los datos o la seguridad.
- **P1:** función principal rota o engañosa, o un riesgo real de hardware.
- **P2:** deuda o UX importante.
- **P3:** menor.

## P0
**Ninguno confirmado.**

- El único P0 propuesto (INS-01, en el informe 10) se rebajó a P2. El propietario ejecuta él mismo `sudo bash <repo>/uninstall.sh`, y en ese momento todo el script ya es código del repo corriendo como root. ADR-0001 protege las ejecuciones automáticas (systemd, pkexec), no un `sudo` manual decidido por el usuario. Sigue siendo una incoherencia: existe una copia root en `/usr/local/libexec/rog-monitor/rog-monitor-safe-mode.sh` y la documentación no la usa.
- No se encontró ninguna unidad que toque display-manager, graphical.target, kargs, initramfs, GRUB ni modprobe (informe 10, grep). Esto **no prueba** que el arranque sea seguro, porque no hubo prueba en VM (CP-1.09 y 8.05 pendientes).

## P1
| ID | Componente | Estado | Problema | Archivo:línea | Commit(s) | Criterio de aceptación |
|---|---|---|---|---|---|---|
| GUI-01 / MET-01 | Tarjeta CPU | verificado (código y captura e2e) | La tarjeta CPU no muestra USAGE %, aunque el dato existe (`cpu.py:199`, campo `usage`) | `desktop/renderer/index.html:121-133`, `app.js:1861-1877` | 44f1706 | La tarjeta CPU muestra "Uso N %" junto a la temperatura y se actualiza cada muestra; test de render en node |
| GUI-02 / MET-02 | Gráfica RAM | verificado | La historia de RAM se guarda en % entero (`app.py:109-110`); no hay modo GiB con eje 0..total | `app.js:635-637` | acaa388 | Modo GiB: eje 0..`ram_total_gb` y etiqueta "GiB". Modo %: eje 0..100. Preferencia persistida |
| GUI-03 | Swap | verificado | Swap solo aparece como curva % detrás de un toggle; no hay GiB ni medidor | `app.js:637`; `sysinfo.py:466-469` | acaa388 | Swap en GiB y %, con eje 0..`swap_total`; oculto con aviso si no hay swap |
| GUI-04 | Escalas de las gráficas % | verificado (probado por el auditor de 06) | `chartRange` autoescala las series % al máximo de la ventana (RAM al 30 % → eje 0..30) | `app.js:673-687` | acaa388, ed7151f | Series con unidad % usan un dominio fijo 0..100 |
| GUI-05 | Filtros de eventos | verificado | Los chips RAM y Disco nunca reciben eventos: `alerts.check()` solo recibe cpu, gpu, ventiladores y vatios. No hay filtro por núcleo | `alerts.py:86`; `event-detail.js:189-190,285-290` | 0765fd5 | Existe una alerta de RAM o swap alta y otra de disco lleno con su `source`, o se retiran los chips sin productor |
| OVL-01 / CP-07 | Overlay en Wayland | no verificado | Sin flags Ozone; `setPosition`, `alwaysOnTop('screen-saver')` y `visibleOnFullScreen` no están garantizados en Wayland/KDE; nadie lo probó sobre un juego | `desktop/main.js:1406-1438`, `:1396` | – | Prueba manual documentada en KDE Wayland y X11: posición, encima de un juego a pantalla completa, click-through |
| OVL-02 | Promesa del roadmap | verificado (texto) | La app anuncia el overlay "KDE/Wayland" como entregado | `desktop/renderer/roadmap.js:539-540`; `README.md:107` | – | El texto refleja el estado probado |
| OVL-03 | Tests del overlay | verificado | Ningún test crea la ventana, normaliza `set-overlay` ni renderiza `overlay.js` | – | – | Paso del e2e que abre el overlay y valida las filas pintadas |
| GRD-01 / GRD-02 / INS-02 | Tres controladores sobre perfil y ventiladores | parcial | `rog-profile-sync` (cada ≤30 s), el guardián y **asusd activo** (`change_platform_profile_on_ac/battery: true`, `fan_curves.ron`) pueden pisarse. Nadie probó la interacción | `scripts/rog-profile-sync.sh:416-430,480-489`; `rog-thermal-guardian.sh:518-531`; `/etc/asusd/asusd.ron:8-11` | 48bde60, 74fc4ff | Matriz de propiedad: un solo dueño por atributo, o un test con fakes que demuestre que no oscilan; registro de 1 h en simulación sin cambios cruzados |
| GRD-03 | Restauración de potencia del guardián | verificado en código, NO PROBADO | Si `profile-limits` falla durante un recorte con cambio de perfil, el episodio termina sin restaurar PL2/DB ni registrar nada | `rog-thermal-guardian.sh:555-625,847-849` | 74fc4ff | Test sim: profile-limits devuelve vacío → se restaura al último valor conocido o queda registrado `restore_failed` |
| CP-01 / GIT-01 | Trazabilidad | verificado | El plan y la evidencia de checkpoints están en `.gitignore` | `.gitignore:29-30` | 7348ece | Evidencia archivada en Git (rama o carpeta versionada) o adjunta al tag |
| CP-02 / CP-03 | Evidencia de checkpoints | verificado | Solo 21 de 90 CP tienen archivo de evidencia; `STATUS.md` se contradice (3.03/3.05/3.09/4.09 aparecen como TODO y DONE a la vez) | `docs/agent-work/STATUS.md:50-53` vs `:69-70` | – | STATUS reconciliado con el informe 02 |
| ARC-01 | Empaquetado AppImage | verificado (ImportError probado; AppImage no construido) | El AppImage no incluye `rich`, pero `app.py:11` lo importa al arrancar; sin rich el backend muere y `main.js:181-190` lo relanza cada 3 s sin límite. El README:200 dice que solo hace falta python3. **Preexistente desde v20** | `src/rog_monitor/app.py:11`; `desktop/main.js:15-16,181-190`; `README.md:200` | anterior a fbfee52 | El AppImage arranca en una máquina sin `rich`, o lo detecta y lo explica; backoff con tope de reintentos |
| GIT-02 / TST-02 | Publicación | verificado | 54 commits y 11.7k líneas sin CI remoto ni revisión | – | todos | PR en rama, CI verde, revisión humana |

## P2
| ID | Componente | Problema | Archivo:línea | Criterio de aceptación |
|---|---|---|---|---|
| TUI-02 | TUI | Con stdin que no es TTY (lanzada sin terminal o con `< /dev/null`) el bucle gira sin dormir: **94 % de CPU medido** por el auditor de 08 | `keys.py:94-96` (devuelve None si `fd is None`); `app.py:305-307` (`continue` sin sleep) | Con stdin=/dev/null la CPU media es < 5 %; test pty |
| TUI-03 | TUI | Las teclas `p` y `e` llaman a `busctl` de forma síncrona en el hilo de UI (timeout 5 s) | `actions.py:22-32`; `app.py:184-188` | La UI sigue refrescando durante la acción |
| TUI-04 / TUI-05 | Tests TUI | La cota de muestras tolera +2. Faltan casos: stdin no TTY, SIGINT, SIGHUP, teclas ligadas | `tests/test_tui_input.py:138` | Cota exacta y casos añadidos |
| TST-03 | Rendimiento | Spawns −90 %, pero la CPU media sigue igual (3.53 → 3.65 %), ctx/s +50 % y la cadencia sigue derivando (1128 ms con 1 s pedido) | backend, `cached.py` (hipótesis) | CPU < 2.5 % y gap < 1030 ms a 1 s, 3 corridas |
| MET-03 | Red | Tasa negativa si el contador baja (interfaz reiniciada); no hay clamp | `sysinfo.py:431-434` | Tasa ≥ 0; test con contador decreciente |
| MET-06 | Disco | `disk_io` (IOPS, busy) se recoge pero no se muestra | `sysinfo.py`; renderer | Se muestra en el panel de discos o deja de recogerse |
| MET-15 / MET-16 | Snapshot | No hay timestamp por muestra; `Cached` sirve valores viejos sin indicar su edad | `app.py`, `cached.py` | Campo `ts` y edad por métrica cacheada; la UI marca "stale" |
| GUI-dup | UI | Duplicación: temperatura y potencia de CPU/GPU en tarjetas e Historia; RAM en Historia y en el medidor; VRAM en Sistema y tile GPU; batería % en tres sitios | informe 06 | Mapa único "cada dato, un lugar principal" |
| GUI-a11y | UI | Canvas sin texto alternativo; 13 de 16 modales sin Escape ni focus trap; fans-block inaccesible por teclado | informe 06 | Escape y foco en todos los modales; e2e de teclado |
| GUI-layout | UI | Se reordenan bloques, no gráficas; solo con ratón; no se pueden agregar ni quitar gráficas | informe 06 | Editor de gráficas con persistencia |
| OVL-04..11 | Overlay | No reacciona a backend caído; no se recoloca al cambiar de monitor; `displayId` frágil; preferencias solo en localStorage, sin export; `JSON.parse` sin try (`app.js:3482`); sin CPU uso/RAM ni orden | informe 07 | Editor de overlay (diseño en 07, sección 4) |
| ARC-03 | Ciclo de vida del backend | `startBackend` mata un backend pausado (SIGSTOP al minimizar) sin SIGCONT y lo deja en estado T (réplica en Node probada por el auditor de 04) | `desktop/main.js:146-150` | Reinicio con la ventana oculta sin procesos zombis/T |
| ARC-04 / ARC-05 | Frontera root | El camino Python hacia pkexec (`power_control.py:511`) y `/usr/local/lib/rog-monitor` no comprueban VERSION ni propietario como sí hace `priv.js` | `src/rog_monitor/power_control.py:511` | Misma verificación en ambos caminos; test |
| ARC-08 | Contrato | El stream envía la historia completa a 1 Hz (~38 KB extra por línea con 900 muestras) | `app.py` snapshot | Schema 2 con deltas o historia cada N s |
| ARC-09 | GPU | La lista de VRAM puede bloquear el tick hasta 6.5 s si NVML falla | `gpu.py:196-225` | Tick < 200 ms con NVML ausente (test con fake) |
| ARC-10 / ARC-11 | Electron main | `spawnSync` sin timeout en el hilo principal; `config.json` y `fan-curves.json` sin escritura atómica | `desktop/main.js:488,1070,1079` | Timeouts y escritura tmp+rename |
| INS-01 (rebajado) | Recuperación | `uninstall.sh` y `RECOVERY.md` ejecutan `safe-mode` desde el repo en vez de la copia root de libexec | `scripts/uninstall.sh:43`; `docs/RECOVERY.md:17-35,99,143` | Documentación y uninstall usan `/usr/local/libexec/rog-monitor/rog-monitor-safe-mode.sh` cuando existe |
| INS-doc | RECOVERY | Sugiere ejecutar `safe-mode` sin acción para restaurar, pero sin acción solo muestra el estado; "Bad power limit" restaura `default_value`, que en este equipo es el máximo (PL2 175 W) | `docs/RECOVERY.md:143`; informe 10 | Pasos de recuperación probados en VM |
| CP-09 | Instalador | `install-system.sh` habilita siempre `rog-profile-sync`, que aplica PL y curvas de ventiladores en cada arranque, y la regla RAPL | `scripts/install-system.sh:139-152` | Opt-in explícito o confirmación en la app |
| ARC-size | Arquitectura | Archivos monolíticos: `renderer/app.js` 3993 l., `main.js` 1841 l., `style.css` 1539 l. | – | Extraer módulos por panel sin cambiar comportamiento (ver 04) |
| TST-04 / TST-07 | Calidad | Cobertura no medida; FPS y latencia de UI sin medir | – | Informe de cobertura; p95 de frame time |
| CP-05 | Proceso | Los cambios de privilegios entraron sin gate humano registrado (solo D1, en un archivo ignorado) | DECISIONS.md D1 | Revisión humana del diff de privilegios antes del push (lista en 14) |

## P3
| ID | Problema | Archivo:línea |
|---|---|---|
| TST-01 | `node --test desktop/test` ejecuta 21 de 46 tests | `desktop/test/index.js:2-3` |
| CP-06 (rebajado) | Guardián con `ROG_THERMAL_DRY=0` por defecto en la unidad. **Mitigado:** la app marca "Simulación" por defecto al primer encendido (`desktop/renderer/power.js:1039`). Solo un `systemctl enable` manual arranca en modo real | `systemd/rog-thermal-guardian.service:29` |
| GIT-03 / GIT-05 | Sin tags v20/v21; sin venv documentado (los tests dependen de `rich` en el sitio de usuario) | – |
| MET-07 / MET-08 / MET-11 / MET-13 | % de disco 41 vs 42 de `df`; mezcla GiB/GB con la misma "G"; meminfo ilegible muestra "0.0/0 GiB"; % de ventilador sobre un máximo que solo sube | informe 05 |
| OVL-12..16 | El acento no sigue el tema; `fps.py` abre un handle por segundo; DPI sin prueba | informe 07 |
| CP-10 | Decisiones que citan ADR con número incorrecto ("ADR-002" frente a `0002-no-new-dependencies.md`) | STATUS.md |
| GUI-units | "°" frente a "°C"; vatios sin unidad en el valor; swap pintado en verde (`--okstate`); "THROTTLE 35758" sin unidad ni explicación (captura e2e) | informe 06 |
