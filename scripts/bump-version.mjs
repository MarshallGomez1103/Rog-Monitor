#!/usr/bin/env node
// Versión única (V22-D10): el archivo VERSION es la fuente; este script propaga una versión
// nueva a las copias literales y comprueba que ninguna diverja. Solo módulos de node.
//
//   node scripts/bump-version.mjs 22.1.0            escribe VERSION + package.json + package-lock.json
//   node scripts/bump-version.mjs 22.1.0 --dry-run  lo mismo sin escribir
//   node scripts/bump-version.mjs --check           falla (exit 1) si alguna copia difiere de VERSION
//   --root <dir>                                     raíz alternativa (tests)
//
// Lo que NO es literal y se lee solo de VERSION: src/rog_monitor/__init__.py, desktop/main.js
// (APP_VERSION, export de config, ventana Ayuda > Acerca de) y el helper root instalado
// (install-system.sh copia VERSION; la app compara ambos).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEMVER = /^\d+\.\d+\.\d+$/;

const readText = (root, rel) => readFileSync(path.join(root, rel), 'utf8');
const has = (root, rel) => existsSync(path.join(root, rel));

/** Indentado de un JSON ya formateado (2 por defecto) y si acaba en salto de línea. */
function jsonFormat(text) {
  const m = /^\{\r?\n([ \t]+)"/.exec(text);
  return { indent: m ? m[1] : '  ', eol: text.endsWith('\n') ? '\n' : '' };
}

/** Lista de {rel, set(data, version)} de las copias JSON gestionadas por el script. */
const JSON_COPIES = [
  { rel: 'desktop/package.json', set: (d, v) => { d.version = v; } },
  { rel: 'desktop/package-lock.json', set: (d, v) => { d.version = v; if (d.packages && d.packages['']) d.packages[''].version = v; } },
];

/** Problemas de coherencia respecto a VERSION; [] = todo coincide. */
export function checkVersions(root = DEFAULT_ROOT) {
  const fails = [];
  if (!has(root, 'VERSION')) return ['VERSION: no existe (es la fuente única)'];
  const version = readText(root, 'VERSION').trim();
  if (!SEMVER.test(version)) return [`VERSION: "${version}" no es semver X.Y.Z`];

  const cmp = (label, found) => { if (found !== version) fails.push(`${label}: dice "${found}", VERSION dice "${version}"`); };
  if (has(root, 'desktop/package.json')) {
    cmp('desktop/package.json', JSON.parse(readText(root, 'desktop/package.json')).version);
  } else fails.push('desktop/package.json: no existe');
  if (has(root, 'desktop/package-lock.json')) {
    const lock = JSON.parse(readText(root, 'desktop/package-lock.json'));
    cmp('desktop/package-lock.json (version)', lock.version);
    cmp('desktop/package-lock.json (packages[""])', lock.packages && lock.packages[''] && lock.packages[''].version);
  } else fails.push('desktop/package-lock.json: no existe');

  // Copias opcionales (existen en el repo real; en árboles de prueba pueden faltar).
  if (has(root, 'desktop/renderer/roadmap.js')) {
    const all = [...readText(root, 'desktop/renderer/roadmap.js').matchAll(/\bversion:\s*'v(\d+\.\d+\.\d+)'/g)].map((m) => m[1]);
    if (all.length && all[all.length - 1] !== version) {
      fails.push(`desktop/renderer/roadmap.js: la última entrada del historial es v${all[all.length - 1]}, VERSION dice "${version}"`);
    }
  }
  if (has(root, 'CHANGELOG.md')) {
    const heads = [...readText(root, 'CHANGELOG.md').matchAll(/^## (\S+)/gm)].map((m) => m[1]).filter((h) => !/^unreleased/i.test(h));
    if (heads.length && heads[0] !== version) fails.push(`CHANGELOG.md: la última versión publicada es "${heads[0]}", VERSION dice "${version}"`);
  }
  if (has(root, 'docs/roadmap.md')) {
    const m = /^## Current \(done\) — through v(\d+)\b/m.exec(readText(root, 'docs/roadmap.md'));
    const major = version.split('.')[0];
    if (m && m[1] !== major) fails.push(`docs/roadmap.md: "through v${m[1]}", VERSION dice mayor ${major}`);
  }
  return fails;
}

const CHECKLIST = (v) => [
  'Pendiente a mano (el script no inventa texto):',
  `  [ ] CHANGELOG.md: encabezado "## ${v} — AAAA-MM-DD" con las secciones de la versión`,
  `  [ ] desktop/renderer/roadmap.js: nueva entrada "v${v}" en ROADMAP_DONE (8 idiomas, al final)`,
  `  [ ] docs/roadmap.md: "Current (done) — through v${v.split('.')[0]}" y la lista de lo nuevo`,
  '  [ ] README.md: nota de actualización si cambian scripts root (la app pedirá reinstalar: VERSION cambia)',
  '  [ ] node scripts/bump-version.mjs --check && node --test desktop/test/*.test.js',
  '  [ ] sudo bash scripts/install-system.sh (copia VERSION al helper root; sin esto la app pide reinstalar)',
];

export function main(argv = process.argv.slice(2), out = console) {
  let root = DEFAULT_ROOT;
  let dry = false;
  let check = false;
  const pos = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--root') { root = path.resolve(argv[i + 1] || ''); i += 1; }
    else if (argv[i] === '--dry-run') dry = true;
    else if (argv[i] === '--check') check = true;
    else pos.push(argv[i]);
  }

  if (check) {
    const fails = checkVersions(root);
    if (fails.length === 0) { out.log(`bump-version: OK (todas las copias coinciden con VERSION ${readText(root, 'VERSION').trim()})`); return 0; }
    for (const f of fails) out.error(`FAIL ${f}`);
    out.error(`bump-version: ${fails.length} copia(s) divergente(s); usa: node scripts/bump-version.mjs X.Y.Z`);
    return 1;
  }

  const version = (pos[0] || '').trim();
  if (!SEMVER.test(version)) {
    out.error(`uso: node scripts/bump-version.mjs X.Y.Z [--dry-run] | --check   (recibido: "${pos[0] ?? ''}")`);
    return 1;
  }

  const writes = [{ rel: 'VERSION', text: `${version}\n` }];
  for (const c of JSON_COPIES) {
    if (!has(root, c.rel)) { out.error(`falta ${c.rel}`); return 1; }
    const raw = readText(root, c.rel);
    const { indent, eol } = jsonFormat(raw);
    const data = JSON.parse(raw);
    c.set(data, version);
    writes.push({ rel: c.rel, text: JSON.stringify(data, null, indent) + eol });
  }
  for (const w of writes) {
    if (!dry) writeFileSync(path.join(root, w.rel), w.text);
    out.log(`${dry ? '[dry-run] ' : ''}${w.rel} -> ${version}`);
  }
  for (const line of CHECKLIST(version)) out.log(line);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
