'use strict';
// Puente con el backend Python (`python -m rog_monitor --json-stream`): parser NDJSON
// incremental (puro) + supervisor del proceso (arranque, respawn, pausa SIGSTOP/SIGCONT,
// watchdog y parada limpia). Sin Electron: spawn, reloj, temporizadores y log se inyectan,
// así se prueba en Node con un proceso y un reloj falsos (F3-03 corte 1 + F3-04).
const { StringDecoder } = require('string_decoder');

const DEFAULT_MAX_BUFFER = 1024 * 1024; // una línea de stats pesa unos KB; 1 MiB es holgado
const MAX_LOGGED_BAD_LINES = 5; // por proceso, para no inundar errors.jsonl si el stream se corrompe

function createParserState() {
  return { buffer: '', discarding: false };
}

// Alimenta el parser con un trozo de texto. Pura: no muta `state`, devuelve el nuevo estado
// y lo que salió de este trozo.
//   messages: objetos JSON completos · bad: [{line, message}] líneas descartadas
//   overflow: true si algo superó maxBuffer (se descarta hasta el siguiente \n)
function parseNdjson(state, text, maxBuffer = DEFAULT_MAX_BUFFER) {
  const messages = [];
  const bad = [];
  let overflow = false;
  let buffer = state.buffer;
  let discarding = state.discarding;
  let data = text;
  if (discarding) {
    const nl = data.indexOf('\n');
    if (nl < 0) return { state: { buffer: '', discarding: true }, messages, bad, overflow };
    data = data.slice(nl + 1); // cola de la línea gigante: no se interpreta
    discarding = false;
  }
  buffer += data;
  let idx;
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const raw = buffer.slice(0, idx);
    buffer = buffer.slice(idx + 1);
    const line = raw.trim();
    if (!line) continue;
    if (raw.length > maxBuffer) { overflow = true; continue; }
    try {
      const obj = JSON.parse(line);
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) messages.push(obj);
      else bad.push({ line: line.slice(0, 200), message: 'no es un objeto JSON' });
    } catch (err) {
      bad.push({ line: line.slice(0, 200), message: String(err.message) });
    }
  }
  if (buffer.length > maxBuffer) { overflow = true; buffer = ''; discarding = true; }
  return { state: { buffer, discarding }, messages, bad, overflow };
}

const noop = () => {};

