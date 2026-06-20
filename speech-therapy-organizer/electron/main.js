const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const { execFile } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')

function copyDirSync(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    entry.isDirectory() ? copyDirSync(s, d) : fs.copyFileSync(s, d)
  }
}

function findLibreOffice() {
  const candidates = [
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
    '/usr/local/bin/soffice',
    '/usr/bin/soffice',
  ]
  return candidates.find(p => fs.existsSync(p)) || null
}

const isDev = !app.isPackaged
const DATA_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'SpeechTherapyOrganizer')
const DATA_FILE = path.join(DATA_DIR, 'data.json')
const IMAGE_EXTS = /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

function loadData() {
  ensureDataDir()
  if (!fs.existsSync(DATA_FILE)) return { clients: [], materials: [], sessions: [], goals: [] }
  try {
    const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
    return { clients: [], materials: [], sessions: [], goals: [], ...d }
  } catch { return { clients: [], materials: [], sessions: [], goals: [] } }
}

function saveData(data) {
  ensureDataDir()
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2))
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1000, minHeight: 700,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
      webviewTag: true,
    },
  })
  if (isDev) win.loadURL('http://localhost:5173')
  else win.loadFile(path.join(__dirname, '../dist/index.html'))
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })

// Data
ipcMain.handle('data:load', () => loadData())
ipcMain.handle('data:save', (_, data) => { saveData(data); return true })

// File pick dialog
ipcMain.handle('file:pick', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'All Supported', extensions: ['pdf','pptx','ppt','jpg','jpeg','png','gif','mp4','mov','mp3','wav','m4a','txt','docx'] },
      { name: 'Documents', extensions: ['pdf','pptx','ppt','docx','txt'] },
      { name: 'Images', extensions: ['jpg','jpeg','png','gif'] },
      { name: 'Video', extensions: ['mp4','mov','avi'] },
      { name: 'Audio', extensions: ['mp3','wav','m4a'] },
    ],
  })
  return result.canceled ? [] : result.filePaths
})

// Open in default OS app
ipcMain.handle('file:open', async (_, filePath) => { await shell.openPath(filePath); return true })

// Folder picker dialog
ipcMain.handle('folder:pick', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'multiSelections'],
  })
  return result.canceled ? [] : result.filePaths
})

// Check if path is a directory
ipcMain.handle('path:is-directory', (_, p) => {
  try { return fs.statSync(p).isDirectory() } catch { return false }
})

// Copy single file to library
ipcMain.handle('file:copy-to-library', async (_, srcPath) => {
  const libDir = path.join(DATA_DIR, 'files')
  if (!fs.existsSync(libDir)) fs.mkdirSync(libDir, { recursive: true })
  const filename = path.basename(srcPath)
  const destPath = path.join(libDir, filename)
  fs.copyFileSync(srcPath, destPath)
  return destPath
})

// Read file as binary (for PDF.js and PPTX parser)
ipcMain.handle('file:read-binary', (_, filePath) => {
  return fs.readFileSync(filePath)
})

// Check file exists
ipcMain.handle('file:exists', (_, filePath) => fs.existsSync(filePath))

// Import ALL files in a folder as a grouped folder material
ipcMain.handle('folder:import-all', async (_, srcFolder) => {
  const libDir = path.join(DATA_DIR, 'files')
  const folderName = path.basename(srcFolder)
  const destFolder = path.join(libDir, folderName + '_' + Date.now())
  if (!fs.existsSync(destFolder)) fs.mkdirSync(destFolder, { recursive: true })

  const files = fs.readdirSync(srcFolder)
    .filter(f => fs.statSync(path.join(srcFolder, f)).isFile())
    .sort()

  const items = []
  for (const file of files) {
    const src = path.join(srcFolder, file)
    const dest = path.join(destFolder, file)
    fs.copyFileSync(src, dest)
    items.push({ filename: file, filePath: dest })
  }
  return { name: folderName, items }
})

// Legacy: image-deck (kept for backward compat)
ipcMain.handle('folder:import-deck', async (_, srcFolder) => {
  const libDir = path.join(DATA_DIR, 'files')
  const folderName = path.basename(srcFolder)
  const destFolder = path.join(libDir, folderName + '_deck')
  if (!fs.existsSync(destFolder)) fs.mkdirSync(destFolder, { recursive: true })
  const files = fs.readdirSync(srcFolder).filter(f => IMAGE_EXTS.test(f)).sort()
  const imagePaths = []
  for (const file of files) {
    const src = path.join(srcFolder, file)
    const dest = path.join(destFolder, file)
    fs.copyFileSync(src, dest)
    imagePaths.push(dest)
  }
  return { name: folderName, imagePaths, folderPath: destFolder }
})

// Detect which presentation apps are installed
ipcMain.handle('app:check-apps', () => ({
  keynote:     fs.existsSync('/Applications/Keynote.app'),
  powerpoint:  fs.existsSync('/Applications/Microsoft PowerPoint.app'),
  libreoffice: fs.existsSync('/Applications/LibreOffice.app'),
}))

// Open a file with a specific app by name (macOS `open -a`)
ipcMain.handle('file:open-with', async (_, { filePath, appName }) => {
  return new Promise(resolve => {
    execFile('open', ['-a', appName, filePath], err => resolve(!err))
  })
})

// Check if LibreOffice is installed
ipcMain.handle('app:has-libreoffice', () => !!findLibreOffice())

// Check if a folder contains index.html (fast, no copy)
ipcMain.handle('html:has-index', (_, folderPath) => {
  return fs.existsSync(path.join(folderPath, 'index.html'))
})

// Import HTML game folder — recursive copy, returns indexPath
ipcMain.handle('html:import-folder', async (_, srcFolder) => {
  const folderName = path.basename(srcFolder)
  const destFolder = path.join(DATA_DIR, 'files', folderName + '_html_' + Date.now())
  copyDirSync(srcFolder, destFolder)
  const indexPath = path.join(destFolder, 'index.html')
  if (!fs.existsSync(indexPath)) return { success: false, error: 'No index.html found' }
  return { success: true, name: folderName, indexPath }
})

// Convert PPTX → PDF via LibreOffice (headless)
ipcMain.handle('pptx:convert-pdf', async (_, pptxPath) => {
  const soffice = findLibreOffice()
  if (!soffice) return { success: false, error: 'LibreOffice not installed' }
  const outDir = path.join(DATA_DIR, 'files')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  return new Promise(resolve => {
    execFile(soffice, ['--headless', '--convert-to', 'pdf', '--outdir', outDir, pptxPath], err => {
      if (err) return resolve({ success: false, error: err.message })
      const base = path.basename(pptxPath, path.extname(pptxPath))
      const pdfPath = path.join(outDir, base + '.pdf')
      resolve({ success: fs.existsSync(pdfPath), pdfPath })
    })
  })
})

// Export session report as text file
ipcMain.handle('report:export', async (_, { filename, content }) => {
  const result = await dialog.showSaveDialog({
    defaultPath: path.join(os.homedir(), 'Desktop', filename),
    filters: [{ name: 'Text', extensions: ['txt'] }],
  })
  if (!result.canceled && result.filePath) {
    fs.writeFileSync(result.filePath, content, 'utf8')
    return true
  }
  return false
})

// Copy text to clipboard via shell
ipcMain.handle('clipboard:write', (_, text) => {
  const { clipboard } = require('electron')
  clipboard.writeText(text)
  return true
})
