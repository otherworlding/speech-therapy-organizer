import React, { useState } from 'react'
import MaterialCard from '../components/MaterialCard'
import GoalsPage from './GoalsPage'

const CATEGORIES = ['Language', 'Comprehension', 'Pragmatic', 'Age']

export default function ClientDetailPage({ store, clientId, onBack, onStartSession }) {
  const client = store.clients.find(c => c.id === clientId)
  const [mainTab, setMainTab] = useState('materials') // materials | goals | history
  const [catFilter, setCatFilter] = useState('All')
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [search, setSearch] = useState('')
  const [assignSearch, setAssignSearch] = useState('')
  const [editNotes, setEditNotes] = useState(false)
  const [notes, setNotes] = useState(client?.notes || '')

  const isElectron = typeof window !== 'undefined' && window.api

  if (!client) return <div className="page"><button onClick={onBack}>← Back</button><p>Client not found.</p></div>

  const assignedMaterials = store.materials.filter(m => client.materialIds?.includes(m.id))
  const unassignedMaterials = store.materials.filter(m => !client.materialIds?.includes(m.id))
  const clientSessions = (store.sessions||[]).filter(s => s.clientId === clientId).reverse().slice(0, 5)

  const filtered = assignedMaterials.filter(m => {
    if (catFilter !== 'All' && m.category !== catFilter) return false
    if (search && !m.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })
  const filteredUnassigned = unassignedMaterials.filter(m =>
    !assignSearch || m.title.toLowerCase().includes(assignSearch.toLowerCase())
  )

  const openMaterial = async (material) => {
    if (isElectron && material.filePath) await window.api.openFile(material.filePath)
  }
  const saveNotes = () => { store.updateClient(clientId, { notes }); setEditNotes(false) }

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
        <div className="client-header-actions">
          <button className="btn-start-session-large" onClick={() => onStartSession(clientId)}>▶ Start Session</button>
          <button className="btn-primary" onClick={() => setShowAssignModal(true)}>+ Assign Material</button>
        </div>
      </div>

      {/* Notes */}
      <div className="notes-section">
        <div className="notes-header">
          <strong>Notes</strong>
          {!editNotes && <button className="btn-link" onClick={() => setEditNotes(true)}>Edit</button>}
        </div>
        {editNotes ? (
          <div>
            <textarea className="notes-textarea" value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
            <div className="form-actions">
              <button className="btn-secondary" onClick={() => { setNotes(client.notes||''); setEditNotes(false) }}>Cancel</button>
              <button className="btn-primary" onClick={saveNotes}>Save</button>
            </div>
          </div>
        ) : (
          <p className="notes-body">{client.notes || <em>No notes yet.</em>}</p>
        )}
      </div>

      {/* Main tabs */}
      <div className="detail-tabs">
        <button className={`detail-tab ${mainTab==='materials'?'active':''}`} onClick={()=>setMainTab('materials')}>
          Materials ({assignedMaterials.length})
        </button>
        <button className={`detail-tab ${mainTab==='goals'?'active':''}`} onClick={()=>setMainTab('goals')}>
          Goals ({(store.goals||[]).filter(g=>g.clientId===clientId&&g.active).length})
        </button>
        <button className={`detail-tab ${mainTab==='history'?'active':''}`} onClick={()=>setMainTab('history')}>
          Recent Sessions
        </button>
      </div>

      {/* Materials tab */}
      {mainTab === 'materials' && (
        <>
          <div className="filter-bar">
            <input className="search-input" placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)} />
            <div className="filter-tabs">
              {['All',...CATEGORIES].map(cat => (
                <button key={cat} className={`filter-tab ${catFilter===cat?'active':''}`} onClick={()=>setCatFilter(cat)}>{cat}</button>
              ))}
            </div>
          </div>
          {filtered.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">📂</div><p>{assignedMaterials.length===0?'No materials assigned yet.':'No materials match this filter.'}</p></div>
          ) : (
            <div className="materials-list">
              {filtered.map(m => (
                <MaterialCard key={m.id} material={m} onOpen={openMaterial} onDelete={() => store.unassignMaterial(clientId, m.id)} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Goals tab */}
      {mainTab === 'goals' && <GoalsPage store={store} clientId={clientId} />}

      {/* History tab */}
      {mainTab === 'history' && (
        <div className="history-list">
          {clientSessions.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">📋</div><p>No sessions yet.</p></div>
          ) : clientSessions.map(s => (
            <div key={s.id} className="history-card">
              <div className="history-date">{new Date(s.date).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}</div>
              <div className="history-mats">{(s.materialsUsed||[]).length} materials · {Math.round((s.duration||0)/60)}m</div>
              {(s.materialsUsed||[]).filter(m=>m.needsRepeat).length > 0 && (
                <div className="repeat-tag">🔁 {(s.materialsUsed||[]).filter(m=>m.needsRepeat).length} to repeat</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Assign modal */}
      {showAssignModal && (
        <div className="modal-backdrop" onClick={()=>setShowAssignModal(false)}>
          <div className="modal modal-wide" onClick={e=>e.stopPropagation()}>
            <h2>Assign Materials to {client.name}</h2>
            <input className="search-input" placeholder="Search library…" value={assignSearch} autoFocus onChange={e=>setAssignSearch(e.target.value)} />
            <div className="assign-list">
              {filteredUnassigned.length===0 ? (
                <p className="empty-msg">All materials already assigned, or none match.</p>
              ) : filteredUnassigned.map(m => (
                <MaterialCard key={m.id} material={m} onOpen={openMaterial} showAssign onAssign={mat=>store.assignMaterial(clientId,mat.id)} />
              ))}
            </div>
            <div className="form-actions"><button className="btn-primary" onClick={()=>setShowAssignModal(false)}>Done</button></div>
          </div>
        </div>
      )}
    </div>
  )
}

function getAge(dob) {
  const now = new Date()
  let age = now.getFullYear() - dob.getFullYear()
  if (now.getMonth() < dob.getMonth() || (now.getMonth()===dob.getMonth() && now.getDate()<dob.getDate())) age--
  return age
}
