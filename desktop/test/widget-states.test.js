'use strict';
// N-A4-02: modelo puro de estados de panel (loading/ok/empty/unsupported/error/stale) + su cableado DOM.
// widget-states.js es un script clásico (window.RogWidgetStates) con export CommonJS para testear sin Electron.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const vm = require('node:vm');
const fs = require('node:fs');

const file = path.join(__dirname, '..', 'renderer', 'widget-states.js');
const WS = require(file);

const NOW = 1_800_000_000_000; // ms, reloj falso
const S = (extra) => Object.assign({
  ts: NOW / 1000,
  cpu: { avg: 55, usage: 12, package: 60, model: 'Ryzen', cores: [50, 51], core_grid: [] },
  gpu: { mode: 'Hybrid', active: { temp: 50, util: 3, power: 10 } },
  fans: [{ label: 'cpu_fan', rpm: 2300 }, { label: 'gpu_fan', rpm: 2500 }],
  sys: { ram_total_gb: 16, ram_used_gb: 6, ram_percent: 37, load: [1, 1, 1], uptime_s: 100, rx_mbps: 0 },
  procs: [{ pid: 1, name: 'x', cpu: 1, mem_mb: 10 }],
  battery: { capacity: 80, status: 'Discharging', watts: 12, on_ac: false },
  series: { cpu_temp: [50, 51, null], gpu_temp: [] },
  events: [[1, 'warn', 'x']],
}, extra);
const ctx = (extra) => Object.assign({ now: NOW }, extra);
const st = (r) => [r.state, r.reason, r.action];

/* la API y el reloj ---------------------------------------------------- */
test('exporta la API y se expone como window.RogWidgetStates', () => {
  for (const k of ['STALE_MS', 'evaluate', 'evaluateAll', 'evaluateCpu', 'evaluateGpu', 'evaluateFans',
    'evaluateSystem', 'evaluateProcs', 'evaluateHistory', 'evaluateBattery', 'evaluateEvents',
    'sampleAgeMs', 'isStale', 'reasonKeys', 'createWiring']) {
    assert.ok(WS[k] !== undefined, `falta ${k}`);
  }
  const sandbox = { window: {}, document: undefined };
  sandbox.window.window = sandbox.window;
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox);
  assert.strictEqual(typeof sandbox.window.RogWidgetStates.evaluateCpu, 'function');
});

test('STALE_MS único = 6000 (spec F2-08)', () => assert.strictEqual(WS.STALE_MS, 6000));

test('forma del resultado: {state, reason, action} y estados válidos', () => {
  const r = WS.evaluateCpu(S(), ctx());
  assert.deepStrictEqual(Object.keys(r).sort(), ['action', 'reason', 'state']);
  assert.deepStrictEqual(st(r), ['ok', null, null]);
  for (const x of Object.values(WS.evaluateAll(S(), ctx()))) {
    assert.ok(['loading', 'ok', 'empty', 'unsupported', 'error', 'stale'].includes(x.state));
    assert.ok([null, 'explain', 'install', 'retry'].includes(x.action));
  }
});

/* compuerta común: sin muestra, backend caído, stale ---------------------- */
test('sin muestra todavía => loading en todos los paneles', () => {
  for (const [p, r] of Object.entries(WS.evaluateAll(null, ctx()))) {
    assert.deepStrictEqual(st(r), ['loading', 'no_sample', null], p);
  }
  assert.strictEqual(WS.evaluateCpu(undefined, ctx()).state, 'loading');
  assert.strictEqual(WS.evaluateCpu('basura', ctx()).state, 'loading');
});

test('backend caído => error/retry, aunque haya snapshot y aunque sea viejo', () => {
  const old = S({ ts: NOW / 1000 - 99 });
  for (const snap of [S(), old, null]) {
    for (const r of Object.values(WS.evaluateAll(snap, ctx({ backendDown: true })))) {
      assert.deepStrictEqual(st(r), ['error', 'backend_down', 'retry']);
    }
  }
});

