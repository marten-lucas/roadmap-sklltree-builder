import { buildRadialEdgePath, toCartesian, toDegrees } from './layoutMath'
import { getGroupedSegmentId } from './layoutShared'

const DEFAULT_CLUSTER_ANGLE_DEG = 18

const getEdgeId = (parentId, childId) => `${parentId}=>${childId}`

const getTrunkGroupId = (parentId, targetLevel, index) => `${parentId}|L${targetLevel}|G${index}`

const createCluster = (child, angle, segmentIndex) => ({
  children: [child],
  minAngle: angle,
  maxAngle: angle,
  segmentIndexes: [segmentIndex],
})

const getAdaptiveClusterThresholdDeg = ({ config, targetRadius }) => {
  if (!config?.nodeSize) {
    return DEFAULT_CLUSTER_ANGLE_DEG
  }

  const basePx = config.nodeSize * 1.05
  const adaptive = toDegrees(basePx / Math.max(targetRadius, 1)) * 1.45
  return Math.max(DEFAULT_CLUSTER_ANGLE_DEG, adaptive)
}

const canShareTrunk = ({
  cluster,
  angle,
  segmentIndex,
  clusterThresholdDeg,
}) => {
  const angleGap = angle - cluster.maxAngle
  const previousSegmentIndex = cluster.segmentIndexes[cluster.segmentIndexes.length - 1]
  const segmentGap = Math.abs(segmentIndex - previousSegmentIndex)
  const sameSegment = segmentGap === 0
  const threshold = sameSegment ? clusterThresholdDeg * 2.8 : clusterThresholdDeg

  return angleGap <= threshold && segmentGap <= 1
}

// For n children, pick the gap midpoint closest to the mean angle.
// This guarantees the trunk hits the ring BETWEEN children (never at a child position).
const computeTrunkAngle = (angles) => {
  if (angles.length <= 1) return angles[0] ?? 0
  if (angles.length === 2) return (angles[0] + angles[1]) / 2

  const sorted = [...angles].sort((a, b) => a - b)
  const mean = sorted.reduce((s, a) => s + a, 0) / sorted.length
  let best = (sorted[0] + sorted[1]) / 2
  let bestDist = Math.abs(best - mean)

  for (let i = 1; i < sorted.length - 1; i++) {
    const mid = (sorted[i] + sorted[i + 1]) / 2
    const dist = Math.abs(mid - mean)

    if (dist < bestDist) {
      bestDist = dist
      best = mid
    }
  }

  return best
}

const toTrunkGroup = ({
  parentId,
  targetLevel,
  cluster,
  groupIndex,
  getAngleForNode,
  getRadiusForLevel,
  getSegmentOrderIndex,
}) => {
  const childIds = cluster.children.map((child) => child.data.id)
  const targetRadius = getRadiusForLevel(targetLevel)
  const childAngles = cluster.children.map((child) => getAngleForNode(child))
  const trunkAngle = computeTrunkAngle(childAngles)
  const segmentIndexes = cluster.children.map((child) => getSegmentOrderIndex(child.data.segmentId ?? null))

  return {
    id: getTrunkGroupId(parentId, targetLevel, groupIndex),
    kind: 'trunkRay',
    parentId,
    targetLevel,
    targetRadius,
    trunkAngle,
    childIds,
    minAngle: Math.min(...childAngles),
    maxAngle: Math.max(...childAngles),
    minSegmentIndex: Math.min(...segmentIndexes),
    maxSegmentIndex: Math.max(...segmentIndexes),
  }
}

