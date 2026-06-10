// ROG Monitor desktop: Electron shell over the Python sensor core.
// The backend is `python -m rog_monitor --json-stream`; one JSON per second.

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { spawn, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const REPO = path.resolve(__dirname, '..');
const VENV_PY = path.join(REPO, '.venv', 'bin', 'python');
const PYTHON = fs.existsSync(VENV_PY) ? VENV_PY : 'python3';

let win = null;
let backend = null;

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
    env: { ...process.env, PYTHONPATH: path.join(REPO, 'src') },
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
    execFile(cmd, args, { timeout: timeoutMs, cwd: REPO }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: (stdout || '').trim(), err: (stderr || String(err || '')).trim() });
    });
  });
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

const os = require('os');
const SCRIPTS_DIR = process.env.ROG_SCRIPTS_DIR
  || path.join(os.homedir(), 'Rog-Monitor-Scripts');
const SYNC_SCRIPT = path.join(SCRIPTS_DIR, 'scripts', 'rog-profile-sync.sh');
const FAN_TEST = path.join(SCRIPTS_DIR, 'scripts', 'test-max-fans.sh');
const FANS = ['cpu', 'gpu', 'mid'];

function profileBlock(source, profile) {
  // the case block: `performance)` ... `;;`
  const re = new RegExp(`(${profile}\\)\\n)([\\s\\S]*?)(;;)`);
  return source.match(re);
}

ipcMain.handle('get-fan-config', (_e, profile) => {
  if (!fs.existsSync(SYNC_SCRIPT)) {
    return { ok: false, err: `No encuentro ${SYNC_SCRIPT} — este control requiere el repo de scripts ASUS` };
  }
  const src = fs.readFileSync(SYNC_SCRIPT, 'utf-8');
  const block = profileBlock(src, profile);
  if (!block) return { ok: false, err: `Perfil "${profile}" no está en el script` };
  const curves = {};
  for (const fan of FANS) {
    const temps = block[2].match(new RegExp(`${fan}_temps="([\\d ]+)"`));
    const pwms = block[2].match(new RegExp(`${fan}_pwm="([\\d ]+)"`));
    if (!temps || !pwms) return { ok: false, err: `No pude leer la curva de ${fan}` };
    curves[fan] = {
      temps: temps[1].split(/\s+/).map(Number),
      pwms: pwms[1].split(/\s+/).map(Number),
    };
  }
  return { ok: true, profile, curves, path: SYNC_SCRIPT };
});

ipcMain.handle('set-fan-config', async (_e, { profile, curves }) => {
  if (!fs.existsSync(SYNC_SCRIPT)) return { ok: false, err: 'script no encontrado' };
  for (const fan of FANS) {
    const c = curves[fan];
    if (!c || c.temps.length !== 8 || c.pwms.length !== 8) {
      return { ok: false, err: `curva de ${fan} inválida (deben ser 8 puntos)` };
    }
    const bad = [...c.temps, ...c.pwms].some((v) => !Number.isFinite(v) || v < 0 || v > 255);
    if (bad) return { ok: false, err: `valores fuera de rango en ${fan} (0-255)` };
  }
  let src = fs.readFileSync(SYNC_SCRIPT, 'utf-8');
  const block = profileBlock(src, profile);
  if (!block) return { ok: false, err: `perfil "${profile}" no encontrado` };
  let body = block[2];
  for (const fan of FANS) {
    body = body
      .replace(new RegExp(`${fan}_temps="[\\d ]+"`), `${fan}_temps="${curves[fan].temps.join(' ')}"`)
      .replace(new RegExp(`${fan}_pwm="[\\d ]+"`), `${fan}_pwm="${curves[fan].pwms.join(' ')}"`);
  }
  fs.writeFileSync(SYNC_SCRIPT + '.bak', src);          // safety net
  fs.writeFileSync(SYNC_SCRIPT, src.replace(block[0], block[1] + body + block[3]));
  // apply now: restart the root service (GUI password prompt)
  const res = await run('pkexec', ['systemctl', 'restart', 'rog-profile-sync.service'], 60000);
  return res.ok ? { ok: true } : { ok: false, err: 'Curvas guardadas, pero no se reinició el servicio: ' + res.err };
});

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
}

app.whenReady().then(() => {
  createWindow();
  startBackend();
});

app.on('window-all-closed', () => {
  if (backend) backend.kill();
  app.quit();
});
