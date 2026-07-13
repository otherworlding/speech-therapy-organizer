import React, { useState, useEffect, useRef } from 'react'
import FinderView from './FinderView'
import FileViewer from './FileViewer'
import SessionAttachments from './SessionAttachments'

const IN_PERSON_FOLDER_NAME = 'In-Person Materials'

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
  if (m.filePath && IMG_EXT.test(m.filePath)) return <span className="ws-mini-thumb"><img src={`file://${m.filePath}`} alt="" loading="lazy" decoding="async" /></span>
  const icon = m.type === 'youtube' ? '▶' : m.type === 'folder' ? '📁' : m.type === 'html-game' ? '🎮' : (FILE_ICONS[extOf(m.filePath)] || '📎')
  return <span className="ws-mini-icon">{icon}</span>
}

// Where a material lives in the folder tree, e.g. "Articulation › R-sounds" — helps identify
// an item's location when looking at it from a client's assigned list, away from the Finder tree.
function folderPath(m, folders) {
  const parts = []
  let cur = folders.find(f => f.id === m.folderId)
  while (cur) { parts.unshift(cur.name); cur = folders.find(f => f.id === cur.parentId) }
  return parts.join(' › ')
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

const KIND_BY_EXT = { pdf: 'PDF', jpg: 'Image', jpeg: 'Image', png: 'Image', gif: 'Image', mp4: 'Video', mov: 'Video', mp3: 'Audio', wav: 'Audio', pptx: 'PowerPoint', docx: 'Word' }
function kindLabel(m) {
  if (m.type === 'youtube') return 'YouTube video'
  if (m.type === 'folder') return 'Folder'
  if (m.type === 'html-game') return 'Interactive'
  return KIND_BY_EXT[extOf(m.filePath)] || (extOf(m.filePath) ? extOf(m.filePath).toUpperCase() : 'File')
}

// Count materials whose folder chain leads back to rootId (self or any nested subfolder)
function countInFolderTree(materials, folders, rootId) {
  if (!rootId) return 0
  const chainToRoot = (folderId) => {
    const chain = []
    let cur = folderId
    while (cur) { chain.push(cur); cur = folders.find(f => f.id === cur)?.parentId || null }
    return chain
  }
  return materials.filter(m => chainToRoot(m.folderId || null).includes(rootId)).length
}

// A grid of materials with marquee + multi-select + drop-to-add + drag-out
function SelectableGrid({ materials, onAssignKeys, onRemove, onPreview, emptyHint, onDragStateChange, view = 'icon', folders = [] }) {
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
    <div ref={ref} className={`ws-assigned ${view} ${dragOver ? 'drop-glow' : ''}`}
      onMouseDown={mouseDown}
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={drop}
      onDragEnd={() => onDragStateChange?.(false)}>
      {marquee && <div className="fx-marquee" style={{ left: marquee.left, top: marquee.top, width: marquee.w, height: marquee.h }} />}
      {materials.length === 0 && <div className="ws-drop-hint">{emptyHint}</div>}
      {materials.map(m => {
        const path = folderPath(m, folders)
        return (
        <div key={m.id} data-id={m.id} className={`ws-assigned-item ${view} ${sel.has(m.id) ? 'sel' : ''}`} draggable
          onDragStart={e => dragStart(e, m.id)}
          onClick={e => { e.stopPropagation(); click(e, m.id) }}
          onDoubleClick={() => onPreview(m)} title={path ? `${m.title} — 📁 ${path}` : m.title}>
          <MiniThumb m={m} />
          <span className="ws-assigned-name">{m.title}</span>
          {view === 'list' && <span className="ws-assigned-path">{path || '—'}</span>}
          {view === 'list' && <span className="ws-assigned-kind">{kindLabel(m)}</span>}
          {onRemove && <button className="ws-unassign" title="Remove" onClick={e => { e.stopPropagation(); onRemove(m.id) }}>✕</button>}
        </div>
      )})}
    </div>
  )
}

