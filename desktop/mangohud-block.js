'use strict';
// Bloques marcados propios de ROG Monitor dentro de ~/.config/MangoHud/MangoHud.conf.
// - FPS_MARKERS: registro de FPS (set-fps-logging, histórico).
// - GAME_MARKERS: "modo juego" (capa B de ADR-0007): el HUD de MangoHud dibujado dentro del juego
//   con las mismas métricas y el anclaje del overlay.
// Reglas: las líneas del usuario no se reescriben (solo se quitan/añaden las del bloque propio),
// nunca `exec=` (ejecuta shell, ADR-0006) y los valores salen de listas cerradas, no de texto libre.
const fs = require('node:fs');
const path = require('node:path');
const { writeAtomic } = require('./fsutil');

const FPS_MARKERS = {
  start: '# --- ROG Monitor FPS (autogenerado, no editar) ---',
  end: '# --- /ROG Monitor FPS ---',
};
const GAME_MARKERS = {
  start: '# --- ROG Monitor modo juego (autogenerado, no editar) ---',
  end: '# --- /ROG Monitor modo juego ---',
};

// MangoHud no tiene `center` ni elección de monitor (sigue la ventana del juego).
const MANGO_POSITIONS = ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'];

function mapAnchor(anchor) {
  if (anchor === 'center') return 'top-center';
  return MANGO_POSITIONS.includes(anchor) ? anchor : 'top-right';
}

function hasBlock(conf, m) {
  return String(conf || '').split('\n').some((l) => l.trim() === m.start);
}

function stripBlock(conf, m) {
  const lines = String(conf || '').split('\n');
  for (let s = lines.findIndex((l) => l.trim() === m.start); s >= 0; s = lines.findIndex((l) => l.trim() === m.start)) {
    let e = lines.findIndex((l, i) => i > s && l.trim() === m.end);
    if (e < 0) e = lines.length - 1; // bloque sin cierre (editado a mano): hasta el final
    lines.splice(s, e - s + 1);
  }
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return lines.join('\n');
}

// Devuelve el archivo con el bloque `m` reemplazado por `lines` (o quitado si lines es null/vacío).
function mergeBlock(conf, m, lines) {
  const rest = stripBlock(conf, m);
  const block = lines && lines.length ? [m.start, ...lines, m.end].join('\n') + '\n' : '';
  if (!rest) return block;
  return rest + '\n' + (block ? '\n' + block : '');
}

function accentHex(accent) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(accent || '').trim());
  return m ? m[1].toUpperCase() : null;
}

// Mismas métricas que el overlay de la app (FPS siempre: es para lo que existe MangoHud).
function gameModeLines(prefs) {
  const p = prefs || {};
  const show = p.show || {};
  const lines = [`position=${mapAnchor(p.corner)}`, 'fps', 'frametime'];
  if (show.cpu !== false) lines.push('cpu_stats', 'cpu_temp', 'cpu_power');
  if (show.gpu !== false) lines.push('gpu_stats', 'gpu_temp', 'gpu_power');
  if (p.layout !== 'box') lines.push('horizontal');
  lines.push('font_size=20', 'background_alpha=0.6', 'round_corners=0', 'text_outline=1');
  const hex = accentHex(p.accent);
  if (hex) lines.push(`cpu_color=${hex}`, `gpu_color=${hex}`);
  return lines;
}

// Filas del overlay que MangoHud no puede mostrar (no tiene métrica de ventiladores ASUS).
function missingRows(show) {
  return (show || {}).fans === false ? [] : ['fans'];
}

function readEnabled(file, m) {
  try { return hasBlock(fs.readFileSync(file, 'utf8'), m); } catch (_) { return false; }
}

// Escribe (atómico) o quita el bloque. Quitar sobre un archivo inexistente no lo crea.
function writeBlock(file, m, lines) {
  try {
    let conf = '';
    try {
      conf = fs.readFileSync(file, 'utf8');
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      if (!lines) return { ok: true, enabled: false };
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    writeAtomic(file, mergeBlock(conf, m, lines));
    return { ok: true, enabled: !!lines };
  } catch (e) {
    // sin ruta del host en el error (llega a la UI): solo código estable + errno
    return { ok: false, code: 'mangohud_write_failed', err: e.code || 'io' };
  }
}

module.exports = {
  FPS_MARKERS, GAME_MARKERS, mapAnchor, hasBlock, mergeBlock, gameModeLines, missingRows,
  readEnabled, writeBlock,
};
