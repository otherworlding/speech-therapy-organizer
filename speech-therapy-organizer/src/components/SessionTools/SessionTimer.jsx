import React, { useState, useEffect, useRef } from 'react'

function fmt(secs) {
  const m = Math.floor(Math.abs(secs) / 60).toString().padStart(2, '0')
  const s = (Math.abs(secs) % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function barColor(remaining, over) {
  if (over) return '#f75f5f'
  if (remaining <= 60)  return '#f75f5f'   // red — 1 min left
  if (remaining <= 300) return '#f7a84f'   // yellow — 5 min left
  return '#34c97a'                         // green
}

export default function SessionTimer({ durationMins = 45, onTick }) {
  const total = durationMins * 60
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(true)
  const [barMode, setBarMode] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (running) {
      ref.current = setInterval(() => {
        setElapsed(e => {
          const next = e + 1
          onTick?.(next)
          return next
        })
      }, 1000)
    }
    return () => clearInterval(ref.current)
  }, [running])

  const remaining = total - elapsed
  const over = remaining < 0
  const pct = Math.min((elapsed / total) * 100, 100)
  const color = barColor(remaining, over)

  if (barMode) {
    return (
      <div className={`tool-panel session-timer ${over ? 'timer-over' : ''}`}>
        <div className="timer-bar-mode-header">
          <button className="timer-mode-btn" onClick={() => setBarMode(false)} title="Show numbers">🔢</button>
          <button className="timer-toggle" onClick={() => setRunning(r => !r)}>{running ? '⏸' : '▶'}</button>
        </div>
        <div className="timer-bar-big-bg">
          {over
            ? <div className="timer-stop-sign" />
            : <div className="timer-bar-big-fill" style={{ width: `${pct}%`, background: color }} />
          }
        </div>
      </div>
    )
  }

  return (
    <div className={`tool-panel session-timer ${over ? 'timer-over' : ''}`}>
      <div className="tool-title">
        ⏱ Time
        <button className="timer-mode-btn" onClick={() => setBarMode(true)} title="Bar mode">▬</button>
      </div>
      <div className="timer-display">{over && '+'}{fmt(remaining)}</div>
      <div className="timer-bar-bg">
        <div className="timer-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="timer-sub">{fmt(elapsed)} elapsed</div>
      <button className="timer-toggle" onClick={() => setRunning(r => !r)}>
        {running ? '⏸' : '▶'}
      </button>
    </div>
  )
}
