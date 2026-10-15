// Mide estilos estables: sin transiciones/animaciones CSS (se reinyecta tras cada recarga).
const NOANIM = `(()=>{if(!document.getElementById('cdp-noanim')){const s=document.createElement('style');s.id='cdp-noanim';s.textContent='*,*::before,*::after{transition:none!important;animation:none!important}';document.head.appendChild(s)}})();`;
// check-editor2.mjs — CDP del editor de gráficas del historial (S02-2 · N-A3-01/02 + F4-09 corte editor; «expandir» retirado en UIFIX-01).
// Uso:  ROG_APP_ROOT=<raíz del repo/worktree> OUT=<carpeta PNG> TAG=RED|GREEN \
//         node <repo>/.ai/private/rog-v22/tools/cdp.mjs <ruta-absoluta>/check-editor2.mjs
// Necesita el backend (Python): en un worktree enlaza <worktree>/.venv -> <repo principal>/.venv.
// Teclas REALES (Input.dispatchKeyEvent) y clics REALES de ratón (Input.dispatchMouseEvent).
// El arrastre (sección C) usa el ratón REAL de CDP: mousePressed en el asa, mouseMoved en pasos y
// mouseReleased sobre la fila destino (Pointer Events, UIFIX-01). Cobertura detallada: check-drag-mouse.mjs.
// Cada aserción imprime PASS/FAIL; al final: RESULT: PASS|FAIL.
// Contrato DOM que verifica (ver docs/agent-work/v22/checkpoints/S02-EDITOR.md):
//   #hist-editor .hist-edit-row[data-key] { .hist-edit-grip, input[data-act=toggle], button[data-act=up|down] }
//   .hist-edit-presets [data-act=preset][data-preset][aria-pressed]
import { mkdirSync } from 'node:fs';

