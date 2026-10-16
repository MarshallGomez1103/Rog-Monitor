// measure-overlay-x11.mjs — mide la ventana REAL del overlay del producto en modo compatibilidad.
// Uso: ELECTRON=<binario electron> ROG_APP_ROOT=<raíz repo/worktree> node measure-overlay-x11.mjs [--shots=<dir>]
// - HOME temporal con config.json {overlay_xwayland:true}: la app debe relanzarse sola con
//   --ozone-platform=x11 (ADR-0007 A2) — se comprueba en la línea de órdenes del proceso vivo.
// - Arranca minimizada (--minimized) para no tapar ni robar foco; activa el overlay por IPC con
//   monitor N (índice estable por x,y) + anclaje y lo mide con xwininfo (geometría X11 y
//   override-redirect). Con --shots guarda una captura SOLO de la página del overlay (no de la pantalla).
// - Mata todo lo lanzado (grupo + procesos con su user-data-dir) y borra la carpeta temporal.
// Imprime PASS/FAIL por caso y RESULT: PASS|FAIL. Requiere sesión con XWayland (DISPLAY) y xwininfo.
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ELECTRON = process.env.ELECTRON;
const ROOT = process.env.ROG_APP_ROOT;
const SHOTS = (process.argv.find((a) => a.startsWith('--shots=')) || '').slice(8) || null;
if (!ELECTRON || !ROOT) { console.error('faltan ELECTRON y ROG_APP_ROOT'); process.exit(2); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = mkdtempSync(path.join(tmpdir(), 'rog-ovl-x11-'));
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
let cmdline = '';
try { cmdline = execFileSync('pgrep', ['-af', '--', `--user-data-dir=${UD}`], { encoding: 'utf8' }); } catch (_) { /* vacío */ }
check('relanzada sola con --ozone-platform=x11 (config overlay_xwayland:true)', /--ozone-platform=x11/.test(cmdline));
const app = await connect(main);
await sleep(1500);
const info = JSON.parse(await app.ev(`window.rog.listDisplays().then((r) => JSON.stringify(r))`));
console.log('INFO  modo', JSON.stringify(info.mode), 'monitores', JSON.stringify(info.displays));
check('main informa x11Active=true', info.mode && info.mode.x11Active === true);

let xroot = null;
try {
  const r = execFileSync('xwininfo', ['-root'], { encoding: 'utf8' });
  xroot = { w: Number(r.match(/Width:\s+(\d+)/)[1]), h: Number(r.match(/Height:\s+(\d+)/)[1]) };
} catch (_) { /* sin X */ }
// geometría X11 de cada monitor (xrandr: "<w>/<mm>x<h>/<mm>+<x>+<y>"), en el mismo orden estable x,y
let xmons = [];
try {
  xmons = execFileSync('xrandr', ['--listmonitors'], { encoding: 'utf8' }).split('\n')
    .map((l) => l.match(/(\d+)\/\d+x(\d+)\/\d+\+(-?\d+)\+(-?\d+)\s+(\S+)$/)).filter(Boolean)
    .map((m) => ({ w: +m[1], h: +m[2], x: +m[3], y: +m[4], name: m[5] }))
    .sort((a, b) => a.x - b.x || a.y - b.y);
} catch (_) { /* sin xrandr */ }
console.log('INFO  X11 root', JSON.stringify(xroot), 'monitores X11', JSON.stringify(xmons));

const cases = [];
for (let m = 0; m < info.displays.length; m++) for (const corner of ['top-right', 'top-left', 'bottom-right']) cases.push({ m, corner });
let ovl = null;
for (const c of cases) {
  await app.ev(`window.rog.setOverlay({ enabled: true, monitor: ${c.m}, corner: '${c.corner}', offsetX: 0, offsetY: 0, layout: 'row', show: { cpu: true, gpu: true, fans: true } }).then(() => 1)`);
  await sleep(1800);
  const w = xwin('ROG Overlay');
  const mon = xmons[c.m];
  if (!w || !mon) { check(`monitor ${c.m + 1} ${c.corner}: ventana X11 encontrada`, false, JSON.stringify({ w, mon })); continue; }
  const inMon = w.x >= mon.x && w.y >= mon.y && w.x + w.w <= mon.x + mon.w && w.y + w.h <= mon.y + mon.h;
  const gapR = mon.x + mon.w - (w.x + w.w); const gapL = w.x - mon.x; const gapT = w.y - mon.y; const gapB = mon.y + mon.h - (w.y + w.h);
  const near = (g) => g >= 0 && g <= 40; // margen 18 DIP x escala XWayland (~1.2) + redondeo
  const okCorner = { 'top-right': near(gapR) && near(gapT), 'top-left': near(gapL) && near(gapT), 'bottom-right': near(gapR) && near(gapB) }[c.corner];
  check(`monitor ${c.m + 1} (${mon.name}) ${c.corner}: dentro del monitor y en la esquina`, inMon && okCorner,
    JSON.stringify({ win: w, gaps: { l: gapL, r: gapR, t: gapT, b: gapB } }));
  check(`monitor ${c.m + 1} ${c.corner}: override-redirect (sin foco ni barra de tareas)`, w.override && w.mapped);
  if (!ovl) ovl = await target(/overlay\.html/);
}
if (SHOTS && ovl) {
  const o = await connect(ovl);
  for (const layout of ['row', 'box']) {
    await app.ev(`window.rog.setOverlay({ enabled: true, monitor: 0, corner: 'top-right', layout: '${layout}' }).then(() => 1)`);
    await sleep(1500);
    const shot = await o.call('Page.captureScreenshot', { format: 'png' });
    mkdirSync(SHOTS, { recursive: true });
    writeFileSync(path.join(SHOTS, `overlay-${layout}.png`), Buffer.from(shot.result.data, 'base64'));
  }
  o.ws.close();
}
await app.ev(`window.rog.setOverlay({ enabled: false }).then(() => 1)`);
await sleep(500);
check('apagar cierra la ventana del overlay', !xwin('ROG Overlay'));
app.ws.close();
killAll();
await sleep(500);
let alive = '';
try { alive = execFileSync('pgrep', ['-af', '--', `--user-data-dir=${UD}`], { encoding: 'utf8' }); } catch (_) { /* vacío */ }
check('no queda ningún proceso lanzado', !alive.trim(), alive.trim());
const ok = results.every(Boolean);
console.log(`\n${results.filter(Boolean).length}/${results.length} PASS\nRESULT: ${ok ? 'PASS' : 'FAIL'}`);
process.exit(ok ? 0 : 1);
