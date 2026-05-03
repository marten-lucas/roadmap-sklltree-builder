import { STATUS_STYLES, normalizeStatusKey } from '../config'
import { getVisibleLevelStatusKeys } from './nodeStatus'

// For connections: pick the "earliest" (most progressed) status.
// A node with [done, later] should colour its connection as done.
// Priority: done > now > next > later > someday
const getConnectionBestStatusKey = (node, releaseId) => {
  const visibleKeys = getVisibleLevelStatusKeys(node, releaseId)
  if (visibleKeys.length === 0) return 'hidden'
  if (visibleKeys.includes('done')) return 'done'
  if (visibleKeys.includes('now')) return 'now'
  if (visibleKeys.includes('next')) return 'next'
  if (visibleKeys.includes('later')) return 'later'
  if (visibleKeys.includes('someday')) return 'someday'
  return visibleKeys[0] ?? 'later'
}

// Multiline routed links must stack from the most historical state at the bottom
// to the most immediate state at the top so overlap remains readable.
export const TEMPORAL_LINK_LAYER_ORDER = Object.freeze({
  hidden: -1,
  done: 0,
  someday: 1,
  later: 2,
  next: 3,
  now: 4,
})

export const getTemporalLinkPriority = (statusKey) => (
  TEMPORAL_LINK_LAYER_ORDER[normalizeStatusKey(statusKey)] ?? TEMPORAL_LINK_LAYER_ORDER.later
)

export const getConnectionStatusStyle = (link, nodesById, releaseId = null, statusStyles = STATUS_STYLES) => {
  const styles = statusStyles && typeof statusStyles === 'object' ? statusStyles : STATUS_STYLES
  const laterSourceLinkStroke = styles.later?.linkStroke ?? '#74849c'
  const uniformLinkStrokeWidth = styles.later?.linkStrokeWidth ?? '6'
  const childNode = link.targetId ? nodesById.get(link.targetId) : null
  const targetStatus = childNode ? getConnectionBestStatusKey(childNode, releaseId) : 'later'
  const baseStyle = {
    ...(styles[targetStatus] ?? styles.later ?? STATUS_STYLES.later),
    linkStrokeWidth: uniformLinkStrokeWidth,
    linkStrokeDasharray: targetStatus === 'someday'
      ? (styles.someday?.linkStrokeDasharray ?? '2 10')
      : 'none',
  }

  baseStyle.linkStroke = (styles[targetStatus] ?? styles.later ?? STATUS_STYLES.later).linkStroke ?? laterSourceLinkStroke

  return baseStyle
}

export const getConnectionZOrder = (link, nodesById, releaseId = null) => {
  const sourceNode = link.sourceId ? nodesById.get(link.sourceId) : null
  const sourceStatus = sourceNode ? getConnectionBestStatusKey(sourceNode, releaseId) : 'later'
  const childNode = link.targetId ? nodesById.get(link.targetId) : null
  const targetStatus = childNode ? getConnectionBestStatusKey(childNode, releaseId) : 'later'
  return Math.max(getTemporalLinkPriority(sourceStatus), getTemporalLinkPriority(targetStatus))
}
