// check-bench.mjs — CDP de las tarjetas del historial de benchmarks (S01 · N-A1-01 / N-A1-02).
// Uso:  ROG_APP_ROOT=<raíz del repo> OUT=<carpeta para PNG> \
//         node <ruta>/.ai/private/rog-v22/tools/cdp.mjs <ruta-absoluta>/check-bench.mjs
// Inyecta 8 entradas sintéticas en benchmarkHistory (sin tocar el backend), re-renderiza
// y mide, en neón/oscuro/claro: recorte de cada .bench-card, scroll de .bench-history,
// estilo+contraste de .bench-card-expand / -delete / -when / -kind, hit target del
// botón borrar y anillo de foco. Además calcula el contraste mínimo en los 12 temas x 2 modos.
// Imprime RESULT: PASS/FAIL por comprobación. No usa datos reales ni privilegios.
import { mkdirSync } from 'node:fs';
export default async ({ ev, shot, sleep, call }) => {
  const OUT = process.env.OUT || '/tmp/rog-s01-bench';
  mkdirSync(OUT, { recursive: true });
  await sleep(2500);

  // 1) Fixture: 8 entradas, mezcla CPU/GPU, con samples para la mini-curva.
  await ev(`(() => {
    const mk = (i) => {
      const kind = i % 2 ? 'gpu' : 'cpu';
      const samples = Array.from({length: 30}, (_, k) => ({ t: k, cpu_temp: 55 + k + i, gpu_temp: 50 + k / 2 + i, cpu_watts: 40, gpu_watts: 30 }));
      return { id: 'fx-' + i, kind, label: kind.toUpperCase(), when: '14/10/2026 1' + i + ':0' + i, seconds: 45, tool: 'fixture',
        summary: { cpu_temp_max: 80 + i, cpu_package_max: 78 + i, cpu_watts_max: 55 + i, gpu_temp_max: 70 + i, gpu_util_max: 99, gpu_watts_max: 33 + i, throttle_events: i % 4 },
        samples };
    };
    benchmarkHistory = Array.from({length: 8}, (_, i) => mk(i));
    renderBenchmarkHistory();
    document.getElementById('bench-block').scrollIntoView({block: 'start'});
  })()`);
  await sleep(600);

  const measure = `(() => {
    // normaliza cualquier color CSS (incl. color-mix/color()) a [r,g,b,a] usando un canvas
    const cv = document.createElement('canvas'); cv.width = cv.height = 1;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    const rgba = (c) => { cx.clearRect(0,0,1,1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0,0,1,1); const d = cx.getImageData(0,0,1,1).data; return [d[0],d[1],d[2],d[3]/255]; };
    const over = (top, bot) => { const a = top[3]; return [0,1,2].map(i => top[i]*a + bot[i]*(1-a)).concat([1]); };
    const bgOf = (el) => { const chain = []; for (let e = el; e; e = e.parentElement) { const c = rgba(getComputedStyle(e).backgroundColor); chain.push(c); if (c[3] >= 0.999) break; }
      let acc = chain.pop(); if (acc[3] < 0.999) acc = over(acc, [0,0,0,1]); while (chain.length) acc = over(chain.pop(), acc); return acc; };
    const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); }; return 0.2126*f(c[0]) + 0.7152*f(c[1]) + 0.0722*f(c[2]); };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p,q) => q-p); return (x+0.05)/(y+0.05); };
    const contrast = (el) => { const cs = getComputedStyle(el); const bg = bgOf(el.parentElement || el); let fg = rgba(cs.color); fg[3] *= parseFloat(cs.opacity); fg = over(fg, bg); return +ratio(fg, bg).toFixed(2); };
    const card = document.querySelector('.bench-card');
    const out = { cards: [], theme: document.documentElement.dataset.theme + '/' + document.documentElement.dataset.mode };
    const list = document.getElementById('bench-history');
    out.list = { clientHeight: list.clientHeight, scrollHeight: list.scrollHeight, scrolls: list.scrollHeight > list.clientHeight + 1, overflowY: getComputedStyle(list).overflowY };
    document.querySelectorAll('.bench-card').forEach((c) => out.cards.push({ id: c.dataset.bid, h: Math.round(c.getBoundingClientRect().height), scrollH: c.scrollHeight, clientH: c.clientHeight, clipped: c.scrollHeight > c.clientHeight + 1 }));
    const px = (v) => parseFloat(v);
    const style = (sel) => { const el = card.querySelector(sel); const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return { opacity: +cs.opacity, fontPx: +px(cs.fontSize).toFixed(2), fontRem: +(px(cs.fontSize) / px(getComputedStyle(document.documentElement).fontSize)).toFixed(3), color: cs.color, contrast: contrast(el), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
    out.expand = style('.bench-card-expand'); out.del = style('.bench-card-delete'); out.when = style('.bench-card-when'); out.kind = style('.bench-card-kind');
    out.borderTop = getComputedStyle(card).borderTopColor; out.borderLeftW = getComputedStyle(card).borderLeftWidth;
    return out;
  })()`;

  const themes = [['neon', 'dark'], ['magma', 'dark'], ['magma', 'light']];
  let fails = 0; const fail = (m) => { fails++; console.log('  FAIL ' + m); }; const ok = (m) => console.log('  ok   ' + m);
  for (const [theme, mode] of themes) {
    await ev(`localStorage.setItem('theme','${theme}'); localStorage.setItem('mode','${mode}'); applyAppearance(); renderBenchmarkHistory(); 0`);
    await sleep(500);
    const m = await ev(measure);
    console.log(`\n== ${m.theme} ==`);
    console.log(' list:', JSON.stringify(m.list));
    console.log(' cards:', m.cards.map((c) => `${c.h}px${c.clipped ? '(CLIPPED ' + c.scrollH + '>' + c.clientH + ')' : ''}`).join(' '));
    console.log(' expand:', JSON.stringify(m.expand)); console.log(' delete:', JSON.stringify(m.del));
    console.log(' when:', JSON.stringify(m.when)); console.log(' kind:', JSON.stringify(m.kind));
    m.cards.some((c) => c.clipped) ? fail('hay tarjetas recortadas') : ok('ninguna tarjeta recortada');
    m.list.scrolls && m.list.overflowY === 'auto' ? ok('.bench-history scrollea') : fail('.bench-history no scrollea (' + JSON.stringify(m.list) + ')');
    m.expand.opacity >= 0.8 ? ok('expand opacity >= .8') : fail('expand opacity ' + m.expand.opacity);
    m.expand.fontRem >= 0.72 ? ok('expand font >= .72rem') : fail('expand font ' + m.expand.fontRem + 'rem');
    m.expand.contrast >= 4.5 ? ok('expand contraste ' + m.expand.contrast) : fail('expand contraste ' + m.expand.contrast);
    m.del.contrast >= 4.5 ? ok('delete contraste ' + m.del.contrast) : fail('delete contraste ' + m.del.contrast);
    m.del.w >= 28 && m.del.h >= 28 ? ok('delete hit target ' + m.del.w + 'x' + m.del.h) : fail('delete hit target ' + m.del.w + 'x' + m.del.h);
    m.when.contrast >= 4.5 ? ok('when contraste ' + m.when.contrast) : fail('when contraste ' + m.when.contrast);
    // foco visible del botón borrar
    // una pulsación de teclado real hace que .focus() cuente como :focus-visible
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 });
    await ev(`document.querySelector('.bench-card-delete').focus(); 0`);
    const f = await ev(`(() => { const b = document.querySelector('.bench-card-delete'); const cs = getComputedStyle(b); return { fv: b.matches(':focus-visible'), outline: cs.outlineStyle + ' ' + cs.outlineWidth, offset: cs.outlineOffset }; })()`);
    console.log(' foco delete:', JSON.stringify(f));
    f.fv && /solid [1-9]/.test(f.outline) ? ok('foco visible en delete') : fail('foco no visible en delete ' + JSON.stringify(f));
    await ev(`document.activeElement.blur(); document.getElementById('bench-history').scrollTop = 0; document.getElementById('bench-block').scrollIntoView({block:'start'}); 0`);
    await sleep(300);
    await shot(`${OUT}/bench-${theme}-${mode}.png`);
  }

  // ---- N-A1-02 (JS/i18n): semántica, borrar con deshacer y teclado ----
  console.log('\n== semántica / deshacer / teclado ==');
  await ev(`localStorage.setItem('theme','neon'); localStorage.setItem('mode','dark'); applyAppearance(); renderBenchmarkHistory(); 0`);
  await sleep(400);
  const key = async (k, code, vk, text) => {
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, text });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk });
  };
  const sem = await ev(`(() => {
    const c = document.querySelector('.bench-card'); const x = c.querySelector('.bench-card-expand'); const d = c.querySelector('.bench-card-delete');
    const xs = getComputedStyle(x), cs = getComputedStyle(c);
    return { tag: x.tagName, type: x.getAttribute('type'), xLabel: x.getAttribute('aria-label') || '', xText: x.textContent.trim(),
      dLabel: d.getAttribute('aria-label') || '', dTitle: d.getAttribute('title') || '',
      bg: xs.backgroundColor, border: xs.borderTopWidth, fam: xs.fontFamily === cs.fontFamily, fs: xs.fontSize, op: xs.opacity,
      labels: new Set([...document.querySelectorAll('.bench-card-delete')].map((b) => b.getAttribute('aria-label'))).size };
  })()`);
  console.log(' semántica:', JSON.stringify(sem));
  sem.tag === 'BUTTON' && sem.type === 'button' ? ok('EXPAND es <button type=button>') : fail('EXPAND es ' + sem.tag + ' type=' + sem.type);
  sem.xLabel ? ok('EXPAND aria-label: ' + sem.xLabel) : fail('EXPAND sin aria-label');
  sem.xLabel.toLowerCase().includes(sem.xText.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase()) ? ok('aria-label contiene el texto visible (label-in-name)') : fail('aria-label "' + sem.xLabel + '" no contiene "' + sem.xText + '"');
  sem.bg === 'rgba(0, 0, 0, 0)' && sem.border === '0px' && sem.fam && sem.op === '0.9' ? ok('EXPAND conserva el look (sin fondo/borde, fuente heredada, opacity .9)') : fail('EXPAND look distinto ' + JSON.stringify({ bg: sem.bg, border: sem.border, fam: sem.fam, op: sem.op }));
  sem.dLabel ? ok('delete aria-label: ' + sem.dLabel) : fail('delete sin aria-label');
  sem.labels === 8 ? ok('aria-label de borrar distinto por tarjeta (8)') : fail('aria-label de borrar repetido: ' + sem.labels + ' distintos');

  // borrar la tarjeta del medio -> toast con Deshacer -> vuelve en su sitio
  const order0 = await ev(`benchmarkHistory.map((i) => i.id).join(',')`);
  await ev(`document.querySelectorAll('.bench-card-delete')[3].click(); 0`);
  await sleep(300);
  const del = await ev(`(() => ({ cards: document.querySelectorAll('.bench-card').length, has: !!document.querySelector('.bench-card[data-bid="fx-3"]'),
    toastShown: !document.getElementById('toast').classList.contains('hidden'), action: document.querySelector('#toast .toast-action')?.textContent || '',
    actionTag: document.querySelector('#toast .toast-action')?.tagName || '', stored: JSON.parse(localStorage.getItem('benchmarkHistoryV2') || '[]').length }))()`);
  console.log(' tras borrar:', JSON.stringify(del));
  del.cards === 7 && !del.has ? ok('borrar quita la tarjeta') : fail('borrar no quitó la tarjeta ' + JSON.stringify(del));
  del.toastShown && del.actionTag === 'BUTTON' && del.action ? ok('toast con botón Deshacer: "' + del.action + '"') : fail('toast sin acción deshacer ' + JSON.stringify(del));
  await ev(`document.querySelector('#toast .toast-action')?.click(); 0`);
  await sleep(300);
  const undo = await ev(`(() => ({ order: benchmarkHistory.map((i) => i.id).join(','), dom: [...document.querySelectorAll('.bench-card')].map((c) => c.dataset.bid).join(','),
    toastHidden: document.getElementById('toast').classList.contains('hidden'), stored: JSON.parse(localStorage.getItem('benchmarkHistoryV2') || '[]').map((i) => i.id).join(',') }))()`);
  console.log(' tras deshacer:', JSON.stringify(undo));
  undo.order === order0 && undo.dom === order0.split(',').slice(0, 8).join(',') ? ok('deshacer restaura la tarjeta en su posición') : fail('orden tras deshacer ' + undo.dom + ' != ' + order0);
  undo.stored === order0 ? ok('deshacer restaura también el almacenamiento') : fail('almacenamiento tras deshacer ' + undo.stored);
  undo.toastHidden ? ok('el toast se oculta al deshacer') : fail('el toast sigue visible');
  // sin deshacer, el borrado persiste y el toast caduca (~6 s)
  await ev(`document.querySelectorAll('.bench-card-delete')[0].click(); 0`);
  await sleep(4500);
  const still = await ev(`!document.getElementById('toast').classList.contains('hidden') && !!document.querySelector('#toast .toast-action')`);
  still ? ok('el Deshacer sigue disponible a los 4,5 s (ventana ~6 s)') : fail('Deshacer caducó antes de 6 s');
  await sleep(2500);
  const gone = await ev(`document.getElementById('toast').classList.contains('hidden') && benchmarkHistory.length === 7`);
  gone ? ok('pasada la ventana el borrado es definitivo') : fail('estado tras caducar el toast incorrecto');
  // restaurar fixture
  await ev(`renderBenchmarkHistory(); 0`);

  // por teclado: Enter sobre borrar -> el foco pasa a Deshacer -> Enter restaura
  const orderK = await ev(`benchmarkHistory.map((i) => i.id).join(',')`);
  await ev(`document.querySelectorAll('.bench-card-delete')[2].focus(); 0`);
  await key('Enter', 'Enter', 13, '\r');
  await sleep(300);
  const fk = await ev(`(() => ({ onUndo: document.activeElement?.classList.contains('toast-action'), cards: document.querySelectorAll('.bench-card').length }))()`);
  fk.onUndo && fk.cards === 6 ? ok('borrar con teclado mueve el foco al botón Deshacer') : fail('foco tras borrar con teclado ' + JSON.stringify(fk));
  await shot(`${OUT}/bench-toast-undo.png`);
  await key('Enter', 'Enter', 13, '\r');
  await sleep(300);
  (await ev(`benchmarkHistory.map((i) => i.id).join(',')`)) === orderK ? ok('Enter en Deshacer restaura la tarjeta') : fail('Deshacer con teclado no restauró');

  // teclado: Enter y Espacio sobre EXPAND abren el detalle (clics sintéticos no valen: teclas reales)
  for (const [name, k, code, vk, text] of [['Enter', 'Enter', 'Enter', 13, '\r'], ['Espacio', ' ', 'Space', 32, ' ']]) {
    await ev(`document.activeElement.blur && document.activeElement.blur(); document.querySelectorAll('.bench-card-expand')[1].focus(); 0`);
    await key(k, code, vk, text);
    await sleep(500);
    const opened = await ev(`(() => { const m = document.getElementById('bench-detail-modal'); return !!m && !m.classList.contains('hidden'); })()`);
    opened ? ok(name + ' sobre EXPAND abre el detalle') : fail(name + ' sobre EXPAND no abrió el detalle');
    await ev(`window.RogBenchDetail.close(); 0`);
    await sleep(150);
  }
  // Tab desde el borde de la lista llega a EXPAND y luego a borrar (orden lógico, un solo punto de entrada por tarjeta)
  const tabs = await ev(`[...document.querySelectorAll('.bench-card')].slice(0, 2).map((c) => [...c.querySelectorAll('button')].map((b) => b.className).join('+'))`);
  tabs.every((x) => x === 'bench-card-expand+bench-card-delete') ? ok('cada tarjeta expone EXPAND y borrar como botones en ese orden') : fail('botones por tarjeta ' + JSON.stringify(tabs));

  // Contraste mínimo en los 12 temas x 2 modos (expand en reposo, delete, when)
  const names = await ev(`THEMES.map(t => t[0])`);
  const worst = { expand: [99, ''], del: [99, ''], when: [99, ''] };
  for (const mode of ['dark', 'light']) for (const th of names) {
    await ev(`localStorage.setItem('theme','${th}'); localStorage.setItem('mode','${mode}'); applyAppearance(); renderBenchmarkHistory(); 0`);
    await sleep(120);
    const m = await ev(measure);
    for (const [k, v] of [['expand', m.expand.contrast], ['del', m.del.contrast], ['when', m.when.contrast]]) if (v < worst[k][0]) worst[k] = [v, th + '/' + mode];
  }
  console.log('\n== contraste mínimo (12 temas x 2 modos) ==', JSON.stringify(worst));
  for (const k of Object.keys(worst)) worst[k][0] >= 4.5 ? ok(k + ' mín ' + worst[k][0] + ' (' + worst[k][1] + ')') : fail(k + ' mín ' + worst[k][0] + ' en ' + worst[k][1]);
  await ev(`localStorage.removeItem('theme'); localStorage.removeItem('mode'); 0`);
  console.log(`\nRESULT: ${fails ? 'FAIL (' + fails + ')' : 'PASS'}`);
};
