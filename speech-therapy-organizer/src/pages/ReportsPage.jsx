import React, { useState } from 'react'

function fmt(iso) { return iso ? new Date(iso).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '' }
function dur(secs) {
  if (!secs) return '—'
  const m = Math.floor(secs/60), s = secs%60
  return `${m}m ${s}s`
}
function pct(t) {
  const total = (t?.correct||0)+(t?.incorrect||0)
  return total ? Math.round(((t?.correct||0)/total)*100)+'%' : '—'
}

// ── Inline editor for an existing report ──
function ReportEditor({ session, onSave, onCancel }) {
  const [f, setF] = useState({
    sessionNotes: session.sessionNotes || '',
    homeworkNotes: session.homeworkNotes || '',
    materialsUsed: (session.materialsUsed || []).map(m => ({ ...m })),
  })
  const toggleRepeat = (i) => {
    setF(p => ({ ...p, materialsUsed: p.materialsUsed.map((m, j) => j === i ? { ...m, needsRepeat: !m.needsRepeat } : m) }))
  }
  return (
    <div className="report-detail report-editing">
      {f.materialsUsed.length > 0 && (
        <div className="report-section">
          <div className="report-section-title">Materials Used (click 🔁 to toggle repeat)</div>
          {f.materialsUsed.map((m, i) => (
            <div key={i} className={`report-material ${m.needsRepeat ? 'needs-repeat' : ''}`}>
              <span className="report-mat-name">{m.title}</span>
              <button className={`repeat-toggle ${m.needsRepeat ? 'on' : ''}`} onClick={() => toggleRepeat(i)}>🔁</button>
            </div>
          ))}
        </div>
      )}
      <div className="report-section">
        <div className="report-section-title">Session Notes</div>
        <textarea className="report-edit-area" rows={4} value={f.sessionNotes}
          onChange={e => setF(p => ({ ...p, sessionNotes: e.target.value }))}
          placeholder="Observations, progress, behavior…" />
      </div>
      <div className="report-section">
        <div className="report-section-title">Home Practice</div>
        <textarea className="report-edit-area" rows={3} value={f.homeworkNotes}
          onChange={e => setF(p => ({ ...p, homeworkNotes: e.target.value }))}
          placeholder="Homework sent to parents…" />
      </div>
      <div className="report-actions">
        <button className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" onClick={() => onSave(f)}>Save Changes</button>
      </div>
    </div>
  )
}

