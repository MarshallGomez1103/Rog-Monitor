'use strict';
// N-C-02 / N-C-03: el roadmap vive en dos sitios (docs/roadmap.md y desktop/renderer/roadmap.js).
// Este test los obliga a coincidir en estados (hecho / parcial / futuro / pendiente), a mencionar v22,
// a no prometer de más (overlay y benchmarks PARCIALES, Guardian 2.0 y helper único FUTURO) y a que
// cada texto del roadmap de la app exista de verdad en los 8 idiomas (no solo "tiene 8 claves").
// roadmap.js es un script clásico (sin exports): se evalúa en un vm con window/document mínimos.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const JS_SRC = fs.readFileSync(path.join(ROOT, 'desktop', 'renderer', 'roadmap.js'), 'utf8');
const MD_SRC = fs.readFileSync(path.join(ROOT, 'docs', 'roadmap.md'), 'utf8');
const LANGS = ['es', 'en', 'fr', 'it', 'pt', 'zh', 'ja', 'ko'];

// ---------- carga de roadmap.js ----------
const registered = {};
const sandbox = {
  console,
  __lang: 'es',
  window: {
    i18n: {
      register(map) { Object.assign(registered, map); },
      get() { return sandbox.__lang; },
      onChange() {},
    },
  },
  document: { getElementById() { return null; }, addEventListener() {} },
};
vm.createContext(sandbox);
vm.runInContext(JS_SRC, sandbox);
const { ROADMAP_CURRENT, ROADMAP_DONE, ROADMAP_TODO } = vm.runInContext(
  '({ ROADMAP_CURRENT, ROADMAP_DONE, ROADMAP_TODO })', sandbox);

// ---------- (1) 8 idiomas reales ----------
// Nombres propios / siglas que pueden coincidir con el inglés.
const SAME_AS_EN_OK = new Set(['AMD', 'Roadmap', 'OpenRGB', 'RGB completo']);
const isMap = (v) => v && typeof v === 'object' && !Array.isArray(v) && ('es' in v || 'en' in v);

function walkMaps(node, where, out) {
  if (Array.isArray(node)) { node.forEach((n, i) => walkMaps(n, `${where}[${i}]`, out)); return out; }
  if (isMap(node)) { out.push({ where, map: node }); return out; }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) walkMaps(v, `${where}.${k}`, out);
  }
  return out;
}

const ALL_MAPS = [
  ...walkMaps(ROADMAP_CURRENT, 'CURRENT', []),
  ...walkMaps(ROADMAP_DONE, 'DONE', []),
  ...walkMaps(ROADMAP_TODO, 'TODO', []),
  ...Object.entries(registered).map(([k, map]) => ({ where: `register.${k}`, map })),
];

test('hay textos que revisar (el recorrido no es vacío)', () => {
  assert.ok(ALL_MAPS.length > 200, `solo ${ALL_MAPS.length} mapas de texto`);
});

test('ningún campo traducible del roadmap es un string suelto (todo es mapa de 8 idiomas)', () => {
  const bad = [];
  const need = (obj, keys, where) => {
    for (const k of keys) if (obj[k] != null && typeof obj[k] === 'string') bad.push(`${where}.${k}`);
  };
  need(ROADMAP_CURRENT, ['label'], 'CURRENT');
  ROADMAP_CURRENT.features.forEach((f, i) => { if (typeof f === 'string') bad.push(`CURRENT.features[${i}]`); });
  ROADMAP_DONE.forEach((d, i) => {
    need(d, ['title'], `DONE[${i}]`);
    (d.points || []).forEach((p, j) => { if (typeof p === 'string') bad.push(`DONE[${i}].points[${j}]`); });
  });
  ROADMAP_TODO.forEach((ph, i) => {
    need(ph, ['phase', 'note'], `TODO[${i}]`);
    (ph.items || []).forEach((it, j) => {
      need(it, ['title'], `TODO[${i}].items[${j}]`);
      (it.points || []).forEach((p, k) => { if (typeof p === 'string') bad.push(`TODO[${i}].items[${j}].points[${k}]`); });
    });
  });
  assert.deepStrictEqual(bad, []);
});

