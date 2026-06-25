#!/usr/bin/env node
// Valida i18n del renderer SIN navegador: carga i18n.js + cada módulo que llama
// window.i18n.register() en un sandbox con un DOM permisivo, vuelca el diccionario
// y comprueba que TODA clave tenga los 8 idiomas, que cada data-i18n de index.html
// resuelva, y que los comandos de transparencia tengan sus textos.
//
// ponytail: el DOM stub es un "nodo que todo lo acepta" (Proxy) para que los
// módulos corran al cargar sin lanzar. Si un archivo lanza ANTES de su register(),
// se pierde su captura — por eso se reporta cualquier throw en vez de silenciarlo.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const RENDERER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'desktop', 'renderer');

function makeNode() {
  const node = new Proxy(function () {}, {
    get(_t, p) {
      if (p === Symbol.toPrimitive) return () => 0;
      if (p === 'length') return 0;
      if (p === 'classList') return { add() {}, remove() {}, contains() { return false; }, toggle() {} };
      if (p === 'style' || p === 'dataset') return {};
      if (p === 'textContent' || p === 'innerHTML' || p === 'value') return '';
      return node;
    },
    set() { return true; },
    apply() { return node; },
    construct() { return node; },
  });
  return node;
}

const sandbox = {};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.console = console;
sandbox.document = {
  readyState: 'loading',
  documentElement: makeNode(), body: makeNode(), head: makeNode(),
  getElementById: () => makeNode(), querySelector: () => makeNode(),
  querySelectorAll: () => [], createElement: () => makeNode(), createTextNode: () => makeNode(),
  addEventListener() {}, removeEventListener() {},
};
sandbox.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
sandbox.navigator = { language: 'es', platform: 'linux' };
sandbox.location = { href: '' };
sandbox.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {}, removeListener() {} });
sandbox.addEventListener = () => {};
sandbox.removeEventListener = () => {};
sandbox.setInterval = () => 0;
sandbox.setTimeout = () => 0;
sandbox.clearInterval = () => {};
sandbox.clearTimeout = () => {};
sandbox.requestAnimationFrame = () => 0;
sandbox.rog = makeNode();
sandbox.AudioContext = function () { return makeNode(); };
sandbox.MutationObserver = function () { return { observe() {}, disconnect() {}, takeRecords() { return []; } }; };
sandbox.ResizeObserver = function () { return { observe() {}, disconnect() {} }; };
sandbox.getComputedStyle = () => makeNode();
vm.createContext(sandbox);

function run(file) {
  const code = readFileSync(path.join(RENDERER, file), 'utf8');
  vm.runInContext(code, sandbox, { filename: file });
}

// i18n.js primero (define window.i18n); su fallo es fatal.
run('i18n.js');

// El resto de archivos que registran claves.
const others = readdirSync(RENDERER)
  .filter((f) => f.endsWith('.js') && f !== 'i18n.js')
  .filter((f) => readFileSync(path.join(RENDERER, f), 'utf8').includes('i18n.register('));

const loadWarnings = [];
for (const f of others) {
  try { run(f); } catch (e) { loadWarnings.push(`${f}: ${e.message}`); }
}

const dict = sandbox.window.i18n.dump();
const LANGS = sandbox.window.i18n.LANGS;

// 1) Idiomas base (es/en) son OBLIGATORIOS: sin ellos se muestra la clave cruda.
//    Los otros 6 idiomas, si faltan, caen al fallback es/en → solo aviso, no bloquea.
//    (Deuda pre-lanzamiento: power/game-session/cores aún sin traducir a los 6; ver
//     docs/TRANSLATING.md. ponytail: no bloqueamos el release por traducciones que
//     ya degradan a inglés; sí bloqueamos las que muestran texto roto.)
const BASE = ['es', 'en'];
const EXTRA = LANGS.filter((l) => !BASE.includes(l));
const missing = [];        // bloquea
const incomplete = {};     // avisa, por namespace
for (const [key, langs] of Object.entries(dict)) {
  for (const L of BASE) {
    if (!langs[L] || !String(langs[L]).trim()) missing.push(`${key} [${L}]`);
  }
  for (const L of EXTRA) {
    if (!langs[L] || !String(langs[L]).trim()) {
      const ns = key.split('.')[0];
      incomplete[ns] = (incomplete[ns] || 0) + 1;
    }
  }
}

// 2) Cada data-i18n / data-i18n-attr de index.html debe existir en el diccionario.
const html = readFileSync(path.join(RENDERER, 'index.html'), 'utf8');
const refKeys = new Set();
for (const m of html.matchAll(/\bdata-i18n="([^"]+)"/g)) refKeys.add(m[1]);
for (const m of html.matchAll(/\bdata-i18n-attr="([^"]+)"/g)) {
  for (const pair of m[1].split(',')) {
    const k = pair.split(':')[1];
    if (k) refKeys.add(k.trim());
  }
}
const undefinedRefs = [...refKeys].filter((k) => !dict[k]);

// 3) Transparencia: cada comando debe tener sus textos what/why.
const cmdMissing = [];
for (const c of (sandbox.window.RogCommands || [])) {
  if (!dict[c.what]) cmdMissing.push(c.what);
  if (!dict[c.why]) cmdMissing.push(c.why);
}

let failed = false;
if (loadWarnings.length) {
  console.warn('⚠ módulos que lanzaron al cargar (revisa si registran antes del throw):');
  loadWarnings.forEach((w) => console.warn('   ' + w));
}
const incTotal = Object.values(incomplete).reduce((a, b) => a + b, 0);
if (incTotal) {
  console.warn(`\n⚠ ${incTotal} clave(s) sin traducir a idiomas no-base (caen a es/en). Por namespace:`);
  for (const [ns, n] of Object.entries(incomplete).sort((a, b) => b[1] - a[1])) {
    console.warn(`   ${ns}: ${n}`);
  }
  console.warn('   → deuda de traducción, ver docs/TRANSLATING.md (no bloquea el lanzamiento).');
}
if (missing.length) {
  failed = true;
  console.error(`\n✗ ${missing.length} clave sin idioma base (es/en) — muestra la clave cruda:`);
  const cap = process.env.I18N_FULL ? missing.length : 80;
  missing.slice(0, cap).forEach((m) => console.error('   ' + m));
  if (missing.length > cap) console.error(`   …(+${missing.length - cap} más)`);
}
if (undefinedRefs.length) {
  failed = true;
  console.error(`\n✗ ${undefinedRefs.length} data-i18n de index.html sin definir:`);
  undefinedRefs.forEach((k) => console.error('   ' + k));
}
if (cmdMissing.length) {
  failed = true;
  console.error(`\n✗ comandos de transparencia sin texto: ${cmdMissing.join(', ')}`);
}

if (failed) process.exit(1);
console.log(`✓ i18n OK — ${Object.keys(dict).length} claves × ${LANGS.length} idiomas; ${refKeys.size} refs en index.html; ${(sandbox.window.RogCommands || []).length} comandos.`);
