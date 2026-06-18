import React, { useState } from 'react'
import { useStore } from './store/useStore'
import Sidebar from './components/Sidebar'
import ClientsPage from './pages/ClientsPage'
import MaterialsPage from './pages/MaterialsPage'
import ClientDetailPage from './pages/ClientDetailPage'

export default function App() {
  const store = useStore()
  const [view, setView] = useState('clients') // 'clients' | 'materials' | 'client-detail'
  const [selectedClientId, setSelectedClientId] = useState(null)

  const openClient = (id) => {
    setSelectedClientId(id)
    setView('client-detail')
  }

  const goBack = () => {
    setSelectedClientId(null)
    setView('clients')
  }

  if (!store.loaded) {
    return <div className="loading">Loading…</div>
  }

  return (
    <div className="app-shell">
      <Sidebar view={view} setView={setView} />
      <main className="main-content">
        {view === 'clients' && (
          <ClientsPage store={store} onOpenClient={openClient} />
        )}
        {view === 'materials' && (
          <MaterialsPage store={store} />
        )}
        {view === 'client-detail' && selectedClientId && (
          <ClientDetailPage
            store={store}
            clientId={selectedClientId}
            onBack={goBack}
          />
        )}
      </main>
    </div>
  )
}
