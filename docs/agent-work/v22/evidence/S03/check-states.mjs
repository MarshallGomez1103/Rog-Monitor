// check-states.mjs — CDP de los estados de panel y la cabecera de sensores (S03-2 · N-A4-03 / N-A4-04).
// Uso:  ROG_APP_ROOT=<raíz del repo/worktree> OUT=<carpeta PNG> TAG=RED|GREEN \
//         node <repo>/.ai/private/rog-v22/tools/cdp.mjs <ruta-absoluta>/check-states.mjs
// Necesita el backend (Python): en un worktree enlaza <worktree>/.venv -> <repo principal>/.venv.
// No manda señales a procesos ni toca el sistema: las muestras se INYECTAN en la página llamando a
// RogWidgetStates.wiring.onStats(s) + update(s) dentro de UNA sola evaluación síncrona (el IPC del
// backend real no puede intercalarse). Las capturas de pantalla usan un "hold" que reinyecta la
// muestra de la prueba cada 40 ms y verifican el estado antes/después de capturar.
// Las transiciones CSS se desactivan durante las aserciones (los estilos calculados son inmediatos).
// Cada aserción imprime PASS/FAIL; al final: RESULT: PASS|FAIL.
// Contrato DOM que verifica (ver docs/agent-work/v22/checkpoints/S03-STATES.md):
//   #<cpu|gpu|fans|system|procs>-block[data-state|data-reason|data-why|data-partial] .widget-empty-msg
//     (.empty-title/.empty-hint/.widget-why), #backend-state[role=status][aria-live=polite][data-level]
//     > #backend-state-text, #backend-meta, #events[role=log], .fan.fan-no-reading, #vram-procs-note
import { mkdirSync } from 'node:fs';

