const { contextBridge, ipcRenderer, webFrame } = require('electron');

// Suscripción a un canal de main: devuelve la función de baja (unsubscribe).
// Los módulos que se suscriben una vez al cargar la pueden ignorar; los que lo
// hagan al abrir un modal DEBEN llamarla al cerrar (si no, 1 listener por apertura).
const subscribe = (channel, withPayload = true) => (callback) => {
  const handler = (_e, payload) => (withPayload ? callback(payload) : callback());
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('rog', {
  onStats: subscribe('stats'),
  onOverlayConfig: subscribe('overlay-config'),
  onBackendDown: subscribe('backend-down'),
  onBackendReconnecting: subscribe('backend-reconnecting', false),
  onMusicStopped: subscribe('music-stopped', false),
  onCloseRequest: subscribe('close-request', false),
  closeChoice: (payload) => ipcRenderer.invoke('close-choice', payload),
  setProfile: (profile) => ipcRenderer.invoke('set-profile', profile),
  setGpuMode: (mode) => ipcRenderer.invoke('set-gpu-mode', mode),
  checkUpdate: () => ipcRenderer.invoke('check-update'),
  doUpdate: () => ipcRenderer.invoke('do-update'),
  appInfo: () => ipcRenderer.invoke('app-info'),
  appQuit: () => ipcRenderer.invoke('app-quit'),
  getAutostart: () => ipcRenderer.invoke('get-autostart'),
  setAutostart: (enabled) => ipcRenderer.invoke('set-autostart', enabled),
  setFanConfigMulti: (payload) => ipcRenderer.invoke('set-fan-config-multi', payload),
  getGamingCap: () => ipcRenderer.invoke('get-gaming-cap'),
  setGamingCap: (rpm) => ipcRenderer.invoke('set-gaming-cap', rpm),
  reinstallApp: () => ipcRenderer.invoke('reinstall-app'),
  uninstallApp: (opts) => ipcRenderer.invoke('uninstall-app', opts),
  killProcess: (pid) => ipcRenderer.invoke('kill-process', pid),
  listAllProcs: () => ipcRenderer.invoke('list-all-procs'),
  setRecording: (on) => ipcRenderer.invoke('set-recording', on),
  exportEvents: (text) => ipcRenderer.invoke('export-events', text),
  getFanConfig: (profile) => ipcRenderer.invoke('get-fan-config', profile),
  setFanConfig: (cfg) => ipcRenderer.invoke('set-fan-config', cfg),
  fanBenchmark: () => ipcRenderer.invoke('fan-benchmark'),
  reportIssue: (body) => ipcRenderer.invoke('report-issue', body),
  recordError: (payload) => ipcRenderer.invoke('record-error', payload),
  getErrorLog: () => ipcRenderer.invoke('get-error-log'),
  diskHealth: () => ipcRenderer.invoke('disk-health'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (payload) => ipcRenderer.invoke('save-settings', payload),
  getAuraState: () => ipcRenderer.invoke('get-aura-state'),
  enableAuraService: () => ipcRenderer.invoke('enable-aura-service'),
  applyAura: (state) => ipcRenderer.invoke('apply-aura', state),
  saveAuraProfile: (payload) => ipcRenderer.invoke('save-aura-profile', payload),
  deleteAuraProfile: (name) => ipcRenderer.invoke('delete-aura-profile', name),
  setAuraStartup: (payload) => ipcRenderer.invoke('set-aura-startup', payload),
  setMusicMode: (payload) => ipcRenderer.invoke('set-music-mode', payload),
  cpuBenchmark: (seconds, opts) => ipcRenderer.invoke('cpu-benchmark', seconds, opts),
  gpuBenchmark: (seconds, opts) => ipcRenderer.invoke('gpu-benchmark', seconds, opts),
  exportBenchmark: (payload) => ipcRenderer.invoke('export-benchmark', payload),
  gameSessionStart: () => ipcRenderer.invoke('game-session-start'),
  gameSessionSample: (id) => ipcRenderer.invoke('game-session-sample', id),
  gameSessionStop: (id) => ipcRenderer.invoke('game-session-stop', id),
  gameSessionList: () => ipcRenderer.invoke('game-session-list'),
  gameSessionGet: (id) => ipcRenderer.invoke('game-session-get', id),
  gameSessionCompare: (a, b) => ipcRenderer.invoke('game-session-compare', { a, b }),
  gameSessionBaseline: () => ipcRenderer.invoke('game-session-baseline'),
  gameSessionDelete: (id) => ipcRenderer.invoke('game-session-delete', id),
  gameSessionNote: (id, text) => ipcRenderer.invoke('game-session-note', { id, text }),
  listDisplays: () => ipcRenderer.invoke('list-displays'),
  setOverlay: (cfg) => ipcRenderer.invoke('set-overlay', cfg),
  getFpsLogging: () => ipcRenderer.invoke('get-fps-logging'),
  setFpsLogging: (enabled) => ipcRenderer.invoke('set-fps-logging', enabled),
  getGameMode: () => ipcRenderer.invoke('get-game-mode'),
  setGameMode: (enabled) => ipcRenderer.invoke('set-game-mode', enabled),
  setOverlayCompat: (on) => ipcRenderer.invoke('set-overlay-compat', on),
  relaunchApp: () => ipcRenderer.invoke('relaunch-app'),
  onOverlayState: subscribe('overlay-state'),
  // la ventana del overlay informa el tamaño de su tarjeta para ajustarse y anclarse bien
  overlayFit: (size) => ipcRenderer.send('overlay-fit', size),
  exportConfig: () => ipcRenderer.invoke('export-config'),
  importConfig: () => ipcRenderer.invoke('import-config'),
  zoom: (delta) => {
    const level = delta === null ? 0
      : Math.max(-3, Math.min(4, webFrame.getZoomLevel() + delta));
    webFrame.setZoomLevel(level);
    try { localStorage.setItem('zoomLevel', String(level)); } catch (_) {}
  },
  zoomTo: (level) => {
    webFrame.setZoomLevel(level);
    try { localStorage.setItem('zoomLevel', String(level)); } catch (_) {}
  },
  // --- power control (A6: pl1/pl2/boost/thermal + offsets GPU NVML) ---
  getPowerControl: () => ipcRenderer.invoke('get-power-control'),
  // --- Centro de Poder avanzado (v13): docs por marca/componente + abrir enlaces ---
  getDeviceDocs: () => ipcRenderer.invoke('get-device-docs'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  setPowerControl: (payload) => ipcRenderer.invoke('set-power-control', payload),
  resetPowerControl: () => ipcRenderer.invoke('reset-power-control'),
  // --- guardián térmico CPU/GPU ---
  getThermalGuardian: () => ipcRenderer.invoke('get-thermal-guardian'),
  setThermalGuardian: (payload) => ipcRenderer.invoke('set-thermal-guardian', payload),
  setBatteryLimit: (limit) => ipcRenderer.invoke('set-battery-limit', limit),
  // --- SMART bajo demanda (pkexec smartctl -j -a <device>) ---
  readSmart: (device) => ipcRenderer.invoke('readSmart', device),
});
