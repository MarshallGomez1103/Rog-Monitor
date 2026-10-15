// Mide estilos estables: sin transiciones/animaciones CSS (se reinyecta tras cada recarga).
const NOANIM = `(()=>{if(!document.getElementById('cdp-noanim')){const s=document.createElement('style');s.id='cdp-noanim';s.textContent='*,*::before,*::after{transition:none!important;animation:none!important}';document.head.appendChild(s)}})();`;
// check-drag-mouse.mjs — UIFIX-01: reordenar el editor de gráficas con un RATÓN REAL.
// Uso:  ROG_APP_ROOT=<raíz del repo/worktree> OUT=<carpeta PNG> TAG=RED|GREEN \
//         node <repo>/.ai/private/rog-v22/tools/cdp.mjs <ruta-absoluta>/check-drag-mouse.mjs
// Sólo Input.dispatchMouseEvent (mousePressed/mouseMoved/mouseReleased) y Input.dispatchKeyEvent:
// NINGÚN DragEvent ni PointerEvent sintético. Las coordenadas salen de getBoundingClientRect() de las filas reales.
// Contrato DOM: #hist-editor .hist-edit-row[data-key] { .hist-edit-grip, input[data-act=toggle], button[data-act=up|down] }
import { mkdirSync } from 'node:fs';

