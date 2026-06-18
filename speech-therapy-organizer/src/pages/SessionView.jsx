import React, { useState } from 'react'

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

const CATEGORIES = ['Language', 'Comprehension', 'Pragmatic', 'Age']

function getExt(filePath) {
  if (!filePath) return ''
  return filePath.split('.').pop().toLowerCase()
}

function BigMaterialTile({ material, onOpen }) {
  const ext = getExt(material.filePath)
  const icon = EXT_ICONS[ext] || '📎'
  const catColor = CATEGORY_COLORS[material.category] || '#888'

  return (
    <div className="session-tile" onClick={() => material.filePath && onOpen(material)}>
      <div className="session-tile-icon">{icon}</div>
      <div className="session-tile-title">{material.title}</div>
      <div className="session-tile-meta">
        <span className="session-tag" style={{ background: catColor }}>{material.category}</span>
        {material.ageRange && <span className="session-tag session-tag-age">Age {material.ageRange}</span>}
      </div>
      {material.filePath
        ? <div className="session-tile-open">▶ Open</div>
        : <div className="session-tile-open session-tile-no-file">No file attached</div>
      }
    </div>
  )
}

export default function SessionView({ store, clientId, onExit }) {
  const client = store.clients.find(c => c.id === clientId)
  const [tab, setTab] = useState('mine')
  const [libCategory, setLibCategory] = useState('All')
  const [search, setSearch] = useState('')

  const isElectron = typeof window !== 'undefined' && window.api

  if (!client) return null

  const openMaterial = async (material) => {
    if (isElectron && material.filePath) await window.api.openFile(material.filePath)
  }

  const clientMaterials = store.materials.filter(m => client.materialIds?.includes(m.id))

  const libraryMaterials = store.materials.filter(m => {
    if (libCategory !== 'All' && m.category !== libCategory) return false
    if (search && !m.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div className="session-shell">
      {/* Top bar */}
      <div className="session-topbar">
        <div className="session-client-name">
          <span className="session-avatar">{client.name[0].toUpperCase()}</span>
          {client.name}
        </div>
        <div className="session-tabs">
          <button
            className={`session-tab ${tab === 'mine' ? 'active' : ''}`}
            onClick={() => setTab('mine')}
          >
            Session Materials
            <span className="session-tab-count">{clientMaterials.length}</span>
          </button>
          <button
            className={`session-tab ${tab === 'library' ? 'active' : ''}`}
            onClick={() => setTab('library')}
          >
            Full Library
            <span className="session-tab-count">{store.materials.length}</span>
          </button>
        </div>
        <button className="session-exit-btn" onClick={onExit} title="End session">
          ✕ End Session
        </button>
      </div>

      {/* Content */}
      <div className="session-content">
        {tab === 'mine' && (
          <>
            {clientMaterials.length === 0 ? (
              <div className="session-empty">
                <div style={{ fontSize: 52 }}>📂</div>
                <p>No materials assigned to {client.name} yet.</p>
                <button className="session-switch-btn" onClick={() => setTab('library')}>
                  Browse Full Library →
                </button>
              </div>
            ) : (
              <div className="session-grid">
                {clientMaterials.map(m => (
                  <BigMaterialTile key={m.id} material={m} onOpen={openMaterial} />
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'library' && (
          <>
            <div className="session-library-filters">
              <input
                className="session-search"
                placeholder="Search materials…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <div className="session-filter-tabs">
                {['All', ...CATEGORIES].map(cat => (
                  <button
                    key={cat}
                    className={`session-filter-tab ${libCategory === cat ? 'active' : ''}`}
                    onClick={() => setLibCategory(cat)}
                  >{cat}</button>
                ))}
              </div>
            </div>
            {libraryMaterials.length === 0 ? (
              <div className="session-empty"><p>No materials match.</p></div>
            ) : (
              <div className="session-grid">
                {libraryMaterials.map(m => (
                  <BigMaterialTile key={m.id} material={m} onOpen={openMaterial} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
