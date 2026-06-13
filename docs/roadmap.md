# ROG Monitor - Roadmap

## Estado actual del proyecto

**Versión actual:** v9.0.0 (junio 2026)

> v9.0.0: Centro de Poder (PL1/PL2/Dynamic Boost/Thermal Target con
> consentimiento + clamp de firmware), wizard de primera vez, UX de 4 estados
> por widget, 12 temas × claro/oscuro, grid de 9 modos Aura (5 hardware + Música
> funcional + 3 honestos sobre su soporte), docs abiertas al open source.
> v8.4: identidad visual propia (esquinas cortadas, placas numeradas
> inclinadas, 8 temas × claro/oscuro con modo claro tintado de verdad),
> bloques renumerados 01-09 en orden visual y columnas sin hueco. Hover en las
> 4 gráficas (valor + hace cuántos segundos). Consumo GPU estable
> (power.draw.average) y gráficas de W desde 0. Nombre de GPU detectado (no
> hardcodeado). Redragon K734 detectado (control bloqueado hasta tener
> capturas USB — ver docs/redragon-protocol.md).
> v8.3: cap real verificado con calibración PWM→RPM, Aura arreglado de raíz,
> overlay AVG/FPS, export/import de config.

---

# v1 - MVP (Completado) ✅

## Objetivo

Crear un monitor funcional para la ASUS ROG Strix desde terminal.

### Funciones

* [x] Lectura de temperatura CPU Package
* [x] Lectura de temperatura por núcleo
* [x] Cálculo de temperatura promedio CPU
* [x] Temperatura máxima CPU
* [x] Temperatura mínima CPU
* [x] Conteo de núcleos por encima de 90°C
* [x] Lectura de RPM ventilador CPU
* [x] Lectura de RPM ventilador GPU
* [x] Lectura de RPM ventilador central
* [x] Lectura de temperatura GPU
* [x] Lectura de uso GPU
* [x] Lectura de potencia GPU
* [x] Lectura del perfil de energía activo
* [x] Lectura del governor activo
* [x] Actualización automática cada segundo
* [x] Comando rápido `monitor`

---

# v2 - Interfaz Mejorada (Completado) ✅

## Objetivo

Mejorar la experiencia visual sin perder rendimiento.

### Funciones

* [x] Migración de Bash a Python
* [x] Integración con Rich
* [x] Historial térmico CPU
* [x] Historial térmico GPU
* [x] Estado térmico general
* [x] Colores dinámicos completos
* [x] Barras visuales para ventiladores
* [x] Barras visuales para CPU
* [x] Barras visuales para GPU
* [x] Detección de GPU activa
* [x] Detección de modo Hybrid / Integrated / Dedicated
* [x] Eliminación completa de mensajes de error de sensores
* [x] Interfaz sin parpadeos
* [x] Mejor distribución visual

---

# v3 - Estadísticas Avanzadas (Completado) ✅

## Objetivo

Convertir el monitor en una herramienta de análisis.

### Funciones

* [x] Potencia CPU en tiempo real (Intel RAPL)
* [x] Potencia promedio CPU
* [x] Potencia máxima CPU
* [x] Potencia mínima CPU
* [x] Historial de potencia CPU
* [x] Temperatura promedio 1 minuto
* [x] Temperatura promedio 5 minutos
* [x] Temperatura promedio 15 minutos
* [x] Registro de thermal throttling
* [x] Registro de eventos térmicos

> Nota: la potencia CPU requiere `sudo bash scripts/enable-cpu-power.sh`
> (el kernel restringe RAPL a root por CVE-2020-8694).

---

# v4 - Sistema de Alertas (Completado) ✅

## Objetivo

Avisar cuando exista riesgo térmico o anomalías.

### Funciones

* [x] Alerta por temperatura CPU
* [x] Alerta por temperatura GPU
* [x] Alerta por thermal throttling
* [x] Alerta por ventiladores detenidos
* [x] Alerta por potencia anormal
* [x] Alertas configurables (config.json + notificaciones de escritorio)

