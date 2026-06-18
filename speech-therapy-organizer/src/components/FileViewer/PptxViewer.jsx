import React, { useEffect, useState } from 'react'
import { parsePptx } from '../../utils/pptxParser'

function Slide({ slide }) {
  const bg = slide.background
  return (
    <div className="pptx-slide" style={{
      background: bg.type === 'solid' ? bg.color : undefined,
      backgroundImage: bg.type === 'image' ? `url(${bg.data})` : undefined,
      backgroundSize: 'cover', backgroundPosition: 'center',
    }}>
      {slide.elements.map((el, i) => {
        if (el.type === 'image') return (
          <img key={i} src={el.src} alt="" style={{
            position: 'absolute',
            left: `${el.x}%`, top: `${el.y}%`,
            width: `${el.w}%`, height: `${el.h}%`,
            objectFit: 'contain',
          }} />
        )
        if (el.type === 'text') return (
          <div key={i} style={{
            position: 'absolute',
            left: `${el.x}%`, top: `${el.y}%`,
            width: `${el.w}%`,
            fontSize: `${Math.max(el.fontSize * 0.6, 10)}px`,
            fontWeight: el.bold ? 'bold' : 'normal',
            color: el.color,
            whiteSpace: 'pre-wrap', overflow: 'hidden', lineHeight: 1.3,
          }}>{el.text}</div>
        )
        return null
      })}
    </div>
  )
}

export default function PptxViewer({ filePath, onPageInfo }) {
  const [slides, setSlides] = useState([])
  const [idx, setIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError(null)
      try {
        const buf = await window.api.readFileBinary(filePath)
        const parsed = await parsePptx(buf.buffer || buf)
        if (cancelled) return
        setSlides(parsed)
        setIdx(0)
        onPageInfo?.(1, parsed.length)
      } catch (e) {
        if (!cancelled) setError('Could not parse this presentation.')
      }
      if (!cancelled) setLoading(false)
    }
    if (filePath) load()
    return () => { cancelled = true }
  }, [filePath])

  const go = (delta) => {
    const next = Math.max(0, Math.min(slides.length - 1, idx + delta))
    setIdx(next)
    onPageInfo?.(next + 1, slides.length)
  }

  if (!window.api) return <div className="viewer-unavailable">PPTX viewer requires the desktop app.</div>
  if (loading) return <div className="viewer-loading"><div className="spinner"/>Loading presentation…</div>
  if (error) return <div className="viewer-error">{error}<br/><small>Try opening it in Keynote or LibreOffice.</small></div>
  if (!slides.length) return <div className="viewer-error">No slides found in this file.</div>

  return (
    <div className="pptx-viewer">
      <div className="pptx-stage">
        <Slide slide={slides[idx]} />
      </div>
      {slides.length > 1 && (
        <div className="viewer-page-bar">
          <button className="page-btn" onClick={() => go(-1)} disabled={idx === 0}>‹</button>
          <span>Slide {idx + 1} / {slides.length}</span>
          <button className="page-btn" onClick={() => go(1)} disabled={idx === slides.length - 1}>›</button>
        </div>
      )}
      {slides.length > 1 && (
        <div className="pptx-thumb-strip">
          {slides.map((s, i) => (
            <div
              key={i}
              className={`pptx-thumb ${i === idx ? 'active' : ''}`}
              onClick={() => { setIdx(i); onPageInfo?.(i + 1, slides.length) }}
              style={{ background: s.background.type === 'solid' ? s.background.color : '#333' }}
            >
              {i + 1}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
