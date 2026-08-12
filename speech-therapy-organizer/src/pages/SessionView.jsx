import React, { useState, useRef, useEffect } from 'react'
import FileViewer from '../components/FileViewer'
import TrialCounter from '../components/SessionTools/TrialCounter'
import SessionTimer from '../components/SessionTools/SessionTimer'
import TokenBoard from '../components/SessionTools/TokenBoard'
import ClinicianCues from '../components/SessionTools/ClinicianCues'
import SessionAttachments from '../components/SessionAttachments'
import MessagesShare from '../components/MessagesShare'

const CATS = ['Language','Comprehension','Pragmatic','Age']
const CAT_COLOR = { Language:'#4f8ef7', Comprehension:'#34c97a', Pragmatic:'#f7a84f', Age:'#c97adb' }
const EXT_ICON = { pdf:'📄', pptx:'📊', ppt:'📊', jpg:'🖼', jpeg:'🖼', png:'🖼', gif:'🖼', mp4:'🎬', mov:'🎬', mp3:'🎵', wav:'🎵', m4a:'🎵' }
function matIcon(m) {
  if (m.type === 'image-deck') return '🖼🖼'
  const ext = (m.filePath||'').split('.').pop().toLowerCase()
  return EXT_ICON[ext] || '📎'
}

