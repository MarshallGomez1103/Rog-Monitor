#!/usr/bin/env node
// ROG Monitor — WCAG contrast check for the 12 themes x dark/light.
// Parses the palette variables straight out of desktop/renderer/style.css (no deps).
//   node scripts/contrast-check.mjs          -> table + summary, exit 1 if any text pair < 4.5
//   node scripts/contrast-check.mjs --all    -> print every pair, not only the failures
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'desktop/renderer/style.css'), 'utf8');
const showAll = process.argv.includes('--all');

// ---- parse `html[data-mode="x"][data-theme="y"] { --a: #hex; ... }` blocks ----
const blocks = {}; // key "dark|" (mode base) or "dark|magma"
const re = /html\[data-mode="(dark|light)"\](?:\[data-theme="([a-z-]+)"\])?\s*\{([^}]*)\}/g;
for (let m; (m = re.exec(css));) {
  const key = `${m[1]}|${m[2] || ''}`;
  blocks[key] = blocks[key] || {};
  for (const d of m[3].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) blocks[key][d[1]] = d[2].trim();
}
const themes = [...new Set(Object.keys(blocks).map((k) => k.split('|')[1]).filter(Boolean))];
// universal semantic colours (:root)
const root0 = {};
const rm = css.match(/:root\s*\{([^}]*)\}/);
for (const d of rm[1].matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})/g)) root0[d[1]] = d[2];

// ---- colour maths ----
const hex = (h) => {
  h = h.replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const mix = (a, b, pa) => a.map((v, i) => v * pa + b[i] * (1 - pa)); // srgb color-mix(a pa%, b)

const rows = [];
for (const mode of ['dark', 'light']) {
  for (const theme of themes) {
    const v = { ...root0, ...blocks[`${mode}|`], ...blocks[`${mode}|${theme}`] };
    if (!v['--bg']) continue;
    const c = (k) => hex(v[k]);
    const [bg, panel, chip, ink, dim, accent, accent2] =
      ['--bg', '--panel', '--chip', '--ink', '--dim', '--accent', '--accent2'].map(c);
    const ghost = mix(ink, dim, 0.8); // .ghost colour: color-mix(ink 80%, dim)
    const focus = accent2;            // --focus-ring candidate (see tokens.css)
    const add = (pair, fg, bgc, min, kind) => {
      const r = ratio(fg, bgc);
      rows.push({ mode, theme, pair, r, min, kind, ok: r >= min });
    };
    add('ink/bg', ink, bg, 4.5, 'text');
    add('ink/panel', ink, panel, 4.5, 'text');
    add('ink/chip', ink, chip, 4.5, 'text');
    add('dim/bg', dim, bg, 4.5, 'text');
    add('dim/panel', dim, panel, 4.5, 'text');
    add('dim/chip', dim, chip, 4.5, 'text');
    add('ghost/chip', ghost, chip, 4.5, 'text');
    add('accent/panel', accent, panel, 4.5, 'text');
    add('accent2/panel', accent2, panel, 4.5, 'text');
    add('bg/accent (active chip)', bg, accent, 4.5, 'text');
    add('focus(accent2)/panel', focus, panel, 3, 'ui');
    add('focus(accent2)/bg', focus, bg, 3, 'ui');
    const lvl = mode === 'dark'
      ? { cold: '#4db8ff', ok: '#3ce087', hot: '#ffb13c', crit: '#ff4d4d' }
      : { cold: '#0a6dc2', ok: '#157a3f', hot: '#b35a00', crit: '#c01818' };
    for (const [n, h] of Object.entries(lvl)) add(`lvl-${n}/panel (big number)`, hex(v[`--lvl-${n}`] || h), panel, 3, 'large');
  }
}

const f = (n) => n.toFixed(2).padStart(5);
const fails = rows.filter((r) => !r.ok);
const list = showAll ? rows : fails;
console.log(`themes: ${themes.length} (${themes.join(', ')}) x dark/light = ${themes.length * 2} palettes, ${rows.length} pairs checked`);
console.log('mode   theme         pair                              ratio  min  kind');
for (const r of list) {
  console.log(`${r.mode.padEnd(6)} ${r.theme.padEnd(13)} ${r.pair.padEnd(33)} ${f(r.r)}  ${r.min}  ${r.kind}${r.ok ? '' : '  FAIL'}`);
}
// per-pair worst-case summary
console.log('\nworst case per pair:');
const byPair = {};
for (const r of rows) if (!byPair[r.pair] || r.r < byPair[r.pair].r) byPair[r.pair] = r;
for (const [p, r] of Object.entries(byPair)) {
  console.log(`  ${p.padEnd(33)} min ${f(r.r)} (${r.mode}/${r.theme}) need ${r.min} ${r.ok ? 'ok' : 'FAIL'}`);
}
const textFails = fails.filter((r) => r.kind === 'text');
console.log(`\n${rows.length - fails.length}/${rows.length} pass; ${fails.length} fail (${textFails.length} text, ${fails.length - textFails.length} ui/large)`);
process.exit(textFails.length ? 1 : 0);
