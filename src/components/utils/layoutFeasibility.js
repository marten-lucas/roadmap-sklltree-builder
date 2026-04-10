import { setMapMax, toDegrees, toRadians } from './layoutMath'
import { getGroupedSegmentId } from './layoutShared'

const buildGroupKey = (level, segmentId) => `${level}|${segmentId}`

export const buildSegmentLevelGroups = ({ allNodes, getEffectiveLevel }) => {
  const groupedNodes = new Map()

  for (const node of allNodes) {
    const level = getEffectiveLevel(node)
    const segmentId = getGroupedSegmentId(node.data.segmentId ?? null)
    const key = buildGroupKey(level, segmentId)

    if (!groupedNodes.has(key)) {
      groupedNodes.set(key, { key, level, segmentId, nodes: [node] })
    } else {
      groupedNodes.get(key).nodes.push(node)
    }
  }

  return groupedNodes
}

export const analyzeSegmentLevelFeasibility = ({
  groupedNodes,
  orderedSegments,
  getRadiusForLevel,
  nodeAngularWidthPx,
  nodeBoundaryMarginPx,
  minimumArcGap,
}) => {
  const boundaryBySegmentId = new Map(
    orderedSegments.map((segment, index) => [
      segment.id,
      {
        min: segment.slotMin,
        max: segment.slotMax,
        isFirst: index === 0,
        isLast: index === orderedSegments.length - 1,
      },
    ]),
  )

  const neededRadiusByLevel = new Map()
  const issues = []
  const segmentLevelEntries = []
  const entryByKey = new Map()

  for (const group of groupedNodes.values()) {
    const boundary = boundaryBySegmentId.get(group.segmentId)
    if (!boundary) {
      continue
    }

    const radius = Math.max(getRadiusForLevel(group.level), 1)
    const marginDeg = toDegrees(nodeBoundaryMarginPx / radius)
    const spanDeg = toDegrees(nodeAngularWidthPx / radius)
    const gapDeg = toDegrees(minimumArcGap / radius)
    // At the open arc boundaries (first/last segment) there is no physical
    // separator, so a small symbolic margin (1e-4°) is used instead of the
    // full nodeBoundaryMarginPx. This lets nodes sit as close to the arc
    // boundary as the packing model allows, keeping the opening gap < 120°.
    const arcBoundaryMarginDeg = 1e-4; // Back to 1e-4, layoutSolver will handle the visual containment
    const leftMargin = boundary.isFirst ? arcBoundaryMarginDeg : marginDeg
    const rightMargin = boundary.isLast ? arcBoundaryMarginDeg : marginDeg
    const leftCenter = boundary.min + leftMargin + spanDeg / 2
    const rightCenter = boundary.max - rightMargin - spanDeg / 2
    const availableCenterSpan = Math.max(0, rightCenter - leftCenter)
    const centerGap = spanDeg + gapDeg
    const requiredCenterSpan = Math.max(0, (group.nodes.length - 1) * centerGap)
    const rawAvailableAngle = boundary.max - boundary.min - marginDeg * 2
    const availableAngle = Math.max(3, rawAvailableAngle)
    const requiredPixels = group.nodes.length * nodeAngularWidthPx + (group.nodes.length - 1) * minimumArcGap
    const neededRadius = requiredPixels / toRadians(availableAngle)
    const isFeasible = requiredCenterSpan <= availableCenterSpan + 0.0001

    const entry = {
      key: group.key,
      level: group.level,
      segmentId: group.segmentId,
      nodeIds: group.nodes.map((node) => node.data.id),
      nodeCount: group.nodes.length,
      radius,
      marginDeg,
      spanDeg,
      gapDeg,
      centerGap,
      leftCenter,
      rightCenter,
      availableCenterSpan,
      requiredCenterSpan,
      rawAvailableAngle,
      availableAngle,
      requiredPixels,
      neededRadius,
      isFeasible,
    }

    if (!isFeasible) {
      setMapMax(neededRadiusByLevel, group.level, neededRadius)
      issues.push({
        type: 'segment-capacity',
        severity: 'error',
        segmentId: group.segmentId,
        nodeIds: entry.nodeIds,
        message: 'Segment capacity at this level is too small.',
      })
    }

    segmentLevelEntries.push(entry)
    entryByKey.set(group.key, entry)
  }

  segmentLevelEntries.sort((left, right) => {
    if (left.level !== right.level) {
      return left.level - right.level
    }

    const leftSegmentIndex = orderedSegments.findIndex((segment) => segment.id === left.segmentId)
    const rightSegmentIndex = orderedSegments.findIndex((segment) => segment.id === right.segmentId)
    return leftSegmentIndex - rightSegmentIndex
  })

  return {
    isFeasible: issues.length === 0,
    segmentLevelEntries,
    entryByKey,
    neededRadiusByLevel,
    issues,
  }
}