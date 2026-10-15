'use strict';
// Sonda de capacidades del overlay (S10). Replica las opciones de
// createOverlay() de desktop/main.js sobre una ventana pequena con titulo fijo.
//
// Uso (ELECTRON = binario de electron del proyecto):
//   ELECTRON <esta-carpeta> --title="ROG Overlay Probe" --monitor=0 \
//            --corner=top-right --secs=6 [--fullscreen] [--margin=16]
//            [--w=232 --h=150] [--workarea] [--type=notification|dock|toolbar]
//   Anadir --ozone-platform=x11 para forzar XWayland.
// --monitor=N indexa los monitores ordenados por x, luego y (0 = el de mas a
// la izquierda). Imprime una linea "PROBE {json}" con displays, posicion
// pedida y bounds reportados por Electron justo tras setPosition y a 1,5 s.
const { app, BrowserWindow, screen } = require('electron');
const os = require('os');
const fs = require('fs');
const path = require('path');

const args = Object.fromEntries(
  process.argv.slice(1).filter((a) => a.startsWith('--')).map((a) => {
    const [k, v] = a.slice(2).split('=');
    return [k, v === undefined ? true : v];
  })
);
const title = args.title || 'ROG Overlay Probe';
const secs = Number(args.secs || 6);
const margin = Number(args.margin || 16);
const w = Number(args.w || 232);
const h = Number(args.h || 150);
const corner = args.corner || 'top-right';
const dispIdx = Number(args.monitor || 0);
const fullscreen = !!args.fullscreen;
const bg = args.bg || null; // color CSS del fondo (p. ej. --bg=rgba(255,0,255,0.5))
const useWorkArea = !!args.workarea; // por defecto bounds; --workarea como el producto

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'rog-overlay-probe-'));
app.setPath('userData', userData);
app.on('quit', () => { try { fs.rmSync(userData, { recursive: true, force: true }); } catch (_) { /* best effort */ } });

function target(d) {
  const r = useWorkArea ? d.workArea : d.bounds;
  const right = r.x + r.width - w - margin;
  const bottom = r.y + r.height - h - margin;
  const left = r.x + margin;
  const top = r.y + margin;
  return {
    'top-left': [left, top],
    'top-right': [right, top],
    'bottom-left': [left, bottom],
    'bottom-right': [right, bottom],
  }[corner];
}

app.whenReady().then(() => {
  const displays = screen.getAllDisplays();
  displays.sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y);
  const d = displays[dispIdx] || screen.getPrimaryDisplay();
  const win = new BrowserWindow(fullscreen ? {
    x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height,
    title, fullscreen: true, frame: false, backgroundColor: '#202020',
  } : {
    width: w, height: h,
    title,
    frame: false, transparent: true, resizable: false, movable: false,
    minimizable: false, maximizable: false, skipTaskbar: true, focusable: false,
    hasShadow: false, alwaysOnTop: true, backgroundColor: '#00000000',
    ...(args.type ? { type: args.type } : {}),
  });
  if (!fullscreen) {
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setIgnoreMouseEvents(true);
  }
  win.loadURL('data:text/html,' + encodeURIComponent(
    `<title>${title}</title><body style="margin:0;background:${bg || (fullscreen ? '#202020' : 'rgba(0,0,0,.55)')};color:#0f0;font:14px monospace"><div style="padding:8px">${title}</div></body>`));
  const report = {
    title, fullscreen, corner, dispIdx,
    args: process.argv.slice(1).filter((a) => a.startsWith('--')),
  };
  win.once('ready-to-show', () => {
    win.showInactive();
    let req = null;
    if (!fullscreen) {
      req = target(d);
      win.setPosition(Math.round(req[0]), Math.round(req[1]));
    }
    report.requested = req;
    report.afterSet = win.getBounds();
    setTimeout(() => {
      report.afterSettle = win.getBounds();
      report.displays = displays.map((x) => ({
        id: x.id, bounds: x.bounds, workArea: x.workArea,
        scaleFactor: x.scaleFactor, internal: x.internal,
      }));
      report.chosen = { id: d.id, bounds: d.bounds, workArea: d.workArea, scaleFactor: d.scaleFactor };
      console.log('PROBE ' + JSON.stringify(report));
    }, 1500);
  });
  setTimeout(() => app.quit(), secs * 1000);
});
