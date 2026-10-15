'use strict';
// V22-D10: una sola fuente de versión (archivo VERSION). Este test falla si cualquier copia
// (package.json, package-lock.json en sus dos campos, roadmap, CHANGELOG) diverge, y prueba
// scripts/bump-version.mjs sobre un árbol temporal (nunca toca el repo real).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const VERSION = read('VERSION').trim();

let mod;
test.before(async () => { mod = await import(path.join(ROOT, 'scripts', 'bump-version.mjs')); });

const sink = () => { const l = []; return { lines: l, log: (s) => l.push(String(s)), error: (s) => l.push(String(s)) }; };

/** Árbol mínimo con las copias que el script gestiona (y las que solo comprueba). */
function fixture({ version = '1.2.3', lockRoot = version, lockPkg = version, pkg = version } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rog-ver-'));
  fs.mkdirSync(path.join(dir, 'desktop'));
  fs.writeFileSync(path.join(dir, 'VERSION'), `${version}\n`);
  fs.writeFileSync(path.join(dir, 'desktop', 'package.json'),
    `${JSON.stringify({ name: 'rog-monitor', version: pkg, main: 'main.js' }, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, 'desktop', 'package-lock.json'),
    `${JSON.stringify({ name: 'rog-monitor', version: lockRoot, lockfileVersion: 3, packages: { '': { name: 'rog-monitor', version: lockPkg }, 'node_modules/x': { version: '9.9.9' } } }, null, 2)}\n`);
  return dir;
}
const cleanup = (dir) => fs.rmSync(dir, { recursive: true, force: true });

// ---------------------------------------------------------------- repo real
test('VERSION es semver X.Y.Z', () => {
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
});

test('package.json coincide con VERSION', () => {
  assert.equal(JSON.parse(read('desktop/package.json')).version, VERSION);
});

test('package-lock.json coincide con VERSION en la raíz y en packages[""]', () => {
  const lock = JSON.parse(read('desktop/package-lock.json'));
  assert.equal(lock.version, VERSION, 'lock.version');
  assert.equal(lock.packages[''].version, VERSION, 'lock.packages[""].version');
});

test('el comprobador del script no encuentra ninguna copia divergente en el repo', () => {
  assert.deepEqual(mod.checkVersions(ROOT), []);
});

test('main.js lee la versión solo de VERSION (sin package.json ni variable de entorno)', () => {
  const main = read('desktop/main.js');
  assert.ok(!/require\(['"]\.\/package\.json['"]\)\.version/.test(main), 'main.js no debe leer la versión de package.json');
  assert.ok(!/ROG_MONITOR_VERSION/.test(main), 'sin ROG_MONITOR_VERSION');
});

test('ROADMAP_CURRENT ya no lleva literal de versión (el pill no la muestra)', () => {
  const js = read('desktop/renderer/roadmap.js');
  const cur = js.slice(js.indexOf('const ROADMAP_CURRENT'), js.indexOf('features:'));
  assert.ok(!/version\s*:/.test(cur), 'ROADMAP_CURRENT.version debe desaparecer');
  assert.ok(!/NOTA: mantener esta versión/.test(js));
});

// ---------------------------------------------------------------- comprobador
test('checkVersions detecta package.json, lock raíz y lock packages[""] divergentes', () => {
  for (const [opts, needle] of [
    [{ pkg: '9.9.9' }, 'desktop/package.json'],
    [{ lockRoot: '9.9.9' }, 'package-lock.json (version)'],
    [{ lockPkg: '9.9.9' }, 'package-lock.json (packages[""])'],
  ]) {
    const dir = fixture(opts);
    try {
      const fails = mod.checkVersions(dir);
      assert.equal(fails.length, 1, JSON.stringify(fails));
      assert.ok(fails[0].includes(needle), fails[0]);
      assert.ok(fails[0].includes('9.9.9') && fails[0].includes('1.2.3'));
    } finally { cleanup(dir); }
  }
});

test('checkVersions detecta VERSION inválida y roadmap/CHANGELOG/docs con otra versión', () => {
  const dir = fixture();
  try {
    fs.mkdirSync(path.join(dir, 'desktop', 'renderer'));
    fs.mkdirSync(path.join(dir, 'docs'));
    fs.writeFileSync(path.join(dir, 'desktop', 'renderer', 'roadmap.js'), "x = [{ version: 'v1.2.3' }, { version: 'v1.9.0' }];\n");
    fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), '# Changelog\n\n## 1.2.0 — 2026-01-01\n');
    fs.writeFileSync(path.join(dir, 'docs', 'roadmap.md'), '## Current (done) — through v0\n');
    const fails = mod.checkVersions(dir).join('\n');
    assert.match(fails, /roadmap\.js/);
    assert.match(fails, /CHANGELOG\.md/);
    assert.match(fails, /docs\/roadmap\.md/);
    fs.writeFileSync(path.join(dir, 'VERSION'), 'abc\n');
    assert.match(mod.checkVersions(dir).join('\n'), /VERSION.*semver/);
    fs.rmSync(path.join(dir, 'VERSION'));
    assert.match(mod.checkVersions(dir).join('\n'), /VERSION/);
  } finally { cleanup(dir); }
});

// ---------------------------------------------------------------- bump
test('bump escribe VERSION, package.json y package-lock (raíz y packages[""]) conservando el formato', () => {
  const dir = fixture();
  try {
    const out = sink();
    assert.equal(mod.main(['3.4.5', '--root', dir], out), 0);
    assert.equal(fs.readFileSync(path.join(dir, 'VERSION'), 'utf8'), '3.4.5\n');
    const rawPkg = fs.readFileSync(path.join(dir, 'desktop', 'package.json'), 'utf8');
    assert.ok(rawPkg.endsWith('}\n') && rawPkg.includes('\n  "version": "3.4.5"'), 'indentado de 2 espacios y salto final');
    const lock = JSON.parse(fs.readFileSync(path.join(dir, 'desktop', 'package-lock.json'), 'utf8'));
    assert.equal(lock.version, '3.4.5');
    assert.equal(lock.packages[''].version, '3.4.5');
    assert.equal(lock.packages['node_modules/x'].version, '9.9.9', 'no toca dependencias');
    assert.deepEqual(mod.checkVersions(dir), []);
    assert.match(out.lines.join('\n'), /CHANGELOG/);
    assert.match(out.lines.join('\n'), /roadmap/i);
  } finally { cleanup(dir); }
});

test('bump respeta el indentado existente (4 espacios) y --dry-run no escribe nada', () => {
  const dir = fixture();
  try {
    const p = path.join(dir, 'desktop', 'package.json');
    fs.writeFileSync(p, JSON.stringify(JSON.parse(fs.readFileSync(p, 'utf8')), null, 4) + '\n');
    const before = fs.readFileSync(p, 'utf8');
    assert.equal(mod.main(['4.0.0', '--root', dir, '--dry-run'], sink()), 0);
    assert.equal(fs.readFileSync(p, 'utf8'), before);
    assert.equal(fs.readFileSync(path.join(dir, 'VERSION'), 'utf8'), '1.2.3\n');
    assert.equal(mod.main(['4.0.0', '--root', dir], sink()), 0);
    assert.ok(fs.readFileSync(p, 'utf8').includes('\n    "version": "4.0.0"'));
  } finally { cleanup(dir); }
});

test('bump rechaza versiones que no son X.Y.Z y no modifica nada', () => {
  const dir = fixture();
  try {
    for (const bad of ['22', '22.0', 'v22.0.0', '22.0.0-rc1', '1.2.x', '']) {
      const out = sink();
      assert.equal(mod.main([bad, '--root', dir], out), 1, bad);
    }
    assert.equal(mod.main(['--root', dir], sink()), 1, 'sin argumento');
    assert.equal(fs.readFileSync(path.join(dir, 'VERSION'), 'utf8'), '1.2.3\n');
  } finally { cleanup(dir); }
});

test('--check devuelve 0 si todo coincide y 1 si algo diverge', () => {
  const ok = fixture();
  const bad = fixture({ lockPkg: '0.0.1' });
  try {
    assert.equal(mod.main(['--check', '--root', ok], sink()), 0);
    const out = sink();
    assert.equal(mod.main(['--check', '--root', bad], out), 1);
    assert.match(out.lines.join('\n'), /packages\[""\]/);
  } finally { cleanup(ok); cleanup(bad); }
});
