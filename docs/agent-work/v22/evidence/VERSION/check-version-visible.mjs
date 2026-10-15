// check-version-visible.mjs — CDP de V22-D10: la versión solo se ve en Ayuda > Acerca de.
// Uso:  ROG_APP_ROOT=<raíz del repo/worktree> node <repo>/.ai/private/rog-v22/tools/cdp.mjs <ruta-absoluta>/check-version-visible.mjs
// (en un worktree enlaza <worktree>/.venv -> <repo principal>/.venv; nada se versiona de eso).
import { readFileSync } from 'node:fs';
import path from 'node:path';

export default async ({ ev, sleep }) => {
  const ROOT = process.env.ROG_APP_ROOT;
  const V = readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
  const results = [];
  const check = (name, cond, detail = '') => {
    results.push(!!cond);
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${!cond && detail !== '' ? '  -> ' + detail : ''}`);
  };
  // Apariciones de la versión en el texto VISIBLE (innerText ignora lo oculto con display:none).
  const count = (s) => ev(`(document.body.innerText.split(${JSON.stringify(s)}).length - 1)`);
  const lines = (s) => ev(`document.body.innerText.split('\\n').filter(l => l.includes(${JSON.stringify(s)})).length`);

  await sleep(1500);   // primera muestra: #backend-meta ya lleva la hora
  check('hay 0 apariciones de la versión con todos los modales cerrados', (await count(V)) === 0, String(await count(V)));
  check('el pie no tiene #versions', (await ev(`document.getElementById('versions')`)) === null);
  const meta = await ev(`document.getElementById('backend-meta').innerText`);
  check('#backend-meta no lleva versión ni "core v"', !meta.includes(V) && !/core v/i.test(meta), JSON.stringify(meta));
  const footer = await ev(`document.getElementById('statusbar').innerText`);
  check('la barra de estado no lleva versión', !footer.includes(V) && !/\bv\d+\.\d+/.test(footer), JSON.stringify(footer));

  // Menú Ayuda abierto, sin entrar a Acerca de: el menú tampoco muestra la versión.
  await ev(`document.querySelector('[data-menu-toggle="help"]').click()`);
  await sleep(150);
  check('menú Ayuda abierto: 0 apariciones y existe ACERCA DE', (await count(V)) === 0 && (await ev(`!!document.getElementById('about-btn') && document.getElementById('about-btn').offsetParent !== null`)));

  // Acerca de.
  await ev(`document.getElementById('about-btn').click()`);
  await sleep(200);
  check('Acerca de abierto: la versión aparece en 1 sola línea', (await lines(V)) === 1, String(await lines(V)));
  await ev(`window.i18n.set('es')`);   // la prueba parte de un perfil nuevo (idioma por defecto del sistema)
  await sleep(250);
  const txt = await ev(`document.getElementById('about-version').innerText`);
  check('texto "ROG Monitor X · núcleo X" con la versión de VERSION', txt === `ROG Monitor ${V} · núcleo ${V}`, JSON.stringify(txt));
  check('menú de Ayuda cerrado al abrir Acerca de', await ev(`document.querySelector('[data-menu-panel="help"]').classList.contains('hidden')`));
  check('la carpeta de la app sale en el modal', ((await ev(`(document.getElementById('about-folder') || {}).innerText`)) || '').includes(ROOT));

  // 8 idiomas: el texto se traduce y sigue habiendo una sola línea con la versión.
  const want = { es: 'núcleo', en: 'core', fr: 'noyau', it: 'nucleo', pt: 'núcleo', zh: '核心', ja: 'コア', ko: '코어' };
  for (const [lang, word] of Object.entries(want)) {
    await ev(`window.i18n.set(${JSON.stringify(lang)})`);
    await sleep(250);
    const t = (await ev(`(document.getElementById('about-version') || {}).innerText`)) || '';
    check(`idioma ${lang}: "${word}" y versión`, t.includes(word) && t.includes(V) && (await lines(V)) === 1, JSON.stringify(t));
  }
  await ev(`window.i18n.set('es')`);
  await sleep(250);

  // Cierres: botón, Escape.
  await ev(`document.getElementById('about-close').click()`);
  await sleep(150);
  check('cerrar con el botón: 0 apariciones', (await count(V)) === 0);
  await ev(`document.querySelector('[data-menu-toggle="help"]').click()`);
  await ev(`document.getElementById('about-btn').click()`);
  await sleep(150);
  await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
  await sleep(150);
  check('Escape cierra Acerca de: 0 apariciones', (await count(V)) === 0);

  // Roadmap: el pill de estado no lleva versión (el historial sí lista sus entradas, es el changelog).
  await ev(`document.querySelector('[data-menu-toggle="help"]').click()`);
  await ev(`document.getElementById('roadmap-btn').click()`);
  await sleep(500);
  const pill = await ev(`(document.querySelector('.roadmap-status-pill') || {}).innerText || ''`);
  check('el pill del roadmap no lleva versión', pill.length > 0 && !/\bv?\d+\.\d+\.\d+\b/.test(pill), JSON.stringify(pill));
  await ev(`document.getElementById('roadmap-modal').classList.add('hidden')`);
  await sleep(100);
  check('roadmap cerrado: otra vez 0 apariciones', (await count(V)) === 0);

  const ok = results.every(Boolean);
  console.log(`\n${results.filter(Boolean).length}/${results.length} aserciones OK\nRESULT: ${ok ? 'PASS' : 'FAIL'}`);
};
