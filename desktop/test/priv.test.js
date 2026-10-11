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
    ['guardian', '--enabled', '1', '--mode', 'gaming', '--cpu', '95', '--gpu', '87', '--dry', '0']);
  assert.deepEqual(
    priv.guardianArgs({ enabled: true, mode: 'protection', cpu: 92, gpu: 83, dry: true }).slice(-2),
    ['--dry', '1']);
  assert.equal(priv.guardianArgs({ enabled: true, mode: 'gaming', cpu: 90, gpu: 80, dry: '1;id' }), null);
  assert.equal(priv.guardianArgs({ enabled: true, mode: 'gaming', cpu: 90, gpu: 80, dry: 2 }), null);
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

// ---- curvas de ventilador (CP-1.06b) ----
const okCurve = () => ({
  temps: [30, 50, 60, 70, 80, 85, 90, 95],
  pwms: [20, 36, 56, 92, 138, 173, 205, 205],
});

test('validateFanCurve: curva válida y las curvas quiet de fábrica pasan', () => {
  assert.equal(priv.validateFanCurve(okCurve()), null);
  assert.equal(priv.validateFanCurve({
    temps: [30, 50, 60, 70, 80, 85, 90, 95], pwms: [15, 28, 46, 72, 105, 135, 165, 170],
  }), null);
  assert.equal(priv.validateFanCurve({
    temps: [30, 50, 60, 65, 72, 76, 80, 83], pwms: [13, 23, 43, 66, 99, 128, 160, 170],
  }), null);
});

test('validateFanCurve: exige 8 puntos enteros', () => {
  const c = okCurve();
  assert.match(priv.validateFanCurve({ temps: c.temps.slice(1), pwms: c.pwms }), /8 puntos/);
  assert.match(priv.validateFanCurve({ temps: c.temps, pwms: [...c.pwms.slice(1), 1.5] }), /enteros/);
  assert.match(priv.validateFanCurve({ temps: c.temps, pwms: [...c.pwms.slice(1), '205'] }), /enteros/);
  assert.match(priv.validateFanCurve({ temps: c.temps, pwms: [...c.pwms.slice(1), null] }), /enteros/);
  assert.match(priv.validateFanCurve(null), /faltan/);
});

test('validateFanCurve: temperatura 0 o fuera de 20..105 se rechaza', () => {
  const c = okCurve();
  c.temps[0] = 0;
  assert.match(priv.validateFanCurve(c), /20\.\.105/);
  const d = okCurve();
  d.temps[7] = 106;
  assert.match(priv.validateFanCurve(d), /20\.\.105/);
});

test('validateFanCurve: temperaturas estrictamente crecientes', () => {
  const c = okCurve();
  c.temps[3] = c.temps[2];
  assert.match(priv.validateFanCurve(c), /crecientes/);
  const d = okCurve();
  d.temps[3] = 40;
  assert.match(priv.validateFanCurve(d), /crecientes/);
});

test('validateFanCurve: PWM fuera de 0..255 se rechaza (PWM 0 en frío sí es válido)', () => {
  const c = okCurve();
  c.pwms[0] = 0;
  assert.equal(priv.validateFanCurve(c), null);
  c.pwms[1] = 256;
  assert.match(priv.validateFanCurve(c), /0\.\.255/);
  c.pwms[1] = -1;
  assert.match(priv.validateFanCurve(c), /0\.\.255/);
});

test('validateFanCurve: nunca ventiladores apagados con calor (último punto y >= 90 C)', () => {
  const last = okCurve();
  last.pwms[7] = 0;
  assert.match(priv.validateFanCurve(last), /mínimo es 150/);
  // el último punto manda aunque su temperatura sea baja
  const lowLast = { temps: [30, 40, 50, 55, 60, 65, 70, 75], pwms: [0, 0, 0, 0, 0, 0, 0, 149] };
  assert.match(priv.validateFanCurve(lowLast), /mínimo es 150/);
  const hot = okCurve();
  hot.pwms[6] = 149; // 90 C
  assert.match(priv.validateFanCurve(hot), /mínimo es 150/);
  hot.pwms[6] = 150;
  assert.equal(priv.validateFanCurve(hot), null);
});

test('validateFanCurves: vacío, ventilador desconocido o curva mala', () => {
  assert.match(priv.validateFanCurves({}), /inválidas/);
  assert.match(priv.validateFanCurves(null), /inválidas/);
  assert.match(priv.validateFanCurves([okCurve()]), /inválidas/);
  assert.match(priv.validateFanCurves({ '../x': okCurve() }), /desconocido/);
  assert.equal(priv.validateFanCurves({ cpu: okCurve(), gpu: okCurve(), fan4: okCurve() }), null);
  const bad = okCurve();
  bad.pwms[7] = 0;
  assert.match(priv.validateFanCurves({ cpu: okCurve(), gpu: bad }), /gpu/);
});
