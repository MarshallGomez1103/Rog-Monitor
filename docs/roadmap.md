# ROG Monitor - Roadmap

## Estado actual del proyecto

**Versión actual:** v2.1 (en desarrollo)

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

# v2 - Interfaz Mejorada (En progreso) 🚧

## Objetivo

Mejorar la experiencia visual sin perder rendimiento.

### Funciones

* [x] Migración de Bash a Python
* [x] Integración con Rich
* [x] Historial térmico CPU
* [x] Historial térmico GPU
* [x] Estado térmico general
* [ ] Colores dinámicos completos
* [ ] Barras visuales para ventiladores
* [ ] Barras visuales para CPU
* [ ] Barras visuales para GPU
* [ ] Detección de GPU activa
* [ ] Detección de modo Hybrid / Integrated / Dedicated
* [ ] Eliminación completa de mensajes de error de sensores
* [ ] Interfaz sin parpadeos
* [ ] Mejor distribución visual

---

# v3 - Estadísticas Avanzadas

## Objetivo

Convertir el monitor en una herramienta de análisis.

### Funciones

* [ ] Potencia CPU en tiempo real (Intel RAPL)
* [ ] Potencia promedio CPU
* [ ] Potencia máxima CPU
* [ ] Potencia mínima CPU
* [ ] Historial de potencia CPU
* [ ] Temperatura promedio 1 minuto
* [ ] Temperatura promedio 5 minutos
* [ ] Temperatura promedio 15 minutos
* [ ] Registro de thermal throttling
* [ ] Registro de eventos térmicos

---

# v4 - Sistema de Alertas

## Objetivo

Avisar cuando exista riesgo térmico o anomalías.

### Funciones

* [ ] Alerta por temperatura CPU
* [ ] Alerta por temperatura GPU
* [ ] Alerta por thermal throttling
* [ ] Alerta por ventiladores detenidos
* [ ] Alerta por potencia anormal
* [ ] Alertas configurables

---

# v5 - Dashboard Profesional

## Objetivo

Convertir el proyecto en una alternativa ligera a herramientas tipo btop.

### Funciones

* [ ] Vista CPU
* [ ] Vista GPU
* [ ] Vista RAM
* [ ] Vista almacenamiento
* [ ] Vista red
* [ ] Navegación por teclado
* [ ] Temas visuales
* [ ] Configuración persistente

---

# v6 - Aplicación de Escritorio

## Objetivo

Crear una interfaz gráfica moderna.

### Funciones

* [ ] Aplicación Electron
* [ ] Dashboard gráfico
* [ ] Historial persistente
* [ ] Exportación CSV
* [ ] Exportación JSON
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
* Los ventiladores alcanzan aproximadamente 7000 RPM en carga máxima.
* El comportamiento observado es consistente con el diseño térmico del equipo.
