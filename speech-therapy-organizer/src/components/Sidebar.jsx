import React from 'react'

const NAV = [
  { id: 'clients', icon: '👦', label: 'Clients' },
  { id: 'calendar', icon: '📅', label: 'Schedule' },
  { id: 'materials', icon: '📁', label: 'Library & Planner' },
  { id: 'reports', icon: '📋', label: 'Session Reports' },
  { id: 'settings', icon: '⚙️', label: 'Settings' },
]

export default function Sidebar({ view, setView }) {
  const isActive = (id) => id === 'clients'
    ? (view === 'clients' || view === 'client-detail')
    : view === id

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="logo-icon">🗣</span>
        <span className="logo-text">SpeechOrg</span>
      </div>
      <nav className="sidebar-nav">
        {NAV.map(({ id, icon, label }) => (
          <button
            key={id}
            className={`nav-item ${isActive(id) ? 'active' : ''}`}
            onClick={() => setView(id)}
          >
            <span className="nav-icon">{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </aside>
  )
}
