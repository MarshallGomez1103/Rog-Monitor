'use strict';
// N-A4-03: presentador puro de estados (null != 0, cabecera de sensores, razones de VRAM, ventiladores).
// widget-status-view.js es un script clásico (window.RogStatusView) con export CommonJS para testear sin Electron.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const vm = require('node:vm');
const fs = require('node:fs');

const file = path.join(__dirname, '..', 'renderer', 'widget-status-view.js');
const V = require(file);
const WS = require(path.join(__dirname, '..', 'renderer', 'widget-states.js'));

const NOW = 1_800_000_000_000;
const SNAP = (extra) => Object.assign({
  ts: NOW / 1000,
  cpu: { avg: 55, usage: 12, package: 60, cores: [50] },
  gpu: { mode: 'Hybrid', active: { temp: 50, util: 3 } },
  fans: [{ label: 'cpu_fan', rpm: 2300 }],
  sys: { ram_total_gb: 16, ram_used_gb: 6, ram_percent: 37 },
  procs: [{ pid: 1, name: 'x' }],
}, extra);
const models = (snap, ctx) => WS.evaluateAll(snap, Object.assign({ now: NOW }, ctx));

test('API y exposición como window.RogStatusView', () => {
  for (const k of ['fmtNum', 'fmtPct', 'fmtDeg', 'clampPct', 'pctOrNull', 'fmtUptime', 'uptimeSeconds', 'fmtNet', 'fmtLoad',
    'fmtRam', 'powerSource', 'fanView', 'vramView', 'partialPanels', 'headerStatus', 'createHeaderSettler', 'createHeaderView', 'auraView']) {
    assert.strictEqual(typeof V[k], 'function', k);
  }
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox);
  assert.strictEqual(typeof sandbox.window.RogStatusView.fmtNum, 'function');
});

/* ---- null != 0 ---------------------------------------------------------- */
test('fmtNum: null/undefined/""/NaN/Infinity/no numérico => marcador; 0 es un valor', () => {
  for (const bad of [null, undefined, '', '  ', NaN, Infinity, 'abc', [], {}, true]) {
    assert.strictEqual(V.fmtNum(bad, 1), '--', String(bad));
  }
  assert.strictEqual(V.fmtNum(0, 1), '0.0');
  assert.strictEqual(V.fmtNum(0), '0');
  assert.strictEqual(V.fmtNum('3.14159', 2), '3.14');
  assert.strictEqual(V.fmtNum(null, 1, 'N/D'), 'N/D');
  assert.strictEqual(V.fmtNum(-2.5, 0), '-3');
});

test('clampPct (barras): sin dato => 0; recorta a 0-100; pctOrNull distingue sin dato', () => {
  assert.strictEqual(V.clampPct(null), 0);
  assert.strictEqual(V.clampPct(undefined), 0);
  assert.strictEqual(V.clampPct(150), 100);
  assert.strictEqual(V.clampPct(-5), 0);
  assert.strictEqual(V.clampPct('42'), 42);
  assert.strictEqual(V.pctOrNull(null), null);
  assert.strictEqual(V.pctOrNull(''), null);
  assert.strictEqual(V.pctOrNull(0), 0);
  assert.strictEqual(V.pctOrNull(250), 100);
});

test('fmtPct: sin dato => "--" (nunca "0%"); 0 real => "0%"', () => {
  assert.strictEqual(V.fmtPct(null), '--');
  assert.strictEqual(V.fmtPct(undefined, 1), '--');
  assert.strictEqual(V.fmtPct(0), '0%');
  assert.strictEqual(V.fmtPct(12.4), '12%');
  assert.strictEqual(V.fmtPct(150), '100%');
  assert.strictEqual(V.fmtPct(12.46, 1), '12.5%');
});

test('fmtDeg: grados solo con dato; sin dato "--" (no "--°"); 0 °C real se muestra', () => {
  assert.strictEqual(V.fmtDeg(null), '--');
  assert.strictEqual(V.fmtDeg(undefined), '--');
  assert.strictEqual(V.fmtDeg(0), '0°');
  assert.strictEqual(V.fmtDeg(61.6), '62°');
  assert.strictEqual(V.fmtDeg(61.64, 1), '61.6°');
});

