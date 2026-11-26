const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('chronomancerDesktop', {
  chooseSaveFile: () => ipcRenderer.invoke('companion:choose-save-file'),
  getCompanionStatus: () => ipcRenderer.invoke('companion:get-status'),
  setContinuousScanning: (enabled) => ipcRenderer.invoke('companion:set-continuous-scanning', enabled),
  getCompanionProfile: () => ipcRenderer.invoke('companion:get-profile'),
  getLastScanReport: () => ipcRenderer.invoke('companion:get-last-report'),
  getDiscordSetup: () => ipcRenderer.invoke('companion:get-discord-setup'),
  completeDiscordSetup: (selection) => ipcRenderer.invoke('companion:complete-discord-setup', selection),
  openDiscordLogin: () => ipcRenderer.invoke('companion:discord-login'),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:toggle-maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  isWindowMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  onCompanionStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('companion:status', listener);
    return () => ipcRenderer.removeListener('companion:status', listener);
  },
  onAuthComplete: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('auth:complete', listener);
    return () => ipcRenderer.removeListener('auth:complete', listener);
  },
  onWindowMaximized: (callback) => {
    const listener = (_event, maximized) => callback(Boolean(maximized));
    ipcRenderer.on('window:maximized', listener);
    return () => ipcRenderer.removeListener('window:maximized', listener);
  },
});
