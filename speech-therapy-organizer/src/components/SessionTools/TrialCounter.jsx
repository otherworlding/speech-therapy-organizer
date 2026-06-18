import React from 'react'

export default function TrialCounter({ trials, onChange }) {
  const { correct = 0, incorrect = 0 } = trials || {}
  const total = correct + incorrect
  const pct = total ? Math.round((correct / total) * 100) : null

  return (
    <div className="tool-panel trial-counter">
      <div className="tool-title">🎯 Trials</div>
      <div className="trial-btns">
        <button className="trial-btn correct" onClick={() => onChange({ correct: correct + 1, incorrect })}>
          ✓
        </button>
        <button className="trial-btn incorrect" onClick={() => onChange({ correct, incorrect: incorrect + 1 })}>
          ✗
        </button>
      </div>
      <div className="trial-score">
        <span className="trial-correct">{correct}</span>
        <span className="trial-sep">/</span>
        <span className="trial-total">{total}</span>
        {pct !== null && <span className="trial-pct">{pct}%</span>}
      </div>
      <button className="trial-reset" onClick={() => onChange({ correct: 0, incorrect: 0 })}>Reset</button>
    </div>
  )
}
