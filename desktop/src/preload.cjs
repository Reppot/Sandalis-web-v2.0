const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('chronomancerDesktop', {
  getDefaultLocale: () => ipcRenderer.invoke('app:get-default-locale'),
  setLocale: (locale) => ipcRenderer.invoke('app:set-locale', locale),
  chooseSaveFile: () => ipcRenderer.invoke('companion:choose-save-file'),
  getCompanionStatus: () => ipcRenderer.invoke('companion:get-status'),
  setContinuousScanning: (enabled) => ipcRenderer.invoke('companion:set-continuous-scanning', enabled),
  getCompanionProfile: () => ipcRenderer.invoke('companion:get-profile'),
  getLastScanReport: () => ipcRenderer.invoke('companion:get-last-report'),
  exportDiagnostics: () => ipcRenderer.invoke('diagnostics:export'),
  getUpdateState: () => ipcRenderer.invoke('updates:get-state'),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  downloadUpdate: () => ipcRenderer.invoke('updates:download'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
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
  onUpdateState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('updates:state', listener);
    return () => ipcRenderer.removeListener('updates:state', listener);
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