export default async ({ ev, shot, sleep, call }) => {
  const OUT = process.env.OUT || '/tmp/rog-s03-states';
  const TAG = process.env.TAG || 'RUN';
  mkdirSync(OUT, { recursive: true });
  const results = [];
  let cur = '';
  const check = (name, cond, detail = '') => {
    const ok = !!cond;
    results.push(ok);
    console.log(`${ok ? 'PASS' : 'FAIL'}  [${cur}] ${name}${!ok && detail !== '' ? '  -> ' + detail : ''}`);
  };
  const J = (x) => JSON.stringify(x);
  const eq = (a, b) => J(a) === J(b);

  await call('Emulation.setFocusEmulationEnabled', { enabled: true });
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

  // ---------- 0) arranque: secuencia de estados desde el primer instante (observador instalado al crear el documento) ----------
  await call('Page.enable', {});
  const hookId = (await call('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      window.__boot = { seq: {}, hdr: [] };
      const mo = new MutationObserver((recs) => { for (const r of recs) {
        if (r.type === 'attributes') {
          const id = r.target.id; (window.__boot.seq[id] = window.__boot.seq[id] || []).push([r.oldValue, r.target.dataset.state]);
        } else { window.__boot.hdr.push(r.target.nodeType === 3 ? r.target.parentNode.id : r.target.id); } } });
      // se observa el nodo document (existe desde el primer instante): así se ve incluso el loading inicial
      // (un solo observe: un segundo observe del mismo nodo reemplazaría las opciones del primero)
      mo.observe(document, { attributes: true, attributeFilter: ['data-state'], attributeOldValue: true, childList: true, characterData: true, subtree: true });
    })()` })).result?.identifier;
  cur = 'arranque';
  await call('Page.reload', {});
  let boot = null;
  for (let i = 0; i < 60; i++) {
    await sleep(400);
    boot = await ev(`(() => { try { return JSON.stringify({ seq: window.__boot.seq, ready: document.readyState === 'complete' && typeof lastStats !== 'undefined' && !!lastStats }); } catch (e) { return null; } })()`);
    if (boot && JSON.parse(boot).ready) break;
  }
  await ev(`document.querySelectorAll('[id*=wizard]').forEach(e=>e.remove()); 0`);
  if (process.env.DEBUG_BOOT) console.log('BOOT', boot, hookId);
  boot = JSON.parse(boot || '{"seq":{}}');
  const cpuSeq = (boot.seq['cpu-block'] || []).map((p) => p[1]);
  check('el primer estado de CPU es loading (sin muestra todavía)', cpuSeq[0] === 'loading', J(cpuSeq));
  check('la secuencia de CPU hasta la 1.ª muestra no pasa por error/stale/empty', !cpuSeq.some((s) => ['error', 'stale'].includes(s)), J(cpuSeq));
  check('termina en ok/empty tras la 1.ª muestra real', ['ok', 'empty'].includes(cpuSeq[cpuSeq.length - 1]), J(cpuSeq));
  if (hookId) await call('Page.removeScriptToEvaluateOnNewDocument', { identifier: hookId });

  // ---------- helpers dentro de la página ----------
  const INSTALL = `(() => {
    const st = document.createElement('style'); st.id = '__nofx';
    st.textContent = '*,*::before,*::after{transition:none!important;animation:none!important}'; document.head.appendChild(st);
    const px = (c) => { const cv = document.createElement('canvas'); cv.width = cv.height = 1;
      const x = cv.getContext('2d', { willReadFrequently: true }); x.clearRect(0, 0, 1, 1); x.fillStyle = c; x.fillRect(0, 0, 1, 1);
      return [...x.getImageData(0, 0, 1, 1).data]; };
    const over = (f, b) => { const a = f[3] / 255; return [0, 1, 2].map((i) => f[i] * a + b[i] * (1 - a)); };
    const bgOf = (el) => { const L = []; for (let e = el; e; e = e.parentElement) { const c = px(getComputedStyle(e).backgroundColor); L.push(c); if (c[3] === 255) break; }
      let acc = [0, 0, 0]; for (let i = L.length - 1; i >= 0; i--) acc = over(L[i], acc); return acc; };
    const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    const ratio = (fg, bg) => { const a = lum(fg), b = lum(bg); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
    const op = (el) => { let o = 1; for (let e = el; e; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity); return o; };
    const cr = (el) => { const bg = bgOf(el); const f = px(getComputedStyle(el).color); f[3] *= op(el); return ratio(over(f, bg), bg); };
    const BLOCKS = ['cpu', 'gpu', 'fans', 'system', 'procs'];
    const base = JSON.parse(JSON.stringify(lastStats));
    const S = {
      base: () => JSON.parse(JSON.stringify(base)),
      fresh: (o) => Object.assign(S.base(), { ts: Date.now() / 1000 }, o || {}),
      // forma exacta de _cpu_unavailable / _gpu_unavailable / _sys_unavailable / _vram_unavailable (src/rog_monitor/app.py)
      cpuNull: () => ({ model: null, cores: [], core_grid: [], usage: null, iowait: null, steal: null, avg: null, max: null, min: null,
        package: null, hot90: null, freq_ghz: null, governor: null, driver: null, epp: null, throttle_count: null, throttle_ms: null,
        throttle_delta: 0, throttle_ms_delta: 0, throttled_now: false }),
      gpuNull: () => ({ mode: null, pending: null, pending_action: null, supported: [], active: null }),
      sysNull: () => ({ ram_total_gb: null, ram_used_gb: null, ram_percent: null, ram_available_gb: null, ram_buffers_gb: null, ram_cached_gb: null,
        swap_used_gb: null, swap_total_gb: null, swap_percent: null, rx_mbps: null, tx_mbps: null, disks: [], disk_io: [], nvme_temps: [],
        smart_block_devices: [], load: null, uptime_s: null, uptime_h: null, dmi: {} }),
      allNull: () => S.fresh({ cpu: S.cpuNull(), gpu: S.gpuNull(), sys: S.sysNull(), fans: [], procs: [], battery: null, aura: null,
        procs_vram: { available: false, reason: 'lector no disponible', reason_code: 'reader_unavailable', vendor: null, procs: [] }, events: [] }),
      put: (snap, n) => { for (let i = 0; i < (n || 2); i++) { S.W.onStats(snap); update(snap); } },
      hold: (snap, down) => { S.release(); S.timer = setInterval(() => { if (down) { S.W.onBackendDown(); S.f.down(); } else S.put(snap, 1); }, 40); },
      release: () => { clearInterval(S.timer); S.timer = null; },
      mo: null, recs: [],
      watch: () => { if (!S.mo) { S.mo = new MutationObserver((r) => { S.recs.push(...r); });
          BLOCKS.forEach((b) => S.mo.observe(document.getElementById(b + '-block'), { attributes: true, attributeFilter: ['data-state'], attributeOldValue: true }));
          S.mo.observe(document.getElementById('backend-state-text') || document.getElementById('backend-state'), { childList: true, characterData: true, subtree: true }); }
        S.mo.takeRecords(); S.recs.length = 0; },
      // secuencia de data-state por bloque y nº de cambios de texto de la región viva desde el último watch()
      drain: () => { S.recs.push(...S.mo.takeRecords()); const seq = {}; BLOCKS.forEach((b) => { seq[b] = []; });
        let announce = 0;
        for (const r of S.recs) { if (r.type === 'attributes') { const id = r.target.id.replace('-block', ''); seq[id].push(r.oldValue); } else announce++; }
        BLOCKS.forEach((b) => { seq[b].push(document.getElementById(b + '-block').dataset.state); });
        S.recs.length = 0; return { seq, announce }; },
      read: () => {
        const blocks = {};
        BLOCKS.forEach((b) => {
          const el = document.getElementById(b + '-block'); const msg = el.querySelector('.widget-empty-msg');
          const why = el.querySelector('.widget-why'); const h2 = el.querySelector('h2');
          blocks[b] = { state: el.dataset.state, reason: el.dataset.reason || null, model: el.dataset.modelState, partial: el.dataset.partial || null,
            why: el.dataset.why || null, action: el.dataset.action || null, busy: el.getAttribute('aria-busy'),
            title: msg && msg.querySelector('.empty-title') ? msg.querySelector('.empty-title').textContent : null,
            hint: msg && msg.querySelector('.empty-hint') ? msg.querySelector('.empty-hint').textContent : null,
            msgShown: msg ? getComputedStyle(msg).display !== 'none' : null, msgAria: msg ? msg.getAttribute('aria-hidden') : null,
            whyShown: why ? getComputedStyle(why).display !== 'none' : null,
            h2Opacity: h2 ? +getComputedStyle(h2).opacity : null, chipShown: getComputedStyle(el.querySelector('.widget-error-chip')).display !== 'none' };
        });
        const hs = document.getElementById('backend-state'); const tx = document.getElementById('backend-state-text') || hs; const mt = document.getElementById('backend-meta');
        const ids = ['cpu-temp', 'cpu-util', 'cpu-max', 'cpu-pkg', 'cpu-hot', 'cpu-freq', 'cpu-throttle', 'cpu-uptime', 'net', 'load', 'ram-label', 'battery', 'power-source',
          'gpu-temp', 'gpu-util', 'thermal-label'];
        const f = {}; ids.forEach((i) => { f[i] = document.getElementById(i).textContent.trim(); });
        const fans = [...document.querySelectorAll('#fans .fan')].map((x) => ({ rpm: x.querySelector('.rpm').textContent, pct: x.querySelector('.pct').textContent,
          stopped: x.classList.contains('fan-is-stopped'), noread: x.classList.contains('fan-no-reading') }));
        return { blocks, f, fans, body: { stale: document.body.classList.contains('stale') },
          hdr: { text: tx.textContent, level: hs.dataset.level, role: hs.getAttribute('role'), live: hs.getAttribute('aria-live'), atomic: hs.getAttribute('aria-atomic'),
            meta: mt ? mt.textContent : '' },
          events: { role: document.getElementById('events').getAttribute('role'), live: document.getElementById('events').getAttribute('aria-live') } };
      },
      cr, op, BLOCKS,
      crOf: (sel) => { const e = document.querySelector(sel); return e ? cr(e) : null; },
    };
    // Enganches tolerantes: en una base anterior a S03-2 no existen (así la prueba falla por comportamiento, no por excepción)
    S.W = (window.RogWidgetStates && RogWidgetStates.wiring) || { onStats() {}, onBackendDown() {} };
    S.f = {
      down: typeof onBackendDown === 'function' ? onBackendDown : () => {},
      reconnecting: () => { if (typeof renderHeader === 'function') { backendReconnecting = true; renderHeader(lastStats); } },
      staleTick: typeof staleTick === 'function' ? staleTick : () => {},
      vram: typeof fillVramModal === 'function' ? fillVramModal : () => { openVramModal(); },
    };
    window.__s = S;
    return 1;
  })()`;
  await ev(INSTALL);
  await ev(`i18n.set('es'); 0`);
  // una excepción de la página (p. ej. update() con todo-null en una base vieja) cuenta como FALLO, no aborta la prueba
  const sect = async (name, fn) => { try { await fn(); } catch (e) { check(`${name} no lanza`, false, String(e).slice(0, 200)); } };
  const run = async (expr) => {
    const res = JSON.parse(await ev(`JSON.stringify((() => { try { ${expr} } catch (e) { return { __err: String(e && e.stack || e).split('\\n').slice(0, 2).join(' | ') }; } })())`) || '{"__err":"sin resultado"}');
    if (res && res.__err) throw new Error(res.__err);
    return res;
  };

  const setLook = async (theme, mode) => {
    await ev(`localStorage.setItem('theme', ${J(theme)}); localStorage.setItem('mode', ${J(mode)}); applyAppearance(); 0`);
    await sleep(120);
  };
  const UNSET = (r) => ['--', '—', '↓-- ↑-- Mb/s', '--/-- GiB'].includes(r);
  const FALSE_ZERO = /^(0|0%|0\.0|0°|0m|↓0\.0 ↑0\.0 Mb\/s|0\.0\/0 GiB)$/;

  // ---------- recorte de capturas (solo el elemento; nunca la ventana entera) ----------
  // 'A|B' = unión de dos elementos (la barra se recorta a estado+meta: #versions muestra rutas locales)
  const clipOf = async (sel, pad = 6) => {
    const r = await run(`const els = ${J(sel)}.split('|').map((q) => document.querySelector(q)); if (els.some((e) => !e)) return null; els[0].scrollIntoView({ block: 'center' });
      const bs = els.map((e) => e.getBoundingClientRect()); const x0 = Math.min(...bs.map((b) => b.left)), y0 = Math.min(...bs.map((b) => b.top));
      const x1 = Math.max(...bs.map((b) => b.right)), y1 = Math.max(...bs.map((b) => b.bottom));
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, sx: window.scrollX, sy: window.scrollY };`);
    return r ? { x: Math.max(0, r.x + r.sx - pad), y: Math.max(0, r.y + r.sy - pad), width: r.w + pad * 2, height: r.h + pad * 2 } : null;
  };
  // captura de varios elementos con el estado "sostenido": reinyecta cada 40 ms (o mantiene «caído»), verifica que el
  // estado pedido sigue ahí antes y después de capturar y reintenta si un tick real lo pisó
  const holdShots = async (prefix, sels, snap, wantExpr, opts = {}) => {
    for (let k = 0; k < 5; k++) {
      await ev(`__s.hold(${J(snap)}, ${!!opts.down}); 0`);
      await sleep(160);
      const before = await ev(wantExpr);
      for (const [name, sel, pad] of sels) {
        const clip = await clipOf(sel, pad == null ? 4 : pad);
        if (clip) await shot(`${OUT}/${TAG}-${prefix}-${name}.png`, clip);
      }
      const after = await ev(wantExpr);
      await ev(`__s.release(); 0`);
      if (before && after) return true;
    }
    console.log(`WARN  captura ${prefix}: el estado no se mantuvo`);
    return false;
  };

  const LOOKS = [['neon', 'dark'], ['magma', 'dark'], ['magma', 'light']];
  for (const [theme, mode] of LOOKS) {
    const tag = `${theme}-${mode}`;
    cur = tag;
    await setLook(theme, mode);
    await ev(`__s.release(); 0`);
    let r;

    // ===== 1) TODO NULL (forma de _cpu_unavailable/_sys_unavailable): el lector cayó, no el hardware =====
    await sect('TODO NULL (forma de _cpu_unavailable/_sys_unavai', async () => {

    r = await run(`__s.watch(); __s.put(__s.allNull(), 2); return { r: __s.read(), d: __s.drain() };`);
    const B = r.r.blocks;
    check('todo-null: CPU empty/reader_unavailable (no «sin sensor» de hardware)', B.cpu.state === 'empty' && B.cpu.reason === 'reader_unavailable', J(B.cpu));
    check('todo-null: GPU con mode null => empty/unknown y NO dice «dGPU apagada»', B.gpu.state === 'empty' && B.gpu.reason === 'unknown' && !/apagad|off|Integrated/i.test(B.gpu.title || ''), J(B.gpu));
    check('todo-null: fans [] => empty/no_fans, sistema => reader_unavailable, procs => no_data',
      B.fans.reason === 'no_fans' && B.system.reason === 'reader_unavailable' && B.procs.reason === 'no_data', J([B.fans.reason, B.system.reason, B.procs.reason]));
    check('todo-null: cada aviso es visible, con título y pista distintos del texto de otro motivo',
      ['cpu', 'gpu', 'fans', 'system', 'procs'].every((b) => B[b].msgShown && B[b].title && B[b].hint && B[b].msgAria === 'false'), J(Object.fromEntries(Object.entries(B).map(([k, v]) => [k, [v.msgShown, v.title, v.msgAria]]))));
    check('todo-null: textos por motivo (CPU lector / sistema lector / procesos vacíos)',
      /CPU/i.test(B.cpu.title) && B.system.title !== B.cpu.title && B.procs.title !== B.fans.title, J([B.cpu.title, B.system.title, B.procs.title, B.fans.title]));
    check('todo-null: «Ver diagnóstico» solo donde hay algo que diagnosticar (CPU/GPU/sistema sí; procesos vacíos y fans sin hardware no)',
      B.cpu.whyShown && B.gpu.whyShown && B.system.whyShown && !B.procs.whyShown && !B.fans.whyShown, J(['cpu', 'gpu', 'system', 'procs', 'fans'].map((b) => B[b].whyShown)));
    check('todo-null: ningún campo muestra un 0 falso (todos sin dato)', Object.entries(r.r.f).filter(([k]) => !['thermal-label', 'gpu-temp', 'gpu-util', 'cpu-temp'].includes(k)).every(([, v]) => UNSET(v) && !FALSE_ZERO.test(v)),
      J(r.r.f));
    check('todo-null: hot90, throttle, uptime, red, carga, RAM en «--»', r.r.f['cpu-hot'] === '--' && r.r.f['cpu-throttle'] === '--' && r.r.f['cpu-uptime'] === '--' && r.r.f.net === '↓-- ↑-- Mb/s' && r.r.f.load === '--' && r.r.f['ram-label'] === '--/-- GiB', J(r.r.f));
    check('todo-null: fuente de energía desconocida («—»), no «Batería»', r.r.f['power-source'] === '—', r.r.f['power-source']);
    check('todo-null: cabecera = sensores parciales (nivel warn) y NO «sensores OK»', r.r.hdr.level === 'warn' && /parcial|partial|partiel|parzial|parciais|部分|一部|일부/i.test(r.r.hdr.text) && !/OK|正常/.test(r.r.hdr.text), J(r.r.hdr));
    check('cabecera: #backend-state role=status aria-live=polite aria-atomic', r.r.hdr.role === 'status' && r.r.hdr.live === 'polite' && r.r.hdr.atomic === 'true', J(r.r.hdr));
    check('#events es role=log (sin re-anunciar toda la lista)', r.r.events.role === 'log' && r.r.events.live === 'off', J(r.r.events));
    check('todo-null: la cabecera anuncia UNA vez (ok->parcial = 1 cambio de texto en 2 muestras)', r.d.announce <= 1, String(r.d.announce));
    // contraste de los textos del aviso (opacidad de ancestros incluida)
    const crT = await run(`return { t: __s.crOf('#cpu-block .widget-empty-msg .empty-title'), h: __s.crOf('#cpu-block .widget-empty-msg .empty-hint'),
      hd: __s.crOf('#backend-state-text'), m: __s.crOf('#backend-meta') };`);
    check('contraste ≥ 4.5 del título del aviso y de la cabecera', crT.t >= 4.5 && crT.hd >= 4.5, J(crT));
    check('contraste ≥ 4.5 de la pista y del meta (texto atenuado)', crT.h >= 4.5 && crT.m >= 4.5, J(crT));
    await holdShots(`todo-null-${tag}`, [['cpu', '#cpu-block'], ['gpu', '#gpu-block'], ['fans', '#fans-block'], ['sistema', '#system-block'], ['procesos', '#procs-block']],
      await run(`return __s.allNull();`), `(() => ['cpu','fans','system','procs'].every((b) => document.getElementById(b + '-block').dataset.state === 'empty'))()`);
    await holdShots(`cabecera-parcial-${tag}`, [['barra', '#backend-state|#backend-meta', 8]], await run(`return __s.allNull();`), `(() => document.getElementById('backend-state').dataset.level === 'warn')()`);
    });

    // ===== 2) GPU: modo conocido vs desconocido (atribución) =====
    await sect('GPU: modo conocido vs desconocido (atribución) =', async () => {

    r = await run(`__s.put(__s.fresh({ gpu: { mode: 'Integrated', pending: null, pending_action: null, supported: ['Integrated','Hybrid'], active: null } }), 2); return __s.read().blocks.gpu;`);
    check('GPU Integrated sin activa => unsupported (CSS propio, no empty) y SÍ dice apagada', r.state === 'unsupported' && r.model === 'unsupported' && /apagad|off/i.test(r.title || '') && r.msgShown, J(r));
    check('GPU unsupported: el aviso es visible y el contenido del bloque queda oculto', r.msgShown && r.h2Opacity === 0, J(r));
    r = await run(`__s.put(__s.fresh({ gpu: { mode: 'error', pending: null, pending_action: null, supported: [], active: null } }), 2); return __s.read().blocks.gpu;`);
    check('GPU mode «error» NO se atribuye a hardware (empty/unknown, sin «apagada»)', r.state === 'empty' && r.reason === 'unknown' && !/apagad|off|integrated/i.test(r.title || ''), J(r));
    r = await run(`__s.put(__s.fresh({ gpu: { mode: '', pending: null, pending_action: null, supported: [], active: null } }), 2); return __s.read().blocks.gpu;`);
    check('GPU mode vacío => empty/unknown', r.state === 'empty' && r.reason === 'unknown', J(r));
    });

    // ===== 3) CPU sin temperatura pero con uso: aviso en línea que NO tapa los datos válidos =====
    await sect('CPU sin temperatura pero con uso: aviso en línea', async () => {

    r = await run(`const s = __s.fresh(); s.cpu.avg = null; s.cpu.max = null; s.cpu.min = null; s.cpu.package = null; s.cpu.cores = []; __s.put(s, 2); const x = __s.read(); x.cpuUtilOpacity = +getComputedStyle(document.getElementById('cpu-util')).opacity * +getComputedStyle(document.getElementById('cpu-util').parentElement.parentElement).opacity; return x;`);
    check('CPU sin temperatura => empty/no_temp con data-partial y el uso sigue legible', r.blocks.cpu.reason === 'no_temp' && r.blocks.cpu.partial === '1' && r.cpuUtilOpacity > 0.3, J([r.blocks.cpu.reason, r.blocks.cpu.partial, r.cpuUtilOpacity]));
    check('CPU sin temperatura: no ofrece «diagnóstico» (no hay nada roto)', !r.blocks.cpu.whyShown, J(r.blocks.cpu));
    });

    // ===== 4) 0 LEGÍTIMO: nunca cambia de estado ni se cambia por «--» =====
    await sect('0 LEGÍTIMO: nunca cambia de estado ni se cambia ', async () => {

    r = await run(`const s = __s.fresh(); s.cpu.usage = 0; s.cpu.hot90 = 0; s.cpu.throttle_count = 0; s.sys.rx_mbps = 0; s.sys.tx_mbps = 0; s.sys.uptime_s = 0; s.sys.swap_used_gb = 0;
      s.fans = [{ label: 'cpu_fan', rpm: 0, percent: 0, max: 6000 }, { label: 'gpu_fan', rpm: null, percent: null }];
      s.battery = Object.assign({}, s.battery || {}, { capacity: 0, on_ac: false, status: 'Discharging', watts: 0 });
      __s.put(s, 3); return __s.read();`);
    check('0 legítimo: CPU, ventiladores, sistema y procesos siguen en ok (no pasan a empty por tener 0)', ['cpu', 'fans', 'system', 'procs'].every((b) => r.blocks[b].state === 'ok'), J(Object.fromEntries(Object.entries(r.blocks).map(([k, v]) => [k, v.state]))));
    check('0 legítimo: uso 0%, >90 °C = 0, throttle 0, red ↓0.0 ↑0.0, uptime 0m', r.f['cpu-util'] === '0%' && r.f['cpu-hot'] === '0' && r.f['cpu-throttle'] === '0' && r.f.net === '↓0.0 ↑0.0 Mb/s' && r.f['cpu-uptime'] === '0m', J(r.f));
    check('0 legítimo: fuente «batería» (on_ac false real) con 0 %', /bater/i.test(r.f['power-source']), r.f['power-source']);
    check('ventilador rpm 0 => PARADO real (fan-is-stopped); rpm null => sin lectura, NO parado', r.fans[0].stopped && !r.fans[0].noread && r.fans[0].rpm === '0' && !r.fans[1].stopped && r.fans[1].noread && r.fans[1].rpm === '--' && r.fans[1].pct === '--', J(r.fans));
    check('0 legítimo: cabecera «sensores OK» (nivel ok)', r.hdr.level === 'ok' && /OK|正常|bon|ok/i.test(r.hdr.text), J(r.hdr));
    });

    // ===== 5) STALE: 5,9 s no / 6,1 s sí; un solo anuncio =====
    await sect('STALE: 5,9 s no / 6,1 s sí; un solo anuncio ====', async () => {

    r = await run(`__s.put(__s.fresh({ ts: Date.now() / 1000 - 5.9 }), 2); const a = __s.read(); __s.put(__s.fresh(), 1);
      __s.watch(); __s.put(__s.fresh({ ts: Date.now() / 1000 - 6.1 }), 1); const b = __s.read(); const d1 = __s.drain();
      lastStatsAt = Date.now() - 9000; for (let i = 0; i < 4; i++) { __s.f.staleTick(); } const c = __s.read(); const d2 = __s.drain();
      return { a, b, c, d1, d2 };`);
    check('stale: a 5,9 s todos siguen ok y la cabecera es «OK»', ['cpu', 'gpu', 'fans', 'system', 'procs'].every((x) => r.a.blocks[x].state !== 'stale') && r.a.hdr.level === 'ok', J(r.a.hdr));
    check('stale: a 6,1 s los 5 bloques pasan a stale', ['cpu', 'gpu', 'fans', 'system', 'procs'].every((x) => r.b.blocks[x].state === 'stale'), J(Object.values(r.b.blocks).map((v) => v.state)));
    check('stale: cabecera «Sin datos recientes» (warn) con los segundos solo en #backend-meta', r.b.hdr.level === 'warn' && /recientes|recent|récentes|recente|最新|최근/i.test(r.b.hdr.text) && /\d/.test(r.b.hdr.meta) && !/\d/.test(r.b.hdr.text), J(r.b.hdr));
    check('stale: lámpara «SIN DATOS · N s» y body.stale por reloj de llegada', r.c.body.stale && /\d/.test(r.c.f['thermal-label']), J([r.c.body, r.c.f['thermal-label']]));
    check('stale anunciado UNA vez: 4 ticks seguidos no cambian el texto de la región viva', r.d1.announce === 1 && r.d2.announce === 0, J([r.d1.announce, r.d2.announce]));
    check('stale: los chips de error NO se anuncian (aria-hidden) y no hay chip visible', Object.values(r.b.blocks).every((v) => !v.chipShown), J(Object.values(r.b.blocks).map((v) => v.chipShown)));
    {
      const staleSnap = await run(`return __s.fresh({ ts: Date.now() / 1000 - 8 });`);
      await holdShots(`stale-${tag}`, [['cpu', '#cpu-block'], ['barra', '#backend-state|#backend-meta', 8]], staleSnap, `(() => document.getElementById('cpu-block').dataset.state === 'stale')()`);
    }
    });

    // ===== 6) BACKEND CAÍDO -> reconexión =====
    await sect('BACKEND CAÍDO -> reconexión =====', async () => {

    r = await run(`__s.put(__s.fresh(), 2); __s.watch();
      __s.W.onBackendDown(); __s.f.down();
      const down = __s.read(); __s.f.reconnecting(); const down2 = __s.read(); const d1 = __s.drain();
      __s.watch(); __s.put(__s.fresh(), 1); const up = __s.read(); const d2 = __s.drain();
      return { down, down2, up, d1, d2 };`);
    check('caído: los 5 bloques en error con chip visible', ['cpu', 'gpu', 'fans', 'system', 'procs'].every((x) => r.down.blocks[x].state === 'error' && r.down.blocks[x].chipShown), J(Object.values(r.down.blocks).map((v) => [v.state, v.chipShown])));
    check('caído: cabecera «backend caído» (nivel error)', r.down.hdr.level === 'error' && /ca[ií]do|down|hors|giù|停止|다운/i.test(r.down.hdr.text), J(r.down.hdr));
    check('caído + «reconectando» = UN solo anuncio (mismo estado, mismo texto)', r.d1.announce === 1 && r.down.hdr.text === r.down2.hdr.text, J([r.d1.announce, r.down.hdr.text, r.down2.hdr.text]));
    check('reconexión: error -> ok directo en todos los bloques (sin loading/empty/stale intermedios)',
      Object.values(r.d2.seq).every((s) => eq(s, ['error', 'ok'])), J(r.d2.seq));
    check('reconexión: cabecera vuelve a OK con UN anuncio', r.up.hdr.level === 'ok' && r.d2.announce === 1, J([r.up.hdr, r.d2.announce]));
    r = await run(`__s.put(__s.fresh(), 2); __s.put(__s.fresh({ ts: Date.now() / 1000 - 7 }), 1); __s.watch(); __s.put(__s.fresh(), 1); const up = __s.read(); const d = __s.drain(); return { up, d };`);
    check('stale -> ok al reconectar: secuencia exacta [stale, ok] por bloque, sin destellos', Object.values(r.d.seq).every((s) => eq(s, ['stale', 'ok'])), J(r.d.seq));
    check('stale -> ok: cabecera vuelve a «OK» con UN anuncio', r.up.hdr.level === 'ok' && r.d.announce === 1, J([r.up.hdr.level, r.d.announce]));
    {
      await run(`__s.put(__s.fresh(), 2); return 1;`);
      await holdShots(`caido-${tag}`, [['cpu', '#cpu-block'], ['barra', '#backend-state|#backend-meta', 8]], null, `(() => document.getElementById('cpu-block').dataset.state === 'error')()`, { down: true });
      await run(`__s.put(__s.fresh(), 2); return 1;`);
    }
    });

    // ===== 7) una sola muestra vacía suelta no parpadea; dos seguidas sí se muestran =====
    await sect('una sola muestra vacía suelta no parpadea; dos s', async () => {

    r = await run(`__s.put(__s.fresh(), 2); __s.watch(); __s.put(__s.fresh({ procs: [] }), 1); const one = __s.read().blocks.procs.state; __s.put(__s.fresh(), 1);
      const back = __s.read().blocks.procs.state; __s.put(__s.fresh({ procs: [] }), 2); const two = __s.read().blocks.procs.state; __s.put(__s.fresh(), 1); return { one, back, two, d: __s.drain() };`);
    check('antidestello: 1 muestra vacía suelta se retiene (ok); 2 seguidas => empty; recuperar es inmediato', r.one === 'ok' && r.back === 'ok' && r.two === 'empty', J(r));
    });
  }

  // ---------- 8) razones de VRAM por código (en español y con el texto fijo del backend como trampa) ----------
  await sect('razones de VRAM por código (en español y co', async () => {

  cur = 'vram';
  const CODES = ['warming_up', 'no_nvidia', 'dgpu_asleep', 'dgpu_inactive', 'nvml_error', 'smi_error', 'no_nvidia_tools', 'reader_unavailable'];
  await ev(`i18n.set('es'); 0`);
  for (const code of CODES) {
    const v = await run(`lastStats = Object.assign({}, lastStats, { procs_vram: { available: false, reason: 'TEXTO-FIJO-DEL-BACKEND', reason_code: ${J(code)}, vendor: null, procs: [] } });
      __s.f.vram(); return { note: document.getElementById('vram-procs-note').textContent, row: document.getElementById('vram-procs-body').textContent.trim(),
        retry: !document.getElementById('vram-retry').classList.contains('hidden') };`);
    check(`vram ${code}: texto traducido por código (no el reason fijo) y pista en la tabla`, v.note && !/TEXTO-FIJO/.test(v.note + v.row) && v.row.length > 8 && !/^vram\./.test(v.note), J(v));
    check(`vram ${code}: «Reintentar» solo en errores recuperables`, v.retry === ['nvml_error', 'smi_error', 'reader_unavailable'].includes(code), String(v.retry));
  }
  {
    const v = await run(`lastStats = Object.assign({}, lastStats, { procs_vram: { available: false, reason: 'respaldo del backend', reason_code: 'codigo_nuevo', procs: [] } }); __s.f.vram();
      return document.getElementById('vram-procs-note').textContent;`);
    check('vram: código desconocido => usa el reason del backend como respaldo', v === 'respaldo del backend', v);
  }
  await ev(`document.getElementById('vram-modal').classList.add('hidden'); 0`);
  });

  // ---------- 9) aura null != «instala asusctl» ----------
  await sect('aura null != «instala asusctl» ----------', async () => {

  cur = 'aura';
  {
    const a = await run(`const real = auraState; renderAura(null); const reader = document.getElementById('aura-note').textContent;
      renderAura({ available: false }); const none = document.getElementById('aura-note').textContent; lastAuraSig = null; if (real) renderAura(real); return { reader, none, noRgb: t('aura.no_rgb'), readerKey: t('aura.reader_error') };`);
    check('aura null (lector caído) muestra «no se pudo leer», no «instala asusctl»', a.reader === a.readerKey && !/Instala asusctl|Install asusctl/.test(a.reader), J(a));
    check('aura {available:false} (sin controladores) conserva el mensaje de instalación (solo texto)', a.none === a.noRgb, J(a));
  }
  });

  // ---------- 10) 8 idiomas: todas las claves nuevas traducidas ----------
  await sect(' 8 idiomas: todas las claves nuevas traduci', async () => {

  cur = 'i18n';
  {
    const keys = await run(`return Object.keys(i18n.dump()).filter((k) => /^(vram\\.|status\\.(ok|partial|stale|reconnecting)|widget\\.(cpu_|fans_|sys_|procs_|fan_|why))/.test(k));`);
    const langs = ['es', 'en', 'fr', 'it', 'pt', 'zh', 'ja', 'ko'];
    let bad = [];
    for (const L of langs) {
      const miss = await run(`i18n.set(${J(L)}); const m = ${J(keys)}.filter((k) => { const v = t(k, { list: 'x' }); return !v || v === k; }); return m;`);
      if (miss.length) bad.push(L + ':' + miss.join(','));
    }
    check(`${keys.length} claves nuevas resuelven en los 8 idiomas`, keys.length >= 35 && !bad.length, bad.join(' | '));
    const diff = await run(`const out = {}; ['es','en','fr','it','pt','zh','ja','ko'].forEach((L) => { i18n.set(L); out[L] = t('status.partial', { list: 'CPU' }); }); i18n.set('es'); return out;`);
    check('status.partial distinto en cada idioma (traducciones reales, no copias del inglés)', new Set(Object.values(diff)).size === 8, J(diff));
  }
  });

  // ---------- 11) barrido de contraste en los 12 temas x 2 modos (aviso vacío + cabecera) ----------
  await sect(' barrido de contraste en los 12 temas x 2 m', async () => {

  cur = 'contraste-12-temas';
  {
    const themes = ['magma', 'nebula', 'oceano', 'glaciar', 'reactor', 'grafito', 'neon', 'atardecer', 'neon-nights', 'cyberpunk', 'aurora', 'alba'];
    const worst = { title: 99, hint: 99, hdr: 99, meta: 99, why: 99 };
    let at = {};
    for (const th of themes) for (const mo of ['dark', 'light']) {
      await setLook(th, mo);
      const m = await run(`__s.put(__s.allNull(), 2); const why = document.querySelector('#cpu-block .widget-why');
        return { title: __s.crOf('#cpu-block .widget-empty-msg .empty-title'), hint: __s.crOf('#cpu-block .widget-empty-msg .empty-hint'), hdr: __s.crOf('#backend-state-text'), meta: __s.crOf('#backend-meta'), why: why ? __s.cr(why) : null };`);
      for (const k of Object.keys(worst)) if (m[k] != null && m[k] < worst[k]) { worst[k] = m[k]; at[k] = `${th}/${mo}`; }
    }
    check('contraste mínimo del título del aviso ≥ 4.5 en 12 temas x 2 modos', worst.title >= 4.5, `${worst.title.toFixed(2)} ${at.title}`);
    check('contraste mínimo de la pista del aviso ≥ 4.5', worst.hint >= 4.5, `${worst.hint.toFixed(2)} ${at.hint}`);
    check('contraste mínimo de la cabecera y su meta ≥ 4.5', worst.hdr >= 4.5 && worst.meta >= 4.5, `${worst.hdr.toFixed(2)} ${at.hdr} / ${worst.meta.toFixed(2)} ${at.meta}`);
    check('contraste mínimo del botón «Ver diagnóstico» ≥ 4.5', worst.why >= 4.5, `${worst.why.toFixed(2)} ${at.why}`);
    console.log(`INFO  contrastes mínimos: ${J(Object.fromEntries(Object.entries(worst).map(([k, v]) => [k, +v.toFixed(2)])))}`);
    await setLook('magma', 'dark');
  }
  });

  // ---------- 12) «Ver diagnóstico» abre el diagnóstico existente (clic real) ----------
  await sect(' «Ver diagnóstico» abre el diagnóstico exis', async () => {

  cur = 'accion';
  {
    await run(`__s.put(__s.allNull(), 2); document.getElementById('cpu-block').scrollIntoView({ block: 'center' }); return 1;`);
    const b = await run(`const e = document.querySelector('#cpu-block .widget-why'); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };`);
    check('el botón tiene área ≥ 24 px de alto', b.h >= 24, J(b));
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.x, y: b.y });
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: b.x, y: b.y, button: 'left', clickCount: 1 });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', clickCount: 1 });
    await sleep(400);
    const opened = await ev(`!document.getElementById('diag-modal')?.classList.contains('hidden')`);
    check('clic real en «Ver diagnóstico» abre el modal de diagnóstico', opened === true, String(opened));
    await ev(`document.getElementById('diag-close')?.click(); 0`);
    await run(`__s.put(__s.fresh(), 2); return 1;`);
  }
  });

  const fails = results.filter((x) => !x).length;
  console.log(`\n${results.length - fails}/${results.length} aserciones OK`);
  console.log(`RESULT: ${fails ? 'FAIL' : 'PASS'}`);
};