test('fmtUptime: sin dato => "--"; 0 s real => "0m"; formatos d/h/m', () => {
  for (const bad of [null, undefined, NaN, '', 'x']) assert.strictEqual(V.fmtUptime(bad), '--', String(bad));
  assert.strictEqual(V.fmtUptime(0), '0m');
  assert.strictEqual(V.fmtUptime(59), '0m');
  assert.strictEqual(V.fmtUptime(60), '1m');
  assert.strictEqual(V.fmtUptime(3700), '1h 01m');
  assert.strictEqual(V.fmtUptime(90000), '1d 1h');
  assert.strictEqual(V.fmtUptime(-5), '--');
});

test('uptimeSeconds: uptime_s manda; cae a uptime_h; ambos null/ausentes => null (no 0)', () => {
  assert.strictEqual(V.uptimeSeconds({ uptime_s: null, uptime_h: null }), null);
  assert.strictEqual(V.uptimeSeconds({}), null);
  assert.strictEqual(V.uptimeSeconds(null), null);
  assert.strictEqual(V.uptimeSeconds(undefined), null);
  assert.strictEqual(V.uptimeSeconds({ uptime_s: 0 }), 0);
  assert.strictEqual(V.uptimeSeconds({ uptime_s: 120, uptime_h: 9 }), 120);
  assert.strictEqual(V.uptimeSeconds({ uptime_s: null, uptime_h: 2 }), 7200);
  assert.strictEqual(V.uptimeSeconds({ uptime_h: 0.5 }), 1800);
});

test('fmtNet: cada sentido por separado; null => "--", 0.0 real se muestra', () => {
  assert.strictEqual(V.fmtNet({ rx_mbps: null, tx_mbps: null }), '↓-- ↑-- Mb/s');
  assert.strictEqual(V.fmtNet({}), '↓-- ↑-- Mb/s');
  assert.strictEqual(V.fmtNet(null), '↓-- ↑-- Mb/s');
  assert.strictEqual(V.fmtNet({ rx_mbps: 0, tx_mbps: 0 }), '↓0.0 ↑0.0 Mb/s');
  assert.strictEqual(V.fmtNet({ rx_mbps: 1.234, tx_mbps: null }), '↓1.2 ↑-- Mb/s');
});

test('fmtLoad: null/[]/sin campo => "--" (no cadena vacía); elementos nulos => "--"', () => {
  assert.strictEqual(V.fmtLoad(null), '--');
  assert.strictEqual(V.fmtLoad(undefined), '--');
  assert.strictEqual(V.fmtLoad([]), '--');
  assert.strictEqual(V.fmtLoad([0, 0.5, 1]), '0.00 0.50 1.00');
  assert.strictEqual(V.fmtLoad([null, 1]), '-- 1.00');
});

test('fmtRam: sin dato => "--/-- GiB"; 0 usado real => "0.0/16 GiB"', () => {
  assert.strictEqual(V.fmtRam({ ram_used_gb: null, ram_total_gb: null }), '--/-- GiB');
  assert.strictEqual(V.fmtRam(null), '--/-- GiB');
  assert.strictEqual(V.fmtRam({ ram_used_gb: 0, ram_total_gb: 16 }), '0.0/16 GiB');
  assert.strictEqual(V.fmtRam({ ram_used_gb: 6.25, ram_total_gb: 15.6 }), '6.3/16 GiB');
});

test('powerSource: on_ac null/ausente/sin batería => unknown (no "batería" falso)', () => {
  assert.deepStrictEqual(V.powerSource({ on_ac: true, capacity: 80 }), { kind: 'ac', pct: 80 });
  assert.deepStrictEqual(V.powerSource({ on_ac: false, capacity: 0 }), { kind: 'battery', pct: 0 });
  assert.deepStrictEqual(V.powerSource({ on_ac: null, capacity: 55 }), { kind: 'unknown', pct: 55 });
  assert.deepStrictEqual(V.powerSource({ capacity: null }), { kind: 'unknown', pct: '--' });
  assert.deepStrictEqual(V.powerSource(null), { kind: 'unknown', pct: '--' });
  assert.deepStrictEqual(V.powerSource(undefined), { kind: 'unknown', pct: '--' });
});

