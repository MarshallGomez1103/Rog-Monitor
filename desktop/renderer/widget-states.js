/* ROG Monitor — widget-states.js  (N-A4-02)
   Estados de cada panel: loading / ok / empty / unsupported / error / stale.

   Dos capas en un mismo script clásico (patrón UMD de procs-table.js):
     1. MODELO PURO  evaluate<Panel>(snapshot, ctx) -> {state, reason, action}
        Sin DOM ni reloj propio: todo entra por argumentos (testeable con
        `node --test`). Se expone como window.RogWidgetStates y module.exports.
     2. CABLEADO DOM createWiring(env): pone data-state / data-reason en los
        bloques, intercambia los textos del overlay "empty" y marca los
        ventiladores PARADO. En el navegador arranca solo; en Node no hace nada.

   Estado       | Cuándo aplica
   ------------ | -------------------------------------------------------------
   loading      | Aún no llegó ninguna muestra (skeleton shimmer)
   ok           | Datos presentes y válidos (0 es un valor legítimo)
   empty        | Hay muestra pero este bloque no trae datos útiles (lector
                | caído, sin sensor, lista vacía). NO se culpa al hardware.
   unsupported  | El hardware/configuración lo explica: dGPU apagada por modo,
                | equipo sin batería
   error        | Backend caído — chip rojo explícito
   stale        | Backend vivo pero sin muestras > STALE_MS (ventana visible)

   Regla de valores: `0` nunca cambia de estado; `null`/NaN/'' sí.
   Acciones (solo explicación o reintento; nada privilegiado):
   null | 'explain' | 'install' | 'retry'.

   Se registra como suscriptor INDEPENDIENTE de window.rog.onStats y
   window.rog.onBackendDown; NO modifica ni llama a app.js/update().
   Datasets que pone sobre cada bloque: data-state, data-reason, data-model-state, data-action
   (explain|retry|install), data-partial (hay datos válidos: el aviso va en línea) y data-why="diag"
   (muestra el botón «¿Por qué?» que abre el diagnóstico existente).
   Los ventiladores a 0 RPM reciben .fan-is-stopped (el CSS muestra PARADO).
*/
(function (root) {
  'use strict';

  /* Umbral único de datos viejos (spec F2-08; mismo valor que app.js STALE_MS). */
  const STALE_MS = 6000;
  const STATES = Object.freeze(['loading', 'ok', 'empty', 'unsupported', 'error', 'stale']);
  const PANELS = Object.freeze(['cpu', 'gpu', 'fans', 'system', 'procs', 'history', 'battery', 'events']);
  /* Paneles con bloque en el dashboard actual -> id del elemento */
  const BLOCKS = Object.freeze({
    cpu: 'cpu-block', gpu: 'gpu-block', fans: 'fans-block', system: 'system-block', procs: 'procs-block',
  });
  /* onboarding.css ya tiene [data-state="unsupported"] (S03-2): el estado se pinta tal cual.
     La constante queda como interruptor de rollback (true = pintarlo como "empty"). */
  const UNSUPPORTED_AS_EMPTY = false;
  /* Un vacío que aparece justo después de «ok» necesita 2 muestras seguidas para mostrarse:
     un lector que falla un solo tick no enciende y apaga el panel (N-A4-04, sin destellos). */
  const EMPTY_CONFIRM_TICKS = 2;
  /* Motivos con lector dudoso: ofrecen «por qué» -> diagnóstico existente (nada privilegiado) */
  const WHY_REASONS = Object.freeze(['reader_unavailable', 'unknown', 'no_data', 'no_reading']);
  /* Hay datos parciales válidos en el bloque: el aviso va en línea, no tapa el resto */
  const PARTIAL_REASONS = Object.freeze(['no_temp', 'no_reading']);

  /* ------------------------------------------------------------------ */
  /*  Modelo puro                                                        */
  /* ------------------------------------------------------------------ */
  /* Dato presente: no null/undefined/''/NaN. El 0 SÍ es presente. */
  const has = (v) => v != null && v !== '' && Number.isFinite(Number(v));
  const res = (state, reason, action) => ({ state, reason: reason || null, action: action || null });
  const isObj = (v) => v != null && typeof v === 'object';

  /* Edad de la muestra en ms. Prefiere snapshot.ts (epoch s, F2-08); si no, ctx.lastRxAt
     (epoch ms de llegada). ctx.resumedAt (ms) reinicia el reloj al volver a ser visible.
     null = no hay referencia. */
  function sampleAgeMs(snapshot, ctx) {
    const c = ctx || {};
    const now = Number.isFinite(c.now) ? c.now : Date.now();
    let ref = null;
    if (isObj(snapshot) && Number.isFinite(snapshot.ts) && snapshot.ts > 0) ref = snapshot.ts * 1000;
    else if (Number.isFinite(c.lastRxAt)) ref = c.lastRxAt;
    if (ref == null) return null;
    if (Number.isFinite(c.resumedAt) && c.resumedAt > ref) ref = c.resumedAt;
    return Math.max(0, now - ref);
  }

  /* Oculta = el backend está pausado a propósito: no cuenta como stale. */
  function isStale(snapshot, ctx) {
    if (ctx && ctx.hidden) return false;
    const age = sampleAgeMs(snapshot, ctx);
    return age != null && age > STALE_MS;
  }

  /* Compuerta común: error > loading > stale. null = el panel decide. */
  function gate(snapshot, ctx) {
    if (ctx && ctx.backendDown) return res('error', 'backend_down', 'retry');
    if (!isObj(snapshot)) return res('loading', 'no_sample');
    if (isStale(snapshot, ctx)) return res('stale', 'no_samples');
    return null;
  }

  function evaluateCpu(snapshot, ctx) {
    const g = gate(snapshot, ctx);
    if (g) return g;
    const cpu = snapshot.cpu;
    if (!isObj(cpu)) return res('empty', 'no_data');
    if (has(cpu.avg)) return res('ok');
    // _cpu_unavailable() (app.py): todo en null/[] => el lector falló, no el hardware
    const readerDown = !has(cpu.usage) && !has(cpu.package) && !has(cpu.max) &&
      !(Array.isArray(cpu.cores) && cpu.cores.length);
    return readerDown ? res('empty', 'reader_unavailable', 'explain') : res('empty', 'no_temp', 'explain');
  }

  /* Modo de la dGPU en minúsculas; vacío/'none'/'unknown'/'error' => sin modo fiable. */
  function gpuMode(gpu) {
    const m = String((gpu && gpu.mode) || '').trim().toLowerCase();
    return (m === '' || m === 'none' || m === 'unknown' || m === 'error') ? '' : m;
  }

  /* Por qué la dGPU no da datos (el backend manda gpu.active = null en todos los casos):
       integrated -> unsupported/gpu_off     (apagada de verdad por modo)
       hybrid     -> unsupported/gpu_asleep  (runtime-suspend; el backend NO la despierta)
       sin modo   -> empty/unknown           (no se afirma nada del hardware)
       otro modo  -> empty/no_data */
  function evaluateGpu(snapshot, ctx) {
    const g = gate(snapshot, ctx);
    if (g) return g;
    const gpu = snapshot.gpu;
    if (!isObj(gpu)) return res('empty', 'unknown', 'explain');
    if (!isObj(gpu.active)) {
      const mode = gpuMode(gpu);
      if (mode === 'integrated') return res('unsupported', 'gpu_off', 'explain');
      if (mode === 'hybrid') return res('unsupported', 'gpu_asleep', 'explain');
      if (mode === '') return res('empty', 'unknown', 'explain');
      return res('empty', 'no_data');
    }
    if (!has(gpu.active.temp) && !has(gpu.active.util)) return res('empty', 'no_reading');
    return res('ok');
  }

  function evaluateFans(snapshot, ctx) {
    const g = gate(snapshot, ctx);
    if (g) return g;
    const fans = snapshot.fans;
    if (!Array.isArray(fans)) return res('empty', 'no_data');
    if (!fans.length) return res('empty', 'no_fans', 'explain');
    // Todos sin lectura (rpm null) => "sin datos"; rpm 0 es un ventilador parado real
    if (fans.every((f) => !isObj(f) || !has(f.rpm))) return res('empty', 'no_reading');
    return res('ok');
  }

  function evaluateSystem(snapshot, ctx) {
    const g = gate(snapshot, ctx);
    if (g) return g;
    const sys = snapshot.sys;
    if (!isObj(sys)) return res('empty', 'no_data');
    if (has(sys.ram_used_gb) || has(sys.ram_total_gb)) return res('ok');
    // _sys_unavailable() (app.py): todo en null => lector caído
    const anything = ['ram_percent', 'rx_mbps', 'tx_mbps', 'uptime_s'].some((k) => has(sys[k])) ||
      (Array.isArray(sys.load) && sys.load.length > 0);
    return anything ? res('empty', 'no_reading') : res('empty', 'reader_unavailable', 'explain');
  }

  function evaluateProcs(snapshot, ctx) {
    const g = gate(snapshot, ctx);
    if (g) return g;
    const procs = snapshot.procs;
    // [] ya no es "ok" silencioso: tabla vacía = sin datos
    if (!Array.isArray(procs) || !procs.length) return res('empty', 'no_data');
    return res('ok');
  }

  /* Historial: snapshot.series = {nombre: [valor|null, ...]} */
  function evaluateHistory(snapshot, ctx) {
    const g = gate(snapshot, ctx);
    if (g) return g;
    const series = snapshot.series;
    if (!isObj(series)) return res('empty', 'no_data');
    const arrays = Object.values(series).filter(Array.isArray);
    if (!arrays.length || arrays.every((a) => a.length === 0)) return res('loading', 'collecting');
    return arrays.some((a) => a.some(has)) ? res('ok') : res('empty', 'no_data');
  }

  /* Batería: read() devuelve None sin batería (o si el lector falla: no se distingue). */
  function evaluateBattery(snapshot, ctx) {
    const g = gate(snapshot, ctx);
    if (g) return g;
    const b = snapshot.battery;
    if (!isObj(b)) return res('unsupported', 'no_battery', 'explain');
    return (has(b.capacity) || has(b.watts) || has(b.status)) ? res('ok') : res('empty', 'no_reading');
  }

  /* Eventos: [] es lo normal (sin alertas), no un error. */
  function evaluateEvents(snapshot, ctx) {
    const g = gate(snapshot, ctx);
    if (g) return g;
    const ev = snapshot.events;
    if (!Array.isArray(ev)) return res('empty', 'no_data');
    return ev.length ? res('ok') : res('empty', 'no_events');
  }

  const EVALUATORS = {
    cpu: evaluateCpu, gpu: evaluateGpu, fans: evaluateFans, system: evaluateSystem,
    procs: evaluateProcs, history: evaluateHistory, battery: evaluateBattery, events: evaluateEvents,
  };

  function evaluate(panel, snapshot, ctx) {
    const fn = EVALUATORS[panel];
    return fn ? fn(snapshot, ctx) : res('empty', 'unknown');
  }

  function evaluateAll(snapshot, ctx) {
    const out = {};
    PANELS.forEach((p) => { out[p] = evaluate(p, snapshot, ctx); });
    return out;
  }

  /* Claves i18n [título, pista?] para el overlay de un panel en empty/unsupported.
     null si el estado/motivo no tiene texto propio. Las claves widget.gpu_* y
     widget.no_cpu ya existen; el resto son nuevas (el cableado cae al texto actual
     si la clave no está registrada). */
  const REASON_KEYS = {
    cpu: {
      no_data: ['widget.no_cpu'],
      no_temp: ['widget.cpu_notemp', 'widget.cpu_notemp_hint'],
      reader_unavailable: ['widget.cpu_reader', 'widget.cpu_reader_hint'],
    },
    gpu: {
      gpu_off: ['widget.gpu_off', 'widget.gpu_switch_hint'],
      gpu_asleep: ['widget.gpu_asleep', 'widget.gpu_asleep_hint'],
      unknown: ['widget.gpu_nodata', 'widget.gpu_nodata_hint'],
      no_data: ['widget.gpu_nodata', 'widget.gpu_nodata_hint'],
      no_reading: ['widget.gpu_nodata', 'widget.gpu_nodata_hint'],
    },
    fans: {
      no_fans: ['widget.fans_none', 'widget.fans_none_hint'],
      no_reading: ['widget.fans_noreading', 'widget.fans_noreading_hint'],
      no_data: ['widget.fans_noreading', 'widget.fans_noreading_hint'],
    },
    system: {
      reader_unavailable: ['widget.sys_reader', 'widget.sys_reader_hint'],
      no_reading: ['widget.sys_reader', 'widget.sys_reader_hint'],
      no_data: ['widget.sys_reader', 'widget.sys_reader_hint'],
    },
    procs: {
      no_data: ['widget.procs_none', 'widget.procs_none_hint'],
    },
  };

  function reasonKeys(panel, result) {
    if (!result || (result.state !== 'empty' && result.state !== 'unsupported')) return null;
    const byPanel = REASON_KEYS[panel];
    return (byPanel && byPanel[result.reason]) || null;
  }

  /* ------------------------------------------------------------------ */
  /*  Cableado DOM (todo inyectado: testeable con un DOM falso)           */
  /* ------------------------------------------------------------------ */
  /* motivo de la dGPU -> valor histórico de data-gpu-idle */
  const GPU_IDLE = { gpu_off: 'off', gpu_asleep: 'asleep' };

  function createWiring(env) {
    const doc = env.document;
    const now = env.now || Date.now;

    /* t(key) con fallback: si la clave no existe t() devuelve la propia clave */
    const tr = (key, fallback) => {
      try {
        const v = env.t ? env.t(key) : key;
        return v && v !== key ? v : fallback;
      } catch (_) { return fallback; }
    };

    let last = null;          // última muestra
    let lastRxAt = 0;         // epoch ms de llegada (0 = ninguna: eso es loading, no stale)
    let resumedAt = 0;        // epoch ms en que la ventana volvió a ser visible
    let backendDown = false;
    const shown = {};         // blockId -> firma "estado|motivo" ya pintada
    const lastOk = {};        // blockId -> true si lo último PINTADO fue «ok»
    const emptyRun = {};      // blockId -> muestras vacías seguidas tras un «ok»
    const origKeys = {};      // blockId -> data-i18n originales del overlay "empty"

    const ctx = () => ({
      now: now(), lastRxAt: lastRxAt || null, resumedAt, backendDown, hidden: !!doc.hidden,
    });

    /* Cambia los textos del overlay "empty" (solo si cambia el motivo). Con
       data-i18n + i18n.apply sobrevive al cambio de idioma. Una clave nueva
       sin registrar deja el texto original. */
    function showReason(panel, el, result) {
      const keys = reasonKeys(panel, result);
      const spans = el.querySelectorAll
        ? Array.from(el.querySelectorAll('.widget-empty-msg [data-i18n]:not(.widget-why)')) : [];
      if (!origKeys[el.id || panel]) origKeys[el.id || panel] = spans.map((s) => s.dataset.i18n);
      const orig = origKeys[el.id || panel];
      spans.forEach((span, i) => {
        const want = keys && keys[i];
        const useNew = want && (panel === 'gpu' || tr(want, null) !== null);
        span.dataset.i18n = useNew ? want : orig[i];
      });
      if (panel === 'gpu') {
        const note = doc.getElementById('gpu-off-note');
        if (note && keys) note.dataset.i18n = keys[0];
        el.dataset.gpuIdle = GPU_IDLE[result.reason] || 'none';
      }
      if (env.i18n && env.i18n.apply) env.i18n.apply(el);
    }

    /* Anti-destello: ok -> vacío exige EMPTY_CONFIRM_TICKS muestras seguidas */
    function settle(id, result) {
      if (result.state === 'empty' && lastOk[id]) {
        emptyRun[id] = (emptyRun[id] || 0) + 1;
        if (emptyRun[id] < EMPTY_CONFIRM_TICKS) return null;     // se retiene lo pintado
      } else {
        emptyRun[id] = 0;
      }
      lastOk[id] = result.state === 'ok';
      return result;
    }

    function apply(panel, raw) {
      const id = BLOCKS[panel];
      const el = doc.getElementById(id);
      if (!el) return;
      const result = settle(id, raw);
      if (!result) return;
      const domState = (UNSUPPORTED_AS_EMPTY && result.state === 'unsupported') ? 'empty' : result.state;
      if (el.dataset.state !== domState) el.dataset.state = domState;
      el.dataset.modelState = result.state;
      if (result.reason) el.dataset.reason = result.reason; else delete el.dataset.reason;
      if (result.action) el.dataset.action = result.action; else delete el.dataset.action;
      if (result.state === 'empty' && PARTIAL_REASONS.includes(result.reason)) el.dataset.partial = '1';
      else delete el.dataset.partial;
      if (result.action === 'explain' && WHY_REASONS.includes(result.reason)) el.dataset.why = 'diag';
      else delete el.dataset.why;
      if (el.setAttribute) el.setAttribute('aria-busy', result.state === 'loading' ? 'true' : 'false');
      // el aviso de «vacío» es contenido útil (no vive en una región viva): visible a lectores de pantalla
      const msg = el.querySelector && el.querySelector('.widget-empty-msg');
      if (msg && msg.setAttribute) {
        msg.setAttribute('aria-hidden', (result.state === 'empty' || result.state === 'unsupported') ? 'false' : 'true');
      }
      const sig = result.state + '|' + result.reason;
      if (shown[id] === sig) return;
      shown[id] = sig;
      if (result.state === 'empty' || result.state === 'unsupported') showReason(panel, el, result);
    }

    function render() {
      const c = ctx();
      Object.keys(BLOCKS).forEach((p) => apply(p, evaluate(p, last, c)));
    }

    /* ---- ventiladores parados ---- */
    function markStoppedFans(snapshot) {
      const fans = (snapshot && snapshot.fans) || [];
      fans.forEach((fan, i) => {
        const el = doc.getElementById(`fan-${i}`);
        if (!el) return;
        // null/undefined = sin dato (no es "parado"): solo rpm 0 real cuenta como PARADO
        el.classList.toggle('fan-is-stopped', !!fan && fan.rpm === 0);
        if (!el.querySelector('.fan-stopped-label')) {
          const lbl = doc.createElement('div');
          lbl.className = 'fan-stopped-label';
          lbl.textContent = tr('widget.fan_stopped', 'PARADO');
          const pct = el.querySelector('.pct');
          if (pct) pct.after(lbl); else el.appendChild(lbl);
        }
      });
    }

    function onStats(snapshot) {
      last = snapshot;
      lastRxAt = now();
      backendDown = false;
      render();
      markStoppedFans(snapshot);
    }

    function onBackendDown() {
      backendDown = true;
      render();
    }

    /* Cada segundo: si la última muestra envejeció > STALE_MS, repinta. Sin muestra
       (loading), backend caído (error manda) u oculta (pausado a propósito) no hace nada. */
    function tick() {
      if (!last || backendDown || doc.hidden) return;
      if (isStale(last, ctx())) render();
    }

    function onVisibility() {
      if (!doc.hidden) resumedAt = now();
    }

    /* «¿Por qué?» -> diagnóstico existente. Delegado: un solo oyente para todos los bloques. */
    function onClick(e) {
      const hit = e && e.target && e.target.closest && e.target.closest('.widget-why');
      if (hit && env.openDiag) env.openDiag();
    }

    function start() {
      render();   // todo en loading hasta la primera muestra
      if (doc.addEventListener) {
        doc.addEventListener('visibilitychange', onVisibility);
        doc.addEventListener('click', onClick);
      }
      const rog = env.rog;
      if (!rog) return;
      if (rog.onStats) rog.onStats(onStats);
      if (rog.onBackendDown) rog.onBackendDown(onBackendDown);
      if (env.setInterval) env.setInterval(tick, 1000);
    }

    return { start, onStats, onBackendDown, tick };
  }

  const api = {
    STALE_MS, STATES, PANELS, BLOCKS, UNSUPPORTED_AS_EMPTY, EMPTY_CONFIRM_TICKS,
    has, sampleAgeMs, isStale, evaluate, evaluateAll,
    evaluateCpu, evaluateGpu, evaluateFans, evaluateSystem, evaluateProcs,
    evaluateHistory, evaluateBattery, evaluateEvents, reasonKeys, createWiring,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.RogWidgetStates = api;

  /* ---- punto de entrada: solo en el navegador ---- */
  if (root && typeof document !== 'undefined' && document) {
    // api.wiring: instancia viva (la usan las pruebas CDP para inyectar muestras de forma síncrona)
    api.wiring = createWiring({
      document,
      rog: root.rog,
      openDiag: () => { if (typeof root.openDiag === 'function') root.openDiag(); },
      i18n: { apply: (el) => { if (root.i18n && root.i18n.apply) root.i18n.apply(el); } },
      t: (k) => (typeof root.t === 'function' ? root.t(k) : k),
      now: Date.now,
      setInterval: (fn, ms) => root.setInterval(fn, ms),
    });
    api.wiring.start();
  }
})(typeof window !== 'undefined' ? window : null);
