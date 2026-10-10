'use strict';
// Contrato del snapshot NDJSON: claves que el renderer/main.js leen de verdad.
// Espejo de REQUIRED en tests/test_contract.py (Python comprueba la salida real
// del productor; aqui se comprueba el fixture). CUANDO CAMBIE EL ESQUEMA:
// actualizar ambas listas, subir "schema" en app.py y regrabar
// tests/fixtures/snapshot-v<N>.json. Ver docstring de tests/test_contract.py.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const EXPECTED_SCHEMA = 1;
const fixture = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', '..', 'tests', 'fixtures', 'snapshot-v1.json'), 'utf8'));

// '[]' = primer elemento de una lista (se omite si esta vacia). Un padre null
// (p. ej. gpu.active con la dGPU apagada) hace que la ruta no aplique.
const REQUIRED = [
  'schema', 'version',
  'cpu', 'cpu.avg', 'cpu.package', 'cpu.max', 'cpu.min', 'cpu.hot90', 'cpu.freq_ghz',
  'cpu.throttle_count', 'cpu.epp', 'cpu.model', 'cpu.core_grid',
  'cpu.core_grid[].cpu', 'cpu.core_grid[].usage',
  'limits', 'limits.cpu', 'limits.gpu',
  'gpu', 'gpu.active', 'gpu.mode', 'gpu.pending', 'gpu.pending_action',
  'gpu.active.name', 'gpu.active.temp', 'gpu.active.util', 'gpu.active.power',
  'gpu.active.clock_mhz', 'gpu.active.vram_clock_mhz', 'gpu.active.vram_total',
  'gpu.active.vram_used',
  'ppd_profile', 'asus_profile', 'rapl_available', 'cpu_watts', 'fps', 'power_control',
  'fans', 'fans[].label', 'fans[].rpm', 'fans[].percent',
  'battery', 'battery.capacity', 'battery.status', 'battery.watts',
  'battery.charge_limit', 'battery.on_ac', 'battery.health_percent',
  'battery.cycle_count', 'battery.energy_full_wh', 'battery.energy_full_design_wh',
  'battery.energy_now_wh',
  'sys', 'sys.uptime_s', 'sys.ram_used_gb', 'sys.ram_total_gb', 'sys.ram_percent',
  'sys.rx_mbps', 'sys.tx_mbps', 'sys.load', 'sys.nvme_temps', 'sys.disks',
  'sys.disks[].mount', 'sys.disks[].label', 'sys.disks[].percent',
  'sys.disks[].used_gb', 'sys.disks[].total_gb', 'sys.disks[].block_dev',
  'sys.disks[].read_mbps', 'sys.disks[].write_mbps',
  'procs', 'procs[].pid', 'procs[].name', 'procs[].cpu', 'procs[].cpu_core',
  'procs[].mem_mb', 'procs_by_core', 'procs_mem', 'procs_vram',
  'aura',
  'series', 'series.cpu_temp', 'series.gpu_temp', 'series.cpu_power',
  'series.gpu_power', 'events',
];

function missing(doc, spec) {
  const errors = [];
  for (const p of spec) {
    let nodes = [doc];
    for (const part of p.split('.')) {
      const isList = part.endsWith('[]');
      const key = isList ? part.slice(0, -2) : part;
      const next = [];
      for (const n of nodes) {
        if (n === null || typeof n !== 'object' || Array.isArray(n)) continue;
        if (!(key in n)) { errors.push(`${p}: falta '${key}'`); continue; }
        let c = n[key];
        if (isList) { c = Array.isArray(c) && c.length ? c[0] : null; if (c === null) continue; }
        next.push(c);
      }
      nodes = next;
    }
  }
  return errors;
}

test('el fixture trae schema esperado', () => {
  assert.strictEqual(fixture.schema, EXPECTED_SCHEMA);
});

test('el fixture contiene todas las claves que lee el renderer', () => {
  assert.deepStrictEqual(missing(fixture, REQUIRED), []);
});

test('el comprobador detecta una clave eliminada', () => {
  const broken = JSON.parse(JSON.stringify(fixture));
  delete broken.cpu.avg;
  assert.deepStrictEqual(missing(broken, ['cpu.avg']), ["cpu.avg: falta 'avg'"]);
});