// Copy a client's material list to another client, picked from a dropdown
function ShareToClient({ sourceClientId, clients, materialIds, onShare, label }) {
  const [open, setOpen] = useState(false)
  const others = clients.filter(c => c.id !== sourceClientId)
  return (
    <div className="ws-share" onClick={e => e.stopPropagation()}>
      <button className="ws-share-btn btn-secondary" disabled={!materialIds.length || !others.length} onClick={() => setOpen(o => !o)}>{label}</button>
      {open && (
        <div className="ws-share-menu">
          {others.length === 0 && <div className="ws-addsession-title">No other clients</div>}
          {others.map(c => (
            <button key={c.id} onClick={() => { onShare(c.id); setOpen(false) }}>{c.name}</button>
          ))}
        </div>
      )}
    </div>
  )
}

// Share the current homework set: build folder + WhatsApp / Email / Reveal
function ShareMenu({ client, materials, note }) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState(null)
  const dateStr = new Date().toISOString().slice(0, 10)
  const message = () => {
    const lines = materials.map(m => m.type === 'youtube' ? `• ${m.title}: ${m.url}` : `• ${m.title}`)
    const parts = [`Home Practice — ${client.name} — ${new Date().toLocaleDateString()}`]
    if (note && note.trim()) parts.push('', note.trim())
    parts.push('', `Materials:\n${lines.join('\n')}`)
    return parts.join('\n')
  }
  // Build the folder LAST (after the chat app opens) so Finder ends up on top and
  // visible instead of getting buried behind WhatsApp/Mail's window — that was the
  // actual bug: the files were always there, just hidden behind the app that stole focus.
  const buildFolder = async () => {
    const filePaths = materials.flatMap(filesOfMaterial)
    const res = await window.api.createHomeworkFolder({ clientName: client.name, dateStr, filePaths, note })
    if (res?.success) {
      await window.api.openFile(res.folderPath)   // opens the folder's contents, not just a highlighted icon
      setStatus(`📂 ${res.count} file${res.count === 1 ? '' : 's'} ready in Finder — drag ${res.count === 1 ? 'it' : 'them'} into the chat to send.`)
      setTimeout(() => setStatus(null), 8000)
    }
    return res
  }
  const whatsApp = async () => {
    const num = (client.whatsapp || client.phone || '').replace(/[^\d]/g, '')
    const t = encodeURIComponent(message())
    if (num) window.api.openExternal(`https://wa.me/${num}?text=${t}`)
    else window.api.copyToClipboard(message())
    await buildFolder()
    if (!num) alert('No WhatsApp number — message copied. Attach files from the folder that opened.')
    setOpen(false)
  }
  const email = async () => {
    const s = encodeURIComponent(`Home Practice — ${client.name}`)
    window.api.openExternal(`mailto:${encodeURIComponent(client.email || '')}?subject=${s}&body=${encodeURIComponent(message())}`)
    await buildFolder()
    setOpen(false)
  }
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
      {status && <div className="ws-share-status">{status}</div>}
    </div>
  )
}

