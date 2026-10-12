# 16 · Preguntas abiertas y pruebas bloqueadas

## Decisiones pendientes del propietario
| # | Pregunta | Por qué importa | Opciones |
|---|---|---|---|
| Q1 | ¿Se versiona la evidencia de los 90 CP (`docs/agent-work/`, el plan)? | Hoy solo existe en este disco (`.gitignore:29-30`) | a) rama `audit/agent-work`; b) carpeta `docs/audit/` versionada; c) solo adjuntarla al ZIP |
| Q2 | ¿Push a una rama de PR o directo a master? | 54 commits sin CI remoto | Se recomienda `release/v21` y PR (informe 14) |
| Q3 | ¿Quién debe controlar `platform_profile` y las curvas: asusd, `rog-profile-sync` o el guardián? | Los tres están presentes; asusd activo con `change_platform_profile_on_ac/battery: true` | Un dueño por atributo; desactivar el cambio automático de asusd o el de profile-sync |
| Q4 | ¿`rog-profile-sync` debe seguir activándose por defecto al instalar? | Aplica PL y curvas en cada arranque (`install-system.sh:139-140`) | Opt-in en la app o mantenerlo |
| Q5 | Overlay: si Wayland nativo no deja posicionarlo ni mantenerlo encima de juegos, ¿qué se prefiere? | Define la arquitectura del overlay | a) forzar XWayland solo para la ventana del overlay; b) MangoHud como overlay "in-game" y la ventana Electron solo para el escritorio; c) widget de Plasma |
| Q6 | ¿Qué gráficas quieres por defecto y cuáles sobran en History/System? | Simplificación de la UI | Propuesta en 06 |
| Q7 | ¿Unidades preferidas: GiB (binario) o GB? | Hoy se mezclan con la misma "G" (MET-08) | Se recomienda GiB en toda la UI |
| Q8 | ¿Se acepta que los commits de agentes vayan firmados con tu identidad? | Autoría en el historial público | Mantener (con Co-Authored-By) o reescribir antes del push (no recomendado) |
| Q9 | ¿Se adopta un venv para desarrollo y tests? | Reproducibilidad (GIT-05) | `.venv` ya existe e ignorado; documentarlo |

## Pruebas bloqueadas (requieren autorización, hardware o una VM)
| Prueba | Bloqueo | Cómo validarla de forma aislada |
|---|---|---|
| Instalador, desinstalador y recuperación TTY (CP-1.09, 8.05) | Root y systemd; riesgo de arranque | VM Bazzite con snapshot (informe 14, gate 6) |
| Guardián en modo real | Escribe firmware y PL | Simulación una sesión → leer decisiones → real con el propietario delante |
| Interacción asusd / profile-sync / guardián | Necesita servicios reales | Registro de 1 h con el guardián en simulación y `journalctl -u asusd -u rog-profile-sync`, sin escrituras propias |
| Overlay sobre un juego, Wayland/X11, multi-monitor, DPI | Sesión gráfica real y juego | Prueba manual del propietario (gate 5) |
| Minimizar y restaurar | No automatizable por KWin script (intentado antes) | Manual |
| FPS y latencia de UI | Requiere CDP Performance en la sesión real | Script CDP (diseño en 11) |
| Benchmark de overhead sobre carga (`--bench-overhead`) | Calienta CPU y GPU | Con permiso, en AC y con temperatura inicial < 55 °C |
| Wakeups (`perf`/`powertop`) | Permisos | Con permiso |
| SMART real | pkexec | Manual (gate 5) |
| `npm audit` | Envía el árbol de dependencias al registro | Con permiso, o confiar en Dependabot tras el push |
| CI en GitHub | Requiere push | PR en rama |
| Suspensión/reanudación (contadores, NVML, dGPU) | Suspender el equipo | Manual: suspender 1 min y revisar saltos en las gráficas |

## Hipótesis sin confirmar
- **H1:** el aumento de ctx-switch/s (31.8 → 47.7) y la CPU sin mejora vienen de los hilos de `cached.py` o de enviar la historia completa por snapshot. Probar con py-spy o perfilado manual.
- **H2:** en KDE Wayland, Electron 42 sin flags Ozone corre bajo XWayland, y por eso `setPosition` podría funcionar. Confirmar con `xprop` o `qdbus org.kde.KWin` en la sesión real.
- **H3:** `rog-profile-sync` y asusd pueden dejar `platform_profile` oscilando al conectar o desconectar el cargador.
