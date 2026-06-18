import React, { useState } from 'react'

export default function SessionSetup({ client, onStart, onCancel }) {
  const [tools, setTools] = useState({
    timer: true, timerMins: 45,
    trials: true,
    tokens: true, tokenGoal: 5,
    cues: true,
  })

  const toggle = (key) => setTools(t => ({ ...t, [key]: !t[key] }))
  const set = (key, val) => setTools(t => ({ ...t, [key]: val }))

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

        <p className="setup-subtitle">Choose which tools to use in this session:</p>

        <div className="setup-tools">
          <ToolRow
            icon="⏱" label="Session Timer" active={tools.timer}
            onToggle={() => toggle('timer')}
          >
            {tools.timer && (
              <div className="tool-option">
                <label>Duration</label>
                <select value={tools.timerMins} onChange={e => set('timerMins', parseInt(e.target.value))}>
                  {[15,20,25,30,45,60].map(m => <option key={m} value={m}>{m} min</option>)}
                </select>
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

        <div className="form-actions" style={{ marginTop: 24 }}>
          <button className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn-start-session-large" onClick={() => onStart(tools)}>
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
