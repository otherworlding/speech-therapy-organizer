import React, { useState } from 'react'
import FileViewer from './FileViewer'

const FOLDER_COLORS = ['#4f8ef7', '#34c97a', '#f7a84f', '#c97adb', '#f75f9f', '#3ec9c9', '#8fd14f', '#e07c1a', '#888888']
const IMG_EXT = /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i

const FILE_ICONS = {
  pdf: '📄', pptx: '📊', ppt: '📊', docx: '📝', doc: '📝',
  mp4: '🎬', mov: '🎬', avi: '🎬',
  mp3: '🎵', wav: '🎵', m4a: '🎵',
}

function extOf(p) { return (p || '').split('.').pop().toLowerCase() }

function TilePreview({ material }) {
  if (material.type === 'html-game') return <div className="browse-tile-icon">🎮</div>
  if (material.type === 'folder') {
    const firstImg = (material.items || []).find(i => IMG_EXT.test(i.filename))
    return firstImg
      ? <div className="browse-tile-thumb browse-tile-folderthumb"><img src={`file://${firstImg.filePath}`} alt="" /><span className="browse-folder-overlay">📁 {material.items.length}</span></div>
      : <div className="browse-tile-icon">📁</div>
  }
  if (material.type === 'image-deck' && material.imagePaths?.length) {
    return <div className="browse-tile-thumb"><img src={`file://${material.imagePaths[0]}`} alt="" /></div>
  }
  if (material.filePath && IMG_EXT.test(material.filePath)) {
    return <div className="browse-tile-thumb"><img src={`file://${material.filePath}`} alt="" /></div>
  }
  return <div className="browse-tile-icon">{FILE_ICONS[extOf(material.filePath)] || '📎'}</div>
}

function itemToPseudoMaterial(item, parentTitle) {
  return { id: 'sub_' + item.filePath, title: item.filename, filePath: item.filePath, category: parentTitle }
}

// ── New / edit folder modal ──
function FolderModal({ initial, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || '')
  const [color, setColor] = useState(initial?.color || FOLDER_COLORS[0])
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>{initial ? 'Edit Folder' : 'New Folder'}</h2>
        <form onSubmit={e => { e.preventDefault(); if (name.trim()) onSave(name.trim(), color) }}>
          <label>Name *
            <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Articulation Games" />
          </label>
          <label>Color</label>
          <div className="color-swatches">
            {FOLDER_COLORS.map(c => (
              <button key={c} type="button" className={`color-swatch ${c === color ? 'selected' : ''}`}
                style={{ background: c }} onClick={() => setColor(c)} />
            ))}
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

// ── Move-to-folder + color label picker ──
function OrganizeModal({ material, folders, onMove, onColorLabel, onCancel }) {
  const flat = []
  const walk = (parentId, depth) => {
    folders.filter(f => (f.parentId || null) === parentId).forEach(f => {
      flat.push({ ...f, depth })
      walk(f.id, depth + 1)
    })
  }
  walk(null, 0)
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Organize: {material.title}</h2>
        <div className="organize-section-title">Move to folder</div>
        <div className="move-list">
          <button className={`move-item ${!material.folderId ? 'current' : ''}`} onClick={() => onMove(null)}>
            📂 Unfiled (top level)
          </button>
          {flat.map(f => (
            <button key={f.id} className={`move-item ${material.folderId === f.id ? 'current' : ''}`}
              style={{ paddingLeft: 14 + f.depth * 18 }} onClick={() => onMove(f.id)}>
              <span className="folder-color-dot" style={{ background: f.color }} /> {f.name}
            </button>
          ))}
        </div>
        <div className="organize-section-title">Color label</div>
        <div className="color-swatches">
          <button className={`color-swatch swatch-none ${!material.colorLabel ? 'selected' : ''}`}
            onClick={() => onColorLabel(null)} title="No label">✕</button>
          {FOLDER_COLORS.map(c => (
            <button key={c} className={`color-swatch ${material.colorLabel === c ? 'selected' : ''}`}
              style={{ background: c }} onClick={() => onColorLabel(c)} />
          ))}
        </div>
        <div className="form-actions">
          <button className="btn-secondary" onClick={onCancel}>Done</button>
        </div>
      </div>
    </div>
  )
}

