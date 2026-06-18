const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  loadData: () => ipcRenderer.invoke('data:load'),
  saveData: (data) => ipcRenderer.invoke('data:save', data),
  pickFiles: () => ipcRenderer.invoke('file:pick'),
  openFile: (filePath) => ipcRenderer.invoke('file:open', filePath),
  copyToLibrary: (srcPath) => ipcRenderer.invoke('file:copy-to-library', srcPath),
  fileExists: (filePath) => ipcRenderer.invoke('file:exists', filePath),
})
