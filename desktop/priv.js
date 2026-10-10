'use strict';
// Frontera de privilegios de ROG Monitor (funciones puras, sin Electron).
//
// Invariante: ningún proceso root (pkexec o unidad systemd) ejecuta ni importa
// un archivo escribible por un usuario sin privilegios. Todo lo que corre como
// root vive en LIBEXEC, copiado por scripts/install-system.sh (root:root).
// La única excepción permitida es el propio instalador, que el usuario
// confirma de forma explícita.

const fs = require('fs');
const path = require('path');

const LIBEXEC = '/usr/local/libexec/rog-monitor';
const PKEXEC = '/usr/bin/pkexec';
const SYSTEM_PATH = ['/usr/local/sbin', '/usr/local/bin', '/usr/sbin', '/usr/bin', '/sbin', '/bin'];

// Ayudantes que la app puede lanzar con pkexec (lista cerrada).
const HELPERS = Object.freeze([
  'rog-ctl.sh',
  'apply-power-control.sh',
  'apply-gpu-clocks.sh',
  'calibrate-fans.sh',
  'enable-asusd.sh',
  'rog-monitor-safe-mode.sh',
]);

const DEVICE_RE = /^\/dev\/(nvme\d+n\d+|sd[a-z]+)$/;

// PATH para procesos sin privilegios: el sistema primero, los directorios del
// usuario AL FINAL (si no, un ~/.local/bin/git o /python3 secuestraría todo).
function buildPath(current, userDirs) {
  const out = [];
  const add = (d) => { if (d && !out.includes(d)) out.push(d); };
  SYSTEM_PATH.forEach(add);
  String(current || '').split(path.delimiter).filter(Boolean).forEach(add);
  (userDirs || []).forEach(add);
  return out.join(path.delimiter);
}

// Ruta absoluta de un ayudante instalado. Lanza si el nombre no está permitido.
function helperPath(name, libexec = LIBEXEC) {
  if (!HELPERS.includes(name)) throw new Error(`ayudante no permitido: ${name}`);
  return path.join(libexec, name);
}

function readInstalledVersion(libexec = LIBEXEC, fsImpl = fs) {
  try { return String(fsImpl.readFileSync(path.join(libexec, 'VERSION'), 'utf-8')).trim(); }
  catch (_) { return null; }
}

const NEEDS_INSTALL_MSG =
  'Falta instalar o actualizar la integración de sistema de ROG Monitor: ' +
  'REINSTALAR / REPARAR (Mantenimiento) o `sudo bash scripts/install-system.sh`. / ' +
  'ROG Monitor system integration is missing or outdated: use REINSTALL / REPAIR ' +
  '(Maintenance) or `sudo bash scripts/install-system.sh`.';

// Un archivo/directorio de sistema debe ser de root y no escribible por otros.
function rootOwned(p, fsImpl) {
  const st = fsImpl.statSync(p);
  return st.uid === 0 && (st.mode & 0o022) === 0;
}

// Resuelve un ayudante privilegiado o explica por qué no se puede usar.
// Opciones inyectables para pruebas: libexec, fsImpl, requireRoot.
function resolveHelper(name, appVersion, opts = {}) {
  const libexec = opts.libexec || LIBEXEC;
  const fsImpl = opts.fsImpl || fs;
  const requireRoot = opts.requireRoot !== false;
  let p;
  try { p = helperPath(name, libexec); } catch (e) { return { ok: false, err: e.message }; }
  if (!fsImpl.existsSync(p)) return { ok: false, needsInstall: true, err: NEEDS_INSTALL_MSG };
  const installed = readInstalledVersion(libexec, fsImpl);
  if (installed === null || installed !== String(appVersion).trim()) {
    return {
      ok: false,
      needsInstall: true,
      err: `${NEEDS_INSTALL_MSG} (instalado/installed: ${installed || '-'}, app: ${appVersion})`,
    };
  }
  if (requireRoot) {
    try {
      if (!rootOwned(p, fsImpl) || !rootOwned(libexec, fsImpl)) {
        return {
          ok: false,
          needsInstall: true,
          err: `${libexec} no es de root o es escribible por otros; no lo ejecuto. / ` +
            `${libexec} is not root-owned or is writable by others; refusing to run it.`,
        };
      }
    } catch (e) {
      return { ok: false, needsInstall: true, err: `${NEEDS_INSTALL_MSG} (${e.message})` };
    }
  }
  return { ok: true, path: p };
}

// argv real para execFile: siempre /usr/bin/pkexec + ruta absoluta del ayudante.
function pkexecArgv(helperAbsPath, args = []) {
  return { cmd: PKEXEC, args: [helperAbsPath, ...args.map(String)] };
}

// ---- validadores de argumentos (todo lo que cruza a root se valida aquí) ----

function intInRange(v, lo, hi) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < lo || n > hi) return null;
  return n;
}

function validateBatteryLimit(v) { return intInRange(v, 20, 100); }

function validateDevice(d) { return typeof d === 'string' && DEVICE_RE.test(d) ? d : null; }

// Devuelve argv de `rog-ctl.sh guardian` o null si algo no es válido.
function guardianArgs({ enabled, mode, cpu, gpu }) {
  const c = intInRange(cpu, 70, 100);
  const g = intInRange(gpu, 70, 87);
  if (c === null || g === null) return null;
  if (mode !== 'protection' && mode !== 'gaming') return null;
  return ['guardian', '--enabled', enabled ? '1' : '0', '--mode', mode, '--cpu', String(c), '--gpu', String(g)];
}

const POWER_KEYS = ['pl1', 'pl2', 'dynamic_boost', 'thermal_target'];

// Lista de `clave=valor` para apply-power-control.sh (que además recorta a los
// rangos vivos del firmware). Devuelve null si hay clave o valor inválidos.
function powerArgs(changes) {
  const out = [];
  for (const [k, v] of Object.entries(changes || {})) {
    if (!POWER_KEYS.includes(k)) return null;
    const n = intInRange(v, -100000, 100000);
    if (n === null) return null;
    out.push(`${k}=${n}`);
  }
  return out.length ? out : null;
}

module.exports = {
  LIBEXEC, PKEXEC, SYSTEM_PATH, HELPERS, DEVICE_RE, POWER_KEYS, NEEDS_INSTALL_MSG,
  buildPath, helperPath, readInstalledVersion, resolveHelper, pkexecArgv,
  validateBatteryLimit, validateDevice, guardianArgs, powerArgs,
};
