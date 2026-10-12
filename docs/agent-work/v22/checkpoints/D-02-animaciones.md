# D-02 — Coste de la app con la ventana visible (animaciones)
Estado: TESTED (mediciones con ruido: el equipo estaba jugando en parte de las corridas)
Evidencia previa: F0-09 (app visible 25–52 % CPU; gpu-process Wayland ~22 %).
Causa (medida por A/B con CSS inyectado vía CDP, `.ai/private/rog-v22/tools/anim-ab.mjs`): 14 animaciones infinitas (respiro `th-*` en los 11 bloques + 3 ventiladores) a 60–110 fps. En Wayland cada fotograma animado regenera la página entera. Mover el giro a un `<svg>` propio (compositor) NO bastó.
Cambios:
- Ventiladores: aspas en su propio `<svg class="fan-blades">`, giro `steps(10)` y duración ≥0.8 s (≤ ~12 cambios/s); `prefers-reduced-motion` las detiene.
- Respiro de temas: `steps(16)` en vez de ease continuo (11 reglas en styles/neon.css).
Antes/después (app aislada + su backend, 20 s por fase): todas las animaciones 30–60 % → **11–19 %**, igual que sin animaciones (10–12 %).
Tests: e2e 31/31, captura revisada (ventiladores y bloques se ven igual).
