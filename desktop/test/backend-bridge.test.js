'use strict';
// F3-03 corte 1 + F3-04: parser NDJSON incremental y supervisor del backend,
// con spawn, reloj, temporizadores y log inyectados (sin Electron ni Python).
const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('events');
const bridgeMod = require('../backend-bridge');

// ---------------------------------------------------------------- parser puro
test('parseNdjson: una línea partida en 3 chunks se entrega entera una sola vez', () => {
  const { createParserState, parseNdjson } = bridgeMod;
  let st = createParserState();
  const got = [];
  for (const chunk of ['{"cpu":', '12,"t"', ':3}\n']) {
    const r = parseNdjson(st, chunk);
    st = r.state;
    got.push(...r.messages);
  }
  assert.deepStrictEqual(got, [{ cpu: 12, t: 3 }]);
  assert.strictEqual(st.buffer, '');
});

test('parseNdjson: varias líneas por chunk, vacías y CRLF; el resto queda en el buffer', () => {
  const { createParserState, parseNdjson } = bridgeMod;
  const r = parseNdjson(createParserState(), '{"a":1}\r\n\n  \n{"a":2}\n{"a"');
  assert.deepStrictEqual(r.messages, [{ a: 1 }, { a: 2 }]);
  assert.strictEqual(r.state.buffer, '{"a"');
  assert.deepStrictEqual(r.bad, []);
});

test('parseNdjson: JSON roto en medio se descarta y no rompe el buffer', () => {
  const { createParserState, parseNdjson } = bridgeMod;
  const r = parseNdjson(createParserState(), '{"a":1}\n{"a":\n{"a":3}\n');
  assert.deepStrictEqual(r.messages, [{ a: 1 }, { a: 3 }]);
  assert.strictEqual(r.bad.length, 1);
  assert.strictEqual(r.bad[0].line, '{"a":');
  assert.match(r.bad[0].message, /JSON|Unexpected|end/i);
  assert.strictEqual(r.state.buffer, '');
});

test('parseNdjson: solo acepta objetos (número, array, null y cadena se descartan)', () => {
  const { createParserState, parseNdjson } = bridgeMod;
  const r = parseNdjson(createParserState(), '5\n[1]\nnull\n"x"\n{"ok":true}\n');
  assert.deepStrictEqual(r.messages, [{ ok: true }]);
  assert.strictEqual(r.bad.length, 4);
});

test('parseNdjson: no muta el estado recibido', () => {
  const { createParserState, parseNdjson } = bridgeMod;
  const st = createParserState();
  parseNdjson(st, '{"a":');
  assert.deepStrictEqual(st, createParserState());
});

test('parseNdjson: buffer gigante sin salto de línea se tira y se ignora hasta el siguiente \\n', () => {
  const { createParserState, parseNdjson } = bridgeMod;
  let r = parseNdjson(createParserState(), 'x'.repeat(50), 32);
  assert.strictEqual(r.overflow, true);
  assert.strictEqual(r.state.buffer, '');
  assert.strictEqual(r.state.discarding, true);
  // la cola de la línea gigante NO se interpreta (aunque parezca JSON válido)
  r = parseNdjson(r.state, '123\n{"a":1}\n', 32);
  assert.deepStrictEqual(r.messages, [{ a: 1 }]);
  assert.deepStrictEqual(r.bad, []);
  assert.strictEqual(r.state.discarding, false);
});

test('parseNdjson: mientras descarta, los chunks sin \\n se ignoran enteros', () => {
  const { createParserState, parseNdjson } = bridgeMod;
  let r = parseNdjson(createParserState(), 'x'.repeat(50), 32);
  r = parseNdjson(r.state, 'seguimos sin salto', 32);
  assert.strictEqual(r.state.discarding, true);
  assert.strictEqual(r.state.buffer, '');
  assert.deepStrictEqual(r.messages, []);
});

test('parseNdjson: una línea completa que excede el tope se cuenta como overflow', () => {
  const { createParserState, parseNdjson } = bridgeMod;
  const big = JSON.stringify({ pad: 'y'.repeat(100) });
  const r = parseNdjson(createParserState(), `${big}\n{"a":1}\n`, 32);
  assert.deepStrictEqual(r.messages, [{ a: 1 }]);
  assert.strictEqual(r.overflow, true);
});

