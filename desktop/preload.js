const { contextBridge, ipcRenderer, webFrame } = require('electron');

contextBridge.exposeInMainWorld('rog', {
  onStats: (callback) => ipcRenderer.on('stats', (_e, stats) => callback(stats)),
  onOverlayConfig: (callback) => ipcRenderer.on('overlay-config', (_e, show) => callback(show)),
  onBackendDown: (callback) => ipcRenderer.on('backend-down', (_e, code) => callback(code)),
  onMusicStopped: (callback) => ipcRenderer.on('music-stopped', () => callback()),
  setProfile: (profile) => ipcRenderer.invoke('set-profile', profile),
  setGpuMode: (mode) => ipcRenderer.invoke('set-gpu-mode', mode),
  checkUpdate: () => ipcRenderer.invoke('check-update'),
  doUpdate: () => ipcRenderer.invoke('do-update'),
  appInfo: () => ipcRenderer.invoke('app-info'),
  killProcess: (pid) => ipcRenderer.invoke('kill-process', pid),
  exportEvents: (text) => ipcRenderer.invoke('export-events', text),
  getFanConfig: (profile) => ipcRenderer.invoke('get-fan-config', profile),
  setFanConfig: (cfg) => ipcRenderer.invoke('set-fan-config', cfg),
  fanBenchmark: () => ipcRenderer.invoke('fan-benchmark'),
  reportIssue: (body) => ipcRenderer.invoke('report-issue', body),
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
  cpuBenchmark: (seconds) => ipcRenderer.invoke('cpu-benchmark', seconds),
  gpuBenchmark: (seconds) => ipcRenderer.invoke('gpu-benchmark', seconds),
  exportBenchmark: (payload) => ipcRenderer.invoke('export-benchmark', payload),
  listDisplays: () => ipcRenderer.invoke('list-displays'),
  setOverlay: (cfg) => ipcRenderer.invoke('set-overlay', cfg),
  getFpsLogging: () => ipcRenderer.invoke('get-fps-logging'),
  setFpsLogging: (enabled) => ipcRenderer.invoke('set-fps-logging', enabled),
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
  setPowerControl: (payload) => ipcRenderer.invoke('set-power-control', payload),
  resetPowerControl: () => ipcRenderer.invoke('reset-power-control'),
  // --- guardián térmico GPU (A6) ---
  getThermalGuardian: () => ipcRenderer.invoke('get-thermal-guardian'),
  setThermalGuardian: (payload) => ipcRenderer.invoke('set-thermal-guardian', payload),
});
