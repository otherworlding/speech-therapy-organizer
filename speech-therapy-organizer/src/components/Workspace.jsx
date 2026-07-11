import React, { useState } from 'react'
import FinderView from './FinderView'
import FileViewer from './FileViewer'

const IMG_EXT = /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i
const FILE_ICONS = { pdf: '📄', pptx: '📊', ppt: '📊', docx: '📝', doc: '📝', mp4: '🎬', mov: '🎬', avi: '🎬', mp3: '🎵', wav: '🎵', m4a: '🎵' }
const extOf = p => (p || '').split('.').pop().toLowerCase()

function monday(dateIso) {
  const d = new Date(dateIso)
  const day = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - day); d.setHours(0, 0, 0, 0)
  return d
}
function weekKey(dateIso) { return monday(dateIso).toISOString().slice(0, 10) }
function weekLabel(dateIso) { return 'Week of ' + monday(dateIso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
function shortDate(iso) { return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) }

function groupByWeek(sessions) {
  const map = new Map()
  for (const s of sessions) {
    const k = weekKey(s.date)
    if (!map.has(k)) map.set(k, { label: weekLabel(s.date), items: [] })
    map.get(k).items.push(s)
  }
  return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([, v]) => v)
}

function MiniThumb({ m }) {
  if (m.filePath && IMG_EXT.test(m.filePath)) return <span className="ws-mini-thumb"><img src={`file://${m.filePath}`} alt="" /></span>
  const icon = m.type === 'folder' ? '📁' : m.type === 'html-game' ? '🎮' : (FILE_ICONS[extOf(m.filePath)] || '📎')
  return <span className="ws-mini-icon">{icon}</span>
}

