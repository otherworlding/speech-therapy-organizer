import React, { useState } from 'react'

export default function ClinicianCues({ materialNotes, sessionNotes, onSessionNotesChange }) {
  const [tab, setTab] = useState('notes')

  return (
    <div className="tool-panel clinician-cues">
      <div className="tool-title">🔒 Clinician Only</div>
      <div className="cues-tabs">
        <button className={`cues-tab ${tab === 'notes' ? 'active' : ''}`} onClick={() => setTab('notes')}>Session Notes</button>
        <button className={`cues-tab ${tab === 'mat' ? 'active' : ''}`} onClick={() => setTab('mat')}>Material Notes</button>
      </div>
      {tab === 'notes' && (
        <textarea
          className="cues-textarea"
          placeholder="Type your session notes here… (not visible to client)"
          value={sessionNotes}
          onChange={e => onSessionNotesChange(e.target.value)}
        />
      )}
      {tab === 'mat' && (
        <div className="cues-mat-notes">
          {materialNotes || <em style={{ color: '#ffffff44' }}>No notes for current material.</em>}
        </div>
      )}
    </div>
  )
}
