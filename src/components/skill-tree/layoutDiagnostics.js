import { UNASSIGNED_SEGMENT_ID } from './layoutShared'
import { getNodePairKey, toDegrees } from './layoutMath'

export const buildLayoutDiagnostics = ({ nodes, orderedSegments, config, subtreeSpan, additionalIssues = [] }) => {
  const issues = [...additionalIssues]
  const seenOverlapPairs = new Set()
  const minimumNodeDistance = config.nodeSize * 0.94
  const segmentById = new Map(orderedSegments.map((segment) => [segment.id, segment]))

  if (subtreeSpan > config.maxAngleSpread + 0.5) {
    issues.push({
      type: 'angle-spread',
      severity: 'error',
      message: 'Der Skilltree ueberschreitet die maximale Spreizung.',
    })
  }

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]
    const segmentId = node.segmentId ?? UNASSIGNED_SEGMENT_ID
    const segment = segmentById.get(segmentId)

    if (segment) {
      const angularHalfSpan = toDegrees((config.nodeSize * 0.56) / Math.max(node.radius, 1))
      const minAngle = node.angle - angularHalfSpan
      const maxAngle = node.angle + angularHalfSpan

      const leftBoundary = segment.min ?? segment.slotMin
      const rightBoundary = segment.max ?? segment.slotMax

      if (minAngle < leftBoundary || maxAngle > rightBoundary) {
        issues.push({
          type: 'segment-boundary',
          severity: 'error',
          nodeIds: [node.id],
          segmentId,
          message: 'Ein Skill wuerde eine Segmentgrenze schneiden.',
        })
      }
    }

    for (let otherIndex = index + 1; otherIndex < nodes.length; otherIndex += 1) {
      const other = nodes[otherIndex]
      const dx = node.x - other.x
      const dy = node.y - other.y
      const distance = Math.hypot(dx, dy)

      if (distance >= minimumNodeDistance) {
        continue
      }

      const pairKey = getNodePairKey(node.id, other.id)
      if (seenOverlapPairs.has(pairKey)) {
        continue
      }

      seenOverlapPairs.add(pairKey)
      issues.push({
        type: 'node-overlap',
        severity: 'error',
        nodeIds: [node.id, other.id],
        message: 'Zwei Skills wuerden sich ueberlappen.',
      })
    }
  }

  return {
    isValid: issues.length === 0,
    issues,
  }
}