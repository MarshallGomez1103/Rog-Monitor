'use strict';
// escapeHtml vive en renderer/app.js (script clásico, sin módulos): se extrae
// el texto de la función y se evalúa aislado.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf8');
const m = src.match(/^function escapeHtml\(s\) \{[\s\S]*?^\}/m);
assert.ok(m, 'escapeHtml no encontrada en app.js');
const escapeHtml = new Function(`${m[0]}; return escapeHtml;`)();

test('escapa etiquetas HTML', () => {
  assert.strictEqual(escapeHtml('<img src=x onerror=1>'), '&lt;img src=x onerror=1&gt;');
});

test('escapa & " y comilla simple', () => {
  assert.strictEqual(escapeHtml('&"\''), '&amp;&quot;&#39;');
});

test('null/undefined dan cadena vacía; números y nombres normales intactos', () => {
  assert.strictEqual(escapeHtml(null), '');
  assert.strictEqual(escapeHtml(undefined), '');
  assert.strictEqual(escapeHtml(1234), '1234');
  assert.strictEqual(escapeHtml('firefox-bin'), 'firefox-bin');
});
