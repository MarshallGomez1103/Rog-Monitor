// ROG Monitor desktop: Electron shell over the Python sensor core.
// The backend is `python -m rog_monitor --json-stream`; one JSON per second.

const { app, BrowserWindow, ipcMain, dialog, shell, screen } = require('electron');
const { spawn, spawnSync, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const REPO = path.resolve(__dirname, '..');
const VENV_PY = path.join(REPO, '.venv', 'bin', 'python');
const PYTHON = fs.existsSync(VENV_PY) ? VENV_PY : 'python3';
const VERSION_FILE = path.join(REPO, 'VERSION');
const PATH_HINTS = [
  path.join(os.homedir(), '.local', 'bin'),
  path.join(os.homedir(), '.linuxbrew', 'bin'),
  path.join(os.homedir(), '.linuxbrew', 'sbin'),
  '/home/linuxbrew/.linuxbrew/bin',
  '/home/linuxbrew/.linuxbrew/sbin',
  '/usr/local/bin',
  '/usr/local/sbin',
  '/usr/bin',
  '/usr/sbin',
  '/bin',
  '/sbin',
];

function augmentEnv(base = process.env) {
  const current = String(base.PATH || '').split(path.delimiter).filter(Boolean);
  const merged = [];
  for (const entry of [...PATH_HINTS, ...current]) {
    if (entry && !merged.includes(entry)) merged.push(entry);
  }
  return { ...base, PATH: merged.join(path.delimiter) };
}

const APP_ENV = augmentEnv(process.env);
process.env.PATH = APP_ENV.PATH;
const PY_ENV = { ...APP_ENV, PYTHONPATH: path.join(REPO, 'src') };
const DATA_DIR_PATH = path.join(os.homedir(), '.local', 'share', 'rog-monitor');
const ERROR_LOG_PATH = path.join(DATA_DIR_PATH, 'errors.jsonl');
const LAST_ISSUE_REPORT_PATH = path.join(DATA_DIR_PATH, 'last-issue-report.txt');

function readVersion() {
  const envVersion = String(process.env.ROG_MONITOR_VERSION || '').trim();
  if (envVersion) return envVersion;
  try {
    const version = fs.readFileSync(VERSION_FILE, 'utf-8').trim();
    if (version) return version;
  } catch (_) { /* fallback below */ }
  return require('./package.json').version;
}

const APP_VERSION = readVersion();

function appendErrorLog(kind, payload = {}) {
  try {
    fs.mkdirSync(DATA_DIR_PATH, { recursive: true });
    const entry = {
      ts: new Date().toISOString(),
      appVersion: APP_VERSION,
      kind,
      host: os.hostname(),
      platform: `${process.platform} ${os.release()}`,
      ...payload,
    };
    fs.appendFileSync(ERROR_LOG_PATH, JSON.stringify(entry) + '\n', 'utf-8');
  } catch (_) { /* logging must never break the app */ }
}

function readErrorLogTail(maxLines = 60) {
  try {
    const lines = fs.readFileSync(ERROR_LOG_PATH, 'utf-8')
      .split('\n')
      .filter(Boolean);
    return lines.slice(-maxLines).join('\n');
  } catch (_) {
    return '';
  }
}

let win = null;
let overlay = null;
let overlayCfg = { enabled: false, displayId: null, corner: 'top-center', show: null, layout: 'row', accent: null };
let backend = null;
let musicProc = null;
let musicMode = {
  active: false,
  baseState: null,
  lastBrightness: null,
  lastColour: null,
  lastApplyTs: 0,
  applying: false,
};

// Taskbar identity: app name + desktop-file match so KDE/GNOME show
// "ROG Monitor" with its icon instead of a generic "Electron" window.
app.setName('ROG Monitor');
if (process.platform === 'linux') {
  app.setDesktopName('rog-monitor.desktop');
}

function startBackend() {
  if (backend) {
    backend.removeAllListeners();
    backend.kill();
  }
  backend = spawn(PYTHON, ['-m', 'rog_monitor', '--json-stream', '--interval', '1'], {
    env: PY_ENV,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let buffer = '';
  backend.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      try {
        const stats = JSON.parse(line);
        if (win && !win.isDestroyed()) win.webContents.send('stats', stats);
        if (overlay && !overlay.isDestroyed()) overlay.webContents.send('stats', stats);
      } catch (_) { /* partial line, ignore */ }
    }
  });
  backend.stderr.on('data', (d) => {
    const text = d.toString().trim();
    console.error('[backend]', text);
    if (text) appendErrorLog('backend-stderr', { message: text });
  });
  backend.on('exit', (code) => {
    console.error('[backend] exited', code);
    appendErrorLog('backend-exit', { code });
    backendPaused = false;
    if (win && !win.isDestroyed()) {
      win.webContents.send('backend-down', code);
      setTimeout(startBackend, 3000); // auto-recover
    }
  });
}

/* ---------- Ahorro de energía: congelar el backend cuando nadie lo ve ----------
   Con la ventana minimizada/oculta y SIN overlay activo, el proceso Python no
   necesita leer /proc ni sensores. Lo pausamos con SIGSTOP (literalmente 0% de
   CPU) y lo reanudamos con SIGCONT al volver. Así "solo tener la app abierta"
   (minimizada o en bandeja) no se nota en consumo. El renderer, al estar oculto,
   ya lo throttlea Electron, así que entre ambos el costo en reposo es ínfimo. */
let backendPaused = false;
let mainVisible = true;

function overlayNeedsBackend() {
  return !!(overlay && !overlay.isDestroyed()); // si existe, está mostrándose en juego
}

function setBackendPaused(paused) {
  if (!backend || backend.killed || paused === backendPaused) return;
  try {
    backend.kill(paused ? 'SIGSTOP' : 'SIGCONT');
    backendPaused = paused;
  } catch (_) { /* pudo morir; el auto-recover lo recrea */ }
}

function updateBackendPower() {
  setBackendPaused(!(mainVisible || overlayNeedsBackend()));
}

function run(cmd, args, timeoutMs = 10000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, cwd: REPO, env: APP_ENV }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: (stdout || '').trim(), err: (stderr || String(err || '')).trim() });
    });
  });
}

function shQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

// maxBuffer ampliado a 16 MB para soportar sesiones de juego de 100+ min
// (~6 000 samples × ~200 B/sample = ~1,2 MB; el default de Node 1 MB cortaba
// stdout silenciosamente → cmd_stop / cmd_get devolvían string vacío → el
// JSON.parse fallaba → res.ok = false → lastSession = undefined → resumen vacío).
const MODULE_MAX_BUFFER = 16 * 1024 * 1024; // 16 MB

function runPythonModule(module, args, timeoutMs = 10000) {
  return new Promise((resolve) => {
    execFile(PYTHON, ['-m', module, ...args],
      { timeout: timeoutMs, cwd: REPO, env: PY_ENV, maxBuffer: MODULE_MAX_BUFFER },
      (err, stdout, stderr) => {
        resolve({ ok: !err, out: (stdout || '').trim(), err: (stderr || String(err || '')).trim() });
      });
  });
}

async function runJsonModule(module, args, timeoutMs = 10000) {
  const res = await runPythonModule(module, args, timeoutMs);
  if (!res.ok) return res;
  try {
    return JSON.parse(res.out || '{}');
  } catch (err) {
    return { ok: false, err: `respuesta inválida de ${module}: ${err.message}` };
  }
}

// Lista COMPLETA de procesos bajo demanda (modal "ver todos"): el stream 1 Hz
// solo trae el top 5; esto spawnea un one-shot ligero que muestrea dos veces.
ipcMain.handle('list-all-procs', () =>
  runJsonModule('rog_monitor', ['--procs-all'], 8000));

const PPD = [
  'org.freedesktop.UPower.PowerProfiles',
  '/org/freedesktop/UPower/PowerProfiles',
  'org.freedesktop.UPower.PowerProfiles',
];

// Sets the PPD profile and reads it back so the renderer can confirm the
// change really landed (the 1 Hz stats refresh made it look unresponsive).
ipcMain.handle('set-profile', async (_e, profile) => {
  const res = await run('busctl', ['--system', 'set-property', ...PPD, 'ActiveProfile', 's', profile]);
  if (!res.ok) return res;
  for (let i = 0; i < 5; i++) {
    const got = await run('busctl', ['--system', 'get-property', ...PPD, 'ActiveProfile'], 3000);
    if (got.ok && got.out.includes(`"${profile}"`)) return { ok: true, profile, applied: true };
    await new Promise((r) => setTimeout(r, 250));
  }
  return { ok: true, profile, applied: false };
});

