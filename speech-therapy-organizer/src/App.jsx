import React, { useState } from 'react'
import { useStore } from './store/useStore'
import Sidebar from './components/Sidebar'
import ClientsPage from './pages/ClientsPage'
import MaterialsPage from './pages/MaterialsPage'
import ClientDetailPage from './pages/ClientDetailPage'
import SessionSetup from './pages/SessionSetup'
import SessionView from './pages/SessionView'
import ReportsPage from './pages/ReportsPage'

export default function App() {
  const store = useStore()
  const [view, setView] = useState('clients')
  const [selectedClientId, setSelectedClientId] = useState(null)
  const [sessionClientId, setSessionClientId] = useState(null)
  const [sessionTools, setSessionTools] = useState(null)
  const [showSetup, setShowSetup] = useState(false)
  const [setupClientId, setSetupClientId] = useState(null)

  const openClient = (id) => { setSelectedClientId(id); setView('client-detail') }
  const goBack = () => { setSelectedClientId(null); setView('clients') }

  const requestSession = (id) => { setSetupClientId(id); setShowSetup(true) }
  const startSession = (tools) => {
    setShowSetup(false)
    setSessionClientId(setupClientId)
    setSessionTools(tools)
    setView('session')
  }
  const endSession = () => { setSessionClientId(null); setSessionTools(null); setView('clients') }

  if (!store.loaded) return <div className="loading">Loading…</div>

  if (view === 'session' && sessionClientId) {
    return <SessionView store={store} clientId={sessionClientId} tools={sessionTools} onExit={endSession} />
  }

  return (
    <div className="app-shell">
      <div className="app-titlebar" />
      <div className="app-body">
      <Sidebar view={view} setView={setView} />
      <main className="main-content">
        {view === 'clients' && (
          <ClientsPage store={store} onOpenClient={openClient} onStartSession={requestSession} />
        )}
        {view === 'materials' && <MaterialsPage store={store} />}
        {view === 'client-detail' && selectedClientId && (
          <ClientDetailPage store={store} clientId={selectedClientId} onBack={goBack} onStartSession={requestSession} />
        )}
        {view === 'reports' && <ReportsPage store={store} />}
      </main>
      </div>

      {showSetup && setupClientId && (
        <SessionSetup
          client={store.clients.find(c => c.id === setupClientId)}
          onStart={startSession}
          onCancel={() => setShowSetup(false)}
        />
      )}
    </div>
  )
}
