const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('l2dDesktop', {
  state: () => ipcRenderer.invoke('l2d:state'),
  start: operation => ipcRenderer.invoke('l2d:start', operation),
  openFolder: () => ipcRenderer.invoke('l2d:folder'),
  samples: () => ipcRenderer.invoke('l2d:samples'),
  availability: () => ipcRenderer.invoke('l2d:availability'),
  openSample: id => ipcRenderer.invoke('l2d:sample', id),
  onProgress: callback => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('l2d:progress', listener);
    return () => ipcRenderer.removeListener('l2d:progress', listener);
  }
});
