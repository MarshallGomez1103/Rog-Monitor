const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rog', {
  onStats: (callback) => ipcRenderer.on('stats', (_e, stats) => callback(stats)),
  onBackendDown: (callback) => ipcRenderer.on('backend-down', (_e, code) => callback(code)),
  setProfile: (profile) => ipcRenderer.invoke('set-profile', profile),
  setGpuMode: (mode) => ipcRenderer.invoke('set-gpu-mode', mode),
  checkUpdate: () => ipcRenderer.invoke('check-update'),
  doUpdate: () => ipcRenderer.invoke('do-update'),
  appInfo: () => ipcRenderer.invoke('app-info'),
});