// opts: spawn, command, args, env (obligatorios) · onStats(obj), onDown(code), onReconnecting(),
// hasWindow(), overlayNeeded(), recordError(kind, payload), logger{error,warn}, now,
// setTimeout/clearTimeout/setInterval/clearInterval, maxBuffer, respawnDelayMs,
// watchdogIntervalMs, staleMs, graceMs.
function createBackendBridge(opts) {
  const {
    spawn, command, args, env,
    onStats = noop, onDown = noop, onReconnecting = noop,
    hasWindow = () => true,
    overlayNeeded = () => false,
    recordError = noop,
    logger = console,
    now = Date.now,
    maxBuffer = DEFAULT_MAX_BUFFER,
    respawnDelayMs = 3000,
    watchdogIntervalMs = 5000, // cada cuánto se revisa
    staleMs = 5000, // silencio tolerado antes de actuar
    graceMs = 3000, // espera tras el SIGCONT antes de matar y respawnear
  } = opts;
  const timers = {
    setTimeout: opts.setTimeout || setTimeout,
    clearTimeout: opts.clearTimeout || clearTimeout,
    setInterval: opts.setInterval || setInterval,
    clearInterval: opts.clearInterval || clearInterval,
  };

  let child = null;
  let paused = false;
  let mainVisible = true;
  let lastStatsAt = now();
  let statsCount = 0; // el watchdog compara conteos, no relojes (dos líneas en el mismo ms)
  let lastTempLimits = null;
  let respawnTimer = null;
  let graceTimer = null;
  let watchdogTimer = null;

  // OJO: ChildProcess.killed pasa a true con CUALQUIER señal entregada (también SIGSTOP),
  // así que no sirve para saber si sigue vivo; exitCode/signalCode sí.
  function isAlive() {
    return !!child && child.exitCode === null && child.signalCode === null;
  }

  function clearTimer(name) {
    if (name === 'respawn' && respawnTimer) { timers.clearTimeout(respawnTimer); respawnTimer = null; }
    if (name === 'grace' && graceTimer) { timers.clearTimeout(graceTimer); graceTimer = null; }
  }

  // Un proceso en SIGSTOP no atiende SIGTERM hasta reanudarse: sin SIGCONT quedaba en
  // estado T para siempre al reiniciar/salir con la ventana oculta (ARC-03 / F3-05).
  function terminate(proc) {
    proc.removeAllListeners();
    proc.on('error', noop); // un 'error' tardío sin listener tumbaría el proceso principal
    try { proc.kill('SIGCONT'); } catch (_) { /* ya murió */ }
    try { proc.kill(); } catch (_) { /* ya murió */ }
  }

  // Caída del backend: avisa y programa el respawn, pero solo si aún hay ventana.
  function afterDown(code) {
    paused = false;
    if (!hasWindow()) return;
    onDown(code);
    onReconnecting();
    respawnTimer = timers.setTimeout(() => { respawnTimer = null; restart(); }, respawnDelayMs);
  }

  function spawnChild() {
    clearTimer('respawn');
    lastStatsAt = now(); // ventana fresca para el watchdog: Python tarda en dar la 1.ª muestra
    let proc;
    try {
      proc = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      child = null;
      recordError('backend-spawn-error', { message: String(err.message) });
      afterDown(null);
      return;
    }
    child = proc;
    let parser = createParserState();
    const decoder = new StringDecoder('utf8'); // un carácter multibyte puede partirse entre chunks
    let badLogged = 0;
    let settled = false;

    proc.stdout.on('data', (chunk) => {
      if (proc !== child) return; // proceso ya reemplazado
      const r = parseNdjson(parser, decoder.write(chunk), maxBuffer);
      parser = r.state;
      if (r.overflow) {
        logger.warn('[backend] línea NDJSON excede el tope; descartada');
        recordError('backend-overflow', { maxBuffer });
      }
      for (const b of r.bad) {
        logger.warn('[backend] línea NDJSON inválida:', b.message);
        if (badLogged < MAX_LOGGED_BAD_LINES) {
          badLogged += 1;
          recordError('backend-bad-line', { message: b.message, line: b.line });
        }
      }
      for (const stats of r.messages) {
        lastStatsAt = now(); // watchdog: se reinicia con cada línea buena
        statsCount += 1;
        // Umbrales de temperatura vivos (cpu/gpu): el overlay colorea con los MISMOS valores
        // que el dashboard (el stream no manda temp_colors).
        if (stats.limits) lastTempLimits = stats.limits;
        try { onStats(stats); } catch (err) { logger.warn('[backend] onStats falló:', err.message); }
      }
    });
    proc.stderr.on('data', (d) => {
      if (proc !== child) return;
      const text = d.toString().trim();
      logger.error('[backend]', text);
      if (text) recordError('backend-stderr', { message: text });
    });
    proc.on('exit', (code) => {
      if (proc !== child || settled) return;
      settled = true;
      logger.error('[backend] exited', code);
      recordError('backend-exit', { code });
      afterDown(code);
    });
    proc.on('error', (err) => {
      if (proc !== child || settled) return;
      settled = true;
      logger.error('[backend] error', err.message);
      recordError('backend-spawn-error', { message: String(err.message) });
      afterDown(null);
    });
  }

  function start() {
    if (isAlive()) return;
    spawnChild();
  }

  // Reinicio explícito (recargar config, actualizar dependencias) o por watchdog.
  function restart() {
    clearTimer('grace');
    if (child) { terminate(child); child = null; }
    paused = false;
    spawnChild();
  }

  // Parada limpia (salir de la app): sin respawn y sin temporizadores colgando.
  function stop() {
    clearTimer('respawn');
    clearTimer('grace');
    if (watchdogTimer) { timers.clearInterval(watchdogTimer); watchdogTimer = null; }
    if (child) { terminate(child); child = null; }
    paused = false;
  }

  // Ahorro de energía: con la ventana oculta y sin overlay, SIGSTOP (0 % CPU); al volver, SIGCONT.
  function setPaused(next) {
    if (!isAlive() || next === paused) return;
    try {
      child.kill(next ? 'SIGSTOP' : 'SIGCONT');
      paused = next;
      // La 1.ª muestra tras SIGCONT tarda hasta 1 s: darle al watchdog una ventana fresca.
      if (!next) lastStatsAt = now();
    } catch (_) { /* pudo morir; el auto-recover lo recrea */ }
  }

  function updatePower() {
    setPaused(!(mainVisible || overlayNeeded()));
  }

  function setMainVisible(visible) {
    mainVisible = !!visible;
    updatePower();
  }

  // Watchdog: cubre el caso en que SIGSTOP se disparó (minimizar/ocultar) pero el SIGCONT nunca
  // llegó porque el gestor de ventanas no emitió el evento. Si hay silencio > staleMs cuando
  // el backend debería correr: 1) SIGCONT; 2) si pasados graceMs sigue sin datos, matar y respawnear.
  function watchdogTick() {
    if (!(mainVisible || overlayNeeded())) return; // pausado a propósito
    if (!isAlive()) return; // el handler de exit ya lo maneja
    if (graceTimer) return; // ya se actuó; esperando la gracia
    if (paused) {
      logger.warn('[watchdog] backend paused but window visible — forcing SIGCONT');
      recordError('watchdog-force-cont', {});
      setPaused(false);
      lastStatsAt = now(); // darle un ciclo antes de declararlo muerto
      return;
    }
    const stale = now() - lastStatsAt;
    if (stale < staleMs) return;
    logger.warn(`[watchdog] no stats for ${stale}ms — sending SIGCONT`);
    recordError('watchdog-stale', { staleMs: stale });
    if (hasWindow()) onReconnecting();
    try { child.kill('SIGCONT'); } catch (_) { /* ya murió */ }
    paused = false;
    const snap = statsCount;
    graceTimer = timers.setTimeout(() => {
      graceTimer = null;
      if (statsCount !== snap) return; // llegó algo, ok
      logger.warn('[watchdog] still no stats after SIGCONT — respawning backend');
      recordError('watchdog-respawn', {});
      restart();
    }, graceMs);
  }

  function startWatchdog() {
    if (watchdogTimer) return;
    watchdogTimer = timers.setInterval(watchdogTick, watchdogIntervalMs);
  }

  return {
    start, restart, stop, startWatchdog,
    setMainVisible, updatePower,
    isAlive,
    isPaused: () => paused,
    get lastStatsAt() { return lastStatsAt; },
    get lastTempLimits() { return lastTempLimits; },
  };
}

module.exports = { DEFAULT_MAX_BUFFER, createParserState, parseNdjson, createBackendBridge };
