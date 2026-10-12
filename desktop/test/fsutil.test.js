'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { writeAtomic } = require('../fsutil.js');

test('writeAtomic reemplaza el archivo completo y no deja temporales', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rog-atomic-'));
  const f = path.join(dir, 'config.json');
  fs.writeFileSync(f, '{"old":true}\n');
  writeAtomic(f, '{"new":true}\n');
  assert.strictEqual(fs.readFileSync(f, 'utf8'), '{"new":true}\n');
  assert.deepStrictEqual(fs.readdirSync(dir), ['config.json']);
  fs.rmSync(dir, { recursive: true });
});

test('writeAtomic: si la escritura falla, el archivo anterior queda intacto', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rog-atomic-'));
  const f = path.join(dir, 'fan-curves.json');
  fs.writeFileSync(f, 'ORIGINAL');
  assert.throws(() => writeAtomic(f, Symbol('no serializable')));
  assert.strictEqual(fs.readFileSync(f, 'utf8'), 'ORIGINAL');
  assert.deepStrictEqual(fs.readdirSync(dir), ['fan-curves.json']);
  fs.rmSync(dir, { recursive: true });
});
