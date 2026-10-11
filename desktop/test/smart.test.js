'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const smart = require('../smart');

const NVME = {
  smart_status: { passed: true },
  temperature: { current: 48 },
  nvme_smart_health_information_log: {
    power_on_hours: 1234, percentage_used: 3, media_errors: 0, critical_warning: 0, temperature: 321,
  },
};
const ATA = {
  smart_status: { passed: false },
  temperature: { current: 35 },
  ata_smart_attributes: { table: [{ name: 'Power_On_Hours', raw: { value: 999 } }] },
};

test('cachePath respeta XDG_CACHE_HOME y cae a ~/.cache', () => {
  assert.strictEqual(smart.cachePath({ XDG_CACHE_HOME: '/x' }, '/h'), '/x/rog-monitor/smart.json');
  assert.strictEqual(smart.cachePath({}, '/h'), '/h/.cache/rog-monitor/smart.json');
});

test('buildEntry NVMe y SATA', () => {
  const e = smart.buildEntry(NVME, 1_700_000_000_999);
  assert.deepStrictEqual(e, {
    ts_epoch: 1_700_000_000, ok: true, health_passed: true, temp_c: 48, percentage_used: 3,
    power_on_hours: 1234, media_errors: 0, critical_warning: 0, err: null,
  });
  const a = smart.buildEntry(ATA, 0);
  assert.strictEqual(a.health_passed, false);
  assert.strictEqual(a.power_on_hours, 999);
  assert.strictEqual(a.percentage_used, null);
});

test('buildEntry rechaza JSON sin veredicto SMART', () => {
  assert.strictEqual(smart.buildEntry(null), null);
  assert.strictEqual(smart.buildEntry({}), null);
  assert.strictEqual(smart.buildEntry({ smartctl: { exit_status: 2 } }), null);
  assert.strictEqual(smart.buildEntry({ smart_status: {} }), null);
});

test('mergeEntry conserva otros discos y tolera caché corrupta', () => {
  const e = { ok: true };
  assert.deepStrictEqual(smart.mergeEntry({ '/dev/a': 1 }, '/dev/b', e), { '/dev/a': 1, '/dev/b': e });
  assert.deepStrictEqual(smart.mergeEntry([1, 2], '/dev/b', e), { '/dev/b': e });
  assert.deepStrictEqual(smart.mergeEntry('x', '/dev/b', e), { '/dev/b': e });
  assert.deepStrictEqual(smart.mergeEntry({ '/dev/a': 1 }, '/dev/b', null), { '/dev/a': 1 });
});

test('recordSmart escribe 0600 atómico, conserva discos y no pisa con fallos', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rogsmart-'));
  const file = path.join(dir, 'sub', 'smart.json');
  try {
    assert.strictEqual(smart.recordSmart('/dev/nvme0n1', NVME, { file, nowMs: 5000 }), true);
    assert.strictEqual(smart.recordSmart('/dev/sda', ATA, { file, nowMs: 6000 }), true);
    assert.strictEqual(smart.recordSmart('/dev/sda', { smartctl: {} }, { file }), false);
    const got = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.deepStrictEqual(Object.keys(got).sort(), ['/dev/nvme0n1', '/dev/sda']);
    assert.strictEqual(got['/dev/sda'].ts_epoch, 6);
    assert.strictEqual(fs.statSync(file).mode & 0o777, 0o600);
    assert.deepStrictEqual(fs.readdirSync(path.dirname(file)), ['smart.json']); // sin .tmp
    // caché corrupta previa: se reemplaza sin lanzar
    fs.writeFileSync(file, '{no json');
    assert.strictEqual(smart.recordSmart('/dev/sda', ATA, { file, nowMs: 7000 }), true);
    assert.deepStrictEqual(Object.keys(JSON.parse(fs.readFileSync(file, 'utf8'))), ['/dev/sda']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('classifyFailure distingue cancelado, denegado, smartctl ausente e instalación', () => {
  assert.strictEqual(smart.classifyFailure({ needsInstall: true, err: 'x' }), 'needs_install');
  assert.strictEqual(smart.classifyFailure({ err: 'Error executing command as another user: Request dismissed' }), 'cancelled');
  assert.strictEqual(smart.classifyFailure({ err: 'Error executing command as another user: Not authorized' }), 'denied');
  assert.strictEqual(smart.classifyFailure({ err: 'rog-ctl.sh: line 110: exec: smartctl: not found' }), 'no_smartctl');
  assert.strictEqual(smart.classifyFailure({ err: '' }), 'empty');
  assert.strictEqual(smart.classifyFailure(null), 'empty');
});

test('noDataReason: null con datos, mensaje de smartctl sin ellos', () => {
  assert.strictEqual(smart.noDataReason(NVME), null);
  assert.strictEqual(smart.noDataReason({ ata_smart_attributes: { table: [] } }), null);
  const denied = { smartctl: { messages: [{ string: 'Smartctl open device: /dev/sda failed: Permission denied' }] } };
  assert.match(smart.noDataReason(denied), /Permission denied/);
  assert.match(smart.noDataReason({}), /no devolvió/);
});

test('recordSmart no lanza si el directorio no es escribible', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rogsmart-'));
  try {
    fs.writeFileSync(path.join(dir, 'archivo'), 'x'); // un archivo donde debería ir el directorio
    assert.strictEqual(smart.recordSmart('/dev/sda', ATA, { file: path.join(dir, 'archivo', 'smart.json') }), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
