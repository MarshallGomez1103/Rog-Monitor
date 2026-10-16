/* ROG Monitor — editor y acceso rápido del overlay (S11 / ADR-0007).
 * Solo cablea el DOM: botón OVERLAY de la barra (1 clic, Ctrl+Shift+O), modal de ajustes,
 * modo compatibilidad (XWayland, pide reiniciar) y modo juego (MangoHud). La lógica vive en
 * overlay-prefs.js (renderer) y overlay-window.js / mangohud-block.js (main).
 * Se carga después de app.js: usa sus globales $, t, toast, cssVar, rogChoiceDialog y closeControlMenus. */
(function () {
  'use strict';

  const OV = window.RogOverlayPrefs;
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
    const res = await window.rog.setOverlay({ ...overlayPrefs, accent: cssVar('--accent') }); // sigue el tema
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

  async function openOverlayModal() {
    closeControlMenus();
    overlayReturnFocus = document.activeElement;
    await refreshOverlayModal();
    paintOverlayToggle();
    $('overlay-corner').value = overlayPrefs.corner;
    $('overlay-layout').value = overlayPrefs.layout;
    $('overlay-offset-x').value = overlayPrefs.offsetX;
    $('overlay-offset-y').value = overlayPrefs.offsetY;
    ['cpu', 'gpu', 'fans'].forEach((p) => { $(`ov-show-${p}`).checked = overlayPrefs.show[p] !== false; });
    const [fps, game] = await Promise.all([window.rog.getFpsLogging(), window.rog.getGameMode()]);
    $('fps-logging').checked = !!fps.enabled;
    $('fps-logging').disabled = !fps.mangohud;
    if (!fps.mangohud) $('fps-note').textContent = t('overlay.no_mangohud');
    $('game-mode').checked = !!game.enabled;
    $('game-mode').disabled = !game.mangohud;
    $('game-mode-missing').textContent = OV.missingText(game.missing, t);
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
  const overlayField = (id, apply) => $(id).addEventListener('change', async (e) => {
    Object.assign(overlayPrefs, OV.normalize({ ...overlayPrefs, ...apply(e.target) }));
    saveOverlayPrefs();
    await pushOverlay();
    refreshOverlayModal();
  });
  overlayField('overlay-display', (el) => ({ monitor: Number(el.value), displayId: null }));
  overlayField('overlay-corner', (el) => ({ corner: el.value }));
  overlayField('overlay-layout', (el) => ({ layout: el.value }));
  overlayField('overlay-offset-x', (el) => ({ offsetX: Number(el.value) }));
  overlayField('overlay-offset-y', (el) => ({ offsetY: Number(el.value) }));
  ['cpu', 'gpu', 'fans'].forEach((p) => overlayField(`ov-show-${p}`, (el) => ({ show: { ...overlayPrefs.show, [p]: el.checked } })));
  $('overlay-compat').addEventListener('change', (e) => setOverlayCompat(e.target.checked));
  $('overlay-notice-action').addEventListener('click', (e) => {
    if (e.currentTarget.dataset.action === 'enable') setOverlayCompat(true);
    else if (e.currentTarget.dataset.action === 'restart') askOverlayRestart();
  });
  $('fps-logging').addEventListener('change', (e) => toggleMangoBlock(e.target, window.rog.setFpsLogging, 'overlay.fps_on', 'overlay.fps_off'));
  $('game-mode').addEventListener('change', (e) => toggleMangoBlock(e.target, window.rog.setGameMode, 'overlay.game_on', 'overlay.game_off'));

  pushOverlay();
  window.addEventListener('DOMContentLoaded', pushOverlay); // con el tema ya aplicado (acento)
})();