export const buildEdgeRoutingModel = ({
  root,
  config,
  getEffectiveLevel,
  getAngleForNode,
  getRadiusForLevel,
  getSegmentOrderIndex,
}) => {
  const groupedByParent = new Map()

  for (const link of root.links().filter((link) => link.source.depth > 0)) {
    const parentId = link.source.data.id
    const targetLevel = getEffectiveLevel(link.target)
    const key = `${parentId}|${targetLevel}`
    const entry = groupedByParent.get(key) ?? {
      parent: link.source,
      targetLevel,
      children: [],
    }

    entry.children.push(link.target)
    groupedByParent.set(key, entry)
  }

  const trunkGroups = []
  const edgePlans = []

  for (const entry of groupedByParent.values()) {
    const parentId = entry.parent.data.id
    const parentLevel = getEffectiveLevel(entry.parent)
    const parentRadius = getRadiusForLevel(parentLevel)
    const parentSegmentId = getGroupedSegmentId(entry.parent.data.segmentId ?? null)
    const parentSegmentIndex = getSegmentOrderIndex(entry.parent.data.segmentId ?? null)
    const targetRadius = getRadiusForLevel(entry.targetLevel)
    const clusterThresholdDeg = getAdaptiveClusterThresholdDeg({
      config,
      targetRadius,
    })

    const sortedChildren = [...entry.children].sort(
      (left, right) => getAngleForNode(left) - getAngleForNode(right),
    )

    const clusters = []
    for (const child of sortedChildren) {
      const angle = getAngleForNode(child)
      const segmentIndex = getSegmentOrderIndex(child.data.segmentId ?? null)
      const last = clusters[clusters.length - 1]

      if (!last || !canShareTrunk({ cluster: last, angle, segmentIndex, clusterThresholdDeg })) {
        clusters.push(createCluster(child, angle, segmentIndex))
        continue
      }

      last.children.push(child)
      last.maxAngle = angle
      last.segmentIndexes.push(segmentIndex)
    }

    const groups = clusters.map((cluster, index) =>
      toTrunkGroup({
        parentId,
        targetLevel: entry.targetLevel,
        cluster,
        groupIndex: index,
        getAngleForNode,
        getRadiusForLevel,
        getSegmentOrderIndex,
      }),
    )
    trunkGroups.push(...groups)

    for (const group of groups) {
      for (const childId of group.childIds) {
        const child = entry.children.find((node) => node.data.id === childId)
        const childSegmentId = getGroupedSegmentId(child.data.segmentId ?? null)
        const childSegmentIndex = getSegmentOrderIndex(child.data.segmentId ?? null)

        edgePlans.push({
          id: getEdgeId(parentId, childId),
          kind: 'hierarchy-edge',
          parentId,
          childId,
          groupId: group.id,
          sourceLevel: parentLevel,
          targetLevel: entry.targetLevel,
          sourceRadius: parentRadius,
          targetRadius,
          parentSegmentId,
          childSegmentId,
          parentSegmentIndex,
          childSegmentIndex,
          segmentDistance: Math.abs(parentSegmentIndex - childSegmentIndex),
          childAngle: getAngleForNode(child),
          trunkAngle: group.trunkAngle,
          minGroupAngle: group.minAngle,
          maxGroupAngle: group.maxAngle,
        })
      }
    }
  }

  trunkGroups.sort((left, right) => {
    if (left.targetLevel !== right.targetLevel) {
      return left.targetLevel - right.targetLevel
    }

    return left.trunkAngle - right.trunkAngle
  })

  edgePlans.sort((left, right) => {
    if (left.targetLevel !== right.targetLevel) {
      return left.targetLevel - right.targetLevel
    }

    if (left.trunkAngle !== right.trunkAngle) {
      return left.trunkAngle - right.trunkAngle
    }

    return left.childAngle - right.childAngle
  })

  return {
    trunkGroups,
    edgePlans,
  }
}

export const buildRoutedEdgeLinks = ({ edgeRouting, nodesById, origin }) => {
  const { trunkGroups, edgePlans } = edgeRouting
  const trunkGroupById = new Map(trunkGroups.map((g) => [g.id, g]))

  const links = []

  for (const plan of edgePlans) {
    const parent = nodesById.get(plan.parentId)
    const child = nodesById.get(plan.childId)
    const group = trunkGroupById.get(plan.groupId)

    if (!parent || !child || !group) continue

    const shared = group.childIds.length > 1
    const trunkAngle = plan.trunkAngle
    const childAngle = plan.childAngle
    const targetRadius = plan.targetRadius
    const sourceRadius = plan.sourceRadius

    const buildArc = (fromAngle, radius, toAngle, toPoint) => {
      if (radius < 1 || Math.abs(toAngle - fromAngle) < 0.01) {
        return null
      }

      const sweep = toAngle > fromAngle ? 1 : 0
      return `A ${radius} ${radius} 0 0 ${sweep} ${toPoint.x} ${toPoint.y}`
    }

    let path

    if (!shared) {
      // Single child: radial segment from source angle, then target arc when needed.
      path = buildRadialEdgePath(parent.angle, sourceRadius, childAngle, targetRadius, origin)
    } else if (Math.abs(childAngle - trunkAngle) < 0.5) {
      // Tightly aligned with trunk entry: direct radial path
      path = buildRadialEdgePath(parent.angle, sourceRadius, childAngle, targetRadius, origin)
    } else {
      // Shared trunk: source arc -> radial trunk (center-aligned ray) -> target arc.
      const parts = [`M ${parent.x} ${parent.y}`]
      const sourceTrunkPoint = toCartesian(trunkAngle, sourceRadius, origin)
      const targetTrunkPoint = toCartesian(trunkAngle, targetRadius, origin)

      const sourceArc = buildArc(parent.angle, sourceRadius, trunkAngle, sourceTrunkPoint)
      if (sourceArc) {
        parts.push(sourceArc)
      }

      parts.push(`L ${targetTrunkPoint.x} ${targetTrunkPoint.y}`)

      const targetArc = buildArc(trunkAngle, targetRadius, childAngle, child)
      if (targetArc) {
        parts.push(targetArc)
      }

      path = parts.join(' ')
    }

    links.push({
      id: plan.id,
      linkKind: shared ? 'routed' : 'direct',
      sourceDepth: parent.depth,
      path,
    })
  }

  return links
}