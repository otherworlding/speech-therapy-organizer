import React, { useEffect, useRef, useState, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
// Bundle the worker into the main thread — real Workers fail under file:// in the
// packaged app, so pdf.js runs everything in-process. Reliable everywhere.
import * as pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs'

if (pdfjsWorker?.WorkerMessageHandler) {
  globalThis.pdfjsWorker = { WorkerMessageHandler: pdfjsWorker.WorkerMessageHandler }
} else {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
}

// Continuous vertical scroll: every page stacked top-to-bottom.
// zoom scales all pages; up/down (and PageUp/Down) jump page-to-page.
export default function PdfViewer({ filePath, onPageInfo, zoom = 1 }) {
  const [pdf, setPdf] = useState(null)
  const [numPages, setNumPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const scrollRef = useRef(null)
  const pageEls = useRef([])       // wrapper divs per page
  const canvasEls = useRef([])     // canvases per page
  const currentPage = useRef(1)

  // Load the document
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError(null); setPdf(null)
      try {
        const buf = await window.api.readFileBinary(filePath)
        const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise
        if (cancelled) return
        setPdf(doc); setNumPages(doc.numPages)
        onPageInfo?.(1, doc.numPages)
      } catch (e) {
        if (!cancelled) setError(`Could not load PDF: ${e?.message || e}`)
      }
      if (!cancelled) setLoading(false)
    }
    if (filePath) load()
    return () => { cancelled = true }
  }, [filePath])

  // Render every page (re-renders on zoom change; PDFs here are small)
  useEffect(() => {
    if (!pdf) return
    let cancelled = false
    const tasks = []
    ;(async () => {
      const dpr = window.devicePixelRatio || 1
      const cw = (scrollRef.current?.clientWidth || 700) - 24
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        if (cancelled) return
        const base = page.getViewport({ scale: 1 })
        const cssScale = Math.min(cw / base.width, 1.6) * zoom
        const vp = page.getViewport({ scale: cssScale * dpr })
        const canvas = canvasEls.current[i - 1]
        if (!canvas) continue
        canvas.width = vp.width; canvas.height = vp.height
        canvas.style.width = `${vp.width / dpr}px`
        canvas.style.height = `${vp.height / dpr}px`
        const t = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp })
        tasks.push(t)
        try { await t.promise } catch {}
      }
    })()
    return () => { cancelled = true; tasks.forEach(t => { try { t.cancel() } catch {} }) }
  }, [pdf, zoom])

  // Track which page is centered, for the page indicator
  const onScroll = useCallback(() => {
    const sc = scrollRef.current
    if (!sc) return
    const mid = sc.scrollTop + sc.clientHeight / 2
    let p = 1
    for (let i = 0; i < pageEls.current.length; i++) {
      const el = pageEls.current[i]
      if (el && el.offsetTop <= mid) p = i + 1
    }
    if (p !== currentPage.current) { currentPage.current = p; onPageInfo?.(p, numPages) }
  }, [numPages])

  // Up/Down (and PageUp/Down) turn pages within the doc
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return
      if (!['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp'].includes(e.key)) return
      const delta = (e.key === 'ArrowDown' || e.key === 'PageDown') ? 1 : -1
      const target = Math.max(1, Math.min(numPages, currentPage.current + delta))
      const el = pageEls.current[target - 1]
      if (el && scrollRef.current) {
        scrollRef.current.scrollTo({ top: el.offsetTop - 8, behavior: 'smooth' })
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [numPages])

  if (!window.api) return <div className="viewer-unavailable">PDF viewer requires the desktop app.</div>
  if (loading) return <div className="viewer-loading"><div className="spinner" />Loading PDF…</div>
  if (error) return <div className="viewer-error">{error}</div>

  return (
    <div className="pdf-scroll" ref={scrollRef} onScroll={onScroll}>
      {Array.from({ length: numPages }, (_, i) => (
        <div key={i} className="pdf-page" ref={el => (pageEls.current[i] = el)}>
          <canvas ref={el => (canvasEls.current[i] = el)} className="pdf-canvas" />
        </div>
      ))}
    </div>
  )
}