---

# v5 - Dashboard Profesional (Completado) ✅

## Objetivo

Convertir el proyecto en una alternativa ligera a herramientas tipo btop.

### Funciones

* [x] Vista CPU
* [x] Vista GPU
* [x] Vista RAM
* [x] Vista almacenamiento (uso + temperatura NVMe)
* [x] Vista red
* [x] Navegación por teclado (perfil, GPU, temas, exportar, ayuda)
* [x] Temas visuales (rog / ice / matrix)
* [x] Configuración persistente (~/.config/rog-monitor/config.json)

---

# v6 - Aplicación de Escritorio (Completado) ✅

## Objetivo

Crear una interfaz gráfica moderna.

### Funciones

* [x] Aplicación Electron (`desktop/`, backend Python `--json-stream`)
* [x] Dashboard gráfico (gauges, gráficas canvas, ventiladores animados)
* [x] Botones de perfil de energía y modo GPU desde la app
* [x] Botón de actualización (git fetch/pull + reinicio del backend)
* [x] Entrada en el menú de aplicaciones (`scripts/install-desktop.sh`)
* [x] Exportación CSV (tecla `e` en la TUI)
* [x] Exportación JSON (tecla `e` en la TUI)
* [ ] Historial persistente entre sesiones (→ v8)
* [ ] Configuración visual desde la app (→ v8)

---

# v7 - Centro de Control (Completado) ✅

> La app deja de ser solo un monitor: ahora es un centro de control clicable.

* [x] Cerrar procesos con clic + confirmación (v6.2)
* [x] Exportar log de eventos a .txt (v6.2)
* [x] Temas claro/oscuro con 6 paletas originales (Magma, Nébula, Océano,
      Glaciar, Reactor, Grafito) (v6.2 → renovados v7.0)
* [x] Clic en Ventiladores abre su centro de configuración (v7.0)
* [x] Cap de RPM editable por perfil desde la app (recalcula los puntos
      altos de la curva; aplica con pkexec) (v7.0)
* [x] Editor de curvas de ventilación completo (8 puntos × 3 ventiladores,
      por perfil) con diálogo de consentimiento para valores peligrosos (v7.0)
* [x] Benchmark de máximos: 60 s al 100% y mide el RPM real de cada
      ventilador (usa scripts/test-max-fans.sh con pkexec) (v7.0)
* [x] Frecuencias en vivo: GPU núcleo y VRAM en MHz, CPU en GHz (v7.0)
* [x] Gráfica de potencia GPU en el historial (app y TUI) (v7.0)
* [x] Identidad de aplicación correcta en la barra de tareas
      (nombre + ícono, StartupWMClass/desktopName) (v7.0)
* [x] Salud de discos SMART (botón en Sistema, pkexec + smartctl) (v7.1)
* [x] Procesos en % del CPU total por defecto (antes era por núcleo) (v7.1)
* [x] Clic en RAM → qué procesos consumen la memoria, con cierre (v7.1)
* [x] Historial 2×2 (CPU temp|W arriba, GPU temp|W abajo) con eje de tiempo (v7.1)
* [x] Botón REPORTAR ERROR → abre issue en GitHub con info del sistema (v7.1)
* [x] Curvas de ventilador editadas en % (no PWM crudo); ajuste individual por fila (v7.1)
* [x] Tamaño de letra configurable (A−/Normal/A+/A++ en TEMA, persiste) (v7.1)
* [x] Scrollbars delgadas con color del tema (v7.1)
* [x] TUI: la rueda del mouse ya no descuadra la pantalla (mouse tracking) (v7.1)
* [ ] Umbrales de temperatura/alertas editables desde la app (→ v9)

---

# v8 - Iluminación RGB "Aura" (Implementado — v8.0 / v8.1) ✅

