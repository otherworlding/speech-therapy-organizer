import { useState, useEffect, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'

const isElectron = typeof window !== 'undefined' && window.api
const EMPTY = {
  clients: [], materials: [], sessions: [], goals: [], appointments: [], settings: {}, folders: [],
  tombstones: { clients: {}, materials: {}, sessions: {}, appointments: {}, goals: {}, folders: {} },
}
const COLLECTIONS = ['clients', 'materials', 'sessions', 'appointments', 'goals', 'folders']

function now() { return new Date().toISOString() }
function emptyTombstones() { return { clients: {}, materials: {}, sessions: {}, appointments: {}, goals: {}, folders: {} } }

function localLoad() {
  try { return { ...EMPTY, ...JSON.parse(localStorage.getItem('sto_data')) } }
  catch { return { ...EMPTY } }
}
function localSave(data) { localStorage.setItem('sto_data', JSON.stringify(data)) }

// ── Merge: union additions, keep the newer edit per record, honor deletions via tombstones.
// Never silently drops a record that only exists on one side — deletion only happens through
// an explicit, timestamped tombstone, and a later edit beats an earlier tombstone.
function mergeCollection(localList, remoteList, localTomb, remoteTomb) {
  const merged = new Map()
  for (const rec of localList || []) merged.set(rec.id, rec)
  let added = 0, updated = 0
  for (const rec of remoteList || []) {
    const existing = merged.get(rec.id)
    if (!existing) { merged.set(rec.id, rec); added++; continue }
    const localTime = existing.updatedAt || existing.createdAt || ''
    const remoteTime = rec.updatedAt || rec.createdAt || ''
    if (remoteTime > localTime) { merged.set(rec.id, rec); updated++ }
  }
  const allTomb = { ...(localTomb || {}), ...(remoteTomb || {}) }
  // If both sides deleted the same id, keep whichever tombstone is newer
  for (const id of Object.keys(localTomb || {})) {
    if (remoteTomb?.[id] && remoteTomb[id] > localTomb[id]) allTomb[id] = remoteTomb[id]
  }
  let removed = 0
  for (const [id, deletedAt] of Object.entries(allTomb)) {
    const rec = merged.get(id)
    if (rec) {
      const recTime = rec.updatedAt || rec.createdAt || ''
      // A tombstone only wins if nothing edited this record after the delete happened —
      // an edit after a delete on the other machine means "keep it," per the never-lose-data rule.
      if (deletedAt >= recTime) { merged.delete(id); removed++ }
    }
  }
  return { records: [...merged.values()], tombstones: allTomb, added, updated, removed }
}

// Merge an incoming (remote) data snapshot into local data. Returns { merged, summary }.
export function mergeData(local, remote) {
  const localT = local.tombstones || emptyTombstones()
  const remoteT = remote.tombstones || emptyTombstones()
  const merged = { ...local }
  const summary = {}
  const tombstones = {}
  for (const key of COLLECTIONS) {
    const r = mergeCollection(local[key], remote[key], localT[key], remoteT[key])
    merged[key] = r.records
    tombstones[key] = r.tombstones
    summary[key] = { added: r.added, updated: r.updated, removed: r.removed }
  }
  merged.tombstones = tombstones
  // Settings: keep whichever side's settings blob was touched more recently
  const localSTime = local.settings?.updatedAt || ''
  const remoteSTime = remote.settings?.updatedAt || ''
  merged.settings = remoteSTime > localSTime ? { ...(remote.settings || {}) } : { ...(local.settings || {}) }
  return { merged, summary }
}

export function useStore() {
  const [data, setData] = useState(EMPTY)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    async function init() {
      const d = isElectron ? await window.api.loadData() : localLoad()
      setData({ ...EMPTY, ...d, tombstones: { ...emptyTombstones(), ...(d.tombstones || {}) } })
      setLoaded(true)
    }
    init()
  }, [])

  const persist = useCallback((next) => {
    setData(next)
    if (isElectron) window.api.saveData(next)
    else localSave(next)
  }, [])

  // Record a deletion so a merge later knows it was intentional
  const tombstone = (data, collection, id) => ({
    ...data,
    tombstones: { ...data.tombstones, [collection]: { ...data.tombstones[collection], [id]: now() } },
  })

  // ── Merge in a synced snapshot from another machine ──
  // Preview first (no changes committed) so the UI can show a summary before applying.
  const previewMerge = (remote) => {
    const remoteFull = { ...EMPTY, ...remote, tombstones: { ...emptyTombstones(), ...(remote.tombstones || {}) } }
    return mergeData(data, remoteFull)
  }
  const applyMerged = (merged) => { persist(merged) }

  // ── Clients ──────────────────────────────────────────────────────────
  const addClient = (fields) => {
    const next = { ...data, clients: [...data.clients, { id: uuidv4(), materialIds: [], createdAt: now(), updatedAt: now(), ...fields }] }
    persist(next)
  }
  const updateClient = (id, updates) => {
    persist({ ...data, clients: data.clients.map(c => c.id === id ? { ...c, ...updates, updatedAt: now() } : c) })
  }
  const deleteClient = (id) => {
    const folders = data.folders || []
    const mainFolder = folders.find(f => f.mainCollection && f.clientId === id)
    let next = {
      ...data,
      clients: data.clients.filter(c => c.id !== id),
      sessions: data.sessions.filter(s => s.clientId !== id),
      goals: data.goals.filter(g => g.clientId !== id),
      appointments: (data.appointments || []).filter(a => a.clientId !== id),
    }
    // The client's Main Collection folder is theirs alone — clean it up (and any
    // subfolders/materials inside it) the same way deleteFolder cascades, so it
    // doesn't linger as an orphaned entry in the Digital library exclusion list.
    if (mainFolder) {
      const doomed = new Set([mainFolder.id])
      let grew = true
      while (grew) {
        grew = false
        for (const f of folders) {
          if (f.parentId && doomed.has(f.parentId) && !doomed.has(f.id)) { doomed.add(f.id); grew = true }
        }
      }
      const deadMaterialIds = new Set(data.materials.filter(m => doomed.has(m.folderId)).map(m => m.id))
      next = {
        ...next,
        folders: folders.filter(f => !doomed.has(f.id)),
        materials: data.materials.filter(m => !deadMaterialIds.has(m.id)),
      }
      for (const fid of doomed) next = tombstone(next, 'folders', fid)
      for (const mid of deadMaterialIds) next = tombstone(next, 'materials', mid)
    }
    persist(tombstone(next, 'clients', id))
  }
  const assignMaterial = (clientId, materialId) => {
    persist({
      ...data,
      clients: data.clients.map(c =>
        c.id === clientId && !c.materialIds.includes(materialId)
          ? { ...c, materialIds: [...c.materialIds, materialId], updatedAt: now() } : c
      )
    })
  }
  const unassignMaterial = (clientId, materialId) => {
    persist({
      ...data,
      clients: data.clients.map(c =>
        c.id === clientId ? { ...c, materialIds: c.materialIds.filter(id => id !== materialId), updatedAt: now() } : c
      )
    })
  }
  // Assign several materials to a client at once (deduped)
  const assignMaterials = (clientId, materialIds) => {
    persist({
      ...data,
      clients: data.clients.map(c =>
        c.id === clientId ? { ...c, materialIds: Array.from(new Set([...(c.materialIds || []), ...materialIds])), updatedAt: now() } : c
      )
    })
  }
  // Homework list per client (curated set to send home)
  const assignHomework = (clientId, materialIds) => {
    persist({
      ...data,
      clients: data.clients.map(c =>
        c.id === clientId ? { ...c, homeworkIds: Array.from(new Set([...(c.homeworkIds || []), ...materialIds])), updatedAt: now() } : c
      )
    })
  }
  const unassignHomework = (clientId, materialId) => {
    persist({
      ...data,
      clients: data.clients.map(c =>
        c.id === clientId ? { ...c, homeworkIds: (c.homeworkIds || []).filter(id => id !== materialId), updatedAt: now() } : c
      )
    })
  }

  // Copy or move a client's whole assigned material list to another client
  const transferClientMaterials = (fromId, toId, { move = false } = {}) => {
    const from = data.clients.find(c => c.id === fromId)
    if (!from) return
    const ids = from.materialIds || []
    persist({
      ...data,
      clients: data.clients.map(c => {
        if (c.id === toId) return { ...c, materialIds: Array.from(new Set([...(c.materialIds || []), ...ids])), updatedAt: now() }
        if (move && c.id === fromId) return { ...c, materialIds: [], updatedAt: now() }
        return c
      })
    })
  }

  // ── Materials ─────────────────────────────────────────────────────────
  const addMaterial = (material) => {
    const m = { id: uuidv4(), tags: [], createdAt: now(), updatedAt: now(), ...material }
    // Functional update so rapid sequential calls each see the latest state
    setData(prev => {
      const next = { ...prev, materials: [...prev.materials, m] }
      if (isElectron) window.api.saveData(next)
      else localSave(next)
      return next
    })
    return m
  }
  const updateMaterial = (id, updates) => {
    persist({ ...data, materials: data.materials.map(m => m.id === id ? { ...m, ...updates, updatedAt: now() } : m) })
  }
  // Move many materials into a folder (or to root when folderId is null) in one write
  const moveMaterials = (materialIds, folderId) => {
    const set = new Set(materialIds)
    persist({ ...data, materials: data.materials.map(m => set.has(m.id) ? { ...m, folderId, updatedAt: now() } : m) })
  }
  // Bulk-import a pre-shaped nested tree { name, color?, materials:[...], folders:[...] }.
  // Assigns ids, wires parentId/folderId, and persists once. Returns new material ids.
  const importTree = (node, parentFolderId = null) => {
    const newFolders = []
    const newMaterials = []
    const walk = (n, parentId) => {
      const fid = uuidv4()
      newFolders.push({ id: fid, name: n.name, color: n.color || '#4f8ef7', parentId, createdAt: now(), updatedAt: now() })
      for (const mat of (n.materials || [])) {
        newMaterials.push({ id: uuidv4(), tags: [], createdAt: now(), updatedAt: now(), ...mat, folderId: fid })
      }
      for (const sub of (n.folders || [])) walk(sub, fid)
    }
    walk(node, parentFolderId)
    setData(prev => {
      const next = {
        ...prev,
        folders: [...(prev.folders || []), ...newFolders],
        materials: [...prev.materials, ...newMaterials],
      }
      if (isElectron) window.api.saveData(next); else localSave(next)
      return next
    })
    return newMaterials.map(m => m.id)
  }
  const deleteMaterial = (id) => {
    persist(tombstone({
      ...data,
      materials: data.materials.filter(m => m.id !== id),
      clients: data.clients.map(c => ({ ...c, materialIds: c.materialIds.filter(mid => mid !== id) })),
    }, 'materials', id))
  }

  // ── Sessions ──────────────────────────────────────────────────────────
  const addSession = (session) => {
    const s = {
      id: uuidv4(),
      date: now(),
      duration: 0,
      materialsUsed: [],
      sessionNotes: '',
      tokensEarned: 0,
      homeworkNotes: '',
      updatedAt: now(),
      ...session,
    }
    const next = { ...data, sessions: [...data.sessions, s] }
    persist(next)
    return s
  }
  const updateSession = (id, updates) => {
    persist({ ...data, sessions: data.sessions.map(s => s.id === id ? { ...s, ...updates, updatedAt: now() } : s) })
  }
  const deleteSession = (id) => {
    persist(tombstone({ ...data, sessions: data.sessions.filter(s => s.id !== id) }, 'sessions', id))
  }
  // Photos/notes attached directly to a session record (separate from the reusable Materials Library)
  const addSessionAttachment = (sessionId, attachment) => {
    persist({
      ...data,
      sessions: data.sessions.map(s => s.id === sessionId
        ? { ...s, attachments: [...(s.attachments || []), { id: uuidv4(), addedAt: now(), ...attachment }], updatedAt: now() }
        : s)
    })
  }
  const removeSessionAttachment = (sessionId, attachmentId) => {
    persist({
      ...data,
      sessions: data.sessions.map(s => s.id === sessionId
        ? { ...s, attachments: (s.attachments || []).filter(a => a.id !== attachmentId), updatedAt: now() }
        : s)
    })
  }

  // ── Goals ─────────────────────────────────────────────────────────────
  const addGoal = (clientId, goal) => {
    const g = { id: uuidv4(), clientId, active: true, createdAt: now(), updatedAt: now(), progress: [], targetAccuracy: 80, ...goal }
    persist({ ...data, goals: [...data.goals, g] })
  }
  const updateGoal = (id, updates) => {
    persist({ ...data, goals: data.goals.map(g => g.id === id ? { ...g, ...updates, updatedAt: now() } : g) })
  }
  const deleteGoal = (id) => {
    persist(tombstone({ ...data, goals: data.goals.filter(g => g.id !== id) }, 'goals', id))
  }
  const addGoalProgress = (goalId, entry) => {
    persist({
      ...data,
      goals: data.goals.map(g =>
        g.id === goalId
          ? { ...g, updatedAt: now(), progress: [...g.progress, { id: uuidv4(), date: now(), ...entry }] }
          : g
      )
    })
  }

  // ── Folders (materials organization) ──────────────────────────────────
  // extra: optional fields merged onto the record, e.g. { clientId, mainCollection: true }
  // for the auto-created per-client "Main Collection" folder.
  const addFolder = (name, color, parentId = null, extra = {}) => {
    const f = { id: uuidv4(), name, color, parentId, createdAt: now(), updatedAt: now(), ...extra }
    persist({ ...data, folders: [...(data.folders || []), f] })
    return f
  }
  const updateFolder = (id, updates) => {
    persist({ ...data, folders: (data.folders || []).map(f => f.id === id ? { ...f, ...updates, updatedAt: now() } : f) })
  }
  // Move a folder's contents up one level, then remove the folder (keeps materials)
  const dissolveFolder = (id) => {
    const folders = data.folders || []
    const parent = folders.find(f => f.id === id)?.parentId || null
    persist(tombstone({
      ...data,
      folders: folders.filter(f => f.id !== id).map(f => f.parentId === id ? { ...f, parentId: parent, updatedAt: now() } : f),
      materials: data.materials.map(m => m.folderId === id ? { ...m, folderId: parent, updatedAt: now() } : m),
    }, 'folders', id))
  }
  // Delete a folder and everything inside it (nested folders + their materials), Finder-style
  const deleteFolder = (id) => {
    const folders = data.folders || []
    const doomed = new Set([id])
    let grew = true
    while (grew) {
      grew = false
      for (const f of folders) {
        if (f.parentId && doomed.has(f.parentId) && !doomed.has(f.id)) { doomed.add(f.id); grew = true }
      }
    }
    const deadMaterialIds = new Set(data.materials.filter(m => doomed.has(m.folderId)).map(m => m.id))
    let next = {
      ...data,
      folders: folders.filter(f => !doomed.has(f.id)),
      materials: data.materials.filter(m => !deadMaterialIds.has(m.id)),
      clients: data.clients.map(c => ({ ...c, materialIds: (c.materialIds || []).filter(mid => !deadMaterialIds.has(mid)) })),
    }
    for (const fid of doomed) next = tombstone(next, 'folders', fid)
    for (const mid of deadMaterialIds) next = tombstone(next, 'materials', mid)
    persist(next)
  }

  // ── Settings ──────────────────────────────────────────────────────────
  const updateSettings = (updates) => {
    persist({ ...data, settings: { ...(data.settings || {}), ...updates, updatedAt: now() } })
  }

  // ── Appointments ──────────────────────────────────────────────────────
  const addAppointment = (appt) => {
    const a = { id: uuidv4(), durationMins: 45, notes: '', createdAt: now(), updatedAt: now(), ...appt }
    persist({ ...data, appointments: [...(data.appointments || []), a] })
    return a
  }
  const updateAppointment = (id, updates) => {
    persist({ ...data, appointments: (data.appointments || []).map(a => a.id === id ? { ...a, ...updates, updatedAt: now() } : a) })
  }
  const deleteAppointment = (id) => {
    persist(tombstone({ ...data, appointments: (data.appointments || []).filter(a => a.id !== id) }, 'appointments', id))
  }
  // Planning/review photos+notes attached to an in-person appointment (before or after it happens)
  const addAppointmentAttachment = (appointmentId, attachment) => {
    persist({
      ...data,
      appointments: (data.appointments || []).map(a => a.id === appointmentId
        ? { ...a, attachments: [...(a.attachments || []), { id: uuidv4(), addedAt: now(), ...attachment }], updatedAt: now() }
        : a)
    })
  }
  const removeAppointmentAttachment = (appointmentId, attachmentId) => {
    persist({
      ...data,
      appointments: (data.appointments || []).map(a => a.id === appointmentId
        ? { ...a, attachments: (a.attachments || []).filter(x => x.id !== attachmentId), updatedAt: now() }
        : a)
    })
  }

  return {
    clients: data.clients,
    materials: data.materials,
    sessions: data.sessions,
    goals: data.goals,
    appointments: data.appointments || [],
    settings: data.settings || {},
    folders: data.folders || [],
    loaded,
    addClient, updateClient, deleteClient, assignMaterial, unassignMaterial,
    assignMaterials, transferClientMaterials, assignHomework, unassignHomework,
    addMaterial, updateMaterial, deleteMaterial, moveMaterials, importTree,
    addSession, updateSession, deleteSession, addSessionAttachment, removeSessionAttachment,
    addGoal, updateGoal, deleteGoal, addGoalProgress,
    addAppointment, updateAppointment, deleteAppointment,
    addAppointmentAttachment, removeAppointmentAttachment,
    addFolder, updateFolder, deleteFolder, dissolveFolder,
    updateSettings,
    previewMerge, applyMerged,
    rawData: data,
  }
}
