import React, { useState } from 'react'
import { useStore } from './store/useStore'
import Sidebar from './components/Sidebar'
import ClientsPage from './pages/ClientsPage'
import MaterialsPage from './pages/MaterialsPage'
import ClientDetailPage from './pages/ClientDetailPage'
import SessionView from './pages/SessionView'

export default function App() {
  const store = useStore()
  const [view, setView] = useState('clients')
  const [selectedClientId, setSelectedClientId] = useState(null)
  const [sessionClientId, setSessionClientId] = useState(null)

  const openClient = (id) => {
    setSelectedClientId(id)
    setView('client-detail')
  }

  const goBack = () => {
    setSelectedClientId(null)
    setView('clients')
  }

  const startSession = (id) => {
    setSessionClientId(id)
    setView('session')
  }

  const endSession = () => {
    setSessionClientId(null)
    setView('clients')
  }

  if (!store.loaded) {
    return <div className="loading">Loading…</div>
  }

  if (view === 'session' && sessionClientId) {
    return <SessionView store={store} clientId={sessionClientId} onExit={endSession} />
  }

  return (
    <div className="app-shell">
      <Sidebar view={view} setView={setView} />
      <main className="main-content">
        {view === 'clients' && (
          <ClientsPage store={store} onOpenClient={openClient} onStartSession={startSession} />
        )}
        {view === 'materials' && (
          <MaterialsPage store={store} />
        )}
        {view === 'client-detail' && selectedClientId && (
          <ClientDetailPage
            store={store}
            clientId={selectedClientId}
            onBack={goBack}
            onStartSession={startSession}
          />
        )}
      </main>
    </div>
  )
}