const GPU_MODES = new Set(['Integrated', 'Hybrid', 'AsusMuxDgpu']);

function cleanGpuPending(value, current) {
  const raw = String(value || '').trim();
  const norm = raw.toLowerCase();
  if (!raw || norm === 'none' || norm === 'unknown' || norm === String(current || '').toLowerCase()) {
    return null;
  }
  return raw;
}

function cleanGpuAction(value) {
  const raw = String(value || '').trim();
  const norm = raw.toLowerCase();
  if (!raw || norm === 'none' || norm === 'noaction' || norm === 'unknown') return null;
  return raw;
}

async function readGpuModeState() {
  const current = await run('supergfxctl', ['-g'], 10000);
  if (!current.ok) {
    return { mode: null, pending: null, pending_action: null, err: current.err || current.out };
  }
  const pending = await run('supergfxctl', ['-P'], 10000);
  const action = await run('supergfxctl', ['-p'], 10000);
  return {
    mode: current.out || null,
    pending: pending.ok ? cleanGpuPending(pending.out, current.out) : null,
    pending_action: action.ok ? cleanGpuAction(action.out) : null,
  };
}

ipcMain.handle('set-gpu-mode', async (_e, mode) => {
  if (!GPU_MODES.has(mode)) {
    return { ok: false, err: `Modo GPU no permitido: ${mode}` };
  }
  const before = await readGpuModeState();
  const res = await run('supergfxctl', ['--mode', mode], 90000);
  const after = await readGpuModeState();
  return {
    ...res,
    before,
    after,
    mode: after.mode,
    pending: after.pending,
    pending_action: after.pending_action,
  };
});

ipcMain.handle('check-update', async () => {
  const fetch = await run('git', ['fetch', '--quiet'], 30000);
  if (!fetch.ok) return { ok: false, err: fetch.err || 'git fetch failed' };
  const count = await run('git', ['rev-list', '--count', 'HEAD..@{upstream}'], 10000);
  const log = await run('git', ['log', '--oneline', 'HEAD..@{upstream}', '-5'], 10000);
  return { ok: count.ok, behind: parseInt(count.out || '0', 10) || 0, log: log.out };
});

ipcMain.handle('do-update', async () => {
  const pull = await run('git', ['pull', '--ff-only'], 60000);
  if (!pull.ok) return pull;
  await run(path.join(REPO, '.venv', 'bin', 'pip'),
    ['install', '--quiet', '--upgrade', '-r', 'requirements.txt'], 120000);
  startBackend();
  return { ok: true, out: pull.out };
});

/* ---------- fan control center ----------
   The fan curves live in the (user-owned) system-scripts repo; the root
   service rog-profile-sync.service applies them. Editing the file needs no
   privileges; restarting the service prompts for the password via pkexec. */

// Scripts ahora viven en el propio repo (carpeta única). Se respeta
// ROG_SCRIPTS_DIR por compatibilidad, pero el default es REPO/scripts.
const SCRIPTS_DIR = process.env.ROG_SCRIPTS_DIR || REPO;
const SYNC_SCRIPT = path.join(SCRIPTS_DIR, 'scripts', 'rog-profile-sync.sh');
const FAN_CALIBRATE = path.join(SCRIPTS_DIR, 'scripts', 'calibrate-fans.sh');
const ENABLE_ASUSD = path.join(SCRIPTS_DIR, 'scripts', 'enable-asusd.sh');
// User-writable curve store; the root service reads it on every profile change.
const FAN_CURVES_JSON = path.join(
  os.homedir(), '.config', 'rog-monitor', 'fan-curves.json');

// JSON key per hwmon fan index (mirrors fan_key() in the sync script).
function fanKeyForIndex(i) {
  return ['cpu', 'gpu', 'mid'][i - 1] || `fan${i}`;
}

// How many fans this machine actually has (1, 2, 3, 4…), straight from the
// curve hwmon. Falls back to the classic cpu/gpu/mid trio if unreadable.
function detectFanKeys() {
  try {
    const base = '/sys/class/hwmon';
    for (const dev of fs.readdirSync(base)) {
      const dir = path.join(base, dev);
      let name = '';
      try { name = fs.readFileSync(path.join(dir, 'name'), 'utf-8').trim(); } catch (_) { continue; }
      if (name !== 'asus_custom_fan_curve') continue;
      const keys = [];
      for (let i = 1; i <= 6; i++) {
        if (fs.existsSync(path.join(dir, `pwm${i}_auto_point1_pwm`))) keys.push(fanKeyForIndex(i));
      }
      if (keys.length) return keys;
    }
  } catch (_) { /* fall through */ }
  return ['cpu', 'gpu', 'mid'];
}

// Built-in default curves straight from the system script (--defaults runs
// without root), so the editor shows the same baseline the service applies.
function scriptDefaults(profile) {
  if (!fs.existsSync(SYNC_SCRIPT)) return null;
  const res = spawnSync('bash', [SYNC_SCRIPT, '--defaults', profile], { encoding: 'utf-8', env: APP_ENV });
  if (res.status !== 0 || !res.stdout) return null;
  try {
    const curves = JSON.parse(res.stdout);
    return Object.keys(curves).length ? curves : null;
  } catch (_) {
    return null;
  }
}

function readCurvesStore() {
  try {
    return JSON.parse(fs.readFileSync(FAN_CURVES_JSON, 'utf-8')) || {};
  } catch (_) {
    return {};
  }
}

ipcMain.handle('get-fan-config', (_e, profile) => {
  const store = readCurvesStore();
  const saved = (store.profiles && store.profiles[profile]) || {};
  const defaults = scriptDefaults(profile) || {};
  const keys = detectFanKeys();
  const curves = {};
  for (const key of keys) {
    // extra fans (fan4…) default to the cpu curve, like the sync script
    const curve = saved[key] || defaults[key] || defaults.cpu;
    if (curve) curves[key] = curve;
  }
  if (!Object.keys(curves).length) {
    return { ok: false, err: `No encuentro curvas para "${profile}" (¿está el repo de scripts?)` };
  }
  return {
    ok: true,
    profile,
    curves,
    // Cap por perfil AUTORITATIVO: NUNCA caer al global store.cap_rpm (eso
    // contaminaba todos los perfiles con el del último guardado). Sin cap propio
    // = sin tope para ese perfil.
    cap: (saved && saved.cap_rpm) || {},
    profile_caps: Object.fromEntries(Object.entries(store.profiles || {})
      .map(([name, value]) => [name, (value && value.cap_rpm) || null])),
    max_rpm: store.max_rpm || {},
    calibration: store.calibration || {},
    source: Object.keys(saved).length ? 'guardado' : 'por defecto',
    path: FAN_CURVES_JSON,
  };
});

// One pkexec: (re)install the JSON-reading service script and reapply now.
// Installing on every save keeps /usr/local/sbin in sync with the repo and
// makes the cap actually persist across reboots.
async function applyFanService() {
  const cmd =
    `install -m 0755 ${shq(SYNC_SCRIPT)} /usr/local/sbin/rog-profile-sync && ` +
    `systemctl restart rog-profile-sync.service`;
  return run('pkexec', ['sh', '-c', cmd], 60000);
}

