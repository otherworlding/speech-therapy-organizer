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
const FILES_DIR = path.join(DATA_DIR, 'files')
const BACKUPS_DIR = path.join(DATA_DIR, 'backups')
const MAX_DAILY_BACKUPS = 30
const IMAGE_EXTS = /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}
function ensureBackupsDir() {
  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true })
}

const EMPTY_DATA = { clients: [], materials: [], sessions: [], goals: [], appointments: [], settings: {}, folders: [] }

// Write-then-rename so a crash mid-save can never leave a half-written, corrupted data.json
function atomicWriteJSON(filePath, obj) {
  const tmp = filePath + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2))
  fs.renameSync(tmp, filePath)
}

// If data.json is unreadable, recover from the newest daily backup instead of silently
// starting from a blank slate (which would then get saved over the real data).
function recoverFromLatestBackup() {
  try {
    ensureBackupsDir()
    const files = fs.readdirSync(BACKUPS_DIR).filter(f => f.startsWith('data-') && f.endsWith('.json')).sort()
    if (!files.length) return null
    const latest = files[files.length - 1]
    const d = JSON.parse(fs.readFileSync(path.join(BACKUPS_DIR, latest), 'utf8'))
    return { ...EMPTY_DATA, ...d }
  } catch { return null }
}

function loadData() {
  ensureDataDir()
  if (!fs.existsSync(DATA_FILE)) return { ...EMPTY_DATA }
  try {
    const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
    return { ...EMPTY_DATA, ...d }
  } catch (e) {
    console.error('data.json failed to parse — recovering from latest backup:', e.message)
    return recoverFromLatestBackup() || { ...EMPTY_DATA }
  }
}

function saveData(data) {
  ensureDataDir()
  atomicWriteJSON(DATA_FILE, data)
}

// One dated snapshot per calendar day, pruned to the newest MAX_DAILY_BACKUPS
function dailyBackupIfNeeded() {
  try {
    if (!fs.existsSync(DATA_FILE)) return
    ensureBackupsDir()
    const today = new Date().toISOString().slice(0, 10)
    const target = path.join(BACKUPS_DIR, `data-${today}.json`)
    if (!fs.existsSync(target)) fs.copyFileSync(DATA_FILE, target)
    const files = fs.readdirSync(BACKUPS_DIR).filter(f => f.startsWith('data-') && f.endsWith('.json')).sort()
    const excess = files.length - MAX_DAILY_BACKUPS
    if (excess > 0) files.slice(0, excess).forEach(f => { try { fs.unlinkSync(path.join(BACKUPS_DIR, f)) } catch {} })
  } catch (e) { console.error('daily backup failed:', e.message) }
}

