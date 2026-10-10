'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const priv = require('../priv');

// fs falso: files = { ruta: {content?, uid?, mode?} }
function fakeFs(files) {
  return {
    existsSync: (p) => Object.prototype.hasOwnProperty.call(files, p),
    readFileSync: (p) => {
      if (!files[p] || files[p].content === undefined) throw new Error('ENOENT');
      return files[p].content;
    },
    statSync: (p) => {
      if (!files[p]) throw new Error('ENOENT');
      return { uid: files[p].uid ?? 0, mode: files[p].mode ?? 0o755 };
    },
  };
}
const L = priv.LIBEXEC;
const goodFs = () => fakeFs({
  [L]: {},
  [`${L}/rog-ctl.sh`]: {},
  [`${L}/VERSION`]: { content: '20.0.0\n', mode: 0o644 },
});

test('LIBEXEC y pkexec son rutas absolutas fijas', () => {
  assert.equal(priv.LIBEXEC, '/usr/local/libexec/rog-monitor');
  assert.equal(priv.PKEXEC, '/usr/bin/pkexec');
});

test('helperPath: solo ayudantes de la lista, sin path traversal', () => {
  assert.equal(priv.helperPath('rog-ctl.sh'), `${L}/rog-ctl.sh`);
  assert.throws(() => priv.helperPath('../../bin/sh'));
  assert.throws(() => priv.helperPath('/bin/sh'));
  assert.throws(() => priv.helperPath('install-system.sh'));
  assert.throws(() => priv.helperPath('rog-ctl.sh/../x'));
});

test('resolveHelper: ok si existe, versión igual y dueño root', () => {
  const r = priv.resolveHelper('rog-ctl.sh', '20.0.0', { fsImpl: goodFs() });
  assert.deepEqual(r, { ok: true, path: `${L}/rog-ctl.sh` });
});

test('resolveHelper: falta el ayudante => needsInstall', () => {
  const r = priv.resolveHelper('rog-ctl.sh', '20.0.0', { fsImpl: fakeFs({}) });
  assert.equal(r.ok, false);
  assert.equal(r.needsInstall, true);
  assert.match(r.err, /install-system\.sh/);
});

test('resolveHelper: VERSION distinta => needsInstall (no ejecuta)', () => {
  const r = priv.resolveHelper('rog-ctl.sh', '21.0.0', { fsImpl: goodFs() });
  assert.equal(r.ok, false);
  assert.equal(r.needsInstall, true);
  assert.match(r.err, /20\.0\.0/);
});

test('resolveHelper: sin VERSION => needsInstall', () => {
  const f = fakeFs({ [`${L}/rog-ctl.sh`]: {}, [L]: {} });
  assert.equal(priv.resolveHelper('rog-ctl.sh', '20.0.0', { fsImpl: f }).needsInstall, true);
});

test('resolveHelper: rechaza ayudante o directorio de otro dueño o escribible por otros', () => {
  const owned = (uid, mode, dirMode = 0o755) => fakeFs({
    [L]: { uid: 0, mode: dirMode },
    [`${L}/rog-ctl.sh`]: { uid, mode },
    [`${L}/VERSION`]: { content: '20.0.0' },
  });
  assert.equal(priv.resolveHelper('rog-ctl.sh', '20.0.0', { fsImpl: owned(1000, 0o755) }).ok, false);
  assert.equal(priv.resolveHelper('rog-ctl.sh', '20.0.0', { fsImpl: owned(0, 0o775) }).ok, false);
  assert.equal(priv.resolveHelper('rog-ctl.sh', '20.0.0', { fsImpl: owned(0, 0o755, 0o777) }).ok, false);
});

test('resolveHelper: nombre no permitido => error sin needsInstall', () => {
  const r = priv.resolveHelper('evil.sh', '20.0.0', { fsImpl: goodFs() });
  assert.equal(r.ok, false);
  assert.equal(r.needsInstall, undefined);
});

test('pkexecArgv: /usr/bin/pkexec + ruta absoluta del ayudante, args como strings', () => {
  const a = priv.pkexecArgv(`${L}/rog-ctl.sh`, ['battery-limit', 80]);
  assert.equal(a.cmd, '/usr/bin/pkexec');
  assert.deepEqual(a.args, [`${L}/rog-ctl.sh`, 'battery-limit', '80']);
});

test('validateBatteryLimit: entero 20..100', () => {
  assert.equal(priv.validateBatteryLimit(80), 80);
  assert.equal(priv.validateBatteryLimit('60'), 60);
  for (const bad of [19, 101, 80.5, 'abc', '', null, undefined, NaN, '80; rm -rf /', [80]]) {
    assert.equal(priv.validateBatteryLimit(bad), null, String(bad));
  }
});

test('validateDevice: solo nvme/sd en /dev', () => {
  for (const ok of ['/dev/nvme0n1', '/dev/nvme12n3', '/dev/sda', '/dev/sdab']) {
    assert.equal(priv.validateDevice(ok), ok);
  }
  for (const bad of ['/dev/nvme0n1p1', '/dev/../etc/passwd', '/dev/sda; id', 'sda', '/dev/sda\n', '/dev/null', '', null, 5]) {
    assert.equal(priv.validateDevice(bad), null, String(bad));
  }
});

test('guardianArgs: rangos y enum', () => {
  assert.deepEqual(
    priv.guardianArgs({ enabled: true, mode: 'gaming', cpu: 95, gpu: 87 }),
    ['guardian', '--enabled', '1', '--mode', 'gaming', '--cpu', '95', '--gpu', '87']);
  assert.deepEqual(
    priv.guardianArgs({ enabled: false, mode: 'protection', cpu: 70, gpu: 70 }).slice(0, 3),
    ['guardian', '--enabled', '0']);
  assert.equal(priv.guardianArgs({ enabled: true, mode: 'turbo', cpu: 90, gpu: 80 }), null);
  assert.equal(priv.guardianArgs({ enabled: true, mode: 'gaming', cpu: 101, gpu: 80 }), null);
  assert.equal(priv.guardianArgs({ enabled: true, mode: 'gaming', cpu: 90, gpu: 88 }), null);
  assert.equal(priv.guardianArgs({ enabled: true, mode: 'gaming', cpu: '90"; id', gpu: 80 }), null);
});

test('powerArgs: solo las 4 claves, solo enteros', () => {
  assert.deepEqual(priv.powerArgs({ pl1: 80, pl2: 120 }), ['pl1=80', 'pl2=120']);
  assert.equal(priv.powerArgs({ base_clock_offset: 10 }), null);
  assert.equal(priv.powerArgs({ pl1: '80;id' }), null);
  assert.equal(priv.powerArgs({ pl1: 1.5 }), null);
  assert.equal(priv.powerArgs({}), null);
});

test('buildPath: sistema primero, directorios del usuario AL FINAL', () => {
  const home = '/home/u/.local/bin';
  const p = priv.buildPath(`${home}:/usr/bin:/opt/x`, [home, '/home/u/.linuxbrew/bin']).split(path.delimiter);
  assert.equal(p[0], '/usr/local/sbin');
  assert.ok(p.indexOf('/usr/bin') < p.indexOf(home));
  assert.ok(p.indexOf('/bin') < p.indexOf(home));
  assert.equal(p.filter((d) => d === home).length, 1);
  assert.ok(p.includes('/opt/x'));
  assert.equal(p[p.length - 1], '/home/u/.linuxbrew/bin');
});
