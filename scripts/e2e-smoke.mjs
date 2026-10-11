#!/usr/bin/env node
// E2E smoke del escritorio (plan CP-8.04). Lanza Electron REAL con un perfil aislado,
// lo maneja por CDP (WebSocket global de Node >= 22, sin dependencias nuevas) y comprueba
// que la app arranca, muestra datos vivos y que los modales NO privilegiados abren/cierran
// sin excepciones. NO pulsa nada privilegiado (guardián, poder, ventiladores, GPU, SMART,
// desinstalar, límite de batería, Aura) y no arranca benchmarks ni el test de teclado.
//
// Uso:   node scripts/e2e-smoke.mjs [--out DIR] [--port N] [--keep]
// Env:   ROG_ELECTRON  binario de electron (def: desktop/node_modules/electron/dist/electron)
//        ROG_E2E_OUT   carpeta de la captura (def: tmp)
//        ROG_E2E_PORT  puerto CDP (def: uno libre)
//        CI            si está definida añade --no-sandbox (ver nota abajo)
// CI (Linux sin hardware ASUS): los bloques salen "empty", se acepta ok|empty. Hace falta
//   display -> `xvfb-run -a node scripts/e2e-smoke.mjs`. --no-sandbox SOLO con CI definida:
//   los runners de GitHub no permiten el sandbox SUID de chrome-sandbox (sin root:4755) ni
//   user namespaces sin privilegios; en local el sandbox queda activo.
// Aislamiento: --user-data-dir (=> otra requestSingleInstanceLock) + HOME temporal, para
//   que ni la instancia real del dueño ni su ~/.config/rog-monitor se toquen. Al final se
//   mata SOLO el grupo de procesos lanzado aquí.
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_DIR = path.join(ROOT, 'desktop');
const ELECTRON = process.env.ROG_ELECTRON || path.join(APP_DIR, 'node_modules/electron/dist/electron');
const argv = process.argv.slice(2);
const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const KEEP = argv.includes('--keep');
const OUT = arg('--out') || process.env.ROG_E2E_OUT || mkdtempSync(path.join(tmpdir(), 'rog-e2e-out-'));

// Ruido de consola conocido y benigno (se lista en el informe si aparece).
const BENIGN = [
  { re: /Autofill\.(enable|setAddresses)/, why: 'DevTools pide dominios Autofill que Electron no implementa' },
  { re: /Electron Security Warning/, why: 'aviso de CSP en modo dev (sin empaquetar)' },
  { re: /dbus|DBus|org\.freedesktop/i, why: 'sin bus de sesión (CI/headless): notificaciones/tray no disponibles' },
  { re: /Failed to load resource.*(ERR_FILE_NOT_FOUND|net::ERR_)/, why: 'recurso opcional ausente' },
];

const failures = [];
const passes = [];
const benign = [];
const exceptions = [];
const consoleErrors = [];
const log = (...a) => console.log(...a);
function check(name, ok, detail = '') {
  (ok ? passes : failures).push(name);
  log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  return ok;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, timeoutMs = 8000, every = 100) {
  const end = Date.now() + timeoutMs;
  let last;
  while (Date.now() < end) {
    try { last = await fn(); if (last) return last; } catch (_) { /* reintenta */ }
    await sleep(every);
  }
  return false;
}
function freePort() {
  return new Promise((res, rej) => {
    const s = createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); });
  });
}

/* ---------------- lanzar Electron aislado ---------------- */
if (!existsSync(ELECTRON)) { console.error(`No encuentro electron: ${ELECTRON} (define ROG_ELECTRON)`); process.exit(2); }
const tmp = mkdtempSync(path.join(tmpdir(), 'rog-e2e-'));
const userData = path.join(tmp, 'userdata');
const home = path.join(tmp, 'home');
mkdirSync(userData); mkdirSync(home); mkdirSync(OUT, { recursive: true });
const port = Number(arg('--port') || process.env.ROG_E2E_PORT) || await freePort();
const eargs = [APP_DIR, `--user-data-dir=${userData}`, `--remote-debugging-port=${port}`];
if (process.env.CI) eargs.push('--no-sandbox');
const child = spawn(ELECTRON, eargs, {
  detached: true, // grupo propio: matamos solo lo que lanzamos (-pid)
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, '.config'), XDG_DATA_HOME: path.join(home, '.local/share') },
});
let appLog = '';
child.stdout.on('data', (d) => { appLog += d; });
child.stderr.on('data', (d) => { appLog += d; });
let childExited = false;
child.on('exit', () => { childExited = true; });

