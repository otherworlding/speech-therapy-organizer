import { useState, useEffect, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'

const isElectron = typeof window !== 'undefined' && window.api
const EMPTY = { clients: [], materials: [], sessions: [], goals: [] }

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
  const addClient = (name, dob, notes) => {
    const next = { ...data, clients: [...data.clients, { id: uuidv4(), name, dob, notes, materialIds: [] }] }
    persist(next)
  }
  const updateClient = (id, updates) => {
    persist({ ...data, clients: data.clients.map(c => c.id === id ? { ...c, ...updates } : c) })
  }
  const deleteClient = (id) => {
    persist({ ...data, clients: data.clients.filter(c => c.id !== id) })
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

  // ── Materials ─────────────────────────────────────────────────────────
  const addMaterial = (material) => {
    const m = { id: uuidv4(), tags: [], ...material }
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

  return {
    clients: data.clients,
    materials: data.materials,
    sessions: data.sessions,
    goals: data.goals,
    loaded,
    addClient, updateClient, deleteClient, assignMaterial, unassignMaterial,
    addMaterial, updateMaterial, deleteMaterial,
    addSession, updateSession, deleteSession,
    addGoal, updateGoal, deleteGoal, addGoalProgress,
  }
}
