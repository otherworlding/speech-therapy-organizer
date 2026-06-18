import React, { useState, useEffect, useRef } from 'react'

function fmt(secs) {
  const m = Math.floor(Math.abs(secs) / 60).toString().padStart(2, '0')
  const s = (Math.abs(secs) % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export default function SessionTimer({ durationMins = 45, onTick }) {
  const total = durationMins * 60
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(true)
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

  return (
    <div className={`tool-panel session-timer ${over ? 'timer-over' : ''}`}>
      <div className="tool-title">⏱ Time</div>
      <div className="timer-display">{over && '+'}{fmt(remaining)}</div>
      <div className="timer-bar-bg">
        <div className="timer-bar-fill" style={{ width: `${pct}%`, background: over ? '#f75f5f' : pct > 80 ? '#f7a84f' : '#34c97a' }} />
      </div>
      <div className="timer-sub">{fmt(elapsed)} elapsed</div>
      <button className="timer-toggle" onClick={() => setRunning(r => !r)}>
        {running ? '⏸' : '▶'}
      </button>
    </div>
  )
}