// ── Modal to add a manual report ──
function AddReportModal({ clients, onSave, onCancel }) {
  const [f, setF] = useState({
    clientId: clients[0]?.id || '',
    date: new Date().toISOString().slice(0, 10),
    durationMins: 45,
    sessionNotes: '',
    homeworkNotes: '',
  })
  const submit = (e) => {
    e.preventDefault()
    if (!f.clientId) return
    onSave({
      clientId: f.clientId,
      date: new Date(f.date + 'T12:00:00').toISOString(),
      duration: Number(f.durationMins) * 60,
      sessionNotes: f.sessionNotes,
      homeworkNotes: f.homeworkNotes,
      materialsUsed: [],
      manualEntry: true,
    })
  }
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Add Report</h2>
        <form onSubmit={submit}>
          <label>Client *
            <select value={f.clientId} onChange={e => setF(p => ({ ...p, clientId: e.target.value }))}>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>Date
            <input type="date" value={f.date} onChange={e => setF(p => ({ ...p, date: e.target.value }))} />
          </label>
          <label>Duration (minutes)
            <input type="number" min="1" max="240" value={f.durationMins}
              onChange={e => setF(p => ({ ...p, durationMins: e.target.value }))} />
          </label>
          <label>Session Notes
            <textarea rows={4} value={f.sessionNotes} onChange={e => setF(p => ({ ...p, sessionNotes: e.target.value }))}
              placeholder="What happened in this session…" />
          </label>
          <label>Home Practice
            <textarea rows={2} value={f.homeworkNotes} onChange={e => setF(p => ({ ...p, homeworkNotes: e.target.value }))}
              placeholder="Homework sent…" />
          </label>
          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
            <button type="submit" className="btn-primary">Add Report</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function ReportsPage({ store }) {
  const [clientFilter, setClientFilter] = useState('all')
  const [expandedId, setExpandedId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [showAdd, setShowAdd] = useState(false)

  const sessions = [...(store.sessions||[])].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  const filtered = clientFilter === 'all' ? sessions : sessions.filter(s => s.clientId === clientFilter)

  const exportSession = (session) => {
    const client = store.clients.find(c => c.id === session.clientId)
    const lines = [
      `Session Report`,
      `Client: ${client?.name || 'Unknown'}`,
      `Date: ${fmt(session.date)}`,
      `Duration: ${dur(session.duration)}`,
      `Tokens Earned: ${session.tokensEarned || 0}`,
      '',
      'Materials Used:',
      ...(session.materialsUsed||[]).map(m =>
        `  • ${m.title} — Trials: ${(m.trials?.correct||0)}✓ ${(m.trials?.incorrect||0)}✗ (${pct(m.trials)})${m.needsRepeat?' — REPEAT':''}`
      ),
      '',
      `Session Notes: ${session.sessionNotes || 'None'}`,
      '',
      `Home Practice: ${session.homeworkNotes || 'None'}`,
    ]
    const content = lines.join('\n')
    const filename = `Report-${client?.name?.replace(/\s/g,'-')||'client'}-${(session.date||'').slice(0,10)}.txt`
    window.api?.exportReport(filename, content)
  }

  const saveEdit = (sessionId, updates) => {
    store.updateSession(sessionId, updates)
    setEditingId(null)
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Session Reports</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <select className="search-input" value={clientFilter} onChange={e=>setClientFilter(e.target.value)}>
            <option value="all">All Clients</option>
            {store.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button className="btn-primary" onClick={() => setShowAdd(true)}>+ Add Report</button>
        </div>
      </div>

      {showAdd && (
        <AddReportModal
          clients={store.clients}
          onSave={(s) => { store.addSession(s); setShowAdd(false) }}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <p>No sessions recorded yet. Start a session or add a report manually.</p>
        </div>
      ) : (
        <div className="reports-list">
          {filtered.map(session => {
            const client = store.clients.find(c => c.id === session.clientId)
            const isOpen = expandedId === session.id
            const isEditing = editingId === session.id
            const trialTotals = (session.materialsUsed||[]).reduce((acc,m)=>({
              correct: acc.correct+(m.trials?.correct||0),
              incorrect: acc.incorrect+(m.trials?.incorrect||0),
            }), { correct:0, incorrect:0 })
            const totalTrials = trialTotals.correct+trialTotals.incorrect
            const repeats = (session.materialsUsed||[]).filter(m=>m.needsRepeat)

            return (
              <div key={session.id} className={`report-card ${isOpen?'open':''}`}>
                <div className="report-card-header" onClick={()=>{ setExpandedId(isOpen?null:session.id); setEditingId(null) }}>
                  <div className="report-meta">
                    <div className="report-client">{client?.name||'Unknown'}{session.manualEntry && <span className="manual-tag"> ✎ manual</span>}</div>
                    <div className="report-date">{fmt(session.date)}</div>
                  </div>
                  <div className="report-stats">
                    <span className="report-stat">⏱ {dur(session.duration)}</span>
                    <span className="report-stat">📚 {(session.materialsUsed||[]).length} materials</span>
                    {totalTrials > 0 && <span className="report-stat">🎯 {pct(trialTotals)}</span>}
                    {session.tokensEarned > 0 && <span className="report-stat">⭐ {session.tokensEarned}</span>}
                    {repeats.length > 0 && <span className="report-stat repeat-badge">🔁 {repeats.length}</span>}
                  </div>
                  <button className="report-expand-btn">{isOpen?'▲':'▼'}</button>
                </div>

                {isOpen && isEditing && (
                  <ReportEditor
                    session={session}
                    onSave={(updates) => saveEdit(session.id, updates)}
                    onCancel={() => setEditingId(null)}
                  />
                )}

                {isOpen && !isEditing && (
                  <div className="report-detail">
                    {(session.materialsUsed||[]).length > 0 && (
                      <div className="report-section">
                        <div className="report-section-title">Materials Used</div>
                        {session.materialsUsed.map((m,i) => (
                          <div key={i} className={`report-material ${m.needsRepeat?'needs-repeat':''}`}>
                            <span className="report-mat-name">{m.title}</span>
                            {(m.trials?.correct+m.trials?.incorrect) > 0 && (
                              <span className="report-mat-trials">
                                {m.trials.correct}✓ {m.trials.incorrect}✗ ({pct(m.trials)})
                              </span>
                            )}
                            {m.needsRepeat && <span className="repeat-tag">🔁 Repeat</span>}
                          </div>
                        ))}
                      </div>
                    )}
                    {session.sessionNotes && (
                      <div className="report-section">
                        <div className="report-section-title">Session Notes</div>
                        <p className="report-notes">{session.sessionNotes}</p>
                      </div>
                    )}
                    {session.homeworkNotes && (
                      <div className="report-section">
                        <div className="report-section-title">Home Practice Sent</div>
                        <p className="report-notes">{session.homeworkNotes}</p>
                      </div>
                    )}
                    <div className="report-actions">
                      <button className="btn-secondary" onClick={()=>store.deleteSession(session.id)}>Delete</button>
                      <button className="btn-secondary" onClick={()=>setEditingId(session.id)}>✎ Edit</button>
                      <button className="btn-primary" onClick={()=>exportSession(session)}>💾 Export</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
