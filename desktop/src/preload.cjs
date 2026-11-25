const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sindarisDesktop', {
  chooseSaveFolder: () => ipcRenderer.invoke('companion:choose-save-folder'),
  getCompanionStatus: () => ipcRenderer.invoke('companion:get-status'),
  openDiscordLogin: () => ipcRenderer.invoke('companion:discord-login'),
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
});