test('cada texto tiene exactamente es,en,fr,it,pt,zh,ja,ko y ninguno vacío', () => {
  const bad = [];
  for (const { where, map } of ALL_MAPS) {
    const keys = Object.keys(map).sort();
    if (keys.join() !== [...LANGS].sort().join()) bad.push(`${where}: claves ${keys.join('/')}`);
    for (const l of LANGS) {
      if (typeof map[l] !== 'string' || !map[l].trim()) bad.push(`${where}.${l}: vacío`);
    }
  }
  assert.deepStrictEqual(bad, []);
});

test('las traducciones son reales: distintas del inglés (salvo nombres propios) y con el alfabeto correcto', () => {
  const bad = [];
  const HAN = /[一-鿿]/;
  const KANA = /[぀-ヿ]/;
  const HANGUL = /[가-힯]/;
  for (const { where, map } of ALL_MAPS) {
    const en = map.en;
    for (const l of ['es', 'fr', 'it', 'pt', 'zh', 'ja', 'ko']) {
      if (map[l] === en && !SAME_AS_EN_OK.has(en)) bad.push(`${where}.${l}: igual al inglés «${en.slice(0, 40)}»`);
    }
    if (!HAN.test(map.zh) && !SAME_AS_EN_OK.has(en)) bad.push(`${where}.zh: sin caracteres chinos`);
    if (!KANA.test(map.ja) && !HAN.test(map.ja) && !SAME_AS_EN_OK.has(en)) bad.push(`${where}.ja: sin kana/kanji`);
    if (!HANGUL.test(map.ko) && !SAME_AS_EN_OK.has(en)) bad.push(`${where}.ko: sin hangul`);
    // Una traducción tampoco puede ser el texto español pegado (salvo coincidencias legítimas cortas).
    for (const l of ['fr', 'it', 'pt', 'zh', 'ja', 'ko']) {
      if (map[l] === map.es && map.es.length > 25) bad.push(`${where}.${l}: igual al español`);
    }
  }
  assert.deepStrictEqual(bad, []);
});

test('las etiquetas estáticas registradas (título, HECHO, POR HACER, Cerrar) existen en los 8 idiomas', () => {
  for (const k of ['roadmap.title', 'roadmap.done', 'roadmap.todo', 'roadmap.current', 'common.close']) {
    assert.ok(registered[k], `falta ${k}`);
    for (const l of LANGS) assert.ok(registered[k][l] && registered[k][l].trim(), `${k}.${l}`);
  }
});

test('el modal renderiza en cada idioma con el texto de ese idioma (no cae a español/inglés)', () => {
  const esc = (s) => vm.runInContext('_escHtml', sandbox)(s);
  const build = vm.runInContext('_buildRoadmapContent', sandbox);
  const pillMaps = [ROADMAP_CURRENT.label];
  const titleMaps = [
    ...ROADMAP_DONE.map((d) => d.title),
    ...ROADMAP_TODO.flatMap((ph) => [ph.phase, ph.note, ...ph.items.map((i) => i.title)]),
  ];
  const pointMaps = [
    ...ROADMAP_CURRENT.features,
    ...ROADMAP_DONE.flatMap((d) => d.points),
    ...ROADMAP_TODO.flatMap((ph) => ph.items.flatMap((i) => i.points)),
  ];
  for (const lang of LANGS) {
    sandbox.__lang = lang;
    const html = build();
    for (const m of [...pillMaps, ...titleMaps, ...pointMaps]) {
      assert.ok(html.includes(esc(m[lang])), `${lang}: no aparece «${m[lang].slice(0, 50)}»`);
    }
  }
  sandbox.__lang = 'es';
});

test('_loc cae a es, luego a en, si el idioma activo no existe', () => {
  const loc = vm.runInContext('_loc', sandbox);
  sandbox.__lang = 'xx';
  assert.strictEqual(loc({ es: 'hola', en: 'hi' }), 'hola');
  assert.strictEqual(loc({ en: 'hi' }), 'hi');
  sandbox.__lang = 'es';
});

