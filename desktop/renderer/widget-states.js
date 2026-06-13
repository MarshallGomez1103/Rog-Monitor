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

  function evaluateGpu(stats) {
    const gpu = stats.gpu;
    if (!gpu) return 'empty';
    // dGPU apagada (modo Integrated): active === null/undefined
    if (!gpu.active) return 'empty';
    if (gpu.active.temp == null && gpu.active.util == null) return 'empty';
    return 'ok';
  }

  function evaluateFans(stats) {
    const fans = stats.fans;
    if (!fans || !fans.length) return 'empty';
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
      const stopped = fan.rpm === 0 || fan.rpm === null || fan.rpm === undefined;
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
    setState('cpu-block',    evaluateCpu(stats));
    setState('gpu-block',    evaluateGpu(stats));
    setState('fans-block',   evaluateFans(stats));
    setState('system-block', evaluateSystem(stats));
    setState('procs-block',  evaluateProcs(stats));
    markStoppedFans(stats);
  }

  function onBackendDown() {
    BLOCK_IDS.forEach((id) => setState(id, 'error'));
  }

  /* ---- punto de entrada ---- */
  function init() {
    initLoading();

    if (!window.rog) return;
    if (window.rog.onStats)       window.rog.onStats(onStats);
    if (window.rog.onBackendDown) window.rog.onBackendDown(onBackendDown);
  }

  init();

}());
