const { app, BrowserWindow, ipcMain, dialog, shell, session } = require('electron')
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

const EMPTY_DATA = { clients: [], materials: [], sessions: [], goals: [], appointments: [], settings: {}, folders: [] }

function loadData() {
  ensureDataDir()
  if (!fs.existsSync(DATA_FILE)) return { ...EMPTY_DATA }
  try {
    const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
    return { ...EMPTY_DATA, ...d }
  } catch { return { ...EMPTY_DATA } }
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

// YouTube's embedded IFRAME player rejects a file:// parent origin (Error 153/152 —
// there's no legitimate origin to present). Instead of embedding, open the real
// YouTube watch page in its own window: a genuine https://youtube.com origin, no
// embedding restrictions apply, and it shows up as its own window in Zoom's
// "share a window" picker.
let youtubeWin = null
function openYouTubePlayerWindow(event, { videoId, title }) {
  const url = `https://www.youtube.com/watch?v=${videoId}`
  const parent = BrowserWindow.fromWebContents(event.sender)
  const bounds = parent ? parent.getBounds() : { width: 1400, height: 900 }

  if (youtubeWin && !youtubeWin.isDestroyed()) {
    youtubeWin.loadURL(url)
    youtubeWin.setTitle(title || 'YouTube')
    youtubeWin.show()
    youtubeWin.focus()
    return
  }

  youtubeWin = new BrowserWindow({
    width: bounds.width, height: bounds.height,
    minWidth: 480, minHeight: 320,
    title: title || 'YouTube',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  })
  youtubeWin.loadURL(url)
  youtubeWin.on('closed', () => { youtubeWin = null })
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

// Recursively import a dropped folder, preserving its full subfolder structure.
// Copies files into a mirrored tree under the library and returns a nested
// { name, files:[{filename,filePath}], folders:[...] } tree for the renderer.
ipcMain.handle('folder:import-tree', async (_, srcFolder) => {
  const libRoot = path.join(DATA_DIR, 'files', 'imported_' + Date.now())
  fs.mkdirSync(libRoot, { recursive: true })

  function walk(srcDir, destDir) {
    const node = { name: path.basename(srcDir), files: [], folders: [] }
    let entries
    try { entries = fs.readdirSync(srcDir, { withFileTypes: true }) } catch { return node }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue           // skip .DS_Store etc.
      const srcPath = path.join(srcDir, entry.name)
      if (entry.isDirectory()) {
        const childDest = path.join(destDir, entry.name)
        fs.mkdirSync(childDest, { recursive: true })
        node.folders.push(walk(srcPath, childDest))
      } else if (entry.isFile()) {
        const destPath = path.join(destDir, entry.name)
        try {
          fs.copyFileSync(srcPath, destPath)
          node.files.push({ filename: entry.name, filePath: destPath })
        } catch {}
      }
    }
    return node
  }

  try {
    return { success: true, tree: walk(srcFolder, libRoot) }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

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

// Export text or calendar file (filter picked by extension)
ipcMain.handle('report:export', async (_, { filename, content }) => {
  const isIcs = filename.toLowerCase().endsWith('.ics')
  const result = await dialog.showSaveDialog({
    defaultPath: path.join(os.homedir(), 'Desktop', filename),
    filters: isIcs
      ? [{ name: 'Calendar Invite', extensions: ['ics'] }]
      : [{ name: 'Text', extensions: ['txt'] }],
  })
  if (!result.canceled && result.filePath) {
    fs.writeFileSync(result.filePath, content, 'utf8')
    return true
  }
  return false
})

// Open a URL in the default handler (browser, Mail via mailto:)
ipcMain.handle('shell:open-external', (_, url) => {
  if (/^(https?:|mailto:)/i.test(url)) shell.openExternal(url)
  return true
})

// Reveal a file/folder in Finder
ipcMain.handle('shell:reveal', (_, p) => { try { shell.showItemInFolder(p) } catch {} return true })

// Open a YouTube video in its own real window (not embedded) — see openYouTubePlayerWindow above
ipcMain.handle('youtube:open-player', (event, payload) => { openYouTubePlayerWindow(event, payload); return true })

// Create a dated homework folder for a client with copies of the chosen files
// and an optional Instructions.txt with the therapist's note
ipcMain.handle('homework:create-folder', async (_, { clientName, dateStr, filePaths, note }) => {
  try {
    const base = path.join(os.homedir(), 'Documents', 'Speech Therapy Homework')
    const safeName = (clientName || 'Client').replace(/[\/:*?"<>|]/g, '-').trim()
    const dest = path.join(base, `${safeName} - ${dateStr}`)
    fs.mkdirSync(dest, { recursive: true })
    let count = 0
    for (const fp of (filePaths || [])) {
      try {
        if (fp && fs.existsSync(fp)) { fs.copyFileSync(fp, path.join(dest, path.basename(fp))); count++ }
      } catch {}
    }
    let notePath = null
    if (note && note.trim()) {
      notePath = path.join(dest, 'Instructions.txt')
      fs.writeFileSync(notePath, note, 'utf8')
    }
    return { success: true, folderPath: dest, count, notePath }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// ── Zoom API (Server-to-Server OAuth) ──────────────────────────────────
const https = require('https')

function httpsJson(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = ''
      res.on('data', c => { data += c })
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(data || '{}') }) }
        catch { resolve({ status: res.statusCode, json: {} }) }
      })
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

async function zoomToken({ accountId, clientId, clientSecret }) {
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const { status, json } = await httpsJson({
    hostname: 'zoom.us',
    path: `/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(accountId)}`,
    method: 'POST',
    headers: { Authorization: `Basic ${auth}` },
  })
  if (status !== 200 || !json.access_token) {
    throw new Error(json.reason || json.error_description || json.error || `Zoom login failed (${status})`)
  }
  return json.access_token
}

// Test credentials: returns account email + plan type (1 = Basic/free, 2 = Licensed)
ipcMain.handle('zoom:test', async (_, creds) => {
  try {
    const token = await zoomToken(creds)
    const { status, json } = await httpsJson({
      hostname: 'api.zoom.us', path: '/v2/users/me', method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (status !== 200) throw new Error(json.message || `Could not read Zoom profile (${status})`)
    return { success: true, email: json.email, planType: json.type, name: `${json.first_name || ''} ${json.last_name || ''}`.trim() }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// Create a unique meeting for an appointment
ipcMain.handle('zoom:create-meeting', async (_, { creds, topic, startIso, durationMins, timezone }) => {
  try {
    const token = await zoomToken(creds)
    const body = JSON.stringify({
      topic: topic || 'Speech Therapy Session',
      type: 2, // scheduled
      start_time: startIso,
      duration: durationMins,
      timezone,
      settings: { waiting_room: true, join_before_host: false },
    })
    const { status, json } = await httpsJson({
      hostname: 'api.zoom.us', path: '/v2/users/me/meetings', method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, body)
    if (status !== 201) throw new Error(json.message || `Zoom refused to create the meeting (${status})`)
    return { success: true, meetingId: json.id, joinUrl: json.join_url, startUrl: json.start_url }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// Delete a Zoom meeting (when an appointment is cancelled)
ipcMain.handle('zoom:delete-meeting', async (_, { creds, meetingId }) => {
  try {
    const token = await zoomToken(creds)
    await httpsJson({
      hostname: 'api.zoom.us', path: `/v2/meetings/${meetingId}`, method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// Copy text to clipboard via shell
ipcMain.handle('clipboard:write', (_, text) => {
  const { clipboard } = require('electron')
  clipboard.writeText(text)
  return true
})
