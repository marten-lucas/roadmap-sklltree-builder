import { buildRadialArcPath, toCartesian, toDegrees } from './layoutMath'
import { getGroupedSegmentId } from './layoutShared'

const DEFAULT_CLUSTER_ANGLE_DEG = 18
const DEFAULT_SEGMENT_SPAN_DEG = 24

const ROUTING_PROFILES = {
  balanced: {
    maxSharedSegmentGap: 1,
    crossSegmentThresholdMultiplier: 1,
  },
  strict: {
    maxSharedSegmentGap: 0,
    crossSegmentThresholdMultiplier: 0.82,
  },
}

const resolveRoutingProfile = (config) => {
  const profileName = String(config?.routingProfile ?? 'balanced').toLowerCase()
  return ROUTING_PROFILES[profileName] ?? ROUTING_PROFILES.balanced
}

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
  segmentSpanDeg,
  clusterThresholdDeg,
  routingProfile,
}) => {
  const angleGap = angle - cluster.maxAngle
  const previousSegmentIndex = cluster.segmentIndexes[cluster.segmentIndexes.length - 1]
  const segmentGap = Math.abs(segmentIndex - previousSegmentIndex)
  const sameSegment = segmentGap === 0
  const spanScale = Math.max(
    0.75,
    Math.min(1.45, segmentSpanDeg / DEFAULT_SEGMENT_SPAN_DEG),
  )
  const threshold = sameSegment
    ? clusterThresholdDeg * 2.8 * spanScale
    : clusterThresholdDeg * routingProfile.crossSegmentThresholdMultiplier

  return angleGap <= threshold && segmentGap <= routingProfile.maxSharedSegmentGap
}

// For n children, pick the gap midpoint closest to the mean angle.
// This guarantees the trunk hits the ring BETWEEN children (never at a child position).
const computeTrunkAngle = (angles) => {
  if (angles.length === 0) return 0;
  
  const sorted = [...angles].sort((a, b) => a - b);
  const mean = sorted.reduce((sum, val) => sum + val, 0) / sorted.length;
  
  if (sorted.length <= 2) {
    return mean;
  }

  // Pick the midpoint of the largest gap between adjacent children
  // to ensure the trunk doesn't overlap any child node.
  let maxGap = -1;
  let bestMid = (sorted[0] + sorted[sorted.length - 1]) / 2;

  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i + 1] - sorted[i];
    if (gap > maxGap) {
      maxGap = gap;
      bestMid = (sorted[i] + sorted[i + 1]) / 2;
    }
  }

  // If the mean is naturally within a gap that's already of decent size,
  // we prefer the mean to keep connections as center-aligned as possible.
  // Otherwise, fallback to the largest-gap midpoint for safety.
  for (let i = 0; i < sorted.length - 1; i++) {
    if (mean > sorted[i] + 0.5 && mean < sorted[i + 1] - 0.5) {
      return mean;
    }
  }

  return bestMid;
}

