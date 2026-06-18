import { useState, useEffect, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'

const isElectron = typeof window !== 'undefined' && window.api

function localLoad() {
  try { return JSON.parse(localStorage.getItem('sto_data')) || { clients: [], materials: [] } }
  catch { return { clients: [], materials: [] } }
}
function localSave(data) {
  localStorage.setItem('sto_data', JSON.stringify(data))
}

export function useStore() {
  const [data, setData] = useState({ clients: [], materials: [] })
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    async function init() {
      const d = isElectron ? await window.api.loadData() : localLoad()
      setData(d)
      setLoaded(true)
    }
    init()
  }, [])

  const persist = useCallback((next) => {
    setData(next)
    if (isElectron) window.api.saveData(next)
    else localSave(next)
  }, [])

  // Clients
  const addClient = (name, dob, notes) => {
    const next = { ...data, clients: [...data.clients, { id: uuidv4(), name, dob, notes, materialIds: [] }] }
    persist(next)
  }

  const updateClient = (id, updates) => {
    const next = { ...data, clients: data.clients.map(c => c.id === id ? { ...c, ...updates } : c) }
    persist(next)
  }

  const deleteClient = (id) => {
    const next = { ...data, clients: data.clients.filter(c => c.id !== id) }
    persist(next)
  }

  const assignMaterial = (clientId, materialId) => {
    const next = {
      ...data,
      clients: data.clients.map(c =>
        c.id === clientId && !c.materialIds.includes(materialId)
          ? { ...c, materialIds: [...c.materialIds, materialId] }
          : c
      )
    }
    persist(next)
  }

  const unassignMaterial = (clientId, materialId) => {
    const next = {
      ...data,
      clients: data.clients.map(c =>
        c.id === clientId
          ? { ...c, materialIds: c.materialIds.filter(id => id !== materialId) }
          : c
      )
    }
    persist(next)
  }

  // Materials
  const addMaterial = (material) => {
    const next = { ...data, materials: [...data.materials, { id: uuidv4(), ...material }] }
    persist(next)
    return next.materials[next.materials.length - 1]
  }

  const updateMaterial = (id, updates) => {
    const next = { ...data, materials: data.materials.map(m => m.id === id ? { ...m, ...updates } : m) }
    persist(next)
  }

  const deleteMaterial = (id) => {
    const next = {
      ...data,
      materials: data.materials.filter(m => m.id !== id),
      clients: data.clients.map(c => ({ ...c, materialIds: c.materialIds.filter(mid => mid !== id) }))
    }
    persist(next)
  }

  return {
    clients: data.clients,
    materials: data.materials,
    loaded,
    addClient, updateClient, deleteClient,
    assignMaterial, unassignMaterial,
    addMaterial, updateMaterial, deleteMaterial,
  }
}
