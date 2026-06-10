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
  zoom: (delta) => {
    if (delta === null) { webFrame.setZoomLevel(0); return; }
    webFrame.setZoomLevel(Math.max(-3, Math.min(4, webFrame.getZoomLevel() + delta)));
  },
});