test('stale: 5,9 s no, 6,0 s no, 6,1 s sí (reloj falso, snapshot.ts)', () => {
  const at = (age) => S({ ts: (NOW - age) / 1000 });
  assert.strictEqual(WS.evaluateCpu(at(5900), ctx()).state, 'ok');
  assert.strictEqual(WS.evaluateCpu(at(6000), ctx()).state, 'ok');
  assert.deepStrictEqual(st(WS.evaluateCpu(at(6100), ctx())), ['stale', 'no_samples', null]);
  assert.strictEqual(WS.isStale(at(5900), ctx()), false);
  assert.strictEqual(WS.isStale(at(6100), ctx()), true);
  for (const r of Object.values(WS.evaluateAll(at(6100), ctx()))) assert.strictEqual(r.state, 'stale');
});

test('stale prefiere snapshot.ts; sin ts usa ctx.lastRxAt; sin ninguno no es stale', () => {
  const noTs = S(); delete noTs.ts;
  assert.strictEqual(WS.sampleAgeMs(S({ ts: (NOW - 7000) / 1000 }), ctx({ lastRxAt: NOW - 100 })), 7000);
  assert.strictEqual(WS.sampleAgeMs(noTs, ctx({ lastRxAt: NOW - 100 })), 100);
  assert.strictEqual(WS.isStale(noTs, ctx({ lastRxAt: NOW - 6100 })), true);
  assert.strictEqual(WS.sampleAgeMs(noTs, ctx()), null);
  assert.strictEqual(WS.isStale(noTs, ctx()), false);
  assert.strictEqual(WS.sampleAgeMs(S({ ts: 'x' }), ctx({ lastRxAt: NOW - 50 })), 50); // ts inválido
  assert.strictEqual(WS.sampleAgeMs(S({ ts: (NOW + 5000) / 1000 }), ctx()), 0);        // ts futuro
  assert.ok(Number.isFinite(WS.sampleAgeMs(S({ ts: 1 }), {})));                        // sin ctx.now usa Date.now
});

test('stale: ventana oculta no cuenta; resumedAt reinicia el reloj al volver', () => {
  const old = S({ ts: (NOW - 60000) / 1000 });
  assert.strictEqual(WS.evaluateCpu(old, ctx({ hidden: true })).state, 'ok');
  assert.strictEqual(WS.evaluateCpu(old, ctx({ resumedAt: NOW - 200 })).state, 'ok');
  assert.strictEqual(WS.evaluateCpu(old, ctx({ resumedAt: NOW - 7000 })).state, 'stale');
});

test('backend caído gana a stale', () => {
  const old = S({ ts: (NOW - 60000) / 1000 });
  assert.strictEqual(WS.evaluateCpu(old, ctx({ backendDown: true })).state, 'error');
});

/* CPU ---------------------------------------------------------------------- */
test('CPU: 0 legítimo es ok; null por lector caído es empty/reader_unavailable', () => {
  assert.strictEqual(WS.evaluateCpu(S({ cpu: { avg: 0, usage: 0, package: 0 } }), ctx()).state, 'ok');
  // forma real de _cpu_unavailable() en app.py
  const down = { model: null, cores: [], core_grid: [], usage: null, iowait: null, steal: null,
    avg: null, max: null, min: null, package: null, hot90: 0, freq_ghz: null, throttle_count: 0 };
  assert.deepStrictEqual(st(WS.evaluateCpu(S({ cpu: down }), ctx())), ['empty', 'reader_unavailable', 'explain']);
});

test('CPU: sin temperatura pero con uso => empty/no_temp; sin bloque => empty/no_data', () => {
  assert.deepStrictEqual(st(WS.evaluateCpu(S({ cpu: { avg: null, usage: 10, package: null, cores: [] } }), ctx())),
    ['empty', 'no_temp', 'explain']);
  assert.deepStrictEqual(st(WS.evaluateCpu(S({ cpu: null }), ctx())), ['empty', 'no_data', null]);
  assert.deepStrictEqual(st(WS.evaluateCpu(S({ cpu: { avg: NaN, usage: 3 } }), ctx())), ['empty', 'no_temp', 'explain']);
});

/* GPU ---------------------------------------------------------------------- */
test('GPU: activa con datos => ok; 0 °C / 0 % legítimos => ok', () => {
  assert.strictEqual(WS.evaluateGpu(S(), ctx()).state, 'ok');
  assert.strictEqual(WS.evaluateGpu(S({ gpu: { mode: 'Hybrid', active: { temp: 0, util: 0 } } }), ctx()).state, 'ok');
  assert.strictEqual(WS.evaluateGpu(S({ gpu: { mode: 'Hybrid', active: { temp: null, util: 0 } } }), ctx()).state, 'ok');
});

