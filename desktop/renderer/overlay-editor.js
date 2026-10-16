/* ROG Monitor — editor y acceso rápido del overlay (S11 / ADR-0007).
 * Solo cablea el DOM: botón OVERLAY de la barra (1 clic, Ctrl+Shift+O), modal de ajustes,
 * tamaño S/M/L/XL y métricas elegibles una a una (S11b), modo compatibilidad (XWayland, pide
 * reiniciar) y modo juego (MangoHud). La lógica vive en overlay-metrics.js / overlay-prefs.js
 * (renderer) y overlay-window.js / mangohud-block.js (main).
 * Se carga después de app.js: usa sus globales $, t, toast, rogChoiceDialog y closeControlMenus. */
(function () {
  'use strict';

  const OV = window.RogOverlayPrefs;
  const OM = window.RogOverlayMetrics;
  const overlayPrefs = OV.parse(localStorage.getItem('overlayPrefs'));
  let overlayReturnFocus = null;

  function saveOverlayPrefs() {
    try { localStorage.setItem('overlayPrefs', JSON.stringify(overlayPrefs)); } catch (_) {}
  }

  function paintOverlayToggle() {
    $('overlay-toggle').setAttribute('aria-pressed', String(overlayPrefs.enabled));
    $('overlay-toggle').classList.toggle('active', overlayPrefs.enabled);
    $('overlay-enabled').checked = overlayPrefs.enabled;
  }

  // Se manda siempre (también apagado) para que la bandeja encienda con las prefs del usuario.
  async function pushOverlay() {
    const res = await window.rog.setOverlay(overlayPrefs);
    if (!res.ok) toast(t('toast.overlay_failed'));
    paintOverlayToggle();
  }

  function setOverlayEnabled(on) {
    overlayPrefs.enabled = on;
    saveOverlayPrefs();
    pushOverlay();
  }

  async function refreshOverlayModal() {
    const res = await window.rog.listDisplays();
    if (!res.ok) return;
    $('overlay-display').replaceChildren(...OV.monitorOptions(res.displays, t).map((o) => new Option(o.label, o.value)));
    if (res.active != null) $('overlay-display').value = String(res.active);
    const v = OV.noticeView(res, t);
    $('overlay-notice').classList.toggle('hidden', !v.text);
    $('overlay-notice').dataset.level = v.level;
    $('overlay-notice-text').textContent = v.text;
    $('overlay-notice-action').classList.toggle('hidden', !v.action);
    $('overlay-notice-action').dataset.action = v.action;
    $('overlay-notice-action').textContent = v.actionLabel;
    $('overlay-compat-row').classList.toggle('hidden', !v.offerCompat);
    $('overlay-compat').checked = !!res.mode.compat;
  }

  function paintScale() {
    $('ov-scale').querySelectorAll('[data-scale]').forEach((b) => {
      const on = b.dataset.scale === overlayPrefs.scale;
      b.setAttribute('aria-pressed', String(on));
      b.classList.toggle('active', on);
    });
  }

  // Botones S/M/L/XL y una casilla por métrica, agrupadas por fila con la etiqueta de color del
  // overlay. Se rehacen al abrir el modal (idioma actual); los cambios llegan por delegación.
  function buildOverlayControls() {
    $('ov-scale').replaceChildren(...OM.scaleOptions().map((o) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ghost';
      b.dataset.scale = o.id;
      b.textContent = o.id;
      b.title = t('overlay.size_tip', { pct: o.pct });
      b.setAttribute('aria-label', b.title);
      return b;
    }));
    paintScale();
    $('ov-metrics').replaceChildren(...OM.ROWS.map((r) => {
      const row = document.createElement('div');
      row.className = 'ov-mrow';
      const tag = document.createElement('span');
      tag.className = 'ov-mtag';
      tag.textContent = r.label;
      tag.style.color = r.color;
      row.appendChild(tag);
      for (const m of r.metrics) {
        const label = document.createElement('label');
        label.className = 'check-row';
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.id = `ov-m-${m}`;
        box.dataset.metric = m;
        box.checked = overlayPrefs.metrics.includes(m);
        box.setAttribute('aria-label', `${r.label} · ${t(OM.metricKey(m))}`);
        const text = document.createElement('span');
        text.textContent = t(OM.metricKey(m));
        label.append(box, text);
        row.appendChild(label);
      }
      return row;
    }));
  }

  async function refreshGameMissing() {
    const game = await window.rog.getGameMode();
    $('game-mode-missing').textContent = OV.missingText(game.missing, t);
    return game;
  }

  async function openOverlayModal() {
    closeControlMenus();
    overlayReturnFocus = document.activeElement;
    await refreshOverlayModal();
    paintOverlayToggle();
    $('overlay-corner').value = overlayPrefs.corner;
    $('overlay-offset-x').value = overlayPrefs.offsetX;
    $('overlay-offset-y').value = overlayPrefs.offsetY;
    buildOverlayControls();
    const [fps, game] = await Promise.all([window.rog.getFpsLogging(), refreshGameMissing()]);
    $('fps-logging').checked = !!fps.enabled;
    $('fps-logging').disabled = !fps.mangohud;
    if (!fps.mangohud) $('fps-note').textContent = t('overlay.no_mangohud');
    $('game-mode').checked = !!game.enabled;
    $('game-mode').disabled = !game.mangohud;
    $('overlay-modal').classList.remove('hidden');
  }

  function closeOverlayModal() {
    $('overlay-modal').classList.add('hidden');
    if (overlayReturnFocus && overlayReturnFocus.focus) overlayReturnFocus.focus();
  }

  async function askOverlayRestart() {
    const res = await rogChoiceDialog({ title: t('overlay.compat'), message: t('overlay.restart_msg'),
      okLabel: t('overlay.restart_now'), cancelLabel: t('overlay.restart_later') });
    if (res.choice === 'ok') window.rog.relaunchApp();
  }

  async function setOverlayCompat(on) {
    const res = await window.rog.setOverlayCompat(on);
    if (!res.ok) toast(t('overlay.compat_failed'));
    await refreshOverlayModal();
    if (res.ok && res.restart) await askOverlayRestart();
  }

  // Escritura de un bloque de MangoHud (FPS o modo juego): revierte la casilla si falla.
  async function toggleMangoBlock(el, call, onKey, offKey) {
    const res = await call(el.checked);
    if (!res.ok) { el.checked = !el.checked; toast(t('overlay.mango_failed')); return; }
    toast(t(res.enabled ? onKey : offKey));
  }

  $('overlay-toggle').addEventListener('click', () => setOverlayEnabled(!overlayPrefs.enabled));
  $('overlay-settings').addEventListener('click', openOverlayModal);
  $('overlay-btn').addEventListener('click', openOverlayModal);
  $('overlay-close').addEventListener('click', closeOverlayModal);
  $('overlay-modal').addEventListener('click', (e) => { if (e.target === $('overlay-modal')) closeOverlayModal(); });
  window.addEventListener('keydown', (e) => {
    if (OV.isToggleShortcut(e)) { e.preventDefault(); setOverlayEnabled(!overlayPrefs.enabled); }
    else if (e.key === 'Escape' && !$('overlay-modal').classList.contains('hidden')
      && $('confirm-modal').classList.contains('hidden')) closeOverlayModal();
  });
  window.rog.onOverlayState(({ enabled }) => { overlayPrefs.enabled = !!enabled; saveOverlayPrefs(); paintOverlayToggle(); });
  $('overlay-enabled').addEventListener('change', (e) => setOverlayEnabled(e.target.checked));
  async function patchOverlay(patch) {
    Object.assign(overlayPrefs, OV.normalize({ ...overlayPrefs, ...patch }));
    saveOverlayPrefs();
    await pushOverlay();
    refreshOverlayModal();
  }
  const overlayField = (id, apply) => $(id).addEventListener('change', (e) => patchOverlay(apply(e.target)));
  overlayField('overlay-display', (el) => ({ monitor: Number(el.value), displayId: null }));
  overlayField('overlay-corner', (el) => ({ corner: el.value }));
  overlayField('overlay-offset-x', (el) => ({ offsetX: Number(el.value) }));
  overlayField('overlay-offset-y', (el) => ({ offsetY: Number(el.value) }));
  // tamaño: se aplica en vivo (la ventana del overlay se reajusta a su tarjeta)
  $('ov-scale').addEventListener('click', (e) => {
    const b = e.target.closest('[data-scale]');
    if (b) { patchOverlay({ scale: b.dataset.scale }); paintScale(); }
  });
  $('ov-metrics').addEventListener('change', async (e) => {
    const m = e.target.dataset && e.target.dataset.metric;
    if (!m) return;
    await patchOverlay({ metrics: OM.toggleMetric(overlayPrefs.metrics, m, e.target.checked) });
    refreshGameMissing(); // FAN no existe en MangoHud: el aviso sigue a la elección
  });
  $('overlay-compat').addEventListener('change', (e) => setOverlayCompat(e.target.checked));
  $('overlay-notice-action').addEventListener('click', (e) => {
    if (e.currentTarget.dataset.action === 'enable') setOverlayCompat(true);
    else if (e.currentTarget.dataset.action === 'restart') askOverlayRestart();
  });
  $('fps-logging').addEventListener('change', (e) => toggleMangoBlock(e.target, window.rog.setFpsLogging, 'overlay.fps_on', 'overlay.fps_off'));
  $('game-mode').addEventListener('change', (e) => toggleMangoBlock(e.target, window.rog.setGameMode, 'overlay.game_on', 'overlay.game_off'));

  pushOverlay();
})();