function listAutoBackups() {
  ensureBackupsDir()
  return fs.readdirSync(BACKUPS_DIR)
    .filter(f => f.startsWith('data-') && f.endsWith('.json'))
    .sort().reverse()
    .map(f => ({ filename: f, date: f.slice(5, 15) }))
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1000, minHeight: 700,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
      webviewTag: true,
      // Dev only: the renderer loads from http://localhost (Vite), and Chromium blocks
      // file:// <img> loads from a network-origin page. The packaged app loads via file://
      // itself (win.loadFile below) where this restriction doesn't apply, so it's dev-only.
      webSecurity: !isDev,
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
ipcMain.handle('data:load', () => {
  const d = loadData()
  dailyBackupIfNeeded()  // once-per-day snapshot of the state we just loaded
  return d
})
ipcMain.handle('data:save', (_, data) => { saveData(data); return true })

// List available daily auto-backups
ipcMain.handle('backup:list-auto', () => listAutoBackups())

// Restore one daily snapshot (only replaces data.json — material files are untouched)
ipcMain.handle('backup:restore-auto', (_, filename) => {
  try {
    const src = path.join(BACKUPS_DIR, filename)
    if (!fs.existsSync(src)) return { success: false, error: 'Backup file not found' }
    // Safety net: snapshot current state before overwriting, in case of a wrong restore
    if (fs.existsSync(DATA_FILE)) fs.copyFileSync(DATA_FILE, path.join(BACKUPS_DIR, `pre-restore-${Date.now()}.json`))
    const d = JSON.parse(fs.readFileSync(src, 'utf8'))
    atomicWriteJSON(DATA_FILE, { ...EMPTY_DATA, ...d })
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// Full portable backup: zip data.json + all material files to a location the user picks
ipcMain.handle('backup:export', async () => {
  try {
    const JSZip = require('jszip')
    const result = await dialog.showSaveDialog({
      defaultPath: path.join(os.homedir(), 'Desktop', `SpeechTherapyOrganizer-Backup-${new Date().toISOString().slice(0,10)}.zip`),
      filters: [{ name: 'Backup Archive', extensions: ['zip'] }],
    })
    if (result.canceled || !result.filePath) return { success: false, canceled: true }

    const zip = new JSZip()
    if (fs.existsSync(DATA_FILE)) zip.file('data.json', fs.readFileSync(DATA_FILE))

    function addDir(dir, zipFolder) {
      if (!fs.existsSync(dir)) return
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) addDir(full, zipFolder.folder(entry.name))
        else zipFolder.file(entry.name, fs.readFileSync(full))
      }
    }
    addDir(FILES_DIR, zip.folder('files'))

    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
    fs.writeFileSync(result.filePath, buffer)
    return { success: true, path: result.filePath }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// Restore a full portable backup zip — replaces data.json and the files/ folder
ipcMain.handle('backup:import', async () => {
  try {
    const JSZip = require('jszip')
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Backup Archive', extensions: ['zip'] }],
    })
    if (result.canceled || !result.filePaths.length) return { success: false, canceled: true }

    // Safety net: snapshot current state before overwriting
    ensureBackupsDir()
    if (fs.existsSync(DATA_FILE)) fs.copyFileSync(DATA_FILE, path.join(BACKUPS_DIR, `pre-restore-${Date.now()}.json`))

    const zip = await JSZip.loadAsync(fs.readFileSync(result.filePaths[0]))
    const dataEntry = zip.file('data.json')
    if (!dataEntry) return { success: false, error: 'This file is not a valid backup (no data.json inside).' }
    const parsed = JSON.parse(await dataEntry.async('string'))
    atomicWriteJSON(DATA_FILE, { ...EMPTY_DATA, ...parsed })

    ensureDataDir()
    if (!fs.existsSync(FILES_DIR)) fs.mkdirSync(FILES_DIR, { recursive: true })
    const entries = Object.keys(zip.files).filter(k => k.startsWith('files/') && !zip.files[k].dir)
    for (const key of entries) {
      const rel = key.slice('files/'.length)
      const dest = path.join(FILES_DIR, rel)
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      const content = await zip.files[key].async('nodebuffer')
      fs.writeFileSync(dest, content)
    }
    return { success: true, filesRestored: entries.length }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// ── Lightweight sync file: just the small metadata (clients, materials list, sessions,
// calendar, tags, folders) — no file content. Small enough to email between two machines
// that already share the same material files. The renderer does the actual merge.
ipcMain.handle('sync:export', async (_, dataJson) => {
  try {
    const result = await dialog.showSaveDialog({
      defaultPath: path.join(os.homedir(), 'Desktop', `SpeechOrg-Sync-${new Date().toISOString().slice(0,10)}.json`),
      filters: [{ name: 'Sync File', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePath) return { success: false, canceled: true }
    fs.writeFileSync(result.filePath, dataJson, 'utf8')
    shell.showItemInFolder(result.filePath)
    return { success: true, path: result.filePath }
  } catch (e) {
    return { success: false, error: e.message }
  }
})
// Fast path for the "Send" button: no save dialog, always writes to a fixed spot on
// Desktop so attaching it to an email is one motion (export → reveal → attach).
ipcMain.handle('sync:export-quick', (_, dataJson) => {
  try {
    const dest = path.join(os.homedir(), 'Desktop', `SpeechOrg-Sync-${new Date().toISOString().slice(0,10)}.json`)
    fs.writeFileSync(dest, dataJson, 'utf8')
    shell.showItemInFolder(dest)
    return { success: true, path: dest }
  } catch (e) {
    return { success: false, error: e.message }
  }
})
ipcMain.handle('sync:import', async () => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Sync File', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePaths.length) return { success: false, canceled: true }
    const raw = fs.readFileSync(result.filePaths[0], 'utf8')
    const parsed = JSON.parse(raw)
    return { success: true, data: parsed }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

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

// Pick + copy a custom logo image for Settings branding. Kept in its own folder,
// always named "logo.<ext>" (or "logo-<key>.<ext>" for a per-client override, key
// being the client id) so re-uploading cleanly replaces the previous one instead
// of accumulating files (unlike the shared materials library folder).
function logoBase(key) {
  const safe = key ? String(key).replace(/[^a-zA-Z0-9_-]/g, '_') : null
  return safe ? `logo-${safe}` : 'logo'
}
ipcMain.handle('branding:pick-logo', async (_, key) => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'] }],
  })
  if (result.canceled || !result.filePaths.length) return null
  const srcPath = result.filePaths[0]
  const brandDir = path.join(DATA_DIR, 'branding')
  if (!fs.existsSync(brandDir)) fs.mkdirSync(brandDir, { recursive: true })
  const base = logoBase(key)
  const pattern = new RegExp(`^${base}\\.[a-zA-Z0-9]+$`)
  // Clear any previously saved logo for this same key (whatever extension it had)
  // before writing the new one — the regex anchors so "logo." never matches "logo-x.".
  for (const f of fs.readdirSync(brandDir)) {
    if (pattern.test(f)) fs.unlinkSync(path.join(brandDir, f))
  }
  const ext = path.extname(srcPath) || '.png'
  const destPath = path.join(brandDir, `${base}${ext}`)
  fs.copyFileSync(srcPath, destPath)
  return destPath
})

// Remove a saved logo (default, or a specific client's override) — reverts to falling
// back on the default branding for that key.
ipcMain.handle('branding:clear-logo', async (_, key) => {
  const brandDir = path.join(DATA_DIR, 'branding')
  if (fs.existsSync(brandDir)) {
    const base = logoBase(key)
    const pattern = new RegExp(`^${base}\\.[a-zA-Z0-9]+$`)
    for (const f of fs.readdirSync(brandDir)) {
      if (pattern.test(f)) fs.unlinkSync(path.join(brandDir, f))
    }
  }
  return true
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
// Quick pre-pass: count files so the progress bar can show a real percentage
async function countFiles(dir) {
  let count = 0
  let entries
  try { entries = await fs.promises.readdir(dir, { withFileTypes: true }) } catch { return 0 }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) count += await countFiles(p)
    else if (entry.isFile()) count++
  }
  return count
}

// Fully async — every await yields back to Node's event loop between files, so this
// no longer freezes the whole app during a large import, and can report real progress.
ipcMain.handle('folder:import-tree', async (event, srcFolder) => {
  const libRoot = path.join(DATA_DIR, 'files', 'imported_' + Date.now())
  await fs.promises.mkdir(libRoot, { recursive: true })

  const total = await countFiles(srcFolder)
  let done = 0
  const sender = event.sender

  async function walk(srcDir, destDir) {
    const node = { name: path.basename(srcDir), files: [], folders: [] }
    let entries
    try { entries = await fs.promises.readdir(srcDir, { withFileTypes: true }) } catch { return node }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue           // skip .DS_Store etc.
      const srcPath = path.join(srcDir, entry.name)
      if (entry.isDirectory()) {
        const childDest = path.join(destDir, entry.name)
        await fs.promises.mkdir(childDest, { recursive: true })
        node.folders.push(await walk(srcPath, childDest))
      } else if (entry.isFile()) {
        const destPath = path.join(destDir, entry.name)
        try {
          await fs.promises.copyFile(srcPath, destPath)
          node.files.push({ filename: entry.name, filePath: destPath })
        } catch {}
        done++
        if (!sender.isDestroyed()) sender.send('import:progress', { done, total, filename: entry.name })
      }
    }
    return node
  }

  try {
    const tree = await walk(srcFolder, libRoot)
    return { success: true, tree }
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

// Save a generated invoice PDF (renderer builds the bytes with pdf-lib, main just
// runs the save dialog + write — same convention as report:export, binary instead of text)
ipcMain.handle('invoice:export', async (_, { filename, bytes }) => {
  const result = await dialog.showSaveDialog({
    defaultPath: path.join(os.homedir(), 'Desktop', filename),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })
  if (!result.canceled && result.filePath) {
    fs.writeFileSync(result.filePath, Buffer.from(bytes))
    return { success: true, path: result.filePath }
  }
  return { success: false, canceled: true }
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

const IMAGE_EXTS_CHECK = /\.(jpg|jpeg|png|gif|bmp|webp|heic)$/i
const TEXT_EXTS_CHECK = /\.(txt|md|rtf)$/i

// Copy a dropped photo/note/document into that session's own attachments folder —
// separate from the reusable Materials Library, since these are one-off session records.
ipcMain.handle('session:add-attachment', (_, { sessionId, srcPath }) => {
  try {
    const dir = path.join(DATA_DIR, 'session-attachments', sessionId)
    fs.mkdirSync(dir, { recursive: true })
    const filename = path.basename(srcPath)
    const dest = path.join(dir, filename)
    fs.copyFileSync(srcPath, dest)
    const kind = IMAGE_EXTS_CHECK.test(filename) ? 'image' : TEXT_EXTS_CHECK.test(filename) ? 'text' : 'file'
    return { success: true, filePath: dest, filename, kind }
  } catch (e) {
    return { success: false, error: e.message }
  }
})
ipcMain.handle('session:remove-attachment', (_, filePath) => {
  try { if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath) } catch {}
  return true
})
// Broader picker for session attachments — photos (incl. iPhone HEIC) and quick notes/docs
ipcMain.handle('attachment:pick', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Photos & Notes', extensions: ['jpg','jpeg','png','heic','gif','webp','txt','md','rtf','pdf'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  })
  return result.canceled ? [] : result.filePaths
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
