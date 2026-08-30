const { contextBridge, ipcRenderer, webUtils } = require('electron')

// Fired repeatedly during a folder import so the renderer can show a real progress bar
function onImportProgress(callback) {
  const handler = (_event, payload) => callback(payload)
  ipcRenderer.on('import:progress', handler)
  return () => ipcRenderer.removeListener('import:progress', handler)
}

contextBridge.exposeInMainWorld('api', {
  // Lets the renderer adjust chrome/wording that's genuinely platform-specific (the
  // reserved space for macOS's traffic-light window controls, "Finder" vs "Explorer"
  // wording, etc.) without needing a round-trip IPC call for something this static.
  platform: process.platform,
  // Electron 32 removed File.path — this is the supported way to get a dropped file's path
  getFilePath: (file) => webUtils.getPathForFile(file),
  loadData: () => ipcRenderer.invoke('data:load'),
  saveData: (data) => ipcRenderer.invoke('data:save', data),
  startNativeDrag: (filePaths) => ipcRenderer.send('native-drag-start', filePaths),
  sendMessage: (payload) => ipcRenderer.invoke('messages:send', payload),
  pickFiles: () => ipcRenderer.invoke('file:pick'),
  openFile: (filePath) => ipcRenderer.invoke('file:open', filePath),
  copyToLibrary: (srcPath) => ipcRenderer.invoke('file:copy-to-library', srcPath),
  pickLogo: (key) => ipcRenderer.invoke('branding:pick-logo', key),
  clearLogo: (key) => ipcRenderer.invoke('branding:clear-logo', key),
  readFileBinary: (filePath) => ipcRenderer.invoke('file:read-binary', filePath),
  fileExists: (filePath) => ipcRenderer.invoke('file:exists', filePath),
  importFolderTree: (folderPath) => ipcRenderer.invoke('folder:import-tree', folderPath),
  importFolderAll: (folderPath) => ipcRenderer.invoke('folder:import-all', folderPath),
  importFolderDeck: (folderPath) => ipcRenderer.invoke('folder:import-deck', folderPath),
  pickFolder: () => ipcRenderer.invoke('folder:pick'),
  isDirectory: (p) => ipcRenderer.invoke('path:is-directory', p),
  exportReport: (filename, content) => ipcRenderer.invoke('report:export', { filename, content }),
  exportInvoicePdf: (filename, bytes) => ipcRenderer.invoke('invoice:export', { filename, bytes }),
  copyToClipboard: (text) => ipcRenderer.invoke('clipboard:write', text),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  revealInFinder: (p) => ipcRenderer.invoke('shell:reveal', p),
  createHomeworkFolder: (payload) => ipcRenderer.invoke('homework:create-folder', payload),
  addSessionAttachment: (payload) => ipcRenderer.invoke('session:add-attachment', payload),
  removeSessionAttachment: (filePath) => ipcRenderer.invoke('session:remove-attachment', filePath),
  pickAttachmentFiles: () => ipcRenderer.invoke('attachment:pick'),
  openYouTubePlayer: (payload) => ipcRenderer.invoke('youtube:open-player', payload),
  zoomTest: (creds) => ipcRenderer.invoke('zoom:test', creds),
  zoomCreateMeeting: (payload) => ipcRenderer.invoke('zoom:create-meeting', payload),
  zoomDeleteMeeting: (payload) => ipcRenderer.invoke('zoom:delete-meeting', payload),
  checkApps: () => ipcRenderer.invoke('app:check-apps'),
  openWith: (filePath, appName) => ipcRenderer.invoke('file:open-with', { filePath, appName }),
  hasLibreOffice: () => ipcRenderer.invoke('app:has-libreoffice'),
  htmlHasIndex: (folderPath) => ipcRenderer.invoke('html:has-index', folderPath),
  importHtmlFolder: (folderPath) => ipcRenderer.invoke('html:import-folder', folderPath),
  convertPptxToPdf: (pptxPath) => ipcRenderer.invoke('pptx:convert-pdf', pptxPath),
  listAutoBackups: () => ipcRenderer.invoke('backup:list-auto'),
  restoreAutoBackup: (filename) => ipcRenderer.invoke('backup:restore-auto', filename),
  backupExport: () => ipcRenderer.invoke('backup:export'),
  backupImport: () => ipcRenderer.invoke('backup:import'),
  syncExport: (dataJson) => ipcRenderer.invoke('sync:export', dataJson),
  syncExportQuick: (dataJson) => ipcRenderer.invoke('sync:export-quick', dataJson),
  syncImport: () => ipcRenderer.invoke('sync:import'),
  onImportProgress,
})
