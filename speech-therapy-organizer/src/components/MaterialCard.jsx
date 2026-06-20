import React, { useState } from 'react'
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

export default function MaterialCard({ material, onOpen, onDelete, onAssign, showAssign, onToggleExternal, hasLibreOffice, onConvertPptx }) {
  const [converting, setConverting] = useState(false)
  const isFolder = material.type === 'folder'
  const isHtmlGame = material.type === 'html-game'
  const ext = (isFolder || isHtmlGame) ? '' : getExt(material.filePath)
  const icon = isHtmlGame ? '🎮' : isFolder ? '📁' : (EXT_ICONS[ext] || '📎')
  const catColor = CATEGORY_COLORS[material.category] || '#888'
  const canToggle = ext === 'pptx' && onToggleExternal
  const canConvert = material.openExternal && ext === 'pptx' && hasLibreOffice && onConvertPptx

  const handleConvert = async () => {
    setConverting(true)
    await onConvertPptx(material.id, material.filePath)
    setConverting(false)
  }

  return (
    <div className="material-card">
      <div className="material-card-icon">{icon}</div>
      <div className="material-card-body">
        <div className="material-card-title">{material.title}</div>
        <div className="material-card-meta">
          <span className="tag" style={{ background: catColor }}>{material.category}</span>
          {isHtmlGame
            ? <span className="tag tag-html">🎮 Interactive</span>
            : isFolder
              ? <span className="tag tag-folder">📁 {material.items?.length ?? 0} files</span>
              : material.openExternal
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
        {canConvert && (
          <button className="btn-icon btn-convert" title="Convert to PDF (LibreOffice)" onClick={handleConvert} disabled={converting}>
            {converting ? '⏳' : '⇄'}
          </button>
        )}
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
