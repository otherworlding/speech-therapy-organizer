import React, { useState, useEffect } from 'react'
import FinderView from './FinderView'

const IN_PERSON_FOLDER_NAME = 'In-Person Materials'

// Count materials whose folder chain leads back to rootId (self or any nested subfolder)
function countInFolderTree(materials, folders, rootId) {
  if (!rootId) return 0
  const chainToRoot = (folderId) => {
    const chain = []
    let cur = folderId
    while (cur) { chain.push(cur); cur = folders.find(f => f.id === cur)?.parentId || null }
    return chain
  }
  return materials.filter(m => chainToRoot(m.folderId || null).includes(rootId)).length
}

// Pure general-materials browser — import, tag, organize, Digital/In-Person tabs.
// Per-client planning (Main Collection, session/homework prep) lives on each
// client's own detail page now (see ClientMaterials.jsx), where it has full width
// and an embedded copy of this same Library for dragging things over.
export default function Workspace({ store }) {
  const [libTab, setLibTab] = useState('digital') // digital | inperson

  const inPersonFolder = (store.folders || []).find(f => f.name === IN_PERSON_FOLDER_NAME && !f.parentId)
  const inPersonFolderId = inPersonFolder?.id || null
  useEffect(() => {
    if (!store.loaded || inPersonFolderId) return
    store.addFolder(IN_PERSON_FOLDER_NAME, '#f7a84f', null)
  }, [store.loaded, inPersonFolderId])

  // Every client's Main Collection folder is kept out of the general Library —
  // that's each client's own space, organized from their detail page instead.
  const mainCollectionFolderIds = (store.folders || []).filter(f => f.mainCollection).map(f => f.id)

  return (
    <div className="workspace workspace-library-only">
      <div className="ws-materials ws-materials-full">
        <div className="ws-pane-title">📚 Library</div>
        <div className="fx-viewseg ws-libtabs">
          <button className={libTab === 'digital' ? 'active' : ''} onClick={() => setLibTab('digital')}>📁 Digital</button>
          <button className={libTab === 'inperson' ? 'active' : ''} onClick={() => setLibTab('inperson')}>
            🤝 In-Person <span className="ws-count">{countInFolderTree(store.materials, store.folders || [], inPersonFolderId)}</span>
          </button>
        </div>
        {libTab === 'digital'
          ? <FinderView store={store} excludeFolderId={[inPersonFolderId, ...mainCollectionFolderIds].filter(Boolean)}
              autoSortByKind={store.settings?.autoSortImports !== false} />
          : inPersonFolderId && <FinderView store={store} scopeFolderId={inPersonFolderId} rootLabel="🤝 In-Person" />}
      </div>
    </div>
  )
}
