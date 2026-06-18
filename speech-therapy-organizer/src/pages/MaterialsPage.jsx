import React, { useState, useRef } from 'react'
import MaterialCard from '../components/MaterialCard'

const CATEGORIES = ['Language', 'Comprehension', 'Pragmatic', 'Age']
const isElectron = typeof window !== 'undefined' && window.api

export default function MaterialsPage({ store }) {
  const [showForm, setShowForm] = useState(false)
  const [filterCat, setFilterCat] = useState('All')
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({ title:'', category:'Language', ageRange:'', tags:'', notes:'', filePath:'' })
  const [dragging, setDragging] = useState(false)
  const [pendingQueue, setPendingQueue] = useState([]) // materials needing tags
  const [editingPending, setEditingPending] = useState(null)
  const dropRef = useRef(null)

  const pickFile = async () => {
    if (!isElectron) return
    const paths = await window.api.pickFiles()
    if (paths.length > 0) {
      const dest = await window.api.copyToLibrary(paths[0])
      setForm(f => ({ ...f, filePath: dest, title: f.title || paths[0].split('/').pop().replace(/\.[^.]+$/, '') }))
    }
  }

  const submit = (e) => {
    e.preventDefault()
    if (!form.title.trim()) return
    store.addMaterial({ title:form.title.trim(), category:form.category, ageRange:form.ageRange, tags:form.tags.split(',').map(t=>t.trim()).filter(Boolean), notes:form.notes, filePath:form.filePath })
    setForm({ title:'', category:'Language', ageRange:'', tags:'', notes:'', filePath:'' })
    setShowForm(false)
  }

  const openMaterial = async (material) => {
    if (isElectron && material.filePath) await window.api.openFile(material.filePath)
  }

  // ── Drag & Drop ───────────────────────────────────────────────────────
  const handleDragOver = (e) => { e.preventDefault(); setDragging(true) }
  const handleDragLeave = (e) => { if (!dropRef.current?.contains(e.relatedTarget)) setDragging(false) }
  const handleDrop = async (e) => {
    e.preventDefault(); setDragging(false)
    if (!isElectron) return
    const files = Array.from(e.dataTransfer.files)
    const newItems = []
    for (const file of files) {
      const p = file.path
      if (!p) continue
      const isDir = file.type === '' && !file.name.includes('.')
      if (isDir) {
        // Import as image deck
        const result = await window.api.importFolderDeck(p)
        if (result.imagePaths.length > 0) {
          const mat = store.addMaterial({ title: result.name, type: 'image-deck', imagePaths: result.imagePaths, category: 'Language', tags: [], pending: true })
          newItems.push(mat.id)
        }
      } else {
        // Copy file and create pending material
        const dest = await window.api.copyToLibrary(p)
        const title = file.name.replace(/\.[^.]+$/, '')
        const mat = store.addMaterial({ title, filePath: dest, category: 'Language', tags: [], pending: true })
        newItems.push(mat.id)
      }
    }
    if (newItems.length > 0) setPendingQueue(q => [...q, ...newItems])
  }

  const savePending = (id, updates) => {
    store.updateMaterial(id, { ...updates, pending: false })
    setPendingQueue(q => q.filter(qid => qid !== id))
    setEditingPending(null)
  }

  const filtered = store.materials.filter(m => {
    if (filterCat !== 'All' && m.category !== filterCat) return false
    if (search && !m.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const pendingMaterials = store.materials.filter(m => pendingQueue.includes(m.id))
  const readyMaterials = filtered.filter(m => !pendingQueue.includes(m.id))

  return (
    <div className="page">
      <div className="page-header">
        <h1>Materials Library</h1>
        <button className="btn-primary" onClick={() => setShowForm(true)}>+ Add Material</button>
      </div>

      {/* Drop zone */}
      <div
        ref={dropRef}
        className={`drop-zone ${dragging ? 'drag-over' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <span className="drop-icon">📥</span>
        <span>Drop files or folders here to import</span>
        <span className="drop-sub">PDFs, images, video, audio, PPTX, or folders of images</span>
      </div>

      {/* Pending queue */}
      {pendingMaterials.length > 0 && (
        <div className="pending-section">
          <div className="pending-header">
            <span>⏳ {pendingMaterials.length} item{pendingMaterials.length>1?'s':''} need tags</span>
            <button className="btn-link" onClick={() => setEditingPending(pendingMaterials[0]?.id)}>Tag now</button>
          </div>
          <div className="pending-list">
            {pendingMaterials.map(m => (
              <div key={m.id} className="pending-item" onClick={() => setEditingPending(m.id)}>
                <span className="pending-name">{m.title}</span>
                <span className="pending-type">{m.type === 'image-deck' ? '🖼 image deck' : m.filePath?.split('.').pop()}</span>
                <span className="tag" style={{background:'#f7a84f'}}>needs tags</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="filter-bar">
        <input className="search-input" placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)} />
        <div className="filter-tabs">
          {['All',...CATEGORIES].map(cat => (
            <button key={cat} className={`filter-tab ${filterCat===cat?'active':''}`} onClick={()=>setFilterCat(cat)}>{cat}</button>
          ))}
        </div>
      </div>

      {/* Add material form */}
      {showForm && (
        <div className="modal-backdrop" onClick={()=>setShowForm(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <h2>Add Material</h2>
            <MaterialForm form={form} setForm={setForm} onSubmit={submit} onCancel={()=>setShowForm(false)} onPickFile={pickFile} />
          </div>
        </div>
      )}

      {/* Edit pending item */}
      {editingPending && (()=>{
        const m = store.materials.find(x=>x.id===editingPending)
        if (!m) return null
        const [pf, setPf] = useState({ title:m.title, category:m.category||'Language', ageRange:m.ageRange||'', tags:(m.tags||[]).join(', '), notes:m.notes||'' })
        return (
          <div className="modal-backdrop" onClick={()=>setEditingPending(null)}>
            <div className="modal" onClick={e=>e.stopPropagation()}>
              <h2>Tag: {m.title}</h2>
              <MaterialForm
                form={pf} setForm={setPf}
                onSubmit={e=>{e.preventDefault();savePending(m.id,{...pf,tags:pf.tags.split(',').map(t=>t.trim()).filter(Boolean)})}}
                onCancel={()=>setEditingPending(null)}
                hideFile
              />
            </div>
          </div>
        )
      })()}

      {readyMaterials.length === 0 && pendingMaterials.length === 0 ? (
        <div className="empty-state"><div className="empty-icon">📁</div><p>{store.materials.length===0?'No materials yet. Add or drop files above.':'No materials match this filter.'}</p></div>
      ) : (
        <div className="materials-list">
          {readyMaterials.map(m => (
            <MaterialCard key={m.id} material={m} onOpen={openMaterial} onDelete={store.deleteMaterial} />
          ))}
        </div>
      )}
    </div>
  )
}

function MaterialForm({ form, setForm, onSubmit, onCancel, onPickFile, hideFile }) {
  return (
    <form onSubmit={onSubmit}>
      <label>Title *<input autoFocus value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="e.g. Articulation Bingo" /></label>
      <label>Category
        <select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>
          {['Language','Comprehension','Pragmatic','Age'].map(c=><option key={c}>{c}</option>)}
        </select>
      </label>
      <label>Age Range<input value={form.ageRange} onChange={e=>setForm(f=>({...f,ageRange:e.target.value}))} placeholder="e.g. 4-6" /></label>
      <label>Tags (comma separated)<input value={form.tags} onChange={e=>setForm(f=>({...f,tags:e.target.value}))} placeholder="vocabulary, interactive" /></label>
      <label>Notes<textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={2} placeholder="Usage notes…" /></label>
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
