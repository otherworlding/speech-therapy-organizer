import React, { useState, useEffect, useRef, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import FileViewer from './FileViewer'
import { isExternalFile, externalLabel, youTubeId } from '../utils/fileTypes'
import SyncMergeModal, { isSyncPayload } from './SyncMergeModal'

// If exactly one .json file was dropped, check whether it's a recognized sync file —
// if so, hand it back so the caller can open the merge preview instead of importing it.
async function detectSyncFile(dropped) {
  if (dropped.length !== 1 || dropped[0].isDir) return null
  const p = dropped[0].path
  if (!p.toLowerCase().endsWith('.json')) return null
  try {
    const buf = await window.api.readFileBinary(p)
    const text = new TextDecoder().decode(new Uint8Array(buf))
    const parsed = JSON.parse(text)
    return isSyncPayload(parsed) ? parsed : null
  } catch { return null }
}

// First-page PDF thumbnails, rendered once and cached by file path.
// PDF rendering does real canvas decode/paint work — mounting dozens at once (e.g.
// importing a folder with hundreds of files) can stall the main thread on older/slower
// machines, so a small queue caps how many render concurrently regardless of how many
// PdfThumb components are mounted at once.
const pdfThumbCache = new Map()
const MAX_CONCURRENT_PDF_RENDERS = 2
let activePdfRenders = 0
const pdfRenderQueue = []
function runNextPdfRender() {
  if (activePdfRenders >= MAX_CONCURRENT_PDF_RENDERS || pdfRenderQueue.length === 0) return
  activePdfRenders++
  const job = pdfRenderQueue.shift()
  job().finally(() => { activePdfRenders--; runNextPdfRender() })
}
function queuePdfRender(job) {
  return new Promise((resolve, reject) => {
    pdfRenderQueue.push(() => job().then(resolve, reject))
    runNextPdfRender()
  })
}
function PdfThumb({ filePath }) {
  const [url, setUrl] = useState(() => pdfThumbCache.get(filePath) || null)
  useEffect(() => {
    if (url || !filePath || !window.api) return
    let cancelled = false
    queuePdfRender(async () => {
      if (cancelled) return
      try {
        const buf = await window.api.readFileBinary(filePath)
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise
        const page = await pdf.getPage(1)
        const base = page.getViewport({ scale: 1 })
        // Target ~220px wide so tiny or huge pages both thumbnail cleanly
        const scale = Math.min(220 / base.width, 1.5)
        const vp = page.getViewport({ scale })
        const w = Math.max(1, Math.round(vp.width)), h = Math.max(1, Math.round(vp.height))
        if (w < 8 || h < 8) return   // degenerate page — keep the 📄 icon
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
        if (!cancelled && dataUrl.startsWith('data:image')) { pdfThumbCache.set(filePath, dataUrl); setUrl(dataUrl) }
      } catch {}
    })
    return () => { cancelled = true }
  }, [filePath])
  return url
    ? <span className="fx-thumb"><img src={url} alt="" loading="lazy" decoding="async" /></span>
    : <span className="fx-icon">📄</span>
}

const FOLDER_COLORS = ['#4f8ef7', '#34c97a', '#f7a84f', '#c97adb', '#f75f9f', '#3ec9c9', '#8fd14f', '#e07c1a', '#888888']
const IMG_EXT = /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i
const FILE_ICONS = { pdf: '📄', pptx: '📊', ppt: '📊', docx: '📝', doc: '📝', mp4: '🎬', mov: '🎬', avi: '🎬', mp3: '🎵', wav: '🎵', m4a: '🎵' }
const isElectron = typeof window !== 'undefined' && window.api

const extOf = p => (p || '').split('.').pop().toLowerCase()
const stripExt = n => (n || '').replace(/\.[^.]+$/, '')

// Convert main-process folder tree → store.importTree shape
function shapeTree(node) {
  return {
    name: node.name,
    materials: (node.files || []).map(f => ({
      title: stripExt(f.filename), filePath: f.filePath,
      category: 'Language', tags: [], openExternal: isExternalFile(f.filename),
    })),
    folders: (node.folders || []).map(shapeTree),
  }
}

// Synchronously pull { isDir, path } for every dropped item BEFORE any await
function resolveDrop(e) {
  return Array.from(e.dataTransfer.items || []).map(item => {
    const entry = item.webkitGetAsEntry?.()
    const file = item.getAsFile?.()
    let p = null
    try { p = file ? window.api.getFilePath(file) : null } catch { p = null }
    return { isDir: entry ? !!entry.isDirectory : null, path: p }
  }).filter(d => d.path)
}

const KIND_BY_EXT = { pdf: 'PDF', jpg: 'Image', jpeg: 'Image', png: 'Image', gif: 'Image', bmp: 'Image', webp: 'Image', svg: 'Image', mp4: 'Video', mov: 'Video', avi: 'Video', webm: 'Video', mp3: 'Audio', wav: 'Audio', m4a: 'Audio', ogg: 'Audio', pptx: 'PowerPoint', ppt: 'PowerPoint', docx: 'Word', doc: 'Word', xlsx: 'Excel', xls: 'Excel' }
function kindLabel(m) {
  if (m.type === 'folder') return 'Folder'
  if (m.type === 'youtube') return 'YouTube video'
  if (m.type === 'html-game') return 'Interactive'
  if (m.type === 'image-deck') return 'Image set'
  return KIND_BY_EXT[extOf(m.filePath)] || (extOf(m.filePath) ? extOf(m.filePath).toUpperCase() : 'File')
}

// Render items in growing chunks instead of all at once — keeps a folder with
// hundreds of tiles smooth by only mounting thumbnails as the user scrolls near them.
// Kept small and with a tight lookahead margin so older/slower machines don't end up
// mounting (and thumbnail-rendering) far more tiles than are actually visible at once.
const CHUNK = 30
function useIncrementalRender(totalLength, resetKey) {
  const [count, setCount] = useState(CHUNK)
  const sentinelRef = useRef(null)
  useEffect(() => { setCount(CHUNK) }, [resetKey])
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setCount(c => Math.min(c + CHUNK, totalLength))
    }, { rootMargin: '200px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [totalLength])
  return { count, sentinelRef }
}

function thumbFor(m) {
  if (m.type === 'html-game') return { icon: '🎮' }
  if (m.type === 'folder') {
    const img = (m.items || []).find(i => IMG_EXT.test(i.filename))
    return img ? { img: img.filePath } : { icon: '📁' }
  }
  if (m.type === 'youtube') return { yt: m.videoId }
  if (m.type === 'image-deck' && m.imagePaths?.length) return { img: m.imagePaths[0] }
  if (m.filePath && IMG_EXT.test(m.filePath)) return { img: m.filePath }
  if (extOf(m.filePath) === 'pdf') return { pdf: m.filePath }
  return { icon: FILE_ICONS[extOf(m.filePath)] || '📎' }
}

// Which auto-sort system folder (if any) a flat imported file belongs in — only
// checked when autoSortByKind is on (the general Library only, never a client's
// Main Collection or a session, where organization is deliberate).
const SYSTEM_FOLDER_DEFS = {
  games: { label: 'Games (PowerPoint)', icon: '🎮', color: '#c97adb' },
  videos: { label: 'Videos', icon: '🎬', color: '#f75f9f' },
}
function autoSortKind(filename) {
  const ext = extOf(filename)
  if (ext === 'pptx' || ext === 'ppt') return 'games'
  if (['mp4', 'mov', 'avi', 'webm'].includes(ext)) return 'videos'
  return null
}

export default function FinderView({ store, scopeFolderId = null, excludeFolderId = null, rootLabel = '🏠 Library', autoSortByKind = false, client = null }) {
  // excludeFolderId may be a single id or an array of ids (e.g. In-Person + every
  // client's Main Collection folder, all kept out of the general Digital library).
  const excludeFolderIds = excludeFolderId == null ? null : (Array.isArray(excludeFolderId) ? excludeFolderId : [excludeFolderId])
  const [view, setView] = useState('icon')          // 'icon' | 'list'
  const [sortKey, setSortKey] = useState('name')     // name | added | kind | opened
  const [sortDir, setSortDir] = useState('asc')      // asc | desc
  const [path, setPath] = useState([])               // folder id stack
  const [selected, setSelected] = useState(new Set())// keys: 'm:<id>' | 'f:<id>'
  const [clipboard, setClipboard] = useState(null)   // { keys, mode:'move' }
  const [preview, setPreview] = useState(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [search, setSearch] = useState('')
  const [dragOverFolder, setDragOverFolder] = useState(null)
  const [rootDragOver, setRootDragOver] = useState(false)
  const [dragOverCrumb, setDragOverCrumb] = useState(null)   // null | 'root' | folder id — dragging up the breadcrumb trail moves items out of a folder
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(null) // { done, total, filename } | { current, of } for flat lists
  const [status, setStatus] = useState(null)         // last drop/import message
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [renaming, setRenaming] = useState(null)     // folder id
  const [inspectId, setInspectId] = useState(null)   // material id whose details panel is open
  const [linkOpen, setLinkOpen] = useState(false)    // YouTube-link modal
  const [smartView, setSmartView] = useState(null)   // 'recent' | 'pinned' | null
  const [syncDropData, setSyncDropData] = useState(null)  // a recognized sync file dropped onto the Library
  const [moveToOpen, setMoveToOpen] = useState(false) // "Move to…" picker for the current selection
  const rootRef = useRef(null)
  const anchorRef = useRef(null)          // last-clicked key, for Shift-range selection
  const visibleKeysRef = useRef([])       // ordered keys currently on screen
  const [marquee, setMarquee] = useState(null)   // rubber-band rectangle {left,top,w,h}
  const marqueeMoved = useRef(false)             // did the marquee actually drag?

  // Live progress from the main process during a folder-tree copy (genuinely non-blocking now)
  useEffect(() => {
    if (!isElectron || !window.api.onImportProgress) return
    return window.api.onImportProgress(({ done, total, filename }) => {
      setImportProgress({ done, total, filename })
    })
  }, [])

  const folders = store.folders || []
  const iconSize = store.settings?.iconSize || 'md'
  const rootId = scopeFolderId || null
  const currentFolderId = path.length ? path[path.length - 1] : rootId

  // Sort materials by the chosen Finder-style key
  const sortMaterials = (list) => {
    const dir = sortDir === 'asc' ? 1 : -1
    const arr = [...list]
    arr.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'name') cmp = (a.title || '').localeCompare(b.title || '')
      else if (sortKey === 'added') cmp = (a.createdAt || '').localeCompare(b.createdAt || '')
      else if (sortKey === 'opened') cmp = (a.lastOpened || 0) - (b.lastOpened || 0)
      else if (sortKey === 'kind') cmp = (extOf(a.filePath) || 'zzz').localeCompare(extOf(b.filePath) || 'zzz') || (a.title || '').localeCompare(b.title || '')
      return cmp * dir
    })
    return arr
  }
  // Walk a folder's parent chain (self included) — used to keep the Digital and
  // In-Person tabs from leaking into each other via search/recent/pinned, which
  // otherwise scan every material regardless of which folder subtree it's in.
  const chainToRoot = (folderId) => {
    const chain = []
    let cur = folderId
    while (cur) { chain.push(cur); cur = folders.find(f => f.id === cur)?.parentId || null }
    return chain
  }
  const inScope = (m) => {
    if (scopeFolderId) return chainToRoot(m.folderId || null).includes(scopeFolderId)
    if (excludeFolderIds) return !chainToRoot(m.folderId || null).some(id => excludeFolderIds.includes(id))
    return true
  }
  const scopedMaterials = store.materials.filter(inScope)
  const childFolders = pid => folders
    .filter(f => (f.parentId || null) === pid && !(pid === null && excludeFolderIds && excludeFolderIds.includes(f.id)))
    .sort((a, b) => a.name.localeCompare(b.name))
  const materialsIn = fid => sortMaterials(scopedMaterials.filter(m => (m.folderId || null) === fid))

  // Open a material for preview and remember when (for "recently opened" sort)
  const openPreview = (m) => { store.updateMaterial(m.id, { lastOpened: Date.now() }); setPreview(m) }

  const isDescendant = (candidate, ancestor) => {
    let cur = folders.find(f => f.id === candidate)
    while (cur) { if (cur.id === ancestor) return true; cur = folders.find(f => f.id === cur.parentId) }
    return false
  }

  // Get-or-create the top-level "Games (PowerPoint)" / "Videos" auto-sort folder.
  // Cached in a ref so a multi-file drop in one batch doesn't create it more than once
  // (store.folders won't reflect a just-created folder until the next render).
  const sysFolderCacheRef = useRef({})
  const ensureSystemFolder = (kind) => {
    if (sysFolderCacheRef.current[kind]) return sysFolderCacheRef.current[kind]
    const existing = (store.folders || []).find(f => f.systemFolder === kind && !f.parentId)
    if (existing) { sysFolderCacheRef.current[kind] = existing.id; return existing.id }
    const def = SYSTEM_FOLDER_DEFS[kind]
    const created = store.addFolder(def.label, def.color, null, { systemFolder: kind })
    sysFolderCacheRef.current[kind] = created.id
    return created.id
  }

  // Retroactive version of the same auto-sort — scans everything already in this
  // scope (any folder, not just loose root-level files) and files pptx/video/YouTube
  // items into Games/Videos. Only offered on the general Library (autoSortByKind),
  // and confirmed first since it can move things out of folders organized by hand.
  const materialAutoSortKind = (m) => {
    if (m.type === 'youtube') return 'videos'
    if (m.filePath) return autoSortKind(m.filePath)
    return null
  }
  const sortExistingByKind = () => {
    const matches = scopedMaterials.filter(m => {
      const kind = materialAutoSortKind(m)
      if (!kind) return false
      const currentFolder = folders.find(f => f.id === m.folderId)
      return currentFolder?.systemFolder !== kind
    })
    if (matches.length === 0) {
      setStatus('Nothing to sort — everything by kind is already filed.')
      setTimeout(() => setStatus(null), 3000)
      return
    }
    if (!window.confirm(`Move ${matches.length} item${matches.length > 1 ? 's' : ''} into Games/Videos by kind? This can move files out of folders you organized by hand.`)) return
    const byKind = { games: [], videos: [] }
    matches.forEach(m => byKind[materialAutoSortKind(m)].push(m.id))
    Object.entries(byKind).forEach(([kind, ids]) => { if (ids.length) store.moveMaterials(ids, ensureSystemFolder(kind)) })
    setStatus(`✓ Sorted ${matches.length} item${matches.length > 1 ? 's' : ''} by kind`)
    setTimeout(() => setStatus(null), 4000)
  }

  // ── Import (files + recursive folders), no tagging gate ──
  const importDropped = useCallback(async (dropped, targetFolderId) => {
    if (!dropped.length) { setStatus('⚠ Drop produced no readable file paths.'); return }
    // A recognized sync file gets routed to the merge preview instead of being imported as a material
    const syncPayload = await detectSyncFile(dropped)
    if (syncPayload) { setSyncDropData(syncPayload); return }
    setImporting(true)
    setImportProgress(null)
    let files = 0, trees = 0
    for (let i = 0; i < dropped.length; i++) {
      let { isDir, path: p } = dropped[i]
      if (isDir === null) { try { isDir = await window.api.isDirectory(p) } catch { isDir = false } }
      if (isDir) {
        const res = await window.api.importFolderTree(p)   // main process streams live progress via onImportProgress
        if (res?.success) { store.importTree(shapeTree(res.tree), targetFolderId); trees++ }
        else setStatus(`⚠ Could not import folder: ${res?.error || 'unknown error'}`)
      } else {
        setImportProgress({ current: i + 1, of: dropped.length, filename: p.split('/').pop() })
        const dest = await window.api.copyToLibrary(p)
        const kind = autoSortByKind ? autoSortKind(p) : null
        store.addMaterial({
          title: stripExt(p.split('/').pop()), filePath: dest, folderId: kind ? ensureSystemFolder(kind) : targetFolderId,
          category: 'Language', tags: [], openExternal: isExternalFile(p),
        })
        files++
      }
    }
    setImporting(false)
    setImportProgress(null)
    setStatus(`✓ Imported ${files ? `${files} file${files>1?'s':''}` : ''}${files&&trees?' · ':''}${trees ? `${trees} folder${trees>1?'s':''}` : ''}`.trim())
    setTimeout(() => setStatus(null), 4000)
  }, [store])

  // ── Picker imports (into current folder) ──
  const pickFiles = async () => {
    if (!isElectron) return
    const paths = await window.api.pickFiles()
    await importDropped(paths.map(p => ({ isDir: false, path: p })), currentFolderId)
  }
  const pickFolders = async () => {
    if (!isElectron) return
    const paths = await window.api.pickFolder()
    await importDropped(paths.map(p => ({ isDir: true, path: p })), currentFolderId)
  }

  // ── Selection (click = one · Cmd-click = toggle · Shift-click = range) ──
  const toggleSelect = (e, key) => {
    const ordered = visibleKeysRef.current
    if (e.shiftKey && anchorRef.current && ordered.includes(anchorRef.current) && ordered.includes(key)) {
      const a = ordered.indexOf(anchorRef.current), b = ordered.indexOf(key)
      const [lo, hi] = a < b ? [a, b] : [b, a]
      const range = ordered.slice(lo, hi + 1)
      setSelected(prev => new Set([...((e.metaKey || e.ctrlKey) ? prev : []), ...range]))
      return
    }
    if (e.metaKey || e.ctrlKey) {
      setSelected(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next })
    } else {
      setSelected(new Set([key]))
    }
    anchorRef.current = key
  }
  const clearSelect = () => setSelected(new Set())

  // Marquee (rubber-band) selection — click empty space and drag a box over items, like Finder
  const onBodyMouseDown = (e) => {
    if (e.button !== 0 || !rootRef.current) return
    if (e.target.closest('.fx-item') || e.target.closest('button, input, select, a')) return
    const additive = e.metaKey || e.ctrlKey || e.shiftKey
    const baseSel = additive ? new Set(selected) : new Set()
    if (!additive) setSelected(new Set())
    const startX = e.clientX, startY = e.clientY
    marqueeMoved.current = false

    const onMove = (me) => {
      const x = Math.min(startX, me.clientX), y = Math.min(startY, me.clientY)
      const w = Math.abs(me.clientX - startX), h = Math.abs(me.clientY - startY)
      if (w + h > 4) marqueeMoved.current = true
      const bodyRect = rootRef.current.getBoundingClientRect()
      setMarquee({ left: x - bodyRect.left, top: y - bodyRect.top, w, h })
      const box = { left: x, top: y, right: x + w, bottom: y + h }
      const hits = new Set(baseSel)
      rootRef.current.querySelectorAll('.fx-item').forEach(el => {
        const r = el.getBoundingClientRect()
        const hit = !(r.right < box.left || r.left > box.right || r.bottom < box.top || r.top > box.bottom)
        if (hit && el.dataset.key) hits.add(el.dataset.key)
      })
      setSelected(hits)
    }
    const onUp = () => {
      setMarquee(null)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }
  // Only clear on a genuine empty click (not the tail of a marquee drag)
  const onBodyClick = (e) => {
    if (marqueeMoved.current) { marqueeMoved.current = false; return }
    if (!e.target.closest('.fx-item') && !e.target.closest('button')) clearSelect()
  }

  const deleteKeys = (keys) => {
    const n = keys.length
    if (!n) return
    const hasFolder = keys.some(k => k.startsWith('f:'))
    if (window.confirm(`Delete ${n} item${n > 1 ? 's' : ''}?${hasFolder ? ' Folders remove everything inside them.' : ''}`)) {
      keys.forEach(k => k.startsWith('m:') ? store.deleteMaterial(k.slice(2)) : store.deleteFolder(k.slice(2)))
      clearSelect()
    }
  }
  const deleteSelected = () => deleteKeys([...selected])

  // ── Move selected (or a dragged key set) into a folder ──
  const moveInto = (keys, folderId) => {
    const matIds = keys.filter(k => k.startsWith('m:')).map(k => k.slice(2))
    const folderIds = keys.filter(k => k.startsWith('f:')).map(k => k.slice(2))
    if (matIds.length) store.moveMaterials(matIds, folderId)
    folderIds.forEach(fid => {
      if (fid !== folderId && !isDescendant(folderId, fid)) store.updateFolder(fid, { parentId: folderId })
    })
  }

  // ── Keyboard: copy / paste (move) / delete ──
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key === 'c' && selected.size) { setClipboard({ keys: [...selected] }); setStatus(`Copied ${selected.size} item${selected.size>1?'s':''} — ⌘V to paste into a folder`); e.preventDefault() }
      else if (mod && e.key === 'v' && clipboard?.keys?.length) { moveInto(clipboard.keys, currentFolderId); setStatus(`Pasted ${clipboard.keys.length} item${clipboard.keys.length>1?'s':''} here`); setTimeout(()=>setStatus(null),3000); e.preventDefault() }
      else if ((e.key === 'Backspace' || e.key === 'Delete') && selected.size) {
        deleteSelected(); e.preventDefault()
      } else if (e.key === 'Escape') { clearSelect() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, clipboard, currentFolderId])

  // ── Drag handlers ──
  const onItemDragStart = (e, key) => {
    // If dragging an unselected item, select just it
    const keys = selected.has(key) ? [...selected] : [key]
    if (!selected.has(key)) setSelected(new Set([key]))
    e.dataTransfer.setData('text/finder-keys', JSON.stringify(keys))
    e.dataTransfer.effectAllowed = 'move'
    // Also start a real OS-level file drag (additive — the HTML5 drag above still
    // powers in-app drop targets) so dropping onto WhatsApp/Mail/Finder/etc. sends
    // the actual file instead of a screenshot of the tile.
    if (window.api?.startNativeDrag) {
      const paths = keys.filter(k => k.startsWith('m:'))
        .map(k => store.materials.find(m => m.id === k.slice(2)))
        .filter(m => m?.filePath)
        .map(m => m.filePath)
      if (paths.length) window.api.startNativeDrag(paths)
    }
  }
  const onFolderDrop = async (e, folder) => {
    e.preventDefault(); e.stopPropagation(); setDragOverFolder(null); setRootDragOver(false)
    const internal = e.dataTransfer.getData('text/finder-keys')
    if (internal) { moveInto(JSON.parse(internal), folder.id); return }
    await importDropped(resolveDrop(e), folder.id)   // OS files onto a folder
  }
  const onRootDrop = async (e) => {
    e.preventDefault(); setRootDragOver(false)
    const internal = e.dataTransfer.getData('text/finder-keys')
    if (internal) { moveInto(JSON.parse(internal), currentFolderId); return }
    await importDropped(resolveDrop(e), currentFolderId)  // OS files into current location
  }
  // Dropping onto a breadcrumb segment moves the dragged item(s) up to that level —
  // the only way to get something back out of a folder without the hidden ⌘C/⌘V trick.
  const onCrumbDrop = (e, targetFolderId) => {
    e.preventDefault(); e.stopPropagation(); setDragOverCrumb(null)
    const internal = e.dataTransfer.getData('text/finder-keys')
    if (internal) moveInto(JSON.parse(internal), targetFolderId)
  }

  // ── Search (flat, across this tab's scope only) ──
  const q = search.trim().toLowerCase()
  const searchHits = q ? sortMaterials(scopedMaterials.filter(m =>
    m.title?.toLowerCase().includes(q) || m.category?.toLowerCase().includes(q) || (m.tags||[]).some(t => t.toLowerCase().includes(q)) ||
    kindLabel(m).toLowerCase().includes(q)
  )) : null

  const hereFolders = childFolders(currentFolderId)
  const hereMaterials = materialsIn(currentFolderId)
  // Flag same-named materials sitting in the same folder — easy to end up with
  // accidental duplicates when dragging things in from multiple places.
  const duplicateTitles = (() => {
    const counts = new Map()
    for (const m of hereMaterials) {
      const key = (m.title || '').trim().toLowerCase()
      if (!key) continue
      counts.set(key, (counts.get(key) || 0) + 1)
    }
    return new Set([...counts].filter(([, n]) => n > 1).map(([k]) => k))
  })()
  // Details/tagging panel is opened explicitly via the ⓘ button — NOT on selection,
  // so selecting/dragging a material never gets blocked by the panel.
  const inspectMaterial = inspectId ? store.materials.find(m => m.id === inspectId) : null

  // Recent / Pinned quick-access — flat lists spanning every folder within this tab's scope
  const smartMaterials = smartView === 'recent'
    ? sortMaterials(scopedMaterials.filter(m => m.lastOpened)).sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0)).slice(0, 200)
    : smartView === 'pinned'
      ? sortMaterials(scopedMaterials.filter(m => m.pinned))
      : null

  // Unified ordered list (folders first, like Finder) — drives both selection order and rendering
  const orderedItems = searchHits
    ? searchHits.map(m => ({ type: 'material', obj: m }))
    : smartMaterials
      ? smartMaterials.map(m => ({ type: 'material', obj: m }))
      : [...hereFolders.map(f => ({ type: 'folder', obj: f })), ...hereMaterials.map(m => ({ type: 'material', obj: m }))]

  // Ordered list of on-screen keys, used for Shift-click range selection (full logical order, not just rendered)
  visibleKeysRef.current = orderedItems.map(it => (it.type === 'folder' ? 'f:' : 'm:') + it.obj.id)

  // Render in growing chunks so a folder/Recent/Pinned list with hundreds of items stays smooth
  const resetKey = `${currentFolderId}|${search}|${smartView}|${sortKey}|${sortDir}`
  const { count: renderCount, sentinelRef } = useIncrementalRender(orderedItems.length, resetKey)
  const visibleItems = orderedItems.slice(0, renderCount)

  // ── Renderers for a folder + a material (shared by icon & list) ──
  const folderNode = (f) => {
    const key = 'f:' + f.id
    const count = materialsIn(f.id).length + childFolders(f.id).length
    const sel = selected.has(key)
    return (
      <div key={key} draggable data-key={key}
        className={`fx-item fx-folder ${view} ${sel ? 'sel' : ''} ${dragOverFolder === f.id ? 'drop-target' : ''}`}
        onClick={e => { e.stopPropagation(); toggleSelect(e, key) }}
        onDoubleClick={() => { clearSelect(); setSmartView(null); setPath(p => [...p, f.id]) }}
        onDragStart={e => onItemDragStart(e, key)}
        onDragOver={e => { e.preventDefault(); setDragOverFolder(f.id) }}
        onDragLeave={() => setDragOverFolder(d => d === f.id ? null : d)}
        onDrop={e => onFolderDrop(e, f)}>
        <button className="fx-del-x" title="Delete folder" onClick={e => { e.stopPropagation(); deleteKeys([key]) }}>🗑</button>
        <span className="fx-icon" style={{ color: f.color }}>{SYSTEM_FOLDER_DEFS[f.systemFolder]?.icon || (f.mainCollection ? '🗂' : '📁')}</span>
        {renaming === f.id
          ? <input className="fx-rename" autoFocus defaultValue={f.name}
              onClick={e => e.stopPropagation()}
              onBlur={e => { store.updateFolder(f.id, { name: e.target.value.trim() || f.name }); setRenaming(null) }}
              onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }} />
          : <span className="fx-name" onDoubleClick={e => { e.stopPropagation(); setRenaming(f.id) }}>{f.name}</span>}
        <span className="fx-sub">{view === 'list' ? `Folder · ${count}` : `${count} item${count !== 1 ? 's' : ''}`}</span>
      </div>
    )
  }

  const materialNode = (m) => {
    const key = 'm:' + m.id
    const sel = selected.has(key)
    const t = thumbFor(m)
    const isDup = duplicateTitles.has((m.title || '').trim().toLowerCase())
    return (
      <div key={key} draggable data-key={key}
        className={`fx-item fx-material ${view} ${sel ? 'sel' : ''}`}
        onClick={e => { e.stopPropagation(); toggleSelect(e, key) }}
        onDoubleClick={() => openPreview(m)}
        onDragStart={e => onItemDragStart(e, key)}>
        {m.colorLabel && <span className="fx-color-dot" style={{ background: m.colorLabel }} />}
        <button className={`fx-pin ${m.pinned ? 'active' : ''}`} title={m.pinned ? 'Unpin' : 'Pin for quick access'}
          onClick={e => { e.stopPropagation(); store.updateMaterial(m.id, { pinned: !m.pinned }) }}>📌</button>
        <button className="fx-info-i" title="Details & tags" onClick={e => { e.stopPropagation(); setInspectId(m.id) }}>ⓘ</button>
        <button className="fx-del-x" title="Delete" onClick={e => { e.stopPropagation(); deleteKeys([key]) }}>🗑</button>
        {t.yt
          ? <span className="fx-thumb fx-yt-thumb"><img src={`https://img.youtube.com/vi/${t.yt}/hqdefault.jpg`} alt="" onError={e => { e.target.style.display = 'none' }} /><span className="fx-yt-play">▶</span></span>
          : t.pdf
            ? <PdfThumb filePath={t.pdf} />
            : t.img
              ? <span className="fx-thumb"><img src={`file://${t.img}`} alt="" loading="lazy" decoding="async" /></span>
              : <span className="fx-icon">{t.icon}</span>}
        <span className={`fx-name ${isDup ? 'fx-name-dup' : ''}`} title={isDup ? `⚠ Another item in this folder is also named “${m.title}”` : undefined}>
          {isDup && <span className="fx-dup-badge">⚠</span>}{m.title}
        </span>
        <span className="fx-sub">
          {view === 'list'
            ? kindLabel(m)
            : (m.openExternal ? `↗ ${externalLabel(m.filePath)}` : [m.category, ...(m.tags||[])].filter(Boolean).slice(0,2).join(' · '))}
        </span>
      </div>
    )
  }

  return (
    <div className="finder">
      {/* Toolbar */}
      <div className="fx-toolbar">
        <div className="fx-crumbs">
          {(path.length > 0 || smartView) && (
            <button className="fx-back-btn" title="Back" onClick={() => {
              if (smartView) { setSmartView(null) } else { setPath(p => p.slice(0, -1)) }
            }}>← Back</button>
          )}
          <button className={`fx-crumb ${dragOverCrumb === 'root' ? 'drop-target' : ''}`}
            onClick={() => { setPath([]); setSearch(''); setSmartView(null) }}
            onDragOver={e => { e.preventDefault(); if (path.length) setDragOverCrumb('root') }}
            onDragLeave={() => setDragOverCrumb(d => d === 'root' ? null : d)}
            onDrop={e => onCrumbDrop(e, rootId)}>{rootLabel}</button>
          {smartView === 'recent' && <><span className="fx-crumb-sep">›</span><span className="fx-crumb crumb-current">🕘 Recent</span></>}
          {smartView === 'pinned' && <><span className="fx-crumb-sep">›</span><span className="fx-crumb crumb-current">📌 Pinned</span></>}
          {!smartView && path.map((fid, i) => {
            const f = folders.find(x => x.id === fid)
            const isLast = i === path.length - 1
            return <React.Fragment key={fid}><span className="fx-crumb-sep">›</span>
              <button className={`fx-crumb ${dragOverCrumb === fid ? 'drop-target' : ''}`}
                onClick={() => setPath(p => p.slice(0, i + 1))}
                onDragOver={e => { e.preventDefault(); if (!isLast) setDragOverCrumb(fid) }}
                onDragLeave={() => setDragOverCrumb(d => d === fid ? null : d)}
                onDrop={e => onCrumbDrop(e, fid)}>
                <span className="fx-crumb-dot" style={{ background: f?.color }} />{f?.name || '?'}</button></React.Fragment>
          })}
        </div>
        <div className="fx-toolbar-right">
          <input className="fx-search" placeholder="🔍 Search all materials…" value={search} onChange={e => setSearch(e.target.value)} />
          <div className="fx-quickseg">
            <button className={smartView === 'recent' ? 'active' : ''} onClick={() => { setPath([]); setSmartView(v => v === 'recent' ? null : 'recent') }}>🕘 Recent</button>
            <button className={smartView === 'pinned' ? 'active' : ''} onClick={() => { setPath([]); setSmartView(v => v === 'pinned' ? null : 'pinned') }}>📌 Pinned</button>
          </div>
          {/* Kind quick filters — reuse the search box (kindLabel is matched above), so this
              is just a shortcut into the same search rather than a separate filter system. */}
          <div className="fx-quickseg">
            {[['powerpoint', '🎮 Games'], ['video', '🎬 Videos'], ['pdf', '📄 PDFs'], ['image', '🖼 Images']].map(([kw, label]) => (
              <button key={kw} className={q === kw ? 'active' : ''}
                onClick={() => setSearch(s => s.trim().toLowerCase() === kw ? '' : kw)}>{label}</button>
            ))}
          </div>
          <div className="fx-sort">
            <select value={sortKey} onChange={e => { const k = e.target.value; setSortKey(k); setSortDir(k === 'added' || k === 'opened' ? 'desc' : 'asc') }} title="Sort by">
              <option value="name">Name</option>
              <option value="added">Date Added</option>
              <option value="opened">Recently Opened</option>
              <option value="kind">Kind</option>
            </select>
            <button className="fx-sort-dir" onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
              title={sortDir === 'asc' ? 'Ascending' : 'Descending'}>{sortDir === 'asc' ? '↑' : '↓'}</button>
          </div>
          <div className="fx-viewseg">
            <button className={view === 'icon' ? 'active' : ''} onClick={() => setView('icon')} title="Icon view">▦</button>
            <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')} title="List view">☰</button>
          </div>
          {view === 'icon' && (
            <div className="fx-viewseg" title="Icon size — same setting everywhere in the app">
              {[['sm', 'S'], ['md', 'M'], ['lg', 'L']].map(([sz, label]) => (
                <button key={sz} className={iconSize === sz ? 'active' : ''} onClick={() => store.updateSettings({ iconSize: sz })}>{label}</button>
              ))}
            </div>
          )}
          <button className="btn-secondary fx-newfolder" onClick={() => setNewFolderOpen(true)}>＋ Folder</button>
          <button className="btn-secondary" onClick={pickFiles} disabled={importing}>📥 Files</button>
          <button className="btn-secondary" onClick={pickFolders} disabled={importing}>🗂 Folder</button>
          <button className="btn-secondary" onClick={() => setLinkOpen(true)}>🔗 Link</button>
          {autoSortByKind && <button className="btn-secondary" onClick={sortExistingByKind} title="Retroactively move existing PowerPoint/video/YouTube items into Games/Videos">🧹 Sort existing</button>}
        </div>
      </div>

      {status && <div className="fx-status">{status}</div>}

      {/* Selection action bar */}
      {selected.size > 0 && (
        <div className="fx-selbar">
          <span className="fx-selbar-count">{selected.size} selected</span>
          <div className="fx-selbar-actions">
            <button className="btn-secondary" onClick={() => setMoveToOpen(true)}>📁 Move to…</button>
            <button className="btn-danger fx-del-btn" onClick={deleteSelected}>🗑 Delete</button>
            <button className="btn-secondary" onClick={clearSelect}>Deselect</button>
          </div>
        </div>
      )}

      {/* Content area — the whole thing is a drop target */}
      <div ref={rootRef}
        className={`fx-body ${view} ${rootDragOver ? 'root-drop' : ''} ${importing ? 'importing' : ''}`}
        onMouseDown={onBodyMouseDown}
        onClick={onBodyClick}
        onDragOver={e => { e.preventDefault(); if (!e.dataTransfer.getData('text/finder-keys')) setRootDragOver(true) }}
        onDragLeave={e => { if (!rootRef.current?.contains(e.relatedTarget)) setRootDragOver(false) }}
        onDrop={onRootDrop}>

        {marquee && <div className="fx-marquee" style={{ left: marquee.left, top: marquee.top, width: marquee.w, height: marquee.h }} />}
        {importing && (
          <div className="fx-importing-badge">
            {importProgress ? (
              <>
                <div className="fx-import-text">
                  ⏳ Importing {importProgress.filename ? `“${importProgress.filename}”` : '…'}
                  {' '}{(importProgress.done ?? importProgress.current) || 0} / {(importProgress.total ?? importProgress.of) || '?'}
                </div>
                <div className="fx-import-bar-bg">
                  <div className="fx-import-bar-fill" style={{
                    width: `${Math.min(100, Math.round((((importProgress.done ?? importProgress.current) || 0) / Math.max(1, (importProgress.total ?? importProgress.of) || 1)) * 100))}%`
                  }} />
                </div>
              </>
            ) : <div className="fx-import-text">⏳ Importing…</div>}
          </div>
        )}

        {searchHits && <div className="fx-section">{searchHits.length} result{searchHits.length!==1?'s':''} for “{search.trim()}”</div>}
        {smartMaterials && !searchHits && (
          <div className="fx-section">{smartView === 'recent' ? '🕘 Recently opened' : '📌 Pinned'} — {smartMaterials.length} item{smartMaterials.length !== 1 ? 's' : ''}</div>
        )}

        <div className={`fx-grid ${view} size-${iconSize}`}>
          {view === 'list' && (
            <div className="fx-list-head"><span></span><span>Name</span><span>Kind</span></div>
          )}
          {visibleItems.map(it => it.type === 'folder' ? folderNode(it.obj) : materialNode(it.obj))}
          {orderedItems.length === 0 && !searchHits && !smartMaterials && (
            <div className="fx-empty">
              <div className="fx-empty-icon">📂</div>
              <p>Drop files or folders here from your computer.<br/>Folders keep their structure. No tagging required.</p>
            </div>
          )}
          {smartMaterials?.length === 0 && (
            <div className="fx-empty">
              <div className="fx-empty-icon">{smartView === 'recent' ? '🕘' : '📌'}</div>
              <p>{smartView === 'recent' ? 'Nothing opened yet — preview a material and it will show up here.' : 'Nothing pinned yet — click 📌 on a tile to pin it here.'}</p>
            </div>
          )}
        </div>
        {renderCount < orderedItems.length && (
          <div ref={sentinelRef} className="fx-loadmore">Loading more…</div>
        )}
      </div>

      {/* Selected inspector (optional tagging/labels/assign) */}
      {inspectMaterial && (
        <MaterialInspector key={inspectMaterial.id} material={inspectMaterial} store={store} onClose={() => setInspectId(null)} />
      )}

      {/* Move to… picker — spans the whole tree, not just this scope, so a material can
          jump straight from the Library into a client's Main Collection (or back) without
          switching tabs or relying on drag-and-drop. */}
      {moveToOpen && (
        <MoveToModal
          store={store}
          client={client}
          selectedKeys={[...selected]}
          rootLabel={rootLabel}
          onMove={(folderId) => {
            moveInto([...selected], folderId)
            setMoveToOpen(false)
            setStatus(`✓ Moved ${selected.size} item${selected.size > 1 ? 's' : ''}`)
            setTimeout(() => setStatus(null), 3000)
          }}
          onQuickAssign={(kind, matIds) => {
            if (kind === 'session') store.assignMaterials(client.id, matIds)
            else store.assignHomework(client.id, matIds)
            setMoveToOpen(false)
            setStatus(`✓ Added ${matIds.length} item${matIds.length > 1 ? 's' : ''} to ${kind === 'session' ? "this week's session" : 'homework'}`)
            setTimeout(() => setStatus(null), 3000)
          }}
          onCancel={() => setMoveToOpen(false)}
        />
      )}

      {/* New folder modal */}
      {newFolderOpen && (
        <FolderModal onSave={(name, color) => { store.addFolder(name, color, currentFolderId); setNewFolderOpen(false) }} onCancel={() => setNewFolderOpen(false)} />
      )}

      {/* YouTube link modal */}
      {linkOpen && (
        <LinkModal onSave={({ title, url, videoId }) => {
          const folderId = autoSortByKind ? ensureSystemFolder('videos') : currentFolderId
          store.addMaterial({ type: 'youtube', title, url, videoId, folderId, category: 'Language', tags: [] })
          setLinkOpen(false)
        }} onCancel={() => setLinkOpen(false)} />
      )}

      {/* Recognized sync file dropped onto the Library */}
      {syncDropData && (
        <SyncMergeModal store={store} remoteData={syncDropData}
          onClose={(applied) => { setSyncDropData(null); setStatus(applied ? '✓ Merged from dropped sync file' : null); if (applied) setTimeout(() => setStatus(null), 4000) }} />
      )}

      {/* Preview */}
      {preview && (
        <div className="browse-preview-backdrop" onClick={() => { setPreview(null); setFullscreen(false) }}>
          <div className={`browse-preview ${fullscreen ? 'fullscreen' : ''}`} onClick={e => e.stopPropagation()}>
            <FileViewer material={preview} isFullscreen={fullscreen} onToggleFullscreen={() => setFullscreen(f => !f)}
              store={store} onConverted={() => { setPreview(null); setFullscreen(false) }} />
            <button className="browse-preview-close" onClick={() => { setPreview(null); setFullscreen(false) }}>✕</button>
          </div>
        </div>
      )}
    </div>
  )
}

