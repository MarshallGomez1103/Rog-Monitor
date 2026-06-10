# ROG Monitor - Roadmap

## Estado actual del proyecto

**Versión actual:** v7.0 (junio 2026)

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
* [ ] Salud de discos (SMART vía helper con permiso de root) (→ v8)
* [ ] Umbrales de temperatura/alertas editables desde la app (→ v8)

---

# v8 - Compatibilidad Universal (propuesto)

> La meta: que funcione en cualquier portátil Linux, priorizando la familia
> ASUS ROG (Strix, Zephyrus, TUF) y degradando con elegancia en el resto.

* [ ] Autodetección de plataforma (ASUS / Lenovo Legion / HP Omen / genérico)
* [ ] Soporte AMD completo (k10temp por CCD, RAPL amd_energy, amdgpu probado)
* [ ] Perfiles vía `platform_profile` genérico cuando no haya asus-wmi
* [ ] Historial persistente (SQLite en ~/.local/share/rog-monitor)
* [ ] Configuración visual desde la app de escritorio (umbrales, tema, idioma)
* [ ] Paquetes: PyPI (`pipx install rog-monitor`), Flatpak, AUR, COPR
* [ ] Detección automática de máximos de ventilador por modelo (base de datos
      comunitaria en JSON)

---

# v9 - Power User (propuesto)

* [ ] Editor de curvas de ventilador desde la app (vía asusctl o sysfs)
* [ ] Benchmark térmico integrado (carga sintética + reporte comparable)
* [ ] Overlay para juegos (estilo MangoHud, vía socket local)
* [ ] Widget KDE Plasma 6 (plasmoid leyendo `--json`)
* [ ] Exportación Prometheus (`--serve :9871/metrics`) + dashboard Grafana
* [ ] Alertas con acciones (ej. bajar perfil automáticamente al throttlear)
* [ ] Perfil automático por aplicación (gaming detecta Steam/juego activo)
* [ ] Telemetría remota en LAN (ver el portátil desde otro equipo, opt-in)

---

# v10 - Open Source (lo último, cuando Marshall dé el visto bueno)

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
