import React, { useState } from 'react'
import MaterialCard from '../components/MaterialCard'

const CATEGORIES = ['Language', 'Comprehension', 'Pragmatic', 'Age']

export default function ClientDetailPage({ store, clientId, onBack }) {
  const client = store.clients.find(c => c.id === clientId)
  const [tab, setTab] = useState('All')
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [search, setSearch] = useState('')
  const [assignSearch, setAssignSearch] = useState('')
  const [editNotes, setEditNotes] = useState(false)
  const [notes, setNotes] = useState(client?.notes || '')

  const isElectron = typeof window !== 'undefined' && window.api

  if (!client) return <div className="page"><button onClick={onBack}>← Back</button><p>Client not found.</p></div>

  const assignedMaterials = store.materials.filter(m => client.materialIds?.includes(m.id))
  const unassignedMaterials = store.materials.filter(m => !client.materialIds?.includes(m.id))

  const filtered = assignedMaterials.filter(m => {
    if (tab !== 'All' && m.category !== tab) return false
    if (search && !m.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const filteredUnassigned = unassignedMaterials.filter(m =>
    !assignSearch || m.title.toLowerCase().includes(assignSearch.toLowerCase())
  )

  const openMaterial = async (material) => {
    if (isElectron && material.filePath) await window.api.openFile(material.filePath)
  }

  const saveNotes = () => {
    store.updateClient(clientId, { notes })
    setEditNotes(false)
  }

  const dob = client.dob ? new Date(client.dob) : null
  const age = dob ? getAge(dob) : null

  return (
    <div className="page">
      <button className="btn-back" onClick={onBack}>← Back to Clients</button>

      <div className="client-header">
        <div className="client-avatar large">{client.name[0].toUpperCase()}</div>
        <div>
          <h1>{client.name}</h1>
          {age !== null && <div className="client-meta">Age {age} · {client.dob}</div>}
        </div>
        <button className="btn-primary ml-auto" onClick={() => setShowAssignModal(true)}>+ Assign Material</button>
      </div>

      <div className="notes-section">
        <div className="notes-header">
          <strong>Session Notes</strong>
          {!editNotes && <button className="btn-link" onClick={() => setEditNotes(true)}>Edit</button>}
        </div>
        {editNotes ? (
          <div>
            <textarea className="notes-textarea" value={notes} onChange={e => setNotes(e.target.value)} rows={4} />
            <div className="form-actions">
              <button className="btn-secondary" onClick={() => { setNotes(client.notes || ''); setEditNotes(false) }}>Cancel</button>
              <button className="btn-primary" onClick={saveNotes}>Save</button>
            </div>
          </div>
        ) : (
          <p className="notes-body">{client.notes || <em>No notes yet.</em>}</p>
        )}
      </div>

      <div className="section-title">
        <h2>Materials ({assignedMaterials.length})</h2>
      </div>

      <div className="filter-bar">
        <input className="search-input" placeholder="Search materials…" value={search} onChange={e => setSearch(e.target.value)} />
        <div className="filter-tabs">
          {['All', ...CATEGORIES].map(cat => (
            <button key={cat} className={`filter-tab ${tab === cat ? 'active' : ''}`} onClick={() => setTab(cat)}>{cat}</button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📂</div>
          <p>{assignedMaterials.length === 0 ? 'No materials assigned yet.' : 'No materials match this filter.'}</p>
        </div>
      ) : (
        <div className="materials-list">
          {filtered.map(m => (
            <MaterialCard
              key={m.id}
              material={m}
              onOpen={openMaterial}
              onDelete={() => store.unassignMaterial(clientId, m.id)}
            />
          ))}
        </div>
      )}

      {showAssignModal && (
        <div className="modal-backdrop" onClick={() => setShowAssignModal(false)}>
          <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
            <h2>Assign Materials to {client.name}</h2>
            <input
              className="search-input"
              placeholder="Search library…"
              value={assignSearch}
              autoFocus
              onChange={e => setAssignSearch(e.target.value)}
            />
            <div className="assign-list">
              {filteredUnassigned.length === 0 ? (
                <p className="empty-msg">All materials already assigned, or none match.</p>
              ) : filteredUnassigned.map(m => (
                <MaterialCard
                  key={m.id}
                  material={m}
                  onOpen={openMaterial}
                  showAssign
                  onAssign={(mat) => store.assignMaterial(clientId, mat.id)}
                />
              ))}
            </div>
            <div className="form-actions">
              <button className="btn-primary" onClick={() => setShowAssignModal(false)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function getAge(dob) {
  const now = new Date()
  let age = now.getFullYear() - dob.getFullYear()
  if (now.getMonth() < dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate())) age--
  return age
}
