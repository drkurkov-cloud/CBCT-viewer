const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cbct', {
  listStudies: () => ipcRenderer.invoke('studies:list'),
  importSource: (kind, url) => ipcRenderer.invoke('import:source', { kind, url }),
  openStudy: (id) => ipcRenderer.invoke('study:open', id),
  readFile: (path) => ipcRenderer.invoke('file:read', path),
  revealData: () => ipcRenderer.invoke('data:reveal'),
  rendererReady: () => ipcRenderer.send('renderer:ready')
});
