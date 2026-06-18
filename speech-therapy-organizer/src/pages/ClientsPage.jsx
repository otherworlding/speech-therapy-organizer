import React, { useState } from 'react'

export default function ClientsPage({ store, onOpenClient }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', dob: '', notes: '' })

  const submit = (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    store.addClient(form.name.trim(), form.dob, form.notes)
    setForm({ name: '', dob: '', notes: '' })
    setShowForm(false)
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Clients</h1>
        <button className="btn-primary" onClick={() => setShowForm(true)}>+ Add Client</button>
      </div>

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Add Client</h2>
            <form onSubmit={submit}>
              <label>Child's Name *
                <input autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="First Last" />
              </label>
              <label>Date of Birth
                <input type="date" value={form.dob} onChange={e => setForm(f => ({ ...f, dob: e.target.value }))} />
              </label>
              <label>Notes
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} placeholder="Diagnosis, goals, etc." />
              </label>
              <div className="form-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Add Client</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {store.clients.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">👦</div>
          <p>No clients yet. Add your first client to get started.</p>
        </div>
      ) : (
        <div className="client-grid">
          {store.clients.map(client => {
            const matCount = client.materialIds?.length || 0
            const age = client.dob ? getAge(client.dob) : null
            return (
              <div key={client.id} className="client-card" onClick={() => onOpenClient(client.id)}>
                <div className="client-avatar">{client.name[0].toUpperCase()}</div>
                <div className="client-info">
                  <div className="client-name">{client.name}</div>
                  {age !== null && <div className="client-meta">Age {age}</div>}
                  {client.notes && <div className="client-notes">{client.notes}</div>}
                </div>
                <div className="client-stats">
                  <span>{matCount} material{matCount !== 1 ? 's' : ''}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function getAge(dob) {
  const b = new Date(dob)
  const now = new Date()
  let age = now.getFullYear() - b.getFullYear()
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) age--
  return age
}
