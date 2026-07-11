import React from 'react'
import FinderView from '../components/FinderView'

export default function MaterialsPage({ store }) {
  return (
    <div className="page page-wide materials-page">
      <div className="page-header">
        <h1>Materials Library</h1>
      </div>
      <FinderView store={store} />
    </div>
  )
}