test('GPU: Integrated / Hybrid sin activa => unsupported por modo (off / asleep)', () => {
  assert.deepStrictEqual(st(WS.evaluateGpu(S({ gpu: { mode: 'Integrated', active: null } }), ctx())),
    ['unsupported', 'gpu_off', 'explain']);
  assert.deepStrictEqual(st(WS.evaluateGpu(S({ gpu: { mode: 'hybrid', active: null } }), ctx())),
    ['unsupported', 'gpu_asleep', 'explain']);
});

test('GPU: mode vacío/error/ausente NO se atribuye a hardware => empty/unknown', () => {
  for (const mode of [null, '', undefined, 'unknown', 'error', 'None', '  ']) {
    assert.deepStrictEqual(st(WS.evaluateGpu(S({ gpu: { mode, active: null } }), ctx())),
      ['empty', 'unknown', 'explain'], String(mode));
  }
  // forma real de _gpu_unavailable()
  assert.strictEqual(WS.evaluateGpu(S({ gpu: { mode: null, pending: null, supported: [], active: null } }), ctx()).reason, 'unknown');
  assert.deepStrictEqual(st(WS.evaluateGpu(S({ gpu: null }), ctx())), ['empty', 'unknown', 'explain']);
});

test('GPU: otro modo conocido sin lecturas => empty/no_data; activa sin temp ni util => empty/no_reading', () => {
  assert.deepStrictEqual(st(WS.evaluateGpu(S({ gpu: { mode: 'AsusMuxDgpu', active: null } }), ctx())), ['empty', 'no_data', null]);
  assert.deepStrictEqual(st(WS.evaluateGpu(S({ gpu: { mode: 'Hybrid', active: { temp: null, util: null } } }), ctx())),
    ['empty', 'no_reading', null]);
});

/* Ventiladores ------------------------------------------------------------- */
test('Fans: [] => empty/no_fans; todos rpm null => empty/no_reading; rpm 0 => ok', () => {
  assert.deepStrictEqual(st(WS.evaluateFans(S({ fans: [] }), ctx())), ['empty', 'no_fans', 'explain']);
  assert.deepStrictEqual(st(WS.evaluateFans(S({ fans: [{ rpm: null }, { rpm: null }] }), ctx())), ['empty', 'no_reading', null]);
  assert.strictEqual(WS.evaluateFans(S({ fans: [{ rpm: 0 }, { rpm: null }] }), ctx()).state, 'ok');
  assert.strictEqual(WS.evaluateFans(S({ fans: null }), ctx()).reason, 'no_data');
});

/* Sistema ------------------------------------------------------------------ */
test('Sistema: lector caído (_sys_unavailable) => empty/reader_unavailable; 0 legítimo => ok', () => {
  const down = { ram_total_gb: null, ram_used_gb: null, ram_percent: null, rx_mbps: null, tx_mbps: null,
    disks: [], load: null, uptime_s: null, dmi: {} };
  assert.deepStrictEqual(st(WS.evaluateSystem(S({ sys: down }), ctx())), ['empty', 'reader_unavailable', 'explain']);
  assert.strictEqual(WS.evaluateSystem(S({ sys: { ram_total_gb: 16, ram_used_gb: 0 } }), ctx()).state, 'ok');
  assert.strictEqual(WS.evaluateSystem(S({ sys: { ram_total_gb: null, ram_used_gb: null, load: [0, 0, 0] } }), ctx()).reason, 'no_reading');
  assert.deepStrictEqual(st(WS.evaluateSystem(S({ sys: null }), ctx())), ['empty', 'no_data', null]);
});

/* Procesos ----------------------------------------------------------------- */
test('Procesos: [] => empty/no_data (ya no ok silencioso); null => empty; con filas => ok', () => {
  assert.deepStrictEqual(st(WS.evaluateProcs(S({ procs: [] }), ctx())), ['empty', 'no_data', null]);
  assert.strictEqual(WS.evaluateProcs(S({ procs: null }), ctx()).state, 'empty');
  assert.strictEqual(WS.evaluateProcs(S({ procs: {} }), ctx()).state, 'empty');
  assert.strictEqual(WS.evaluateProcs(S(), ctx()).state, 'ok');
});