// Build a readable path for a folder — e.g. "🗂 Emma — Main Collection / Artic Games"
// or "📁 Library / Winter Unit" — so the flat picker below reads like a location, not
// just a bare folder name (several clients can each have a "Games" folder).
function folderPathLabel(f, folders, clients) {
  const chain = []
  let cur = f
  while (cur) { chain.unshift(cur); cur = folders.find(x => x.id === cur.parentId) || null }
  const top = chain[0]
  const prefix = top.mainCollection && top.clientId
    ? `🗂 ${clients.find(c => c.id === top.clientId)?.name || 'Client'} — Main Collection`
    : `📁 ${top.name}`
  const rest = chain.slice(1).map(x => x.name)
  return [prefix, ...rest].join(' / ')
}

// Flat, searchable "Move to…" picker spanning every folder in the app (Library +
// every client's Main Collection) — replaces having to drag an item across tabs or
// remember the ⌘C/⌘V trick to relocate something.
function MoveToModal({ store, client, selectedKeys, rootLabel, onMove, onQuickAssign, onCancel }) {
  const [q, setQ] = useState('')
  const folders = store.folders || []
  const clients = store.clients || []
  const materialIds = selectedKeys.filter(k => k.startsWith('m:')).map(k => k.slice(2))
  const draggedFolderIds = selectedKeys.filter(k => k.startsWith('f:')).map(k => k.slice(2))
  const isDescendant = (candidateId, ancestorId) => {
    let cur = folders.find(f => f.id === candidateId)
    while (cur) { if (cur.id === ancestorId) return true; cur = folders.find(f => f.id === cur.parentId) }
    return false
  }
  // A folder can't be moved into itself or into its own descendant
  const blocked = (fid) => draggedFolderIds.some(dfid => fid === dfid || isDescendant(fid, dfid))

  const options = folders
    .filter(f => !blocked(f.id))
    .map(f => ({ id: f.id, label: folderPathLabel(f, folders, clients) }))
    .sort((a, b) => a.label.localeCompare(b.label))
  const query = q.trim().toLowerCase()
  const visible = query ? options.filter(o => o.label.toLowerCase().includes(query)) : options

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>📁 Move to…</h2>
        {/* Quickest, most-likely destinations first — this week's session and homework
            for the client this material belongs to (only offered where we know which
            client that is, and only for materials, not folders). */}
        {client && materialIds.length > 0 && (
          <div className="move-list move-list-quick">
            <button className="move-item quick" onClick={() => onQuickAssign('session', materialIds)}>▶️ {client.name} — This Week's Session</button>
            <button className="move-item quick" onClick={() => onQuickAssign('homework', materialIds)}>📋 {client.name} — This Week's Homework</button>
          </div>
        )}
        <input className="fx-search" autoFocus style={{ width: '100%', margin: '10px 0' }}
          placeholder="Search folders…" value={q} onChange={e => setQ(e.target.value)} />
        <div className="move-list">
          <button className="move-item" onClick={() => onMove(null)}>{rootLabel || '🏠 Library (root)'}</button>
          {visible.map(o => (
            <button key={o.id} className="move-item" onClick={() => onMove(o.id)}>{o.label}</button>
          ))}
          {visible.length === 0 && query && <div className="settings-note" style={{ padding: '8px 4px' }}>No folders match “{q}”.</div>}
        </div>
        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function LinkModal({ onSave, onCancel }) {
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const videoId = youTubeId(url)
  const valid = !!videoId
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>🔗 Add YouTube Link</h2>
        <p className="settings-note" style={{ marginBottom: 12 }}>Paste a YouTube link. It plays inside the app during sessions (streams — needs internet).</p>
        <form onSubmit={e => { e.preventDefault(); if (valid) onSave({ title: title.trim() || 'YouTube Video', url: url.trim(), videoId }) }}>
          <label>YouTube URL *
            <input autoFocus value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" />
          </label>
          {url && !valid && <div className="wizard-error">⚠ That doesn't look like a YouTube link.</div>}
          {valid && <img className="link-preview" src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`} alt="" onError={e => { e.target.style.display = 'none' }} />}
          <label>Title
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Wheels on the Bus" />
          </label>
          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={!valid}>Add</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function FolderModal({ initial, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || '')
  const [color, setColor] = useState(initial?.color || FOLDER_COLORS[0])
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>{initial ? 'Edit Folder' : 'New Folder'}</h2>
        <form onSubmit={e => { e.preventDefault(); if (name.trim()) onSave(name.trim(), color) }}>
          <label>Name *<input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Articulation Games" /></label>
          <label>Color</label>
          <div className="color-swatches">
            {FOLDER_COLORS.map(c => <button key={c} type="button" className={`color-swatch ${c === color ? 'selected' : ''}`} style={{ background: c }} onClick={() => setColor(c)} />)}
          </div>
          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
            <button type="submit" className="btn-primary">{initial ? 'Save' : 'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Lightweight optional tagging / labels / assignment for one material
function MaterialInspector({ material, store, onClose }) {
  const [tags, setTags] = useState((material.tags || []).join(', '))
  const [title, setTitle] = useState(material.title)
  const save = () => store.updateMaterial(material.id, { title: title.trim() || material.title, tags: tags.split(',').map(t => t.trim()).filter(Boolean) })
  return (
    <div className="fx-inspector">
      <div className="fx-inspector-head">
        <strong>Details</strong>
        <button className="fx-insp-close" onClick={onClose}>✕</button>
      </div>
      <label>Title<input value={title} onChange={e => setTitle(e.target.value)} onBlur={save} /></label>
      <label>Tags (optional)<input value={tags} onChange={e => setTags(e.target.value)} onBlur={save} placeholder="vocabulary, /r/, ages 4-6" /></label>
      <label>Color label</label>
      <div className="color-swatches">
        <button className={`color-swatch swatch-none ${!material.colorLabel ? 'selected' : ''}`} onClick={() => store.updateMaterial(material.id, { colorLabel: null })}>✕</button>
        {FOLDER_COLORS.map(c => <button key={c} className={`color-swatch ${material.colorLabel === c ? 'selected' : ''}`} style={{ background: c }} onClick={() => store.updateMaterial(material.id, { colorLabel: c })} />)}
      </div>
      <label>Assign to client</label>
      <select defaultValue="" onChange={e => { if (e.target.value) { store.assignMaterials(e.target.value, [material.id]); e.target.value = '' } }}>
        <option value="">Choose client…</option>
        {store.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <button className="btn-danger fx-insp-delete" onClick={() => { if (window.confirm(`Delete “${material.title}”?`)) { store.deleteMaterial(material.id); onClose() } }}>🗑 Delete material</button>
    </div>
  )
}