function killGroup() {
  if (childExited) return;
  try { process.kill(-child.pid, 'SIGTERM'); } catch (_) { /* ya muerto */ }
}
async function finish(code) {
  killGroup();
  await waitFor(() => childExited, 4000);
  if (!childExited) { try { process.kill(-child.pid, 'SIGKILL'); } catch (_) {} }
  if (!KEEP) { try { rmSync(tmp, { recursive: true, force: true }); } catch (_) {} }
  process.exit(code);
}
process.on('SIGINT', () => finish(130));

/* ---------------- cliente CDP mínimo ---------------- */
let wsUrl = await waitFor(async () => {
  if (childExited) throw new Error('electron salió pronto');
  const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const t = list.find((x) => x.type === 'page' && /index\.html/.test(x.url));
  return t && t.webSocketDebuggerUrl;
}, 25000, 250);
if (!wsUrl) {
  console.error('No apareció el target CDP index.html. Log de la app:\n' + appLog.slice(-2000));
  await finish(1);
}
const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws error')); });
let nextId = 1;
const pending = new Map();
const fmtEx = (d) => {
  const e = d.exception || {};
  const f = (d.stackTrace && d.stackTrace.callFrames && d.stackTrace.callFrames[0]) || {};
  return `${e.description || d.text}  @ ${(f.url || d.url || '').split('/').pop()}:${(f.lineNumber ?? d.lineNumber ?? 0) + 1}`;
};
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id); pending.delete(msg.id);
    return msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
  }
  if (msg.method === 'Runtime.exceptionThrown') exceptions.push(fmtEx(msg.params.exceptionDetails));
  else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    const text = msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
    const f = (msg.params.stackTrace && msg.params.stackTrace.callFrames[0]) || {};
    consoleErrors.push(`${text}  @ ${(f.url || '').split('/').pop()}:${(f.lineNumber ?? 0) + 1}`);
  } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
    const en = msg.params.entry;
    consoleErrors.push(`[${en.source}] ${en.text}  ${en.url ? '@ ' + en.url.split('/').pop() + ':' + ((en.lineNumber || 0) + 1) : ''}`);
  }
};
const cdp = (method, params = {}) => new Promise((res, rej) => {
  const id = nextId++; pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params }));
});
// Evalúa en la página; devuelve el valor (JSON-serializable).
async function ev(expr) {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(fmtEx(r.exceptionDetails));
  return r.result.value;
}
await cdp('Runtime.enable'); await cdp('Log.enable'); await cdp('Page.enable');

/* ---------------- helpers de página ---------------- */
const Q = JSON.stringify;
const isOpen = (sel) => ev(`(()=>{const m=document.querySelector(${Q(sel)});return !!m && !m.classList.contains('hidden')})()`);
const click = (sel) => ev(`(()=>{const b=document.querySelector(${Q(sel)});if(!b)return false;b.click();return true})()`);
const text = (sel) => ev(`(document.querySelector(${Q(sel)})||{}).textContent||''`);
const hideWizard = () => ev(`(()=>{const w=document.getElementById('wizard-modal');if(w)w.classList.add('hidden')})()`);

// Tabla de modales no privilegiados: nombre, selector del modal, cómo abrir, cómo cerrar.
const MODALS = [
  { name: 'roadmap',     modal: '#roadmap-modal',   open: '#roadmap-btn',   close: '#roadmap-close' },
  { name: 'diagnostics', modal: '#diag-modal',      open: '#diag-btn',      close: '#diag-close' },   // sin activar test de teclado
  { name: 'commands',    modal: '#commands-modal',  open: '#commands-btn',  close: '#commands-close' },
  { name: 'config',      modal: '#config-modal',    open: '#config-btn',    close: '#config-close' },
  { name: 'alerts',      modal: '#alerts-modal',    open: '#alerts-btn',    close: '#alerts-close' },  // sin GUARDAR Y APLICAR
  { name: 'benchmarks',  modal: '#benchmark-modal', open: '#benchmark-btn', close: '#benchmark-close' }, // sin lanzar benchmark
];