/* Historial / batería / eventos -------------------------------------------- */
test('Historial: sin series => empty; todas vacías => loading/collecting; solo null => empty; con puntos => ok', () => {
  assert.deepStrictEqual(st(WS.evaluateHistory(S({ series: undefined }), ctx())), ['empty', 'no_data', null]);
  assert.deepStrictEqual(st(WS.evaluateHistory(S({ series: {} }), ctx())), ['loading', 'collecting', null]);
  assert.deepStrictEqual(st(WS.evaluateHistory(S({ series: { a: [], b: [] } }), ctx())), ['loading', 'collecting', null]);
  assert.deepStrictEqual(st(WS.evaluateHistory(S({ series: { a: [null, null] } }), ctx())), ['empty', 'no_data', null]);
  assert.strictEqual(WS.evaluateHistory(S({ series: { a: [null, 0] } }), ctx()).state, 'ok'); // 0 legítimo
  assert.strictEqual(WS.evaluateHistory(S(), ctx()).state, 'ok');
});

test('Batería: sin batería => unsupported/no_battery; sin lecturas => empty; 0 % legítimo => ok', () => {
  assert.deepStrictEqual(st(WS.evaluateBattery(S({ battery: null }), ctx())), ['unsupported', 'no_battery', 'explain']);
  assert.deepStrictEqual(st(WS.evaluateBattery(S({ battery: { capacity: null, status: null, watts: null } }), ctx())),
    ['empty', 'no_reading', null]);
  assert.strictEqual(WS.evaluateBattery(S({ battery: { capacity: 0, status: null, watts: null } }), ctx()).state, 'ok');
  assert.strictEqual(WS.evaluateBattery(S(), ctx()).state, 'ok');
});

test('Eventos: [] => empty/no_events (normal, sin acción); con eventos => ok; sin campo => empty/no_data', () => {
  assert.deepStrictEqual(st(WS.evaluateEvents(S({ events: [] }), ctx())), ['empty', 'no_events', null]);
  assert.deepStrictEqual(st(WS.evaluateEvents(S({ events: undefined }), ctx())), ['empty', 'no_data', null]);
  assert.strictEqual(WS.evaluateEvents(S(), ctx()).state, 'ok');
});

test('evaluate(panel) despacha y los paneles desconocidos no lanzan', () => {
  assert.strictEqual(WS.evaluate('cpu', S(), ctx()).state, 'ok');
  assert.deepStrictEqual(st(WS.evaluate('nope', S(), ctx())), ['empty', 'unknown', null]);
  assert.deepStrictEqual(Object.keys(WS.evaluateAll(S(), ctx())).sort(),
    ['battery', 'cpu', 'events', 'fans', 'gpu', 'history', 'procs', 'system']);
  assert.doesNotThrow(() => WS.evaluateAll(undefined));
});

/* claves de texto --------------------------------------------------------- */
test('reasonKeys: solo para empty/unsupported; gpu conserva sus claves actuales', () => {
  const k = (panel, snap) => WS.reasonKeys(panel, WS.evaluate(panel, snap, ctx()));
  assert.deepStrictEqual(k('gpu', S({ gpu: { mode: 'Integrated', active: null } })), ['widget.gpu_off', 'widget.gpu_switch_hint']);
  assert.deepStrictEqual(k('gpu', S({ gpu: { mode: 'Hybrid', active: null } })), ['widget.gpu_asleep', 'widget.gpu_asleep_hint']);
  assert.deepStrictEqual(k('gpu', S({ gpu: { mode: null, active: null } })), ['widget.gpu_nodata', 'widget.gpu_nodata_hint']);
  assert.deepStrictEqual(k('cpu', S({ cpu: null })), ['widget.no_cpu']);
  assert.ok(k('cpu', S({ cpu: { avg: null, usage: 1 } }))[0].startsWith('widget.'));
  assert.ok(k('fans', S({ fans: [] }))[0].startsWith('widget.'));
  assert.ok(k('system', S({ sys: null }))[0].startsWith('widget.'));
  assert.ok(k('procs', S({ procs: [] }))[0].startsWith('widget.'));
  assert.strictEqual(k('cpu', S()), null);
  assert.strictEqual(WS.reasonKeys('cpu', WS.evaluate('cpu', null, ctx())), null);
  assert.strictEqual(WS.reasonKeys('history', { state: 'empty', reason: 'no_data' }), null);
});