> Estado v8.1: asusd activo; efectos static/breathe/rainbow-*/stars aplican
> bien (verificado por CLI y por `rog_monitor.aura apply`). UI del bloque 08
> reorganizada (APLICAR primario, perfiles en sección propia). **Modo música
> arreglado** (usaba `parec`→0 bytes y `pw-cat` sin `--target`; ahora
> `pw-record`/`pw-cat --record --raw --target <sink>.monitor`). Brillo:
> el comando real es `asusctl leds set <off|low|med|high>` (no `asusctl -k`).
> Pendiente: OpenRGB/Redragon (no instalado) y prueba con clics reales.

## Plan original (referencia)

# v8 (plan) - Iluminación RGB "Aura"

> Controlar las luces del teclado/chasis como Armoury Crate: efectos, colores,
> perfiles personalizados y modo música. ASUS primero (asusctl), luego
> periféricos de otras marcas (Redragon, etc.) vía OpenRGB.

## Orden de trabajo (hacer en esta secuencia)

1. **Habilitar asusd** (el demonio de asusctl; rog-control-center es su GUI):
   - Ya existe `scripts/enable-asusd.sh` en el repo de scripts del sistema
     (carpeta `Rog-Monitor-Scripts` en el home). OJO: verificar que NO pelee
     con rog-profile-sync.service (ambos tocan platform_profile y curvas).
     Solución esperada: asusd maneja SOLO los LED (aura); perfiles y curvas
     siguen en nuestros scripts. Probar en vivo antes de seguir.
2. **Capa de backend** `src/rog_monitor/aura.py`:
   - Detección: ¿existe `asusctl`? → `asusctl aura --help` lista los modos.
   - Comandos: `asusctl aura <modo>` (static, breathe, rainbow-cycle, pulse…),
     `--colour <RRGGBB>` para color, brillo con
     `asusctl leds set <off|low|med|high>`.
   - Alternativa más robusta: D-Bus org.asuslinux.Daemon.
3. **IPC + UI**: nuevo bloque "08 Iluminación" en la app:
   - Selector de efecto, color (input type=color), brillo.
   - Perfiles con nombre (JSON en ~/.config/rog-monitor/aura.json),
     opción de aplicar al iniciar sesión.
4. **Periféricos no-ASUS (Redragon, etc.)** vía **OpenRGB**:
   - Detectar `openrgb`; si falta, explicar instalación (Flatpak).
   - Usar su SDK local (puerto 6742): listar dispositivos, aplicar color/efecto.
5. **Modo música**: nivel de audio del sistema (PipeWire: `parec`/pw API),
   amplitud → brillo/color, máx 15-20 fps. Botón ON/OFF claro.
6. **Benchmarks térmicos** (mismo sprint):
   - CPU: carga 100% N segundos (multiproceso Python, sin dependencias) →
     reporte: temp máx, watts máx, throttling, RPM alcanzados.
   - GPU: `glmark2` si existe (o carga Vulkan simple) → mismo reporte.
   - Botón "BENCHMARK" con advertencia de calor y resultados exportables.

Referencias: asusctl https://gitlab.com/asus-linux/asusctl · OpenRGB https://openrgb.org

---

# v9 - Compatibilidad Universal + Centro de Poder (Implementado) ✅

> La meta: que funcione en cualquier portátil Linux, priorizando la familia
> ASUS ROG (Strix, Zephyrus, TUF) y degradando con elegancia en el resto.
> v9.0.0 completa el Centro de Poder calibrado para el G614JV, el wizard de
> primera vez, la UX de 4 estados por widget, 12 temas y el grid de Aura.

* [x] **Centro de Poder** — control de PL1 (28–140 W), PL2 (28–175 W), GPU
      Dynamic Boost (5–25 W) y Thermal Target (75–87 °C) vía `asus-armoury`
      sysfs. Cada escritura está hard-clamped a los min/max del firmware;
      requiere diálogo de consentimiento; tiene RESET A FÁBRICA; arranca con
      los valores stock. GPU Clock Offsets mostrados pero bloqueados en Wayland.
      Calibrado para el G614JV; otros modelos leen rangos de `asus-armoury` o
      de `device_profiles.json` / `~/.config/rog-monitor/device.json`. (v9.0.0)
