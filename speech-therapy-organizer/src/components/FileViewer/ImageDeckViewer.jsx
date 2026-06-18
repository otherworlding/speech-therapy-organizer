import React, { useState } from 'react'

export default function ImageDeckViewer({ imagePaths = [], onPageInfo }) {
  const [idx, setIdx] = useState(0)

  if (!imagePaths.length) return <div className="viewer-error">No images in this deck.</div>

  const go = (delta) => {
    const next = Math.max(0, Math.min(imagePaths.length - 1, idx + delta))
    setIdx(next)
    onPageInfo?.(next + 1, imagePaths.length)
  }

  return (
    <div className="image-deck-viewer">
      <img
        src={`file://${imagePaths[idx]}`}
        alt={`Image ${idx + 1}`}
        className="deck-image"
        onError={e => { e.target.style.opacity = 0.3 }}
      />
      {imagePaths.length > 1 && (
        <div className="viewer-page-bar">
          <button className="page-btn" onClick={() => go(-1)} disabled={idx === 0}>‹</button>
          <span>{idx + 1} / {imagePaths.length}</span>
          <button className="page-btn" onClick={() => go(1)} disabled={idx === imagePaths.length - 1}>›</button>
        </div>
      )}
    </div>
  )
}
