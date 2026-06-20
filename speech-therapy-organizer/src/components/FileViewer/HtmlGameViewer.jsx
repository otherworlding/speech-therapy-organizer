import { useEffect, useRef } from 'react'

export default function HtmlGameViewer({ material }) {
  const containerRef = useRef(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    container.innerHTML = ''
    const wv = document.createElement('webview')
    wv.src = `file://${material.indexPath}`
    wv.style.cssText = 'width:100%;height:100%;border:none;display:block;'
    // Allow local file access so the game can load its own JS/CSS/assets
    wv.setAttribute('webpreferences', 'allowFileAccessFromFiles=yes, javascript=yes')
    container.appendChild(wv)
    return () => { container.innerHTML = '' }
  }, [material.indexPath])

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '4px 10px', background: 'rgba(0,0,0,0.3)', fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <span>🎮 {material.title}</span>
        <button
          style={{ background: 'none', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.5)', borderRadius: 4, padding: '2px 8px', fontSize: 11, cursor: 'pointer' }}
          onClick={() => window.api?.openFile(material.indexPath)}
        >
          Open in Browser ↗
        </button>
      </div>
      <div ref={containerRef} style={{ flex: 1, overflow: 'hidden' }} />
    </div>
  )
}
