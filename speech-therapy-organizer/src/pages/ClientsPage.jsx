import React, { useState } from 'react'

function fmt(iso) { return iso ? new Date(iso).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '' }
function dur(secs) {
  if (!secs) return '—'
  return `${Math.floor(secs/60)}m ${secs%60}s`
}

function ClientForm({ initial, title, submitLabel, onSubmit, onCancel }) {
  const [form, setForm] = useState({ name: initial?.name || '', dob: initial?.dob || '', notes: initial?.notes || '' })
  const submit = (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    onSubmit({ name: form.name.trim(), dob: form.dob, notes: form.notes })
  }
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>{title}</h2>
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
            <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
            <button type="submit" className="btn-primary">{submitLabel}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function ClientsPage({ store, onOpenClient, onStartSession }) {
  const [showForm, setShowForm] = useState(false)
  const [editingClient, setEditingClient] = useState(null)
  const [deletingClient, setDeletingClient] = useState(null)
  const [archiveDone, setArchiveDone] = useState(false)

  const buildArchive = (client) => {
    const sessions = (store.sessions || []).filter(s => s.clientId === client.id)
    const goals = (store.goals || []).filter(g => g.clientId === client.id)
    const lines = [
      `CLIENT ARCHIVE — ${client.name}`,
      `Exported: ${new Date().toLocaleString()}`,
      `Date of Birth: ${client.dob || 'not recorded'}`,
      `Notes: ${client.notes || 'none'}`,
      '',
      `═══ GOALS (${goals.length}) ═══`,
      ...goals.flatMap(g => [
        '',
        `Goal: ${g.text || g.title || ''} (target ${g.targetAccuracy || 80}%)`,
        ...(g.progress || []).map(p => `  ${fmt(p.date)}: ${p.accuracy}%${p.note ? ' — ' + p.note : ''}`),
      ]),
      '',
      `═══ SESSION HISTORY (${sessions.length}) ═══`,
      ...sessions.flatMap(s => [
        '',
        `— ${fmt(s.date)} (${dur(s.duration)}) —`,
        ...(s.materialsUsed || []).map(m => `  • ${m.title}${m.needsRepeat ? ' [REPEAT]' : ''}`),
        s.sessionNotes ? `  Notes: ${s.sessionNotes}` : null,
        s.homeworkNotes ? `  Homework: ${s.homeworkNotes}` : null,
      ].filter(Boolean)),
    ]
    return lines.join('\n')
  }

  const exportArchive = async (client) => {
    const filename = `Archive-${client.name.replace(/\s/g, '-')}-${new Date().toISOString().slice(0,10)}.txt`
    const ok = await window.api?.exportReport(filename, buildArchive(client))
    if (ok) setArchiveDone(true)
    return ok
  }

  const confirmDelete = () => {
    store.deleteClient(deletingClient.id)
    setDeletingClient(null)
    setArchiveDone(false)
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Clients</h1>
        <button className="btn-primary" onClick={() => setShowForm(true)}>+ Add Client</button>
      </div>

      {showForm && (
        <ClientForm
          title="Add Client" submitLabel="Add Client"
          onSubmit={(f) => { store.addClient(f.name, f.dob, f.notes); setShowForm(false) }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {editingClient && (
        <ClientForm
          initial={editingClient} title={`Edit: ${editingClient.name}`} submitLabel="Save Changes"
          onSubmit={(f) => { store.updateClient(editingClient.id, f); setEditingClient(null) }}
          onCancel={() => setEditingClient(null)}
        />
      )}

      {deletingClient && (
        <div className="modal-backdrop" onClick={() => { setDeletingClient(null); setArchiveDone(false) }}>
          <div className="modal modal-danger" onClick={e => e.stopPropagation()}>
            <h2>Delete {deletingClient.name}?</h2>
            <p className="delete-warning">
              This permanently removes the client, their session history, and goals.
              Their materials stay in the library.
            </p>
            <p className="delete-hint">
              {archiveDone
                ? '✓ Archive exported. You can now delete safely.'
                : 'Export an archive first — it saves all their info, goals, and session reports to a text file.'}
            </p>
            <div className="form-actions">
              <button className="btn-secondary" onClick={() => { setDeletingClient(null); setArchiveDone(false) }}>Cancel</button>
              {!archiveDone && (
                <button className="btn-primary" onClick={() => exportArchive(deletingClient)}>💾 Export Archive First</button>
              )}
              <button className="btn-danger" onClick={confirmDelete}>
                {archiveDone ? 'Delete Client' : 'Delete Without Archive'}
              </button>
            </div>
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
              <div key={client.id} className="client-card">
                <div className="client-card-topbar">
                  <button className="btn-icon" title="Edit client" onClick={() => setEditingClient(client)}>✎</button>
                  <button className="btn-icon btn-delete" title="Delete client" onClick={() => { setDeletingClient(client); setArchiveDone(false) }}>✕</button>
                </div>
                <div className="client-card-main" onClick={() => onOpenClient(client.id)}>
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
                <button
                  className="btn-start-session"
                  onClick={e => { e.stopPropagation(); onStartSession(client.id) }}
                >
                  ▶ Start Session
                </button>
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