/* cableado DOM con DOM falso ---------------------------------------------- */
function fakeEl(extra) {
  const classes = new Set();
  return Object.assign({
    dataset: {},
    _kids: {},
    classList: { toggle(c, on) { if (on) classes.add(c); else classes.delete(c); }, contains: (c) => classes.has(c) },
    querySelector(sel) { return this._kids[sel] || null; },
    querySelectorAll(sel) { return this._spans && sel.includes('[data-i18n]') ? this._spans : []; },
    appendChild(c) { this._kids['.fan-stopped-label'] = c; },
  }, extra);
}
function fakeEnv(opts) {
  opts = opts || {};
  const els = {};
  for (const id of ['cpu-block', 'gpu-block', 'fans-block', 'system-block', 'procs-block']) els[id] = fakeEl();
  els['gpu-block']._spans = [fakeEl({ dataset: { i18n: 'widget.gpu_off' } }), fakeEl({ dataset: { i18n: 'widget.gpu_switch_hint' } })];
  els['cpu-block']._spans = [fakeEl({ dataset: { i18n: 'widget.no_cpu' } })];
  els['gpu-off-note'] = fakeEl({ dataset: {} });
  els['fan-0'] = fakeEl({ _kids: { '.pct': { after(l) { els['fan-0']._kids['.fan-stopped-label'] = l; } } } });
  els['fan-1'] = fakeEl(); // sin .pct => appendChild
  const clock = { t: NOW };
  const handlers = {};
  const intervals = [];
  const applied = [];
  const doc = {
    hidden: false,
    getElementById: (id) => els[id] || null,
    createElement: () => ({ className: '', textContent: '' }),
    addEventListener: (ev, fn) => { handlers[ev] = fn; },
  };
  const dict = opts.dict || {};
  const env = {
    document: doc,
    rog: opts.rog === null ? null : {
      onStats: (fn) => { handlers.stats = fn; },
      onBackendDown: (fn) => { handlers.down = fn; },
    },
    i18n: { apply: (root) => applied.push(root) },
    t: (k) => (k in dict ? dict[k] : k),
    now: () => clock.t,
    setInterval: (fn, ms) => { intervals.push([fn, ms]); },
  };
  return { env, els, clock, handlers, intervals, doc, applied };
}
const stateOf = (els) => Object.fromEntries(
  ['cpu', 'gpu', 'fans', 'system', 'procs'].map((p) => [p, els[`${p}-block`].dataset.state]));

test('cableado: arranca en loading, suscribe stats/backend-down y un tick de 1 s', () => {
  const f = fakeEnv();
  const w = WS.createWiring(f.env);
  w.start();
  assert.deepStrictEqual(Object.values(stateOf(f.els)), ['loading', 'loading', 'loading', 'loading', 'loading']);
  assert.strictEqual(typeof f.handlers.stats, 'function');
  assert.strictEqual(typeof f.handlers.down, 'function');
  assert.strictEqual(f.intervals[0][1], 1000);
});

