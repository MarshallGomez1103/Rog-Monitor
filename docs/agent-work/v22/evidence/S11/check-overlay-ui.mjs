// check-overlay-ui.mjs — CDP del acceso y el editor del overlay (S11 / ADR-0007).
// Uso:  ROG_APP_ROOT=<raíz del repo/worktree> node <repo>/.ai/private/rog-v22/tools/cdp.mjs <ruta-absoluta>/check-overlay-ui.mjs
// El arnés lanza la app con HOME temporal: config.json y MangoHud.conf se escriben en esa carpeta,
// nunca en la del usuario. Eventos reales de CDP (Input.dispatchMouseEvent / dispatchKeyEvent),
// transiciones CSS desactivadas (NOANIM). Imprime PASS/FAIL por aserción y al final RESULT: PASS|FAIL.
// Contrato DOM: #overlay-toggle[aria-pressed] visible en la barra (fuera de menús), #overlay-settings
// abre #overlay-modal; #overlay-notice[data-level] > #overlay-notice-text + #overlay-notice-action;
// #overlay-compat-row > #overlay-compat; #overlay-display (Monitor N), #overlay-corner (7),
// #overlay-offset-x/y; #game-mode, #game-mode-missing; Escape cierra y devuelve el foco.
export default async ({ ev, sleep, call }) => {
  const results = [];
  const check = (name, cond, detail = '') => {
    results.push(!!cond);
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${!cond && detail !== '' ? '  -> ' + detail : ''}`);
  };
  const J = JSON.stringify;
  await call('Emulation.setFocusEmulationEnabled', { enabled: true });
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await ev(`(() => { const st = document.createElement('style'); st.id = 'NOANIM';
    st.textContent = '*,*::before,*::after{transition:none!important;animation:none!important}'; document.head.appendChild(st); 0 })()`);

  // scrollIntoView como haría el usuario (el modal tiene scroll propio) y luego coordenadas reales
  const box = async (sel) => JSON.parse(await ev(`(() => { const el = document.querySelector(${J(sel)}); if (!el) return 'null';
    el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height, vis: cs.visibility !== 'hidden' && cs.display !== 'none' && r.width > 0 }); })()`));
  const click = async (sel) => {
    const b = await box(sel);
    if (!b || !b.vis) return false;
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await call('Input.dispatchMouseEvent', { type, x: b.x, y: b.y, button: 'left', clickCount: 1 });
    }
    return true;
  };
  const key = async (k, code, keyCode, modifiers = 0) => {
    for (const type of ['rawKeyDown', 'keyUp']) {
      await call('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: keyCode, modifiers });
    }
  };
  const state = async () => JSON.parse(await ev(`window.rog.listDisplays().then((r) => JSON.stringify(r))`));
  const waitFor = async (expr, ms = 3000) => { for (let i = 0; i < ms / 100; i++) { if (await ev(expr)) return true; await sleep(100); } return false; };

  // ---------- 1) acceso visible en la barra superior ----------
  const tb = await box('#overlay-toggle');
  check('botón OVERLAY visible en la barra (no dentro de un menú)', tb && tb.vis && tb.y < 120, J(tb));
  check('el botón no está dentro de un .control-menu-panel', await ev(`!document.querySelector('#overlay-toggle').closest('.control-menu-panel')`));
  check('title documenta el atajo Ctrl+Shift+O', /Ctrl\+Shift\+O|Ctrl\+Maj\+O|Ctrl\+Maiusc\+O/.test(await ev(`document.querySelector('#overlay-toggle').title`)));
  check('estado inicial: aria-pressed=false', (await ev(`document.querySelector('#overlay-toggle').getAttribute('aria-pressed')`)) === 'false');

  // ---------- 2) clic real activa / Ctrl+Shift+O desactiva ----------
  check('clic real en OVERLAY', await click('#overlay-toggle'));
  check('aria-pressed=true tras el clic', await waitFor(`document.querySelector('#overlay-toggle').getAttribute('aria-pressed') === 'true'`));
  check('main recibe enabled=true', (await state()).current.enabled === true);
  await key('O', 'KeyO', 79, 2 | 8); // Ctrl(2) + Shift(8)
  check('Ctrl+Shift+O lo desactiva', await waitFor(`document.querySelector('#overlay-toggle').getAttribute('aria-pressed') === 'false'`));
  check('main recibe enabled=false', (await state()).current.enabled === false);

  // ---------- 3) ajustes: modal, monitores, anclajes, aviso honesto ----------
  check('clic real en ajustes del overlay', await click('#overlay-settings'));
  check('modal abierto', await waitFor(`!document.querySelector('#overlay-modal').classList.contains('hidden')`));
  const st = await state();
  const opts = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('#overlay-display option')].map((o) => [o.value, o.textContent]))`));
  check('una opción por monitor, índice estable 0..N-1', opts.length === st.displays.length && opts.every((o, i) => o[0] === String(i)), J(opts));
  check('etiqueta "Monitor 1 · ancho×alto"', /^Monitor 1 · \d+×\d+/.test(opts[0] && opts[0][1]), J(opts[0]));
  check('7 anclajes', (await ev(`document.querySelectorAll('#overlay-corner option').length`)) === 7);
  check('desplazamientos X/Y presentes', await ev(`!!document.querySelector('#overlay-offset-x') && !!document.querySelector('#overlay-offset-y')`));
  const mode = st.mode;
  console.log('INFO  sesión', J(mode));
  const notice = JSON.parse(await ev(`(() => { const q = (s) => document.querySelector(s); if (!q('#overlay-notice')) return '{}';
    return JSON.stringify({ hidden: q('#overlay-notice').classList.contains('hidden'), level: q('#overlay-notice').dataset.level,
      text: q('#overlay-notice-text').textContent,
      action: q('#overlay-notice-action').classList.contains('hidden') ? null : q('#overlay-notice-action').dataset.action }); })()`));
  if (mode.session === 'wayland' && !mode.x11Active && mode.xwayland) {
    check('Wayland nativo: aviso visible "posición y monitor no garantizados"', !notice.hidden && notice.level === 'warn' && /Wayland/.test(notice.text), J(notice));
    check('el aviso ofrece activar el modo compatibilidad', notice.action === 'enable', J(notice));
    check('casilla de modo compatibilidad visible', (await box('#overlay-compat')).vis);
  } else {
    check(`sesión ${mode.session} (x11Active=${mode.x11Active}): aviso coherente`, mode.session !== 'wayland' ? notice.hidden : true, J(notice));
  }

  // ---------- 4) monitor y anclaje llegan a main ----------
  await ev(`(() => { const s = document.querySelector('#overlay-corner'); s.value = 'top-right'; s.dispatchEvent(new Event('change')); 0 })()`);
  await ev(`(() => { const s = document.querySelector('#overlay-display'); s.value = '0'; s.dispatchEvent(new Event('change')); 0 })()`);
  await ev(`(() => { const s = document.querySelector('#overlay-offset-x'); s.value = '-12'; s.dispatchEvent(new Event('change')); 0 })()`);
  await sleep(300);
  const cur = (await state()).current;
  check('main: monitor=0 (Monitor 1), corner=top-right, offsetX=-12', cur.monitor === 0 && cur.corner === 'top-right' && cur.offsetX === -12, J(cur));
  check('preferencia guardada v2', await ev(`JSON.parse(localStorage.getItem('overlayPrefs')).v === 2 && JSON.parse(localStorage.getItem('overlayPrefs')).monitor === 0`));

  // ---------- 5) modo compatibilidad: guarda y pide reiniciar (se responde "Más tarde") ----------
  if (mode.session === 'wayland' && mode.xwayland && !mode.x11Active) {
    check('clic real en el modo compatibilidad', await click('#overlay-compat'));
    check('aparece la confirmación de reinicio', await waitFor(`!document.querySelector('#confirm-modal').classList.contains('hidden')`));
    check('clic en "Más tarde"', await click('#confirm-cancel'));
    await sleep(200);
    const m2 = (await state()).mode;
    check('preferencia compat=true guardada (sin reiniciar)', m2.compat === true && m2.x11Active === false, J(m2));
    check('aviso pasa a "reinicia para aplicarlo"', await waitFor(`document.querySelector('#overlay-notice').dataset.level === 'warn' && document.querySelector('#overlay-notice-action').dataset.action === 'restart'`));
    await click('#overlay-compat');
    await sleep(300);
    if (!(await ev(`document.querySelector('#confirm-modal').classList.contains('hidden')`))) await click('#confirm-cancel');
    check('desactivar deja compat=false', (await state()).mode.compat === false);
  }

  // ---------- 6) modo juego MangoHud (HOME temporal del arnés) ----------
  const game0 = JSON.parse(await ev(`window.rog.getGameMode().then((r) => JSON.stringify(r))`));
  check('filas no disponibles en MangoHud se dicen (ventiladores)', await ev(`document.querySelector('#game-mode-missing').textContent.includes(t('overlay.row_fans'))`),
    await ev(`document.querySelector('#game-mode-missing').textContent`));
  if (game0.mangohud) {
    check('clic real en modo juego', await click('#game-mode'));
    check('bloque de modo juego escrito', await waitFor(`window.rog.getGameMode().then((r) => r.enabled)`));
    await click('#game-mode');
    check('bloque de modo juego quitado', await waitFor(`window.rog.getGameMode().then((r) => !r.enabled)`));
  } else {
    check('sin MangoHud: casilla deshabilitada', await ev(`document.querySelector('#game-mode').disabled`));
  }

  // ---------- 7) teclado: Escape cierra y devuelve el foco ----------
  await ev(`document.querySelector('#overlay-enabled').focus(), 0`);
  await key('Escape', 'Escape', 27);
  check('Escape cierra el modal', await waitFor(`document.querySelector('#overlay-modal').classList.contains('hidden')`));
  check('el foco vuelve al botón de ajustes', await ev(`document.activeElement && document.activeElement.id === 'overlay-settings'`));

  const ok = results.every(Boolean);
  console.log(`\n${results.filter(Boolean).length}/${results.length} PASS`);
  console.log(`RESULT: ${ok ? 'PASS' : 'FAIL'}`);
};
