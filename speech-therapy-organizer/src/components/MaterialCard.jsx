import React from 'react'
import { externalLabel } from '../utils/fileTypes'

const EXT_ICONS = {
  pdf: '📄', pptx: '📊', ppt: '📊', docx: '📝',
  jpg: '🖼', jpeg: '🖼', png: '🖼', gif: '🖼',
  mp4: '🎬', mov: '🎬', avi: '🎬',
  mp3: '🎵', wav: '🎵', m4a: '🎵',
  txt: '📝',
}

const CATEGORY_COLORS = {
  Language: '#4f8ef7',
  Comprehension: '#34c97a',
  Pragmatic: '#f7a84f',
  Age: '#c97adb',
}

function getExt(filePath) {
  if (!filePath) return ''
  return filePath.split('.').pop().toLowerCase()
}

export default function MaterialCard({ material, onOpen, onDelete, onAssign, showAssign, onToggleExternal }) {
  const ext = getExt(material.filePath)
  const icon = EXT_ICONS[ext] || '📎'
  const catColor = CATEGORY_COLORS[material.category] || '#888'
  const canToggle = ext === 'pptx' && onToggleExternal

  return (
    <div className="material-card">
      <div className="material-card-icon">{icon}</div>
      <div className="material-card-body">
        <div className="material-card-title">{material.title}</div>
        <div className="material-card-meta">
          <span className="tag" style={{ background: catColor }}>{material.category}</span>
          {material.openExternal
            ? <span className="tag tag-external">↗ {externalLabel(material.filePath)}</span>
            : ext === 'pptx' && <span className="tag tag-inline">▶ In-app</span>
          }
          {material.ageRange && <span className="tag tag-age">Age {material.ageRange}</span>}
          {material.tags && material.tags.map(t => (
            <span key={t} className="tag tag-plain">{t}</span>
          ))}
        </div>
        {material.notes && <div className="material-card-notes">{material.notes}</div>}
      </div>
      <div className="material-card-actions">
        {canToggle && (
          <button
            className="btn-icon btn-mode"
            title={material.openExternal ? 'Switch to in-app slideshow' : 'Switch to open externally'}
            onClick={() => onToggleExternal(material.id, !material.openExternal)}
          >
            {material.openExternal ? '▶' : '↗'}
          </button>
        )}
        {material.filePath && (
          <button className="btn-icon" title="Open file" onClick={() => onOpen(material)}>⋯</button>
        )}
        {showAssign && (
          <button className="btn-icon btn-assign" title="Assign to client" onClick={() => onAssign(material)}>+</button>
        )}
        {onDelete && (
          <button className="btn-icon btn-delete" title="Delete" onClick={() => onDelete(material.id)}>✕</button>
        )}
      </div>
    </div>
  )
}