test('cableado: stats => ok + data-reason vacío; GPU Integrated => data-state unsupported (CSS propio, ya sin compat empty)', () => {
  const f = fakeEnv();
  WS.createWiring(f.env).start();
  f.handlers.stats(S());
  assert.deepStrictEqual(Object.values(stateOf(f.els)), ['ok', 'ok', 'ok', 'ok', 'ok']);
  assert.strictEqual(f.els['cpu-block'].dataset.reason, undefined);
  f.handlers.stats(S({ gpu: { mode: 'Integrated', active: null }, fans: [], procs: [] }));
  f.handlers.stats(S({ gpu: { mode: 'Integrated', active: null }, fans: [], procs: [] }));   // 2.ª muestra: confirma los vacíos
  assert.strictEqual(WS.UNSUPPORTED_AS_EMPTY, false);
  assert.strictEqual(f.els['gpu-block'].dataset.state, 'unsupported');
  assert.strictEqual(f.els['gpu-block'].dataset.modelState, 'unsupported');
  assert.strictEqual(f.els['gpu-block'].dataset.reason, 'gpu_off');
  assert.strictEqual(f.els['gpu-block'].dataset.gpuIdle, 'off');
  assert.strictEqual(f.els['fans-block'].dataset.reason, 'no_fans');
  assert.strictEqual(f.els['procs-block'].dataset.reason, 'no_data');
  f.handlers.stats(S());
  assert.strictEqual(f.els['gpu-block'].dataset.state, 'ok');
  assert.strictEqual(f.els['gpu-block'].dataset.reason, undefined);
  assert.strictEqual(f.els['gpu-block'].dataset.modelState, 'ok');
});

test('cableado: textos de GPU por motivo (claves actuales) y se llama a i18n.apply solo al cambiar', () => {
  const f = fakeEnv();
  WS.createWiring(f.env).start();
  f.handlers.stats(S({ gpu: { mode: 'Hybrid', active: null } }));
  const [a, b] = f.els['gpu-block']._spans;
  assert.deepStrictEqual([a.dataset.i18n, b.dataset.i18n], ['widget.gpu_asleep', 'widget.gpu_asleep_hint']);
  assert.strictEqual(f.els['gpu-off-note'].dataset.i18n, 'widget.gpu_asleep');
  assert.strictEqual(f.els['gpu-block'].dataset.gpuIdle, 'asleep');
  const n = f.applied.length;
  f.handlers.stats(S({ gpu: { mode: 'Hybrid', active: null } }));
  assert.strictEqual(f.applied.length, n, 'mismo motivo => no reaplica');
  f.handlers.stats(S({ gpu: { mode: null, active: null } }));
  assert.strictEqual(a.dataset.i18n, 'widget.gpu_nodata');
  assert.strictEqual(f.els['gpu-block'].dataset.gpuIdle, 'none');
});

test('cableado: clave nueva inexistente => conserva el texto actual; existente => la usa; y se restaura', () => {
  const f = fakeEnv();
  WS.createWiring(f.env).start();
  const cpuSpan = f.els['cpu-block']._spans[0];
  f.handlers.stats(S({ cpu: { avg: null, usage: 5 } }));            // widget.cpu_notemp no existe => sin cambios
  assert.strictEqual(cpuSpan.dataset.i18n, 'widget.no_cpu');
  const g = fakeEnv({ dict: { 'widget.cpu_notemp': 'Sin sensor de temperatura' } });
  WS.createWiring(g.env).start();
  g.handlers.stats(S({ cpu: { avg: null, usage: 5 } }));
  assert.strictEqual(g.els['cpu-block']._spans[0].dataset.i18n, 'widget.cpu_notemp');
  g.handlers.stats(S({ cpu: null }));                                // vuelve a la clave original
  assert.strictEqual(g.els['cpu-block']._spans[0].dataset.i18n, 'widget.no_cpu');
});

test('cableado: backend caído => error en todos; nuevo stats lo recupera', () => {
  const f = fakeEnv();
  WS.createWiring(f.env).start();
  f.handlers.stats(S());
  f.handlers.down();
  assert.deepStrictEqual(Object.values(stateOf(f.els)), ['error', 'error', 'error', 'error', 'error']);
  assert.strictEqual(f.els['cpu-block'].dataset.reason, 'backend_down');
  f.handlers.stats(S());
  assert.strictEqual(f.els['cpu-block'].dataset.state, 'ok');
});

test('cableado: stale con reloj falso (5,9 s no / 6,1 s sí) y se quita con la muestra siguiente', () => {
  const f = fakeEnv();
  WS.createWiring(f.env).start();
  const tick = f.intervals[0][0];
  f.handlers.stats(S());                         // ts = NOW
  f.clock.t = NOW + 5900; tick();
  assert.strictEqual(f.els['cpu-block'].dataset.state, 'ok');
  f.clock.t = NOW + 6100; tick();
  assert.deepStrictEqual(Object.values(stateOf(f.els)), ['stale', 'stale', 'stale', 'stale', 'stale']);
  assert.strictEqual(f.els['cpu-block'].dataset.reason, 'no_samples');
  f.handlers.stats(S({ ts: (NOW + 6200) / 1000 }));
  assert.strictEqual(f.els['cpu-block'].dataset.state, 'ok');
});