ipcMain.handle('set-fan-config', async (_e, { profile, curves, cap, capByFan }) => {
  for (const [fan, c] of Object.entries(curves)) {
    if (!c || c.temps.length !== 8 || c.pwms.length !== 8) {
      return { ok: false, err: `curva de ${fan} inválida (deben ser 8 puntos)` };
    }
    const bad = [...c.temps, ...c.pwms].some((v) => !Number.isFinite(v) || v < 0 || v > 255);
    if (bad) return { ok: false, err: `valores fuera de rango en ${fan} (0-255)` };
  }
  // Merge into the user-writable store (no privileges needed to edit it).
  // The curves are stored PRISTINE: the cap is applied by the root service at
  // write-to-hardware time, so raising/clearing it unlocks instantly.
  const store = readCurvesStore();
  store.profiles = store.profiles || {};
  const profileEntry = { ...curves };
  const caps = {};
  if (capByFan && typeof capByFan === 'object') {
    for (const [fan, raw] of Object.entries(capByFan)) {
      if (!Object.prototype.hasOwnProperty.call(curves, fan)) continue;
      const value = Math.round(+raw);
      if (Number.isFinite(value) && value >= 2000) caps[fan] = value;
    }
  } else if (cap && Number.isFinite(+cap) && +cap > 0) {
    const value = Math.round(+cap);
    for (const key of Object.keys(curves)) caps[key] = value;
  }

  if (!Object.keys(caps).length) {
    delete profileEntry.cap_rpm;
  } else {
    profileEntry.cap_rpm = caps;
  }
  store.profiles[profile] = profileEntry;
  // El cap es SOLO por perfil (profiles.<perfil>.cap_rpm). Eliminamos cualquier
  // cap_rpm global heredado: era la causa del bug donde los 3 perfiles
  // terminaban con el mismo tope. rog-profile-sync.sh ya lee el per-perfil.
  delete store.cap_rpm;
  try {
    fs.mkdirSync(path.dirname(FAN_CURVES_JSON), { recursive: true });
    fs.writeFileSync(FAN_CURVES_JSON, JSON.stringify(store, null, 2) + '\n');
  } catch (err) {
    return { ok: false, err: `No pude guardar ${FAN_CURVES_JSON}: ${err.message}` };
  }
  if (!fs.existsSync(SYNC_SCRIPT)) {
    return { ok: true, warn: 'Curvas guardadas, pero falta el repo de scripts para aplicarlas en vivo.' };
  }
  const res = await applyFanService();
  return res.ok
    ? { ok: true }
    : { ok: false, err: 'Curvas guardadas, pero no se aplicaron (servicio): ' + res.err };
});

// Valida y vuelca un perfil (curvas + cap por ventilador) dentro del store.
// Devuelve un mensaje de error o null si todo bien.
function writeFanProfile(store, { profile, curves, capByFan }) {
  for (const [fan, c] of Object.entries(curves || {})) {
    if (!c || c.temps.length !== 8 || c.pwms.length !== 8) {
      return `curva de ${fan} inválida en ${profile} (deben ser 8 puntos)`;
    }
    if ([...c.temps, ...c.pwms].some((v) => !Number.isFinite(v) || v < 0 || v > 255)) {
      return `valores fuera de rango en ${fan} (${profile})`;
    }
  }
  const entry = { ...curves };
  const caps = {};
  if (capByFan && typeof capByFan === 'object') {
    for (const [fan, raw] of Object.entries(capByFan)) {
      if (!Object.prototype.hasOwnProperty.call(curves, fan)) continue;
      const value = Math.round(+raw);
      if (Number.isFinite(value) && value >= 2000) caps[fan] = value;
    }
  }
  if (Object.keys(caps).length) entry.cap_rpm = caps;
  else delete entry.cap_rpm;
  store.profiles[profile] = entry;
  return null;
}

// Guarda VARIOS perfiles de una sola vez y aplica con UN solo pkexec. Esto
// permite editar ahorro/balance/performance y guardarlos juntos, cada uno con
// su propio tope, sin 3 prompts de contraseña ni contaminación entre perfiles.
ipcMain.handle('set-fan-config-multi', async (_e, { profiles }) => {
  if (!Array.isArray(profiles) || !profiles.length) {
    return { ok: false, err: 'no hay perfiles que guardar' };
  }
  const store = readCurvesStore();
  store.profiles = store.profiles || {};
  for (const p of profiles) {
    const err = writeFanProfile(store, p);
    if (err) return { ok: false, err };
  }
  delete store.cap_rpm; // el cap es solo por perfil (ver set-fan-config)
  try {
    fs.mkdirSync(path.dirname(FAN_CURVES_JSON), { recursive: true });
    fs.writeFileSync(FAN_CURVES_JSON, JSON.stringify(store, null, 2) + '\n');
  } catch (err) {
    return { ok: false, err: `No pude guardar ${FAN_CURVES_JSON}: ${err.message}` };
  }
  if (!fs.existsSync(SYNC_SCRIPT)) {
    return { ok: true, warn: 'Curvas guardadas, pero falta el repo de scripts para aplicarlas en vivo.' };
  }
  const res = await applyFanService();
  return res.ok ? { ok: true } : { ok: false, err: 'Curvas guardadas, pero no se aplicaron (servicio): ' + res.err };
});

// Tope de ventiladores SOLO para el modo Gaming del guardián. Se guarda en
// fan-curves.json (gaming_cap_rpm) y el servicio de ventiladores lo usa cuando
// detecta que el guardián está en gaming activo. No pide contraseña: el servicio
// lo reaplica solo en su próximo ciclo (≤30 s).
ipcMain.handle('get-gaming-cap', () => {
  const store = readCurvesStore();
  const maxes = Object.values(store.max_rpm || {}).map(Number).filter(Number.isFinite);
  return { ok: true, rpm: store.gaming_cap_rpm || null, maxRpm: maxes.length ? Math.max(...maxes) : null };
});

ipcMain.handle('set-gaming-cap', (_e, rpm) => {
  const store = readCurvesStore();
  const v = Math.round(+rpm);
  if (Number.isFinite(v) && v >= 2000) store.gaming_cap_rpm = v;
  else delete store.gaming_cap_rpm;
  try {
    fs.mkdirSync(path.dirname(FAN_CURVES_JSON), { recursive: true });
    fs.writeFileSync(FAN_CURVES_JSON, JSON.stringify(store, null, 2) + '\n');
  } catch (err) {
    return { ok: false, err: String(err.message) };
  }
  return { ok: true, rpm: store.gaming_cap_rpm || null };
});