// ---------- (3) versiones ----------
test('la cabecera y la versión actual no están viejas; v22 aparece en la app y en el .md', () => {
  assert.match(JS_SRC.split('\n')[0], /Roadmap \(v22\)/);
  assert.strictEqual(ROADMAP_CURRENT.version, undefined, 'el pill no lleva versión (solo Ayuda > Acerca de)');
  assert.ok(ROADMAP_DONE.some((d) => /^v22/.test(d.version)), 'falta la entrada v22 en HECHO');
  assert.match(MD_SRC, /^## In progress — v22/m);
  assert.match(MD_SRC, /^## Current \(done\) — through v21/m);
  // La entrada v22 es la última de HECHO y las fechas no retroceden.
  assert.match(ROADMAP_DONE[ROADMAP_DONE.length - 1].version, /^v22/);
  const dates = Array.from(ROADMAP_DONE, (d) => d.date);
  assert.deepStrictEqual([...dates].sort(), dates);
});

// ---------- (2) correspondencia semántica .md <-> .js ----------
function parseMd(src) {
  const bullets = [];
  let section = '';
  let cur = null;
  for (const line of src.split('\n')) {
    const h = /^## (.*)/.exec(line);
    if (h) { section = h[1]; cur = null; continue; }
    const b = /^\* \[( |x|~)\] (.*)/.exec(line);
    if (b) { cur = { mark: b[1], text: b[2], section }; bullets.push(cur); continue; }
    if (cur && /^ {2,}\S/.test(line)) { cur.text += ' ' + line.trim(); continue; }
    if (!line.trim() || /^\* /.test(line) || /^#/.test(line)) cur = null;
  }
  return bullets;
}
const MD = parseMd(MD_SRC);

function mdState(b) {
  if (b.mark === 'x') return 'done';
  if (b.mark === '~') return 'partial';
  return /\*future\b/i.test(b.text) ? 'future' : 'todo';
}

// Estado de un ítem de POR HACER en la app: lo dice su primer punto «Status: …».
const STATUS_RE = { partial: /^Status: PARTIAL/, future: /^Status: FUTURE/ };
function jsTodoState(item) {
  const first = item.points[0].en;
  if (STATUS_RE.partial.test(first)) return 'partial';
  if (STATUS_RE.future.test(first)) return 'future';
  return 'todo';
}
const TODO_ITEMS = ROADMAP_TODO.flatMap((ph) => ph.items.map((it) => ({ ...it, phaseEn: ph.phase.en })));
const findTodo = (re) => TODO_ITEMS.filter((it) => re.test(it.title.en));

const V22 = ROADMAP_DONE.find((d) => /^v22/.test(d.version));
const doneTexts = (entry) => (entry ? entry.points.map((p) => p.en) : []);
const ALL_DONE_EN = [
  ...ROADMAP_CURRENT.features.map((f) => f.en),
  ...ROADMAP_DONE.flatMap((d) => d.points.map((p) => p.en)),
];

// Ítems de POR HACER (las dos fuentes deben coincidir en estado y en fase P1/P2/P3).
const TODO_MAP = [
  { id: 'overlay', state: 'partial', phase: 'P1', md: /Customizable overlay/, js: /^Customizable overlay$/ },
  { id: 'per-game', state: 'todo', phase: 'P1', md: /Per-game \/ per-application profiles/, js: /^Per-game \/ per-app profiles$/ },
  { id: 'benchmarks', state: 'partial', phase: 'P1', md: /Serious benchmarks/, js: /^Serious benchmarks/ },
  { id: 'guardian2', state: 'future', phase: 'P1', md: /\*\*Guardian 2\.0\*\*/, js: /^Guardian 2\.0$/ },
  { id: 'helper', state: 'future', phase: 'P1', md: /\*\*Single privileged helper\*\*/, js: /^Single privileged helper$/ },
  { id: 'amd', state: 'todo', phase: 'P2', md: /\*\*AMD\*\*/, js: /^AMD$/ },
  { id: 'flatpak', state: 'todo', phase: 'P2', md: /Packaging — Flatpak/, js: /Flatpak/ },
  { id: 'disk-depth', state: 'todo', phase: 'P2', md: /\*\*Disk depth\*\*/, js: /^Disk depth/ },
  { id: 'provenance', state: 'todo', phase: 'P2', md: /System provenance/, js: /provenance/i },
  { id: 'drivers', state: 'todo', phase: 'P2', md: /\*\*Driver manager\*\*/, js: /^Driver manager$/ },
  { id: 'layout', state: 'todo', phase: 'P2', md: /Smarter, space-aware layout/, js: /space/i },
  { id: 'coolercontrol', state: 'todo', phase: 'P2', md: /CoolerControl-level fans/, js: /CoolerControl/ },
  { id: 'rgb', state: 'todo', phase: 'P2', md: /\*\*Full RGB\*\*/, js: /^Full RGB$/ },
  { id: 'history', state: 'todo', phase: 'P3', md: /\*\*Persistent history\*\*/, js: /^Persistent history/ },
  { id: 'crowd', state: 'todo', phase: 'P3', md: /Crowdsourced device profiles/, js: /^Crowdsourced/ },
  { id: 'plasma', state: 'todo', phase: 'P3', md: /\*\*Plasma widget\*\*/, js: /^Plasma widget/ },
  { id: 'windows', state: 'todo', phase: 'P3', md: /\*\*Windows app\*\*/, js: /^Windows app$/ },
];

for (const it of TODO_MAP) {
  test(`pendiente «${it.id}»: ${it.state} y en ${it.phase} en el .md y en la app`, () => {
    const md = MD.filter((b) => it.md.test(b.text));
    assert.strictEqual(md.length, 1, `el .md debe tener exactamente 1 viñeta (hay ${md.length})`);
    assert.strictEqual(mdState(md[0]), it.state, `.md: «${md[0].text.slice(0, 60)}»`);
    assert.ok(md[0].section.startsWith(it.phase), `.md: fase ${md[0].section}`);
    const js = findTodo(it.js);
    assert.strictEqual(js.length, 1, `la app debe tener exactamente 1 ítem (hay ${js.length})`);
    assert.strictEqual(jsTodoState(js[0]), it.state, `app: ${js[0].title.en}`);
    assert.ok(js[0].phaseEn.startsWith(it.phase), `app: fase ${js[0].phaseEn}`);
  });
}

test('PARCIAL/FUTURO se dicen en los 8 idiomas en la primera línea de cada ítem con estado', () => {
  const MARK = {
    partial: { es: 'PARCIAL', en: 'PARTIAL', fr: 'PARTIEL', it: 'PARZIALE', pt: 'PARCIAL', zh: '部分', ja: '一部', ko: '부분' },
    future: { es: 'FUTURO', en: 'FUTURE', fr: 'FUTUR', it: 'FUTURO', pt: 'FUTURO', zh: '未来', ja: '将来', ko: '향후' },
  };
  for (const it of TODO_MAP.filter((m) => m.state !== 'todo')) {
    const item = findTodo(it.js)[0];
    for (const l of LANGS) {
      const first = item.points[0][l];
      assert.ok(first.includes(MARK[it.state][l]), `${it.id}.${l}: falta «${MARK[it.state][l]}» en «${first.slice(0, 50)}»`);
      const other = it.state === 'partial' ? 'future' : 'partial';
      assert.ok(!first.includes(MARK[other][l]) || l === 'es' || l === 'pt', `${it.id}.${l}: mezcla estados`);
    }
    // Guardian/helper siguen diciendo qué existe ya (v21); overlay/benchmarks, qué falta.
    assert.match(item.points[0].en, /done|Done|already|Already/i);
  }
});

test('Guardian 2.0 y helper único figuran como FUTURO (decisión del propietario) en ambos documentos', () => {
  for (const re of [/\*\*Guardian 2\.0\*\*/, /\*\*Single privileged helper\*\*/]) {
    const b = MD.find((x) => re.test(x.text));
    assert.ok(b && b.mark === ' ' && /\*future\b/i.test(b.text), `.md: ${re}`);
    assert.ok(!/\*partial\*/i.test(b.text), `.md ${re}: no debe decir partial`);
    assert.match(b.text, /owner decision/i);
    assert.match(b.text, /Done \(v21\)/);
  }
  for (const re of [/^Guardian 2\.0$/, /^Single privileged helper$/]) {
    const it = findTodo(re)[0];
    assert.match(it.points[0].en, /^Status: FUTURE/);
    assert.match(it.points[0].en, /owner/i);
  }
  // Lo hecho en v21 ya no se vende como «Guardián 2.0» en el historial.
  const vendido = ALL_DONE_EN.filter((t) => /Guardian 2\.0|Gardien 2\.0/.test(t));
  assert.deepStrictEqual(vendido, []);
  for (const d of ROADMAP_DONE) {
    for (const p of d.points) for (const l of LANGS) assert.ok(!/2\.0/.test(p[l]) || !/(Guardi|Gardien|守护|ガーディアン|가디언)/.test(p[l]), `DONE ${d.version}.${l}`);
  }
});

test('overlay y benchmarks siguen PARCIALES con su lista de lo que falta; Path Tracing no se anuncia', () => {
  const ov = MD.find((b) => /Customizable overlay/.test(b.text));
  const bm = MD.find((b) => /Serious benchmarks/.test(b.text));
  assert.strictEqual(ov.mark, '~');
  assert.strictEqual(bm.mark, '~');
  assert.match(ov.text, /\*partial\*/);
  assert.match(bm.text, /\*partial\*/);
  assert.match(ov.text, /Missing:[^]*CPU-usage metrics/);
  assert.match(ov.text, /Missing:[^]*KDE Wayland/);
  assert.match(bm.text, /Missing:[^]*Path Tracing/);
  assert.ok(bm.text.indexOf('Path Tracing') > bm.text.indexOf('Missing'), 'Path Tracing solo bajo «Missing»');
  const jsOv = findTodo(/^Customizable overlay$/)[0].points[0];
  assert.match(jsOv.en, /Missing:[^]*CPU usage/i);
  assert.match(jsOv.en, /Missing:[^]*KDE Wayland/);
  for (const l of LANGS) assert.ok(/KDE Wayland/.test(jsOv[l]), `overlay.${l}: KDE Wayland`);
  const jsBm = findTodo(/^Serious benchmarks/)[0];
  const ptIdx = jsBm.points.findIndex((p) => /Path Tracing/.test(p.en));
  assert.ok(ptIdx > 0, 'Path Tracing no puede ser el punto de estado');
  assert.ok(!/Path Tracing/.test(jsBm.points[0].en));
  // Nunca en la sección de lo hecho, ni en el .md fuera de benchmarks.
  assert.deepStrictEqual(ALL_DONE_EN.filter((t) => /Path Tracing/i.test(t)), []);
  assert.deepStrictEqual(MD.filter((b) => /Path Tracing/.test(b.text) && b !== bm), []);
  assert.ok(!/Path Tracing/i.test(MD_SRC.split('## P1')[0]), 'Path Tracing no se menciona en lo hecho/v22 del .md');
});

test('alineaciones puntuales: telemetría local del Guardián y métricas de CPU del overlay en ambos documentos', () => {
  const g = MD.find((b) => /\*\*Guardian 2\.0\*\*/.test(b.text)).text;
  assert.match(g, /local telemetry/i);
  const gjs = findTodo(/^Guardian 2\.0$/)[0].points.map((p) => p.en).join(' ');
  assert.match(gjs, /Local telemetry/i);
  const d = MD.find((b) => /\*\*Disk depth\*\*/.test(b.text)).text;
  assert.match(d, /SMART self-tests/);
  assert.match(d, /predictive/i);
  assert.match(d, /temperature\s+history/i);
  const djs = findTodo(/^Disk depth/)[0].points.map((p) => p.en).join(' ');
  assert.match(djs, /SMART self-tests/);
  assert.match(djs, /predictive/i);
  assert.match(djs, /temperature history/i);
});

// Batería: el límite de carga ya está hecho (battery.js, commands.js) -> en «hecho», no en «por hacer».
test('batería: límite de carga HECHO en ambos y fuera de POR HACER', () => {
  const b = MD.filter((x) => /charge-limit|charge limit/i.test(x.text));
  assert.ok(b.length >= 1);
  assert.ok(b.every((x) => x.mark === 'x' && /^Current/.test(x.section)), '.md: debe estar [x] en Current');
  assert.deepStrictEqual(MD.filter((x) => /^P[123]/.test(x.section) && /Battery/.test(x.text)), []);
  assert.strictEqual(findTodo(/Batter/i).length, 0, 'la app no lo lista como pendiente');
  const txt = ALL_DONE_EN.filter((t) => /charge limit/i.test(t));
  assert.ok(txt.length >= 1, 'la app lo lista como hecho');
  // Y de verdad existe en el código.
  assert.match(fs.readFileSync(path.join(ROOT, 'desktop', 'renderer', 'battery.js'), 'utf8'), /battery\.limit/);
  assert.match(fs.readFileSync(path.join(ROOT, 'desktop', 'renderer', 'commands.js'), 'utf8'), /battery-limit/);
  for (const t of ROADMAP_CURRENT.features.concat(ROADMAP_DONE.flatMap((d) => d.points))) {
    if (/charge limit/i.test(t.en)) for (const l of LANGS) assert.ok(t[l].trim(), `charge limit.${l}`);
  }
});

// Lo hecho en v22: cada hecho está en el .md ([x], sección v22) y en la entrada v22 de la app,
// y su traducción conserva los datos que no se traducen (cifras, nombres de archivo).
const V22_MAP = [
  { id: 'metrics-cpu', md: /usage %/, js: /Usage % on the CPU card/, tokens: ['0-100'] },
  { id: 'fans-stuck', md: /stay stuck high/, js: /stayed stuck high/, tokens: [] },
  { id: 'alerts-iops', md: /disk-full alerts/, js: /disk-full alerts/, tokens: [] },
  { id: 'chart-editor', md: /chart editor/i, js: /chart editor/i, tokens: [] },
  { id: 'no-data', md: /NO DATA/, js: /NO DATA/, tokens: ['6'] },
  { id: 'bench-undo', md: /Undo/, js: /Undo/, tokens: [] },
  { id: 'proc-tables', md: /aria-sort/, js: /aria-sort/, tokens: ['aria-sort'] },
  { id: 'fans-reactive', md: /Reactive fans/, js: /Reactive fans/, tokens: ['50 °C', '3000', 'PL1/PL2', 'install-system.sh'] },
  { id: 'robustness', md: /failing reader/, js: /failing reader/, tokens: ['null'] },
  { id: 'battery-uah', md: /µAh/, js: /µAh/, tokens: ['µAh', 'Wh'] },
  { id: 'coverage-ci', md: /coverage/i, js: /coverage/i, tokens: ['80', '90', '95'] },
  { id: 'electron', md: /Electron 44/, js: /Electron 44/, tokens: ['Electron 44'] },
  { id: 'atomic-tui', md: /atomic config writes/, js: /atomic/, tokens: ['TUI'] },
];

for (const it of V22_MAP) {
  test(`v22 hecho «${it.id}» figura [x] en el .md y en la entrada v22 de la app, en 8 idiomas`, () => {
    const mdHits = MD.filter((b) => /^In progress — v22/.test(b.section) && it.md.test(b.text));
    assert.ok(mdHits.length >= 1, '.md: falta en la sección v22');
    assert.ok(mdHits.every((b) => b.mark === 'x'), '.md: debe estar [x]');
    const jsHits = V22 ? V22.points.filter((p) => it.js.test(p.en)) : [];
    assert.ok(jsHits.length >= 1, 'app: falta en la entrada v22');
    for (const p of jsHits) {
      for (const l of LANGS) {
        for (const tok of it.tokens) assert.ok(p[l].includes(tok), `app.${l}: falta «${tok}» en «${p[l].slice(0, 60)}»`);
      }
    }
  });
}

test('lo parcial/pendiente de v22 no se cuela como hecho: nada de Guardian real, helper, Path Tracing ni overlay completo en v22', () => {
  const v22en = doneTexts(V22).join(' ');
  assert.ok(!/Guardian 2\.0|polkit|Path Tracing|themes\/skins/i.test(v22en));
  const mdV22 = MD.filter((b) => /^In progress — v22/.test(b.section)).map((b) => b.text).join(' ');
  assert.ok(!/Guardian 2\.0|polkit|Path Tracing|themes\/skins/i.test(mdV22));
});
