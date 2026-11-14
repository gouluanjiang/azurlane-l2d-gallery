const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('l2dDesktop', {
  state: () => ipcRenderer.invoke('l2d:state'),
  start: operation => ipcRenderer.invoke('l2d:start', operation),
  openFolder: () => ipcRenderer.invoke('l2d:folder'),
  favorites: () => ipcRenderer.invoke('l2d:favorites'),
  setFavorite: (id, on) => ipcRenderer.invoke('l2d:favorite-set', id, on),
  settings: () => ipcRenderer.invoke('l2d:settings'),
  setSettings: patch => ipcRenderer.invoke('l2d:settings-set', patch),
  samples: () => ipcRenderer.invoke('l2d:samples'),
  availability: () => ipcRenderer.invoke('l2d:availability'),
  openSample: id => ipcRenderer.invoke('l2d:sample', id),
  onProgress: callback => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('l2d:progress', listener);
    return () => ipcRenderer.removeListener('l2d:progress', listener);
  }
});
