import React, { useState, useEffect } from 'react'
import { useStore } from './store/useStore'
import Sidebar from './components/Sidebar'
import ClientsPage from './pages/ClientsPage'
import MaterialsPage from './pages/MaterialsPage'
import ClientDetailPage from './pages/ClientDetailPage'
import SessionSetup from './pages/SessionSetup'
import SessionView from './pages/SessionView'
import ReportsPage from './pages/ReportsPage'
import CalendarPage from './pages/CalendarPage'
import SettingsPage from './pages/SettingsPage'
import InvoiceTrackerPage from './pages/InvoiceTrackerPage'
import { resolveProvider } from './utils/billing'

export default function App() {
  const store = useStore()
  const [view, setView] = useState('clients')
  const [selectedClientId, setSelectedClientId] = useState(null)
  const [sessionClientId, setSessionClientId] = useState(null)
  const [sessionTools, setSessionTools] = useState(null)
  const [sessionPlannedId, setSessionPlannedId] = useState(null)
  const [showSetup, setShowSetup] = useState(false)
  const [setupClientId, setSetupClientId] = useState(null)

  const openClient = (id) => { setSelectedClientId(id); setView('client-detail') }
  const goBack = () => { setSelectedClientId(null); setView('clients') }

  const requestSession = (id) => { setSetupClientId(id); setShowSetup(true) }
  const startSession = (tools, plannedSessionId = null) => {
    setShowSetup(false)
    setSessionClientId(setupClientId)
    setSessionTools(tools)
    setSessionPlannedId(plannedSessionId)
    setView('session')
  }
  const endSession = () => { setSessionClientId(null); setSessionTools(null); setSessionPlannedId(null); setView('clients') }

  // One-time migration: seed a default Provider from the old global branding settings
  // (appName/logoPath) so existing users don't lose their sidebar identity when the
  // per-client custom-branding design was replaced by a proper Providers system.
  useEffect(() => {
    if (!store.loaded || store.providers.length > 0) return
    store.addProvider({
      name: store.settings?.appName?.trim() || 'My Practice',
      logoPath: store.settings?.logoPath || null,
      isDefault: true,
    })
  }, [store.loaded, store.providers.length])

  // Appearance preset — stamped on <html> so every CSS var override in index.css
  // (:root[data-theme="..."]) applies app-wide, including the sidebar.
  useEffect(() => {
    document.documentElement.dataset.theme = store.settings?.theme || 'calm'
  }, [store.settings?.theme])

  if (!store.loaded) return <div className="loading">Loading…</div>

  // Branding follows whichever client's context you're currently in — their
  // assigned Provider (Billing tab) if they have one, otherwise the app-wide
  // default. resolveProvider already does that fallback, including for a null
  // client (Clients list, Library, Settings, etc. just get the default).
  if (view === 'session' && sessionClientId) {
    const sessionProvider = resolveProvider(store.clients.find(c => c.id === sessionClientId), store.providers)
    return <SessionView store={store} clientId={sessionClientId} tools={sessionTools} onExit={endSession} provider={sessionProvider} plannedSessionId={sessionPlannedId} />
  }

  const contextClient = view === 'client-detail' ? store.clients.find(c => c.id === selectedClientId) : null
  const activeProvider = resolveProvider(contextClient, store.providers)

  return (
    <div className="app-shell">
      <div className="app-titlebar" />
      <div className="app-body">
      <Sidebar view={view} setView={setView} provider={activeProvider} />
      <main className="main-content">
        {view === 'clients' && (
          <ClientsPage store={store} onOpenClient={openClient} onStartSession={requestSession} />
        )}
        {view === 'materials' && <MaterialsPage store={store} />}
        {view === 'client-detail' && selectedClientId && (
          <ClientDetailPage store={store} clientId={selectedClientId} onBack={goBack} onStartSession={requestSession} />
        )}
        {view === 'reports' && <ReportsPage store={store} />}
        {view === 'invoices' && <InvoiceTrackerPage store={store} />}
        {view === 'calendar' && <CalendarPage store={store} />}
        {view === 'settings' && <SettingsPage store={store} />}
      </main>
      </div>

      {showSetup && setupClientId && (
        <SessionSetup
          client={store.clients.find(c => c.id === setupClientId)}
          store={store}
          onStart={startSession}
          onCancel={() => setShowSetup(false)}
        />
      )}
    </div>
  )
}
