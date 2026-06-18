import React, { useState } from 'react'

function ProgressBar({ value, target }) {
  const pct = Math.min((value / target) * 100, 100)
  const color = pct >= 100 ? '#22c55e' : pct >= 70 ? '#f7a84f' : '#4f8ef7'
  return (
    <div className="goal-bar-bg">
      <div className="goal-bar-fill" style={{ width: `${pct}%`, background: color }} />
      <span className="goal-bar-label">{Math.round(value)}%</span>
    </div>
  )
}

function MiniChart({ progress }) {
  if (!progress?.length) return <div className="mini-chart-empty">No data yet</div>
  const vals = progress.slice(-10)
  const max = 100, w = 200, h = 60, pad = 6
  const pts = vals.map((p, i) => {
    const x = pad + (i / Math.max(vals.length - 1, 1)) * (w - pad * 2)
    const y = h - pad - ((p.accuracy / max) * (h - pad * 2))
    return `${x},${y}`
  })
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mini-chart">
      <polyline points={pts.join(' ')} fill="none" stroke="#4f8ef7" strokeWidth="2" strokeLinejoin="round" />
      {vals.map((p, i) => {
        const x = pad + (i / Math.max(vals.length - 1, 1)) * (w - pad * 2)
        const y = h - pad - ((p.accuracy / max) * (h - pad * 2))
        return <circle key={i} cx={x} cy={y} r="3" fill="#4f8ef7" />
      })}
      <line x1={pad} y1={h - pad - ((80 / max) * (h - pad * 2))} x2={w - pad} y2={h - pad - ((80 / max) * (h - pad * 2))} stroke="#22c55e33" strokeDasharray="3,3" />
    </svg>
  )
}

export default function GoalsPage({ store, clientId }) {
  const [showAdd, setShowAdd] = useState(false)
  const [showProgress, setShowProgress] = useState(null)
  const [form, setForm] = useState({ title: '', description: '', targetAccuracy: 80 })
  const [progForm, setProgForm] = useState({ accuracy: '', notes: '' })

  const clientGoals = (store.goals||[]).filter(g => g.clientId === clientId)
  const client = store.clients.find(c => c.id === clientId)

  const submit = (e) => {
    e.preventDefault()
    if (!form.title.trim()) return
    store.addGoal(clientId, { ...form })
    setForm({ title:'', description:'', targetAccuracy:80 })
    setShowAdd(false)
  }

  const submitProgress = (e) => {
    e.preventDefault()
    const acc = parseFloat(progForm.accuracy)
    if (isNaN(acc)) return
    store.addGoalProgress(showProgress, { accuracy: acc, notes: progForm.notes })
    setProgForm({ accuracy:'', notes:'' })
    setShowProgress(null)
  }

  const latestAccuracy = (goal) => {
    if (!goal.progress?.length) return null
    return goal.progress[goal.progress.length - 1].accuracy
  }

  return (
    <div>
      <div className="section-title" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <h2>Goals {client ? `— ${client.name}` : ''}</h2>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>+ Add Goal</button>
      </div>

      {clientGoals.length === 0 ? (
        <div className="empty-state" style={{ padding:'40px 20px' }}>
          <div className="empty-icon">🏆</div>
          <p>No goals set. Add IEP goals to track progress over time.</p>
        </div>
      ) : (
        <div className="goals-list">
          {clientGoals.map(goal => {
            const latest = latestAccuracy(goal)
            return (
              <div key={goal.id} className={`goal-card ${!goal.active ? 'goal-inactive' : ''}`}>
                <div className="goal-header">
                  <div>
                    <div className="goal-title">{goal.title}</div>
                    {goal.description && <div className="goal-desc">{goal.description}</div>}
                  </div>
                  <div className="goal-actions">
                    <button className="btn-icon" onClick={() => setShowProgress(goal.id)} title="Log progress">+%</button>
                    <button className="btn-icon" onClick={() => store.updateGoal(goal.id, { active: !goal.active })} title={goal.active ? 'Archive' : 'Activate'}>
                      {goal.active ? '📦' : '✓'}
                    </button>
                    <button className="btn-icon btn-delete" onClick={() => store.deleteGoal(goal.id)}>✕</button>
                  </div>
                </div>
                <div className="goal-target">Target: {goal.targetAccuracy}% accuracy</div>
                {latest !== null && <ProgressBar value={latest} target={goal.targetAccuracy} />}
                <MiniChart progress={goal.progress} />
                {goal.progress?.length > 0 && (
                  <div className="goal-history">
                    {goal.progress.slice(-3).reverse().map((p,i) => (
                      <span key={i} className="goal-entry">
                        {new Date(p.date).toLocaleDateString()} — {p.accuracy}%{p.notes ? ` (${p.notes})` : ''}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showAdd && (
        <div className="modal-backdrop" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Add Goal</h2>
            <form onSubmit={submit}>
              <label>Goal Title *<input autoFocus value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="e.g. /s/ in word-initial position" /></label>
              <label>Description<textarea rows={2} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="Context, cues, level…" /></label>
              <label>Target Accuracy (%)
                <input type="number" min="0" max="100" value={form.targetAccuracy} onChange={e=>setForm(f=>({...f,targetAccuracy:parseInt(e.target.value)||80}))} />
              </label>
              <div className="form-actions">
                <button type="button" className="btn-secondary" onClick={()=>setShowAdd(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Add Goal</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showProgress && (
        <div className="modal-backdrop" onClick={() => setShowProgress(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Log Progress</h2>
            <p style={{color:'var(--text-muted)',fontSize:13,marginBottom:14}}>{(store.goals||[]).find(g=>g.id===showProgress)?.title}</p>
            <form onSubmit={submitProgress}>
              <label>Accuracy (%) *<input autoFocus type="number" min="0" max="100" value={progForm.accuracy} onChange={e=>setProgForm(f=>({...f,accuracy:e.target.value}))} placeholder="e.g. 75" /></label>
              <label>Notes<input value={progForm.notes} onChange={e=>setProgForm(f=>({...f,notes:e.target.value}))} placeholder="Context, cue level…" /></label>
              <div className="form-actions">
                <button type="button" className="btn-secondary" onClick={()=>setShowProgress(null)}>Cancel</button>
                <button type="submit" className="btn-primary">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
