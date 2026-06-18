import React, { useState } from 'react'
import MaterialCard from '../components/MaterialCard'

const CATEGORIES = ['Language', 'Comprehension', 'Pragmatic', 'Age']

export default function MaterialsPage({ store }) {
  const [showForm, setShowForm] = useState(false)
  const [filterCat, setFilterCat] = useState('All')
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({ title: '', category: 'Language', ageRange: '', tags: '', notes: '', filePath: '' })

  const isElectron = typeof window !== 'undefined' && window.api

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
    store.addMaterial({
      title: form.title.trim(),
      category: form.category,
      ageRange: form.ageRange,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      notes: form.notes,
      filePath: form.filePath,
    })
    setForm({ title: '', category: 'Language', ageRange: '', tags: '', notes: '', filePath: '' })
    setShowForm(false)
  }

  const openMaterial = async (material) => {
    if (isElectron && material.filePath) {
      await window.api.openFile(material.filePath)
    }
  }

  const filtered = store.materials.filter(m => {
    if (filterCat !== 'All' && m.category !== filterCat) return false
    if (search && !m.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div className="page">
      <div className="page-header">
        <h1>Materials Library</h1>
        <button className="btn-primary" onClick={() => setShowForm(true)}>+ Add Material</button>
      </div>

      <div className="filter-bar">
        <input className="search-input" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
        <div className="filter-tabs">
          {['All', ...CATEGORIES].map(cat => (
            <button
              key={cat}
              className={`filter-tab ${filterCat === cat ? 'active' : ''}`}
              onClick={() => setFilterCat(cat)}
            >{cat}</button>
          ))}
        </div>
      </div>

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Add Material</h2>
            <form onSubmit={submit}>
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
                <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="e.g. vocabulary, interactive" />
              </label>
              <label>Notes
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Usage notes…" />
              </label>
              <div className="file-pick-row">
                <span className="file-pick-label">{form.filePath ? form.filePath.split('/').pop() : 'No file selected'}</span>
                {isElectron && <button type="button" className="btn-secondary" onClick={pickFile}>Attach File</button>}
              </div>
              <div className="form-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Add Material</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📁</div>
          <p>{store.materials.length === 0 ? 'No materials yet. Add your first material.' : 'No materials match this filter.'}</p>
        </div>
      ) : (
        <div className="materials-list">
          {filtered.map(m => (
            <MaterialCard
              key={m.id}
              material={m}
              onOpen={openMaterial}
              onDelete={store.deleteMaterial}
            />
          ))}
        </div>
      )}
    </div>
  )
}