export default async ({ ev: evRaw, shot, sleep, call }) => {
  const ev = (expr) => evRaw(NOANIM + expr);
  const OUT = process.env.OUT || '/tmp/rog-uifix-drag';
  const TAG = process.env.TAG || 'RUN';
  mkdirSync(OUT, { recursive: true });
  const results = [];
  const check = (name, cond, detail = '') => {
    const ok = !!cond;
    results.push(ok);
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail !== '' ? '  -> ' + detail : ''}`);
  };
  const J = (x) => JSON.stringify(x);
  const eq = (a, b) => J(a) === J(b);
  const TEMP = ['cpu_temp', 'cpu_power', 'gpu_temp', 'gpu_power'];
  const q = (s) => `document.querySelector(${J(s)})`;
  const list = async () => JSON.parse((await ev(`JSON.stringify(histList)`)) || '[]');
  const ls = async () => JSON.parse((await ev(`localStorage.getItem('histCharts')`)) || 'null');

  await call('Emulation.setFocusEmulationEnabled', { enabled: true });
  await call('Emulation.setDeviceMetricsOverride', { width: 1500, height: 900, deviceScaleFactor: 1, mobile: false });

  const reload = async () => {
    await call('Page.reload', {});
    await sleep(2500);
    for (let i = 0; i < 40; i++) {
      await ev(`document.querySelectorAll('[id*=wizard]').forEach(e=>e.remove()); 0`);
      if (await ev(`typeof lastStats !== 'undefined' && !!lastStats && !!document.querySelector('#history-block canvas')`)) break;
      await sleep(500);
    }
    await ev(`localStorage.setItem('theme','magma'); localStorage.setItem('mode','dark'); applyAppearance(); 0`);
    await sleep(300);
  };
  // centro de una parte de una fila (coordenadas de viewport, con la fila ya a la vista)
  const pt = async (sel, fx = 0.5, fy = 0.5) => JSON.parse((await ev(`JSON.stringify((() => { const e = ${q(sel)}; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width * ${fx}, y: r.y + r.height * ${fy} }; })())`)) || 'null');
  const reveal = async () => { await ev(`document.getElementById('hist-editor').scrollIntoView({ block: 'center' }); 0`); await sleep(200); };
  const mouse = (type, x, y, buttons) => call('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' && !buttons ? 'none' : 'left', buttons: buttons ?? 0, clickCount: type === 'mouseMoved' ? 0 : 1 });
  /* Arrastra con el ratón real desde `fromSel` hasta la fila `to` (o hasta un punto {x,y}):
     pulsar, mover en pasos de ~8 px, soltar. `release:false` deja el botón pulsado. */
  const drag = async (fromSel, to, { release = true, fx = 0.5 } = {}) => {
    const a = await pt(fromSel, fx);
    const b = typeof to === 'string' ? await pt(`#hist-editor .hist-edit-row[data-key="${to}"]`, 0.5) : to;
    if (!a || !b) return false;
    await mouse('mouseMoved', a.x, a.y);
    await mouse('mousePressed', a.x, a.y, 1);
    const n = Math.max(3, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 8));
    for (let i = 1; i <= n; i++) { await mouse('mouseMoved', a.x + ((b.x - a.x) * i) / n, a.y + ((b.y - a.y) * i) / n, 1); await sleep(12); }
    await sleep(60);
    if (release) { await mouse('mouseReleased', b.x, b.y, 0); await sleep(300); }
    return { a, b };
  };
  const key = async (k, vk) => {
    await call('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code: k, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    await sleep(160);
  };
  const row = (k) => `#hist-editor .hist-edit-row[data-key="${k}"]`;
  const grip = (k) => `${row(k)} .hist-edit-grip`;

  await ev(`localStorage.removeItem('histCharts'); localStorage.removeItem('histMode'); 0`);
  await reload();
  await ev(`(() => { if (document.getElementById('hist-editor').classList.contains('hidden')) document.getElementById('hist-edit').click(); return 0; })()`);
  await sleep(400);
  await reveal();
  check('arranca con el orden de temperatura', eq(await list(), TEMP), J(await list()));

  // 1. asa -> otra fila: mover cpu_temp a la última posición
  await drag(grip('cpu_temp'), 'gpu_power');
  check('arrastrar con el ratón el asa de cpu_temp sobre gpu_power la deja última', eq(await list(), ['cpu_power', 'gpu_temp', 'gpu_power', 'cpu_temp']), J(await list()));
  await reveal();

  // 2. desde el nombre de la fila (no el asa), hacia arriba; no debe alternar la casilla
  await drag(`${row('gpu_power')} label span`, 'cpu_power', { fx: 0.3 });
  check('arrastrar desde el nombre de gpu_power sobre cpu_power la deja primera', eq(await list(), ['gpu_power', 'cpu_power', 'gpu_temp', 'cpu_temp']), J(await list()));
  check('…y arrastrar por el nombre no quita ninguna gráfica (4 activas)', (await list()).length === 4);
  await reveal();

  // 3. indicador de destino y cursor MIENTRAS se arrastra (botón aún pulsado)
  await drag(grip('cpu_temp'), 'cpu_power', { release: false });
  const live = JSON.parse((await ev(`JSON.stringify({ above: [...document.querySelectorAll('#hist-editor .drop-above')].map((r) => r.dataset.key), below: [...document.querySelectorAll('#hist-editor .drop-below')].map((r) => r.dataset.key),
    dragging: [...document.querySelectorAll('#hist-editor .dragging')].map((r) => r.dataset.key), cursor: getComputedStyle(document.body).cursor, gripCursor: getComputedStyle(document.querySelector(${J(grip('cpu_temp'))})).cursor })`)) || '{}');
  check('durante el arrastre: fila de origen marcada y línea de destino en cpu_power (arriba)', eq(live.dragging, ['cpu_temp']) && eq(live.above, ['cpu_power']) && live.below.length === 0, J(live));
  check('durante el arrastre: cursor grabbing', /grabbing/.test(live.cursor) || /grabbing/.test(live.gripCursor), J([live.cursor, live.gripCursor]));
  // captura del editor a mitad de arrastre (solo el recorte del bloque, sin rutas ni hostname)
  const clip = JSON.parse((await ev(`JSON.stringify((() => { const r = document.getElementById('hist-editor').getBoundingClientRect(); return { x: Math.max(0, r.x + scrollX - 6), y: Math.max(0, r.y + scrollY - 6), width: r.width + 12, height: r.height + 12 }; })())`)) || 'null');
  if (clip) await shot(`${OUT}/${TAG}-arrastrando.png`, clip);
  // 4. Escape cancela: soltar después no mueve nada
  await key('Escape', 27);
  const afterEsc = JSON.parse((await ev(`JSON.stringify({ n: document.querySelectorAll('#hist-editor .dragging, #hist-editor .drop-above, #hist-editor .drop-below').length, open: !document.getElementById('hist-editor').classList.contains('hidden') })`)) || '{}');
  await mouse('mouseReleased', 0, 0, 0); await sleep(250);
  check('Escape durante el arrastre cancela: el orden no cambia y se limpian los indicadores', eq(await list(), ['gpu_power', 'cpu_power', 'gpu_temp', 'cpu_temp']) && afterEsc.n === 0, J([await list(), afterEsc]));
  check('…y ese Escape sólo cancela el arrastre (el editor sigue abierto)', afterEsc.open === true, J(afterEsc));
  await reveal();

  // 5. soltar sobre una fila desactivada o fuera del editor no cambia nada
  await drag(grip('gpu_power'), 'ram_gb');
  check('soltar sobre una fila desactivada no cambia nada', eq(await list(), ['gpu_power', 'cpu_power', 'gpu_temp', 'cpu_temp']), J(await list()));
  await reveal();
  await drag(grip('gpu_power'), { x: 5, y: 5 });
  check('soltar fuera del editor no cambia nada', eq(await list(), ['gpu_power', 'cpu_power', 'gpu_temp', 'cpu_temp']), J(await list()));
  await reveal();

  // 6. un clic con 1-2 px de temblor sigue siendo clic: alterna la casilla, no arrastra
  const c = await pt(`${row('gpu_temp')} input[data-act=toggle]`);
  await mouse('mouseMoved', c.x, c.y); await mouse('mousePressed', c.x, c.y, 1); await mouse('mouseMoved', c.x + 2, c.y + 1, 1); await mouse('mouseReleased', c.x + 2, c.y + 1, 0); await sleep(300);
  check('clic con 2 px de temblor en la casilla la alterna (gpu_temp se quita)', eq(await list(), ['gpu_power', 'cpu_power', 'cpu_temp']), J(await list()));
  const c2 = await pt(`${row('gpu_temp')} input[data-act=toggle]`);
  await mouse('mouseMoved', c2.x, c2.y); await mouse('mousePressed', c2.x, c2.y, 1); await mouse('mouseReleased', c2.x, c2.y, 0); await sleep(300);
  check('…y otro clic la vuelve a activar (al final)', eq(await list(), ['gpu_power', 'cpu_power', 'cpu_temp', 'gpu_temp']), J(await list()));
  await reveal();
  const lbl = await pt(`${row('gpu_temp')} label span`);
  await mouse('mouseMoved', lbl.x, lbl.y); await mouse('mousePressed', lbl.x, lbl.y, 1); await mouse('mouseReleased', lbl.x, lbl.y, 0); await sleep(300);
  check('un clic simple sobre el NOMBRE de la fila (sin mover) también alterna la casilla (gpu_temp se quita)', eq(await list(), ['gpu_power', 'cpu_power', 'cpu_temp']), J(await list()));
  await reveal();
  const lbl2 = await pt(`${row('gpu_temp')} label span`);
  await mouse('mouseMoved', lbl2.x, lbl2.y); await mouse('mousePressed', lbl2.x, lbl2.y, 1); await mouse('mouseReleased', lbl2.x, lbl2.y, 0); await sleep(300);
  check('…y otro clic sobre el nombre la vuelve a activar', eq(await list(), ['gpu_power', 'cpu_power', 'cpu_temp', 'gpu_temp']), J(await list()));
  await reveal();
  // un clic en el botón ↓ sigue funcionando y no inicia arrastre
  const d = await pt(`${row('gpu_power')} [data-act=down]`);
  await mouse('mouseMoved', d.x, d.y); await mouse('mousePressed', d.x, d.y, 1); await mouse('mouseReleased', d.x, d.y, 0); await sleep(300);
  check('clic en ↓ de gpu_power sigue moviéndola una posición', eq(await list(), ['cpu_power', 'gpu_power', 'cpu_temp', 'gpu_temp']), J(await list()));
  await reveal();

  // 7. las filas ya no usan DnD nativo (era lo que no funcionaba con un ratón real)
  const nat = await ev(`document.querySelectorAll('#hist-editor [draggable="true"]').length`);
  check('ninguna fila usa draggable="true" (DnD nativo retirado)', nat === 0, String(nat));
  check('cursor del asa = grab en filas activas', (await ev(`getComputedStyle(${q(grip('cpu_power'))}).cursor`)) === 'grab');

  // 8. persistencia: arrastrar y recargar
  await drag(grip('gpu_temp'), 'cpu_power');
  const want = await list();
  check('arrastrar gpu_temp sobre cpu_power la deja primera', eq(want, ['gpu_temp', 'cpu_power', 'gpu_power', 'cpu_temp']), J(want));
  check('el orden arrastrado queda en localStorage sin duplicados', eq(await ls(), want) && new Set(want).size === want.length, J(await ls()));
  await reload();
  check('tras recargar, el orden arrastrado persiste (lista y canvas)', eq(await list(), want) && eq(JSON.parse((await ev(`JSON.stringify([...document.querySelectorAll('#history-block .chart canvas')].map((c) => c.id.replace(/^chart-/, '')))`)) || '[]'), want), J(await list()));

  await call('Emulation.clearDeviceMetricsOverride', {});
  await ev(`localStorage.removeItem('histCharts'); 0`);
  const pass = results.filter(Boolean).length, fail = results.length - pass;
  console.log(`\n${pass} PASS / ${fail} FAIL de ${results.length} aserciones`);
  console.log(`RESULT: ${fail === 0 ? 'PASS' : 'FAIL'}`);
};
