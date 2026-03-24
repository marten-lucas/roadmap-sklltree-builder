import { normalizeStatusKey } from './config'

export const getLevelStatusKeys = (node) => {
  const levels = Array.isArray(node?.levels) ? node.levels : []

  if (levels.length === 0) {
    return [normalizeStatusKey(node?.status)]
  }

  return levels.map((level) => normalizeStatusKey(level.status))
}

export const getDisplayStatusKey = (node) => {
  const statusKeys = getLevelStatusKeys(node)

  if (statusKeys.includes('now')) return 'now'
  if (statusKeys.includes('next')) return 'next'
  if (statusKeys.includes('later')) return 'later'

  return statusKeys[0] ?? 'later'
}