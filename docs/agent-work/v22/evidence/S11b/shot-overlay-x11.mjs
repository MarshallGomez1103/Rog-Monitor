// shot-overlay-x11.mjs — ventana REAL del overlay v2 (S11b) en modo compatibilidad (XWayland), tamaños M y XL.
// Uso: ELECTRON=<binario electron> ROG_APP_ROOT=<raíz repo/worktree> node shot-overlay-x11.mjs [--shots=<dir>]
// Copia el patrón de evidence/S11/measure-overlay-x11.mjs: HOME temporal con config.json
// {overlay_xwayland:true} (la app se relanza sola con --ozone-platform=x11), arranque minimizado (no roba
// foco), overlay encendido por IPC en monitor 1 arriba-derecha con escala M y luego XL; mide la ventana
// X11 con xwininfo (override-redirect, tamaño) y, con --shots, guarda una captura SOLO de la página del
// overlay (no de la pantalla). Mata todo lo lanzado y borra la carpeta temporal. RESULT: PASS|FAIL.
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ELECTRON = process.env.ELECTRON;
const ROOT = process.env.ROG_APP_ROOT;
const SHOTS = (process.argv.find((a) => a.startsWith('--shots=')) || '').slice(8) || null;
if (!ELECTRON || !ROOT) { console.error('faltan ELECTRON y ROG_APP_ROOT'); process.exit(2); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = mkdtempSync(path.join(tmpdir(), 'rog-ovl2-x11-'));
mkdirSync(path.join(T, '.config', 'rog-monitor'), { recursive: true });
writeFileSync(path.join(T, '.config', 'rog-monitor', 'config.json'), JSON.stringify({ overlay_xwayland: true }));
const PORT = 9450 + Math.floor(Math.random() * 40);
const UD = path.join(T, 'ud');
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

const child = spawn(ELECTRON, [path.join(ROOT, 'desktop'), `--user-data-dir=${UD}`, `--remote-debugging-port=${PORT}`, '--minimized'],
  { env: { ...process.env, HOME: T }, detached: true, stdio: 'ignore' });
const killAll = () => {
  try { process.kill(-child.pid, 'SIGKILL'); } catch (_) { /* ya salió (relanzado) */ }
  try { execFileSync('pkill', ['-KILL', '-f', '--', `--user-data-dir=${UD}`]); } catch (_) { /* nada vivo */ }
};
process.on('exit', () => { killAll(); rmSync(T, { recursive: true, force: true }); });

async function target(re) {
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    try {
      const t = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.type === 'page' && re.test(x.url));
      if (t) return t;
    } catch (_) { /* aún arrancando */ }
  }
  return null;
}
async function connect(t) {
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0; const pend = {};
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (pend[m.id]) { pend[m.id](m); delete pend[m.id]; } };
  const call = (method, params) => new Promise((r) => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => (await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
  return { ws, call, ev };
}
function xwin(name) {
  try {
    const out = execFileSync('xwininfo', ['-name', name], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const n = (k) => Number((out.match(new RegExp(`${k}:\\s+(-?\\d+)`)) || [])[1]);
    return { x: n('Absolute upper-left X'), y: n('Absolute upper-left Y'), w: n('Width'), h: n('Height'),
      override: /Override Redirect State: yes/.test(out), mapped: /Map State: IsViewable/.test(out) };
  } catch (_) { return null; }
}

const main = await target(/index\.html/);
check('la app arranca (página principal)', !!main);
if (!main) process.exit(1);
const app = await connect(main);
await sleep(1500);
const info = JSON.parse(await app.ev(`window.rog.listDisplays().then((r) => JSON.stringify(r))`));
check('modo compatibilidad activo (x11Active=true)', info.mode && info.mode.x11Active === true, JSON.stringify(info.mode));

const metrics = ['cpu_usage', 'cpu_temp', 'cpu_power', 'gpu_usage', 'gpu_temp', 'gpu_power', 'fps', 'fan'];
const seen = {};
let ovl = null;
for (const scale of ['M', 'XL']) {
  await app.ev(`window.rog.setOverlay({ enabled: true, monitor: 0, corner: 'top-right', offsetX: 0, offsetY: 0, scale: '${scale}', metrics: ${JSON.stringify(metrics)} }).then(() => 1)`);
  await sleep(3500); // dos muestras: el uso de CPU necesita un delta
  const w = xwin('ROG Overlay');
  seen[scale] = w;
  check(`${scale}: ventana X11 visible y override-redirect (sin foco)`, w && w.mapped && w.override, JSON.stringify(w));
  if (!ovl) ovl = await connect(await target(/overlay\.html/));
  const page = JSON.parse(await ovl.ev(`JSON.stringify({ win: [innerWidth, innerHeight], v: parseFloat(getComputedStyle(document.querySelector('.cell .v')).fontSize),
    rows: [...document.querySelectorAll('#rows .row')].map((r) => r.dataset.row) })`));
  console.log(`INFO  ${scale}`, JSON.stringify({ x11: w, page }));
  check(`${scale}: fuente del valor ${scale === 'M' ? 27.5 : 44} px`, page.v === (scale === 'M' ? 27.5 : 44), JSON.stringify(page));
  if (SHOTS) {
    const shot = await ovl.call('Page.captureScreenshot', { format: 'png' });
    mkdirSync(SHOTS, { recursive: true });
    writeFileSync(path.join(SHOTS, `overlay-${scale}.png`), Buffer.from(shot.result.data, 'base64'));
  }
}
check('XL: la ventana X11 es mayor que en M (se ajusta en vivo)', seen.M && seen.XL && seen.XL.w > seen.M.w * 1.4 && seen.XL.h > seen.M.h * 1.4,
  JSON.stringify({ M: seen.M, XL: seen.XL }));
await app.ev(`window.rog.setOverlay({ enabled: false }).then(() => 1)`);
await sleep(500);
check('apagar cierra la ventana del overlay', !xwin('ROG Overlay'));
try { ovl.ws.close(); } catch (_) { /* cerrada */ }
app.ws.close();
killAll();
await sleep(500);
let alive = '';
try { alive = execFileSync('pgrep', ['-af', '--', `--user-data-dir=${UD}`], { encoding: 'utf8' }); } catch (_) { /* vacío */ }
check('no queda ningún proceso lanzado', !alive.trim(), alive.trim());
const ok = results.every(Boolean);
console.log(`\n${results.filter(Boolean).length}/${results.length} PASS\nRESULT: ${ok ? 'PASS' : 'FAIL'}`);
process.exit(ok ? 0 : 1);
