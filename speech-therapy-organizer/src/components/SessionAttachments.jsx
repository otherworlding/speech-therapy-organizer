import React, { useState } from 'react'

const IMG_EXT = /\.(jpg|jpeg|png|gif|bmp|webp|heic)$/i

function AttachmentThumb({ a }) {
  if (IMG_EXT.test(a.filename || '')) {
    return <img src={`file://${a.filePath}`} alt="" className="sa-thumb" onError={e => { e.target.style.display = 'none' }} />
  }
  return <div className="sa-thumb sa-thumb-icon">📄</div>
}

// Photos/notes attached to one session record. Editable during a live session;
// pass onAdd/onRemove={undefined} for a read-only view (e.g. inside a past report).
// The live session view is dark-themed; Reports is light-themed — pass light={true}
// there so text/borders render correctly against a white background.
export default function SessionAttachments({ sessionId, attachments = [], onAdd, onRemove, hint, light }) {
  const [dragOver, setDragOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const editable = !!onAdd

  const addFromPaths = async (paths) => {
    if (!paths.length) return
    setBusy(true)
    for (const p of paths) {
      const res = await window.api.addSessionAttachment({ sessionId, srcPath: p })
      if (res?.success) onAdd({ filename: res.filename, filePath: res.filePath, kind: res.kind })
    }
    setBusy(false)
  }

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false)
    const items = Array.from(e.dataTransfer.items || [])
    const paths = items.map(item => { try { return window.api.getFilePath(item.getAsFile()) } catch { return null } }).filter(Boolean)
    addFromPaths(paths)
  }

  const pickFile = async () => {
    const paths = await window.api.pickAttachmentFiles()
    addFromPaths(paths || [])
  }

  return (
    <div className={light ? 'sa-panel sa-panel-light' : 'tool-panel sa-panel'}>
      <div className={light ? 'sa-title-light' : 'tool-title'}>📎 Attachments {attachments.length > 0 && <span className="sa-count">{attachments.length}</span>}</div>
      {hint && <div className="sa-hint">{hint}</div>}
      {editable && (
        <div className={`sa-drop ${dragOver ? 'drag-over' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={pickFile}>
          {busy ? '⏳ Adding…' : '📷 Drop photos or notes here, or click to choose'}
        </div>
      )}
      {attachments.length > 0 && (
        <div className="sa-grid">
          {attachments.map(a => (
            <div key={a.id} className="sa-item" title={a.filename}
              onClick={() => window.api?.openFile(a.filePath)}>
              <AttachmentThumb a={a} />
              <span className="sa-name">{a.filename}</span>
              {onRemove && (
                <button className="sa-remove" onClick={e => { e.stopPropagation(); onRemove(a.id) }}>✕</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