export default function SessionView({ store, clientId, tools, onExit, provider = null, plannedSessionId = null }) {
  const client = store.clients.find(c => c.id === clientId)
  const plannedSession = plannedSessionId ? (store.plannedSessions || []).find(p => p.id === plannedSessionId) : null
  const [tab, setTab] = useState('mine')
  const [currentIdx, setCurrentIdx] = useState(0)
  // A loaded planned session's materials seed the playlist instead of the plain
  // assigned list — that's the whole point of prepping one in advance.
  const [playlist, setPlaylist] = useState(() =>
    plannedSession
      ? store.materials.filter(m => (plannedSession.materialIds || []).includes(m.id))
      : store.materials.filter(m => client?.materialIds?.includes(m.id))
  )
  const [fullscreen, setFullscreen] = useState(false)
  const [libSearch, setLibSearch] = useState('')
  const [libCat, setLibCat] = useState('All')
  const [sessionNotes, setSessionNotes] = useState('')
  const [materialData, setMaterialData] = useState({}) // { materialId: { trials, needsRepeat } }
  const [tokensEarned, setTokensEarned] = useState(0)
  const [showEnd, setShowEnd] = useState(false)
  const [showHomework, setShowHomework] = useState(false)
  const startTimeRef = useRef(Date.now())
  const elapsedRef = useRef(0)
  const sessionIdRef = useRef(null)

  useEffect(() => {
    // Create session record immediately
    const s = store.addSession({ clientId, date: new Date().toISOString(), materialsUsed: [], sessionNotes: '', tokensEarned: 0, sessionType: tools?.sessionType || 'online', attachments: [] })
    sessionIdRef.current = s.id
  }, [])

  // Read the live session record so attachments reflect what's actually persisted
  const liveSession = store.sessions.find(s => s.id === sessionIdRef.current)
  const attachments = liveSession?.attachments || []

  if (!client) return null

  const current = playlist[currentIdx] || null

  const getMaterialData = (id) => materialData[id] || { trials: { correct: 0, incorrect: 0 }, needsRepeat: false }
  const setMaterialField = (id, field, value) => {
    setMaterialData(d => ({ ...d, [id]: { ...getMaterialData(id), [field]: value } }))
  }

  const openMaterial = (idx) => {
    setCurrentIdx(idx)
    setTab('mine')
    // Track that this material was used
    if (playlist[idx]) {
      const id = playlist[idx].id
      if (!materialData[id]) {
        setMaterialData(d => ({ ...d, [id]: { trials: { correct:0, incorrect:0 }, needsRepeat: false } }))
      }
    }
  }

  const addToPlaylist = (mat) => {
    if (playlist.find(m => m.id === mat.id)) return
    const next = [...playlist, mat]
    setPlaylist(next)
    setCurrentIdx(next.length - 1)
  }

  // Step through the playlist (used by arrow keys)
  const step = (delta) => {
    setCurrentIdx(i => {
      const next = Math.max(0, Math.min(playlist.length - 1, i + delta))
      const id = playlist[next]?.id
      if (id) setMaterialData(d => d[id] ? d : ({ ...d, [id]: { trials: { correct: 0, incorrect: 0 }, needsRepeat: false } }))
      return next
    })
  }

  // Keyboard: ← / → move between materials; ↑ / ↓ turn pages inside a document
  // (handled by the PDF viewer). Esc exits fullscreen.
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return
      if (e.key === 'ArrowRight') { step(1); e.preventDefault() }
      else if (e.key === 'ArrowLeft') { step(-1); e.preventDefault() }
      else if (e.key === 'Escape' && fullscreen) { setFullscreen(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [playlist.length, fullscreen])

  const libMaterials = store.materials.filter(m => {
    if (libCat !== 'All' && m.category !== libCat) return false
    if (libSearch && !m.title.toLowerCase().includes(libSearch.toLowerCase())) return false
    return true
  })

  const handleEndSession = () => {
    const duration = Math.round((Date.now() - startTimeRef.current) / 1000)
    const used = playlist.map(m => ({
      materialId: m.id,
      title: m.title,
      trials: getMaterialData(m.id).trials,
      needsRepeat: getMaterialData(m.id).needsRepeat,
    }))
    store.updateSession(sessionIdRef.current, {
      duration, materialsUsed: used, sessionNotes, tokensEarned,
    })
    // A loaded plan is consumed only on a real save — aborting leaves it in the
    // queue untouched, so testing/demoing never destroys real prep work.
    if (plannedSession) store.deletePlannedSession(plannedSession.id)
    setShowEnd(false)
    setShowHomework(true)
  }

  // For testing/demoing without leaving a real session behind — deletes the record
  // created at session start instead of saving it, and skips the homework-share step.
  const handleAbortSession = () => {
    store.deleteSession(sessionIdRef.current)
    setShowEnd(false)
    onExit()
  }


  if (showHomework) {
    return (
      <HomeworkShare
        client={client}
        sessionMaterials={playlist}
        allMaterials={store.materials}
        onLog={(fields) => store.updateSession(sessionIdRef.current, fields)}
        onExit={onExit}
      />
    )
  }

  return (
    <div className={`session-shell ${fullscreen ? 'session-fullscreen' : ''}`}>
      {/* Top bar */}
      {!fullscreen && (
        <div className="session-topbar">
          <div className="session-client-name">
            <span className="session-avatar">{client.name[0].toUpperCase()}</span>
            {client.name}
            <span className="session-type-badge">{tools?.sessionType === 'in-person' ? '🤝 In-Person' : '💻 Online'}</span>
          </div>
          <div className="session-tabs">
            <button className={`session-tab ${tab==='mine'?'active':''}`} onClick={()=>setTab('mine')}>
              Playlist <span className="session-tab-count">{playlist.length}</span>
            </button>
            <button className={`session-tab ${tab==='library'?'active':''}`} onClick={()=>setTab('library')}>
              Library <span className="session-tab-count">{store.materials.length}</span>
            </button>
          </div>
          <div className="session-right">
            {/* Whose session this is billed under — the client's assigned Provider
                (Billing tab), or the practice default if they don't have one set. */}
            {provider && (
              <span className="session-provider-badge" title={`Billed under ${provider.name}`}>
                {provider.logoPath
                  ? <img src={`file://${provider.logoPath}`} alt="" />
                  : <span className="session-provider-dot">🏢</span>}
                {provider.name}
              </span>
            )}
            <button className="session-exit-btn" onClick={() => setShowEnd(true)}>✕ End Session</button>
          </div>
        </div>
      )}

      {/* Main body */}
      <div className="session-body">
        {/* Viewer */}
        <div className="session-viewer-col">
          <FileViewer
            material={current}
            isFullscreen={fullscreen}
            onToggleFullscreen={() => setFullscreen(f => !f)}
          />
          {/* Fullscreen prev/next — arrow keys work too */}
          {fullscreen && playlist.length > 1 && (
            <>
              <button className="fs-nav fs-nav-prev" onClick={() => step(-1)} disabled={currentIdx === 0} title="Previous (←)">‹</button>
              <button className="fs-nav fs-nav-next" onClick={() => step(1)} disabled={currentIdx === playlist.length - 1} title="Next (→)">›</button>
              <div className="fs-nav-count">{currentIdx + 1} / {playlist.length}</div>
            </>
          )}
        </div>

        {/* Right tools panel */}
        {!fullscreen && (
          <div className="session-tools-col">
            {tools.trials && current && (
              <TrialCounter
                trials={getMaterialData(current.id).trials}
                onChange={t => setMaterialField(current.id, 'trials', t)}
              />
            )}
            {tools.timer && (
              <SessionTimer
                durationMins={tools.timerMins}
                onTick={s => { elapsedRef.current = s }}
              />
            )}
            {tools.tokens && (
              <TokenBoard
                goal={tools.tokenGoal}
                onEarn={setTokensEarned}
              />
            )}
            {tools.cues && (
              <ClinicianCues
                materialNotes={current?.notes}
                sessionNotes={sessionNotes}
                onSessionNotesChange={setSessionNotes}
              />
            )}
            {current && (
              <div className="tool-panel repeat-panel">
                <label className="repeat-label">
                  <input
                    type="checkbox"
                    checked={getMaterialData(current.id).needsRepeat}
                    onChange={e => setMaterialField(current.id, 'needsRepeat', e.target.checked)}
                  />
                  Repeat next session
                </label>
              </div>
            )}
            <SessionAttachments
              sessionId={sessionIdRef.current}
              attachments={attachments}
              onAdd={(a) => store.addSessionAttachment(sessionIdRef.current, a)}
              onRemove={(id) => store.removeSessionAttachment(sessionIdRef.current, id)}
              hint={tools?.sessionType === 'in-person' && playlist.length === 0
                ? 'In-person session — no digital materials used yet. Attach a photo of what you worked on to keep a record.'
                : null}
            />
          </div>
        )}
      </div>

      {/* Playlist / Library strip */}
      {!fullscreen && (
        <div className="session-bottom">
          {tab === 'mine' && (
            <div className="playlist-strip">
              {playlist.map((m, i) => {
                const d = getMaterialData(m.id)
                return (
                  <div
                    key={m.id}
                    className={`playlist-tile ${i === currentIdx ? 'active' : ''} ${d.needsRepeat ? 'repeat' : ''}`}
                    onClick={() => openMaterial(i)}
                  >
                    <div className="playlist-icon">{matIcon(m)}</div>
                    <div className="playlist-name">{m.title}</div>
                    {(d.trials.correct + d.trials.incorrect) > 0 && (
                      <div className="playlist-trials">{d.trials.correct}/{d.trials.correct+d.trials.incorrect}</div>
                    )}
                    {d.needsRepeat && <div className="playlist-repeat-dot">🔁</div>}
                  </div>
                )
              })}
              {playlist.length === 0 && (
                <div className="playlist-empty">
                  {tools?.sessionType === 'in-person'
                    ? 'No digital materials — that\'s fine for in-person. Use Attachments in the tools panel to log photos of what was used.'
                    : 'No materials — switch to Library to add some'}
                </div>
              )}
            </div>
          )}

          {tab === 'library' && (
            <div className="lib-strip">
              <input className="session-search lib-search" placeholder="Search library…" value={libSearch} onChange={e=>setLibSearch(e.target.value)} />
              <div className="lib-cats">
                {['All',...CATS].map(c => (
                  <button key={c} className={`session-filter-tab ${libCat===c?'active':''}`} onClick={()=>setLibCat(c)}>{c}</button>
                ))}
              </div>
              <div className="lib-tiles">
                {libMaterials.map(m => {
                  const inPlaylist = playlist.find(p => p.id === m.id)
                  return (
                    <div
                      key={m.id}
                      className={`playlist-tile ${inPlaylist ? 'in-playlist' : ''}`}
                      onClick={() => inPlaylist ? openMaterial(playlist.findIndex(p=>p.id===m.id)) : addToPlaylist(m)}
                    >
                      <div className="playlist-icon">{matIcon(m)}</div>
                      <div className="playlist-name">{m.title}</div>
                      <div className="playlist-cat" style={{ background: CAT_COLOR[m.category]||'#888' }}>{m.category}</div>
                      {inPlaylist && <div className="playlist-check">✓</div>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* End session confirm */}
      {showEnd && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>End Session?</h2>
            <p style={{ color:'var(--text-muted)', marginBottom:20 }}>
              The session log will be saved and you can generate a parent summary.
            </p>
            <div className="form-actions">
              <button className="btn-danger" style={{ marginRight: 'auto' }} onClick={handleAbortSession} title="Discards this session entirely — no record is kept. Use this for testing/demoing.">
                🗑 Abort (don't save)
              </button>
              <button className="btn-secondary" onClick={() => setShowEnd(false)}>Keep Going</button>
              <button className="btn-primary" onClick={handleEndSession}>End & Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── End-of-session parent summary + homework share ──
function filesOfMaterial(m) {
  if (m.type === 'folder') return (m.items || []).map(i => i.filePath).filter(Boolean)
  if (m.type === 'image-deck') return (m.imagePaths || []).filter(Boolean)
  return m.filePath ? [m.filePath] : []
}

function HomeworkShare({ client, sessionMaterials, allMaterials, onLog, onExit }) {
  const dateStr = new Date().toISOString().slice(0, 10)
  // Homework materials may differ from the session — start empty, she picks
  const [chosen, setChosen] = useState(() => new Set())
  const [addSearch, setAddSearch] = useState('')
  const [note, setNote] = useState(
    `Home Practice — ${client.name} — ${new Date().toLocaleDateString()}\n\n` +
    `Hi! Here are today's practice materials. \n\n`
  )
  const [folderInfo, setFolderInfo] = useState(null)
  const [busy, setBusy] = useState(false)
  const [showMessages, setShowMessages] = useState(false)

  // Candidate list: session materials first, plus any searched library material
  const q = addSearch.trim().toLowerCase()
  const extra = q ? allMaterials.filter(m => !sessionMaterials.find(s => s.id === m.id) && m.title.toLowerCase().includes(q)) : []
  const candidates = [...sessionMaterials, ...extra]
  const chosenMats = allMaterials.filter(m => chosen.has(m.id))

  const toggle = (id) => setChosen(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const buildFolder = async () => {
    setBusy(true)
    const filePaths = chosenMats.flatMap(filesOfMaterial)
    const res = await window.api.createHomeworkFolder({ clientName: client.name, dateStr, filePaths })
    setBusy(false)
    if (res?.success) {
      setFolderInfo(res)
      await window.api.revealInFinder(res.folderPath)
      onLog({ homeworkNotes: note, homeworkMaterials: chosenMats.map(m => ({ id: m.id, title: m.title })), homeworkFolder: res.folderPath })
    }
    return res
  }

  const fullMessage = () => {
    const list = chosenMats.map(m => `• ${m.title}`).join('\n')
    return `${note}${list ? `\nMaterials:\n${list}` : ''}`
  }

  const shareWhatsApp = async () => {
    if (chosen.size) await buildFolder()
    const num = (client.whatsapp || client.phone || '').replace(/[^\d]/g, '')
    const text = encodeURIComponent(fullMessage())
    if (num) window.api.openExternal(`https://wa.me/${num}?text=${text}`)
    else { window.api.copyToClipboard(fullMessage()); alert('No WhatsApp number on file — message copied to clipboard. Attach the files from the folder that just opened in Finder.') }
  }
  const shareEmail = async () => {
    if (chosen.size) await buildFolder()
    const subject = encodeURIComponent(`Speech Therapy Home Practice — ${client.name}`)
    window.api.openExternal(`mailto:${encodeURIComponent(client.email || '')}?subject=${subject}&body=${encodeURIComponent(fullMessage())}`)
  }

  return (
    <div className="session-shell" style={{ background: '#0f1523' }}>
      <div className="modal-backdrop">
        <div className="modal modal-wide">
          <h2>📤 Send Home Practice</h2>
          <p className="hw-sub">Pick the materials to send home (they don't have to match the session), add a note, then share.</p>

          <div className="hw-pick-label">Materials to share {chosen.size > 0 && <span className="hw-count">{chosen.size} selected</span>}</div>
          <div className="hw-picklist">
            {candidates.map(m => (
              <label key={m.id} className={`hw-pick ${chosen.has(m.id) ? 'on' : ''}`}>
                <input type="checkbox" checked={chosen.has(m.id)} onChange={() => toggle(m.id)} />
                <span className="hw-pick-name">{m.title}</span>
                {sessionMaterials.find(s => s.id === m.id) && <span className="hw-pick-tag">this session</span>}
              </label>
            ))}
          </div>
          <input className="session-search" placeholder="🔍 Add another material from the library…" value={addSearch} onChange={e => setAddSearch(e.target.value)} style={{ margin: '8px 0' }} />

          <div className="hw-pick-label">Message</div>
          <textarea className="notes-textarea" style={{ minHeight: 120, fontSize: 13 }} value={note} onChange={e => setNote(e.target.value)} />

          {folderInfo && <div className="hw-folder-note">✓ Folder ready ({folderInfo.count} file{folderInfo.count!==1?'s':''}) — revealed in Finder. Attach the files to your message.</div>}

          <div className="form-actions hw-actions">
            <button className="btn-secondary" onClick={onExit}>Skip &amp; Exit</button>
            <button className="btn-secondary" disabled={!chosen.size || busy} onClick={buildFolder}>📂 Folder &amp; Reveal</button>
            <button className="btn-secondary" disabled={busy} onClick={shareWhatsApp}>💬 WhatsApp</button>
            <button className="btn-secondary" disabled={busy} onClick={shareEmail}>✉️ Email</button>
            <button className="btn-secondary" disabled={busy} onClick={() => setShowMessages(true)} title="Attaches the files itself — no manual drag needed">📱 Messages</button>
            <button className="btn-primary" onClick={() => { onLog({ homeworkNotes: note }); onExit() }}>Done</button>
          </div>
        </div>
      </div>
      {showMessages && (
        <MessagesShare client={client} message={fullMessage()} filePaths={chosenMats.flatMap(filesOfMaterial)}
          onClose={() => setShowMessages(false)} />
      )}
    </div>
  )
}