* [x] **Wizard de primera vez**: detectar ventiladores → calibrar con
      explicación de permisos → benchmark CPU/GPU → guardar → tour de
      funciones. Nunca muestra "medido" sin medir. (v9.0.0)
* [x] **UX de 4 estados por widget**: con datos / cargando / sin datos / error
      (ventilador dañado → icono quieto, no spinner). (v9.0.0)
* [x] **12 temas** × claro/oscuro: se suman Neon Nights, Cyberpunk, Aurora,
      Alba a los 8 de v8.4; modos claros rehechos con tintado real. (v9.0.0)
* [x] **Grid de 9 modos Aura**: 5 modos hardware (Estático, Respirar, Rainbow
      Cycle, Rainbow Wave, Pulso) + Música funcional + 3 modos honestos sobre
      su estado de soporte. (v9.0.0)
* [x] Configuración visual desde la app: umbrales de alerta y colores de
      temperatura editables (botón ALERTAS → modal; `rog_monitor.settings`;
      reinicia el backend para recargar AlertEngine) (v8.1). Falta tema/idioma
      desde la app.
* [x] **docs/supported-devices.md**, **CONTRIBUTING.md**, **plantillas de
      issues**, **CI GitHub Actions** — repo preparado para open source. (v9.0.0)
* [ ] Autodetección de plataforma (ASUS / Lenovo Legion / HP Omen / genérico)
* [ ] Soporte AMD completo (k10temp por CCD, RAPL amd_energy, amdgpu probado)
* [ ] Perfiles vía `platform_profile` genérico cuando no haya asus-wmi
* [ ] Historial persistente (SQLite en ~/.local/share/rog-monitor)
* [ ] Paquetes: PyPI (`pipx install rog-monitor`), Flatpak, AUR, COPR
* [ ] Detección automática de máximos de ventilador por modelo (base de datos
      comunitaria en JSON)

---

# v10 - Power User (en progreso)

* [~] ~~Undervolt/overclock de CPU/GPU~~ — Fue DESCARTADO por decisión de
      Marshall el 2026-06-10 por riesgo real al equipo. **Decisión REVERTIDA
      por Marshall el 2026-06-12**: con rangos exactos del modelo (firmware
      min/max de `asus-armoury` leídos en tiempo real), clamp de hardware y
      doble consentimiento (diálogo de aviso + confirmación explícita), el
      riesgo queda acotado a lo que el firmware permite. El Centro de Poder de
      v9.0.0 implementa exactamente esto. Si se amplía a offset de relojes GPU,
      requerirá soporte Wayland que aún no está disponible en Bazzite/KDE.
* [x] Benchmark térmico integrado (carga sintética + reporte comparable) —
      CPU (workers por subprocess) y GPU local (vkcube ×4 immediate / glmark2);
      modal BENCHMARK con exportación JSON. (v8.0–v8.1)
* [x] Overlay para juegos: ventana siempre-encima, transparente, click-through,
      con selección de monitor y esquina. Muestra temp/W de CPU y GPU y RPM de
      los ventiladores. Read-only (sin tocar voltajes). (v8.2)
* [x] Overlay con temperatura promedio (AVG) y FPS reales vía registro de
      MangoHud (opt-in desde el modal OVERLAY). (v8.3)
* [x] Calibración PWM→RPM real por ventilador + cap aplicado en runtime por el
      servicio root (curvas prístinas, QUITAR CAP libera al instante). (v8.3)
* [x] **Wizard de primera vez** (pedido de Marshall 2026-06-10): detectar
      ventiladores → calibrar con explicación de permisos → benchmark CPU/GPU
      → guardar → tour de funciones. Nunca mostrar "medido" sin medir. (v9.0.0)
* [x] **UX de 4 estados por widget**: con datos / cargando / sin datos / error
      (RAM que no carga, ventilador dañado → mostrarlo parado explícito). (v9.0.0)
