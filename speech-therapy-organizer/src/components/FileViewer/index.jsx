import React, { useState, useEffect, useRef } from 'react'
import PdfViewer from './PdfViewer'
import PptxViewer from './PptxViewer'
import ImageDeckViewer from './ImageDeckViewer'
import FolderViewer from './FolderViewer'
import HtmlGameViewer from './HtmlGameViewer'
import { externalLabel } from '../../utils/fileTypes'

const IMG_EXT = /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i
const VIDEO_EXT = /\.(mp4|mov|avi|webm)$/i
const AUDIO_EXT = /\.(mp3|wav|m4a|ogg)$/i

function getType(material) {
  if (material.type === 'youtube') return 'youtube'
  if (material.type === 'html-game') return 'html-game'
  if (material.type === 'folder') return 'folder'
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

const ZOOMABLE = new Set(['pdf', 'image'])

export default function FileViewer({ material, isFullscreen, onToggleFullscreen, store, onConverted }) {
  const [pageInfo, setPageInfo] = useState(null)
  const [apps, setApps] = useState({ keynote: false, powerpoint: false, libreoffice: false })
  const [zoom, setZoom] = useState(1)
  const videoRef = useRef(null)
  const type = material ? getType(material) : 'none'

  useEffect(() => { setPageInfo(null); setZoom(1) }, [material?.id])
  useEffect(() => {
    window.api?.checkApps?.().then(a => a && setApps(a))
  }, [])

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
        {ZOOMABLE.has(type) && !material.openExternal && (
          <div className="viewer-zoom">
            <span className="viewer-zoom-mag" title="Zoom">🔍</span>
            <input type="range" min="0.5" max="3" step="0.1" value={zoom}
              onChange={e => setZoom(parseFloat(e.target.value))} className="viewer-zoom-slider" />
            <button className="viewer-zoom-reset" onClick={() => setZoom(1)} title="Reset zoom">{Math.round(zoom * 100)}%</button>
          </div>
        )}
        <button className="viewer-fs-btn" onClick={onToggleFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
          ⛶
        </button>
      </div>

      <div className={`viewer-body ${type === 'folder' || type === 'html-game' ? 'viewer-body-folder' : ''}`}>
        {type === 'youtube' && (
          <div className="youtube-launch">
            <img className="youtube-launch-thumb" src={`https://img.youtube.com/vi/${material.videoId}/hqdefault.jpg`} alt="" onError={e => { e.target.style.display = 'none' }} />
            <div className="youtube-launch-icon">▶</div>
            <p className="youtube-launch-hint">Opens in its own window — pick that window when sharing this video over Zoom.</p>
            <button className="btn-primary" onClick={() => window.api?.openYouTubePlayer({ videoId: material.videoId, title: material.title })}>
              ▶ Play Video
            </button>
          </div>
        )}
        {type === 'html-game' && <HtmlGameViewer material={material} />}
        {type === 'folder' && <FolderViewer material={material} onPageInfo={handlePageInfo} store={store} onConverted={onConverted} />}
        {material.openExternal && type !== 'folder' && (
          <div className="viewer-external">
            <div className="viewer-external-icon">↗</div>
            <div className="viewer-external-label">{externalLabel(material.filePath)}</div>
            <p className="viewer-external-hint">Choose how to open this file:</p>
            <div className="viewer-external-btns">
              {apps.keynote && (
                <button className="btn-primary" onClick={() => window.api?.openWith(material.filePath, 'Keynote')}>
                  Open in Keynote
                </button>
              )}
              {apps.powerpoint && (
                <button className="btn-primary" onClick={() => window.api?.openWith(material.filePath, 'Microsoft PowerPoint')}>
                  Open in PowerPoint
                </button>
              )}
              {apps.libreoffice && (
                <button className="btn-primary" onClick={() => window.api?.openWith(material.filePath, 'LibreOffice')}>
                  Open in LibreOffice
                </button>
              )}
              {!apps.keynote && !apps.powerpoint && !apps.libreoffice && (
                <button className="btn-primary" onClick={() => window.api?.openFile(material.filePath)}>
                  Open in Default App
                </button>
              )}
              <button className="btn-secondary viewer-external-default" onClick={() => window.api?.openFile(material.filePath)}>
                Other app…
              </button>
            </div>
          </div>
        )}
        {!material.openExternal && type === 'pdf' && <PdfViewer filePath={material.filePath} onPageInfo={handlePageInfo} zoom={zoom} />}
        {!material.openExternal && type === 'pptx' && <PptxViewer filePath={material.filePath} onPageInfo={handlePageInfo} />}
        {!material.openExternal && type === 'image' && (
          <div className="image-viewer" style={{ overflow: zoom > 1 ? 'auto' : 'hidden' }}>
            <img src={`file://${material.filePath}`} alt={material.title} className="viewer-image"
              style={{ transform: `scale(${zoom})`, transformOrigin: 'center top' }} />
          </div>
        )}
        {!material.openExternal && type === 'deck' && (
          <ImageDeckViewer imagePaths={material.imagePaths} onPageInfo={handlePageInfo} />
        )}
        {!material.openExternal && type === 'video' && (
          <div className="video-viewer">
            <video ref={videoRef} src={`file://${material.filePath}`} controls className="viewer-video" />
          </div>
        )}
        {!material.openExternal && type === 'audio' && (
          <div className="audio-viewer">
            <div className="audio-icon">🎵</div>
            <div className="audio-title">{material.title}</div>
            <audio src={`file://${material.filePath}`} controls className="viewer-audio" />
          </div>
        )}
        {!material.openExternal && type === 'none' && (
          <div className="viewer-empty">
            <div style={{ fontSize: 48 }}>📎</div>
            <p>No file attached to this material.</p>
          </div>
        )}
        {!material.openExternal && type === 'unknown' && (
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