test('fanView: rpm null => sin dato (no PARADO, no "null%"); rpm 0 => parado; >0 gira', () => {
  assert.deepStrictEqual(V.fanView({ rpm: null, percent: null }), { rpm: '--', pct: '--', state: 'nodata' });
  assert.deepStrictEqual(V.fanView({ rpm: undefined }), { rpm: '--', pct: '--', state: 'nodata' });
  assert.deepStrictEqual(V.fanView({ rpm: 0, percent: 0 }), { rpm: '0', pct: '0%', state: 'stopped' });
  assert.deepStrictEqual(V.fanView({ rpm: 2300, percent: 40 }), { rpm: '2300', pct: '40%', state: 'spinning' });
  assert.deepStrictEqual(V.fanView({ rpm: 2300, percent: null }), { rpm: '2300', pct: '--', state: 'spinning' });
  assert.deepStrictEqual(V.fanView(null), { rpm: '--', pct: '--', state: 'nodata' });
});

/* ---- razones de VRAM (reason_code) ------------------------------------- */
test('vramView: con procesos o available => ok; sin info => empty con clave genérica', () => {
  assert.strictEqual(V.vramView({ available: true, reason: '', reason_code: null, procs: [] }).state, 'ok');
  assert.strictEqual(V.vramView({ available: false, reason_code: 'x', procs: [{ pid: 1 }] }).state, 'ok');
  assert.deepStrictEqual(V.vramView(null), { state: 'empty', code: null, key: 'modal.vram_none', hintKey: null, action: null, fallback: '' });
  assert.deepStrictEqual(V.vramView({}), { state: 'empty', code: null, key: 'modal.vram_none', hintKey: null, action: null, fallback: '' });
});

test('vramView: tabla de reason_code (N-DEF-02 §3) => estado, clave traducible y acción', () => {
  const row = (code) => { const v = V.vramView({ available: false, reason_code: code, reason: 'texto es' }); return [v.state, v.key, v.hintKey, v.action]; };
  assert.deepStrictEqual(row('warming_up'), ['loading', 'vram.warming_up', 'vram.warming_up_hint', null]);
  assert.deepStrictEqual(row('no_nvidia'), ['unsupported', 'vram.no_nvidia', 'vram.no_nvidia_hint', null]);
  assert.deepStrictEqual(row('dgpu_asleep'), ['empty', 'vram.dgpu_asleep', 'vram.dgpu_asleep_hint', null]);
  assert.deepStrictEqual(row('dgpu_inactive'), ['empty', 'vram.dgpu_inactive', 'vram.dgpu_inactive_hint', null]);
  assert.deepStrictEqual(row('nvml_error'), ['error', 'vram.driver_error', 'vram.driver_error_hint', 'retry']);
  assert.deepStrictEqual(row('smi_error'), ['error', 'vram.driver_error', 'vram.driver_error_hint', 'retry']);
  assert.deepStrictEqual(row('no_nvidia_tools'), ['unsupported', 'vram.no_tools', 'vram.no_tools_hint', 'install']);
  assert.deepStrictEqual(row('reader_unavailable'), ['error', 'vram.reader', 'vram.reader_hint', 'retry']);
});

test('vramView: código desconocido o ausente => usa el reason del backend solo como respaldo', () => {
  const v = V.vramView({ available: false, reason_code: 'algo_nuevo', reason: 'motivo del backend' });
  assert.strictEqual(v.state, 'empty');
  assert.strictEqual(v.key, null);
  assert.strictEqual(v.fallback, 'motivo del backend');
  const w = V.vramView({ available: false, reason: 'solo texto' });
  assert.strictEqual(w.fallback, 'solo texto');
  assert.strictEqual(w.key, null);
});

/* ---- aura -------------------------------------------------------------- */
test('auraView: null/undefined (lector caído) != available:false (sin asusctl)', () => {
  assert.strictEqual(V.auraView(null), 'reader');
  assert.strictEqual(V.auraView(undefined), 'reader');
  assert.strictEqual(V.auraView({ available: false }), 'none');
  assert.strictEqual(V.auraView({ available: true }), 'ok');
});

