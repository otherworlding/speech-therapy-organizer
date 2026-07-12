import React, { useState } from 'react'
import SessionAttachments from '../components/SessionAttachments'

const IMG_EXT = /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i
const FILE_ICONS = { pdf: '📄', pptx: '📊', ppt: '📊', docx: '📝', doc: '📝', mp4: '🎬', mov: '🎬', avi: '🎬', mp3: '🎵', wav: '🎵', m4a: '🎵' }
const extOf = p => (p || '').split('.').pop().toLowerCase()

// Small thumbnail next to a report's material name — same logic as the workspace mini-thumb
function ReportThumb({ material }) {
  if (!material) return <span className="report-mat-icon">📎</span>
  if (material.type === 'youtube' && material.videoId) return <span className="report-mat-thumb"><img src={`https://img.youtube.com/vi/${material.videoId}/hqdefault.jpg`} alt="" onError={e => { e.target.style.display = 'none' }} /></span>
  if (material.filePath && IMG_EXT.test(material.filePath)) return <span className="report-mat-thumb"><img src={`file://${material.filePath}`} alt="" /></span>
  const icon = material.type === 'youtube' ? '▶' : material.type === 'folder' ? '📁' : material.type === 'html-game' ? '🎮' : (FILE_ICONS[extOf(material.filePath)] || '📎')
  return <span className="report-mat-icon">{icon}</span>
}

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
function ReportEditor({ session, materials, onSave, onCancel }) {
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
              <ReportThumb material={materials.find(x => x.id === m.materialId)} />
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
    sessionType: 'online',
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
      sessionType: f.sessionType,
      sessionNotes: f.sessionNotes,
      homeworkNotes: f.homeworkNotes,
      materialsUsed: [],
      attachments: [],
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
          <label>Session Type
            <div className="block-preset-row">
              <button type="button" className={`block-preset ${f.sessionType === 'online' ? 'active' : ''}`}
                onClick={() => setF(p => ({ ...p, sessionType: 'online' }))}>💻 Online</button>
              <button type="button" className={`block-preset ${f.sessionType === 'in-person' ? 'active' : ''}`}
                onClick={() => setF(p => ({ ...p, sessionType: 'in-person' }))}>🤝 In-Person</button>
            </div>
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

// One session's report card — used both flat and inside the per-client tree
function SessionCard({ session, client, materials, isOpen, isEditing, onToggle, onEdit, onSave, onCancelEdit, onDelete, onExport }) {
  const trialTotals = (session.materialsUsed || []).reduce((acc, m) => ({
    correct: acc.correct + (m.trials?.correct || 0),
    incorrect: acc.incorrect + (m.trials?.incorrect || 0),
  }), { correct: 0, incorrect: 0 })
  const totalTrials = trialTotals.correct + trialTotals.incorrect
  const repeats = (session.materialsUsed || []).filter(m => m.needsRepeat)

  return (
    <div className={`report-card ${isOpen ? 'open' : ''}`}>
      <div className="report-card-header" onClick={onToggle}>
        <div className="report-meta">
          <div className="report-client">{client?.name || 'Unknown'}{session.manualEntry && <span className="manual-tag"> ✎ manual</span>}</div>
          <div className="report-date">{fmt(session.date)}</div>
        </div>
        <div className="report-stats">
          <span className="report-stat report-type-badge">{session.sessionType === 'in-person' ? '🤝 In-Person' : '💻 Online'}</span>
          <span className="report-stat">⏱ {dur(session.duration)}</span>
          <span className="report-stat">📚 {(session.materialsUsed || []).length} materials</span>
          {totalTrials > 0 && <span className="report-stat">🎯 {pct(trialTotals)}</span>}
          {session.tokensEarned > 0 && <span className="report-stat">⭐ {session.tokensEarned}</span>}
          {repeats.length > 0 && <span className="report-stat repeat-badge">🔁 {repeats.length}</span>}
        </div>
        <button className="report-expand-btn">{isOpen ? '▲' : '▼'}</button>
      </div>

      {isOpen && isEditing && (
        <ReportEditor session={session} materials={materials} onSave={onSave} onCancel={onCancelEdit} />
      )}

      {isOpen && !isEditing && (
        <div className="report-detail">
          {(session.materialsUsed || []).length > 0 && (
            <div className="report-section">
              <div className="report-section-title">Materials Used</div>
              {session.materialsUsed.map((m, i) => (
                <div key={i} className={`report-material ${m.needsRepeat ? 'needs-repeat' : ''}`}>
                  <ReportThumb material={materials.find(x => x.id === m.materialId)} />
                  <span className="report-mat-name">{m.title}</span>
                  {(m.trials?.correct + m.trials?.incorrect) > 0 && (
                    <span className="report-mat-trials">{m.trials.correct}✓ {m.trials.incorrect}✗ ({pct(m.trials)})</span>
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
          {session.homeworkFolder && (
            <div className="report-section">
              <button className="ws-reveal" onClick={() => window.api?.revealInFinder(session.homeworkFolder)}>📂 Reveal homework folder</button>
            </div>
          )}
          {(session.attachments || []).length > 0 && (
            <div className="report-section">
              <div className="report-section-title">Attachments</div>
              <SessionAttachments sessionId={session.id} attachments={session.attachments} light />
            </div>
          )}
          <div className="report-actions">
            <button className="btn-secondary" onClick={onDelete}>Delete</button>
            <button className="btn-secondary" onClick={onEdit}>✎ Edit</button>
            <button className="btn-primary" onClick={onExport}>💾 Export</button>
          </div>
        </div>
      )}
    </div>
  )
}

// One client's collapsible branch of the report tree
function ClientReportGroup({ client, sessions, materials, open, onToggleOpen, expandedId, editingId, onToggleSession, onEdit, onSave, onCancelEdit, onDelete, onExport }) {
  const repeatCount = sessions.reduce((n, s) => n + (s.materialsUsed || []).filter(m => m.needsRepeat).length, 0)
  const homeworkSessions = sessions.filter(s => s.homeworkFolder || (s.homeworkMaterials || []).length)
  return (
    <div className="report-tree-client">
      <div className="report-tree-head" onClick={onToggleOpen}>
        <span className="ws-caret">{open ? '▾' : '▸'}</span>
        <span className="ws-chip-avatar">{client?.name?.[0]?.toUpperCase() || '?'}</span>
        <span className="report-tree-name">{client?.name || 'Unknown'}</span>
        <span className="ws-count">{sessions.length} session{sessions.length !== 1 ? 's' : ''}</span>
        {homeworkSessions.length > 0 && <span className="ws-count">📤 {homeworkSessions.length}</span>}
        {repeatCount > 0 && <span className="report-stat repeat-badge">🔁 {repeatCount}</span>}
      </div>
      {open && (
        <div className="report-tree-body">
          {sessions.map(session => (
            <SessionCard key={session.id} session={session} client={client} materials={materials}
              isOpen={expandedId === session.id} isEditing={editingId === session.id}
              onToggle={() => onToggleSession(session.id)}
              onEdit={() => onEdit(session.id)}
              onSave={(updates) => onSave(session.id, updates)}
              onCancelEdit={onCancelEdit}
              onDelete={() => onDelete(session.id)}
              onExport={() => onExport(session)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function ReportsPage({ store }) {
  const [clientFilter, setClientFilter] = useState('all')
  const [expandedId, setExpandedId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [openClients, setOpenClients] = useState(new Set())

  const sessions = [...(store.sessions||[])].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  const filtered = clientFilter === 'all' ? sessions : sessions.filter(s => s.clientId === clientFilter)
  const treeMode = clientFilter === 'all'

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
  const toggleSession = (id) => { setExpandedId(e => e === id ? null : id); setEditingId(null) }
  const toggleClientOpen = (clientId) => setOpenClients(prev => { const n = new Set(prev); n.has(clientId) ? n.delete(clientId) : n.add(clientId); return n })

  // Group sessions by client for the tree view
  const byClient = []
  if (treeMode) {
    const seen = new Set()
    for (const s of filtered) {
      if (seen.has(s.clientId)) continue
      seen.add(s.clientId)
      byClient.push({
        client: store.clients.find(c => c.id === s.clientId),
        clientId: s.clientId,
        sessions: filtered.filter(x => x.clientId === s.clientId),
      })
    }
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
      ) : treeMode ? (
        <div className="report-tree">
          {byClient.map(({ client, clientId, sessions: clientSessions }) => (
            <ClientReportGroup key={clientId} client={client} sessions={clientSessions} materials={store.materials}
              open={openClients.has(clientId)} onToggleOpen={() => toggleClientOpen(clientId)}
              expandedId={expandedId} editingId={editingId}
              onToggleSession={toggleSession} onEdit={setEditingId} onSave={saveEdit}
              onCancelEdit={() => setEditingId(null)} onDelete={store.deleteSession} onExport={exportSession}
            />
          ))}
        </div>
      ) : (
        <div className="reports-list">
          {filtered.map(session => {
            const client = store.clients.find(c => c.id === session.clientId)
            return (
              <SessionCard key={session.id} session={session} client={client} materials={store.materials}
                isOpen={expandedId === session.id} isEditing={editingId === session.id}
                onToggle={() => toggleSession(session.id)}
                onEdit={() => setEditingId(session.id)}
                onSave={(updates) => saveEdit(session.id, updates)}
                onCancelEdit={() => setEditingId(null)}
                onDelete={() => store.deleteSession(session.id)}
                onExport={() => exportSession(session)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
