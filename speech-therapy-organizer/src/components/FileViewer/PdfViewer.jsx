import React, { useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

export default function PdfViewer({ filePath, onPageInfo }) {
  const canvasRef = useRef(null)
  const [pdf, setPdf] = useState(null)
  const [pageNum, setPageNum] = useState(1)
  const [numPages, setNumPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const renderRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError(null)
      try {
        const buf = await window.api.readFileBinary(filePath)
        const task = pdfjsLib.getDocument({ data: buf })
        const doc = await task.promise
        if (cancelled) return
        setPdf(doc)
        setNumPages(doc.numPages)
        setPageNum(1)
        onPageInfo?.(1, doc.numPages)
      } catch (e) {
        if (!cancelled) setError('Could not load PDF.')
      }
      if (!cancelled) setLoading(false)
    }
    if (filePath) load()
    return () => { cancelled = true }
  }, [filePath])

  useEffect(() => {
    if (!pdf || !canvasRef.current) return
    if (renderRef.current) { renderRef.current.cancel(); renderRef.current = null }
    let cancelled = false
    async function render() {
      try {
        const page = await pdf.getPage(pageNum)
        if (cancelled) return
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        const container = canvas.parentElement
        const scale = Math.min(container.clientWidth / page.getViewport({ scale: 1 }).width, 1.8)
        const vp = page.getViewport({ scale })
        canvas.width = vp.width; canvas.height = vp.height
        const task = page.render({ canvasContext: ctx, viewport: vp })
        renderRef.current = task
        await task.promise
      } catch {}
    }
    render()
    return () => { cancelled = true }
  }, [pdf, pageNum])

  const go = (delta) => {
    const next = Math.max(1, Math.min(numPages, pageNum + delta))
    setPageNum(next)
    onPageInfo?.(next, numPages)
  }

  if (!window.api) return <div className="viewer-unavailable">PDF viewer requires the desktop app.</div>
  if (loading) return <div className="viewer-loading"><div className="spinner"/>Loading PDF…</div>
  if (error) return <div className="viewer-error">{error}</div>

  return (
    <div className="pdf-viewer">
      <div className="pdf-canvas-wrap">
        <canvas ref={canvasRef} className="pdf-canvas" />
      </div>
      {numPages > 1 && (
        <div className="viewer-page-bar">
          <button className="page-btn" onClick={() => go(-1)} disabled={pageNum === 1}>‹</button>
          <span>{pageNum} / {numPages}</span>
          <button className="page-btn" onClick={() => go(1)} disabled={pageNum === numPages}>›</button>
        </div>
      )}
    </div>
  )
}
