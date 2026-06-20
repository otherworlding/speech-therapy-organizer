const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  loadData: () => ipcRenderer.invoke('data:load'),
  saveData: (data) => ipcRenderer.invoke('data:save', data),
  pickFiles: () => ipcRenderer.invoke('file:pick'),
  openFile: (filePath) => ipcRenderer.invoke('file:open', filePath),
  copyToLibrary: (srcPath) => ipcRenderer.invoke('file:copy-to-library', srcPath),
  readFileBinary: (filePath) => ipcRenderer.invoke('file:read-binary', filePath),
  fileExists: (filePath) => ipcRenderer.invoke('file:exists', filePath),
  importFolderAll: (folderPath) => ipcRenderer.invoke('folder:import-all', folderPath),
  importFolderDeck: (folderPath) => ipcRenderer.invoke('folder:import-deck', folderPath),
  pickFolder: () => ipcRenderer.invoke('folder:pick'),
  isDirectory: (p) => ipcRenderer.invoke('path:is-directory', p),
  exportReport: (filename, content) => ipcRenderer.invoke('report:export', { filename, content }),
  copyToClipboard: (text) => ipcRenderer.invoke('clipboard:write', text),
  checkApps: () => ipcRenderer.invoke('app:check-apps'),
  openWith: (filePath, appName) => ipcRenderer.invoke('file:open-with', { filePath, appName }),
  hasLibreOffice: () => ipcRenderer.invoke('app:has-libreoffice'),
  htmlHasIndex: (folderPath) => ipcRenderer.invoke('html:has-index', folderPath),
  importHtmlFolder: (folderPath) => ipcRenderer.invoke('html:import-folder', folderPath),
  convertPptxToPdf: (pptxPath) => ipcRenderer.invoke('pptx:convert-pdf', pptxPath),
})
