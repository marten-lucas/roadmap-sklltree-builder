import { normalizeStatusKey } from '../config'

const DEFAULT_STATUS = 'later'

/**
 * Gets the normalised status of a single level for a specific release.
 * Falls back to the legacy `level.status` field for backward compatibility.
 */
export const getLevelStatus = (level, releaseId = null) => {
  if (releaseId && level?.statuses && typeof level.statuses === 'object') {
    const s = level.statuses[releaseId]
    if (s !== undefined) return normalizeStatusKey(s)
  }
  // Legacy fallback
  if (level?.status !== undefined) return normalizeStatusKey(level.status)
  return DEFAULT_STATUS
}

/**
 * Returns the status keys for all levels of a node for a given release.
 */
export const getLevelStatusKeys = (node, releaseId = null) => {
  const levels = Array.isArray(node?.levels) ? node.levels : []

  if (levels.length === 0) {
    const fallback = releaseId ? DEFAULT_STATUS : normalizeStatusKey(node?.status ?? DEFAULT_STATUS)
    return [fallback]
  }

  return levels.map((level) => getLevelStatus(level, releaseId))
}

export const getVisibleLevelStatusKeys = (node, releaseId = null) => {
  return getLevelStatusKeys(node, releaseId).filter((key) => key !== 'hidden')
}

export const getDisplayStatusKey = (node, releaseId = null) => {
  const visibleKeys = getVisibleLevelStatusKeys(node, releaseId)

  if (visibleKeys.length === 0) return 'hidden'
  if (visibleKeys.includes('now')) return 'now'
  if (visibleKeys.includes('next')) return 'next'
  if (visibleKeys.includes('later')) return 'later'

  return visibleKeys[0] ?? 'later'
}