import { generateUUID } from './uuid'

const normalizeNotesChecked = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => typeof key === 'string' && key)
      .map(([key, checked]) => [key, Boolean(checked)]),
  )
}

export const createRelease = (name = '') => ({
  id: generateUUID(),
  name,
  motto: '',
  introduction: '',
  date: '',
  storyPointBudget: null,
  notesMarkdown: '',
  notesChecked: {},
})

export const getSelectedRelease = (releases, selectedReleaseId) => {
  if (!Array.isArray(releases) || releases.length === 0) return null
  return releases.find((r) => r.id === selectedReleaseId) ?? releases[0]
}

export const getSelectedReleaseId = (releases, selectedReleaseId) => {
  const release = getSelectedRelease(releases, selectedReleaseId)
  return release?.id ?? null
}

/**
 * Adds a new release.
 * @param {Array} releases - existing releases array
 * @param {string} name - name of the new release
 * @param {string|null} copyFromId - release ID to copy storyPointBudget from; null = start empty
 */
export const addRelease = (releases, name, copyFromId = null) => {
  const newRelease = createRelease(name)
  if (copyFromId) {
    const source = releases.find((r) => r.id === copyFromId)
    if (source) {
      newRelease.storyPointBudget = source.storyPointBudget
    }
  }
  return { releases: [...releases, newRelease], newReleaseId: newRelease.id }
}

/**
 * Deletes a release. No-op if it is the last remaining release.
 */
export const deleteRelease = (releases, releaseId) => {
  if (!Array.isArray(releases) || releases.length <= 1) return releases
  return releases.filter((r) => r.id !== releaseId)
}

/**
 * Updates metadata fields of a release.
 */
export const updateRelease = (releases, releaseId, updates) => {
  if (!Array.isArray(releases)) return releases
  return releases.map((r) => r.id === releaseId ? { ...r, ...updates } : r)
}

/**
 * Moves a release from fromIndex to toIndex (drag-and-drop reorder).
 */
export const reorderReleases = (releases, fromIndex, toIndex) => {
  if (!Array.isArray(releases)) return releases
  const next = [...releases]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}

/**
 * Copies statuses from one release to a new release on every level of every node in the tree.
 * Returns the updated tree.
 */
export const copyReleaseStatuses = (tree, sourceReleaseId, targetReleaseId) => {
  if (!tree || !sourceReleaseId || !targetReleaseId) return tree

  const copyNode = (node) => ({
    ...node,
    levels: (node.levels ?? []).map((level) => ({
      ...level,
      statuses: {
        ...(level.statuses ?? {}),
        [targetReleaseId]: (level.statuses ?? {})[sourceReleaseId] ?? 'later',
      },
    })),
    children: (node.children ?? []).map(copyNode),
  })

  return {
    ...tree,
    children: (tree.children ?? []).map(copyNode),
  }
}

/**
 * Normalises a raw release object, ensuring all required fields exist.
 */
export const normalizeRelease = (raw) => {
  if (!raw || typeof raw !== 'object') return createRelease()
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : generateUUID(),
    name: typeof raw.name === 'string' ? raw.name : '',
    motto: typeof raw.motto === 'string' ? raw.motto : '',
    introduction: typeof raw.introduction === 'string' ? raw.introduction : '',
    date: typeof raw.date === 'string' ? raw.date : '',
    storyPointBudget: raw.storyPointBudget != null ? Number(raw.storyPointBudget) : null,
    notesMarkdown: typeof raw.notesMarkdown === 'string' ? raw.notesMarkdown : '',
    notesChecked: normalizeNotesChecked(raw.notesChecked),
  }
}
