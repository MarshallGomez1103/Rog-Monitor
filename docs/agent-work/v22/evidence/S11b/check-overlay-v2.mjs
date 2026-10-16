// check-overlay-v2.mjs — CDP del overlay v2 (S11b): estilo MangoHud, tamaños S/M/L/XL, métricas elegibles.
// Uso:  ROG_APP_ROOT=<raíz del repo/worktree> node <repo>/.ai/private/rog-v22/tools/cdp.mjs <ruta-absoluta>/check-overlay-v2.mjs
// El arnés lanza la app con HOME temporal (config.json y MangoHud.conf van ahí, nunca a los del usuario).
// Clics y teclas reales de CDP (Input.dispatchMouseEvent) en la ventana principal; la ventana del
// overlay se inspecciona conectándose a su propia página (overlay.html) en el mismo puerto de depuración.
// Imprime PASS/FAIL por aserción y al final RESULT: PASS|FAIL.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export default async ({ ev, sleep, call }) => {
  const results = [];
  const check = (name, cond, detail = '') => {
    results.push(!!cond);
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${!cond && detail !== '' ? '  -> ' + detail : ''}`);
  };
  const J = JSON.stringify;
  await call('Emulation.setFocusEmulationEnabled', { enabled: true });
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  const noAnim = `(() => { if (document.getElementById('NOANIM')) return 0; const st = document.createElement('style'); st.id = 'NOANIM';
    st.textContent = '*,*::before,*::after{transition:none!important;animation:none!important}'; document.head.appendChild(st); return 0; })()`;
  await ev(noAnim);

  const box = async (sel) => JSON.parse(await ev(`(() => { const el = document.querySelector(${J(sel)}); if (!el) return 'null';
    el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height, vis: cs.visibility !== 'hidden' && cs.display !== 'none' && r.width > 0 }); })()`));
  const click = async (sel) => {
    const b = await box(sel);
    if (!b || !b.vis) return false;
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await call('Input.dispatchMouseEvent', { type, x: b.x, y: b.y, button: 'left', clickCount: 1 });
    }
    return true;
  };
  const state = async () => JSON.parse(await ev(`window.rog.listDisplays().then((r) => JSON.stringify(r))`));
  const waitFor = async (fn, ms = 4000) => { for (let i = 0; i < ms / 100; i++) { if (await fn()) return true; await sleep(100); } return false; };
  const waitEv = (expr, ms) => waitFor(() => ev(expr), ms);

  // puerto de depuración y HOME temporal del arnés: argumentos del proceso Electron hijo de este node
  const args = execFileSync('pgrep', ['-a', '-P', String(process.pid)], { encoding: 'utf8' });
  const port = (args.match(/--remote-debugging-port=(\d+)/) || [])[1];
  const home = path.dirname((args.match(/--user-data-dir=(\S+)/) || [])[1] || '/nonexistent/ud');
  check('arnés: puerto de depuración localizado', !!port, args);

  async function overlayPage() {
    for (let i = 0; i < 40; i++) {
      try {
        const t = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.type === 'page' && /overlay\.html/.test(x.url));
        if (t) {
          const ws = new WebSocket(t.webSocketDebuggerUrl);
          await new Promise((r) => { ws.onopen = r; });
          let id = 0; const pend = {};
          ws.onmessage = (e) => { const m = JSON.parse(e.data); if (pend[m.id]) { pend[m.id](m); delete pend[m.id]; } };
          const c = (method, params) => new Promise((r) => { const n = ++id; pend[n] = r; ws.send(JSON.stringify({ id: n, method, params })); });
          const e2 = async (expr) => (await c('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
          return { ws, call: c, ev: e2 };
        }
      } catch (_) { /* aún creando la ventana */ }
      await sleep(250);
    }
    return null;
  }

  // ---------- 1) editor: botones de tamaño y casillas por métrica ----------
  check('clic real en ajustes del overlay', await click('#overlay-settings'));
  check('modal abierto', await waitEv(`!document.querySelector('#overlay-modal').classList.contains('hidden')`));
  const sizes = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('#ov-scale [data-scale]')].map((b) => [b.textContent, b.getAttribute('aria-pressed'), b.title]))`));
  check('4 botones S/M/L/XL', J(sizes.map((s) => s[0])) === J(['S', 'M', 'L', 'XL']), J(sizes));
  check('default M pulsado (125 %)', sizes[1] && sizes[1][1] === 'true' && /125/.test(sizes[1][2]) && sizes.filter((s) => s[1] === 'true').length === 1, J(sizes));
  check('sin selector de formato fila/cuadro', await ev(`!document.querySelector('#overlay-layout')`));
  const boxes = JSON.parse(await ev(`JSON.stringify(Object.fromEntries([...document.querySelectorAll('#ov-metrics input[data-metric]')].map((b) => [b.dataset.metric, b.checked])))`));
  check('12 casillas, una por métrica', Object.keys(boxes).length === 12, J(boxes));
  const defaults = ['cpu_usage', 'cpu_temp', 'cpu_power', 'gpu_usage', 'gpu_temp', 'gpu_power', 'fps', 'fan'];
  check('defaults: CPU/GPU uso+temp+W, FPS, FAN activados; frecuencias, RAM, VRAM no', Object.entries(boxes).every(([m, on]) => on === defaults.includes(m)), J(boxes));
  check('etiquetas accesibles "CPU · Temperatura"', /^CPU · \S/.test(await ev(`document.querySelector('#ov-m-cpu_temp').getAttribute('aria-label')`)));

  // ---------- 2) encender el overlay y leer su ventana ----------
  check('clic real en "Mostrar overlay"', await click('#overlay-enabled'));
  const ov = await overlayPage();
  check('ventana del overlay creada (overlay.html)', !!ov);
  if (!ov) { console.log(`\nRESULT: FAIL`); return; }
  const cells = async () => JSON.parse(await ov.ev(`JSON.stringify([...document.querySelectorAll('#rows .row')].map((r) => [r.dataset.row,
    [...r.querySelectorAll('.cell')].map((c) => [c.dataset.metric, c.querySelector('.v').textContent])]))`));
  check('el overlay pinta filas', await waitFor(async () => (await cells()).length > 0, 8000));
  // la 1.ª muestra de uso de CPU es null (delta de /proc/stat): esperar a que llegue un número
  await waitFor(async () => /^\d+$/.test(((await cells()).find((r) => r[0] === 'cpu') || [0, []])[1].find((c) => c[0] === 'cpu_usage')?.[1] || ''), 8000);
  const c1 = await cells();
  console.log('INFO  filas', J(c1));
  check('una fila por componente, en vertical (CPU, GPU, FPS, FAN)', J(c1.map((r) => r[0])) === J(['cpu', 'gpu', 'fps', 'fan']), J(c1));
  const cpu = (c1.find((r) => r[0] === 'cpu') || [0, []])[1];
  check('uso % de CPU visible por defecto (con número)', cpu.some((c) => c[0] === 'cpu_usage' && /^\d+$/.test(c[1])), J(cpu));
  check('temperatura de CPU y GPU visibles por defecto', cpu.some((c) => c[0] === 'cpu_temp') && c1[1][1].some((c) => c[0] === 'gpu_temp'), J(c1));
  check('sin dato -> "—" (FPS sin MangoHud en el HOME temporal)', (c1.find((r) => r[0] === 'fps') || [0, [[0, '']]])[1][0][1] === '—', J(c1));
  const rowsVertical = await ov.ev(`(() => { const r = [...document.querySelectorAll('#rows .row')].map((e) => e.getBoundingClientRect()); return r.every((b, i) => i === 0 || b.top >= r[i - 1].bottom - 1); })()`);
  check('cada fila debajo de la anterior', rowsVertical);

  const look = JSON.parse(await ov.ev(`(() => { const cs = (s) => getComputedStyle(document.querySelector(s));
    const labels = Object.fromEntries([...document.querySelectorAll('.row')].map((r) => [r.dataset.row, getComputedStyle(r.querySelector('.row-label')).color]));
    const v = cs('.cell .v'); const u = cs('.cell .u'); const card = cs('.card');
    return JSON.stringify({ bg: card.backgroundColor, radius: card.borderTopLeftRadius, vColor: v.color, vWeight: v.fontWeight, vSize: parseFloat(v.fontSize),
      uSize: parseFloat(u.fontSize), uColor: u.color, labels, scale: getComputedStyle(document.documentElement).getPropertyValue('--scale').trim(),
      win: [innerWidth, innerHeight], card: [Math.ceil(document.querySelector('.card').getBoundingClientRect().width), Math.ceil(document.querySelector('.card').getBoundingClientRect().height)] }); })()`));
  console.log('INFO  estilo M', J(look));
  check('fondo negro al 85 %', /rgba\(0, 0, 0, 0\.85\)/.test(look.bg), look.bg);
  check('esquinas cuadradas', look.radius === '0px', look.radius);
  check('valores blanco puro y en negrita', look.vColor === 'rgb(255, 255, 255)' && Number(look.vWeight) >= 700, J(look));
  check('M: valor >= 27.5 px (22 x 1.25) y unidad >= 16 px', look.vSize >= 27.5 && look.uSize >= 16, J(look));
  check('etiquetas a color, distinto por fila', new Set(Object.values(look.labels)).size === Object.keys(look.labels).length
    && Object.values(look.labels).every((c) => c !== 'rgb(255, 255, 255)'), J(look.labels));
  check('la ventana se ajusta a la tarjeta (M)', Math.abs(look.win[0] - look.card[0]) <= 2 && Math.abs(look.win[1] - look.card[1]) <= 2, J(look));

  // ---------- 3) tamaño en vivo: XL y S ----------
  const measure = async () => JSON.parse(await ov.ev(`JSON.stringify({ win: [innerWidth, innerHeight], v: parseFloat(getComputedStyle(document.querySelector('.cell .v')).fontSize) })`));
  check('clic real en XL', await click('#ov-scale [data-scale="XL"]'));
  check('XL pulsado', await waitEv(`document.querySelector('#ov-scale [data-scale="XL"]').getAttribute('aria-pressed') === 'true'`));
  check('main recibe scale=XL', await waitFor(async () => (await state()).current.scale === 'XL'));
  check('XL: valor 44 px (22 x 2) sin reiniciar', await waitFor(async () => (await measure()).v === 44));
  check('XL: la ventana crece con la tarjeta', await waitFor(async () => { const m = await measure(); return m.win[0] > look.win[0] * 1.4 && m.win[1] > look.win[1] * 1.4; }), J(await measure()));
  const xl = await measure();
  console.log('INFO  ventana M', J(look.win), 'XL', J(xl.win));
  check('clic real en S', await click('#ov-scale [data-scale="S"]'));
  check('S: valor 22 px y ventana más pequeña que M', await waitFor(async () => { const m = await measure(); return m.v === 22 && m.win[0] < look.win[0]; }), J(await measure()));
  await click('#ov-scale [data-scale="XL"]');
  await waitFor(async () => (await measure()).v === 44);

  // ---------- 4) métricas sueltas en vivo ----------
  check('clic real: desactivar CPU temperatura', await click('#ov-m-cpu_temp'));
  check('la temperatura de CPU desaparece del overlay', await waitFor(async () => !(await cells()).find((r) => r[0] === 'cpu')[1].some((c) => c[0] === 'cpu_temp')));
  check('clic real: activar CPU frecuencia', await click('#ov-m-cpu_freq'));
  check('la frecuencia de CPU aparece (GHz)', await waitFor(async () => (await cells()).find((r) => r[0] === 'cpu')[1].some((c) => c[0] === 'cpu_freq')));
  check('unidad GHz', await ov.ev(`document.querySelector('.cell[data-metric="cpu_freq"] .u').textContent === 'GHz'`));
  for (const m of ['fan', 'fps']) await click(`#ov-m-${m}`);
  check('FAN y FPS desactivados -> sus filas no se pintan', await waitFor(async () => { const r = (await cells()).map((x) => x[0]); return !r.includes('fan') && !r.includes('fps'); }));
  for (const m of ['ram', 'vram']) await click(`#ov-m-${m}`);
  check('RAM y VRAM activadas -> filas propias (GB)', await waitFor(async () => { const r = (await cells()).map((x) => x[0]); return r.includes('ram') && r.includes('vram'); }));
  const ramText = await ov.ev(`document.querySelector('.cell[data-metric="ram"] .v').textContent`);
  check('RAM con número o "—" (nunca 0)', /^\d+\.\d$/.test(ramText) || ramText === '—', ramText);
  check('el aviso de MangoHud ya no menciona ventiladores (FAN apagado)', await waitEv(`document.querySelector('#game-mode-missing').textContent === ''`));
  const saved = JSON.parse(await ev(`localStorage.getItem('overlayPrefs')`));
  check('prefs guardadas: escala XL y métricas elegidas, sin layout/show', saved.scale === 'XL' && saved.metrics.includes('cpu_freq')
    && !saved.metrics.includes('cpu_temp') && !('layout' in saved) && !('show' in saved), J(saved));

  // ---------- 5) modo juego MangoHud refleja métricas y escala (HOME temporal) ----------
  const game0 = JSON.parse(await ev(`window.rog.getGameMode().then((r) => JSON.stringify(r))`));
  if (game0.mangohud) {
    check('clic real en modo juego', await click('#game-mode'));
    check('bloque de modo juego escrito', await waitEv(`window.rog.getGameMode().then((r) => r.enabled)`));
    const conf = readFileSync(path.join(home, '.config', 'MangoHud', 'MangoHud.conf'), 'utf8').split('\n');
    console.log('INFO  MangoHud.conf', J(conf));
    for (const k of ['font_size=48', 'cpu_stats', 'cpu_mhz', 'cpu_temp=0', 'ram', 'vram', 'fps=0', 'background_alpha=0.85']) check(`MangoHud.conf: ${k}`, conf.includes(k));
    check('MangoHud.conf sin exec= ni horizontal', !conf.some((l) => /^exec|^horizontal/.test(l)));
    await click('#ov-scale [data-scale="M"]');
    check('cambiar a M reescribe font_size=30', await waitFor(() => readFileSync(path.join(home, '.config', 'MangoHud', 'MangoHud.conf'), 'utf8').split('\n').includes('font_size=30')));
    await click('#ov-scale [data-scale="XL"]');
    await click('#game-mode');
    check('bloque de modo juego quitado', await waitEv(`window.rog.getGameMode().then((r) => !r.enabled)`));
  } else {
    console.log('INFO  MangoHud no instalado: el mapeo se prueba en unidad (mangohud-block.test.js)');
  }

  // ---------- 6) persistencia: recargar el renderer principal restaura la escala y las métricas ----------
  await ev(`location.reload(), 0`);
  await sleep(3500);
  await ev(noAnim);
  await ev(`document.querySelectorAll('[id*=wizard]').forEach((e) => e.remove()), 0`);
  check('tras recargar, main vuelve a tener scale=XL y las métricas', await waitFor(async () => { const c = (await state()).current; return c.scale === 'XL' && c.metrics.includes('cpu_freq') && !c.metrics.includes('cpu_temp'); }, 6000));
  await click('#overlay-settings');
  await waitEv(`!document.querySelector('#overlay-modal').classList.contains('hidden')`);
  check('tras recargar, el editor marca XL y CPU temp apagada', await ev(`document.querySelector('#ov-scale [data-scale="XL"]').getAttribute('aria-pressed') === 'true' && !document.querySelector('#ov-m-cpu_temp').checked && document.querySelector('#ov-m-cpu_freq').checked`));

  // apagar (deja el arnés limpio)
  await click('#overlay-enabled');
  check('apagar el overlay', await waitFor(async () => (await state()).current.enabled === false));
  try { ov.ws.close(); } catch (_) { /* ya cerrada */ }

  const ok = results.every(Boolean);
  console.log(`\n${results.filter(Boolean).length}/${results.length} PASS`);
  console.log(`RESULT: ${ok ? 'PASS' : 'FAIL'}`);
};
