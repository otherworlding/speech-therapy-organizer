// Shared by FinderView (Library/Main Collection tree) and ClientMaterials'
// SelectableGrid (Session Materials/Homework picklists) so "what counts as a
// duplicate" can't quietly drift between the two places that flag it.
export function duplicateTitleSet(materials) {
  const counts = new Map()
  for (const m of materials) {
    const key = (m.title || '').trim().toLowerCase()
    if (!key) continue
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return new Set([...counts].filter(([, n]) => n > 1).map(([k]) => k))
}
