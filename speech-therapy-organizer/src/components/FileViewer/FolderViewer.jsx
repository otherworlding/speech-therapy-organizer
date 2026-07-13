import React, { useState, useEffect } from 'react'
import PdfViewer from './PdfViewer'
import PptxViewer from './PptxViewer'

const IMG_EXT = /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i
const VIDEO_EXT = /\.(mp4|mov|avi|webm)$/i
const AUDIO_EXT = /\.(mp3|wav|m4a|ogg)$/i

const FILE_ICONS = {
  pdf: '📄', pptx: '📊', ppt: '📊', docx: '📝', doc: '📝',
  jpg: '🖼', jpeg: '🖼', png: '🖼', gif: '🖼', webp: '🖼',
  mp4: '🎬', mov: '🎬', avi: '🎬',
  mp3: '🎵', wav: '🎵', m4a: '🎵',
}

function getExt(filename) {
  return (filename || '').split('.').pop().toLowerCase()
}

function getIcon(filename) {
  return FILE_ICONS[getExt(filename)] || '📎'
}

function stripExt(name) {
  return (name || '').replace(/\.[^.]+$/, '')
}

function FilePreview({ item, onPageInfo }) {
  const ext = getExt(item.filename)
  const fp = item.filePath

  if (ext === 'pdf') return <PdfViewer filePath={fp} onPageInfo={onPageInfo} />
  if (ext === 'pptx' || ext === 'ppt') return <PptxViewer filePath={fp} onPageInfo={onPageInfo} />
  if (IMG_EXT.test(item.filename)) return (
    <div className="image-viewer">
      <img src={`file://${fp}`} alt={item.filename} className="viewer-image" />
    </div>
  )
  if (VIDEO_EXT.test(item.filename)) return (
    <div className="video-viewer">
      <video src={`file://${fp}`} controls className="viewer-video" />
    </div>
  )
  if (AUDIO_EXT.test(item.filename)) return (
    <div className="audio-viewer">
      <div className="audio-icon">🎵</div>
      <div className="audio-title">{item.filename}</div>
      <audio src={`file://${fp}`} controls className="viewer-audio" />
    </div>
  )
  return (
    <div className="viewer-empty">
      <div style={{ fontSize: 48 }}>{getIcon(item.filename)}</div>
      <p>{item.filename}</p>
      <button className="btn-primary" onClick={() => window.api?.openFile(fp)}>Open in Default App</button>
    </div>
  )
}

// Legacy bundle from before the real Finder tree existed — every file lives in one
// non-navigable material. "Convert to folder" rebuilds it as a real folder + individual
// materials (reusing the already-copied files, no need for the original source folder),
// which fixes both the lack of navigation and the freeze from loading everything at once.
export default function FolderViewer({ material, onPageInfo, store, onConverted }) {
  const items = material.items || []
  const [idx, setIdx] = useState(0)
  const [converting, setConverting] = useState(false)

  useEffect(() => {
    setIdx(0)
    onPageInfo?.(1, items.length)
  }, [material.id])

  const convertToFolder = () => {
    if (!store || converting) return
    setConverting(true)
    const folder = store.addFolder(material.title, '#4f8ef7', null)
    items.forEach(item => {
      store.addMaterial({ title: stripExt(item.filename), filePath: item.filePath, folderId: folder.id, category: 'Language', tags: [] })
    })
    store.deleteMaterial(material.id)
    onConverted?.()
  }

  if (!items.length) return (
    <div className="viewer-empty"><p>This folder is empty.</p></div>
  )

  const select = (i) => {
    setIdx(i)
    onPageInfo?.(i + 1, items.length)
  }

  return (
    <div className="folder-viewer">
      <div className="folder-file-list">
        <div className="folder-file-list-header">{material.title}</div>
        {store && (
          <button className="btn-primary folder-convert-btn" onClick={convertToFolder} disabled={converting}>
            {converting ? 'Converting…' : `🔧 Convert to real folder (${items.length} items)`}
          </button>
        )}
        {items.map((item, i) => (
          <div
            key={i}
            className={`folder-file-item ${i === idx ? 'active' : ''}`}
            onClick={() => select(i)}
          >
            <span className="folder-file-icon">{getIcon(item.filename)}</span>
            <span className="folder-file-name">{item.filename}</span>
          </div>
        ))}
      </div>
      <div className="folder-file-content">
        <FilePreview key={idx} item={items[idx]} onPageInfo={(p, t) => onPageInfo?.(p, t)} />
      </div>
    </div>
  )
}
