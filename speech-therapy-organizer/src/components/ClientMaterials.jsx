import React, { useState, useEffect, useRef, useMemo } from 'react'
import FinderView from './FinderView'
import FileViewer from './FileViewer'
import SessionAttachments from './SessionAttachments'
import MessagesShare from './MessagesShare'
import { duplicateTitleSet } from '../utils/duplicates'

// The per-client half of what used to be the "Library & Planner" Workspace page —
// Main Collection, Session Materials, In-Person, Homework — now living on the
// client's own detail page with a full-width embedded Library panel beside it,
// instead of squeezed into a shared sidebar column meant to hold every client at once.

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
// Bare "YYYY-MM-DD" strings parse as UTC midnight by default, which displays as the
// previous day in any timezone behind UTC — force local-midnight parsing instead
// (same fix as fmtDate() in billing.js/invoicePdf.js).
function shortDate(iso) {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? new Date(iso + 'T00:00:00') : new Date(iso)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
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

function SelectableGrid({ materials, onAssignKeys, onRemove, onPreview, emptyHint, onDragStateChange, view = 'icon', folders = [], iconSize = 'md' }) {
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
    // Also start a real OS-level file drag — see FinderView.jsx's onItemDragStart for why.
    if (window.api?.startNativeDrag) {
      const paths = ids.map(i => materials.find(m => m.id === i)).filter(m => m?.filePath).map(m => m.filePath)
      if (paths.length) window.api.startNativeDrag(paths)
    }
  }
  const drop = (e) => {
    e.preventDefault(); setDragOver(false)
    const ids = keysFromDrag(e)
    if (ids.length) onAssignKeys(ids)
  }
  // Same-named items in this picklist — same "might be an accidental duplicate" flag
  // FinderView shows for a folder, so it's consistent everywhere in the app, not just
  // the Library tree.
  const dupTitles = useMemo(() => duplicateTitleSet(materials), [materials])

  return (
    <div ref={ref} className={`ws-assigned ${view} size-${iconSize} ${dragOver ? 'drop-glow' : ''}`}
      onMouseDown={mouseDown}
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={drop}
      onDragEnd={() => onDragStateChange?.(false)}>
      {marquee && <div className="fx-marquee" style={{ left: marquee.left, top: marquee.top, width: marquee.w, height: marquee.h }} />}
      {materials.length === 0 && <div className="ws-drop-hint">{emptyHint}</div>}
      {materials.map(m => {
        const path = folderPath(m, folders)
        const isDup = dupTitles.has((m.title || '').trim().toLowerCase())
        return (
        <div key={m.id} data-id={m.id} className={`ws-assigned-item ${view} ${sel.has(m.id) ? 'sel' : ''}`} draggable
          onDragStart={e => dragStart(e, m.id)}
          onClick={e => { e.stopPropagation(); click(e, m.id) }}
          onDoubleClick={() => onPreview(m)} title={isDup ? `⚠ Another item here is also named “${m.title}”` : (path ? `${m.title} — 📁 ${path}` : m.title)}>
          <MiniThumb m={m} />
          <span className={`ws-assigned-name ${isDup ? 'fx-name-dup' : ''}`}>{isDup && <span className="fx-dup-badge">⚠</span>}{m.title}</span>
          {view === 'list' && <span className="ws-assigned-path">{path || '—'}</span>}
          {view === 'list' && <span className="ws-assigned-kind">{kindLabel(m)}</span>}
          {onRemove && <button className="ws-unassign" title="Remove" onClick={e => { e.stopPropagation(); onRemove(m.id) }}>✕</button>}
        </div>
      )})}
    </div>
  )
}

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

