'use strict';
// Caché de SMART (funciones puras + escritura atómica, sin Electron).
//
// Leer SMART fresco exige root: SIEMPRE es una acción explícita del usuario
// (pkexec desde el panel de discos). Cuando esa lectura sale bien, se guarda un
// resumen en ~/.cache/rog-monitor/smart.json para que el backend/TUI lo muestren
// sin root. Formato: { "/dev/nvme0n1": {ts_epoch, ok, health_passed, temp_c,
// percentage_used, power_on_hours, media_errors, critical_warning, err}, ... }
// Lo lee src/rog_monitor/sysinfo.py (smart_cached). Sólo se guardan lecturas con
// veredicto SMART: un fallo (pkexec cancelado, smartctl ausente) nunca pisa datos buenos.

const fs = require('fs');
const os = require('os');
const path = require('path');

function cachePath(env = process.env, home = os.homedir()) {
  const base = env.XDG_CACHE_HOME || path.join(home, '.cache');
  return path.join(base, 'rog-monitor', 'smart.json');
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// JSON de `smartctl -j -a` -> entrada de caché, o null si no hay veredicto SMART
// (p. ej. permiso denegado: smartctl devuelve JSON sin smart_status).
function buildEntry(json, nowMs = Date.now()) {
  if (!json || typeof json !== 'object') return null;
  const st = json.smart_status;
  if (!st || typeof st.passed !== 'boolean') return null;
  const nvme = json.nvme_smart_health_information_log || {};
  const ata = {};
  (((json.ata_smart_attributes || {}).table) || []).forEach((a) => {
    if (a && a.name && a.raw) ata[a.name] = a.raw.value;
  });
  const hours = num(nvme.power_on_hours) ?? num((json.power_on_time || {}).hours) ?? num(ata.Power_On_Hours);
  return {
    ts_epoch: Math.floor(nowMs / 1000),
    ok: true,
    health_passed: st.passed,
    temp_c: num((json.temperature || {}).current) ?? num(nvme.temperature),
    percentage_used: num(nvme.percentage_used),
    power_on_hours: hours,
    media_errors: num(nvme.media_errors),
    critical_warning: num(nvme.critical_warning),
    err: null,
  };
}

// Mezcla una entrada en el objeto de caché (lo normaliza si estaba corrupto).
function mergeEntry(cache, device, entry) {
  const base = cache && typeof cache === 'object' && !Array.isArray(cache) ? cache : {};
  return entry ? { ...base, [device]: entry } : base;
}

// Escritura atómica: temporal 0600 en el mismo directorio + rename. Directorio 0700.
function writeAtomic(file, obj, fsImpl = fs) {
  fsImpl.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    fsImpl.writeFileSync(tmp, JSON.stringify(obj) + '\n', { mode: 0o600 });
    fsImpl.renameSync(tmp, file);
  } catch (e) {
    try { fsImpl.unlinkSync(tmp); } catch (_) { /* ya no existe */ }
    throw e;
  }
}

function readCache(file, fsImpl = fs) {
  try { return JSON.parse(fsImpl.readFileSync(file, 'utf-8')); } catch (_) { return {}; }
}

// Registra una lectura SMART buena. Devuelve true si escribió; nunca lanza
// (la caché es una comodidad: no debe romper el panel si el disco está lleno).
function recordSmart(device, json, opts = {}) {
  const fsImpl = opts.fsImpl || fs;
  const entry = buildEntry(json, opts.nowMs);
  if (!entry) return false;
  const file = opts.file || cachePath();
  try {
    writeAtomic(file, mergeEntry(readCache(file, fsImpl), device, entry), fsImpl);
    return true;
  } catch (_) { return false; }
}

// Por qué falló una lectura sin salida útil. `res` = {out, err, needsInstall} de runPriv.
// Códigos: needs_install | cancelled | denied | no_smartctl | empty. El renderer los traduce.
function classifyFailure(res) {
  if (res && res.needsInstall) return 'needs_install';
  const err = String((res && res.err) || '').toLowerCase();
  if (/dismiss|cancel/.test(err)) return 'cancelled';
  if (/not authorized|authentication/.test(err)) return 'denied';
  if (/smartctl.*(not found|no such file)|(not found|no such file).*smartctl/.test(err)) return 'no_smartctl';
  return 'empty';
}

// smartctl devuelve JSON aun sin permiso o sin veredicto; si no trae ningún dato útil,
// el primer mensaje suyo explica el motivo. null = el JSON sí trae datos.
function noDataReason(json) {
  if (!json || typeof json !== 'object') return 'JSON vacío';
  if (buildEntry(json, 0) || json.nvme_smart_health_information_log || json.ata_smart_attributes) return null;
  const m = (((json.smartctl || {}).messages) || []).find((x) => x && x.string);
  return m ? m.string : 'smartctl no devolvió datos SMART';
}

module.exports = {
  cachePath, buildEntry, mergeEntry, writeAtomic, readCache, recordSmart, classifyFailure, noDataReason,
};
