# ROG Monitor - Roadmap

## Estado actual del proyecto

**Versión actual:** v5.0 (junio 2026)

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

# v6 - Aplicación de Escritorio

## Objetivo

Crear una interfaz gráfica moderna.

### Funciones

* [ ] Aplicación Electron
* [ ] Dashboard gráfico
* [ ] Historial persistente
* [x] Exportación CSV (tecla `e`)
* [x] Exportación JSON (tecla `e`)
* [ ] Configuración visual

---

# v7 - Open Source

## Objetivo

Publicar el proyecto para la comunidad.

### Funciones

* [x] Repositorio Git inicializado
* [x] Estructura base del proyecto
* [x] README inicial
* [x] Roadmap inicial
* [ ] README profesional
* [ ] Wiki
* [ ] Releases
* [ ] GitHub Actions
* [ ] Instalador automático
* [ ] Publicación pública

---

# Ideas futuras

* [ ] Overlay para juegos
* [ ] Widget KDE Plasma
* [ ] Widget GNOME
* [ ] Exportación Prometheus
* [ ] Integración Grafana
* [ ] Benchmark térmico integrado
* [ ] Perfil automático batería
* [ ] Perfil automático gaming
* [ ] Compatibilidad con más ASUS ROG
* [ ] Compatibilidad con otras marcas

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
