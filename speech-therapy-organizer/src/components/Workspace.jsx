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
function filesOfMaterial(m) {
  if (m.type === 'folder') return (m.items || []).map(i => i.filePath).filter(Boolean)
  if (m.type === 'image-deck') return (m.imagePaths || []).filter(Boolean)
  return m.filePath ? [m.filePath] : []
}
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
  if (m.type === 'youtube' && m.videoId) return <span className="ws-mini-thumb"><img src={`https://img.youtube.com/vi/${m.videoId}/hqdefault.jpg`} alt="" onError={e => { e.target.style.display = 'none' }} /></span>
  if (m.filePath && IMG_EXT.test(m.filePath)) return <span className="ws-mini-thumb"><img src={`file://${m.filePath}`} alt="" /></span>
  const icon = m.type === 'youtube' ? '▶' : m.type === 'folder' ? '📁' : m.type === 'html-game' ? '🎮' : (FILE_ICONS[extOf(m.filePath)] || '📎')
  return <span className="ws-mini-icon">{icon}</span>
}

function keysFromDrag(e) {
  const raw = e.dataTransfer.getData('text/finder-keys')
  if (!raw) return []
  try { return JSON.parse(raw).filter(k => k.startsWith('m:')).map(k => k.slice(2)) } catch { return [] }
}

// Collapsible folder header
function FolderHead({ open, onToggle, icon, label, count, sub, right }) {
  return (
    <div className={`ws-folderhead ${sub ? 'sub' : ''}`}>
      <div className="ws-folderhead-main" onClick={onToggle}>
        <span className="ws-caret">{open ? '▾' : '▸'}</span>
        <span className="ws-folder-icon">{icon}</span>
        <span className="ws-folder-label">{label}</span>
        {count != null && <span className="ws-count">{count}</span>}
      </div>
      {right}
    </div>
  )
}

