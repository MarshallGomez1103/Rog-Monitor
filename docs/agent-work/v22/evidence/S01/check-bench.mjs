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