/* ---- cabecera ---------------------------------------------------------- */
test('headerStatus: prioridad down > reconnecting > connecting > stale > partial > ok', () => {
  const ok = models(SNAP());
  const h = (o) => V.headerStatus(Object.assign({ models: ok }, o));
  assert.deepStrictEqual([h({}).kind, h({}).level, h({}).key], ['ok', 'ok', 'status.ok']);
  assert.strictEqual(h({ down: true }).kind, 'down');
  assert.strictEqual(h({ down: true }).key, 'status.backend_down');
  assert.strictEqual(h({ down: true }).level, 'error');
  assert.strictEqual(h({ reconnecting: true }).kind, 'reconnecting');
  assert.strictEqual(h({ down: true, reconnecting: true }).kind, 'down', 'caído + reconectando sigue siendo un solo estado');
  assert.strictEqual(h({ models: null }).kind, 'connecting');
  assert.strictEqual(h({ models: models(null) }).kind, 'connecting');
  assert.strictEqual(h({ models: models(SNAP({ ts: NOW / 1000 - 6.1 })) }).kind, 'stale');
  assert.strictEqual(h({ models: models(SNAP({ ts: NOW / 1000 - 6.1 })) }).level, 'warn');
});

test('headerStatus: parcial lista los paneles con lector sin datos; hardware ausente legítimo NO es parcial', () => {
  const partial = V.headerStatus({ models: models(SNAP({ cpu: { avg: null, usage: null, cores: [] }, procs: [] })) });
  assert.strictEqual(partial.kind, 'partial');
  assert.deepStrictEqual(partial.list, ['cpu', 'procs']);
  assert.strictEqual(partial.key, 'status.partial');
  // dGPU apagada por modo, sin ventiladores, sin batería: hardware, no fallo
  const hw = V.headerStatus({ models: models(SNAP({ gpu: { mode: 'Integrated', active: null }, fans: [] })) });
  assert.strictEqual(hw.kind, 'ok');
  assert.deepStrictEqual(V.partialPanels(models(SNAP({ gpu: { mode: '', active: null } }))), ['gpu']);
  assert.deepStrictEqual(V.partialPanels(null), []);
});

test('headerStatus: la firma (sig) no contiene el reloj ni los segundos de stale (sin spam en la región viva)', () => {
  const a = V.headerStatus({ models: models(SNAP({ ts: NOW / 1000 - 6.1 })) });
  const b = V.headerStatus({ models: models(SNAP({ ts: NOW / 1000 - 40 })) });
  assert.strictEqual(a.sig, b.sig);
  assert.ok(!/\d/.test(a.sig.replace(/status\.\w+/g, '')), 'sin dígitos extra');
});

test('createHeaderSettler: parcial exige 2 muestras seguidas (sin destellos); el resto es inmediato', () => {
  const sett = V.createHeaderSettler();
  const ok = V.headerStatus({ models: models(SNAP()) });
  const part = V.headerStatus({ models: models(SNAP({ procs: [] })) });
  assert.strictEqual(sett(ok).kind, 'ok');
  assert.strictEqual(sett(part).kind, 'ok', 'primer tick parcial se retiene');
  assert.strictEqual(sett(ok).kind, 'ok', 'si vuelve a ok, no hubo destello');
  assert.strictEqual(sett(part).kind, 'ok');
  assert.strictEqual(sett(part).kind, 'partial', 'segundo tick seguido => se confirma');
  assert.strictEqual(sett(ok).kind, 'ok', 'recuperar es inmediato');
  assert.strictEqual(sett(V.headerStatus({ models: models(SNAP()), down: true })).kind, 'down', 'caído es inmediato');
  assert.strictEqual(sett(V.headerStatus({ models: models(SNAP({ ts: NOW / 1000 - 7 })) })).kind, 'stale', 'stale es inmediato');
});

