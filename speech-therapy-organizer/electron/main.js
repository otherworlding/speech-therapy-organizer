const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')

const isDev = !app.isPackaged
const DATA_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'SpeechTherapyOrganizer')
const DATA_FILE = path.join(DATA_DIR, 'data.json')

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

function loadData() {
  ensureDataDir()
  if (!fs.existsSync(DATA_FILE)) {
    return { clients: [], materials: [] }
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
  } catch {
    return { clients: [], materials: [] }
  }
}

function saveData(data) {
  ensureDataDir()
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2))
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// IPC handlers
ipcMain.handle('data:load', () => loadData())
ipcMain.handle('data:save', (_, data) => { saveData(data); return true })

ipcMain.handle('file:pick', async (_, options) => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'All Supported', extensions: ['pdf', 'pptx', 'ppt', 'jpg', 'jpeg', 'png', 'gif', 'mp4', 'mov', 'mp3', 'wav', 'm4a', 'txt', 'docx'] },
      { name: 'Documents', extensions: ['pdf', 'pptx', 'ppt', 'docx', 'txt'] },
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif'] },
      { name: 'Video', extensions: ['mp4', 'mov', 'avi'] },
      { name: 'Audio', extensions: ['mp3', 'wav', 'm4a'] },
    ],
  })
  return result.canceled ? [] : result.filePaths
})

ipcMain.handle('file:open', async (_, filePath) => {
  await shell.openPath(filePath)
  return true
})

ipcMain.handle('file:copy-to-library', async (_, srcPath) => {
  const libDir = path.join(DATA_DIR, 'files')
  if (!fs.existsSync(libDir)) fs.mkdirSync(libDir, { recursive: true })
  const filename = path.basename(srcPath)
  const destPath = path.join(libDir, filename)
  fs.copyFileSync(srcPath, destPath)
  return destPath
})

ipcMain.handle('file:exists', (_, filePath) => fs.existsSync(filePath))