// Minimal single-quote shell escaping for the pkexec command above.
function shq(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

// Steps the fans through 7 PWM levels and measures real RPM at each one
// (~70 s, loud). The PWM→RPM table is what makes an RPM cap land AT the cap
// instead of 200-400 RPM above (the relation is not linear). Persisted in
// fan-curves.json so the root service, the backend and the UI all share it.
ipcMain.handle('fan-benchmark', async () => {
  if (!fs.existsSync(FAN_CALIBRATE)) return { ok: false, err: 'calibrate-fans.sh no encontrado' };
  const res = await run('pkexec', ['bash', FAN_CALIBRATE], 360000);
  if (!res.ok) return res;
  const lines = res.out.split('\n').map((l) => l.trim()).filter(Boolean);
  const labelLine = lines.find((l) => l.startsWith('labels,'));
  if (!labelLine) return { ok: false, err: 'la calibración no devolvió datos', raw: res.out };
  // hwmon labels (cpu_fan/gpu_fan/mid_fan/fanN) → JSON keys (cpu/gpu/mid/fanN)
  const keys = labelLine.split(',').slice(1).map((label) => {
    const short = label.replace(/_fan$/, '');
    return ['cpu', 'gpu', 'mid'].includes(short) ? short : label;
  });
  const calibration = {};
  const max = {};
  for (const key of keys) calibration[key] = [];
  for (const line of lines) {
    const cells = line.split(',');
    if (cells[0] !== 'pwm') continue;
    const pwm = +cells[1];
    keys.forEach((key, i) => {
      const rpm = +cells[2 + i] || 0;
      if (rpm > 0) calibration[key].push([pwm, rpm]);
      max[key] = Math.max(max[key] || 0, rpm);
    });
  }
  // Sanity: RPM debe crecer con el PWM. Si un ventilador venía girando y no
  // alcanzó a estabilizar, su punto sale alto; se descarta partiendo del
  // punto más confiable (PWM máximo) hacia abajo.
  for (const key of keys) {
    const points = calibration[key].sort((a, b) => b[0] - a[0]);
    const clean = [];
    for (const [pwm, rpm] of points) {
      if (!clean.length || rpm < clean[clean.length - 1][1]) clean.push([pwm, rpm]);
    }
    calibration[key] = clean.reverse();
  }
  if (!Object.values(max).some((v) => v > 0)) {
    return { ok: false, err: 'no se midieron RPM (¿curvas no editables?)', raw: res.out };
  }
  const store = readCurvesStore();
  store.calibration = calibration;
  store.max_rpm = max;
  try {
    fs.mkdirSync(path.dirname(FAN_CURVES_JSON), { recursive: true });
    fs.writeFileSync(FAN_CURVES_JSON, JSON.stringify(store, null, 2) + '\n');
  } catch (err) {
    return { ok: false, err: `Medí los máximos pero no pude guardar: ${err.message}` };
  }
  return { ok: true, max, calibration, raw: res.out };
});

/* ---------- FPS via MangoHud logging ----------
   Only MangoHud (inside the game) knows the real FPS. With logging enabled it
   appends CSV rows while playing; the backend tails the freshest file. */

const MANGOHUD_CONF = path.join(os.homedir(), '.config', 'MangoHud', 'MangoHud.conf');
const FPS_LOG_DIR = path.join(os.homedir(), '.local', 'share', 'rog-monitor', 'mangohud-logs');
const FPS_BLOCK_START = '# --- ROG Monitor FPS (autogenerado, no editar) ---';
const FPS_BLOCK_END = '# --- /ROG Monitor FPS ---';

function fpsLoggingEnabled() {
  try {
    return fs.readFileSync(MANGOHUD_CONF, 'utf-8').includes(FPS_BLOCK_START);
  } catch (_) {
    return false;
  }
}

ipcMain.handle('get-fps-logging', () => ({
  ok: true,
  enabled: fpsLoggingEnabled(),
  mangohud: !!whichBin('mangohud'),
}));

ipcMain.handle('set-fps-logging', (_e, enabled) => {
  let conf = '';
  try { conf = fs.readFileSync(MANGOHUD_CONF, 'utf-8'); } catch (_) { /* new file */ }
  const blockRe = new RegExp(`\\n?${FPS_BLOCK_START}[\\s\\S]*?${FPS_BLOCK_END}\\n?`);
  conf = conf.replace(blockRe, '\n');
  if (enabled) {
    conf = conf.trimEnd() + [
      '', FPS_BLOCK_START,
      `output_folder=${FPS_LOG_DIR}`,
      'autostart_log=1',
      'log_interval=500',
      FPS_BLOCK_END, '',
    ].join('\n');
  }
  try {
    fs.mkdirSync(path.dirname(MANGOHUD_CONF), { recursive: true });
    fs.mkdirSync(FPS_LOG_DIR, { recursive: true });
    fs.writeFileSync(MANGOHUD_CONF, conf.trimStart());
  } catch (err) {
    return { ok: false, err: `No pude editar ${MANGOHUD_CONF}: ${err.message}` };
  }
  return { ok: true, enabled };
});

/* ---------- config export / import ----------
   Toda la configuración del usuario vive en ~/.config/rog-monitor (curvas y
   cap, perfiles Aura, umbrales). Estos botones la empaquetan en un solo JSON
   para respaldarla o llevarla a otro equipo. */

const CONFIG_DIR_PATH = path.join(os.homedir(), '.config', 'rog-monitor');
const CONFIG_FILES = ['fan-curves.json', 'aura.json', 'config.json'];

ipcMain.handle('export-config', async () => {
  const bundle = {
    app: 'rog-monitor',
    version: require('./package.json').version,
    exported_at: new Date().toISOString(),
    configs: {},
  };
  for (const name of CONFIG_FILES) {
    try {
      bundle.configs[name] = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR_PATH, name), 'utf-8'));
    } catch (_) { /* config que aún no existe: se omite */ }
  }
  const stamp = new Date().toISOString().slice(0, 10);
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Exportar configuración',
    defaultPath: path.join(app.getPath('documents'), `rog-monitor-config-${stamp}.json`),
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePath) return { ok: false, err: 'cancelado' };
  try {
    fs.writeFileSync(filePath, JSON.stringify(bundle, null, 2) + '\n');
    return { ok: true, path: filePath, items: Object.keys(bundle.configs) };
  } catch (err) {
    return { ok: false, err: String(err.message) };
  }
});

ipcMain.handle('import-config', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Importar configuración',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths.length) return { ok: false, err: 'cancelado' };
  let bundle;
  try {
    bundle = JSON.parse(fs.readFileSync(filePaths[0], 'utf-8'));
  } catch (err) {
    return { ok: false, err: `JSON inválido: ${err.message}` };
  }
  if (bundle.app !== 'rog-monitor' || typeof bundle.configs !== 'object') {
    return { ok: false, err: 'Ese archivo no es una configuración de ROG Monitor.' };
  }
  const imported = [];
  try {
    fs.mkdirSync(CONFIG_DIR_PATH, { recursive: true });
    for (const name of CONFIG_FILES) {
      if (!bundle.configs[name]) continue;
      const target = path.join(CONFIG_DIR_PATH, name);
      // respaldo del archivo actual antes de pisarlo
      if (fs.existsSync(target)) fs.copyFileSync(target, `${target}.pre-import`);
      fs.writeFileSync(target, JSON.stringify(bundle.configs[name], null, 2) + '\n');
      imported.push(name);
    }
  } catch (err) {
    return { ok: false, err: String(err.message) };
  }
  if (!imported.length) return { ok: false, err: 'El archivo no traía configuraciones.' };
  startBackend(); // recarga umbrales/colores
  return { ok: true, items: imported };
});

ipcMain.handle('report-issue', async (_e, body) => {
  const remote = await run('git', ['remote', 'get-url', 'origin']);
  if (!remote.ok || !remote.out) return { ok: false, err: 'sin remoto git' };
  const url = remote.out
    .replace(/^git@github\.com:/, 'https://github.com/')
    .replace(/\.git$/, '');
  const errorTail = readErrorLogTail(80);
  const fullBody = [
    body || '',
    '',
    '---',
    '**Registro local reciente:**',
    errorTail ? '```jsonl\n' + errorTail.slice(-12000) + '\n```' : '_Sin errores registrados._',
    '',
    `TXT local completo: ${LAST_ISSUE_REPORT_PATH}`,
  ].join('\n');
  try {
    fs.mkdirSync(DATA_DIR_PATH, { recursive: true });
    fs.writeFileSync(LAST_ISSUE_REPORT_PATH, fullBody + '\n', 'utf-8');
  } catch (_) { /* non-fatal */ }
  const params = new URLSearchParams({
    title: '[bug] ',
    body: fullBody.slice(0, 58000),
    labels: 'bug',
  });
  shell.openExternal(`${url}/issues/new?${params}`);
  return { ok: true, logPath: LAST_ISSUE_REPORT_PATH };
});

ipcMain.handle('record-error', (_e, payload) => {
  appendErrorLog('renderer', payload && typeof payload === 'object' ? payload : { message: String(payload || '') });
  return { ok: true, path: ERROR_LOG_PATH };
});

ipcMain.handle('get-error-log', () => ({
  ok: true,
  path: ERROR_LOG_PATH,
  text: readErrorLogTail(120),
}));

ipcMain.handle('disk-health', async () => {
  // smartctl needs root: one pkexec prompt for all disks
  const devices = fs.readdirSync('/sys/block')
    .filter((d) => /^(nvme\d+n\d+|sd[a-z])$/.test(d))
    .map((d) => `/dev/${d}`);
  if (!devices.length) return { ok: false, err: 'no encontré discos' };
  const script = devices.map((d) =>
    `echo "===${d}"; smartctl -H -A ${d} 2>&1 | grep -iE "result|percentage used|temperature|power_on|available spare:|reallocated|wear" || true`
  ).join('; ');
  const res = await run('pkexec', ['sh', '-c', script], 30000);
  if (!res.ok) return res;
  const disks = [];
  for (const part of res.out.split(/^===/m).filter(Boolean)) {
    const [dev, ...lines] = part.trim().split('\n');
    disks.push({ device: dev, info: lines.map((l) => l.trim()).filter(Boolean) });
  }
  return { ok: true, disks };
});

/* ---------- settings (alert thresholds / colors) ---------- */

ipcMain.handle('get-settings', async () =>
  runJsonModule('rog_monitor.settings', ['get'], 6000));

ipcMain.handle('save-settings', async (_e, payload) => {
  const res = await runJsonModule('rog_monitor.settings', ['update', '--json', JSON.stringify(payload)], 6000);
  // AlertEngine reads config.json once at startup; restart the backend so the
  // new thresholds and colors take effect immediately.
  if (res.ok) startBackend();
  return res;
});

/* ---------- Aura / RGB ---------- */

async function auraSetupStatus() {
  const serviceUnitExists = fs.existsSync('/etc/systemd/system/asusd.service');
  const scriptExists = fs.existsSync(ENABLE_ASUSD);
  const active = await run('systemctl', ['is-active', 'asusd.service'], 4000);
  const enabled = await run('systemctl', ['is-enabled', 'asusd.service'], 4000);
  return {
    scriptExists,
    serviceUnitExists,
    serviceActive: active.ok && active.out === 'active',
    serviceEnabled: enabled.ok && enabled.out === 'enabled',
    needsSetup: !serviceUnitExists || !active.ok || active.out !== 'active',
    statusHint: !serviceUnitExists
      ? 'asusd todavía no está instalado/configurado en systemd.'
      : (!active.ok || active.out !== 'active')
          ? 'asusd existe pero no está corriendo.'
          : 'asusd está activo.',
  };
}

