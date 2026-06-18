import React, { useState } from 'react'

const EMOJIS = ['⭐', '🌟', '🏆', '🎉', '❤️', '🦋', '🌈', '🐸']

export default function TokenBoard({ goal = 5, onEarn }) {
  const [tokens, setTokens] = useState(0)
  const [emoji, setEmoji] = useState('⭐')
  const complete = tokens >= goal

  const add = () => {
    if (complete) return
    const next = tokens + 1
    setTokens(next)
    onEarn?.(next)
  }

  const reset = () => setTokens(0)

  return (
    <div className={`tool-panel token-board ${complete ? 'token-complete' : ''}`}>
      <div className="tool-title">
        <span>{emoji} Tokens</span>
        <select className="token-emoji-pick" value={emoji} onChange={e => setEmoji(e.target.value)}>
          {EMOJIS.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>
      <div className="token-slots">
        {Array.from({ length: goal }).map((_, i) => (
          <div key={i} className={`token-slot ${i < tokens ? 'filled' : ''}`}>
            {i < tokens ? emoji : '○'}
          </div>
        ))}
      </div>
      {complete && <div className="token-congrats">🎉 Great job!</div>}
      <div className="token-btns">
        <button className="token-add" onClick={add} disabled={complete}>+1 Token</button>
        <button className="trial-reset" onClick={reset}>Reset</button>
      </div>
    </div>
  )
}
