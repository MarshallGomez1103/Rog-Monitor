'use strict';
// Comprobador documental (scripts/check-docs.mjs, N-C-01/N-C-04): reglas, enlaces y salida.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
let mod;
test.before(async () => { mod = await import(path.join(ROOT, 'scripts', 'check-docs.mjs')); });

const ids = (fails) => fails.map((f) => f.id);

test('los README y CHANGELOG reales pasan el comprobador', () => {
  const docs = {
    README: fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8'),
    CHANGELOG: fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8'),
  };
  assert.deepEqual(mod.checkDocs(docs), []);
});

test('textos vacíos fallan casi todas las reglas y devuelven id + motivo', () => {
  const fails = mod.checkDocs({ README: '', CHANGELOG: '' });
  assert.ok(fails.length >= mod.RULES.length - 10);
  assert.ok(ids(fails).includes('readme-electron44'));
  assert.ok(ids(fails).includes('changelog-unreleased'));
  assert.ok(fails.every((f) => f.id && f.why));
});

test('Electron 42 como versión actual, "Four widget states" y "1200 RPM" se rechazan', () => {
  const fails = mod.checkDocs({
    README: 'Electron 42 y Four widget states',
    CHANGELOG: '## Unreleased (v22)\n\n### Fixed\n- Electron 42 si queda >1200 RPM\n\n## 21.0.0\n',
  });
  assert.ok(ids(fails).includes('readme-no-electron42'));
  assert.ok(ids(fails).includes('readme-no-four-states'));
  assert.ok(ids(fails).includes('changelog-electron44'));
  assert.ok(ids(fails).includes('changelog-watchdog-criterion'));
});

test('Electron 42 en la historia (21.0.0) no cuenta contra Unreleased', () => {
  const cl = '## Unreleased (v22)\n\nElectron 44\n\n## 21.0.0\n- Electron 42.11.12\n';
  assert.equal(mod.unreleasedSection(cl).includes('Electron 42'), false);
  assert.equal(mod.unreleasedSection('sin sección'), '');
});

test('rutas personales se detectan en cualquiera de los dos documentos', () => {
  const fails = mod.checkDocs({ README: 'ver /home/alguien/x y ~/MyFiles', CHANGELOG: '/var/home/x' });
  assert.ok(ids(fails).includes('readme-private-path'));
  assert.ok(ids(fails).includes('changelog-private-path'));
});

test('relativeLinks ignora URLs, anclas y mailto; quita ancla y query', () => {
  const t = '[a](docs/x.md#s) [b](https://x.io/y) [c](#top) [d](mailto:a@b.c) <img src="assets/a.png"> [e](SECURITY.md "t") <a href="//cdn/x">';
  assert.deepEqual(mod.relativeLinks(t), ['docs/x.md', 'assets/a.png', 'SECURITY.md']);
});

test('enlace relativo inexistente falla; existente pasa (exists inyectado)', () => {
  const docs = { README: '[x](docs/nope.md) [y](docs/ok.md)', CHANGELOG: '' };
  const fails = mod.checkDocs(docs, { exists: (p) => p === 'docs/ok.md' });
  const broken = fails.filter((f) => f.id === 'readme-broken-link');
  assert.equal(broken.length, 1);
  assert.match(broken[0].why, /docs\/nope\.md/);
});

test('main devuelve 0 con documentos reales y 1 con documentos malos', () => {
  const log = []; const err = [];
  const out = { log: (m) => log.push(m), error: (m) => err.push(m) };
  assert.equal(mod.main(out), 0);
  assert.match(log[0], /OK/);
  assert.equal(mod.main(out, () => 'nada'), 1);
  assert.ok(err.some((l) => l.startsWith('FAIL readme-requirements')));
  assert.match(err[err.length - 1], /fallo\(s\)/);
});

test('la sección Known limits exige las cuatro limitaciones', () => {
  const base = (lim) => `## Unreleased (v22)\n\n### Known limits / pending validation\n${lim}\n\n## 21.0.0\n`;
  const ok = mod.checkDocs({ README: '', CHANGELOG: base('- Wayland overlay\n- installer VM\n- synthetic events\n- thermal test') });
  const bad = mod.checkDocs({ README: '', CHANGELOG: base('- Wayland overlay') });
  assert.equal(ids(ok).includes('changelog-known-limits'), false);
  assert.equal(ids(bad).includes('changelog-known-limits'), true);
});