/* ---------------- ejecución ---------------- */
const t0 = Date.now();
try {
  await waitFor(() => ev(`document.readyState==='complete' && !!window.rog`), 15000);
  await hideWizard(); // NO completar: completarlo escribe ajustes
  await sleep(300); await hideWizard(); // por si el wizard se abre tras el primer stats

  // 1) bloques con estado ok|empty (no error / loading eterno)
  const BLOCKS = ['cpu-block', 'gpu-block', 'fans-block', 'system-block', 'procs-block'];
  const states = () => ev(`(${Q(BLOCKS)}).map(id=>[id,(document.getElementById(id)||{dataset:{}}).dataset.state||'none'])`);
  const okBlocks = await waitFor(async () => (await states()).every(([, s]) => s === 'ok' || s === 'empty'), 20000, 250);
  const st = await states();
  for (const [id, s] of st) check(`block ${id} -> ok|empty`, s === 'ok' || s === 'empty', `data-state=${s}`);
  if (!okBlocks) log('  (algún bloque no llegó a ok|empty en 20 s)');

  // 2) temperatura CPU viva: cambia en 3 s (si el bloque está vacío, no hay sensor -> se omite)
  const cpuState = st.find(([id]) => id === 'cpu-block')[1];
  if (cpuState === 'ok') {
    const seen = new Set();
    const end = Date.now() + 3500;
    while (Date.now() < end) { seen.add((await text('#cpu-temp')).trim()); await sleep(250); }
    const vals = [...seen];
    // Un valor entero que no cambia 3 s es plausible; exigimos al menos un valor numérico y,
    // junto con la frecuencia/uptime, dato vivo. Cambio de temp OR de uptime/GHz.
    const live = await (async () => {
      const a = await ev(`['#cpu-temp','#cpu-freq','#cpu-watts','#cpu-uptime','#net','#load'].map(s=>(document.querySelector(s)||{}).textContent).join('|')`);
      await sleep(2200);
      const b = await ev(`['#cpu-temp','#cpu-freq','#cpu-watts','#cpu-uptime','#net','#load'].map(s=>(document.querySelector(s)||{}).textContent).join('|')`);
      return a !== b;
    })();
    check('CPU temp numérica y viva', vals.some((v) => /^\d/.test(v)) && (vals.length > 1 || live), `temps vistas=${vals.join(',')} cambio-otros-campos=${live}`);
  } else {
    log('SKIP  CPU temp viva (cpu-block empty: sin sensor, p. ej. CI)');
  }

  // 3) modales abrir/cerrar
  for (const m of MODALS) {
    await hideWizard();
    const clicked = await click(m.open);
    const opened = clicked && await waitFor(() => isOpen(m.modal), 4000, 80);
    check(`modal ${m.name} abre`, !!opened, clicked ? '' : `no existe ${m.open}`);
    if (m.name === 'config' && opened) {
      // 4) tema vía configuración y restaurar
      const orig = await ev(`document.documentElement.dataset.theme`);
      const target = await ev(`(()=>{const c=[...document.querySelectorAll('.theme-card')].find(c=>c.dataset.theme!==document.documentElement.dataset.theme);return c&&c.dataset.theme})()`);
      if (target) {
        await click(`.theme-card[data-theme="${target}"]`);
        const changed = await waitFor(async () => (await ev(`document.documentElement.dataset.theme`)) === target, 3000, 80);
        check(`tema ${orig} -> ${target}`, !!changed);
        await click(`.theme-card[data-theme="${orig}"]`);
        const back = await waitFor(async () => (await ev(`document.documentElement.dataset.theme`)) === orig, 3000, 80);
        check(`tema restaurado a ${orig}`, !!back);
      } else check('tema: hay tarjetas', false);
    }
    if (opened) {
      await click(m.close);
      let closed = await waitFor(async () => !(await isOpen(m.modal)), 3000, 80);
      check(`modal ${m.name} cierra`, !!closed);
    }
  }

  // 5) filtros de eventos: alternar un chip
  await hideWizard();
  const chipSel = '.event-chip[data-axis="sev"][data-filter-key="warn"]';
  const had = await ev(`!!document.querySelector(${Q(chipSel)})`);
  if (check('chips de filtro de eventos existen', had)) {
    const p0 = await ev(`document.querySelector(${Q(chipSel)}).getAttribute('aria-pressed')`);
    await click(chipSel);
    const p1 = await waitFor(async () => (await ev(`document.querySelector(${Q(chipSel)}).getAttribute('aria-pressed')`)) !== p0 && 'x', 2000, 60);
    check('chip alterna aria-pressed', !!p1);
    await click(chipSel); // restaurar (también limpia localStorage del perfil temporal)
    const p2 = await waitFor(async () => (await ev(`document.querySelector(${Q(chipSel)}).getAttribute('aria-pressed')`)) === p0, 2000, 60);
    check('chip restaurado', !!p2);
  }

  // 6) idioma: ir al "otro" idioma (en<->es según el de arranque) y volver; el texto cambia
  const langText = () => text('#config-btn');
  const lang0 = await ev(`(window.i18n&&window.i18n.get&&window.i18n.get())||'es'`);
  const other = lang0 === 'en' ? 'es' : 'en';
  const es0 = (await langText()).trim();
  const setLang = async (code) => {
    await click('#lang-btn');
    await waitFor(() => isOpen('#lang-modal'), 3000, 80);
    await click(`.lang-option[data-lang="${code}"]`);
    if (code === 'en') {
      // regresión: textos en español fijos en JS (p. ej. historial de benchmarks vacío)
      await waitFor(async () => (await text('#config-btn')).trim() === 'CONFIGURATION', 4000, 80);
      const leak = (await text('#bench-history')).trim();
      check('en: #bench-history sin español fijo', !/sin historial/i.test(leak), leak);
    }
  };
  await setLang(other);
  const en = await waitFor(async () => { const v = (await langText()).trim(); return v !== es0 && v; }, 4000, 80);
  check(`idioma ${lang0} -> ${other}: texto cambia`, !!en, `${es0} -> ${en}`);
  await setLang(lang0);
  const es1 = await waitFor(async () => (await langText()).trim() === es0 && 'x', 4000, 80);
  check(`idioma ${other} -> ${lang0}: texto vuelve`, !!es1);
  await click('#lang-close');
  check('modal idioma cierra', !!(await waitFor(async () => !(await isOpen('#lang-modal')), 3000, 80)));

  // 7) captura para revisión humana
  await hideWizard();
  const shot = await cdp('Page.captureScreenshot', { format: 'png' });
  const shotPath = path.join(OUT, 'e2e-smoke.png');
  writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
  log(`screenshot: ${shotPath}`);
  await sleep(300); // deja llegar excepciones tardías
} catch (e) {
  check('ejecución sin error del runner', false, e.message);
}

/* ---------------- informe ---------------- */
const realErrors = [];
for (const c of consoleErrors) {
  const b = BENIGN.find((x) => x.re.test(c));
  (b ? benign : realErrors).push(b ? `${c}  [benigno: ${b.why}]` : c);
}
check('cero excepciones no capturadas', exceptions.length === 0, exceptions.length ? '' : '');
exceptions.forEach((x) => log('  EXCEPTION: ' + x));
check('cero console.error no benignos', realErrors.length === 0);
realErrors.forEach((x) => log('  CONSOLE.ERROR: ' + x));
benign.forEach((x) => log('  (ignorado) ' + x));
log(`\n== e2e-smoke: ${passes.length} pass, ${failures.length} fail, ${exceptions.length} exceptions, ${realErrors.length} console.error, ${((Date.now() - t0) / 1000).toFixed(1)} s ==`);
if (failures.length) { log('FALLOS: ' + failures.join(' | ')); log('--- cola del log de la app ---\n' + appLog.slice(-1500)); }
try { ws.close(); } catch (_) {}
await finish(failures.length || exceptions.length ? 1 : 0);
