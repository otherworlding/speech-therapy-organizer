import React, { useState } from 'react'

// 15–30 in 5s, then every 5 minutes up to 90
const DURATIONS = [15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90]

export default function SessionSetup({ client, store, onStart, onCancel }) {
  const [tools, setTools] = useState({
    sessionType: 'online',
    timer: true, timerMins: 45,
    trials: false,
    tokens: false, tokenGoal: 5,
    cues: false,
  })

  const toggle = (key) => setTools(t => ({ ...t, [key]: !t[key] }))
  const set = (key, val) => setTools(t => ({ ...t, [key]: val }))

  // A queued plan for this client — numbered the same way as their Planned Sessions
  // list. If one's already linked to an appointment happening today, default to it
  // (still changeable); otherwise start with nothing selected.
  const clientPlanned = (store?.plannedSessions || [])
    .filter(p => p.clientId === client.id)
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
  const todayStr = new Date().toISOString().slice(0, 10)
  const todaysLinked = clientPlanned.find(p => {
    if (!p.appointmentId) return false
    const appt = (store?.appointments || []).find(a => a.id === p.appointmentId)
    return appt?.date === todayStr
  })
  const [plannedSessionId, setPlannedSessionId] = useState(todaysLinked?.id || '')

  return (
    <div className="modal-backdrop">
      <div className="modal session-setup-modal">
        <div className="setup-header">
          <div className="client-avatar" style={{ width: 48, height: 48, fontSize: 20 }}>
            {client.name[0].toUpperCase()}
          </div>
          <div>
            <h2>Start Session</h2>
            <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>{client.name}</div>
          </div>
        </div>

        <div className="setup-type-row">
          <button type="button" className={`open-mode-btn ${tools.sessionType === 'online' ? 'active' : ''}`}
            onClick={() => set('sessionType', 'online')}>💻 Online</button>
          <button type="button" className={`open-mode-btn ${tools.sessionType === 'in-person' ? 'active' : ''}`}
            onClick={() => set('sessionType', 'in-person')}>🤝 In-Person</button>
        </div>

        <p className="setup-subtitle">Choose which tools to use in this session:</p>

        <div className="setup-tools">
          <ToolRow
            icon="⏱" label="Session Timer" active={tools.timer}
            onToggle={() => toggle('timer')}
          >
            {tools.timer && (
              <div className="tool-option">
                <label>Duration</label>
                <select
                  value={DURATIONS.includes(tools.timerMins) ? tools.timerMins : 'custom'}
                  onChange={e => {
                    if (e.target.value === 'custom') set('timerCustom', true)
                    else { set('timerCustom', false); set('timerMins', parseInt(e.target.value)) }
                  }}
                >
                  {DURATIONS.map(m => <option key={m} value={m}>{m} min</option>)}
                  <option value="custom">Custom…</option>
                </select>
                {(tools.timerCustom || !DURATIONS.includes(tools.timerMins)) && (
                  <input
                    type="number" min="1" max="240" className="custom-mins-input"
                    value={tools.timerMins}
                    onChange={e => set('timerMins', Math.max(1, parseInt(e.target.value) || 1))}
                    placeholder="minutes"
                  />
                )}
              </div>
            )}
          </ToolRow>

          <ToolRow
            icon="🎯" label="Trial Counter" description="Track correct & incorrect responses"
            active={tools.trials} onToggle={() => toggle('trials')}
          />

          <ToolRow
            icon="⭐" label="Token Board" active={tools.tokens}
            onToggle={() => toggle('tokens')}
          >
            {tools.tokens && (
              <div className="tool-option">
                <label>Tokens needed</label>
                <select value={tools.tokenGoal} onChange={e => set('tokenGoal', parseInt(e.target.value))}>
                  {[3,4,5,6,7,8,10].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            )}
          </ToolRow>

          <ToolRow
            icon="🔒" label="Clinician Cues" description="Private notes & material cues — hidden from screen share"
            active={tools.cues} onToggle={() => toggle('cues')}
          />
        </div>

        {clientPlanned.length > 0 && (
          <label style={{ display: 'block', marginTop: 18 }}>
            Load a planned session <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span>
            <select value={plannedSessionId} onChange={e => setPlannedSessionId(e.target.value)}>
              <option value="">— start fresh —</option>
              {clientPlanned.map((p, i) => (
                <option key={p.id} value={p.id}>
                  {p.id === todaysLinked?.id ? '📌 ' : ''}Session {i + 1} ({(p.materialIds || []).length} item{(p.materialIds || []).length === 1 ? '' : 's'})
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="form-actions" style={{ marginTop: 24 }}>
          <button className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn-start-session-large" onClick={() => onStart(tools, plannedSessionId || null)}>
            ▶ Start Session
          </button>
        </div>
      </div>
    </div>
  )
}

function ToolRow({ icon, label, description, active, onToggle, children }) {
  return (
    <div className={`setup-tool-row ${active ? 'active' : ''}`}>
      <div className="setup-tool-header" onClick={onToggle}>
        <span className="setup-tool-icon">{icon}</span>
        <div className="setup-tool-info">
          <div className="setup-tool-label">{label}</div>
          {description && <div className="setup-tool-desc">{description}</div>}
        </div>
        <div className={`setup-toggle ${active ? 'on' : 'off'}`}>
          <div className="setup-toggle-knob" />
        </div>
      </div>
      {active && children && <div className="setup-tool-options">{children}</div>}
    </div>
  )
}