ipcMain.handle('get-aura-state', async () => {
  const res = await runJsonModule('rog_monitor.aura', ['state'], 8000);
  if (res.ok === false) return res;
  res.setup = await auraSetupStatus();
  return { ok: true, aura: res };
});

ipcMain.handle('enable-aura-service', async () => {
  if (!fs.existsSync(ENABLE_ASUSD)) {
    return { ok: false, err: `No encontré ${ENABLE_ASUSD}` };
  }
  const res = await run('pkexec', ['bash', ENABLE_ASUSD, '--yes'], 120000);
  if (!res.ok) return res;
  return { ok: true, setup: await auraSetupStatus(), out: res.out };
});

ipcMain.handle('apply-aura', async (_e, state) =>
  runJsonModule('rog_monitor.aura', ['apply', '--json', JSON.stringify(state)], 15000));

ipcMain.handle('save-aura-profile', async (_e, { name, state }) =>
  runJsonModule('rog_monitor.aura', ['save-profile', '--name', name, '--json', JSON.stringify(state)], 8000));

ipcMain.handle('delete-aura-profile', async (_e, name) =>
  runJsonModule('rog_monitor.aura', ['delete-profile', '--name', name], 8000));

ipcMain.handle('set-aura-startup', async (_e, { name, enabled }) =>
  runJsonModule('rog_monitor.aura', ['set-startup', '--name', name || '', ...(enabled ? ['--enabled'] : [])], 8000));

function hexToRgb(hex) {
  const clean = String(hex || 'ff5500').replace('#', '');
  return {
    r: parseInt(clean.slice(0, 2), 16) || 0,
    g: parseInt(clean.slice(2, 4), 16) || 0,
    b: parseInt(clean.slice(4, 6), 16) || 0,
  };
}

function rgbToHex({ r, g, b }) {
  return [r, g, b].map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')).join('');
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function brighten(hex, factor) {
  const base = hexToRgb(hex);
  const mixed = {
    r: lerp(base.r, 255, factor),
    g: lerp(base.g, 255, factor * 0.55),
    b: lerp(base.b, 255, factor * 0.2),
  };
  return rgbToHex(mixed);
}

// Ruta D-Bus del teclado Aura (para escribir Brightness directo: ~20 ms
// contra ~1 s de spawnear asusctl — la música necesita esa velocidad).
let auraDbusPath = null;
function auraPath() {
  if (auraDbusPath !== null) return auraDbusPath;
  try {
    const res = spawnSync('busctl', ['--system', 'tree', 'xyz.ljones.Asusd'], { encoding: 'utf-8', env: APP_ENV, timeout: 3000 });
    const m = (res.stdout || '').match(/\/xyz\/ljones\/aura\/[A-Za-z0-9_]+/);
    auraDbusPath = m ? m[0] : '';
  } catch (_) {
    auraDbusPath = '';
  }
  return auraDbusPath;
}

const BRIGHTNESS_NUM = { off: 0, low: 1, med: 2, high: 3 };

async function applyMusicFrame(level) {
  if (!musicMode.active || !musicMode.baseState) return;
  const now = Date.now();
  if (musicMode.applying || now - musicMode.lastApplyTs < 90) return;
  // Color cuantizado a 5 niveles: cambiarlo cuesta ~1 s de asusctl, así que
  // solo cuando el salto es notorio. El brillo (rápido) lleva el pulso.
  const colour = brighten(musicMode.baseState.colour || 'ff5500',
    Math.min(1, Math.round(level * 5) / 5 * 1.4));
  // Nunca bajamos a 'off' en silencio: el teclado se vería "apagado/roto".
  // El piso es 'low' para que siempre se note que el modo música está vivo.
  const brightness = level < 0.05 ? 'low' : level < 0.15 ? 'med' : 'high';
  if (brightness === musicMode.lastBrightness && colour === musicMode.lastColour) return;
  musicMode.applying = true;
  musicMode.lastApplyTs = now;
  try {
    const path = auraPath();
    if (brightness !== musicMode.lastBrightness && path) {
      const res = await run('busctl', ['--system', 'set-property', 'xyz.ljones.Asusd',
        path, 'xyz.ljones.Aura', 'Brightness', 'u', String(BRIGHTNESS_NUM[brightness])], 3000);
      if (res.ok) musicMode.lastBrightness = brightness;
    }
    if (colour !== musicMode.lastColour) {
      const payload = { ...musicMode.baseState, effect: 'static', brightness, colour };
      const res = await runJsonModule('rog_monitor.aura', ['apply', '--json', JSON.stringify(payload)], 8000);
      if (res.ok) {
        musicMode.lastBrightness = brightness;
        musicMode.lastColour = colour;
      }
    }
  } finally {
    musicMode.applying = false;
  }
}

// Sink por defecto (lo que suena por los parlantes). OJO: "<sink>.monitor"
// solo existe en la capa PulseAudio (parec); NO es un nodo PipeWire, así que
// pw-record --target <sink>.monitor no matchea nada y cae EN SILENCIO al
// micrófono (verificado con pw-link: la captura quedaba colgada del
// alsa_input — por eso el modo música reaccionaba a la voz y no a la
// canción). Para pw-record/pw-cat el target es el SINK con
// stream.capture.sink=true.
function resolveDefaultSink() {
  try {
    const res = spawnSync('pactl', ['get-default-sink'], { encoding: 'utf-8', env: APP_ENV });
    const sink = (res.stdout || '').trim();
    if (res.status === 0 && sink) return sink;
  } catch (_) { /* ignore */ }
  return null;
}

function whichBin(bin) {
  try {
    const res = spawnSync('which', [bin], { encoding: 'utf-8', env: APP_ENV });
    return res.status === 0 ? res.stdout.trim() : null;
  } catch (_) {
    return null;
  }
}

// Devuelve [cmd, args] de la primera herramienta de captura instalada,
// SIEMPRE apuntando al monitor del sink (lo que suena), nunca al micrófono:
// - pw-record/pw-cat: target = sink + stream.capture.sink=true (PipeWire).
// - parec: device = <sink>.monitor (nombre de la capa Pulse).
function pickAudioCapture(sink) {
  const sinkProps = ['-P', '{ stream.capture.sink = true }'];
  if (whichBin('pw-record') && sink) {
    return ['pw-record', [...sinkProps, '--target', sink, '--rate', '22050', '--channels', '1', '--format', 's16', '--raw', '-']];
  }
  if (whichBin('pw-cat') && sink) {
    return ['pw-cat', ['--record', '--raw', ...sinkProps, '--target', sink, '--rate', '22050', '--channels', '1', '--format', 's16', '-']];
  }
  if (whichBin('parec')) {
    return ['parec', ['--raw', '--rate=22050', '--format=s16le', '--channels=1', `--device=${sink ? `${sink}.monitor` : '@DEFAULT_MONITOR@'}`]];
  }
  return null;
}

function startMusicMode(baseState) {
  if (musicProc) stopMusicMode(false);
  const monitor = resolveDefaultSink();
  const capture = pickAudioCapture(monitor);
  if (!capture) {
    return { ok: false, err: 'No encontré pw-record, pw-cat ni parec para capturar el audio del sistema.' };
  }
  let proc = null;
  try {
    proc = spawn(capture[0], capture[1], { stdio: ['ignore', 'pipe', 'ignore'], env: APP_ENV });
    proc.once('error', () => {});
  } catch (err) {
    return { ok: false, err: `No pude abrir la fuente de audio (${capture[0]}): ${err.message || err}` };
  }

  musicProc = proc;
  musicMode = {
    active: true,
    baseState,
    lastBrightness: null,
    lastColour: null,
    lastApplyTs: 0,
    applying: false,
  };

  let buffer = Buffer.alloc(0);
  proc.stdout.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    if (buffer.length < 4096) return;
    const length = buffer.length - (buffer.length % 2);
    let peak = 0;
    for (let i = 0; i < length; i += 2) {
      const sample = Math.abs(buffer.readInt16LE(i)) / 32768;
      if (sample > peak) peak = sample;
    }
    buffer = Buffer.alloc(0);
    applyMusicFrame(peak);
  });
  proc.on('exit', () => {
    musicProc = null;
    musicMode.active = false;
    if (win && !win.isDestroyed()) win.webContents.send('music-stopped');
  });
  return { ok: true, active: true };
}