* [~] **Redragon K734WCG-RGB-PRO**: cable VID 0x258a PID 0x010c (Sinowealth/
      BY Tech), dongle 0x3554:0xfa09 (CompX). **Hecho (v8.4):** OpenRGB 1.0rc2
      probado → NO soporta 010c; detección propia por sysfs ya en la app;
      protocolo parcialmente mapeado desde el software BYCOMBO4
      (docs/redragon-protocol.md). **Falta:** captura USB en Windows (guía en
      ese doc) y recién ahí `redragon.py` (hidraw + ioctl, sin deps). OJO: NO
      mandar comandos adivinados — esta familia se ha brickeado (OpenRGB
      deshabilitó su controlador Sinowealth por eso). Sin Wine.
* [ ] **Música por zonas** (graves/medios/agudos): requiere teclado con zonas
      (el interno reporta 0; apunta al Redragon vía OpenRGB).
* [ ] **Multi-distro / multi-marca**: probar en Mint/Fedora; detectar hwmon
      genérico (ya enumeramos N ventiladores); meta = Armoury Crate de Linux
      que también sirva en Legion y otros.
* [ ] Widget KDE Plasma 6 (plasmoid leyendo `--json`)
* [ ] Exportación Prometheus (`--serve :9871/metrics`) + dashboard Grafana
* [ ] Alertas con acciones (ej. bajar perfil automáticamente al throttlear)
* [ ] Perfil automático por aplicación (gaming detecta Steam/juego activo)
* [ ] Telemetría remota en LAN (ver el portátil desde otro equipo, opt-in)

---

# v11 - Open Source (lo último, cuando Marshall dé el visto bueno)

## Objetivo

Publicar el proyecto para la comunidad: fácil de descargar, transparente,
sin telemetría de ningún tipo.

### Funciones

* [x] Repositorio Git inicializado
* [x] Estructura base del proyecto
* [x] README profesional
* [x] Licencia MIT
* [x] Instalador automático (`scripts/install.sh`, `scripts/install-desktop.sh`)
* [ ] GitHub Actions (lint + prueba `--json` en runner Ubuntu)
* [ ] Releases con tag semver y notas de cambio
* [ ] Capturas de pantalla en el README
* [ ] CONTRIBUTING.md + plantillas de issues
* [ ] Wiki (sensores soportados, troubleshooting por modelo)
* [ ] Publicación pública + post en r/linuxhardware y foros ROG

---

## Notas técnicas aprendidas

### ASUS ROG Strix G614JV

* CPU: Intel Core i7-13650HX
* GPU: RTX 4060 Mobile
* RAM: 48 GB DDR5
* Linux: Bazzite
* Sensores accesibles mediante:

  * lm_sensors
  * nvidia-smi
  * tuned-adm
  * sysfs
  * Intel RAPL

### Hallazgos importantes

* El valor "Package" representa el punto más caliente del procesador.
* No significa que todos los núcleos estén a esa temperatura.
* Durante las pruebas realizadas:

  * CPU Package ≈ 95°C
  * Promedio CPU ≈ 75–80°C
  * Solo 1–2 núcleos superaban los 90°C simultáneamente.
* Los ventiladores alcanzan aproximadamente 7000 RPM en carga máxima
  (CPU ~7000, GPU ~6900, central ~7500 al 100% de PWM).
* El comportamiento observado es consistente con el diseño térmico del equipo.
* Con `intel_pstate` (y `amd_pstate`) el governor del kernel siempre reporta
  `powersave`, incluso en modo performance: lo que cambia entre perfiles es el
  **EPP** (`energy_performance_preference`) y el perfil de plataforma ASUS.
  No es un bug; el monitor ahora muestra ambos y lo aclara.
* Bazzite usa `tuned-ppd` (no existe `powerprofilesctl`); el perfil se lee y
  se cambia por D-Bus: `org.freedesktop.UPower.PowerProfiles`.
* La lectura de potencia CPU (RAPL `energy_uj`) está restringida a root por
  la mitigación de PLATYPUS (CVE-2020-8694); se habilita con una regla
  tmpfiles (`scripts/enable-cpu-power.sh`).