function ShareMenu({ client, materials, note }) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState(null)
  const [showMessages, setShowMessages] = useState(false)
  const dateStr = new Date().toISOString().slice(0, 10)
  const message = () => {
    const lines = materials.map(m => m.type === 'youtube' ? `• ${m.title}: ${m.url}` : `• ${m.title}`)
    const parts = [`Home Practice — ${client.name} — ${new Date().toLocaleDateString()}`]
    if (note && note.trim()) parts.push('', note.trim())
    parts.push('', `Materials:\n${lines.join('\n')}`)
    return parts.join('\n')
  }
  const buildFolder = async () => {
    const filePaths = materials.flatMap(filesOfMaterial)
    const res = await window.api.createHomeworkFolder({ clientName: client.name, dateStr, filePaths, note })
    if (res?.success) {
      await window.api.openFile(res.folderPath)
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
          {/* The only option here that actually attaches the files itself — the other
              two open a compose window you still finish by hand. */}
          <button onClick={() => { setShowMessages(true); setOpen(false) }}>📱 Messages (with attachments)</button>
          <button onClick={reveal}>📂 Reveal folder</button>
        </div>
      )}
      {status && <div className="ws-share-status">{status}</div>}
      {showMessages && (
        <MessagesShare client={client} message={message()} filePaths={materials.flatMap(filesOfMaterial)}
          onClose={() => setShowMessages(false)} />
      )}
    </div>
  )
}

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

