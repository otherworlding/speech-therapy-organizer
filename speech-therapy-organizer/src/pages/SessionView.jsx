import React, { useState, useRef, useEffect } from 'react'
import FileViewer from '../components/FileViewer'
import TrialCounter from '../components/SessionTools/TrialCounter'
import SessionTimer from '../components/SessionTools/SessionTimer'
import TokenBoard from '../components/SessionTools/TokenBoard'
import ClinicianCues from '../components/SessionTools/ClinicianCues'

const CATS = ['Language','Comprehension','Pragmatic','Age']
const CAT_COLOR = { Language:'#4f8ef7', Comprehension:'#34c97a', Pragmatic:'#f7a84f', Age:'#c97adb' }
const EXT_ICON = { pdf:'📄', pptx:'📊', ppt:'📊', jpg:'🖼', jpeg:'🖼', png:'🖼', gif:'🖼', mp4:'🎬', mov:'🎬', mp3:'🎵', wav:'🎵', m4a:'🎵' }
function matIcon(m) {
  if (m.type === 'image-deck') return '🖼🖼'
  const ext = (m.filePath||'').split('.').pop().toLowerCase()
  return EXT_ICON[ext] || '📎'
}

export default function SessionView({ store, clientId, tools, onExit }) {
  const client = store.clients.find(c => c.id === clientId)
  const [tab, setTab] = useState('mine')
  const [currentIdx, setCurrentIdx] = useState(0)
  const [playlist, setPlaylist] = useState(() =>
    store.materials.filter(m => client?.materialIds?.includes(m.id))
  )
  const [fullscreen, setFullscreen] = useState(false)
  const [libSearch, setLibSearch] = useState('')
  const [libCat, setLibCat] = useState('All')
  const [sessionNotes, setSessionNotes] = useState('')
  const [materialData, setMaterialData] = useState({}) // { materialId: { trials, needsRepeat } }
  const [tokensEarned, setTokensEarned] = useState(0)
  const [showEnd, setShowEnd] = useState(false)
  const [showHomework, setShowHomework] = useState(false)
  const [homeworkText, setHomeworkText] = useState('')
  const startTimeRef = useRef(Date.now())
  const elapsedRef = useRef(0)
  const sessionIdRef = useRef(null)

  useEffect(() => {
    // Create session record immediately
    const s = store.addSession({ clientId, date: new Date().toISOString(), materialsUsed: [], sessionNotes: '', tokensEarned: 0 })
    sessionIdRef.current = s.id
  }, [])

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
    setShowEnd(false)
    setShowHomework(true)
  }

  const finishAndExit = (sendHomework) => {
    if (sendHomework && homeworkText) {
      store.updateSession(sessionIdRef.current, { homeworkNotes: homeworkText })
    }
    onExit()
  }

  if (showHomework) {
    const usedMats = playlist.filter((_, i) => true)
    const defaultHW = `Session Summary — ${client.name} — ${new Date().toLocaleDateString()}\n\n` +
      `Materials covered:\n${usedMats.map(m => `• ${m.title}`).join('\n')}\n\n` +
      `Home Practice:\n`
    if (!homeworkText) setHomeworkText(defaultHW)
    return (
      <div className="session-shell" style={{ background: '#0f1523' }}>
        <div className="modal-backdrop">
          <div className="modal modal-wide">
            <h2>📤 Parent Summary & Homework</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
              Edit and send to the family after the session.
            </p>
            <textarea
              className="notes-textarea"
              style={{ minHeight: 260, fontFamily: 'monospace', fontSize: 13 }}
              value={homeworkText}
              onChange={e => setHomeworkText(e.target.value)}
            />
            <div className="form-actions">
              <button className="btn-secondary" onClick={() => finishAndExit(false)}>Skip & Exit</button>
              <button className="btn-secondary" onClick={() => window.api?.copyToClipboard(homeworkText)}>📋 Copy</button>
              <button className="btn-primary" onClick={() => {
                window.api?.exportReport(`Session-${client.name.replace(/\s/g,'-')}-${new Date().toISOString().slice(0,10)}.txt`, homeworkText)
                finishAndExit(true)
              }}>💾 Save & Exit</button>
            </div>
          </div>
        </div>
      </div>
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
          </div>
          <div className="session-tabs">
            <button className={`session-tab ${tab==='mine'?'active':''}`} onClick={()=>setTab('mine')}>
              Playlist <span className="session-tab-count">{playlist.length}</span>
            </button>
            <button className={`session-tab ${tab==='library'?'active':''}`} onClick={()=>setTab('library')}>
              Library <span className="session-tab-count">{store.materials.length}</span>
            </button>
          </div>
          <button className="session-exit-btn" onClick={() => setShowEnd(true)}>✕ End Session</button>
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
                <div className="playlist-empty">No materials — switch to Library to add some</div>
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
              <button className="btn-secondary" onClick={() => setShowEnd(false)}>Keep Going</button>
              <button className="btn-primary" onClick={handleEndSession}>End & Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
