import { STATUS_STYLES, normalizeStatusKey } from '../config'
import { getVisibleLevelStatusKeys } from './nodeStatus'

const LATER_SOURCE_LINK_STROKE = STATUS_STYLES.later?.linkStroke ?? '#74849c'
const UNIFORM_LINK_STROKE_WIDTH = STATUS_STYLES.later?.linkStrokeWidth ?? '6'

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

// done is "earliest" on the timeline → rendered on top of later/someday links.
export const TEMPORAL_LINK_LAYER_ORDER = Object.freeze({
  hidden: -1,
  someday: 0,
  later: 1,
  next: 2,
  now: 3,
  done: 4,
})

export const getTemporalLinkPriority = (statusKey) => (
  TEMPORAL_LINK_LAYER_ORDER[normalizeStatusKey(statusKey)] ?? TEMPORAL_LINK_LAYER_ORDER.later
)

export const getConnectionStatusStyle = (link, nodesById, releaseId = null) => {
  const sourceNode = link.sourceId ? nodesById.get(link.sourceId) : null
  const sourceStatus = sourceNode ? getConnectionBestStatusKey(sourceNode, releaseId) : null
  const childNode = link.targetId ? nodesById.get(link.targetId) : null
  const targetStatus = childNode ? getConnectionBestStatusKey(childNode, releaseId) : 'later'
  const baseStyle = {
    ...(STATUS_STYLES[targetStatus] ?? STATUS_STYLES.later),
    linkStrokeWidth: UNIFORM_LINK_STROKE_WIDTH,
    linkStrokeDasharray: targetStatus === 'someday'
      ? (STATUS_STYLES.someday?.linkStrokeDasharray ?? '2 10')
      : 'none',
  }

  if (sourceStatus === 'later' || sourceStatus === 'someday') {
    baseStyle.linkStroke = LATER_SOURCE_LINK_STROKE
  }

  return baseStyle
}

export const getConnectionZOrder = (link, nodesById, releaseId = null) => {
  const sourceNode = link.sourceId ? nodesById.get(link.sourceId) : null
  const sourceStatus = sourceNode ? getConnectionBestStatusKey(sourceNode, releaseId) : 'later'
  const childNode = link.targetId ? nodesById.get(link.targetId) : null
  const targetStatus = childNode ? getConnectionBestStatusKey(childNode, releaseId) : 'later'
  return Math.max(getTemporalLinkPriority(sourceStatus), getTemporalLinkPriority(targetStatus))
}
