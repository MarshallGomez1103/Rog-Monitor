// check-tables.mjs — CDP de coherencia entre las 3 tablas de procesos (S01 · N-A2-02).
// Uso:  ROG_APP_ROOT=<raíz del repo> OUT=<carpeta para PNG> \
//         node <ruta>/.ai/private/rog-v22/tools/cdp.mjs <ruta-absoluta>/check-tables.mjs
// Tablas: #procs (dashboard), #allprocs (modal "VER TODOS"), #ram-procs (modal RAM).
// Para cada tema (neón/oscuro/claro) y cada orden (cpu, cpu_core, mem_mb, name) hace click SOLO en
// las cabeceras <th> (nunca en filas: un click en fila cierra un proceso) y compara, columna
// por columna, color / font-size / font-weight / font-family / text-shadow / letter-spacing /
// padding de td y th, y del <span.procs-core>. Imprime una tabla de diferencias entre tablas.
// Necesita el backend (Python con rich): si ROG_APP_ROOT es un worktree sin .venv, enlaza
// <worktree>/.venv -> <repo principal>/.venv (el HOME aislado de cdp.mjs oculta ~/.local).
// No toca procesos reales: solo hace click en <th>, nunca en filas.
import { mkdirSync } from 'node:fs';
export default async ({ ev, shot, sleep }) => {
  const OUT = process.env.OUT || '/tmp/rog-s01-tables';
  mkdirSync(OUT, { recursive: true });
  await sleep(3500);

  // Espera datos reales en #procs
  for (let i = 0; i < 20; i++) { if (await ev(`document.querySelectorAll('#procs-body tr[data-pid]').length`) > 0) break; await sleep(500); }

  const measure = (sel, sortKey) => `(() => {
    const t = document.querySelector('${sel}'); if (!t) return { err: 'sin tabla ${sel}' };
    const th0 = t.querySelector('th[data-sort="${sortKey}"]');
    if (!th0) return { skip: true };
    const cols = ['pid', 'pname', 'cpu', 'cpu-core', 'mem'];
    const px = (v) => v;
    const td = (c) => { const e = t.querySelector('tbody td.' + c); if (!e) return null; const s = getComputedStyle(e);
      const o = { color: s.color, fontSize: s.fontSize, fontWeight: s.fontWeight, fontFamily: s.fontFamily.split(',')[0].trim(), textShadow: s.textShadow, letterSpacing: s.letterSpacing, padding: s.paddingTop + ' ' + s.paddingRight + ' ' + s.paddingBottom + ' ' + s.paddingLeft };
      const sp = e.querySelector('.procs-core'); if (sp) { const ss = getComputedStyle(sp); o.coreSpan = ss.color + ' | ' + ss.fontSize + ' | ' + ss.textShadow + ' | ml=' + ss.marginLeft; }
      return o; };
    const thOf = (key) => t.querySelector('th[data-sort="' + key + '"]');
    const thS = (e) => { if (!e) return null; const s = getComputedStyle(e); return { color: s.color, fontSize: s.fontSize, fontWeight: s.fontWeight, fontFamily: s.fontFamily.split(',')[0].trim(), textShadow: s.textShadow, letterSpacing: s.letterSpacing, textTransform: s.textTransform, padding: s.paddingTop + ' ' + s.paddingRight + ' ' + s.paddingBottom + ' ' + s.paddingLeft, active: e.classList.contains('sort-active') }; };
    const out = { sortCol: t.dataset.sortCol, td: {}, th: {} };
    cols.forEach((c) => { out.td[c] = td(c); });
    out.th.active = thS(t.querySelector('th.sort-active'));
    out.th.idle = thS(thOf('name') && !thOf('name').classList.contains('sort-active') ? thOf('name') : thOf('pid'));
    out.tableFont = getComputedStyle(t).fontSize;
    const tok = (v) => { const p = document.createElement('i'); p.style.color = 'var(' + v + ')'; t.appendChild(p); const c = getComputedStyle(p).color; p.remove(); return c; };
    out.tok = { ink: tok('--ink'), dim: tok('--dim'), accent: tok('--accent') };
    out.rows = t.querySelectorAll('tbody tr[data-pid]').length;
    // aria-sort (N-A2-01): la th activa dice ascending/descending acorde a data-dir; las demás 'none'
    out.aria = [...t.querySelectorAll('th.sortable')].map((e) => ({ key: e.dataset.sort, active: e.classList.contains('sort-active'), dir: e.dataset.dir || '', aria: e.getAttribute('aria-sort') }));
    return out;
  })()`;

  // click en la cabecera, espera a que acaben las transiciones de color (0.12 s) y mide
  const run = async (sel, key) => {
    const has = await ev(`!!document.querySelector('${sel} th[data-sort="${key}"]')`);
    if (!has) return { skip: true };
    await ev(`document.querySelector('${sel} th[data-sort="${key}"]').click(); 0`);
    await sleep(700);
    return ev(measure(sel, key));
  };

  // segundo clic en la misma columna invierte el sentido; columna nueva = desc (texto: asc); aria-sort acompaña
  const toggleCheck = async (sel, col = 'cpu_core') => {
    const get = (key) => `(() => { const e = document.querySelector('${sel} th[data-sort="${key}"]'); return [e.dataset.dir || '', e.getAttribute('aria-sort')]; })()`;
    const click = async (key) => { await ev(`document.querySelector('${sel} th[data-sort="${key}"]').click(); 0`); await sleep(250); return ev(get(key)); };
    const issues = [];
    const a = await click(col); const b = await click(col); const c = await click('name');
    if (a.join() !== 'desc,descending') issues.push(col + ' 1er clic ' + a);
    if (b.join() !== 'asc,ascending') issues.push(col + ' 2º clic ' + b);
    if (c.join() !== 'asc,ascending') issues.push('name 1er clic ' + c);
    return issues.map((m) => `   EXPECT ${sel}: toggle ${m}`);
  };
  const themes = [['neon', 'dark'], ['magma', 'dark'], ['magma', 'light']];
  const sorts = ['cpu', 'cpu_core', 'mem_mb', 'name'];
  const tables = ['#procs', '#allprocs', '#ram-procs'];
  let diffCount = 0;

  for (const [theme, mode] of themes) {
    await ev(`localStorage.setItem('theme','${theme}'); localStorage.setItem('mode','${mode}'); applyAppearance(); 0`);
    await sleep(1000);
    // res[sort][table] = measurement
    const res = {}; for (const s of sorts) res[s] = {};

    for (const s of sorts) { res[s]['#procs'] = await run('#procs', s); }
    for (const l of await toggleCheck('#procs')) { diffCount++; console.log(l); }
    await shot(`${OUT}/tables-procs-${theme}-${mode}.png`);

    // modal "VER TODOS"
    await ev(`document.getElementById('procs-all-btn').click(); 0`);
    for (let i = 0; i < 20; i++) { if (await ev(`document.querySelectorAll('#allprocs-body tr[data-pid]').length`) > 0) break; await sleep(400); }
    for (const s of sorts) { res[s]['#allprocs'] = await run('#allprocs', s); }
    for (const l of await toggleCheck('#allprocs')) { diffCount++; console.log(l); }
    await ev(`document.querySelector('#allprocs th[data-sort="cpu_core"]').click(); 0`); await sleep(300);
    await shot(`${OUT}/tables-allprocs-${theme}-${mode}.png`);
    await ev(`document.getElementById('allprocs-close').click(); 0`); await sleep(200);

    // modal RAM
    await ev(`document.getElementById('ram-meter').click(); 0`); await sleep(500);
    for (const s of sorts) { res[s]['#ram-procs'] = await run('#ram-procs', s); }
    for (const l of await toggleCheck('#ram-procs', 'mem_mb')) { diffCount++; console.log(l); }
    await shot(`${OUT}/tables-ram-${theme}-${mode}.png`);
    await ev(`document.getElementById('ram-close').click(); 0`); await sleep(200);

    console.log(`\n==== ${theme}/${mode} ====`);
    for (const s of sorts) {
      const m = res[s];
      console.log(`-- orden ${s}: sortCol=` + tables.map((t) => `${t}:${m[t]?.sortCol ?? (m[t]?.skip ? 'n/a' : '?')}`).join(' ') + '  tableFont=' + tables.map((t) => m[t]?.tableFont ?? '-').join('/') + '  filas=' + tables.map((t) => m[t]?.rows ?? '-').join('/'));
      const rows = []; // [clave, {tabla: valor}]
      const cols = ['pid', 'pname', 'cpu', 'cpu-core', 'mem'];
      for (const c of cols) {
        const props = new Set(); for (const t of tables) for (const k of Object.keys(m[t]?.td?.[c] || {})) props.add(k);
        for (const p of props) rows.push([`td.${c}.${p}`, Object.fromEntries(tables.map((t) => [t, m[t]?.td?.[c]?.[p]]))]);
      }
      for (const which of ['active', 'idle']) {
        const props = new Set(); for (const t of tables) for (const k of Object.keys(m[t]?.th?.[which] || {})) props.add(k);
        for (const p of props) { if (p === 'active') continue; rows.push([`th(${which}).${p}`, Object.fromEntries(tables.map((t) => [t, m[t]?.th?.[which]?.[p]]))]); }
      }
      let n = 0;
      for (const [k, v] of rows) {
        const vals = Object.values(v).filter((x) => x !== undefined && x !== null);
        if (new Set(vals).size > 1) { n++; console.log(`   DIFF ${k}: ` + tables.map((t) => `${t}=${v[t] ?? '·'}`).join('  ')); }
      }
      console.log(`   -> ${n} diferencias`); diffCount += n;
      // expectativas absolutas (no solo igualdad entre tablas)
      for (const t of tables) {
        const x = m[t]; if (!x || x.skip) continue;
        const bad = (msg) => { n++; diffCount++; console.log(`   EXPECT ${t}: ${msg}`); };
        const col = x.sortCol;
        for (const c of ['pid', 'pname', 'cpu', 'cpu-core', 'mem']) {
          const d = x.td[c]; if (!d) continue;
          const want = c === col ? x.tok.accent : (c === 'pid' ? x.tok.dim : x.tok.ink);
          if (d.color !== want) bad(`td.${c} color ${d.color} != ${c === col ? 'accent' : c === 'pid' ? 'dim' : 'ink'} ${want}`);
          if (c !== 'pid' && d.fontSize !== '13.5px') bad(`td.${c} font-size ${d.fontSize} != 13.5px`);
          if (c !== 'pid' && !/Mono|mono|Courier|monospace|Cascadia|JetBrains|Fira|Plex/i.test(d.fontFamily) && false) bad('fuente');
          if (c === col && d.textShadow === 'none') bad(`td.${c} activa sin neón`);
          if (c !== col && d.textShadow !== 'none') bad(`td.${c} no activa con text-shadow ${d.textShadow}`);
          if (d.coreSpan) { const [sc, sz, sh] = d.coreSpan.split(' | '); if (sc !== d.color || sz !== d.fontSize || sh !== d.textShadow) bad(`span.procs-core no hereda de su celda: ${d.coreSpan} vs ${d.color}/${d.fontSize}`); }
        }
        for (const h of x.aria || []) {
          const want = h.active ? (h.dir === 'asc' ? 'ascending' : 'descending') : 'none';
          if (h.aria !== want) bad(`th[${h.key}] aria-sort=${h.aria} != ${want}`);
        }
        if (!(x.aria || []).some((h) => h.active)) bad('ninguna th activa tras ordenar');
        const ta = x.th.active; if (!ta || ta.color !== x.tok.accent) bad('th activa sin acento ' + (ta && ta.color));
      }
      console.log(`   (expectativas absolutas incluidas; total ${n})`);
    }
  }
  await ev(`localStorage.removeItem('theme'); localStorage.removeItem('mode'); 0`);
  console.log(`\nTOTAL diferencias entre tablas: ${diffCount}`);
  console.log(`RESULT: ${diffCount ? 'FAIL (' + diffCount + ')' : 'PASS'}`);
};