/* ---- vista de la cabecera (DOM inyectado) ---------------------------------- */
function fakeHeader() {
  const els = {};
  for (const id of ['backend-state', 'backend-state-text', 'backend-meta']) els[id] = { dataset: {}, textContent: '', removeAttribute(a) { this.removed = a; } };
  let writes = 0;
  let txt = '';
  Object.defineProperty(els['backend-state-text'], 'textContent', { get: () => txt, set: (v) => { writes++; txt = v; } });
  const dict = { 'status.ok': 'Sensores OK', 'status.partial': 'Parciales: {list}', 'status.stale': 'Sin datos recientes', 'status.backend_down': 'caído',
    'status.connecting': 'conectando', 'status.reconnecting': 'reconectando', 'thermal.stale': 'SIN DATOS · {v} s', 'block.cpu': 'CPU', 'block.procs': 'Procesos' };
  const t = (k, v) => (dict[k] || k).replace('{list}', (v && v.list) || '').replace('{v}', (v && v.v) || '');
  const view = V.createHeaderView({ $: (id) => els[id], t, ws: () => WS });
  return { els, view, writes: () => writes };
}
const ST = (o) => Object.assign({ now: NOW, lastRxAt: NOW, resumedAt: 0, backendDown: false, backendReconnecting: false, hidden: false }, o);

test('createHeaderView: ok => texto, nivel y meta (core + hora); sin muestra => connecting', () => {
  const f = fakeHeader();
  f.view(null, ST({}));
  assert.strictEqual(f.els['backend-state-text'].textContent, 'conectando');
  assert.strictEqual(f.els['backend-state'].dataset.level, 'info');
  f.view(SNAP({ version: '9.9' }), ST({}));
  assert.strictEqual(f.els['backend-state-text'].textContent, 'Sensores OK');
  assert.strictEqual(f.els['backend-state'].dataset.level, 'ok');
  assert.match(f.els['backend-meta'].textContent, /^core v9\.9 · /);
  assert.strictEqual(f.els['backend-state-text'].removed, 'data-i18n');
});

test('createHeaderView: el texto de la región viva solo se reescribe al cambiar de estado (sin spam)', () => {
  const f = fakeHeader();
  f.view(SNAP(), ST({}));
  const w = f.writes();
  for (let i = 0; i < 5; i++) f.view(SNAP(), ST({ now: NOW + i * 1000, lastRxAt: NOW + i * 1000 }));
  assert.strictEqual(f.writes(), w, 'mismo estado => ninguna escritura');
  f.view(SNAP({ ts: NOW / 1000 - 8 }), ST({}));
  assert.strictEqual(f.els['backend-state-text'].textContent, 'Sin datos recientes');
  assert.match(f.els['backend-meta'].textContent, /^SIN DATOS · 8 s$/);
  const w2 = f.writes();
  f.view(SNAP({ ts: NOW / 1000 - 12 }), ST({}));
  assert.strictEqual(f.writes(), w2, 'más segundos de stale: solo cambia el meta');
  assert.match(f.els['backend-meta'].textContent, /12 s/);
  f.view(SNAP(), ST({ backendDown: true }));
  assert.strictEqual(f.els['backend-state-text'].textContent, 'caído');
  assert.strictEqual(f.els['backend-meta'].textContent, '');
});

test('createHeaderView: parcial lista los paneles traducidos y exige 2 muestras', () => {
  const f = fakeHeader();
  const bad = SNAP({ cpu: { avg: null, usage: null, cores: [] }, procs: [] });
  f.view(SNAP(), ST({}));
  f.view(bad, ST({}));
  assert.strictEqual(f.els['backend-state-text'].textContent, 'Sensores OK');
  f.view(bad, ST({}));
  assert.strictEqual(f.els['backend-state-text'].textContent, 'Parciales: CPU, Procesos');
  assert.strictEqual(f.els['backend-state'].dataset.level, 'warn');
});

test('createHeaderView: sin RogWidgetStates cae a connecting sin lanzar', () => {
  const els = { 'backend-state': { dataset: {} }, 'backend-state-text': { removeAttribute() {}, textContent: '' }, 'backend-meta': { textContent: '' } };
  const view = V.createHeaderView({ $: (id) => els[id], t: (k) => k, ws: () => null });
  view(SNAP(), ST({}));
  assert.strictEqual(els['backend-state-text'].textContent, 'status.connecting');
});
