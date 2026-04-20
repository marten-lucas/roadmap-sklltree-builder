import { STATUS_STYLES, normalizeStatusKey } from '../config'
import { getDisplayStatusKey } from './nodeStatus'

const LATER_SOURCE_LINK_STROKE = STATUS_STYLES.later?.linkStroke ?? '#74849c'
const UNIFORM_LINK_STROKE_WIDTH = STATUS_STYLES.later?.linkStrokeWidth ?? '6'

export const TEMPORAL_LINK_LAYER_ORDER = Object.freeze({
  hidden: -1,
  someday: 0,
  later: 1,
  next: 2,
  done: 3,
  now: 4,
})

export const getTemporalLinkPriority = (statusKey) => (
  TEMPORAL_LINK_LAYER_ORDER[normalizeStatusKey(statusKey)] ?? TEMPORAL_LINK_LAYER_ORDER.later
)

export const getConnectionStatusStyle = (link, nodesById, releaseId = null) => {
  const sourceNode = link.sourceId ? nodesById.get(link.sourceId) : null
  const sourceStatus = sourceNode ? getDisplayStatusKey(sourceNode, releaseId) : null
  const childNode = link.targetId ? nodesById.get(link.targetId) : null
  const targetStatus = childNode ? getDisplayStatusKey(childNode, releaseId) : 'later'
  const baseStyle = {
    ...(STATUS_STYLES[targetStatus] ?? STATUS_STYLES.later),
    linkStrokeWidth: UNIFORM_LINK_STROKE_WIDTH,
    linkStrokeDasharray: targetStatus === 'someday'
      ? (STATUS_STYLES.someday?.linkStrokeDasharray ?? '2 10')
      : 'none',
  }

  if (sourceStatus === 'later') {
    baseStyle.linkStroke = LATER_SOURCE_LINK_STROKE
  }

  return baseStyle
}

export const getConnectionZOrder = (link, nodesById, releaseId = null) => {
  const sourceNode = link.sourceId ? nodesById.get(link.sourceId) : null
  const sourceStatus = sourceNode ? getDisplayStatusKey(sourceNode, releaseId) : 'later'
  const childNode = link.targetId ? nodesById.get(link.targetId) : null
  const targetStatus = childNode ? getDisplayStatusKey(childNode, releaseId) : 'later'
  return Math.max(getTemporalLinkPriority(sourceStatus), getTemporalLinkPriority(targetStatus))
}