// Opt-in picker: add this session's materials to homework (nothing checked by default)
function AddFromSession({ materials, onAdd }) {
  const [open, setOpen] = useState(false)
  const [checked, setChecked] = useState(new Set())
  const toggle = id => setChecked(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const add = () => { if (checked.size) onAdd([...checked]); setChecked(new Set()); setOpen(false) }
  return (
    <div className="ws-share" onClick={e => e.stopPropagation()}>
      <button className="ws-addsession-btn" disabled={!materials.length} onClick={() => setOpen(o => !o)}>➕ From session</button>
      {open && (
        <div className="ws-share-menu ws-addsession-menu">
          <div className="ws-addsession-title">Add this session's items — none checked by default</div>
          {materials.length === 0 && <div className="ws-none" style={{ padding: '6px 10px' }}>No session materials.</div>}
          {materials.map(m => (
            <label key={m.id} className="ws-addsession-row">
              <input type="checkbox" checked={checked.has(m.id)} onChange={() => toggle(m.id)} />
              <span>{m.title}</span>
            </label>
          ))}
          {materials.length > 0 && (
            <button className="ws-addsession-add" disabled={!checked.size} onClick={add}>Add {checked.size || ''} to homework</button>
          )}
        </div>
      )}
    </div>
  )
}

function apptDateTime(a) {
  const [h, m] = (a.time || '00:00').split(':').map(Number)
  const d = new Date(a.date + 'T00:00:00')
  d.setHours(h, m, 0, 0)
  return d
}
function apptWhen(a) {
  return apptDateTime(a).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' +
    apptDateTime(a).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

// One in-person appointment row — collapsible, editable attachments, with a per-mode hint/prompt
function InPersonApptRow({ appt, store, mode }) {
  const [open, setOpen] = useState(mode !== 'archive')
  const attachments = appt.attachments || []
  const hint = mode === 'upcoming'
    ? 'Planning — drop photos or notes of what you intend to use.'
    : mode === 'review'
      ? 'What did you use in this session? Drop photos or notes, or skip if you\'d rather not log it.'
      : null
  return (
    <div className="ip-row">
      <div className="ip-row-head" onClick={() => setOpen(o => !o)}>
        <span className="ws-caret">{open ? '▾' : '▸'}</span>
        <span className="ip-row-when">{apptWhen(appt)}</span>
        {mode === 'review' && <span className="ip-badge ip-badge-review">Needs review</span>}
        {mode === 'archive' && appt.attachmentsSkipped && attachments.length === 0 && <span className="ip-badge">Skipped</span>}
        {attachments.length > 0 && <span className="ws-count">{attachments.length}</span>}
        {mode === 'review' && (
          <button className="btn-secondary ip-skip" onClick={e => { e.stopPropagation(); store.updateAppointment(appt.id, { attachmentsSkipped: true }) }}>
            Skip
          </button>
        )}
      </div>
      {open && (
        <SessionAttachments
          sessionId={appt.id}
          attachments={attachments}
          light
          hint={hint}
          onAdd={a => store.addAppointmentAttachment(appt.id, a)}
          onRemove={id => store.removeAppointmentAttachment(appt.id, id)}
        />
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
  // Multiple clients can be expanded at once — set of open client ids
  const [openClientIds, setOpenClientIds] = useState(() => new Set([store.clients[0]?.id].filter(Boolean)))
  const [dragClientId, setDragClientId] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview] = useState(null)
  const [fs, setFs] = useState(false)
  const [open, setOpen] = useState({ session: true, sessionThis: true, sessionPrev: false, homework: true, hwThis: true, hwPast: false, inperson: true, ipUpcoming: true, ipReview: true, ipArchive: false })
  const toggle = k => setOpen(o => ({ ...o, [k]: !o[k] }))
  const [noteDrafts, setNoteDrafts] = useState({})   // clientId -> homework note draft
  const [clientView, setClientView] = useState('icon') // icon | list — applies to all client material grids
  const [libTab, setLibTab] = useState('digital') // digital | inperson — only one library grid visible at a time so drags can't miss

  // The In-Person library is just a real top-level folder — same Finder, same features
  // (icon/list, folders, tags, drop-then-describe), only difference is which folder it's scoped to.
  const inPersonFolder = (store.folders || []).find(f => f.name === IN_PERSON_FOLDER_NAME && !f.parentId)
  const inPersonFolderId = inPersonFolder?.id || null
  useEffect(() => {
    if (!store.loaded || inPersonFolderId) return
    store.addFolder(IN_PERSON_FOLDER_NAME, '#f7a84f', null)
  }, [store.loaded, inPersonFolderId])

  const toggleClientOpen = (id) => setOpenClientIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const assignTo = (clientId, e) => {
    const ids = keysFromDrag(e)
    if (ids.length) store.assignMaterials(clientId, ids)
  }

  const renderDetail = (client) => {
    const assigned = store.materials.filter(m => client.materialIds?.includes(m.id))
    const homework = store.materials.filter(m => (client.homeworkIds || []).includes(m.id))
    const clientSessions = (store.sessions || []).filter(s => s.clientId === client.id)
    const curWeek = weekKey(new Date().toISOString())
    const prevSessionWeeks = groupByWeek(clientSessions.filter(s => weekKey(s.date) !== curWeek && (s.materialsUsed || []).length))
    const pastHomeworkWeeks = groupByWeek(clientSessions.filter(s => weekKey(s.date) !== curWeek && (s.homeworkFolder || (s.homeworkMaterials || []).length)))
    const thisWeekLabel = weekLabel(new Date().toISOString()).replace('Week of ', '')
    const noteDraft = noteDrafts[client.id] ?? (client.homeworkNote || '')
    const setNoteDraft = (val) => setNoteDrafts(prev => ({ ...prev, [client.id]: val }))

    const inPersonAppts = (store.appointments || [])
      .filter(a => a.clientId === client.id && a.sessionType === 'in-person' && a.type !== 'block')
      .sort((a, b) => apptDateTime(a) - apptDateTime(b))
    const nowDt = new Date()
    const upcomingAppts = inPersonAppts.filter(a => apptDateTime(a) >= nowDt)
    const pastAppts = inPersonAppts.filter(a => apptDateTime(a) < nowDt)
    const reviewAppts = pastAppts.filter(a => !a.attachmentsSkipped && (a.attachments || []).length === 0)
    const archivedAppts = pastAppts.filter(a => a.attachmentsSkipped || (a.attachments || []).length > 0).reverse()

    return (
          <div className="ws-detail">
            {/* SESSION MATERIALS */}
            <FolderHead open={open.session} onToggle={() => toggle('session')} icon="📁" label="Session Materials"
              right={<ShareToClient sourceClientId={client.id} clients={store.clients} materialIds={assigned.map(m => m.id)}
                onShare={targetId => store.assignMaterials(targetId, assigned.map(m => m.id))} label="🔗 Share playlist ▾" />} />
            {open.session && (
              <div className="ws-folder-body">
                <FolderHead sub open={open.sessionThis} onToggle={() => toggle('sessionThis')} icon="📂" label={`This Week — ${thisWeekLabel}`} count={assigned.length} />
                {open.sessionThis && (
                  <SelectableGrid materials={assigned} view={clientView} folders={store.folders || []}
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

            {/* IN-PERSON — only shows once an in-person session is scheduled for this client */}
            {inPersonAppts.length > 0 && (
              <>
                <FolderHead open={open.inperson} onToggle={() => toggle('inperson')} icon="🤝" label="In-Person" />
                {open.inperson && (
                  <div className="ws-folder-body">
                    <FolderHead sub open={open.ipUpcoming} onToggle={() => toggle('ipUpcoming')} icon="📂" label="Upcoming" count={upcomingAppts.length} />
                    {open.ipUpcoming && (
                      <div className="ip-list">
                        {upcomingAppts.length === 0 && <div className="ws-none">No upcoming in-person sessions.</div>}
                        {upcomingAppts.map(a => <InPersonApptRow key={a.id} appt={a} store={store} mode="upcoming" />)}
                      </div>
                    )}
                    {reviewAppts.length > 0 && (
                      <>
                        <FolderHead sub open={open.ipReview} onToggle={() => toggle('ipReview')} icon="📁" label="Needs Review" count={reviewAppts.length} />
                        {open.ipReview && (
                          <div className="ip-list">
                            {reviewAppts.map(a => <InPersonApptRow key={a.id} appt={a} store={store} mode="review" />)}
                          </div>
                        )}
                      </>
                    )}
                    <FolderHead sub open={open.ipArchive} onToggle={() => toggle('ipArchive')} icon="📁" label="Previous In-Person Sessions" count={archivedAppts.length} />
                    {open.ipArchive && (
                      <div className="ip-list">
                        {archivedAppts.length === 0 && <div className="ws-none">Nothing logged yet.</div>}
                        {archivedAppts.map(a => <InPersonApptRow key={a.id} appt={a} store={store} mode="archive" />)}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* HOMEWORK */}
            <FolderHead open={open.homework} onToggle={() => toggle('homework')} icon="📁" label="Homework"
              right={<div className="ws-head-actions">
                <ShareToClient sourceClientId={client.id} clients={store.clients} materialIds={homework.map(m => m.id)}
                  onShare={targetId => store.assignHomework(targetId, homework.map(m => m.id))} label="🔗 To client ▾" />
                <ShareMenu client={client} materials={homework} note={noteDraft} />
              </div>} />
            {open.homework && (
              <div className="ws-folder-body">
                <FolderHead sub open={open.hwThis} onToggle={() => toggle('hwThis')} icon="📂" label="This Week" count={homework.length}
                  right={<AddFromSession materials={assigned} onAdd={ids => store.assignHomework(client.id, ids)} />} />

                {open.hwThis && (
                  <>
                    <SelectableGrid materials={homework} view={clientView} folders={store.folders || []}
                      onAssignKeys={ids => store.assignHomework(client.id, ids)}
                      onRemove={id => store.unassignHomework(client.id, id)}
                      onPreview={setPreview} onDragStateChange={setDragging}
                      emptyHint="Drag materials here to add homework →" />
                    <textarea
                      className="ws-hw-note"
                      placeholder="Instructions for the family… (saved as Instructions.txt and included in the message)"
                      value={noteDraft}
                      onChange={e => setNoteDraft(e.target.value)}
                      onBlur={() => store.updateClient(client.id, { homeworkNote: noteDraft })}
                      rows={3}
                    />
                  </>
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
    )
  }

  return (
    <div className={`workspace ${dragging ? 'ws-dragging' : ''}`}>
      {/* LEFT — clients, accordion: each client's folders open directly under their own row; multiple can be open at once */}
      <div className="ws-clients">
        <div className="ws-pane-title">
          👦 Clients
          <div className="fx-viewseg ws-clientviewseg">
            <button className={clientView === 'icon' ? 'active' : ''} onClick={() => setClientView('icon')} title="Icon view">▦</button>
            <button className={clientView === 'list' ? 'active' : ''} onClick={() => setClientView('list')} title="List view">☰</button>
          </div>
        </div>

        <div className="ws-chips">
          {store.clients.map(c => {
            const isOpen = openClientIds.has(c.id)
            return (
              <div key={c.id} className="ws-chip-wrap">
                <div
                  className={`ws-chip ${isOpen ? 'selected' : ''} ${dragClientId === c.id ? 'drop-glow' : ''}`}
                  onClick={() => toggleClientOpen(c.id)}
                  onDragOver={e => { e.preventDefault(); setDragClientId(c.id) }}
                  onDragLeave={() => setDragClientId(d => d === c.id ? null : d)}
                  onDrop={e => { e.preventDefault(); assignTo(c.id, e); setDragClientId(null); setDragging(false) }}>
                  <span className="ws-chip-caret">{isOpen ? '▾' : '▸'}</span>
                  <span className="ws-chip-avatar">{c.name[0].toUpperCase()}</span>
                  <span className="ws-chip-name">{c.name}</span>
                  <span className="ws-chip-count">{c.materialIds?.length || 0}</span>
                </div>
                {isOpen && renderDetail(c)}
              </div>
            )
          })}
          {store.clients.length === 0 && <div className="ws-empty-hint">Add clients on the Clients screen.</div>}
        </div>
      </div>

      {/* RIGHT — materials Finder */}
      <div className="ws-materials"
        onDragStartCapture={() => setDragging(true)}
        onDragEndCapture={() => { setDragging(false); setDragClientId(null) }}>
        <div className="ws-pane-title">
          📚 Library <span className="ws-hint-inline">drag onto a client or a folder to add →← </span>
        </div>
        <div className="fx-viewseg ws-libtabs">
          <button className={libTab === 'digital' ? 'active' : ''} onClick={() => setLibTab('digital')}>📁 Digital</button>
          <button className={libTab === 'inperson' ? 'active' : ''} onClick={() => setLibTab('inperson')}>
            🤝 In-Person <span className="ws-count">{countInFolderTree(store.materials, store.folders || [], inPersonFolderId)}</span>
          </button>
        </div>
        {libTab === 'digital'
          ? <FinderView store={store} excludeFolderId={inPersonFolderId} />
          : inPersonFolderId && <FinderView store={store} scopeFolderId={inPersonFolderId} rootLabel="🤝 In-Person" />}
      </div>

      {/* Shared preview overlay */}
      {preview && (
        <div className="browse-preview-backdrop" onClick={() => { setPreview(null); setFs(false) }}>
          <div className={`browse-preview ${fs ? 'fullscreen' : ''}`} onClick={e => e.stopPropagation()}>
            <FileViewer material={preview} isFullscreen={fs} onToggleFullscreen={() => setFs(f => !f)}
              store={store} onConverted={() => { setPreview(null); setFs(false) }} />
            <button className="browse-preview-close" onClick={() => { setPreview(null); setFs(false) }}>✕</button>
          </div>
        </div>
      )}
    </div>
  )
}