test('parseNdjson: tope por defecto de 1 MiB', () => {
  assert.strictEqual(bridgeMod.DEFAULT_MAX_BUFFER, 1024 * 1024);
});

// ---------------------------------------------------------------- arnés
function fakeClock() {
  let t = 0;
  let seq = 0;
  const timers = new Map();
  const api = {
    now: () => t,
    setTimeout(fn, ms) { const id = ++seq; timers.set(id, { fn, at: t + ms, every: 0 }); return id; },
    setInterval(fn, ms) { const id = ++seq; timers.set(id, { fn, at: t + ms, every: ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    clearInterval(id) { timers.delete(id); },
    pending: () => timers.size,
    tick(ms) {
      const end = t + ms;
      for (;;) {
        let next = null;
        for (const [id, tm] of timers) if (tm.at <= end && (!next || tm.at < next.tm.at)) next = { id, tm };
        if (!next) break;
        t = next.tm.at;
        if (next.tm.every) next.tm.at += next.tm.every; else timers.delete(next.id);
        next.tm.fn();
      }
      t = end;
    },
  };
  return api;
}

function fakeChild() {
  const c = new EventEmitter();
  c.stdout = new EventEmitter();
  c.stderr = new EventEmitter();
  c.exitCode = null;
  c.signalCode = null;
  c.signals = [];
  c.kill = (sig = 'SIGTERM') => { c.signals.push(sig); return true; };
  c.die = (code = 1) => { c.exitCode = code; c.emit('exit', code, null); };
  return c;
}

function harness(over = {}) {
  const clock = fakeClock();
  const children = [];
  const calls = { stats: [], down: [], reconnecting: 0, errors: [], warns: [], spawnArgs: [] };
  const state = { window: true, overlay: false };
  const opts = {
    spawn: (cmd, args, o) => { calls.spawnArgs.push({ cmd, args, o }); const c = fakeChild(); children.push(c); return c; },
    command: '/py', args: ['-m', 'rog_monitor'], env: { A: '1' },
    now: clock.now,
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    setInterval: clock.setInterval, clearInterval: clock.clearInterval,
    logger: { error: () => {}, warn: (...a) => calls.warns.push(a.join(' ')) },
    recordError: (kind, payload) => calls.errors.push({ kind, ...payload }),
    onStats: (s) => calls.stats.push(s),
    onDown: (code) => calls.down.push(code),
    onReconnecting: () => { calls.reconnecting += 1; },
    hasWindow: () => state.window,
    overlayNeeded: () => state.overlay,
    ...over,
  };
  const bridge = bridgeMod.createBackendBridge(opts);
  return { bridge, clock, children, calls, state };
}

const line = (o) => JSON.stringify(o) + '\n';

// ---------------------------------------------------------------- arranque y datos
test('start spawnea una vez con comando, args, env y stdio, e idempotente', () => {
  const h = harness();
  h.bridge.start();
  h.bridge.start();
  assert.strictEqual(h.children.length, 1);
  const { cmd, args, o } = h.calls.spawnArgs[0];
  assert.strictEqual(cmd, '/py');
  assert.deepStrictEqual(args, ['-m', 'rog_monitor']);
  assert.deepStrictEqual(o.env, { A: '1' });
  assert.deepStrictEqual(o.stdio, ['ignore', 'pipe', 'pipe']);
  assert.strictEqual(h.bridge.isAlive(), true);
});

test('stdout: línea en 3 chunks -> onStats una vez; lastStatsAt y lastTempLimits por getters', () => {
  const h = harness();
  h.bridge.start();
  h.clock.tick(1500);
  assert.strictEqual(h.bridge.lastTempLimits, null);
  const c = h.children[0];
  const full = line({ cpu: { avg: 7 }, limits: { cpu: [60, 80, 90] } });
  c.stdout.emit('data', Buffer.from(full.slice(0, 5)));
  c.stdout.emit('data', Buffer.from(full.slice(5, 20)));
  assert.strictEqual(h.calls.stats.length, 0);
  c.stdout.emit('data', Buffer.from(full.slice(20)));
  assert.strictEqual(h.calls.stats.length, 1);
  assert.strictEqual(h.calls.stats[0].cpu.avg, 7);
  assert.strictEqual(h.bridge.lastStatsAt, 1500);
  assert.deepStrictEqual(h.bridge.lastTempLimits, { cpu: [60, 80, 90] });
});

test('stdout: carácter UTF-8 multibyte partido entre chunks no se corrompe', () => {
  const h = harness();
  h.bridge.start();
  const buf = Buffer.from(line({ name: 'Ñandú ✓' }));
  const cut = buf.indexOf(0xc3) + 1; // parte la Ñ en dos bytes
  h.children[0].stdout.emit('data', buf.subarray(0, cut));
  h.children[0].stdout.emit('data', buf.subarray(cut));
  assert.strictEqual(h.calls.stats[0].name, 'Ñandú ✓');
});

test('stdout: JSON roto en medio se registra, se descarta y el stream sigue', () => {
  const h = harness();
  h.bridge.start();
  const c = h.children[0];
  c.stdout.emit('data', '{"a":1}\n{"a":\n{"a":3}\n');
  assert.deepStrictEqual(h.calls.stats, [{ a: 1 }, { a: 3 }]);
  assert.strictEqual(h.calls.errors.filter((e) => e.kind === 'backend-bad-line').length, 1);
  assert.strictEqual(h.calls.warns.length, 1);
});

test('stdout: líneas rotas repetidas no inundan errors.jsonl (tope por proceso)', () => {
  const h = harness();
  h.bridge.start();
  for (let i = 0; i < 40; i++) h.children[0].stdout.emit('data', 'basura\n');
  const n = h.calls.errors.filter((e) => e.kind === 'backend-bad-line').length;
  assert.ok(n > 0 && n <= 10, `registros ${n}`);
});

test('stdout: buffer gigante sin \\n se descarta, se registra y luego se recupera', () => {
  const h = harness({ maxBuffer: 64 });
  h.bridge.start();
  const c = h.children[0];
  c.stdout.emit('data', 'z'.repeat(200));
  c.stdout.emit('data', 'resto\n' + line({ ok: 1 }));
  assert.deepStrictEqual(h.calls.stats, [{ ok: 1 }]);
  assert.ok(h.calls.errors.some((e) => e.kind === 'backend-overflow'));
});

test('stderr: se registra; texto vacío se ignora', () => {
  const h = harness();
  h.bridge.start();
  h.children[0].stderr.emit('data', Buffer.from('  Traceback boom \n'));
  h.children[0].stderr.emit('data', Buffer.from('   \n'));
  assert.deepStrictEqual(h.calls.errors, [{ kind: 'backend-stderr', message: 'Traceback boom' }]);
});

// ---------------------------------------------------------------- exit / respawn
test('exit inesperado: onDown(code) + onReconnecting y respawn exactamente a los 3 s', () => {
  const h = harness();
  h.bridge.start();
  h.children[0].die(3);
  assert.deepStrictEqual(h.calls.down, [3]);
  assert.strictEqual(h.calls.reconnecting, 1);
  assert.ok(h.calls.errors.some((e) => e.kind === 'backend-exit' && e.code === 3));
  assert.strictEqual(h.bridge.isAlive(), false);
  h.clock.tick(2999);
  assert.strictEqual(h.children.length, 1);
  h.clock.tick(1);
  assert.strictEqual(h.children.length, 2);
  assert.strictEqual(h.bridge.isAlive(), true);
});

test('exit sin ventana: no notifica ni respawnea (como antes)', () => {
  const h = harness();
  h.bridge.start();
  h.state.window = false;
  h.children[0].die(1);
  h.clock.tick(10000);
  assert.strictEqual(h.children.length, 1);
  assert.deepStrictEqual(h.calls.down, []);
  assert.strictEqual(h.calls.reconnecting, 0);
});

test('exit limpia la pausa: tras caer, el flag de pausa no queda colgado', () => {
  const h = harness();
  h.bridge.start();
  h.bridge.setMainVisible(false);
  assert.strictEqual(h.bridge.isPaused(), true);
  h.children[0].die(1);
  assert.strictEqual(h.bridge.isPaused(), false);
});

test('error de spawn (ENOENT) no lanza y se trata como caída con respawn', () => {
  const h = harness();
  h.bridge.start();
  h.children[0].emit('error', new Error('spawn ENOENT'));
  assert.ok(h.calls.errors.some((e) => e.kind === 'backend-spawn-error'));
  assert.strictEqual(h.calls.down.length, 1);
  h.clock.tick(3000);
  assert.strictEqual(h.children.length, 2);
  // 'error' seguido de 'exit' del mismo proceso no duplica la caída
  h.children[0].die(1);
  assert.strictEqual(h.calls.down.length, 1);
});

test('un spawn que lanza síncrono no tumba la app y reintenta', () => {
  let n = 0;
  const h = harness({ spawn: () => { n += 1; if (n === 1) throw new Error('EACCES'); return fakeChild(); } });
  h.bridge.start();
  assert.strictEqual(h.bridge.isAlive(), false);
  assert.ok(h.calls.errors.some((e) => e.kind === 'backend-spawn-error'));
  h.clock.tick(3000);
  assert.strictEqual(n, 2);
  assert.strictEqual(h.bridge.isAlive(), true);
});

// ---------------------------------------------------------------- restart
test('restart: SIGCONT antes de SIGTERM, ignora lo que el viejo siga emitiendo, spawnea uno nuevo', () => {
  const h = harness();
  h.bridge.start();
  const old = h.children[0];
  h.bridge.setMainVisible(false); // SIGSTOP
  h.bridge.restart();
  assert.deepStrictEqual(old.signals, ['SIGSTOP', 'SIGCONT', 'SIGTERM']);
  assert.strictEqual(h.children.length, 2);
  assert.strictEqual(h.bridge.isPaused(), false);
  old.stdout.emit('data', line({ viejo: true }));
  old.die(0); // el exit del viejo no cuenta como caída
  assert.deepStrictEqual(h.calls.stats, []);
  assert.deepStrictEqual(h.calls.down, []);
  h.clock.tick(5000);
  assert.strictEqual(h.children.length, 2);
});

test('restart cancela un respawn pendiente (no quedan dos backends)', () => {
  const h = harness();
  h.bridge.start();
  h.children[0].die(1); // respawn a 3 s programado
  h.clock.tick(1000);
  h.bridge.restart();
  assert.strictEqual(h.children.length, 2);
  h.clock.tick(10000);
  assert.strictEqual(h.children.length, 2);
});

test('restart sin backend previo equivale a start', () => {
  const h = harness();
  h.bridge.restart();
  assert.strictEqual(h.children.length, 1);
});

test('un hijo nuevo arranca con la ventana fresca del watchdog (lastStatsAt = ahora)', () => {
  const h = harness();
  h.bridge.start();
  h.clock.tick(9000);
  h.bridge.restart();
  assert.strictEqual(h.bridge.lastStatsAt, 9000);
});

// ---------------------------------------------------------------- pausa / reanudación
test('al ocultar la ventana se pausa (SIGSTOP) y al mostrar se reanuda (SIGCONT), sin repetir señales', () => {
  const h = harness();
  h.bridge.start();
  const c = h.children[0];
  h.bridge.setMainVisible(false);
  h.bridge.setMainVisible(false);
  assert.deepStrictEqual(c.signals, ['SIGSTOP']);
  assert.strictEqual(h.bridge.isPaused(), true);
  h.clock.tick(4000);
  h.bridge.setMainVisible(true);
  h.bridge.setMainVisible(true);
  assert.deepStrictEqual(c.signals, ['SIGSTOP', 'SIGCONT']);
  assert.strictEqual(h.bridge.isPaused(), false);
  assert.strictEqual(h.bridge.lastStatsAt, 4000); // ventana fresca al reanudar
});

test('con overlay activo no se pausa aunque la ventana esté oculta; updatePower reevalúa', () => {
  const h = harness();
  h.bridge.start();
  h.state.overlay = true;
  h.bridge.setMainVisible(false);
  assert.deepStrictEqual(h.children[0].signals, []);
  h.state.overlay = false;
  h.bridge.updatePower();
  assert.deepStrictEqual(h.children[0].signals, ['SIGSTOP']);
});

test('sin backend vivo la pausa no envía señales ni cambia de estado', () => {
  const h = harness();
  h.bridge.setMainVisible(false); // aún no hay hijo
  assert.strictEqual(h.bridge.isPaused(), false);
  h.bridge.start();
  h.children[0].die(1);
  h.bridge.setMainVisible(true);
  h.bridge.setMainVisible(false);
  assert.deepStrictEqual(h.children[0].signals, []);
});

test('si kill lanza al pausar, no se marca pausado ni se propaga', () => {
  const h = harness();
  h.bridge.start();
  h.children[0].kill = () => { throw new Error('ESRCH'); };
  h.bridge.setMainVisible(false);
  assert.strictEqual(h.bridge.isPaused(), false);
});

// ---------------------------------------------------------------- watchdog
test('watchdog: ventana oculta a propósito no actúa', () => {
  const h = harness();
  h.bridge.start();
  h.bridge.startWatchdog();
  h.bridge.setMainVisible(false);
  h.clock.tick(60000);
  assert.deepStrictEqual(h.children[0].signals, ['SIGSTOP']);
  assert.strictEqual(h.children.length, 1);
});

test('watchdog: sin muestras 5 s -> SIGCONT + reconectando; sin respuesta 3 s después -> respawn', () => {
  const h = harness();
  h.bridge.start();
  h.bridge.startWatchdog();
  const old = h.children[0];
  h.clock.tick(4999);
  assert.deepStrictEqual(old.signals, []);
  h.clock.tick(1); // t=5000: primer chequeo, silencio = 5000
  assert.deepStrictEqual(old.signals, ['SIGCONT']);
  assert.strictEqual(h.calls.reconnecting, 1);
  assert.ok(h.calls.errors.some((e) => e.kind === 'watchdog-stale' && e.staleMs === 5000));
  h.clock.tick(2999);
  assert.strictEqual(h.children.length, 1);
  h.clock.tick(1); // t=8000
  assert.strictEqual(h.children.length, 2);
  assert.ok(h.calls.errors.some((e) => e.kind === 'watchdog-respawn'));
  // orden: SIGCONT del watchdog, luego SIGCONT y SIGTERM del reinicio
  assert.deepStrictEqual(old.signals, ['SIGCONT', 'SIGCONT', 'SIGTERM']);
});

test('watchdog: si llegan muestras durante la gracia de 3 s no hay respawn', () => {
  const h = harness();
  h.bridge.start();
  h.bridge.startWatchdog();
  h.clock.tick(5000);
  h.children[0].stdout.emit('data', line({ a: 1 }));
  h.clock.tick(3000);
  assert.strictEqual(h.children.length, 1);
});

test('watchdog: varias muestras en el mismo instante del reloj tampoco cuentan como silencio', () => {
  const h = harness();
  h.bridge.start();
  h.bridge.startWatchdog();
  h.clock.tick(5000); // gracia armada
  h.children[0].stdout.emit('data', line({ a: 1 }));
  h.children[0].stdout.emit('data', line({ a: 2 }));
  h.clock.tick(3000);
  assert.strictEqual(h.children.length, 1);
});

test('watchdog: muestras regulares evitan toda acción', () => {
  const h = harness();
  h.bridge.start();
  h.bridge.startWatchdog();
  for (let i = 0; i < 30; i++) { h.clock.tick(1000); h.children[0].stdout.emit('data', line({ i })); }
  assert.deepStrictEqual(h.children[0].signals, []);
  assert.strictEqual(h.calls.reconnecting, 0);
});

test('watchdog: estado inconsistente (pausado pero overlay lo necesita) fuerza SIGCONT', () => {
  const h = harness();
  h.bridge.start();
  h.bridge.startWatchdog();
  h.bridge.setMainVisible(false); // SIGSTOP
  h.state.overlay = true; // el overlay apareció sin avisar a updatePower
  h.clock.tick(5000);
  assert.deepStrictEqual(h.children[0].signals, ['SIGSTOP', 'SIGCONT']);
  assert.strictEqual(h.bridge.isPaused(), false);
  assert.ok(h.calls.errors.some((e) => e.kind === 'watchdog-force-cont'));
});

test('watchdog: backend muerto lo maneja el exit, no el watchdog', () => {
  const h = harness();
  h.bridge.start();
  h.bridge.startWatchdog();
  h.state.window = false; // sin respawn: el watchdog no debe inventarlo
  h.children[0].die(1);
  h.clock.tick(30000);
  assert.strictEqual(h.children.length, 1);
  assert.strictEqual(h.calls.reconnecting, 0);
});

test('watchdog: stale sin ventana no notifica reconectando pero sí actúa', () => {
  const h = harness();
  h.bridge.start();
  h.bridge.startWatchdog();
  h.state.window = false;
  h.clock.tick(5000);
  assert.strictEqual(h.calls.reconnecting, 0);
  assert.deepStrictEqual(h.children[0].signals, ['SIGCONT']);
});

test('watchdog: startWatchdog es idempotente (un solo intervalo)', () => {
  const h = harness();
  h.bridge.startWatchdog();
  h.bridge.startWatchdog();
  assert.strictEqual(h.clock.pending(), 1);
});

test('watchdog: no arma una segunda gracia si ya hay una pendiente', () => {
  const h = harness({ watchdogIntervalMs: 1000, graceMs: 4000 });
  h.bridge.start();
  h.bridge.startWatchdog();
  h.clock.tick(5000); // 1.ª detección
  h.clock.tick(2000); // ticks intermedios con gracia pendiente
  assert.deepStrictEqual(h.children[0].signals, ['SIGCONT']);
  assert.strictEqual(h.calls.reconnecting, 1);
});

// ---------------------------------------------------------------- stop
test('stop: pausado -> SIGCONT antes de SIGTERM; el exit posterior no respawnea', () => {
  const h = harness();
  h.bridge.start();
  h.bridge.startWatchdog();
  const c = h.children[0];
  h.bridge.setMainVisible(false);
  h.bridge.stop();
  assert.deepStrictEqual(c.signals, ['SIGSTOP', 'SIGCONT', 'SIGTERM']);
  c.die(0);
  h.clock.tick(60000);
  assert.strictEqual(h.children.length, 1);
  assert.deepStrictEqual(h.calls.down, []);
  assert.strictEqual(h.clock.pending(), 0); // sin timers colgando (watchdog, respawn, gracia)
  assert.strictEqual(h.bridge.isAlive(), false);
});

test('stop cancela un respawn pendiente y una gracia de watchdog en curso', () => {
  const h = harness();
  h.bridge.start();
  h.bridge.startWatchdog();
  h.children[0].die(1);
  h.bridge.stop();
  h.clock.tick(60000);
  assert.strictEqual(h.children.length, 1);

  const g = harness();
  g.bridge.start();
  g.bridge.startWatchdog();
  g.clock.tick(5000); // gracia armada
  g.bridge.stop();
  g.clock.tick(60000);
  assert.strictEqual(g.children.length, 1);
});

test('stop es idempotente, no lanza si kill falla, y start posterior vuelve a arrancar', () => {
  const h = harness();
  h.bridge.start();
  h.children[0].kill = () => { throw new Error('ESRCH'); };
  h.bridge.stop();
  h.bridge.stop();
  assert.strictEqual(h.bridge.isAlive(), false);
  h.bridge.start();
  assert.strictEqual(h.children.length, 2);
  assert.strictEqual(h.bridge.isAlive(), true);
});

test('stop sin haber arrancado no hace nada', () => {
  const h = harness();
  h.bridge.stop();
  assert.strictEqual(h.children.length, 0);
});

test('defaults: sin inyectar reloj/logger no falla al construir', () => {
  const b = bridgeMod.createBackendBridge({ spawn: () => fakeChild(), command: 'x', args: [], env: {} });
  assert.strictEqual(b.isAlive(), false);
  assert.strictEqual(typeof b.lastStatsAt, 'number');
  b.start();
  b.stop();
});