// A grid of materials with marquee + multi-select + drop-to-add + drag-out
function SelectableGrid({ materials, onAssignKeys, onRemove, onPreview, emptyHint, onDragStateChange }) {
  const [sel, setSel] = useState(new Set())
  const [marquee, setMarquee] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const ref = useRef(null), anchor = useRef(null), moved = useRef(false)
  const ordered = materials.map(m => m.id)

  const click = (e, id) => {
    if (e.shiftKey && anchor.current && ordered.includes(anchor.current) && ordered.includes(id)) {
      const a = ordered.indexOf(anchor.current), b = ordered.indexOf(id)
      const [lo, hi] = a < b ? [a, b] : [b, a]
      setSel(prev => new Set([...((e.metaKey || e.ctrlKey) ? prev : []), ...ordered.slice(lo, hi + 1)]))
      return
    }
    if (e.metaKey || e.ctrlKey) setSel(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
    else setSel(new Set([id]))
    anchor.current = id
  }
  const mouseDown = (e) => {
    if (e.button !== 0 || !ref.current) return
    if (e.target.closest('.ws-assigned-item') || e.target.closest('button')) return
    const additive = e.metaKey || e.ctrlKey || e.shiftKey
    const base = additive ? new Set(sel) : new Set()
    if (!additive) setSel(new Set())
    const sx = e.clientX, sy = e.clientY; moved.current = false
    const onMove = (me) => {
      const x = Math.min(sx, me.clientX), y = Math.min(sy, me.clientY), w = Math.abs(me.clientX - sx), h = Math.abs(me.clientY - sy)
      if (w + h > 4) moved.current = true
      const br = ref.current.getBoundingClientRect()
      setMarquee({ left: x - br.left, top: y - br.top, w, h })
      const box = { left: x, top: y, right: x + w, bottom: y + h }
      const hits = new Set(base)
      ref.current.querySelectorAll('.ws-assigned-item').forEach(el => {
        const r = el.getBoundingClientRect()
        if (!(r.right < box.left || r.left > box.right || r.bottom < box.top || r.top > box.bottom) && el.dataset.id) hits.add(el.dataset.id)
      })
      setSel(hits)
    }
    const onUp = () => { setMarquee(null); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }
  const dragStart = (e, id) => {
    const ids = sel.has(id) ? [...sel] : [id]
    if (!sel.has(id)) setSel(new Set([id]))
    e.dataTransfer.setData('text/finder-keys', JSON.stringify(ids.map(i => 'm:' + i)))
    e.dataTransfer.effectAllowed = 'copy'
    onDragStateChange?.(true)
  }
  const drop = (e) => {
    e.preventDefault(); setDragOver(false)
    const ids = keysFromDrag(e)
    if (ids.length) onAssignKeys(ids)
  }
  return (
    <div ref={ref} className={`ws-assigned ${dragOver ? 'drop-glow' : ''}`}
      onMouseDown={mouseDown}
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={drop}
      onDragEnd={() => onDragStateChange?.(false)}>
      {marquee && <div className="fx-marquee" style={{ left: marquee.left, top: marquee.top, width: marquee.w, height: marquee.h }} />}
      {materials.length === 0 && <div className="ws-drop-hint">{emptyHint}</div>}
      {materials.map(m => (
        <div key={m.id} data-id={m.id} className={`ws-assigned-item ${sel.has(m.id) ? 'sel' : ''}`} draggable
          onDragStart={e => dragStart(e, m.id)}
          onClick={e => { e.stopPropagation(); click(e, m.id) }}
          onDoubleClick={() => onPreview(m)} title={m.title}>
          <MiniThumb m={m} />
          <span className="ws-assigned-name">{m.title}</span>
          {onRemove && <button className="ws-unassign" title="Remove" onClick={e => { e.stopPropagation(); onRemove(m.id) }}>✕</button>}
        </div>
      ))}
    </div>
  )
}

// Share the current homework set: build folder + WhatsApp / Email / Reveal
function ShareMenu({ client, materials }) {
  const [open, setOpen] = useState(false)
  const dateStr = new Date().toISOString().slice(0, 10)
  const message = () => {
    const lines = materials.map(m => m.type === 'youtube' ? `• ${m.title}: ${m.url}` : `• ${m.title}`)
    return `Home Practice — ${client.name} — ${new Date().toLocaleDateString()}\n\nMaterials:\n${lines.join('\n')}`
  }
  const buildFolder = async () => {
    const filePaths = materials.flatMap(filesOfMaterial)
    const res = await window.api.createHomeworkFolder({ clientName: client.name, dateStr, filePaths })
    if (res?.success) await window.api.revealInFinder(res.folderPath)
    return res
  }
  const whatsApp = async () => { await buildFolder(); const num = (client.whatsapp || client.phone || '').replace(/[^\d]/g, ''); const t = encodeURIComponent(message()); if (num) window.api.openExternal(`https://wa.me/${num}?text=${t}`); else { window.api.copyToClipboard(message()); alert('No WhatsApp number — message copied. Attach files from the folder that opened.') } setOpen(false) }
  const email = async () => { await buildFolder(); const s = encodeURIComponent(`Home Practice — ${client.name}`); window.api.openExternal(`mailto:${encodeURIComponent(client.email || '')}?subject=${s}&body=${encodeURIComponent(message())}`); setOpen(false) }
  const reveal = async () => { await buildFolder(); setOpen(false) }
  return (
    <div className="ws-share" onClick={e => e.stopPropagation()}>
      <button className="btn-secondary ws-share-btn" disabled={!materials.length} onClick={() => setOpen(o => !o)}>Share ▾</button>
      {open && (
        <div className="ws-share-menu">
          <button onClick={whatsApp}>💬 WhatsApp</button>
          <button onClick={email}>✉️ Email</button>
          <button onClick={reveal}>📂 Reveal folder</button>
        </div>
      )}
    </div>
  )
}

function ArchiveChip({ mat, title, onPreview }) {
  return (
    <button className="ws-chip-mat" draggable={!!mat}
      onDragStart={e => { if (mat) e.dataTransfer.setData('text/finder-keys', JSON.stringify(['m:' + mat.id])) }}
      onClick={() => mat && onPreview(mat)} disabled={!mat}
      title={mat ? 'Drag up to This Week to reuse · click to preview' : ''}>{title}</button>
  )
}

export default function Workspace({ store }) {
  const [selectedClientId, setSelectedClientId] = useState(store.clients[0]?.id || null)
  const [dragClientId, setDragClientId] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview] = useState(null)
  const [fs, setFs] = useState(false)
  const [open, setOpen] = useState({ session: true, sessionThis: true, sessionPrev: false, homework: true, hwThis: true, hwPast: false })
  const toggle = k => setOpen(o => ({ ...o, [k]: !o[k] }))

  const client = store.clients.find(c => c.id === selectedClientId)
  const assigned = client ? store.materials.filter(m => client.materialIds?.includes(m.id)) : []
  const homework = client ? store.materials.filter(m => (client.homeworkIds || []).includes(m.id)) : []
  const clientSessions = client ? (store.sessions || []).filter(s => s.clientId === client.id) : []
  const curWeek = weekKey(new Date().toISOString())
  const prevSessionWeeks = groupByWeek(clientSessions.filter(s => weekKey(s.date) !== curWeek && (s.materialsUsed || []).length))
  const pastHomeworkWeeks = groupByWeek(clientSessions.filter(s => weekKey(s.date) !== curWeek && (s.homeworkFolder || (s.homeworkMaterials || []).length)))
  const thisWeekLabel = weekLabel(new Date().toISOString()).replace('Week of ', '')

  const assignTo = (clientId, e) => {
    const ids = keysFromDrag(e)
    if (ids.length) store.assignMaterials(clientId, ids)
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
            {/* SESSION MATERIALS */}
            <FolderHead open={open.session} onToggle={() => toggle('session')} icon="📁" label="Session Materials" />
            {open.session && (
              <div className="ws-folder-body">
                <FolderHead sub open={open.sessionThis} onToggle={() => toggle('sessionThis')} icon="📂" label={`This Week — ${thisWeekLabel}`} count={assigned.length} />
                {open.sessionThis && (
                  <SelectableGrid materials={assigned}
                    onAssignKeys={ids => store.assignMaterials(client.id, ids)}
                    onRemove={id => store.unassignMaterial(client.id, id)}
                    onPreview={setPreview} onDragStateChange={setDragging}
                    emptyHint="Drag materials here from the right →" />
                )}
                <FolderHead sub open={open.sessionPrev} onToggle={() => toggle('sessionPrev')} icon="📁" label="Previous Sessions" count={prevSessionWeeks.length} />
                {open.sessionPrev && (
                  <div className="ws-archive">
                    {prevSessionWeeks.length === 0 && <div className="ws-none">No earlier sessions.</div>}
                    {prevSessionWeeks.map((wk, i) => (
                      <div key={i}>
                        <div className="ws-week-header">{wk.label}</div>
                        <div className="ws-chip-row">
                          {wk.items.flatMap(s => (s.materialsUsed || []).map((mu, j) => (
                            <ArchiveChip key={s.id + '-' + j} mat={store.materials.find(x => x.id === mu.materialId)} title={mu.title} onPreview={setPreview} />
                          )))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* HOMEWORK */}
            <FolderHead open={open.homework} onToggle={() => toggle('homework')} icon="📁" label="Homework"
              right={<ShareMenu client={client} materials={homework} />} />
            {open.homework && (
              <div className="ws-folder-body">
                <FolderHead sub open={open.hwThis} onToggle={() => toggle('hwThis')} icon="📂" label="This Week" count={homework.length} />
                {open.hwThis && (
                  <SelectableGrid materials={homework}
                    onAssignKeys={ids => store.assignHomework(client.id, ids)}
                    onRemove={id => store.unassignHomework(client.id, id)}
                    onPreview={setPreview} onDragStateChange={setDragging}
                    emptyHint="Drag materials here to add homework →" />
                )}
                <FolderHead sub open={open.hwPast} onToggle={() => toggle('hwPast')} icon="📁" label="Past Homework" count={pastHomeworkWeeks.length} />
                {open.hwPast && (
                  <div className="ws-archive">
                    {pastHomeworkWeeks.length === 0 && <div className="ws-none">Nothing sent yet.</div>}
                    {pastHomeworkWeeks.map((wk, i) => (
                      <div key={i}>
                        <div className="ws-week-header">{wk.label}</div>
                        {wk.items.map(s => (
                          <div key={s.id} className="ws-row">
                            <span className="ws-row-date">{shortDate(s.date)}</span>
                            <span className="ws-row-mats">
                              {(s.homeworkMaterials || []).map((hm, j) => <span key={j} className="ws-hw-name">{hm.title}</span>)}
                              {s.homeworkFolder && <button className="ws-reveal" onClick={() => window.api?.revealInFinder(s.homeworkFolder)}>📂 Reveal</button>}
                            </span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* RIGHT — materials Finder */}
      <div className="ws-materials"
        onDragStartCapture={() => setDragging(true)}
        onDragEndCapture={() => { setDragging(false); setDragClientId(null) }}>
        <div className="ws-pane-title">📚 Materials Library <span className="ws-hint-inline">drag onto a client or a folder to add →← </span></div>
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
