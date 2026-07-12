import React, { useState } from 'react'

// A small marker embedded in every exported sync file so the app can recognize one
// on sight — dropped onto the Library, or picked via a file dialog — without guessing.
export const SYNC_FORMAT_MARKER = 'speechtherapyorganizer-sync-v1'

export function buildSyncPayload(rawData) {
  return { syncFormat: SYNC_FORMAT_MARKER, exportedAt: new Date().toISOString(), ...rawData }
}

// True if a parsed JSON object looks like one of our sync files
export function isSyncPayload(obj) {
  return !!obj && typeof obj === 'object' && obj.syncFormat === SYNC_FORMAT_MARKER
}

const COLLECTION_LABELS = { clients: 'Clients', materials: 'Materials', sessions: 'Sessions', appointments: 'Appointments', goals: 'Goals', folders: 'Folders' }

// Shared merge-preview modal — used both from Settings' manual import and from
// dropping a recognized sync file straight onto the Library.
export default function SyncMergeModal({ store, remoteData, onClose }) {
  const [result] = useState(() => store.previewMerge(remoteData))
  const { merged, summary } = result
  const totalChanges = Object.values(summary).reduce((s, c) => s + c.added + c.updated + c.removed, 0)
  const apply = () => { store.applyMerged(merged); onClose(true) }

  return (
    <div className="modal-backdrop" onClick={() => onClose(false)}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>🔄 Merge Sync File</h2>
        <p className="settings-note" style={{ marginBottom: 10 }}>
          Nothing is applied until you click Apply Merge. Anything new stays; the newer edit wins on conflicts.
        </p>
        {totalChanges === 0 ? (
          <p className="settings-note">No differences — already up to date.</p>
        ) : (
          <div className="sync-preview">
            <div className="sync-preview-title">{totalChanges} change{totalChanges !== 1 ? 's' : ''}</div>
            {Object.entries(summary).filter(([, c]) => c.added || c.updated || c.removed).map(([key, c]) => (
              <div key={key} className="sync-preview-row">
                <span className="sync-preview-label">{COLLECTION_LABELS[key] || key}</span>
                <span className="sync-preview-stats">
                  {c.added > 0 && <span className="sync-stat sync-add">+{c.added} new</span>}
                  {c.updated > 0 && <span className="sync-stat sync-upd">{c.updated} updated</span>}
                  {c.removed > 0 && <span className="sync-stat sync-rem">−{c.removed} removed</span>}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="form-actions">
          <button className="btn-secondary" onClick={() => onClose(false)}>Cancel</button>
          <button className="btn-primary" onClick={apply} disabled={totalChanges === 0}>Apply Merge</button>
        </div>
      </div>
    </div>
  )
}
