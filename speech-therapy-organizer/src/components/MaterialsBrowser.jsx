import React, { useState } from 'react'
import FileViewer from './FileViewer'

const CATEGORIES = ['Language', 'Comprehension', 'Pragmatic', 'Age']
const CATEGORY_ICONS = { Language: '💬', Comprehension: '🧠', Pragmatic: '🤝', Age: '🎂' }
const IMG_EXT = /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i

const FILE_ICONS = {
  pdf: '📄', pptx: '📊', ppt: '📊', docx: '📝', doc: '📝',
  mp4: '🎬', mov: '🎬', avi: '🎬',
  mp3: '🎵', wav: '🎵', m4a: '🎵',
}

function extOf(p) { return (p || '').split('.').pop().toLowerCase() }

function TilePreview({ material }) {
  // Image → thumbnail; deck → first image; folder/game → big icon
  if (material.type === 'html-game') return <div className="browse-tile-icon">🎮</div>
  if (material.type === 'folder') {
    const firstImg = (material.items || []).find(i => IMG_EXT.test(i.filename))
    return firstImg
      ? <div className="browse-tile-thumb browse-tile-folderthumb"><img src={`file://${firstImg.filePath}`} alt="" /><span className="browse-folder-overlay">📁 {material.items.length}</span></div>
      : <div className="browse-tile-icon">📁</div>
  }
  if (material.type === 'image-deck' && material.imagePaths?.length) {
    return <div className="browse-tile-thumb"><img src={`file://${material.imagePaths[0]}`} alt="" /></div>
  }
  if (material.filePath && IMG_EXT.test(material.filePath)) {
    return <div className="browse-tile-thumb"><img src={`file://${material.filePath}`} alt="" /></div>
  }
  return <div className="browse-tile-icon">{FILE_ICONS[extOf(material.filePath)] || '📎'}</div>
}

function itemToPseudoMaterial(item, parentTitle) {
  return { id: 'sub_' + item.filePath, title: item.filename, filePath: item.filePath, category: parentTitle }
}

export default function MaterialsBrowser({ store }) {
  const [category, setCategory] = useState(null)       // null = top level
  const [openFolder, setOpenFolder] = useState(null)   // folder-type material being browsed
  const [preview, setPreview] = useState(null)         // material or pseudo-material to preview
  const [fullscreen, setFullscreen] = useState(false)

  const countFor = (cat) => store.materials.filter(m => m.category === cat).length
  const materialsIn = (cat) => store.materials.filter(m => m.category === cat)

  // ── Preview modal (shared by all levels) ──
  const previewModal = preview && (
    <div className="browse-preview-backdrop" onClick={() => { setPreview(null); setFullscreen(false) }}>
      <div className={`browse-preview ${fullscreen ? 'fullscreen' : ''}`} onClick={e => e.stopPropagation()}>
        <FileViewer
          material={preview}
          isFullscreen={fullscreen}
          onToggleFullscreen={() => setFullscreen(f => !f)}
        />
        <button className="browse-preview-close" onClick={() => { setPreview(null); setFullscreen(false) }}>✕</button>
      </div>
    </div>
  )

  // ── Level 3: inside a folder material ──
  if (openFolder) {
    return (
      <div className="browse-root">
        <div className="browse-crumbs">
          <button className="crumb" onClick={() => { setCategory(null); setOpenFolder(null) }}>Library</button>
          <span className="crumb-sep">›</span>
          <button className="crumb" onClick={() => setOpenFolder(null)}>{openFolder.category}</button>
          <span className="crumb-sep">›</span>
          <span className="crumb crumb-current">📁 {openFolder.title}</span>
        </div>
        <div className="browse-grid">
          {(openFolder.items || []).map((item, i) => (
            <div key={i} className="browse-tile" onClick={() => setPreview(itemToPseudoMaterial(item, openFolder.title))}>
              {IMG_EXT.test(item.filename)
                ? <div className="browse-tile-thumb"><img src={`file://${item.filePath}`} alt="" /></div>
                : <div className="browse-tile-icon">{FILE_ICONS[extOf(item.filename)] || '📎'}</div>}
              <div className="browse-tile-name">{item.filename}</div>
            </div>
          ))}
        </div>
        {previewModal}
      </div>
    )
  }

  // ── Level 2: inside a category ──
  if (category) {
    const mats = materialsIn(category)
    return (
      <div className="browse-root">
        <div className="browse-crumbs">
          <button className="crumb" onClick={() => setCategory(null)}>Library</button>
          <span className="crumb-sep">›</span>
          <span className="crumb crumb-current">{CATEGORY_ICONS[category]} {category}</span>
        </div>
        {mats.length === 0 ? (
          <div className="empty-state"><div className="empty-icon">📂</div><p>No materials in {category} yet.</p></div>
        ) : (
          <div className="browse-grid">
            {mats.map(m => (
              <div key={m.id} className="browse-tile"
                onClick={() => m.type === 'folder' ? setOpenFolder(m) : setPreview(m)}>
                <TilePreview material={m} />
                <div className="browse-tile-name">{m.title}</div>
                {m.ageRange && <div className="browse-tile-sub">Age {m.ageRange}</div>}
              </div>
            ))}
          </div>
        )}
        {previewModal}
      </div>
    )
  }

  // ── Level 1: category folders ──
  return (
    <div className="browse-root">
      <div className="browse-crumbs">
        <span className="crumb crumb-current">Library</span>
      </div>
      <div className="browse-grid browse-grid-categories">
        {CATEGORIES.map(cat => (
          <div key={cat} className="browse-tile browse-cat-tile" onClick={() => setCategory(cat)}>
            <div className="browse-tile-icon browse-cat-icon">{CATEGORY_ICONS[cat]}</div>
            <div className="browse-tile-name">{cat}</div>
            <div className="browse-tile-sub">{countFor(cat)} item{countFor(cat) !== 1 ? 's' : ''}</div>
          </div>
        ))}
      </div>
      {previewModal}
    </div>
  )
}