export default async ({ ev: evRaw, shot, sleep, call }) => {
  const ev = (expr) => evRaw(NOANIM + expr);
  const OUT = process.env.OUT || '/tmp/rog-s02-editor';
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
  const TEMP = ['cpu_temp', 'cpu_power', 'gpu_temp', 'gpu_power'];
  const USAGE = ['cpu_usage', 'ram_gb', 'swap_gb', 'gpu_util'];

  await call('Emulation.setFocusEmulationEnabled', { enabled: true });

  // ---------- helpers dentro de la página (se reinstalan tras cada recarga) ----------
  const INSTALL = `(() => {
    const px = (c) => { const cv = document.createElement('canvas'); cv.width = cv.height = 1;
      const x = cv.getContext('2d', { willReadFrequently: true }); x.clearRect(0, 0, 1, 1); x.fillStyle = c; x.fillRect(0, 0, 1, 1);
      return [...x.getImageData(0, 0, 1, 1).data]; };
    const over = (f, b) => { const a = f[3] / 255; return [0, 1, 2].map((i) => f[i] * a + b[i] * (1 - a)); };
    const bgOf = (el) => { const L = []; for (let e = el; e; e = e.parentElement) { const c = px(getComputedStyle(e).backgroundColor); L.push(c); if (c[3] === 255) break; }
      let acc = [0, 0, 0]; for (let i = L.length - 1; i >= 0; i--) acc = over(L[i], acc); return acc; };
    const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    const ratio = (fg, bg) => { const a = lum(fg), b = lum(bg); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
    window.__h = {
      px,
      // la opacidad (propia y de los ancestros) cuenta: un icono al 30 % no es un icono legible
      op: (el) => { let o = 1; for (let e = el; e; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity); return o; },
      cr: (el) => { const bg = bgOf(el); const f = px(getComputedStyle(el).color); f[3] *= window.__h.op(el); return ratio(over(f, bg), bg); },
      crVar: (v, el) => { const bg = bgOf(el); return ratio(over(px(getComputedStyle(document.documentElement).getPropertyValue(v).trim()), bg), bg); },
      acc: () => px(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()),
      act: () => { const e = document.activeElement; if (!e) return null; const k = e.closest && e.closest('[data-key]');
        const d = e.dataset || {};
        return (k ? k.dataset.key : (d.chart ? 'chart:' + d.chart : '')) + '|' + (d.act || e.id || e.tagName) + (d.preset ? ':' + d.preset : ''); },
      st: () => ({ list: histList.slice(), ls: localStorage.getItem('histCharts'),
        canv: [...document.querySelectorAll('#history-block .chart canvas')].map((c) => c.id.replace(/^chart-/, '')) }),
      rect: (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom, sx: window.scrollX, sy: window.scrollY }; },
      name: (k) => t(CHART_CATALOG[k][2]),
    };
    return 1;
  })()`;
  const st = async () => JSON.parse((await ev(`JSON.stringify(window.__h.st())`)) || 'null') || { list: [], ls: null, canv: [] };
  const act = () => ev(`window.__h.act()`);
  const rect = async (s) => ev(`window.__h.rect(${J(s)})`);
  const q = (s) => `document.querySelector(${J(s)})`;

  const reload = async () => {
    await call('Page.reload', {});
    await sleep(2500);
    for (let i = 0; i < 40; i++) {
      await ev(`document.querySelectorAll('[id*=wizard]').forEach(e=>e.remove()); 0`);
      if (await ev(`typeof lastStats !== 'undefined' && !!lastStats && !!document.querySelector('#history-block canvas')`)) break;
      await sleep(500);
    }
    await ev(INSTALL);
    await reapplyTheme();     // el backend reaplica el tema persistido al arrancar: se vuelve a fijar el de la prueba
    await ev(`window.scrollBy(0, document.getElementById('history-block').getBoundingClientRect().top - 90); 0`);
    await sleep(500);
  };
  let want = ['magma', 'dark'];
  const reapplyTheme = () => ev(`localStorage.setItem('theme', ${J(want[0])}); localStorage.setItem('mode', ${J(want[1])}); applyAppearance(); 0`);
  const alive = async () => !!(await ev(`typeof lastStats !== 'undefined' && !!lastStats && !!document.querySelector('#history-block canvas')`));

  // ---------- entrada real ----------
  const KEYS = { Tab: [9, 'Tab'], Enter: [13, 'Enter', '\r'], ' ': [32, 'Space', ' '], Escape: [27, 'Escape'], ArrowUp: [38, 'ArrowUp'], ArrowDown: [40, 'ArrowDown'] };
  const key = async (k, { alt = false, shift = false } = {}) => {
    const [vk, code, text] = KEYS[k];
    const modifiers = (alt ? 1 : 0) | (shift ? 8 : 0);
    const base = { modifiers, key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
    await call('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', ...base, ...(text ? { text } : {}) });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    await sleep(160);
  };
  const mclick = async (sel) => {
    await ev(`(() => { const e = ${q(sel)}; if (e) e.scrollIntoView({ block: 'center' }); return 0; })()`);
    await sleep(120);
    const r = await rect(sel);
    if (!r) return false;
    const x = r.x + r.w / 2, y = r.y + r.h / 2;
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await sleep(250);
    return true;
  };
  const focus = (sel) => ev(`(() => { const e = ${q(sel)}; if (e) e.focus(); return !!e; })()`);
  // Arrastre con RATÓN REAL de CDP (UIFIX-01): pulsar en el asa, mover en pasos y soltar sobre la fila destino.
  const dnd = async (from, to) => {
    await ev(`document.getElementById('hist-editor').scrollIntoView({ block: 'center' }); 0`);
    await sleep(150);
    const a = await rect(`#hist-editor .hist-edit-row[data-key="${from}"] .hist-edit-grip`), b = await rect(`#hist-editor .hist-edit-row[data-key="${to}"]`);
    if (!a || !b) return false;
    const ax = a.x + a.w / 2, ay = a.y + a.h / 2, bx = b.x + b.w / 2, by = b.y + b.h / 2;
    const mv = (type, x, y, buttons) => call('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' && !buttons ? 'none' : 'left', buttons, clickCount: type === 'mouseMoved' ? 0 : 1 });
    await mv('mouseMoved', ax, ay, 0); await mv('mousePressed', ax, ay, 1);
    const n = Math.max(3, Math.ceil(Math.hypot(bx - ax, by - ay) / 8));
    for (let i = 1; i <= n; i++) { await mv('mouseMoved', ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n, 1); await sleep(12); }
    await sleep(60); await mv('mouseReleased', bx, by, 0);
    return true;
  };
  const eq = (a, b) => J(a) === J(b);
  const uniq = (a) => new Set(a).size === a.length;
  // Sólo se captura un recorte del elemento (nunca la ventana entera: mostraría rutas/hostname).
  const clipOf = async (sel, pad = 6) => { const r = await rect(sel); return r ? { x: Math.max(0, r.x + r.sx - pad), y: Math.max(0, r.y + r.sy - pad), width: r.w + pad * 2, height: r.h + pad * 2 } : null; };
  const shotOf = async (file, sel, pad) => { const c = await clipOf(sel, pad); if (c) await shot(file, c); };
  const setView = (w, h) => call('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });

  const openEditorByMouse = async () => {
    if (await ev(`${q('#hist-editor')}.classList.contains('hidden')`)) await mclick('#hist-edit');
    await sleep(300);
  };

  // =====================================================================================
  const THEMES = [['neon', 'dark'], ['magma', 'dark'], ['magma', 'light']];
  for (let ti = 0; ti < THEMES.length; ti++) {
    const [theme, mode] = THEMES[ti];
    cur = `${theme}/${mode}`;
    console.log(`\n==== ${cur} ====`);
    await setView(1500, 900);
    want = [theme, mode];
    await ev(`localStorage.removeItem('histCharts'); localStorage.removeItem('histMode'); 0`);
    await reload();
    check(`tema aplicado de verdad (data-theme=${theme}, data-mode=${mode})`, (await ev(`document.documentElement.dataset.theme + '/' + document.documentElement.dataset.mode`)) === `${theme}/${mode}`);
    check('arranque con preset de temperatura', eq((await st()).list, TEMP), J((await st()).list));

    // ---------- A. apertura, foco, aspecto ----------
    await mclick('#hist-edit');
    check('editor abierto, aria-expanded=true', (await ev(`${q('#hist-edit')}.getAttribute('aria-expanded')`)) === 'true' && !(await ev(`${q('#hist-editor')}.classList.contains('hidden')`)));
    check('al abrir, foco en el primer control (casilla de la 1ª fila)', (await act()) === 'cpu_temp|toggle', await act());

    const rows = JSON.parse((await ev(`JSON.stringify([...document.querySelectorAll('#hist-editor .hist-edit-row[data-key]')].map(r=>r.dataset.key))`)) || '[]');
    check('8 filas en el editor (activas primero)', rows.length === 8 && eq(rows.slice(0, 4), TEMP), J(rows));
    const small = JSON.parse((await ev(`JSON.stringify([...document.querySelectorAll('#hist-editor [data-act=up],#hist-editor [data-act=down]')].map(b=>{const r=b.getBoundingClientRect();return [b.closest('[data-key]').dataset.key+':'+b.dataset.act, Math.round(r.width), Math.round(r.height)]}).filter(a=>a[1]<28||a[2]<28))`)) || '[["sin botones",0,0]]');
    const nbtn = await ev(`document.querySelectorAll('#hist-editor [data-act=up],#hist-editor [data-act=down]').length`);
    check('hit target >=28x28 en TODOS los botones ↑/↓ (16)', nbtn === 16 && small.length === 0, `n=${nbtn} pequeños=${J(small.slice(0, 3))}`);
    const lblH = await ev(`(() => { const l = ${q('#hist-editor .hist-edit-row label')}; return l ? Math.round(l.getBoundingClientRect().height) : 0; })()`);
    check('fila/etiqueta de casilla clicable >=28px de alto', lblH >= 28, String(lblH));

    const names = JSON.parse((await ev(`JSON.stringify(Object.fromEntries(${J(rows)}.map(k=>[k, window.__h.name(k)])))`)) || '{}');
    const labs = JSON.parse((await ev(`JSON.stringify(${J(rows)}.map(k=>{const r=document.querySelector('#hist-editor [data-key="'+k+'"]'); return [k, r.querySelector('[data-act=up]')?.getAttribute('aria-label'), r.querySelector('[data-act=down]')?.getAttribute('aria-label')]}))`)) || '[]');
    check('aria-label de ↑/↓ lleva el NOMBRE de la gráfica (todas las filas)', labs.length === 8 && labs.every(([k, u, d]) => u && d && u.includes(names[k]) && d.includes(names[k]) && !/\{chart\}/.test(u + d)), J(labs[0]));
    check('no existen las claves i18n chart.expand / chart.collapse', (await ev(`(() => { const d = i18n.dump(); return !('chart.expand' in d) && !('chart.collapse' in d); })()`)) === true);

    const dis = JSON.parse((await ev(`JSON.stringify((() => { const b = ${q('#hist-editor [data-key=cpu_temp] [data-act=up]')}; if (!b) return null; const r = b.getBoundingClientRect(); const cs = getComputedStyle(b);
      return { ariaDisabled: b.getAttribute('aria-disabled'), nativeDisabled: b.disabled, w: r.width, h: r.height, op: cs.opacity, vis: cs.visibility, disp: cs.display }; })())`)) || 'null');
    check('↑ de la 1ª fila: aria-disabled="true", NO disabled nativo, visible (no oculto)', dis && dis.ariaDisabled === 'true' && dis.nativeDisabled === false && dis.w > 0 && dis.vis === 'visible' && dis.disp !== 'none' && Number(dis.op) >= 0.9, J(dis));
    const crDis = await ev(`window.__h.cr(${q('#hist-editor [data-key=cpu_temp] [data-act=up]')})`);
    const crEn = await ev(`window.__h.cr(${q('#hist-editor [data-key=cpu_temp] [data-act=down]')})`);
    check('contraste del icono ↑ aparentemente deshabilitado >= 4.5:1', crDis >= 4.5, String(crDis));
    check('contraste del icono ↓ habilitado >= 4.5:1', crEn >= 4.5, String(crEn));
    const crOffName = await ev(`window.__h.cr(${q('#hist-editor [data-key=ram_gb] label')})`);
    check('contraste del nombre de gráfica desactivada >= 4.5:1', crOffName >= 4.5, String(crOffName));

    const cb = JSON.parse((await ev(`JSON.stringify((() => { const c = ${q('#hist-editor [data-key=cpu_temp] input[data-act=toggle]')}; if (!c) return null; const cs = getComputedStyle(c);
      return { ap: cs.appearance, br: parseFloat(cs.borderTopLeftRadius) || 0, bg: cs.backgroundColor, w: c.getBoundingClientRect().width, accentPx: window.__h.acc(), bgPx: window.__h.px(cs.backgroundColor) }; })())`)) || 'null');
    check('casilla temática: appearance:none, esquinas cuadradas (<=2px)', cb && cb.ap === 'none' && cb.br <= 2, J(cb && { ap: cb.ap, br: cb.br }));
    check('casilla marcada rellena con el acento del tema', cb && cb.bgPx && cb.accentPx && cb.bgPx.slice(0, 3).every((v, i) => Math.abs(v - cb.accentPx[i]) <= 6), J(cb && [cb.bgPx, cb.accentPx]));

    const pre = JSON.parse((await ev(`JSON.stringify((() => { const g = ${q('#hist-editor .hist-edit-presets')}; if (!g) return null;
      const title = g.querySelector('.hist-edit-legend, legend, [id]'); const bs = [...g.querySelectorAll('[data-act=preset]')];
      return { role: g.getAttribute('role'), title: title ? title.textContent.trim() : '', n: bs.length, pressed: bs.map((b) => b.getAttribute('aria-pressed')), seg: !!g.querySelector('.hist-seg'), h: bs.map((b) => Math.round(b.getBoundingClientRect().height)) }; })())`)) || 'null');
    check('presets agrupados: grupo con título + segmento + aria-pressed (temp activo)', pre && pre.role === 'group' && pre.title.length > 0 && pre.n === 2 && pre.seg && eq(pre.pressed, ['true', 'false']) && pre.h.every((h) => h >= 28), J(pre));
    const grip = JSON.parse((await ev(`JSON.stringify((() => { const rs = [...document.querySelectorAll('#hist-editor .hist-edit-row[data-key]')]; return rs.map((r) => { const g = r.querySelector('.hist-edit-grip'); return { k: r.dataset.key, g: !!g, w: g ? Math.round(g.getBoundingClientRect().width) : 0, d: r.draggable, hid: g ? g.getAttribute('aria-hidden') : null, tab: g ? g.getAttribute('tabindex') : null }; }); })())`)) || '[]');
    check('filas con asa de arrastre (aria-hidden, fuera del Tab); sin DnD nativo (ninguna fila draggable)', grip.length === 8 && grip.every((g) => g.g && g.w >= 20 && g.hid === 'true' && g.tab == null && g.d === false), J(grip[0]));
    await shotOf(`${OUT}/${TAG}-editor-${theme}-${mode}.png`, '#history-block');

    // ---------- B. teclado: reordenar sin perder el foco ----------
    await focus('#hist-editor [data-key=cpu_temp] [data-act=down]');
    await key('Enter');
    check('Enter en ↓ de cpu_temp: la mueve una posición', eq((await st()).list, ['cpu_power', 'cpu_temp', 'gpu_temp', 'gpu_power']), J((await st()).list));
    check('foco conservado en el mismo botón (cpu_temp ↓) tras re-render', (await act()) === 'cpu_temp|down', await act());
    await key('Enter'); await key('Enter');
    check('cpu_temp llega al final (3 pulsaciones)', eq((await st()).list, ['cpu_power', 'gpu_temp', 'gpu_power', 'cpu_temp']), J((await st()).list));
    check('en el borde el foco pasa al botón opuesto (cpu_temp ↑), no se pierde', (await act()) === 'cpu_temp|up', await act());
    await focus('#hist-editor [data-key=gpu_power] input[data-act=toggle]');
    await key('ArrowUp', { alt: true });
    check('Alt+↑ en la fila mueve gpu_power arriba', eq((await st()).list, ['cpu_power', 'gpu_power', 'gpu_temp', 'cpu_temp']), J((await st()).list));
    check('Alt+↑ conserva el foco en la casilla de esa fila', (await act()) === 'gpu_power|toggle', await act());
    await key('ArrowDown', { alt: true });
    check('Alt+↓ la devuelve', eq((await st()).list, ['cpu_power', 'gpu_temp', 'gpu_power', 'cpu_temp']), J((await st()).list));
    await focus('#hist-editor [data-key=cpu_power] input[data-act=toggle]');
    await key('ArrowUp', { alt: true });
    check('Alt+↑ en la 1ª fila: sin cambio ni error', eq((await st()).list, ['cpu_power', 'gpu_temp', 'gpu_power', 'cpu_temp']) && (await act()) === 'cpu_power|toggle', J((await st()).list));
    await focus('#hist-editor [data-key=cpu_power] [data-act=up]');
    await key('Enter');
    check('Enter en ↑ aparentemente deshabilitado (aria-disabled) no hace nada', eq((await st()).list, ['cpu_power', 'gpu_temp', 'gpu_power', 'cpu_temp']), J((await st()).list));
    // toggle con Space y foco
    await focus('#hist-editor [data-key=ram_gb] input[data-act=toggle]');
    await key(' ');
    check('Espacio en casilla de ram_gb la activa (al final)', eq((await st()).list, ['cpu_power', 'gpu_temp', 'gpu_power', 'cpu_temp', 'ram_gb']), J((await st()).list));
    check('foco conservado en la casilla tras el toggle', (await act()) === 'ram_gb|toggle', await act());
    await key(' ');
    check('Espacio otra vez la quita; foco sigue en su casilla', eq((await st()).list, ['cpu_power', 'gpu_temp', 'gpu_power', 'cpu_temp']) && (await act()) === 'ram_gb|toggle', J((await st()).list) + ' ' + (await act()));
    // presets
    await focus('#hist-editor [data-act=preset][data-preset=usage]');
    await key('Enter');
    check('preset «uso» por teclado aplica el conjunto', eq((await st()).list, USAGE), J((await st()).list));
    check('foco conservado en el botón de preset', (await act()) === '|preset:usage', await act());
    check('aria-pressed del segmento sigue al conjunto activo', eq(JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('#hist-editor [data-act=preset]')].map(b=>b.getAttribute('aria-pressed')))`)), ['false', 'true']));
    await focus('#hist-editor [data-act=preset][data-preset=temp]');
    await key('Enter');
    check('preset «temp» vuelve al conjunto de temperatura', eq((await st()).list, TEMP), J((await st()).list));
    // última gráfica
    await ev(`setHistCharts(['cpu_temp']); 0`); await sleep(200);
    await focus('#hist-editor [data-key=cpu_temp] input[data-act=toggle]');
    await key(' ');
    check('la última gráfica activa no se puede quitar (casilla sigue marcada)', eq((await st()).list, ['cpu_temp']) && (await ev(`${q('#hist-editor [data-key=cpu_temp] input[data-act=toggle]')}.checked`)) === true);
    await ev(`setHistCharts(${J(TEMP)}); 0`); await sleep(200);

    // ---------- C. ratón: arrastrar y soltar ----------
    await dnd('cpu_temp', 'gpu_power'); await sleep(250);
    check('arrastrar cpu_temp sobre gpu_power -> la deja en la última posición', eq((await st()).list, ['cpu_power', 'gpu_temp', 'gpu_power', 'cpu_temp']), J((await st()).list));
    await dnd('gpu_power', 'cpu_power'); await sleep(250);
    check('arrastrar gpu_power sobre cpu_power -> la deja primera', eq((await st()).list, ['gpu_power', 'cpu_power', 'gpu_temp', 'cpu_temp']), J((await st()).list));
    await dnd('gpu_power', 'ram_gb'); await sleep(250);
    check('soltar sobre una fila desactivada no cambia nada', eq((await st()).list, ['gpu_power', 'cpu_power', 'gpu_temp', 'cpu_temp']), J((await st()).list));
    const lsAfterDnd = (await st()).ls;
    check('el orden arrastrado queda en localStorage sin duplicados', eq(JSON.parse(lsAfterDnd || 'null'), (await st()).list) && uniq((await st()).list), String(lsAfterDnd));
    await shotOf(`${OUT}/${TAG}-editor-despues-${theme}-${mode}.png`, '#history-block');

    // ---------- D. persistencia tras recargar ----------
    const before = (await st()).list;
    check('localStorage guarda exactamente el orden activo', eq(JSON.parse((await st()).ls || 'null'), before), String((await st()).ls));
    await reload();
    const after = await st();
    check('tras recargar, el orden es el mismo (gráficas dibujadas)', eq(after.canv, before) && eq(after.list, before), J(after));
    check('tras recargar, sin duplicados ni desapariciones', uniq(after.canv) && after.canv.length === before.length, J(after.canv));

    // ---------- E. sin «expandir» (UIFIX-01: retirado a petición del propietario) ----------
    check('sin botón «ampliar» ni cabecera de tarjeta, sin #chart-modal / #chart-big / #chart-modal-close', (await ev(`document.querySelectorAll('#history-block .chart-expand, #history-block .chart-head, #chart-modal, #chart-big, #chart-modal-close').length`)) === 0);
    check('cada tarjeta es etiqueta + canvas, sin controles', (await ev(`[...document.querySelectorAll('#history-block .chart')].every((c) => !c.querySelector('button') && c.querySelector('label') && c.querySelector('canvas'))`)) === true);
    await setView(1500, 900); await sleep(300);

    // ---------- F. Escape del editor + restauración de foco ----------
    await ev(`document.activeElement && document.activeElement.blur(); 0`);
    await focus('#hist-edit');
    if (await ev(`!${q('#hist-editor')}.classList.contains('hidden')`)) await key('Enter');   // cerrar para probar apertura por teclado
    await sleep(200);
    await key('Enter');
    check('abrir con Enter: editor visible y foco en su primer control', (await ev(`!${q('#hist-editor')}.classList.contains('hidden')`)) === true && /\|toggle$/.test(await act()), await act());
    await focus(`#hist-editor [data-key="${after.list[1]}"] [data-act=down]`);
    await key('Escape');
    check('Escape cierra el editor', (await ev(`${q('#hist-editor')}.classList.contains('hidden')`)) === true);
    check('Escape devuelve el foco a #hist-edit', (await act()) === '|hist-edit' || (await ev(`document.activeElement.id`)) === 'hist-edit', await act());
    check('aria-expanded=false tras Escape', (await ev(`${q('#hist-edit')}.getAttribute('aria-expanded')`)) === 'false');

    // ---------- G. Tab / Shift+Tab ----------
    await key('Enter');                         // reabre con #hist-edit enfocado
    const tabbables = JSON.parse((await ev(`JSON.stringify([...document.querySelectorAll('#hist-editor button, #hist-editor input, #hist-editor [tabindex]')].filter((e) => !e.disabled && e.getAttribute('tabindex') !== '-1' && e.getClientRects().length).map((e) => (e.closest('[data-key]') ? e.closest('[data-key]').dataset.key : '') + '|' + (e.dataset.act || e.id) + (e.dataset.preset ? ':' + e.dataset.preset : '')))`)) || '[]');
    const posTab = await ev(`[...document.querySelectorAll('#hist-editor [tabindex]')].some((e) => Number(e.getAttribute('tabindex')) > 0)`);
    check('el editor no usa tabindex positivo', posTab === false);
    const seen = [await act()];
    for (let i = 1; i < tabbables.length; i++) { await key('Tab'); seen.push(await act()); }
    check(`Tab recorre los ${tabbables.length} controles en orden del DOM, sin saltos`, tabbables.length >= 20 && eq(seen, tabbables), `esperado ${J(tabbables.slice(0, 5))}… obtenido ${J(seen.slice(0, 5))}…`);
    const back = [await act()];
    for (let i = 1; i < tabbables.length; i++) { await key('Tab', { shift: true }); back.push(await act()); }
    check('Shift+Tab recorre en sentido inverso', eq(back.reverse(), tabbables), J(back.slice(0, 5)));
    await key('Tab', { shift: true });
    check('Shift+Tab desde el primer control sale del editor hacia #hist-edit', (await ev(`document.activeElement.id`)) === 'hist-edit', await act());
    await key('Escape');                        // con foco en #hist-edit: editor abierto -> también cierra
    await ev(`document.activeElement && document.activeElement.blur(); 0`);

    // ---------- H. localStorage envenenado ----------
    const poisons = ti === 0
      ? [['["constructor"]', TEMP], ['["__proto__","toString"]', TEMP], ['["constructor","ram_gb","hasOwnProperty"]', ['ram_gb']], ['{"a":1}', TEMP]]
      : [['["constructor"]', TEMP], ['["constructor","ram_gb"]', ['ram_gb']]];
    for (const [raw, expect] of poisons) {
      await ev(`localStorage.setItem('histCharts', ${J(raw)}); 0`);
      await reload();
      const ok = await alive();
      const s = ok ? await st() : { list: [], canv: [] };
      check(`envenenado ${raw}: la app arranca y usa ${J(expect)}`, ok && eq(s.list, expect) && eq(s.canv, expect), J(s));
    }
    await ev(`localStorage.removeItem('histCharts'); 0`);
  }

  // ---------- barrido de contraste en los 12 temas x 2 modos (sin recargar) ----------
  cur = 'todos los temas';
  console.log(`\n==== ${cur} ====`);
  await setView(1500, 900);
  want = ['magma', 'dark'];
  await ev(`localStorage.removeItem('histCharts'); 0`);
  await reload();
  await ev(`(() => { if (document.getElementById('hist-editor').classList.contains('hidden')) document.getElementById('hist-edit').click(); return 0; })()`);
  await sleep(400);
  const themeIds = JSON.parse((await ev(`JSON.stringify(THEMES.map((t) => t[0]))`)) || '[]');
  const low = [];
  for (const th of themeIds) for (const md of ['dark', 'light']) {
    await ev(`localStorage.setItem('theme', ${J(th)}); localStorage.setItem('mode', ${J(md)}); applyAppearance(); 0`);
    await sleep(160);
    const r = JSON.parse((await ev(`JSON.stringify((() => { const g = (s) => document.querySelector(s); const c = (s) => { const e = g(s); return e ? window.__h.cr(e) : 0; };
      return { disUp: c('#hist-editor [data-key] [data-act=up][aria-disabled=true]'), up: c('#hist-editor [data-act=down][aria-disabled=false]'), off: c('#hist-editor .hist-edit-row.off label'),
        on: c('#hist-editor .hist-edit-row:not(.off) label'), hint: c('#hist-editor .note') }; })())`)) || '{}');
    for (const k of ['disUp', 'up', 'off', 'on']) if (!(r[k] >= 4.5)) low.push(`${th}/${md}:${k}=${Number(r[k]).toFixed(2)}`);
  }
  check(`contraste >= 4.5:1 (flecha sin recorrido, flecha activa, nombre off/on) en ${themeIds.length} temas x 2 modos`, themeIds.length === 12 && low.length === 0, low.slice(0, 8).join(' | '));
  await ev(`localStorage.setItem('theme','magma'); localStorage.setItem('mode','dark'); applyAppearance(); 0`);

  await call('Emulation.clearDeviceMetricsOverride', {});
  await ev(`localStorage.removeItem('histCharts'); 0`);
  const pass = results.filter(Boolean).length, fail = results.length - pass;
  console.log(`\n${pass} PASS / ${fail} FAIL de ${results.length} aserciones`);
  console.log(`RESULT: ${fail === 0 ? 'PASS' : 'FAIL'}`);
};
