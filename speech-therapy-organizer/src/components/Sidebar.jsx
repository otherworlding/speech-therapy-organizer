import React from 'react'

const NAV = [
  { id: 'clients', icon: '👦', label: 'Clients' },
  { id: 'calendar', icon: '📅', label: 'Schedule' },
  { id: 'materials', icon: '📁', label: 'Library & Planner' },
  { id: 'reports', icon: '📋', label: 'Session Reports' },
  { id: 'invoices', icon: '🧾', label: 'Invoices' },
  { id: 'settings', icon: '⚙️', label: 'Settings' },
]

export default function Sidebar({ view, setView, settings = {} }) {
  const isActive = (id) => id === 'clients'
    ? (view === 'clients' || view === 'client-detail')
    : view === id
  const logoPath = settings?.logoPath || null
  const appName = settings?.appName?.trim() || 'SpeechOrg'

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        {logoPath
          ? <span className="logo-icon logo-icon-img"><img src={`file://${logoPath}`} alt="" /></span>
          : <span className="logo-icon">🗣</span>}
        <span className="logo-text">{appName}</span>
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
