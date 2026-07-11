import React, { useState, useEffect, useRef, useCallback } from 'react'
import FileViewer from './FileViewer'
import { isExternalFile, externalLabel } from '../utils/fileTypes'

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

function thumbFor(m) {
  if (m.type === 'html-game') return { icon: '🎮' }
  if (m.type === 'folder') {
    const img = (m.items || []).find(i => IMG_EXT.test(i.filename))
    return img ? { img: img.filePath } : { icon: '📁' }
  }
  if (m.type === 'image-deck' && m.imagePaths?.length) return { img: m.imagePaths[0] }
  if (m.filePath && IMG_EXT.test(m.filePath)) return { img: m.filePath }
  return { icon: FILE_ICONS[extOf(m.filePath)] || '📎' }
}

export default function FinderView({ store }) {
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
  const [importing, setImporting] = useState(false)
  const [status, setStatus] = useState(null)         // last drop/import message
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [renaming, setRenaming] = useState(null)     // folder id
  const rootRef = useRef(null)

  const folders = store.folders || []
  const currentFolderId = path.length ? path[path.length - 1] : null

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
  const childFolders = pid => folders.filter(f => (f.parentId || null) === pid).sort((a, b) => a.name.localeCompare(b.name))
  const materialsIn = fid => sortMaterials(store.materials.filter(m => (m.folderId || null) === fid))

  // Open a material for preview and remember when (for "recently opened" sort)
  const openPreview = (m) => { store.updateMaterial(m.id, { lastOpened: Date.now() }); setPreview(m) }

  const isDescendant = (candidate, ancestor) => {
    let cur = folders.find(f => f.id === candidate)
    while (cur) { if (cur.id === ancestor) return true; cur = folders.find(f => f.id === cur.parentId) }
    return false
  }

  // ── Import (files + recursive folders), no tagging gate ──
  const importDropped = useCallback(async (dropped, targetFolderId) => {
    if (!dropped.length) { setStatus('⚠ Drop produced no readable file paths.'); return }
    setImporting(true)
    let files = 0, trees = 0
    for (let { isDir, path: p } of dropped) {
      if (isDir === null) { try { isDir = await window.api.isDirectory(p) } catch { isDir = false } }
      if (isDir) {
        const res = await window.api.importFolderTree(p)
        if (res?.success) { store.importTree(shapeTree(res.tree), targetFolderId); trees++ }
        else setStatus(`⚠ Could not import folder: ${res?.error || 'unknown error'}`)
      } else {
        const dest = await window.api.copyToLibrary(p)
        store.addMaterial({
          title: stripExt(p.split('/').pop()), filePath: dest, folderId: targetFolderId,
          category: 'Language', tags: [], openExternal: isExternalFile(p),
        })
        files++
      }
    }
    setImporting(false)
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

  // ── Selection ──
  const toggleSelect = (e, key) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (e.metaKey || e.ctrlKey) { next.has(key) ? next.delete(key) : next.add(key) }
      else { next.clear(); next.add(key) }
      return next
    })
  }
  const clearSelect = () => setSelected(new Set())

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

  // ── Search (flat, across everything) ──
  const q = search.trim().toLowerCase()
  const searchHits = q ? sortMaterials(store.materials.filter(m =>
    m.title?.toLowerCase().includes(q) || m.category?.toLowerCase().includes(q) || (m.tags||[]).some(t => t.toLowerCase().includes(q))
  )) : null

  const hereFolders = childFolders(currentFolderId)
  const hereMaterials = materialsIn(currentFolderId)
  const selMaterial = selected.size === 1 && [...selected][0].startsWith('m:')
    ? store.materials.find(m => m.id === [...selected][0].slice(2)) : null

  // ── Renderers for a folder + a material (shared by icon & list) ──
  const folderNode = (f) => {
    const key = 'f:' + f.id
    const count = materialsIn(f.id).length + childFolders(f.id).length
    const sel = selected.has(key)
    return (
      <div key={key} draggable
        className={`fx-item fx-folder ${view} ${sel ? 'sel' : ''} ${dragOverFolder === f.id ? 'drop-target' : ''}`}
        onClick={e => { e.stopPropagation(); toggleSelect(e, key) }}
        onDoubleClick={() => { clearSelect(); setPath(p => [...p, f.id]) }}
        onDragStart={e => onItemDragStart(e, key)}
        onDragOver={e => { e.preventDefault(); setDragOverFolder(f.id) }}
        onDragLeave={() => setDragOverFolder(d => d === f.id ? null : d)}
        onDrop={e => onFolderDrop(e, f)}>
        <button className="fx-del-x" title="Delete folder" onClick={e => { e.stopPropagation(); deleteKeys([key]) }}>✕</button>
        <span className="fx-icon" style={{ color: f.color }}>📁</span>
        {renaming === f.id
          ? <input className="fx-rename" autoFocus defaultValue={f.name}
              onClick={e => e.stopPropagation()}
              onBlur={e => { store.updateFolder(f.id, { name: e.target.value.trim() || f.name }); setRenaming(null) }}
              onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }} />
          : <span className="fx-name" onDoubleClick={e => { e.stopPropagation(); setRenaming(f.id) }}>{f.name}</span>}
        <span className="fx-sub">{count} item{count !== 1 ? 's' : ''}</span>
      </div>
    )
  }

  const materialNode = (m) => {
    const key = 'm:' + m.id
    const sel = selected.has(key)
    const t = thumbFor(m)
    return (
      <div key={key} draggable
        className={`fx-item fx-material ${view} ${sel ? 'sel' : ''}`}
        onClick={e => { e.stopPropagation(); toggleSelect(e, key) }}
        onDoubleClick={() => openPreview(m)}
        onDragStart={e => onItemDragStart(e, key)}>
        {m.colorLabel && <span className="fx-color-dot" style={{ background: m.colorLabel }} />}
        <button className="fx-del-x" title="Delete" onClick={e => { e.stopPropagation(); deleteKeys([key]) }}>✕</button>
        {t.img
          ? <span className="fx-thumb"><img src={`file://${t.img}`} alt="" /></span>
          : <span className="fx-icon">{t.icon}</span>}
        <span className="fx-name">{m.title}</span>
        <span className="fx-sub">
          {m.openExternal ? `↗ ${externalLabel(m.filePath)}` : [m.category, ...(m.tags||[])].filter(Boolean).slice(0,2).join(' · ')}
        </span>
      </div>
    )
  }

  return (
    <div className="finder">
      {/* Toolbar */}
      <div className="fx-toolbar">
        <div className="fx-crumbs">
          <button className="fx-crumb" onClick={() => { setPath([]); setSearch('') }}>🏠 Library</button>
          {path.map((fid, i) => {
            const f = folders.find(x => x.id === fid)
            return <React.Fragment key={fid}><span className="fx-crumb-sep">›</span>
              <button className="fx-crumb" onClick={() => setPath(p => p.slice(0, i + 1))}>
                <span className="fx-crumb-dot" style={{ background: f?.color }} />{f?.name || '?'}</button></React.Fragment>
          })}
        </div>
        <div className="fx-toolbar-right">
          <input className="fx-search" placeholder="🔍 Search all materials…" value={search} onChange={e => setSearch(e.target.value)} />
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
          <button className="btn-secondary fx-newfolder" onClick={() => setNewFolderOpen(true)}>＋ Folder</button>
          <button className="btn-secondary" onClick={pickFiles} disabled={importing}>📥 Files</button>
          <button className="btn-secondary" onClick={pickFolders} disabled={importing}>🗂 Folder</button>
        </div>
      </div>

      {status && <div className="fx-status">{status}</div>}

      {/* Selection action bar */}
      {selected.size > 0 && (
        <div className="fx-selbar">
          <span className="fx-selbar-count">{selected.size} selected</span>
          <div className="fx-selbar-actions">
            <button className="btn-danger fx-del-btn" onClick={deleteSelected}>🗑 Delete</button>
            <button className="btn-secondary" onClick={clearSelect}>Deselect</button>
          </div>
        </div>
      )}

      {/* Content area — the whole thing is a drop target */}
      <div ref={rootRef}
        className={`fx-body ${view} ${rootDragOver ? 'root-drop' : ''} ${importing ? 'importing' : ''}`}
        onClick={clearSelect}
        onDragOver={e => { e.preventDefault(); if (!e.dataTransfer.getData('text/finder-keys')) setRootDragOver(true) }}
        onDragLeave={e => { if (!rootRef.current?.contains(e.relatedTarget)) setRootDragOver(false) }}
        onDrop={onRootDrop}>

        {importing && <div className="fx-importing-badge">⏳ Importing…</div>}

        {searchHits ? (
          <>
            <div className="fx-section">{searchHits.length} result{searchHits.length!==1?'s':''} for “{search.trim()}”</div>
            <div className={`fx-grid ${view}`}>{searchHits.map(materialNode)}</div>
          </>
        ) : (
          <div className={`fx-grid ${view}`}>
            {view === 'list' && (
              <div className="fx-list-head"><span>Name</span><span>Kind</span></div>
            )}
            {hereFolders.map(folderNode)}
            {hereMaterials.map(materialNode)}
            {hereFolders.length === 0 && hereMaterials.length === 0 && (
              <div className="fx-empty">
                <div className="fx-empty-icon">📂</div>
                <p>Drop files or folders here from your computer.<br/>Folders keep their structure. No tagging required.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Selected inspector (optional tagging/labels/assign) */}
      {selMaterial && (
        <MaterialInspector key={selMaterial.id} material={selMaterial} store={store} onClose={clearSelect} />
      )}

      {/* New folder modal */}
      {newFolderOpen && (
        <FolderModal onSave={(name, color) => { store.addFolder(name, color, currentFolderId); setNewFolderOpen(false) }} onCancel={() => setNewFolderOpen(false)} />
      )}

      {/* Preview */}
      {preview && (
        <div className="browse-preview-backdrop" onClick={() => { setPreview(null); setFullscreen(false) }}>
          <div className={`browse-preview ${fullscreen ? 'fullscreen' : ''}`} onClick={e => e.stopPropagation()}>
            <FileViewer material={preview} isFullscreen={fullscreen} onToggleFullscreen={() => setFullscreen(f => !f)} />
            <button className="browse-preview-close" onClick={() => { setPreview(null); setFullscreen(false) }}>✕</button>
          </div>
        </div>
      )}
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
