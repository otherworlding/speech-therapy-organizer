import React, { useState, useEffect, useRef } from 'react'
import PdfViewer from './PdfViewer'
import PptxViewer from './PptxViewer'
import ImageDeckViewer from './ImageDeckViewer'

const IMG_EXT = /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i
const VIDEO_EXT = /\.(mp4|mov|avi|webm)$/i
const AUDIO_EXT = /\.(mp3|wav|m4a|ogg)$/i

function getType(material) {
  if (material.type === 'image-deck') return 'deck'
  const p = material.filePath || ''
  if (!p) return 'none'
  const ext = p.split('.').pop().toLowerCase()
  if (ext === 'pdf') return 'pdf'
  if (ext === 'pptx' || ext === 'ppt') return 'pptx'
  if (IMG_EXT.test(p)) return 'image'
  if (VIDEO_EXT.test(p)) return 'video'
  if (AUDIO_EXT.test(p)) return 'audio'
  return 'unknown'
}

export default function FileViewer({ material, isFullscreen, onToggleFullscreen }) {
  const [pageInfo, setPageInfo] = useState(null)
  const videoRef = useRef(null)
  const type = material ? getType(material) : 'none'

  useEffect(() => { setPageInfo(null) }, [material?.id])

  if (!material) return (
    <div className="viewer-empty">
      <div style={{ fontSize: 52 }}>🎯</div>
      <p>Click a material below to open it</p>
    </div>
  )

  const handlePageInfo = (page, total) => setPageInfo(total > 1 ? `${page} / ${total}` : null)

  return (
    <div className={`file-viewer ${isFullscreen ? 'fullscreen' : ''}`}>
      <div className="viewer-topbar">
        <span className="viewer-title">{material.title}</span>
        {pageInfo && <span className="viewer-pageinfo">{pageInfo}</span>}
        <button className="viewer-fs-btn" onClick={onToggleFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
          {isFullscreen ? '⛶' : '⛶'}
        </button>
      </div>

      <div className="viewer-body">
        {type === 'pdf' && <PdfViewer filePath={material.filePath} onPageInfo={handlePageInfo} />}
        {type === 'pptx' && <PptxViewer filePath={material.filePath} onPageInfo={handlePageInfo} />}
        {type === 'image' && (
          <div className="image-viewer">
            <img src={`file://${material.filePath}`} alt={material.title} className="viewer-image" />
          </div>
        )}
        {type === 'deck' && (
          <ImageDeckViewer imagePaths={material.imagePaths} onPageInfo={handlePageInfo} />
        )}
        {type === 'video' && (
          <div className="video-viewer">
            <video ref={videoRef} src={`file://${material.filePath}`} controls className="viewer-video" />
          </div>
        )}
        {type === 'audio' && (
          <div className="audio-viewer">
            <div className="audio-icon">🎵</div>
            <div className="audio-title">{material.title}</div>
            <audio src={`file://${material.filePath}`} controls className="viewer-audio" />
          </div>
        )}
        {type === 'none' && (
          <div className="viewer-empty">
            <div style={{ fontSize: 48 }}>📎</div>
            <p>No file attached to this material.</p>
          </div>
        )}
        {type === 'unknown' && (
          <div className="viewer-empty">
            <div style={{ fontSize: 48 }}>📄</div>
            <p>{material.filePath?.split('/').pop()}</p>
            <button className="btn-primary" onClick={() => window.api?.openFile(material.filePath)}>
              Open in Default App
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