async function stopMusicMode(restore = true) {
  if (musicProc) {
    musicProc.kill('SIGTERM');
    musicProc = null;
  }
  const previous = musicMode.baseState;
  musicMode.active = false;
  if (restore && previous) {
    await runJsonModule('rog_monitor.aura', ['apply', '--json', JSON.stringify(previous)], 10000);
  }
  return { ok: true, active: false };
}

ipcMain.handle('set-music-mode', async (_e, { enabled, state }) => {
  if (!enabled) return stopMusicMode(true);
  return startMusicMode(state);
});

/* ---------- thermal benchmarks ---------- */

ipcMain.handle('cpu-benchmark', async (_e, seconds = 45) =>
  runJsonModule('rog_monitor.benchmarks', ['cpu', '--seconds', String(seconds)], (seconds + 20) * 1000));

ipcMain.handle('gpu-benchmark', async (_e, seconds = 45) =>
  runJsonModule('rog_monitor.benchmarks', ['gpu', '--seconds', String(seconds)], (seconds + 25) * 1000));

/* ---------- game session (v11) ----------
   Timeouts generosos en stop/get/compare: sesiones de 100 min tienen
   ~6 000 samples; serializar + leer puede tomar 2-3 s en disco lento.
   maxBuffer ya está en 16 MB (runPythonModule), suficiente para ~80 min. */
// Mientras se graba una sesión, el renderer sondea cada 1 s con un proceso
// aparte. Si la ventana se minimiza, Electron throttlearía ese timer (~1/min)
// y la grabación se cortaría. Al grabar, desactivamos el throttling del
// renderer para que siga muestreando aunque esté oculta (el backend en stream
// sí se congela: la grabación no lo usa, así que igual se ahorra energía).
ipcMain.handle('set-recording', (_e, on) => {
  try {
    if (win && !win.isDestroyed() && win.webContents.setBackgroundThrottling) {
      win.webContents.setBackgroundThrottling(!on);
    }
  } catch (_) { /* API no disponible: no pasa nada grave */ }
  return { ok: true };
});

ipcMain.handle('game-session-start', async () =>
  runJsonModule('rog_monitor.game_session', ['start'], 8000));
ipcMain.handle('game-session-sample', async (_e, id) =>
  runJsonModule('rog_monitor.game_session', ['sample', '--id', id], 12000));
ipcMain.handle('game-session-stop', async (_e, id) =>
  runJsonModule('rog_monitor.game_session', ['stop', '--id', id], 30000));
ipcMain.handle('game-session-list', async () =>
  runJsonModule('rog_monitor.game_session', ['list'], 15000));
ipcMain.handle('game-session-get', async (_e, id) =>
  runJsonModule('rog_monitor.game_session', ['get', '--id', id], 30000));
ipcMain.handle('game-session-compare', async (_e, { a, b }) =>
  runJsonModule('rog_monitor.game_session', ['compare', '--a', a, '--b', b], 20000));
ipcMain.handle('game-session-baseline', async () =>
  runJsonModule('rog_monitor.game_session', ['baseline'], 8000));
ipcMain.handle('game-session-delete', async (_e, id) =>
  runJsonModule('rog_monitor.game_session', ['delete', '--id', id], 8000));
ipcMain.handle('game-session-note', async (_e, { id, text }) =>
  runJsonModule('rog_monitor.game_session', ['note', '--id', id, '--text', String(text == null ? '' : text)], 8000));

ipcMain.handle('export-benchmark', async (_e, { kind, text }) => {
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Exportar benchmark',
    defaultPath: path.join(app.getPath('documents'),
      `rog-monitor-benchmark-${kind || 'termico'}-${stamp}.json`),
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePath) return { ok: false, err: 'cancelado' };
  try {
    fs.writeFileSync(filePath, text, 'utf-8');
    return { ok: true, path: filePath };
  } catch (err) {
    return { ok: false, err: String(err.message) };
  }
});

ipcMain.handle('kill-process', (_e, pid) => {
  pid = parseInt(pid, 10);
  if (!pid || pid <= 1) return { ok: false, err: 'PID inválido' };
  try {
    process.kill(pid, 'SIGTERM');
    return { ok: true };
  } catch (err) {
    return { ok: false, err: err.code === 'EPERM' ? 'sin permiso (proceso de otro usuario)' : String(err.message) };
  }
});

ipcMain.handle('export-events', async (_e, text) => {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Exportar eventos',
    defaultPath: path.join(app.getPath('documents'),
      `rog-monitor-eventos-${new Date().toISOString().slice(0, 10)}.txt`),
    filters: [{ name: 'Texto', extensions: ['txt'] }],
  });
  if (canceled || !filePath) return { ok: false, err: 'cancelado' };
  try {
    fs.writeFileSync(filePath, text, 'utf-8');
    return { ok: true, path: filePath };
  } catch (err) {
    return { ok: false, err: String(err.message) };
  }
});

ipcMain.handle('app-info', () => ({
  appVersion: APP_VERSION,
  coreVersion: APP_VERSION,
  repo: REPO,
}));

/* ---------- autoarranque minimizado (XDG autostart) ----------
   Sin daemon: solo una entrada .desktop en ~/.config/autostart que lanza la
   app minimizada al iniciar sesión. El backend queda congelado (SIGSTOP) hasta
   que abras la ventana, así que no consume CPU en reposo. */
const AUTOSTART_DESKTOP = path.join(
  os.homedir(), '.config', 'autostart', 'rog-monitor.desktop');

ipcMain.handle('get-autostart', () => {
  try { return { ok: true, enabled: fs.existsSync(AUTOSTART_DESKTOP) }; }
  catch (e) { return { ok: false, err: String((e && e.message) || e) }; }
});

/* ---------- mantenimiento: reinstalar / desinstalar ---------- */
ipcMain.handle('reinstall-app', async () => {
  // Reinstala dependencias de usuario (venv) y reinicia el backend. Sin sudo.
  const res = await run('bash', [path.join(REPO, 'scripts', 'install.sh')], 180000);
  if (res.ok) startBackend();
  return res;
});

ipcMain.handle('uninstall-app', async (_e, { purge } = {}) => {
  // Nivel usuario (sin privilegios): launcher, entrada de menú, autostart.
  const userTargets = [
    path.join(os.homedir(), '.local', 'bin', 'monitor'),
    path.join(os.homedir(), '.local', 'share', 'applications', 'rog-monitor.desktop'),
    AUTOSTART_DESKTOP,
  ];
  for (const f of userTargets) { try { fs.rmSync(f, { force: true }); } catch (_) {} }

  // Nivel sistema (pkexec, una sola contraseña): servicios/units/udev/scripts.
  const safeMode = path.join(REPO, 'scripts', 'rog-monitor-safe-mode.sh');
  const sys = await run('pkexec', ['bash', safeMode, 'uninstall'], 60000);

  if (purge) {
    for (const d of [CONFIG_DIR_PATH, DATA_DIR_PATH]) {
      try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {}
    }
  }
  // Cerrar la app tras desinstalar.
  setTimeout(() => { try { app.quit(); } catch (_) {} }, 800);
  return { ok: true, systemRemoved: sys.ok, systemErr: sys.ok ? '' : sys.err };
});

ipcMain.handle('set-autostart', (_e, enabled) => {
  try {
    if (enabled) {
      const startSh = path.join(__dirname, 'start.sh');
      const icon = path.join(__dirname, 'assets', 'icon.png');
      const content = [
        '[Desktop Entry]',
        'Type=Application',
        'Name=ROG Monitor',
        'Comment=Monitor de hardware para portátiles ASUS ROG',
        `Exec=${startSh} --minimized`,
        `Icon=${icon}`,
        'Terminal=false',
        'Categories=System;Monitor;',
        'StartupWMClass=rog-monitor',
        'X-GNOME-Autostart-enabled=true',
        '',
      ].join('\n');
      fs.mkdirSync(path.dirname(AUTOSTART_DESKTOP), { recursive: true });
      fs.writeFileSync(AUTOSTART_DESKTOP, content);
    } else {
      fs.rmSync(AUTOSTART_DESKTOP, { force: true });
    }
    return { ok: true, enabled: !!enabled };
  } catch (e) {
    return { ok: false, err: String((e && e.message) || e) };
  }
});

