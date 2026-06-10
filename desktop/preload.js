const { contextBridge, ipcRenderer, webFrame } = require('electron');

contextBridge.exposeInMainWorld('rog', {
  onStats: (callback) => ipcRenderer.on('stats', (_e, stats) => callback(stats)),
  onBackendDown: (callback) => ipcRenderer.on('backend-down', (_e, code) => callback(code)),
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
});
