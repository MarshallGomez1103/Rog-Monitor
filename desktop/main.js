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

let win = null;
let overlay = null;
let overlayCfg = { enabled: false, displayId: null, corner: 'top-left' };
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
  backend.stderr.on('data', (d) => console.error('[backend]', d.toString().trim()));
  backend.on('exit', (code) => {
    console.error('[backend] exited', code);
    if (win && !win.isDestroyed()) {
      win.webContents.send('backend-down', code);
      setTimeout(startBackend, 3000); // auto-recover
    }
  });
}

function run(cmd, args, timeoutMs = 10000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, cwd: REPO, env: APP_ENV }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: (stdout || '').trim(), err: (stderr || String(err || '')).trim() });
    });
  });
}

function runPythonModule(module, args, timeoutMs = 10000) {
  return new Promise((resolve) => {
    execFile(PYTHON, ['-m', module, ...args], { timeout: timeoutMs, cwd: REPO, env: PY_ENV }, (err, stdout, stderr) => {
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

const PPD = [
  'org.freedesktop.UPower.PowerProfiles',
  '/org/freedesktop/UPower/PowerProfiles',
  'org.freedesktop.UPower.PowerProfiles',
];

ipcMain.handle('set-profile', (_e, profile) =>
  run('busctl', ['--system', 'set-property', ...PPD, 'ActiveProfile', 's', profile]));

ipcMain.handle('set-gpu-mode', (_e, mode) =>
  run('supergfxctl', ['--mode', mode], 90000));

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

const SCRIPTS_DIR = process.env.ROG_SCRIPTS_DIR
  || path.join(os.homedir(), 'Rog-Monitor-Scripts');
const SYNC_SCRIPT = path.join(SCRIPTS_DIR, 'scripts', 'rog-profile-sync.sh');
const FAN_TEST = path.join(SCRIPTS_DIR, 'scripts', 'test-max-fans.sh');
const ENABLE_ASUSD = path.join(SCRIPTS_DIR, 'scripts', 'enable-asusd.sh');
const FANS = ['cpu', 'gpu', 'mid'];
// User-writable curve store; the root service reads it on every profile change.
const FAN_CURVES_JSON = path.join(
  os.homedir(), '.config', 'rog-monitor', 'fan-curves.json');
const PROFILES = ['performance', 'balanced', 'quiet'];

function profileBlock(source, profile) {
  // the case block: `performance)` ... `;;`
  const re = new RegExp(`(${profile}\\)\\n)([\\s\\S]*?)(;;)`);
  return source.match(re);
}

// Built-in default curves (fallback) parsed straight from the system script,
// so the editor shows the same baseline the service would apply.
function scriptDefaults(profile) {
  if (!fs.existsSync(SYNC_SCRIPT)) return null;
  const block = profileBlock(fs.readFileSync(SYNC_SCRIPT, 'utf-8'), profile);
  if (!block) return null;
  const curves = {};
  for (const fan of FANS) {
    const temps = block[2].match(new RegExp(`${fan}_temps="([\\d ]+)"`));
    const pwms = block[2].match(new RegExp(`${fan}_pwm="([\\d ]+)"`));
    if (!temps || !pwms) return null;
    curves[fan] = {
      temps: temps[1].split(/\s+/).map(Number),
      pwms: pwms[1].split(/\s+/).map(Number),
    };
  }
  return curves;
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
  const saved = store.profiles && store.profiles[profile];
  const curves = saved || scriptDefaults(profile);
  if (!curves) {
    return { ok: false, err: `No encuentro curvas para "${profile}" (¿está el repo de scripts?)` };
  }
  const cap = store.cap_rpm || {};
  return {
    ok: true,
    profile,
    curves,
    cap,
    source: saved ? 'guardado' : 'por defecto',
    path: FAN_CURVES_JSON,
  };
});

ipcMain.handle('set-fan-config', async (_e, { profile, curves, cap }) => {
  for (const fan of FANS) {
    const c = curves[fan];
    if (!c || c.temps.length !== 8 || c.pwms.length !== 8) {
      return { ok: false, err: `curva de ${fan} inválida (deben ser 8 puntos)` };
    }
    const bad = [...c.temps, ...c.pwms].some((v) => !Number.isFinite(v) || v < 0 || v > 255);
    if (bad) return { ok: false, err: `valores fuera de rango en ${fan} (0-255)` };
  }
  // Merge into the user-writable store (no privileges needed to edit it).
  const store = readCurvesStore();
  store.profiles = store.profiles || {};
  store.profiles[profile] = curves;
  if (cap && Number.isFinite(+cap) && +cap > 0) {
    const c = Math.round(+cap);
    store.cap_rpm = { cpu: c, gpu: c, mid: c };
  }
  try {
    fs.mkdirSync(path.dirname(FAN_CURVES_JSON), { recursive: true });
    fs.writeFileSync(FAN_CURVES_JSON, JSON.stringify(store, null, 2) + '\n');
  } catch (err) {
    return { ok: false, err: `No pude guardar ${FAN_CURVES_JSON}: ${err.message}` };
  }
  if (!fs.existsSync(SYNC_SCRIPT)) {
    return { ok: true, warn: 'Curvas guardadas, pero falta el repo de scripts para aplicarlas en vivo.' };
  }
  // One pkexec: (re)install the JSON-reading service script and reapply now.
  // Installing on every save keeps /usr/local/sbin in sync with the repo and
  // makes the cap actually persist across reboots.
  const cmd =
    `install -m 0755 ${shq(SYNC_SCRIPT)} /usr/local/sbin/rog-profile-sync && ` +
    `systemctl restart rog-profile-sync.service`;
  const res = await run('pkexec', ['sh', '-c', cmd], 60000);
  return res.ok
    ? { ok: true }
    : { ok: false, err: 'Curvas guardadas, pero no se aplicaron (servicio): ' + res.err };
});

// Minimal single-quote shell escaping for the pkexec command above.
function shq(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

ipcMain.handle('fan-benchmark', async () => {
  if (!fs.existsSync(FAN_TEST)) return { ok: false, err: 'test-max-fans.sh no encontrado' };
  // 60s at 100% PWM, reports RPM every 10s, restores everything on exit
  const res = await run('pkexec', ['bash', FAN_TEST], 120000);
  if (!res.ok) return res;
  const max = { cpu: 0, gpu: 0, mid: 0 };
  for (const line of res.out.split('\n')) {
    const m = line.match(/^\d+,(\d+),(\d+),(\d+)$/);
    if (m) {
      max.cpu = Math.max(max.cpu, +m[1]);
      max.gpu = Math.max(max.gpu, +m[2]);
      max.mid = Math.max(max.mid, +m[3]);
    }
  }
  return { ok: true, max, raw: res.out };
});

ipcMain.handle('report-issue', async (_e, body) => {
  const remote = await run('git', ['remote', 'get-url', 'origin']);
  if (!remote.ok || !remote.out) return { ok: false, err: 'sin remoto git' };
  const url = remote.out
    .replace(/^git@github\.com:/, 'https://github.com/')
    .replace(/\.git$/, '');
  const params = new URLSearchParams({
    title: '[bug] ',
    body: body || '',
    labels: 'bug',
  });
  shell.openExternal(`${url}/issues/new?${params}`);
  return { ok: true };
});

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

async function applyMusicFrame(level) {
  if (!musicMode.active || !musicMode.baseState) return;
  const now = Date.now();
  if (musicMode.applying || now - musicMode.lastApplyTs < 125) return;
  const colour = brighten(musicMode.baseState.colour || 'ff5500', Math.min(1, level * 1.4));
  // Nunca bajamos a 'off' en silencio: el teclado se vería "apagado/roto".
  // El piso es 'low' para que siempre se note que el modo música está vivo.
  const brightness = level < 0.05 ? 'low' : level < 0.15 ? 'med' : 'high';
  if (brightness === musicMode.lastBrightness && colour === musicMode.lastColour) return;
  musicMode.applying = true;
  musicMode.lastApplyTs = now;
  const payload = {
    ...musicMode.baseState,
    effect: 'static',
    brightness,
    colour,
  };
  try {
    const res = await runJsonModule('rog_monitor.aura', ['apply', '--json', JSON.stringify(payload)], 8000);
    if (res.ok) {
      musicMode.lastBrightness = brightness;
      musicMode.lastColour = colour;
    }
  } finally {
    musicMode.applying = false;
  }
}

// Resuelve el "monitor" del sink por defecto (lo que suena por los parlantes).
// PipeWire/PulseAudio exponen <sink>.monitor; si falla, caemos al alias
// especial @DEFAULT_MONITOR@.
function resolveMonitorSource() {
  try {
    const res = spawnSync('pactl', ['get-default-sink'], { encoding: 'utf-8', env: APP_ENV });
    const sink = (res.stdout || '').trim();
    if (res.status === 0 && sink) return `${sink}.monitor`;
  } catch (_) { /* ignore */ }
  return '@DEFAULT_MONITOR@';
}

function whichBin(bin) {
  try {
    const res = spawnSync('which', [bin], { encoding: 'utf-8', env: APP_ENV });
    return res.status === 0 ? res.stdout.trim() : null;
  } catch (_) {
    return null;
  }
}

// Devuelve [cmd, args] de la primera herramienta de captura instalada.
// pw-record / pw-cat (PipeWire nativo) capturan bien del monitor con
// --target; parec (de algunos paquetes) suele devolver 0 bytes, así que
// queda de último recurso.
function pickAudioCapture(monitor) {
  if (whichBin('pw-record')) {
    return ['pw-record', ['--target', monitor, '--rate', '22050', '--channels', '1', '--format', 's16', '--raw', '-']];
  }
  if (whichBin('pw-cat')) {
    return ['pw-cat', ['--record', '--raw', '--target', monitor, '--rate', '22050', '--channels', '1', '--format', 's16', '-']];
  }
  if (whichBin('parec')) {
    return ['parec', ['--raw', '--rate=22050', '--format=s16le', '--channels=1', `--device=${monitor}`]];
  }
  return null;
}

function startMusicMode(baseState) {
  if (musicProc) stopMusicMode(false);
  const monitor = resolveMonitorSource();
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
  appVersion: require('./package.json').version,
  repo: REPO,
}));

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
  const pos = {
    'top-left': [left, top],
    'top-right': [right, top],
    'bottom-left': [left, bottom],
    'bottom-right': [right, bottom],
  }[overlayCfg.corner] || [left, top];
  overlay.setPosition(Math.round(pos[0]), Math.round(pos[1]));
}

function createOverlay() {
  overlay = new BrowserWindow({
    width: 232,
    height: 150,
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
  overlay.once('ready-to-show', positionOverlay);
  overlay.on('closed', () => { overlay = null; });
}

function applyOverlay() {
  if (overlayCfg.enabled) {
    if (!overlay || overlay.isDestroyed()) createOverlay();
    else { positionOverlay(); overlay.showInactive(); }
  } else if (overlay && !overlay.isDestroyed()) {
    overlay.close();
    overlay = null;
  }
}

ipcMain.handle('list-displays', () => ({ ok: true, displays: displayList(), current: overlayCfg }));

ipcMain.handle('set-overlay', (_e, cfg) => {
  overlayCfg = {
    enabled: !!cfg.enabled,
    displayId: cfg.displayId ?? overlayCfg.displayId,
    corner: cfg.corner || overlayCfg.corner,
  };
  applyOverlay();
  return { ok: true, current: overlayCfg };
});

function createWindow() {
  win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#0b0d10',
    autoHideMenuBar: true,
    title: 'ROG Monitor',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // closing the main window tears down the overlay too
  win.on('closed', () => {
    if (overlay && !overlay.isDestroyed()) overlay.close();
  });
}

app.whenReady().then(() => {
  createWindow();
  startBackend();
  runJsonModule('rog_monitor.aura', ['apply-startup'], 10000).catch(() => {});
});

app.on('window-all-closed', () => {
  if (backend) backend.kill();
  stopMusicMode(false);
  app.quit();
});
