import React from 'react'

export default function Sidebar({ view, setView }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="logo-icon">🗣</span>
        <span className="logo-text">SpeechOrg</span>
      </div>
      <nav className="sidebar-nav">
        <button
          className={`nav-item ${view === 'clients' || view === 'client-detail' ? 'active' : ''}`}
          onClick={() => setView('clients')}
        >
          <span className="nav-icon">👦</span>
          <span>Clients</span>
        </button>
        <button
          className={`nav-item ${view === 'materials' ? 'active' : ''}`}
          onClick={() => setView('materials')}
        >
          <span className="nav-icon">📁</span>
          <span>Materials Library</span>
        </button>
      </nav>
    </aside>
  )
}
