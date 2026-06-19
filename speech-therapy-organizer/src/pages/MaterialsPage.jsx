import React, { useState, useRef } from 'react'
import JSZip from 'jszip'
import MaterialCard from '../components/MaterialCard'
import { isExternalFile, getExt } from '../utils/fileTypes'

// Inspect .pptx content: returns true if animations or action-hyperlinks found
async function isPptxInteractive(filePath) {
  try {
    const data = await window.api.readFileBinary(filePath)
    const zip = await JSZip.loadAsync(data)
    const slideNames = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    for (const name of slideNames) {
      const xml = await zip.files[name].async('text')
      // p:tnLst = animation timeline nodes; hlinkClick = action/hyperlink buttons
      if (xml.includes('<p:tnLst>') || xml.includes('hlinkClick')) return true
    }
    return false
  } catch {
    return false
  }
}

const CATEGORIES = ['Language', 'Comprehension', 'Pragmatic', 'Age']
const isElectron = typeof window !== 'undefined' && window.api

// ── Pending tag editor — must be its own component so hooks are valid ──
function PendingEditor({ material, onSave, onCancel }) {
  const [f, setF] = useState({
    title: material.title,
    category: material.category || 'Language',
    ageRange: material.ageRange || '',
    tags: (material.tags || []).join(', '),
    notes: material.notes || '',
    openExternal: material.openExternal || false,
  })
  const ext = (material.filePath || '').split('.').pop().toLowerCase()
  const isPptx = ext === 'pptx'
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Tag: {material.title}</h2>
        {isPptx && (
          <div className="open-mode-toggle">
            <span className="open-mode-label">Open as:</span>
            <button
              type="button"
              className={`open-mode-btn ${!f.openExternal ? 'active' : ''}`}
              onClick={() => setF(p => ({ ...p, openExternal: false }))}
            >
              In-app slideshow
            </button>
            <button
              type="button"
              className={`open-mode-btn ${f.openExternal ? 'active' : ''}`}
              onClick={() => setF(p => ({ ...p, openExternal: true }))}
            >
              ↗ Open in PowerPoint
            </button>
            {material.openExternal !== undefined && (
              <span className="open-mode-hint">
                {material.openExternal ? 'Auto-detected: animations/games found' : 'Auto-detected: plain slideshow'}
              </span>
            )}
          </div>
        )}
        <MaterialForm
          form={f} setForm={setF}
          onSubmit={e => { e.preventDefault(); onSave(material.id, { ...f, tags: f.tags.split(',').map(t => t.trim()).filter(Boolean) }) }}
          onCancel={onCancel}
          hideFile
        />
      </div>
    </div>
  )
}