test('cableado: tick no hace nada sin muestra, con backend caído ni con ventana oculta; visibilidad reinicia el reloj', () => {
  const f = fakeEnv();
  WS.createWiring(f.env).start();
  const tick = f.intervals[0][0];
  f.clock.t = NOW + 60000; tick();                        // sin muestra: sigue loading
  assert.strictEqual(f.els['cpu-block'].dataset.state, 'loading');
  f.handlers.stats(S({ ts: (NOW + 60000) / 1000 }));
  f.doc.hidden = true; f.clock.t = NOW + 120000; tick();  // oculta: no stale
  assert.strictEqual(f.els['cpu-block'].dataset.state, 'ok');
  f.doc.hidden = false; f.handlers.visibilitychange();     // vuelve: resumedAt = ahora
  tick();
  assert.strictEqual(f.els['cpu-block'].dataset.state, 'ok');
  f.clock.t += 6100; tick();
  assert.strictEqual(f.els['cpu-block'].dataset.state, 'stale');
  f.handlers.down(); f.clock.t += 9000; tick();
  assert.strictEqual(f.els['cpu-block'].dataset.state, 'error');
  f.doc.hidden = true; f.handlers.visibilitychange();      // oculta: el handler no reinicia nada
  tick();
});

test('cableado: ventiladores — solo rpm 0 real es PARADO; etiqueta con fallback i18n', () => {
  const f = fakeEnv();
  WS.createWiring(f.env).start();
  f.handlers.stats(S({ fans: [{ rpm: 0 }, { rpm: null }, { rpm: 100 }] }));
  assert.strictEqual(f.els['fan-0'].classList.contains('fan-is-stopped'), true);
  assert.strictEqual(f.els['fan-1'].classList.contains('fan-is-stopped'), false);
  assert.strictEqual(f.els['fan-0']._kids['.fan-stopped-label'].textContent, 'PARADO');
  assert.ok(f.els['fan-1']._kids['.fan-stopped-label']);
  const g = fakeEnv({ dict: { 'widget.fan_stopped': 'STOPPED' } });
  WS.createWiring(g.env).start();
  g.handlers.stats(S({ fans: [{ rpm: 0 }] }));
  assert.strictEqual(g.els['fan-0']._kids['.fan-stopped-label'].textContent, 'STOPPED');
  g.handlers.stats(S({ fans: [{ rpm: 0 }] }));       // etiqueta ya existe: no se duplica
});

test('cableado: tolera entorno mínimo (sin window.rog, sin i18n, sin bloques, t que lanza)', () => {
  const f = fakeEnv({ rog: null });
  WS.createWiring(f.env).start();
  assert.strictEqual(f.intervals.length, 0);
  assert.strictEqual(f.els['cpu-block'].dataset.state, 'loading');
  const w = WS.createWiring({ document: { hidden: false, getElementById: () => null }, rog: { onStats() {} },
    now: () => NOW, t: () => { throw new Error('x'); } });
  assert.doesNotThrow(() => { w.start(); w.onStats(S({ fans: [{ rpm: 0 }], gpu: { mode: 'Integrated', active: null } })); w.onBackendDown(); w.tick(); });
});


/* N-A4-03/04 (S03-2): cableado de estados -------------------------------- */
test('cableado: unsupported se pinta como unsupported (CSS propio) y empty parcial marca data-partial', () => {
  const f = fakeEnv();
  WS.createWiring(f.env).start();
  f.handlers.stats(S({ gpu: { mode: 'Hybrid', active: null }, cpu: { avg: null, usage: 5 } }));
  assert.strictEqual(f.els['gpu-block'].dataset.state, 'unsupported');
  assert.strictEqual(f.els['cpu-block'].dataset.state, 'empty');
  assert.strictEqual(f.els['cpu-block'].dataset.reason, 'no_temp');
  assert.strictEqual(f.els['cpu-block'].dataset.partial, '1', 'sin temperatura pero con uso: no se tapan los demás datos');
  f.handlers.stats(S());
  assert.strictEqual(f.els['cpu-block'].dataset.partial, undefined);
});