/* ---------- gaming overlay (always-on-top stats) ----------
   A frameless, click-through, transparent window pinned to a corner of the
   chosen monitor. It stays above fullscreen games so you can watch temps and
   fan RPM while playing. No undervolt/overclock here — only read-only stats. */

const OVERLAY_MARGIN = 18;

function displayList() {
  const primaryId = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    label: `Monitor ${i + 1} (${d.size.width}×${d.size.height})${d.id === primaryId ? ' · principal' : ''}`,
    primary: d.id === primaryId,
  }));
}

function pickDisplay(displayId) {
  const all = screen.getAllDisplays();
  return all.find((d) => d.id === displayId) || screen.getPrimaryDisplay();
}

function positionOverlay() {
  if (!overlay || overlay.isDestroyed()) return;
  const d = pickDisplay(overlayCfg.displayId);
  const wa = d.workArea; // respects panels/taskbars
  const { width, height } = overlay.getBounds();
  const right = wa.x + wa.width - width - OVERLAY_MARGIN;
  const bottom = wa.y + wa.height - height - OVERLAY_MARGIN;
  const left = wa.x + OVERLAY_MARGIN;
  const top = wa.y + OVERLAY_MARGIN;
  const centerX = wa.x + Math.round((wa.width - width) / 2);
  const centerY = wa.y + Math.round((wa.height - height) / 2);
  const pos = {
    'top-left': [left, top],
    'top-center': [centerX, top],
    'top-right': [right, top],
    'center': [centerX, centerY],
    'bottom-left': [left, bottom],
    'bottom-center': [centerX, bottom],
    'bottom-right': [right, bottom],
  }[overlayCfg.corner] || [centerX, top];
  overlay.setPosition(Math.round(pos[0]), Math.round(pos[1]));
}

// Tamaño según layout: fila delgada (default) o cuadro clásico.
function overlaySize() {
  return overlayCfg.layout === 'box'
    ? { width: 232, height: 150 }
    : { width: 540, height: 58 };
}

function createOverlay() {
  const { width, height } = overlaySize();
  overlay = new BrowserWindow({
    width,
    height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // float above fullscreen games on every virtual desktop
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlay.setIgnoreMouseEvents(true); // click-through so it never grabs the game
  overlay.loadFile(path.join(__dirname, 'renderer', 'overlay.html'));
  overlay.once('ready-to-show', () => {
    positionOverlay();
    pushOverlayConfig();
  });
  overlay.on('closed', () => { overlay = null; });
}

// El overlay decide qué filas pintar, el layout (fila/cuadro) y el acento del
// tema según lo que mande el modal.
function pushOverlayConfig() {
  if (overlay && !overlay.isDestroyed()) {
    overlay.webContents.send('overlay-config', {
      show: overlayCfg.show || { cpu: true, gpu: true, fans: true },
      layout: overlayCfg.layout || 'row',
      accent: overlayCfg.accent || null,
    });
  }
}

function applyOverlay() {
  if (overlayCfg.enabled) {
    if (!overlay || overlay.isDestroyed()) createOverlay();
    else { positionOverlay(); pushOverlayConfig(); overlay.showInactive(); }
  } else if (overlay && !overlay.isDestroyed()) {
    overlay.close();
    overlay = null;
  }
  // el overlay puede necesitar el backend aunque la ventana esté minimizada
  updateBackendPower();
}

ipcMain.handle('list-displays', () => ({ ok: true, displays: displayList(), current: overlayCfg }));

ipcMain.handle('set-overlay', (_e, cfg) => {
  const layoutChanged = cfg.layout && cfg.layout !== overlayCfg.layout;
  overlayCfg = {
    enabled: !!cfg.enabled,
    displayId: cfg.displayId ?? overlayCfg.displayId,
    corner: cfg.corner || overlayCfg.corner,
    show: cfg.show || overlayCfg.show,
    layout: cfg.layout || overlayCfg.layout,
    accent: cfg.accent ?? overlayCfg.accent,
  };
  // Si cambió el layout, redimensionar la ventana antes de reposicionar.
  if (layoutChanged && overlay && !overlay.isDestroyed()) {
    overlay.setBounds(overlaySize());
  }
  applyOverlay();
  return { ok: true, current: overlayCfg };
});

// Arranque minimizado: lo usa la entrada de autostart (start.sh --minimized).
// Al estar minimizada, los listeners de abajo ponen mainVisible=false y el
// backend Python queda en SIGSTOP (0% CPU): "iniciar con el sistema" no roba
// rendimiento hasta que abres la ventana.
const START_MINIMIZED = process.argv.includes('--minimized');

function createWindow() {
  win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    show: !START_MINIMIZED,
    backgroundColor: '#0b0d10',
    autoHideMenuBar: true,
    title: 'ROG Monitor',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: true, // throttlea timers/rAF del renderer al ocultarse
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => {
    if (START_MINIMIZED) {
      mainVisible = false;
      win.showInactive();   // aparece en la barra de tareas…
      win.minimize();        // …pero minimizada, sin robar foco
      updateBackendPower();  // congela el backend hasta que la abras
    } else {
      win.show();
    }
  });
  // Ahorro: congelar/reanudar el backend según se vea o no la ventana.
  ['minimize', 'hide'].forEach((ev) => win.on(ev, () => { mainVisible = false; updateBackendPower(); }));
  ['restore', 'show', 'focus'].forEach((ev) => win.on(ev, () => { mainVisible = true; updateBackendPower(); }));
  // closing the main window tears down the overlay too
  win.on('closed', () => {
    if (overlay && !overlay.isDestroyed()) overlay.close();
  });
}

/* ---------- power control (A6) ----------
   Lectura vía rog_monitor.power_control CLI; escritura:
   - pl1/pl2/dynamic_boost/thermal_target → pkexec apply-power-control.sh
   - base_clock_offset/mem_clock_offset   → pkexec apply-gpu-clocks.sh (NVML, Wayland OK)
   power_control.py ya hace el dispatch correcto al recibir changes con cualquier mezcla.
   Canales IPC: get-power-control / set-power-control / reset-power-control. */

const APPLY_POWER_SCRIPT = path.join(REPO, 'scripts', 'apply-power-control.sh');
const APPLY_GPU_CLOCKS_SCRIPT = path.join(REPO, 'scripts', 'apply-gpu-clocks.sh');

ipcMain.handle('get-power-control', async () =>
  runJsonModule('rog_monitor.power_control', ['state'], 8000));

/* Centro de Poder — modo Avanzado: base de datos de rangos seguros + enlaces a
   documentación oficial por marca/componente. Solo lectura de un JSON del repo. */
const DEVICE_DOCS = path.join(REPO, 'src', 'rog_monitor', 'device_docs.json');
ipcMain.handle('get-device-docs', async () => {
  try {
    const json = JSON.parse(fs.readFileSync(DEVICE_DOCS, 'utf8'));
    // Exponer como `docs` (array) para que power.js use la vía IPC directa.
    return { ok: true, docs: json.entries || json.docs || [], schema: json._schema };
  } catch (e) {
    return { ok: false, err: String((e && e.message) || e) };
  }
});

/* Abrir un enlace de documentación en el navegador del sistema. Solo http(s). */
ipcMain.handle('open-external', async (_e, url) => {
  try {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      await shell.openExternal(url);
      return { ok: true };
    }
    return { ok: false, err: 'URL no permitida' };
  } catch (e) {
    return { ok: false, err: String((e && e.message) || e) };
  }
});

