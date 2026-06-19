const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  loadData: () => ipcRenderer.invoke('data:load'),
  saveData: (data) => ipcRenderer.invoke('data:save', data),
  pickFiles: () => ipcRenderer.invoke('file:pick'),
  openFile: (filePath) => ipcRenderer.invoke('file:open', filePath),
  copyToLibrary: (srcPath) => ipcRenderer.invoke('file:copy-to-library', srcPath),
  readFileBinary: (filePath) => ipcRenderer.invoke('file:read-binary', filePath),
  fileExists: (filePath) => ipcRenderer.invoke('file:exists', filePath),
  importFolderDeck: (folderPath) => ipcRenderer.invoke('folder:import-deck', folderPath),
  pickFolder: () => ipcRenderer.invoke('folder:pick'),
  isDirectory: (p) => ipcRenderer.invoke('path:is-directory', p),
  exportReport: (filename, content) => ipcRenderer.invoke('report:export', { filename, content }),
  copyToClipboard: (text) => ipcRenderer.invoke('clipboard:write', text),
})