export default function MaterialsBrowser({ store, importFile, importFolder }) {
  const [path, setPath] = useState([])            // stack of folder ids
  const [showRecent, setShowRecent] = useState(false)
  const [preview, setPreview] = useState(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [editingFolder, setEditingFolder] = useState(null)
  const [organizing, setOrganizing] = useState(null)
  const [search, setSearch] = useState('')
  const [dragOverId, setDragOverId] = useState(null)
  const [importingHere, setImportingHere] = useState(false)

  const folders = store.folders || []
  const currentFolderId = path.length ? path[path.length - 1] : null
  const currentFolder = folders.find(f => f.id === currentFolderId)
  const childFolders = (pid) => folders.filter(f => (f.parentId || null) === pid)
  const materialsIn = (fid) => store.materials.filter(m => (m.folderId || null) === fid)

  // Guard: a folder cannot be dropped into itself or its own descendants
  const isDescendant = (candidateId, ancestorId) => {
    let cur = folders.find(f => f.id === candidateId)
    while (cur) {
      if (cur.id === ancestorId) return true
      cur = folders.find(f => f.id === cur.parentId)
    }
    return false
  }

  // ── Drag & drop handlers ──
  const onTileDragStart = (e, m) => { e.dataTransfer.setData('text/material-id', m.id) }
  const onFolderDragStart = (e, f) => { e.dataTransfer.setData('text/folder-id', f.id) }

  const onFolderDrop = async (e, folder) => {
    e.preventDefault(); e.stopPropagation()
    setDragOverId(null)
    const matId = e.dataTransfer.getData('text/material-id')
    const folId = e.dataTransfer.getData('text/folder-id')
    if (matId) { store.updateMaterial(matId, { folderId: folder.id }); return }
    if (folId) {
      if (folId === folder.id || isDescendant(folder.id, folId)) return
      store.updateFolder(folId, { parentId: folder.id })
      return
    }
    // OS files dropped straight onto a folder tile
    await importOsDrop(e, folder.id)
  }

  const importOsDrop = async (e, folderId) => {
    if (!window.api) return
    const dropped = Array.from(e.dataTransfer.items || []).map(item => {
      const entry = item.webkitGetAsEntry?.()
      const file = item.getAsFile?.()
      let p = null
      try { p = file ? window.api.getFilePath(file) : null } catch { p = null }
      return { isDir: entry?.isDirectory ?? false, path: p }
    }).filter(d => d.path)
    if (!dropped.length) return
    setImportingHere(true)
    for (const { isDir, path: p } of dropped) {
      const id = isDir ? await importFolder(p) : await importFile(p)
      if (id) store.updateMaterial(id, { folderId })
    }
    setImportingHere(false)
  }

  // ── Preview modal ──
  const previewModal = preview && (
    <div className="browse-preview-backdrop" onClick={() => { setPreview(null); setFullscreen(false) }}>
      <div className={`browse-preview ${fullscreen ? 'fullscreen' : ''}`} onClick={e => e.stopPropagation()}>
        <FileViewer material={preview} isFullscreen={fullscreen} onToggleFullscreen={() => setFullscreen(f => !f)} />
        <button className="browse-preview-close" onClick={() => { setPreview(null); setFullscreen(false) }}>✕</button>
      </div>
    </div>
  )

  const modals = (
    <>
      {previewModal}
      {newFolderOpen && (
        <FolderModal
          onSave={(name, color) => { store.addFolder(name, color, currentFolderId); setNewFolderOpen(false) }}
          onCancel={() => setNewFolderOpen(false)}
        />
      )}
      {editingFolder && (
        <FolderModal initial={editingFolder}
          onSave={(name, color) => { store.updateFolder(editingFolder.id, { name, color }); setEditingFolder(null) }}
          onCancel={() => setEditingFolder(null)}
        />
      )}
      {organizing && (
        <OrganizeModal
          material={store.materials.find(m => m.id === organizing.id) || organizing}
          folders={folders}
          onMove={(fid) => { store.updateMaterial(organizing.id, { folderId: fid }) }}
          onColorLabel={(c) => { store.updateMaterial(organizing.id, { colorLabel: c }) }}
          onCancel={() => setOrganizing(null)}
        />
      )}
    </>
  )

  const materialTile = (m, { draggable = true } = {}) => (
    <div key={m.id} className="browse-tile" draggable={draggable}
      onDragStart={e => onTileDragStart(e, m)}
      onClick={() => setPreview(m)}>
      {m.colorLabel && <span className="tile-color-label" style={{ background: m.colorLabel }} />}
      <button className="tile-organize-btn" title="Move / label"
        onClick={e => { e.stopPropagation(); setOrganizing(m) }}>📂</button>
      <TilePreview material={m} />
      <div className="browse-tile-name">{m.title}</div>
      <div className="browse-tile-sub">
        {[m.category, ...(m.tags || [])].filter(Boolean).slice(0, 3).join(' · ')}
      </div>
    </div>
  )

  const folderTile = (f) => {
    const count = materialsIn(f.id).length + childFolders(f.id).length
    return (
      <div key={f.id} draggable
        className={`browse-tile browse-folder-tile ${dragOverId === f.id ? 'drag-target' : ''}`}
        style={{ borderTopColor: f.color }}
        onDragStart={e => onFolderDragStart(e, f)}
        onDragOver={e => { e.preventDefault(); setDragOverId(f.id) }}
        onDragLeave={() => setDragOverId(d => d === f.id ? null : d)}
        onDrop={e => onFolderDrop(e, f)}
        onClick={() => { setShowRecent(false); setPath(p => [...p, f.id]) }}>
        <button className="tile-organize-btn" title="Edit folder"
          onClick={e => { e.stopPropagation(); setEditingFolder(f) }}>✎</button>
        <button className="tile-delete-btn" title="Delete folder (contents move up)"
          onClick={e => { e.stopPropagation(); if (window.confirm(`Delete folder "${f.name}"? Its contents move up a level.`)) store.deleteFolder(f.id) }}>✕</button>
        <div className="browse-tile-icon folder-icon-tinted" style={{ color: f.color }}>📁</div>
        <div className="browse-tile-name">{f.name}</div>
        <div className="browse-tile-sub">{count} item{count !== 1 ? 's' : ''}</div>
      </div>
    )
  }

  const crumbs = (
    <div className="browse-crumbs">
      <button className="crumb" onClick={() => { setPath([]); setShowRecent(false); setSearch('') }}>Library</button>
      {showRecent && <><span className="crumb-sep">›</span><span className="crumb crumb-current">🕘 Recent</span></>}
      {path.map((fid, i) => {
        const f = folders.find(x => x.id === fid)
        const isLast = i === path.length - 1
        return (
          <React.Fragment key={fid}>
            <span className="crumb-sep">›</span>
            {isLast
              ? <span className="crumb crumb-current"><span className="folder-color-dot" style={{ background: f?.color }} /> {f?.name || '?'}</span>
              : <button className="crumb" onClick={() => setPath(p => p.slice(0, i + 1))}>{f?.name || '?'}</button>}
          </React.Fragment>
        )
      })}
      <input className="browse-search" placeholder="🔍 Search all materials…" value={search}
        onChange={e => setSearch(e.target.value)} />
    </div>
  )

  // ── Search results (flat, across everything) ──
  if (search.trim()) {
    const q = search.trim().toLowerCase()
    const hits = store.materials.filter(m =>
      m.title?.toLowerCase().includes(q) ||
      m.category?.toLowerCase().includes(q) ||
      (m.tags || []).some(t => t.toLowerCase().includes(q))
    )
    return (
      <div className="browse-root">
        {crumbs}
        <div className="browse-section-title">{hits.length} result{hits.length !== 1 ? 's' : ''} for “{search.trim()}”</div>
        <div className="browse-grid">{hits.map(m => materialTile(m, { draggable: false }))}</div>
        {modals}
      </div>
    )
  }

  // ── Recent view ──
  if (showRecent) {
    const recent = [...store.materials].reverse()
    return (
      <div className="browse-root">
        {crumbs}
        <div className="browse-grid">{recent.map(m => materialTile(m, { draggable: false }))}</div>
        {modals}
      </div>
    )
  }

  // ── Folder level (root or inside a folder) ──
  const hereFolders = childFolders(currentFolderId)
  const hereMaterials = materialsIn(currentFolderId)

  return (
    <div className="browse-root"
      onDragOver={e => { if (currentFolderId) e.preventDefault() }}
      onDrop={e => { if (currentFolderId && !e.dataTransfer.getData('text/material-id') && !e.dataTransfer.getData('text/folder-id')) importOsDrop(e, currentFolderId) }}>
      {crumbs}
      {importingHere && <div className="browse-importing">⏳ Importing into this folder…</div>}
      <div className="browse-grid">
        {!currentFolderId && (
          <div className="browse-tile browse-smart-tile" onClick={() => setShowRecent(true)}>
            <div className="browse-tile-icon">🕘</div>
            <div className="browse-tile-name">Recent</div>
            <div className="browse-tile-sub">newest first</div>
          </div>
        )}
        {hereFolders.map(folderTile)}
        <div className="browse-tile browse-new-folder" onClick={() => setNewFolderOpen(true)}>
          <div className="browse-tile-icon">＋</div>
          <div className="browse-tile-name">New Folder</div>
        </div>
        {hereMaterials.map(m => materialTile(m))}
      </div>
      {currentFolderId && hereMaterials.length === 0 && hereFolders.length === 0 && (
        <div className="empty-state" style={{ marginTop: 24 }}>
          <div className="empty-icon">📂</div>
          <p>Empty folder — drag materials here, or drop files from your computer to import them straight in.</p>
        </div>
      )}
      {modals}
    </div>
  )
}
