'use strict';
// CP-7.09: exportación de benchmark (JSON + CSV con esquema, versión y condiciones).
// bench-detail.js es un script clásico (IIFE sobre window): se evalúa en un vm con window mínima.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'bench-detail.js'), 'utf8');
const sandbox = { window: { i18n: { register() {} } }, console };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const { buildExport } = sandbox.window.RogBenchDetail;

const item = {
  id: 'bench-cpu-1', kind: 'cpu', started_at: '2026-10-10T12:00:00+00:00', schema: 2,
  conditions: { app_version: '20.0.0', schema: 2, kernel: '7.2.8', cpu_model: 'i7, "13th"', power_source: 'ac',
    fan_caps: { cpu_fan: 6700 }, ambient_start: { cpu_temp: 41.5, gpu_temp: null } },
  samples: [
    { t: 0.1, rep: 1, warmup: true, cpu_temp: 60.5, cpu_watts: 90, fans: { cpu_fan: 3000 } },
    { t: 1.1, rep: 1, warmup: false, cpu_temp: 70, cpu_watts: null, fans: { cpu_fan: 4200, gpu_fan: 2600 }, work: 100 },
  ],
};

test('JSON lleva esquema de export, versión de la app y las condiciones', () => {
  const out = buildExport(item);
  const obj = JSON.parse(out.text);
  assert.strictEqual(obj.export_schema, 'rog-monitor-benchmark-export/1');
  assert.strictEqual(obj.schema, 2);
  assert.strictEqual(obj.app_version, '20.0.0');
  assert.strictEqual(obj.conditions.kernel, '7.2.8');
  assert.strictEqual(obj.samples.length, 2);
  assert.strictEqual(out.kind, 'cpu');
});

test('CSV: cabecera # con condiciones, columnas fijas + ventiladores, vacío para null', () => {
  const lines = buildExport(item).csv.trimEnd().split('\n');
  assert.ok(lines.includes('# app_version: 20.0.0'));
  assert.ok(lines.includes('# schema: 2'));
  assert.ok(lines.includes('# fan_caps: {"cpu_fan":6700}'));
  const headerIdx = lines.findIndex((l) => !l.startsWith('#'));
  const cols = lines[headerIdx].split(',');
  assert.deepStrictEqual(cols.slice(0, 5), ['t', 'rep', 'warmup', 'cpu_temp', 'cpu_package']);
  assert.deepStrictEqual(cols.slice(-2), ['fan_cpu_fan', 'fan_gpu_fan']);
  const row2 = lines[headerIdx + 2].split(',');
  assert.strictEqual(row2[cols.indexOf('cpu_watts')], '');       // null -> vacío
  assert.strictEqual(row2[cols.indexOf('warmup')], 'false');
  assert.strictEqual(row2[cols.indexOf('work')], '100');
  assert.strictEqual(row2[cols.indexOf('fan_gpu_fan')], '2600');
  assert.strictEqual(lines[headerIdx + 1].split(',')[cols.indexOf('fan_gpu_fan')], ''); // fan ausente
});

test('resultado antiguo sin condiciones exporta igual (schema 1, app_version null)', () => {
  const obj = JSON.parse(buildExport({ id: 'old', kind: 'gpu', samples: [] }).text);
  assert.strictEqual(obj.schema, 1);
  assert.strictEqual(obj.app_version, null);
});
