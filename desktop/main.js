// ROG Monitor desktop: Electron shell over the Python sensor core.
// The backend is `python -m rog_monitor --json-stream`; one JSON per second.

const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const REPO = path.resolve(__dirname, '..');
const VENV_PY = path.join(REPO, '.venv', 'bin', 'python');
const PYTHON = fs.existsSync(VENV_PY) ? VENV_PY : 'python3';

let win = null;
let backend = null;

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