export default function Workspace({ store }) {
  const [selectedClientId, setSelectedClientId] = useState(store.clients[0]?.id || null)
  const [dragClientId, setDragClientId] = useState(null)   // client row currently under a drag
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview] = useState(null)
  const [fs, setFs] = useState(false)

  const client = store.clients.find(c => c.id === selectedClientId)
  const assigned = client ? store.materials.filter(m => client.materialIds?.includes(m.id)) : []
  const clientSessions = client ? (store.sessions || []).filter(s => s.clientId === client.id) : []
  const sessionWeeks = groupByWeek(clientSessions.filter(s => (s.materialsUsed || []).length || s.sessionNotes))
  const homeworkWeeks = groupByWeek(clientSessions.filter(s => s.homeworkFolder || (s.homeworkMaterials || []).length))

  const keysFromDrag = (e) => {
    const raw = e.dataTransfer.getData('text/finder-keys')
    if (!raw) return []
    try { return JSON.parse(raw).filter(k => k.startsWith('m:')).map(k => k.slice(2)) } catch { return [] }
  }

  const assignTo = (clientId, e) => {
    const ids = keysFromDrag(e)
    if (ids.length) store.assignMaterials(clientId, ids)
  }

  // Assigned-material tiles are draggable so they can be copied to another client chip
  const onAssignedDragStart = (e, id) => {
    e.dataTransfer.setData('text/finder-keys', JSON.stringify(['m:' + id]))
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <div className={`workspace ${dragging ? 'ws-dragging' : ''}`}>
      {/* LEFT — clients */}
      <div className="ws-clients">
        <div className="ws-pane-title">👦 Clients</div>

        <div className="ws-chips">
          {store.clients.map(c => (
            <div key={c.id}
              className={`ws-chip ${c.id === selectedClientId ? 'selected' : ''} ${dragClientId === c.id ? 'drop-glow' : ''}`}
              onClick={() => setSelectedClientId(c.id)}
              onDragOver={e => { e.preventDefault(); setDragClientId(c.id) }}
              onDragLeave={() => setDragClientId(d => d === c.id ? null : d)}
              onDrop={e => { e.preventDefault(); assignTo(c.id, e); setDragClientId(null); setDragging(false) }}>
              <span className="ws-chip-avatar">{c.name[0].toUpperCase()}</span>
              <span className="ws-chip-name">{c.name}</span>
              <span className="ws-chip-count">{c.materialIds?.length || 0}</span>
            </div>
          ))}
          {store.clients.length === 0 && <div className="ws-empty-hint">Add clients on the Clients screen.</div>}
        </div>

        {client && (
          <div className="ws-detail">
            {/* Assigned materials — drop target */}
            <div className="ws-section-title">📌 Assigned Materials <span className="ws-count">{assigned.length}</span></div>
            <div className={`ws-assigned ${dragClientId === client.id ? 'drop-glow' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragClientId(client.id) }}
              onDragLeave={() => setDragClientId(d => d === client.id ? null : d)}
              onDrop={e => { e.preventDefault(); assignTo(client.id, e); setDragClientId(null); setDragging(false) }}>
              {assigned.length === 0 && <div className="ws-drop-hint">Drag materials here from the right to assign →</div>}
              {assigned.map(m => (
                <div key={m.id} className="ws-assigned-item" draggable
                  onDragStart={e => onAssignedDragStart(e, m.id)}
                  onClick={() => setPreview(m)} title={m.title}>
                  <MiniThumb m={m} />
                  <span className="ws-assigned-name">{m.title}</span>
                  <button className="ws-unassign" title="Unassign" onClick={e => { e.stopPropagation(); store.unassignMaterial(client.id, m.id) }}>✕</button>
                </div>
              ))}
            </div>

            {/* Sessions by week */}
            <div className="ws-section-title">🗂 Sessions</div>
            {sessionWeeks.length === 0 && <div className="ws-none">No sessions yet.</div>}
            {sessionWeeks.map((wk, i) => (
              <div key={i} className="ws-week">
                <div className="ws-week-header">{wk.label}</div>
                {wk.items.map(s => (
                  <div key={s.id} className="ws-row">
                    <span className="ws-row-date">{shortDate(s.date)}</span>
                    <span className="ws-row-mats">
                      {(s.materialsUsed || []).map((mu, j) => {
                        const mat = store.materials.find(x => x.id === mu.materialId)
                        return <button key={j} className="ws-chip-mat" onClick={() => mat && setPreview(mat)} disabled={!mat}>
                          {mu.title}{mu.needsRepeat ? ' 🔁' : ''}</button>
                      })}
                      {(s.materialsUsed || []).length === 0 && <em className="ws-none-inline">notes only</em>}
                    </span>
                  </div>
                ))}
              </div>
            ))}

            {/* Homework by week */}
            <div className="ws-section-title">📤 Homework</div>
            {homeworkWeeks.length === 0 && <div className="ws-none">No homework sent yet.</div>}
            {homeworkWeeks.map((wk, i) => (
              <div key={i} className="ws-week">
                <div className="ws-week-header">{wk.label}</div>
                {wk.items.map(s => (
                  <div key={s.id} className="ws-row">
                    <span className="ws-row-date">{shortDate(s.date)}</span>
                    <span className="ws-row-mats">
                      {(s.homeworkMaterials || []).map((hm, j) => <span key={j} className="ws-hw-name">{hm.title}</span>)}
                      {s.homeworkFolder && (
                        <button className="ws-reveal" onClick={() => window.api?.revealInFinder(s.homeworkFolder)}>📂 Reveal folder</button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* RIGHT — materials Finder */}
      <div className="ws-materials"
        onDragStartCapture={() => setDragging(true)}
        onDragEndCapture={() => { setDragging(false); setDragClientId(null) }}>
        <div className="ws-pane-title">📚 Materials Library <span className="ws-hint-inline">drag onto a client to assign →← </span></div>
        <FinderView store={store} />
      </div>

      {/* Shared preview overlay */}
      {preview && (
        <div className="browse-preview-backdrop" onClick={() => { setPreview(null); setFs(false) }}>
          <div className={`browse-preview ${fs ? 'fullscreen' : ''}`} onClick={e => e.stopPropagation()}>
            <FileViewer material={preview} isFullscreen={fs} onToggleFullscreen={() => setFs(f => !f)} />
            <button className="browse-preview-close" onClick={() => { setPreview(null); setFs(false) }}>✕</button>
          </div>
        </div>
      )}
    </div>
  )
}
