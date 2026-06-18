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

export default function ReportsPage({ store }) {
  const [clientFilter, setClientFilter] = useState('all')
  const [expandedId, setExpandedId] = useState(null)

  const sessions = [...(store.sessions||[])].reverse()
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

  return (
    <div className="page">
      <div className="page-header">
        <h1>Session Reports</h1>
        <select className="search-input" value={clientFilter} onChange={e=>setClientFilter(e.target.value)}>
          <option value="all">All Clients</option>
          {store.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <p>No sessions recorded yet. Start a session to begin tracking.</p>
        </div>
      ) : (
        <div className="reports-list">
          {filtered.map(session => {
            const client = store.clients.find(c => c.id === session.clientId)
            const isOpen = expandedId === session.id
            const trialTotals = (session.materialsUsed||[]).reduce((acc,m)=>({
              correct: acc.correct+(m.trials?.correct||0),
              incorrect: acc.incorrect+(m.trials?.incorrect||0),
            }), { correct:0, incorrect:0 })
            const totalTrials = trialTotals.correct+trialTotals.incorrect
            const repeats = (session.materialsUsed||[]).filter(m=>m.needsRepeat)

            return (
              <div key={session.id} className={`report-card ${isOpen?'open':''}`}>
                <div className="report-card-header" onClick={()=>setExpandedId(isOpen?null:session.id)}>
                  <div className="report-meta">
                    <div className="report-client">{client?.name||'Unknown'}</div>
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

                {isOpen && (
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