export default function MaterialsPage({ store }) {
  const [showForm, setShowForm] = useState(false)
  const [filterCat, setFilterCat] = useState('All')
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({ title: '', category: 'Language', ageRange: '', tags: '', notes: '', filePath: '' })
  const [dragging, setDragging] = useState(false)
  const [pendingQueue, setPendingQueue] = useState([])
  const [editingPendingId, setEditingPendingId] = useState(null)
  const [importing, setImporting] = useState(false)
  const dropRef = useRef(null)

  // ── Import helpers ────────────────────────────────────────────────────
  const importFile = async (filePath) => {
    const dest = await window.api.copyToLibrary(filePath)
    const title = filePath.split('/').pop().replace(/\.[^.]+$/, '')
    const ext = getExt(filePath)
    let external = isExternalFile(filePath)
    if (!external && ext === 'pptx') {
      external = await isPptxInteractive(filePath)
    }
    const mat = store.addMaterial({ title, filePath: dest, category: 'Language', tags: [], pending: true, openExternal: external })
    return mat.id
  }

  const importFolder = async (folderPath) => {
    const result = await window.api.importFolderDeck(folderPath)
    if (!result.imagePaths.length) return null
    const mat = store.addMaterial({ title: result.name, type: 'image-deck', imagePaths: result.imagePaths, category: 'Language', tags: [], pending: true })
    return mat.id
  }

  // ── Picker: attach single file to the manual-add form ────────────────
  const pickOneFile = async () => {
    if (!isElectron) return
    const paths = await window.api.pickFiles()
    if (!paths.length) return
    const dest = await window.api.copyToLibrary(paths[0])
    setForm(f => ({ ...f, filePath: dest, title: f.title || paths[0].split('/').pop().replace(/\.[^.]+$/, '') }))
  }

  // ── Picker: import multiple files directly into pending queue ─────────
  const pickManyFiles = async () => {
    if (!isElectron) return
    setImporting(true)
    const paths = await window.api.pickFiles()
    const newIds = []
    for (const p of paths) {
      const id = await importFile(p)
      if (id) newIds.push(id)
    }
    if (newIds.length) setPendingQueue(q => [...q, ...newIds])
    setImporting(false)
  }

  // ── Picker: import image folders as decks ─────────────────────────────
  const pickFolders = async () => {
    if (!isElectron) return
    setImporting(true)
    const paths = await window.api.pickFolder()
    const newIds = []
    for (const p of paths) {
      const id = await importFolder(p)
      if (id) newIds.push(id)
    }
    if (newIds.length) setPendingQueue(q => [...q, ...newIds])
    setImporting(false)
  }

  // ── Drag & drop ───────────────────────────────────────────────────────
  const handleDragOver = (e) => { e.preventDefault(); setDragging(true) }
  const handleDragLeave = (e) => { if (!dropRef.current?.contains(e.relatedTarget)) setDragging(false) }

  const handleDrop = async (e) => {
    e.preventDefault()
    setDragging(false)
    if (!isElectron) return

    const items = Array.from(e.dataTransfer.items)
    if (!items.length) return

    setImporting(true)
    const newIds = []

    for (const item of items) {
      const entry = item.webkitGetAsEntry?.()
      const file = item.getAsFile()
      const p = file?.path
      if (!p) continue
      const id = entry?.isDirectory ? await importFolder(p) : await importFile(p)
      if (id) newIds.push(id)
    }

    if (newIds.length) setPendingQueue(q => [...q, ...newIds])
    setImporting(false)
  }

  // ── Pending save ──────────────────────────────────────────────────────
  const savePending = (id, updates) => {
    store.updateMaterial(id, { ...updates, pending: false })
    const remaining = pendingQueue.filter(qid => qid !== id)
    setPendingQueue(remaining)
    // Auto-advance to next pending item
    setEditingPendingId(remaining.length > 0 ? remaining[0] : null)
  }

  // ── Manual add form submit ────────────────────────────────────────────
  const submit = (e) => {
    e.preventDefault()
    if (!form.title.trim()) return
    store.addMaterial({
      title: form.title.trim(), category: form.category, ageRange: form.ageRange,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      notes: form.notes, filePath: form.filePath,
    })
    setForm({ title: '', category: 'Language', ageRange: '', tags: '', notes: '', filePath: '' })
    setShowForm(false)
  }

  const openMaterial = async (material) => {
    if (isElectron && material.filePath) await window.api.openFile(material.filePath)
  }

  // ── Render ────────────────────────────────────────────────────────────
  const pendingMaterials = store.materials.filter(m => pendingQueue.includes(m.id))
  const filtered = store.materials.filter(m => {
    if (pendingQueue.includes(m.id)) return false
    if (filterCat !== 'All' && m.category !== filterCat) return false
    if (search && !m.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const editingMaterial = editingPendingId ? store.materials.find(m => m.id === editingPendingId) : null

  return (
    <div className="page">
      <div className="page-header">
        <h1>Materials Library</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" onClick={pickManyFiles} disabled={importing}>
            {importing ? 'Importing…' : '📥 Import Files'}
          </button>
          <button className="btn-secondary" onClick={pickFolders} disabled={importing}>
            🖼 Import Folder
          </button>
          <button className="btn-primary" onClick={() => setShowForm(true)}>+ Add Material</button>
        </div>
      </div>

      {/* Drop zone */}
      <div
        ref={dropRef}
        className={`drop-zone ${dragging ? 'drag-over' : ''} ${importing ? 'drop-importing' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <span className="drop-icon">{importing ? '⏳' : '📥'}</span>
        <span>{importing ? 'Importing…' : 'Drop files or folders here'}</span>
        <span className="drop-sub">PDFs · PPTX · images · video · audio · image folders</span>
      </div>

      {/* Pending queue */}
      {pendingMaterials.length > 0 && (
        <div className="pending-section">
          <div className="pending-header">
            <span>⏳ {pendingMaterials.length} item{pendingMaterials.length > 1 ? 's' : ''} waiting for tags</span>
            <button className="btn-link" onClick={() => setEditingPendingId(pendingMaterials[0]?.id)}>Tag now →</button>
          </div>
          <div className="pending-list">
            {pendingMaterials.map(m => (
              <div key={m.id} className="pending-item" onClick={() => setEditingPendingId(m.id)}>
                <span className="pending-name">{m.title}</span>
                <span className="pending-type">{m.type === 'image-deck' ? '🖼 image deck' : (m.filePath || '').split('.').pop()}</span>
                <span className="tag" style={{ background: '#f7a84f' }}>needs tags</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="filter-bar">
        <input className="search-input" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
        <div className="filter-tabs">
          {['All', ...CATEGORIES].map(cat => (
            <button key={cat} className={`filter-tab ${filterCat === cat ? 'active' : ''}`} onClick={() => setFilterCat(cat)}>{cat}</button>
          ))}
        </div>
      </div>

      {/* Manual add form */}
      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Add Material</h2>
            <MaterialForm form={form} setForm={setForm} onSubmit={submit} onCancel={() => setShowForm(false)} onPickFile={pickOneFile} />
          </div>
        </div>
      )}

      {/* Pending tag editor */}
      {editingMaterial && (
        <PendingEditor
          key={editingMaterial.id}
          material={editingMaterial}
          onSave={savePending}
          onCancel={() => setEditingPendingId(null)}
        />
      )}

      {filtered.length === 0 && pendingMaterials.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📁</div>
          <p>{store.materials.length === 0 ? 'No materials yet. Drop files above or click Import Files.' : 'No materials match this filter.'}</p>
        </div>
      ) : (
        <div className="materials-list">
          {filtered.map(m => (
            <MaterialCard key={m.id} material={m} onOpen={openMaterial} onDelete={store.deleteMaterial}
            onToggleExternal={(id, val) => store.updateMaterial(id, { openExternal: val })} />
          ))}
        </div>
      )}
    </div>
  )
}

function MaterialForm({ form, setForm, onSubmit, onCancel, onPickFile, hideFile }) {
  return (
    <form onSubmit={onSubmit}>
      <label>Title *
        <input autoFocus value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Articulation Bingo" />
      </label>
      <label>Category
        <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
      </label>
      <label>Age Range
        <input value={form.ageRange} onChange={e => setForm(f => ({ ...f, ageRange: e.target.value }))} placeholder="e.g. 4-6" />
      </label>
      <label>Tags (comma separated)
        <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="vocabulary, interactive" />
      </label>
      <label>Notes
        <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Usage notes…" />
      </label>
      {!hideFile && onPickFile && (
        <div className="file-pick-row">
          <span className="file-pick-label">{form.filePath ? form.filePath.split('/').pop() : 'No file selected'}</span>
          <button type="button" className="btn-secondary" onClick={onPickFile}>Attach File</button>
        </div>
      )}
      <div className="form-actions">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary">Save</button>
      </div>
    </form>
  )
}
