import React, { useState, useEffect, useRef } from 'react'
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

  // ── Multi-select + marquee inside the client's Assigned Materials list ──
  const [asSel, setAsSel] = useState(new Set())
  const [asMarquee, setAsMarquee] = useState(null)
  const asRef = useRef(null)
  const asAnchor = useRef(null)
  const asMoved = useRef(false)
  useEffect(() => { setAsSel(new Set()) }, [selectedClientId])
  const asOrdered = assigned.map(m => m.id)

  const asClick = (e, id) => {
    if (e.shiftKey && asAnchor.current && asOrdered.includes(asAnchor.current) && asOrdered.includes(id)) {
      const a = asOrdered.indexOf(asAnchor.current), b = asOrdered.indexOf(id)
      const [lo, hi] = a < b ? [a, b] : [b, a]
      setAsSel(prev => new Set([...((e.metaKey || e.ctrlKey) ? prev : []), ...asOrdered.slice(lo, hi + 1)]))
      return
    }
    if (e.metaKey || e.ctrlKey) setAsSel(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
    else setAsSel(new Set([id]))
    asAnchor.current = id
  }
  const asMouseDown = (e) => {
    if (e.button !== 0 || !asRef.current) return
    if (e.target.closest('.ws-assigned-item') || e.target.closest('button')) return
    const additive = e.metaKey || e.ctrlKey || e.shiftKey
    const base = additive ? new Set(asSel) : new Set()
    if (!additive) setAsSel(new Set())
    const sx = e.clientX, sy = e.clientY; asMoved.current = false
    const onMove = (me) => {
      const x = Math.min(sx, me.clientX), y = Math.min(sy, me.clientY), w = Math.abs(me.clientX - sx), h = Math.abs(me.clientY - sy)
      if (w + h > 4) asMoved.current = true
      const br = asRef.current.getBoundingClientRect()
      setAsMarquee({ left: x - br.left, top: y - br.top, w, h })
      const box = { left: x, top: y, right: x + w, bottom: y + h }
      const hits = new Set(base)
      asRef.current.querySelectorAll('.ws-assigned-item').forEach(el => {
        const r = el.getBoundingClientRect()
        if (!(r.right < box.left || r.left > box.right || r.bottom < box.top || r.top > box.bottom) && el.dataset.id) hits.add(el.dataset.id)
      })
      setAsSel(hits)
    }
    const onUp = () => { setAsMarquee(null); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }

  // Dragging a selected assigned item carries the whole selection (copy to another client)
  const onAssignedDragStart = (e, id) => {
    const ids = asSel.has(id) ? [...asSel] : [id]
    if (!asSel.has(id)) setAsSel(new Set([id]))
    e.dataTransfer.setData('text/finder-keys', JSON.stringify(ids.map(i => 'm:' + i)))
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
            <div ref={asRef} className={`ws-assigned ${dragClientId === client.id ? 'drop-glow' : ''}`}
              onMouseDown={asMouseDown}
              onDragOver={e => { e.preventDefault(); setDragClientId(client.id) }}
              onDragLeave={() => setDragClientId(d => d === client.id ? null : d)}
              onDrop={e => { e.preventDefault(); assignTo(client.id, e); setDragClientId(null); setDragging(false) }}>
              {asMarquee && <div className="fx-marquee" style={{ left: asMarquee.left, top: asMarquee.top, width: asMarquee.w, height: asMarquee.h }} />}
              {assigned.length === 0 && <div className="ws-drop-hint">Drag materials here from the right to assign →</div>}
              {assigned.map(m => (
                <div key={m.id} data-id={m.id} className={`ws-assigned-item ${asSel.has(m.id) ? 'sel' : ''}`} draggable
                  onDragStart={e => onAssignedDragStart(e, m.id)}
                  onClick={e => { e.stopPropagation(); asClick(e, m.id) }}
                  onDoubleClick={() => setPreview(m)} title={m.title}>
                  <MiniThumb m={m} />
                  <span className="ws-assigned-name">{m.title}</span>
                  <button className="ws-unassign" title="Unassign" onClick={e => { e.stopPropagation(); store.unassignMaterial(client.id, m.id) }}>✕</button>
                </div>
              ))}
            </div>
            {asSel.size > 1 && <div className="ws-assel-hint">{asSel.size} selected — drag onto another client to copy · double-click to preview</div>}

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
