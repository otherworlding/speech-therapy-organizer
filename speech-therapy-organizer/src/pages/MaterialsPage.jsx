import React from 'react'
import Workspace from '../components/Workspace'

export default function MaterialsPage({ store }) {
  return (
    <div className="page page-wide materials-page">
      <div className="page-header">
        <h1>📚 Library</h1>
      </div>
      <Workspace store={store} />
    </div>
  )
}