const toTrunkGroup = ({
  parentId,
  parentSegmentId,
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
  const sameSegmentChildren = cluster.children.filter(
    (child) => getGroupedSegmentId(child.data.segmentId ?? null) === parentSegmentId,
  )
  const primaryChild = sameSegmentChildren.length === 1 ? sameSegmentChildren[0] : null
  const trunkAngle = primaryChild ? getAngleForNode(primaryChild) : computeTrunkAngle(childAngles)
  const segmentIndexes = cluster.children.map((child) => getSegmentOrderIndex(child.data.segmentId ?? null))

  return {
    id: getTrunkGroupId(parentId, targetLevel, groupIndex),
    kind: 'trunkRay',
    parentId,
    targetLevel,
    targetRadius,
    trunkAngle,
    childIds,
    primaryChildId: primaryChild?.data.id ?? null,
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
  getSegmentSpanDeg,
}) => {
  const routingProfile = resolveRoutingProfile(config)
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
      const segmentSpanDeg = Number(
        getSegmentSpanDeg?.(child.data.segmentId ?? null) ?? DEFAULT_SEGMENT_SPAN_DEG,
      )
      const last = clusters[clusters.length - 1]

      if (!last || !canShareTrunk({
        cluster: last,
        angle,
        segmentIndex,
        segmentSpanDeg,
        clusterThresholdDeg,
        routingProfile,
      })) {
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
        parentSegmentId,
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
          isPrimaryGroupChild: group.primaryChildId === childId,
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

export const buildRoutedEdgeLinks = ({ edgeRouting, nodesById, origin, nodeSize = 48, getSegmentOrderIndex }) => {
  const { trunkGroups, edgePlans } = edgeRouting
  const trunkGroupById = new Map(trunkGroups.map((g) => [g.id, g]))
  const childCountByParentLevel = new Map()

  for (const plan of edgePlans) {
    const key = `${plan.parentId}|${plan.targetLevel}`
    childCountByParentLevel.set(key, (childCountByParentLevel.get(key) ?? 0) + 1)
  }

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

    const hasSourceRingBlockerBetween = (fromAngle, toAngle) => {
      const minAngle = Math.min(fromAngle, toAngle)
      const maxAngle = Math.max(fromAngle, toAngle)
      const sourceRingTolerancePx = nodeSize * 0.55

      return Array.from(nodesById.values()).some((node) => {
        if (node.id === parent.id || node.id === child.id) return false
        if (Math.abs((node.radius ?? 0) - sourceRadius) > sourceRingTolerancePx) return false
        return node.angle > minAngle + 0.2 && node.angle < maxAngle - 0.2
      })
    }

    let path
    let splitPoint = null
    let linkKind = shared ? 'routed' : 'direct'

    const levelGap = targetRadius - sourceRadius
    const minCorridorGap = nodeSize // corridor at gap/2 needs one node-diameter clearance from each ring
    const parentTargetLevelKey = `${plan.parentId}|${plan.targetLevel}`
    const hasPeerChildrenAtTargetLevel = (childCountByParentLevel.get(parentTargetLevelKey) ?? 0) > 1

    if (!shared) {
      const hasSourceRingBlocker = hasSourceRingBlockerBetween(parent.angle, childAngle)

      // If a parent has multiple children on the same target level but this edge ended
      // up in a singleton cluster, a direct source-ring arc can still sweep through
      // nearby nodes and get portalized. Route via the mid-level corridor instead.
      if (
        (hasPeerChildrenAtTargetLevel || hasSourceRingBlocker)
        && levelGap >= minCorridorGap
        && Math.abs(childAngle - parent.angle) >= 0.5
      ) {
        const sourceNode = nodesById.get(parent.id)
        const targetNode = nodesById.get(child.id)
        const getSegIdx = (id) => (getSegmentOrderIndex ? getSegmentOrderIndex(id) : 0)
        const segmentDistance = (sourceNode && targetNode) ? Math.abs(getSegIdx(sourceNode.segmentId) - getSegIdx(targetNode.segmentId)) : 0
        const useOuterBlockedSingletonCorridor = hasSourceRingBlocker && !hasPeerChildrenAtTargetLevel && segmentDistance > 0

        const corridorBias = useOuterBlockedSingletonCorridor
          ? (segmentDistance > 1 ? 0.74 : 0.68)
          : segmentDistance > 1 ? 0.62 : (segmentDistance > 0 ? 0.54 : 0.48)
        const corridorRadius = sourceRadius + levelGap * corridorBias
        const corridorParentPoint = toCartesian(parent.angle, corridorRadius, origin)
        const corridorChildPoint = toCartesian(childAngle, corridorRadius, origin)
        const parts = [`M ${parent.x} ${parent.y}`]

        parts.push(`L ${corridorParentPoint.x} ${corridorParentPoint.y}`)

        const corridorArc = buildArc(parent.angle, corridorRadius, childAngle, corridorChildPoint)
        if (corridorArc) {
          parts.push(corridorArc)
        }

        parts.push(`L ${child.x} ${child.y}`)
        path = parts.join(' ')
      } else {
        path = buildRadialArcPath(parent.angle, sourceRadius, childAngle, targetRadius, origin)
      }
    } else if (Math.abs(childAngle - trunkAngle) < 0.5) {
      path = buildRadialArcPath(parent.angle, sourceRadius, childAngle, targetRadius, origin)
      linkKind = 'direct'
    } else {
      // Shared trunk with corridor routing:
      // source-ring arc → radial to mid-corridor → corridor arc (free space) → spoke to child.
      // The corridor arc runs between the two node rings so it never sweeps through sibling nodes.
      if (levelGap >= minCorridorGap) {
        const sourceNode = nodesById.get(parent.id)
        const targetNode = nodesById.get(child.id)
        const getSegIdx = (id) => (getSegmentOrderIndex ? getSegmentOrderIndex(id) : 0)
        const segmentDistance = (sourceNode && targetNode) ? Math.abs(getSegIdx(sourceNode.segmentId) - getSegIdx(targetNode.segmentId)) : 0

        const corridorBias = segmentDistance > 1 ? 0.62 : (segmentDistance > 0 ? 0.54 : 0.48)
        const corridorRadius = sourceRadius + levelGap * corridorBias
        const corridorParentPoint = toCartesian(parent.angle, corridorRadius, origin)
        const corridorTrunkPoint = toCartesian(trunkAngle, corridorRadius, origin)
        const corridorChildPoint = toCartesian(childAngle, corridorRadius, origin)

        const parts = [`M ${parent.x} ${parent.y}`]

        // Always enter the corridor radially to avoid sweeping arcs across
        // populated source rings (which can trigger avoidable portalization).
        parts.push(`L ${corridorParentPoint.x} ${corridorParentPoint.y}`)

        const parentToTrunkCorridorArc = buildArc(parent.angle, corridorRadius, trunkAngle, corridorTrunkPoint)
        if (parentToTrunkCorridorArc) {
          parts.push(parentToTrunkCorridorArc)
        }

        // Arc along the corridor ring from trunk angle to child angle — strictly radial/arc routing.
        const corridorArc = buildArc(trunkAngle, corridorRadius, childAngle, corridorChildPoint)
        if (corridorArc) {
          parts.push(corridorArc)
        }

        // Visual split between shared trunk and branch-specific segment.
        splitPoint = { x: corridorTrunkPoint.x, y: corridorTrunkPoint.y }

        // Radial spoke from corridor ring down to child node.
        parts.push(`L ${child.x} ${child.y}`)

        path = parts.join(' ')
      } else {
        // Level gap too small for a distinct corridor — fall back to classic routing.
        const sourceTrunkPoint = toCartesian(trunkAngle, sourceRadius, origin)
        const targetTrunkPoint = toCartesian(trunkAngle, targetRadius, origin)

        const parts = [`M ${parent.x} ${parent.y}`]

        const sourceArc = buildArc(parent.angle, sourceRadius, trunkAngle, sourceTrunkPoint)
        if (sourceArc) {
          parts.push(sourceArc)
        }

        parts.push(`L ${targetTrunkPoint.x} ${targetTrunkPoint.y}`)

        const targetArc = buildArc(trunkAngle, targetRadius, childAngle, child)
        if (targetArc) {
          parts.push(targetArc)
        }

        // Visual split point where trunk ray transitions into the child arc.
        splitPoint = { x: targetTrunkPoint.x, y: targetTrunkPoint.y }

        path = parts.join(' ')
      }
    }

    links.push({
      id: plan.id,
      linkKind,
      sourceDepth: parent.depth,
      sourceId: plan.parentId,
      targetId: plan.childId,
      path,
      splitPoint,
    })
  }

  return links
}