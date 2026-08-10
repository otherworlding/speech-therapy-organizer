import React, { useState } from 'react'
import GoalsPage from './GoalsPage'
import BillingTab from '../components/BillingTab'
import ClientMaterials from '../components/ClientMaterials'

export default function ClientDetailPage({ store, clientId, onBack, onStartSession }) {
  const client = store.clients.find(c => c.id === clientId)
  const [mainTab, setMainTab] = useState('materials') // materials | goals | history | billing
  const [editNotes, setEditNotes] = useState(false)
  const [notes, setNotes] = useState(client?.notes || '')

  if (!client) return <div className="page"><button onClick={onBack}>← Back</button><p>Client not found.</p></div>

  const assignedMaterials = store.materials.filter(m => client.materialIds?.includes(m.id))
  const clientSessions = (store.sessions||[]).filter(s => s.clientId === clientId).reverse().slice(0, 5)

  const saveNotes = () => { store.updateClient(clientId, { notes }); setEditNotes(false) }

  const dob = client.dob ? new Date(client.dob) : null
  const age = dob ? getAge(dob) : null

  return (
    <div className="page page-wide">
      <button className="btn-back" onClick={onBack}>← Back to Clients</button>

      <div className="client-header">
        <div className="client-avatar large">{client.name[0].toUpperCase()}</div>
        <div>
          <h1>{client.name}</h1>
          {age !== null && <div className="client-meta">Age {age} · {client.dob}</div>}
        </div>
        <div className="client-header-actions">
          <button className="btn-start-session-large" onClick={() => onStartSession(clientId)}>▶ Start Session</button>
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
          🗂 Materials & Sessions ({assignedMaterials.length})
        </button>
        <button className={`detail-tab ${mainTab==='goals'?'active':''}`} onClick={()=>setMainTab('goals')}>
          Goals ({(store.goals||[]).filter(g=>g.clientId===clientId&&g.active).length})
        </button>
        <button className={`detail-tab ${mainTab==='history'?'active':''}`} onClick={()=>setMainTab('history')}>
          Recent Sessions
        </button>
        <button className={`detail-tab ${mainTab==='billing'?'active':''}`} onClick={()=>setMainTab('billing')}>
          🧾 Billing
        </button>
      </div>

      {/* Materials & Sessions tab — Main Collection, Session Materials, In-Person, Homework,
          with an embedded Library panel for dragging things straight in */}
      {mainTab === 'materials' && <ClientMaterials store={store} client={client} />}

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

      {/* Billing tab */}
      {mainTab === 'billing' && <BillingTab store={store} client={client} />}
    </div>
  )
}

function getAge(dob) {
  const now = new Date()
  let age = now.getFullYear() - dob.getFullYear()
  if (now.getMonth() < dob.getMonth() || (now.getMonth()===dob.getMonth() && now.getDate()<dob.getDate())) age--
  return age
}
