/* ROG Monitor — widget-states.js
   Gestiona los 4 estados de cada widget: loading / ok / empty / error.

   Estado    | Cuándo aplica
   --------- | -------------------------------------------------------
   loading   | Antes de recibir el primer stats (skeleton shimmer)
   ok        | Datos presentes y válidos
   empty     | Bloque sin datos útiles (dGPU apagada, RAM ilegible, etc.)
   error     | Backend caído — chip rojo explícito

   Se registra como suscriptor INDEPENDIENTE de window.rog.onStats y
   window.rog.onBackendDown; NO modifica ni llama a app.js/update().

   Los ventiladores a 0 RPM reciben la clase .fan-is-stopped en su elemento
   .fan, y el CSS muestra la etiqueta PARADO sobre el porcentaje.
*/

(function () {
  'use strict';

  /* Bloques que manejamos */
  const BLOCK_IDS = ['cpu-block', 'gpu-block', 'fans-block', 'system-block', 'procs-block'];

  /* ---- helpers ---- */
  function setState(blockId, state) {
    const el = document.getElementById(blockId);
    if (!el) return;
    if (el.dataset.state !== state) el.dataset.state = state;
  }

  /* Todos los bloques arrancan en "loading" hasta el primer stats */
  function initLoading() {
    BLOCK_IDS.forEach((id) => setState(id, 'loading'));
  }

  /* ---- lógica de estado por bloque ---- */
  function evaluateCpu(stats) {
    const cpu = stats.cpu;
    if (!cpu || cpu.avg == null) return 'empty';
    return 'ok';
  }

  /* Por qué la dGPU no da datos (el backend manda gpu.active = null en los tres casos):
       off    = modo Integrated (apagada de verdad)
       asleep = modo Hybrid con la dGPU en runtime-suspend (el backend NO la despierta)
       none   = sin modo conocido / otro modo: mensaje neutro, sin afirmar nada */
  function gpuIdleKind(gpu) {
    const mode = String((gpu && gpu.mode) || '').toLowerCase();
    if (gpu && gpu.active) return 'none';
    if (mode === 'integrated') return 'off';
    if (mode === 'hybrid') return 'asleep';
    return 'none';
  }

  const GPU_IDLE_KEYS = {
    off:    ['widget.gpu_off', 'widget.gpu_switch_hint'],
    asleep: ['widget.gpu_asleep', 'widget.gpu_asleep_hint'],
    none:   ['widget.gpu_nodata', 'widget.gpu_nodata_hint'],
  };
  let gpuIdleShown = null;

  /* Cambia los textos del overlay "empty" del bloque GPU (solo cuando cambia el
     motivo). Se hace con data-i18n + i18n.apply para que sobreviva al cambio de idioma. */
  function showGpuIdleReason(gpu) {
    const kind = gpuIdleKind(gpu);
    if (kind === gpuIdleShown) return;
    gpuIdleShown = kind;
    const block = document.getElementById('gpu-block');
    if (!block) return;
    const keys = GPU_IDLE_KEYS[kind];
    const spans = block.querySelectorAll('.widget-empty-msg [data-i18n]');
    if (spans[0]) spans[0].dataset.i18n = keys[0];
    if (spans[1]) spans[1].dataset.i18n = keys[1];
    const note = document.getElementById('gpu-off-note');
    if (note) note.dataset.i18n = keys[0];
    block.dataset.gpuIdle = kind;
    if (window.i18n && window.i18n.apply) window.i18n.apply(block);
  }

  function evaluateGpu(stats) {
    const gpu = stats.gpu;
    if (!gpu) return 'empty';
    // dGPU apagada (Integrated) o dormida (Hybrid, runtime-suspend): active === null
    if (!gpu.active) return 'empty';
    if (gpu.active.temp == null && gpu.active.util == null) return 'empty';
    return 'ok';
  }

  function evaluateFans(stats) {
    const fans = stats.fans;
    if (!fans || !fans.length) return 'empty';
    // Todos sin lectura (rpm null) → mismo estado "sin datos" del bloque
    if (fans.every((f) => f.rpm == null)) return 'empty';
    return 'ok';
  }

  function evaluateSystem(stats) {
    const sys = stats.sys;
    if (!sys) return 'empty';
    if (sys.ram_used_gb == null && sys.ram_total_gb == null) return 'empty';
    return 'ok';
  }

  function evaluateProcs(stats) {
    const procs = stats.procs;
    // Lista vacía es válida (no hay procesos top — raro pero posible)
    if (!procs) return 'empty';
    return 'ok';
  }

  /* ---- marcar ventiladores parados ---- */
  function markStoppedFans(stats) {
    const fans = stats.fans || [];
    fans.forEach((fan, i) => {
      const el = document.getElementById(`fan-${i}`);
      if (!el) return;
      // null/undefined = sin dato (no es "parado"): solo rpm 0 real cuenta como PARADO
      const stopped = fan.rpm === 0;
      el.classList.toggle('fan-is-stopped', stopped);

      // Asegurarse de que existe la etiqueta PARADO (la añadimos si falta)
      if (!el.querySelector('.fan-stopped-label')) {
        const lbl = document.createElement('div');
        lbl.className = 'fan-stopped-label';
        lbl.textContent = 'PARADO';
        // Insertar después de .pct
        const pct = el.querySelector('.pct');
        if (pct) pct.after(lbl);
        else el.appendChild(lbl);
      }
    });
  }

  /* ---- suscriptores ---- */
  function onStats(stats) {
    lastStatsTs = Date.now();
    backendDown = false;
    setState('cpu-block',    evaluateCpu(stats));
    const gpuState = evaluateGpu(stats);
    if (gpuState === 'empty') showGpuIdleReason(stats.gpu);
    setState('gpu-block',    gpuState);
    setState('fans-block',   evaluateFans(stats));
    setState('system-block', evaluateSystem(stats));
    setState('procs-block',  evaluateProcs(stats));
    markStoppedFans(stats);
  }

  function onBackendDown() {
    backendDown = true;
    BLOCK_IDS.forEach((id) => setState(id, 'error'));
  }

  /* ---- stale: el backend sigue vivo pero no llegan stats (>3 s sin refrescar) ---- */
  const STALE_MS = 3000;
  let lastStatsTs = 0;     // 0 = aún no llegó el primer stats (eso es "loading", no "stale")
  let backendDown = false; // "error" manda sobre "stale"

  function checkStale() {
    if (!lastStatsTs || backendDown || document.hidden) return;
    if (Date.now() - lastStatsTs > STALE_MS) BLOCK_IDS.forEach((id) => setState(id, 'stale'));
  }

  /* ---- punto de entrada ---- */
  function init() {
    initLoading();

    if (!window.rog) return;
    if (window.rog.onStats)       window.rog.onStats(onStats);
    if (window.rog.onBackendDown) window.rog.onBackendDown(onBackendDown);
    setInterval(checkStale, 1000);
  }

  init();

}());
