import React, { useState } from 'react'

// Confirm-before-send preview for the real (attachment-capable) Messages/iMessage
// send. Unlike the wa.me/mailto: buttons elsewhere, this is a genuine send fired by
// AppleScript, not a compose window the user still has to hit Send on — so this
// modal is the review step that stands in for that, showing exactly what's about to
// go out before anything actually sends. Shared by ClientMaterials' ShareMenu and
// SessionView's end-of-session HomeworkShare so the two can't drift apart.
export default function MessagesShare({ client, message, filePaths = [], onClose }) {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(null)
  const phone = (client.whatsapp || client.phone || '').replace(/[^\d+]/g, '')

  const send = async () => {
    if (!phone) return
    setBusy(true)
    const res = await window.api.sendMessage({ phone, text: message, filePaths })
    setBusy(false)
    if (res?.success) { setStatus('✓ Sent'); setTimeout(onClose, 1000) }
    else setStatus(`⚠ ${res?.error || 'Could not send — is Messages.app signed in?'}`)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>📱 Send via Messages</h2>
        <p className="settings-note">
          To: <strong>{client.name}</strong> {phone ? `(${phone})` : <span style={{ color: 'var(--danger)' }}>— no phone number on file</span>}
        </p>
        <div className="messages-preview">
          <pre className="messages-preview-text">{message}</pre>
          {filePaths.length > 0 && (
            <div className="messages-preview-files">
              📎 {filePaths.length} file{filePaths.length > 1 ? 's' : ''}: {filePaths.map(p => p.split('/').pop()).join(', ')}
            </div>
          )}
        </div>
        {status && <div className="fx-status" style={{ marginTop: 10 }}>{status}</div>}
        <div className="form-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy || !phone} onClick={send}>
            {busy ? 'Sending…' : '📤 Send via Messages'}
          </button>
        </div>
      </div>
    </div>
  )
}