test('cableado: acción "por qué" (data-why) solo si hay algo que diagnosticar; no para hardware explicado', () => {
  const f = fakeEnv();
  WS.createWiring(f.env).start();
  f.handlers.stats(S({ cpu: { avg: null, usage: null, cores: [] }, gpu: { mode: 'Integrated', active: null } }));
  assert.strictEqual(f.els['cpu-block'].dataset.why, 'diag', 'lector caído => enlaza al diagnóstico');
  assert.strictEqual(f.els['cpu-block'].dataset.action, 'explain');
  assert.strictEqual(f.els['gpu-block'].dataset.why, undefined, 'dGPU apagada por modo ya se explica sola');
  f.handlers.stats(S());
  assert.strictEqual(f.els['cpu-block'].dataset.why, undefined);
  assert.strictEqual(f.els['cpu-block'].dataset.action, undefined);
});

test('cableado: el botón "por qué" abre el diagnóstico existente (delegado en el documento)', () => {
  const f = fakeEnv();
  let opened = 0;
  f.env.openDiag = () => { opened++; };
  WS.createWiring(f.env).start();
  const click = f.handlers.click;
  assert.strictEqual(typeof click, 'function');
  click({ target: { closest: (s) => (s === '.widget-why' ? {} : null) } });
  click({ target: { closest: () => null } });
  assert.strictEqual(opened, 1);
  const g = fakeEnv();
  WS.createWiring(g.env).start();   // sin openDiag: no lanza
  g.handlers.click({ target: { closest: () => ({}) } });
});

test('cableado: vacío transitorio no parpadea (ok -> vacío exige 2 muestras); loading/stale/error/unsupported son inmediatos', () => {
  const f = fakeEnv();
  WS.createWiring(f.env).start();
  f.handlers.stats(S());
  f.handlers.stats(S({ procs: [] }));
  assert.strictEqual(f.els['procs-block'].dataset.state, 'ok', 'una muestra vacía suelta se retiene');
  f.handlers.stats(S());
  f.handlers.stats(S({ procs: [] }));
  f.handlers.stats(S({ procs: [] }));
  assert.strictEqual(f.els['procs-block'].dataset.state, 'empty');
  f.handlers.stats(S());
  assert.strictEqual(f.els['procs-block'].dataset.state, 'ok', 'recuperar es inmediato');
  f.handlers.stats(S({ gpu: { mode: 'Integrated', active: null } }));
  assert.strictEqual(f.els['gpu-block'].dataset.state, 'unsupported', 'cambio de modo real: inmediato');
  f.handlers.down();
  assert.strictEqual(f.els['cpu-block'].dataset.state, 'error');
});

test('cableado: stale -> ok al reconectar no pasa por loading/empty/error (secuencia exacta)', () => {
  const f = fakeEnv();
  const seq = [];
  const orig = f.els['cpu-block'];
  let cur;
  Object.defineProperty(orig.dataset, 'state', { get: () => cur, set: (v) => { cur = v; seq.push(v); }, enumerable: true, configurable: true });
  WS.createWiring(f.env).start();
  f.handlers.stats(S());
  f.clock.t = NOW + 7000;
  f.intervals[0][0]();                 // tick: envejeció > 6 s
  f.handlers.stats(S({ ts: (NOW + 7000) / 1000 }));
  assert.deepStrictEqual(seq, ['loading', 'ok', 'stale', 'ok']);
});

test('autoarranque en el navegador: expone la instancia (window.RogWidgetStates.wiring) para pruebas CDP', () => {
  const handlers = {};
  const doc = { hidden: false, getElementById: () => null, createElement: () => ({}), addEventListener: (e, f) => { handlers[e] = f; } };
  const win = { rog: { onStats: () => {}, onBackendDown: () => {} }, setInterval: () => {}, t: (k) => k, i18n: { apply() {} } };
  win.window = win;
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { window: win, document: doc, Date, module: undefined });
  assert.strictEqual(typeof win.RogWidgetStates.wiring.onStats, 'function');
  assert.strictEqual(typeof win.RogWidgetStates.wiring.onBackendDown, 'function');
});
