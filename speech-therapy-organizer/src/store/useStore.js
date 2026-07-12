import { useState, useEffect, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'

const isElectron = typeof window !== 'undefined' && window.api
const EMPTY = { clients: [], materials: [], sessions: [], goals: [], appointments: [], settings: {}, folders: [] }

function localLoad() {
  try { return { ...EMPTY, ...JSON.parse(localStorage.getItem('sto_data')) } }
  catch { return { ...EMPTY } }
}
function localSave(data) { localStorage.setItem('sto_data', JSON.stringify(data)) }

export function useStore() {
  const [data, setData] = useState(EMPTY)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    async function init() {
      const d = isElectron ? await window.api.loadData() : localLoad()
      setData({ ...EMPTY, ...d })
      setLoaded(true)
    }
    init()
  }, [])

  const persist = useCallback((next) => {
    setData(next)
    if (isElectron) window.api.saveData(next)
    else localSave(next)
  }, [])

  // ── Clients ──────────────────────────────────────────────────────────
  const addClient = (fields) => {
    const next = { ...data, clients: [...data.clients, { id: uuidv4(), materialIds: [], ...fields }] }
    persist(next)
  }
  const updateClient = (id, updates) => {
    persist({ ...data, clients: data.clients.map(c => c.id === id ? { ...c, ...updates } : c) })
  }
  const deleteClient = (id) => {
    persist({
      ...data,
      clients: data.clients.filter(c => c.id !== id),
      sessions: data.sessions.filter(s => s.clientId !== id),
      goals: data.goals.filter(g => g.clientId !== id),
      appointments: (data.appointments || []).filter(a => a.clientId !== id),
    })
  }
  const assignMaterial = (clientId, materialId) => {
    persist({
      ...data,
      clients: data.clients.map(c =>
        c.id === clientId && !c.materialIds.includes(materialId)
          ? { ...c, materialIds: [...c.materialIds, materialId] } : c
      )
    })
  }
  const unassignMaterial = (clientId, materialId) => {
    persist({
      ...data,
      clients: data.clients.map(c =>
        c.id === clientId ? { ...c, materialIds: c.materialIds.filter(id => id !== materialId) } : c
      )
    })
  }
  // Assign several materials to a client at once (deduped)
  const assignMaterials = (clientId, materialIds) => {
    persist({
      ...data,
      clients: data.clients.map(c =>
        c.id === clientId ? { ...c, materialIds: Array.from(new Set([...(c.materialIds || []), ...materialIds])) } : c
      )
    })
  }
  // Homework list per client (curated set to send home)
  const assignHomework = (clientId, materialIds) => {
    persist({
      ...data,
      clients: data.clients.map(c =>
        c.id === clientId ? { ...c, homeworkIds: Array.from(new Set([...(c.homeworkIds || []), ...materialIds])) } : c
      )
    })
  }
  const unassignHomework = (clientId, materialId) => {
    persist({
      ...data,
      clients: data.clients.map(c =>
        c.id === clientId ? { ...c, homeworkIds: (c.homeworkIds || []).filter(id => id !== materialId) } : c
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
        if (c.id === toId) return { ...c, materialIds: Array.from(new Set([...(c.materialIds || []), ...ids])) }
        if (move && c.id === fromId) return { ...c, materialIds: [] }
        return c
      })
    })
  }

  // ── Materials ─────────────────────────────────────────────────────────
  const addMaterial = (material) => {
    const m = { id: uuidv4(), tags: [], createdAt: new Date().toISOString(), ...material }
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
    persist({ ...data, materials: data.materials.map(m => m.id === id ? { ...m, ...updates } : m) })
  }
  // Move many materials into a folder (or to root when folderId is null) in one write
  const moveMaterials = (materialIds, folderId) => {
    const set = new Set(materialIds)
    persist({ ...data, materials: data.materials.map(m => set.has(m.id) ? { ...m, folderId } : m) })
  }
  // Bulk-import a pre-shaped nested tree { name, color?, materials:[...], folders:[...] }.
  // Assigns ids, wires parentId/folderId, and persists once. Returns new material ids.
  const importTree = (node, parentFolderId = null) => {
    const newFolders = []
    const newMaterials = []
    const walk = (n, parentId) => {
      const fid = uuidv4()
      newFolders.push({ id: fid, name: n.name, color: n.color || '#4f8ef7', parentId })
      for (const mat of (n.materials || [])) {
        newMaterials.push({ id: uuidv4(), tags: [], createdAt: new Date().toISOString(), ...mat, folderId: fid })
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
    persist({
      ...data,
      materials: data.materials.filter(m => m.id !== id),
      clients: data.clients.map(c => ({ ...c, materialIds: c.materialIds.filter(mid => mid !== id) }))
    })
  }

  // ── Sessions ──────────────────────────────────────────────────────────
  const addSession = (session) => {
    const s = {
      id: uuidv4(),
      date: new Date().toISOString(),
      duration: 0,
      materialsUsed: [],
      sessionNotes: '',
      tokensEarned: 0,
      homeworkNotes: '',
      ...session,
    }
    const next = { ...data, sessions: [...data.sessions, s] }
    persist(next)
    return s
  }
  const updateSession = (id, updates) => {
    persist({ ...data, sessions: data.sessions.map(s => s.id === id ? { ...s, ...updates } : s) })
  }
  const deleteSession = (id) => {
    persist({ ...data, sessions: data.sessions.filter(s => s.id !== id) })
  }

  // ── Goals ─────────────────────────────────────────────────────────────
  const addGoal = (clientId, goal) => {
    const g = { id: uuidv4(), clientId, active: true, createdAt: new Date().toISOString(), progress: [], targetAccuracy: 80, ...goal }
    persist({ ...data, goals: [...data.goals, g] })
  }
  const updateGoal = (id, updates) => {
    persist({ ...data, goals: data.goals.map(g => g.id === id ? { ...g, ...updates } : g) })
  }
  const deleteGoal = (id) => {
    persist({ ...data, goals: data.goals.filter(g => g.id !== id) })
  }
  const addGoalProgress = (goalId, entry) => {
    persist({
      ...data,
      goals: data.goals.map(g =>
        g.id === goalId
          ? { ...g, progress: [...g.progress, { id: uuidv4(), date: new Date().toISOString(), ...entry }] }
          : g
      )
    })
  }

  // ── Folders (materials organization) ──────────────────────────────────
  const addFolder = (name, color, parentId = null) => {
    const f = { id: uuidv4(), name, color, parentId }
    persist({ ...data, folders: [...(data.folders || []), f] })
    return f
  }
  const updateFolder = (id, updates) => {
    persist({ ...data, folders: (data.folders || []).map(f => f.id === id ? { ...f, ...updates } : f) })
  }
  // Move a folder's contents up one level, then remove the folder (keeps materials)
  const dissolveFolder = (id) => {
    const folders = data.folders || []
    const parent = folders.find(f => f.id === id)?.parentId || null
    persist({
      ...data,
      folders: folders.filter(f => f.id !== id).map(f => f.parentId === id ? { ...f, parentId: parent } : f),
      materials: data.materials.map(m => m.folderId === id ? { ...m, folderId: parent } : m),
    })
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
    persist({
      ...data,
      folders: folders.filter(f => !doomed.has(f.id)),
      materials: data.materials.filter(m => !deadMaterialIds.has(m.id)),
      clients: data.clients.map(c => ({ ...c, materialIds: (c.materialIds || []).filter(mid => !deadMaterialIds.has(mid)) })),
    })
  }

  // ── Settings ──────────────────────────────────────────────────────────
  const updateSettings = (updates) => {
    persist({ ...data, settings: { ...(data.settings || {}), ...updates } })
  }

  // ── Appointments ──────────────────────────────────────────────────────
  const addAppointment = (appt) => {
    const a = { id: uuidv4(), durationMins: 45, notes: '', ...appt }
    persist({ ...data, appointments: [...(data.appointments || []), a] })
    return a
  }
  const updateAppointment = (id, updates) => {
    persist({ ...data, appointments: (data.appointments || []).map(a => a.id === id ? { ...a, ...updates } : a) })
  }
  const deleteAppointment = (id) => {
    persist({ ...data, appointments: (data.appointments || []).filter(a => a.id !== id) })
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
    addSession, updateSession, deleteSession,
    addGoal, updateGoal, deleteGoal, addGoalProgress,
    addAppointment, updateAppointment, deleteAppointment,
    addFolder, updateFolder, deleteFolder, dissolveFolder,
    updateSettings,
  }
}