// One draft session plan — build its material list and a prep note now, pick a real
// date for it later. Reuses the same SelectableGrid as This Week's session, so
// dragging materials in works identically.
function PlannedSessionRow({ planned, store, clientView, iconSize, open, onToggle, onPreview, onDragStateChange }) {
  const materials = store.materials.filter(m => (planned.materialIds || []).includes(m.id))
  const [note, setNote] = useState(planned.notes || '')
  const isDated = !!planned.appointmentId
  return (
    <div className="ws-planned-row">
      <div className="ws-planned-head" onClick={onToggle}>
        <span className="ws-caret">{open ? '▾' : '▸'}</span>
        <span className="ws-planned-label">{planned.label}</span>
        {isDated && <span className="ws-planned-dated">📌 scheduled</span>}
        <span className="ws-count">{materials.length}</span>
        <button className="fx-del-x ws-planned-del" title="Delete this plan"
          onClick={e => { e.stopPropagation(); if (window.confirm(`Delete "${planned.label}"? This can't be undone.`)) store.deletePlannedSession(planned.id) }}>🗑</button>
      </div>
      {open && (
        <div className="ws-planned-body">
          <SelectableGrid materials={materials} view={clientView} iconSize={iconSize} folders={store.folders || []}
            onAssignKeys={ids => store.updatePlannedSession(planned.id, { materialIds: [...new Set([...(planned.materialIds || []), ...ids])] })}
            onRemove={id => store.updatePlannedSession(planned.id, { materialIds: (planned.materialIds || []).filter(x => x !== id) })}
            onPreview={onPreview} onDragStateChange={onDragStateChange}
            emptyHint="Drag materials here to prep this session →" />
          <textarea className="ws-hw-note" placeholder="Prep notes for this session…" rows={2}
            value={note} onChange={e => setNote(e.target.value)}
            onBlur={() => store.updatePlannedSession(planned.id, { notes: note })} />
          {!isDated && <div className="ws-planned-hint">Pick a date for this on the Schedule page when you're ready.</div>}
        </div>
      )}
    </div>
  )
}

export default function ClientMaterials({ store, client }) {
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview] = useState(null)
  const [fs, setFs] = useState(false)
  const [open, setOpen] = useState({ session: true, sessionThis: true, sessionPlanned: false, sessionPrev: false, homework: true, hwThis: true, hwPast: false, inperson: true, ipUpcoming: true, ipReview: true, ipArchive: false, main: true })
  const toggle = k => setOpen(o => ({ ...o, [k]: !o[k] }))
  const [openPlannedIds, setOpenPlannedIds] = useState(() => new Set())
  const [noteDraft, setNoteDraft] = useState(client.homeworkNote || '')
  const [clientView, setClientView] = useState('icon')
  const [libTab, setLibTab] = useState('digital')
  const iconSize = store.settings?.iconSize || 'md'

  const inPersonFolder = (store.folders || []).find(f => f.name === IN_PERSON_FOLDER_NAME && !f.parentId)
  const inPersonFolderId = inPersonFolder?.id || null
  useEffect(() => {
    if (!store.loaded || inPersonFolderId) return
    store.addFolder(IN_PERSON_FOLDER_NAME, '#f7a84f', null)
  }, [store.loaded, inPersonFolderId])

  // This client's own auto-created Main Collection folder — same mechanism as before,
  // just scoped to one client instead of sweeping every client on the shared Library page.
  useEffect(() => {
    if (!store.loaded) return
    const has = (store.folders || []).some(f => f.mainCollection && f.clientId === client.id)
    if (!has) store.addFolder(`${client.name} — Main Collection`, '#8fd14f', null, { clientId: client.id, mainCollection: true })
  }, [store.loaded, store.folders, client.id, client.name])
  const mainCollectionFolderId = (store.folders || []).find(f => f.mainCollection && f.clientId === client.id)?.id || null
  const mainCollectionFolderIds = (store.folders || []).filter(f => f.mainCollection).map(f => f.id)

  // Numbered purely by queue position — never stored, so consuming/deleting one
  // naturally renumbers the rest. Once linked to a real appointment (from the
  // Schedule page), the label swaps from "Session N" to that appointment's date.
  const plannedSessionsRaw = (store.plannedSessions || [])
    .filter(p => p.clientId === client.id)
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
  let unscheduledCount = 0
  const plannedWithLabels = plannedSessionsRaw.map(p => {
    if (p.appointmentId) {
      const appt = (store.appointments || []).find(a => a.id === p.appointmentId)
      return { ...p, label: appt ? shortDate(appt.date) : 'Session (date TBD)' }
    }
    unscheduledCount++
    return { ...p, label: `Session ${unscheduledCount}` }
  })

  const assigned = store.materials.filter(m => client.materialIds?.includes(m.id))
  const homework = store.materials.filter(m => (client.homeworkIds || []).includes(m.id))
  const clientSessions = (store.sessions || []).filter(s => s.clientId === client.id)
  const curWeek = weekKey(new Date().toISOString())
  const prevSessionWeeks = groupByWeek(clientSessions.filter(s => weekKey(s.date) !== curWeek && (s.materialsUsed || []).length))
  const pastHomeworkWeeks = groupByWeek(clientSessions.filter(s => weekKey(s.date) !== curWeek && (s.homeworkFolder || (s.homeworkMaterials || []).length)))
  const thisWeekLabel = weekLabel(new Date().toISOString()).replace('Week of ', '')

  const inPersonAppts = (store.appointments || [])
    .filter(a => a.clientId === client.id && a.sessionType === 'in-person' && a.type !== 'block')
    .sort((a, b) => apptDateTime(a) - apptDateTime(b))
  const nowDt = new Date()
  const upcomingAppts = inPersonAppts.filter(a => apptDateTime(a) >= nowDt)
  const pastAppts = inPersonAppts.filter(a => apptDateTime(a) < nowDt)
  const reviewAppts = pastAppts.filter(a => !a.attachmentsSkipped && (a.attachments || []).length === 0)
  const archivedAppts = pastAppts.filter(a => a.attachmentsSkipped || (a.attachments || []).length > 0).reverse()

  return (
    <div className={`workspace ${dragging ? 'ws-dragging' : ''}`}>
      {/* LEFT — this client's own tree, full width instead of a shared sidebar column */}
      <div className="ws-clients cm-left">
        <div className="ws-pane-title">
          🗂 {client.name}'s Materials
          <div className="fx-viewseg ws-clientviewseg">
            <button className={clientView === 'icon' ? 'active' : ''} onClick={() => setClientView('icon')} title="Icon view">▦</button>
            <button className={clientView === 'list' ? 'active' : ''} onClick={() => setClientView('list')} title="List view">☰</button>
          </div>
          {clientView === 'icon' && (
            <div className="fx-viewseg ws-clientviewseg" title="Icon size — same setting everywhere in the app">
              {[['sm', 'S'], ['md', 'M'], ['lg', 'L']].map(([sz, label]) => (
                <button key={sz} className={iconSize === sz ? 'active' : ''} onClick={() => store.updateSettings({ iconSize: sz })}>{label}</button>
              ))}
            </div>
          )}
        </div>

        <div className="ws-chips">
          <div className="ws-chip-wrap">
            <div className="ws-detail">
              {/* MAIN COLLECTION */}
              <FolderHead open={open.main} onToggle={() => toggle('main')} icon="🗂" label="Main Collection"
                count={countInFolderTree(store.materials, store.folders || [], mainCollectionFolderId)} />
              {open.main && (
                <div className="ws-folder-body ws-main-collection">
                  {mainCollectionFolderId
                    ? <FinderView store={store} scopeFolderId={mainCollectionFolderId} rootLabel="🗂 Main Collection" client={client} />
                    : <div className="ws-none">Setting up…</div>}
                </div>
              )}

              {/* SESSION MATERIALS */}
              <FolderHead open={open.session} onToggle={() => toggle('session')} icon="📁" label="Session Materials"
                right={<ShareToClient sourceClientId={client.id} clients={store.clients} materialIds={assigned.map(m => m.id)}
                  onShare={targetId => store.assignMaterials(targetId, assigned.map(m => m.id))} label="🔗 Share playlist ▾" />} />
              {open.session && (
                <div className="ws-folder-body">
                  <FolderHead sub open={open.sessionThis} onToggle={() => toggle('sessionThis')} icon="📂" label={`This Week — ${thisWeekLabel}`} count={assigned.length} />
                  {open.sessionThis && (
                    <SelectableGrid materials={assigned} view={clientView} iconSize={iconSize} folders={store.folders || []}
                      onAssignKeys={ids => store.assignMaterials(client.id, ids)}
                      onRemove={id => store.unassignMaterial(client.id, id)}
                      onPreview={setPreview} onDragStateChange={setDragging}
                      emptyHint="Drag materials here from the right →" />
                  )}
                  <FolderHead sub open={open.sessionPlanned} onToggle={() => toggle('sessionPlanned')} icon="📅" label="Planned Sessions" count={plannedWithLabels.length}
                    right={<button className="ws-addsession-btn" onClick={() => store.addPlannedSession({ clientId: client.id })}>+ Add Session</button>} />
                  {open.sessionPlanned && (
                    <div className="ws-planned-list">
                      {plannedWithLabels.length === 0 && <div className="ws-none">Build a session's materials ahead of time — pick a date for it later when you schedule the appointment.</div>}
                      {plannedWithLabels.map(p => (
                        <PlannedSessionRow key={p.id} planned={p} store={store} clientView={clientView} iconSize={iconSize}
                          open={openPlannedIds.has(p.id)}
                          onToggle={() => setOpenPlannedIds(s => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n })}
                          onPreview={setPreview} onDragStateChange={setDragging} />
                      ))}
                    </div>
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

              {/* IN-PERSON */}
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
                      <SelectableGrid materials={homework} view={clientView} iconSize={iconSize} folders={store.folders || []}
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
          </div>
        </div>
      </div>

      {/* RIGHT — embedded Library, same Digital/In-Person toggle as before, for dragging into this client */}
      <div className="ws-materials"
        onDragStartCapture={() => setDragging(true)}
        onDragEndCapture={() => setDragging(false)}>
        <div className="ws-pane-title">
          📚 Library <span className="ws-hint-inline">drag onto a folder above to add →← </span>
        </div>
        <div className="fx-viewseg ws-libtabs">
          <button className={libTab === 'digital' ? 'active' : ''} onClick={() => setLibTab('digital')}>📁 Digital</button>
          {/* Only worth showing once this client actually has an in-person session on the
              books — otherwise it's just a tab that's never relevant to them. */}
          {inPersonAppts.length > 0 && (
            <button className={libTab === 'inperson' ? 'active' : ''} onClick={() => setLibTab('inperson')}>
              🤝 In-Person <span className="ws-count">{countInFolderTree(store.materials, store.folders || [], inPersonFolderId)}</span>
            </button>
          )}
        </div>
        {libTab === 'inperson' && inPersonAppts.length > 0 && inPersonFolderId
          ? <FinderView store={store} scopeFolderId={inPersonFolderId} rootLabel="🤝 In-Person" client={client} />
          : <FinderView store={store} excludeFolderId={[inPersonFolderId, ...mainCollectionFolderIds].filter(Boolean)}
              autoSortByKind={store.settings?.autoSortImports !== false} client={client} />}
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