ipcMain.handle('set-power-control', async (_e, payload) => {
  // Allowlist de claves: las 4 de asus-armoury + 2 de GPU clocks (NVML).
  // power_control.py se encarga del dispatch al script correcto.
  const ALLOWED_ATTRS = ['pl1', 'pl2', 'dynamic_boost', 'thermal_target'];
  const ALLOWED_CLOCKS = ['base_clock_offset', 'mem_clock_offset'];
  const ALL_ALLOWED = [...ALLOWED_ATTRS, ...ALLOWED_CLOCKS];

  const changes = {};
  for (const key of ALL_ALLOWED) {
    if (payload && payload[key] !== undefined && Number.isFinite(+payload[key])) {
      changes[key] = Math.round(+payload[key]);
    }
  }
  if (!Object.keys(changes).length) {
    return { ok: false, err: 'No hay valores válidos para aplicar.' };
  }

  // Verificar que los scripts existan antes de llamar al módulo Python.
  const hasAttrs = ALLOWED_ATTRS.some((k) => k in changes);
  const hasClocks = ALLOWED_CLOCKS.some((k) => k in changes);

  if (hasAttrs && !fs.existsSync(APPLY_POWER_SCRIPT)) {
    return { ok: false, err: `Script no encontrado: ${APPLY_POWER_SCRIPT}` };
  }
  if (hasClocks && !fs.existsSync(APPLY_GPU_CLOCKS_SCRIPT)) {
    return { ok: false, err: `Script no encontrado: ${APPLY_GPU_CLOCKS_SCRIPT}` };
  }

  // Delegar todo a power_control.py (que internamente hace pkexec a cada script).
  // apply() devuelve {ok, applied, state:{...snapshot...}} — lo aplanamos para
  // que el renderer vea la MISMA forma que get-power-control (controls/available
  // a nivel raíz), consistente con el contrato canónico.
  const res = await runJsonModule('rog_monitor.power_control',
    ['apply', '--json', JSON.stringify(changes)], 25000);
  if (!res || res.ok === false) return res;
  const flat = res.state && typeof res.state === 'object' ? res.state : res;
  return { ...flat, ok: true, applied: res.applied };
});

ipcMain.handle('reset-power-control', async () => {
  // Lee los defaults y aplica solo los attrs de asus-armoury (no se resetean offsets GPU).
  const state = await runJsonModule('rog_monitor.power_control', ['state'], 8000);
  if (!state || state.ok === false) return state;
  const controls = state.controls || {};
  const ALLOWED = ['pl1', 'pl2', 'dynamic_boost', 'thermal_target'];
  const args = [];
  for (const key of ALLOWED) {
    const ctrl = controls[key];
    if (ctrl && ctrl.writable && ctrl.default !== null && ctrl.default !== undefined) {
      args.push(`${key}=${Math.round(ctrl.default)}`);
    }
  }
  if (!args.length) return { ok: false, err: 'No hay defaults que restaurar.' };
  if (!fs.existsSync(APPLY_POWER_SCRIPT)) {
    return { ok: false, err: `Script no encontrado: ${APPLY_POWER_SCRIPT}` };
  }
  const res = await run('pkexec', ['bash', APPLY_POWER_SCRIPT, ...args], 20000);
  if (!res.ok) return res;
  return runJsonModule('rog_monitor.power_control', ['state'], 8000);
});

/* ---------- guardián térmico CPU/GPU ----------
   rog-thermal-guardian.sh: loop que sube ventiladores primero y, si el techo
   se supera, recorta dynamic_boost / PL2 suavemente. Se instala como servicio
   systemd. En runtime: start/stop vía systemctl + pkexec; estado vía is-active. */

const THERMAL_GUARDIAN_SERVICE = 'rog-thermal-guardian.service';
const THERMAL_GUARDIAN_SCRIPT = path.join(REPO, 'scripts', 'rog-thermal-guardian.sh');
const THERMAL_GUARDIAN_UNIT = path.join(REPO, 'systemd', 'rog-thermal-guardian.service');

function readGuardianOverride() {
  const overridePath = `/etc/systemd/system/${THERMAL_GUARDIAN_SERVICE}.d/override.conf`;
  const out = { cpuCeiling: 92, gpuCeiling: 83, mode: 'protection' };
  try {
    const text = fs.readFileSync(overridePath, 'utf-8');
    const cpu = text.match(/ROG_THERMAL_CPU_CEILING=(\d+)/);
    const gpu = text.match(/ROG_THERMAL_GPU_CEILING=(\d+)/);
    const legacy = text.match(/ROG_THERMAL_CEILING=(\d+)/);
    const mode = text.match(/ROG_THERMAL_MODE=(\w+)/);
    if (cpu) out.cpuCeiling = parseInt(cpu[1], 10);
    if (gpu) out.gpuCeiling = parseInt(gpu[1], 10);
    else if (legacy) out.gpuCeiling = parseInt(legacy[1], 10);
    if (mode && (mode[1] === 'gaming' || mode[1] === 'protection')) out.mode = mode[1];
  } catch (_) { /* no override */ }
  out.cpuCeiling = Math.max(70, Math.min(100, out.cpuCeiling));
  out.gpuCeiling = Math.max(70, Math.min(87, out.gpuCeiling));
  out.ceiling = out.gpuCeiling;
  return out;
}

ipcMain.handle('get-thermal-guardian', async () => {
  const active = await run('systemctl', ['is-active', THERMAL_GUARDIAN_SERVICE], 4000);
  const enabled = await run('systemctl', ['is-enabled', THERMAL_GUARDIAN_SERVICE], 4000);
  const scriptExists = fs.existsSync(THERMAL_GUARDIAN_SCRIPT);
  const ceilings = readGuardianOverride();

  return {
    ok: true,
    active: active.out === 'active',
    enabled: enabled.out === 'enabled',
    scriptExists,
    ...ceilings,
    serviceUnit: THERMAL_GUARDIAN_SERVICE,
    status: active.out || 'unknown',
  };
});

ipcMain.handle('set-thermal-guardian', async (_e, { enabled, cpuCeiling, gpuCeiling, ceiling, mode }) => {
  const guardianMode = mode === 'gaming' ? 'gaming' : 'protection';
  // En modo Gaming los techos por defecto suben (95/87): la meta es jugar sin
  // throttling, solo subiendo ventiladores. El usuario igual puede ajustarlos.
  const defCpu = guardianMode === 'gaming' ? 95 : 92;
  const defGpu = guardianMode === 'gaming' ? 87 : 83;
  const cpu = Math.max(70, Math.min(100, Math.round(Number(cpuCeiling) || defCpu)));
  const gpu = Math.max(70, Math.min(87, Math.round(Number(gpuCeiling || ceiling) || defGpu)));
  const overrideDir = `/etc/systemd/system/${THERMAL_GUARDIAN_SERVICE}.d`;
  const overridePath = `${overrideDir}/override.conf`;
  const unitPath = `/etc/systemd/system/${THERMAL_GUARDIAN_SERVICE}`;
  let unit = fs.readFileSync(THERMAL_GUARDIAN_UNIT, 'utf-8')
    .replace(/__ROG_MONITOR_REPO__/g, REPO)
    .replace(/ROG_THERMAL_CEILING=83/g, 'ROG_THERMAL_GPU_CEILING=83');
  const overrideContent =
    `[Service]\n` +
    `Environment="ROG_THERMAL_MODE=${guardianMode}"\n` +
    `Environment="ROG_THERMAL_CPU_CEILING=${cpu}"\n` +
    `Environment="ROG_THERMAL_GPU_CEILING=${gpu}"\n` +
    `Environment="ROG_THERMAL_CEILING=${gpu}"\n`;
  const serviceAction = enabled
    ? `systemctl enable --now ${shQuote(THERMAL_GUARDIAN_SERVICE)}`
    : `systemctl disable --now ${shQuote(THERMAL_GUARDIAN_SERVICE)}`;
  const cmd = [
    `install -d -m 0755 ${shQuote(overrideDir)}`,
    `printf %s ${shQuote(unit)} > ${shQuote(unitPath)}`,
    `printf %s ${shQuote(overrideContent)} > ${shQuote(overridePath)}`,
    'systemctl daemon-reload',
    serviceAction,
  ].join(' && ');

  const res = await run('pkexec', ['sh', '-c', cmd], 30000);
  if (!res.ok) return { ok: false, err: res.err };

  // Releer estado después de la acción.
  const active = await run('systemctl', ['is-active', THERMAL_GUARDIAN_SERVICE], 4000);
  return {
    ok: true,
    active: active.out === 'active',
    enabled,
    cpuCeiling: cpu,
    gpuCeiling: gpu,
    ceiling: gpu,
    mode: guardianMode,
  };
});

app.whenReady().then(() => {
  createWindow();
  startBackend();
  runJsonModule('rog_monitor.aura', ['apply-startup'], 10000).catch(() => {});
});

app.on('window-all-closed', () => {
  if (backend) {
    // si estaba congelado (SIGSTOP), reanudar para que reciba el SIGTERM
    if (backendPaused) { try { backend.kill('SIGCONT'); } catch (_) {} }
    backend.kill();
  }
  stopMusicMode(false);
  app.quit();
});
