import { hierarchy } from 'd3-hierarchy'
import { UNASSIGNED_SEGMENT_ID } from './layoutShared'

const toRadians = (angleDeg) => (angleDeg * Math.PI) / 180
const toDegrees = (angleRad) => (angleRad * 180) / Math.PI
const centerAngle = -90
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

const setMapMax = (map, key, value) => {
  const current = map.get(key)
  if (current === undefined || value > current) {
    map.set(key, value)
  }
}

const toCartesian = (angleDeg, radius, origin) => {
  const radians = (angleDeg * Math.PI) / 180

  return {
    x: origin.x + radius * Math.cos(radians),
    y: origin.y + radius * Math.sin(radians),
  }
}

const buildRadialEdgePath = (sourceAngle, sourceRadius, targetAngle, targetRadius, origin) => {
  const source = toCartesian(sourceAngle, sourceRadius, origin)
  const target = toCartesian(targetAngle, targetRadius, origin)

  if (sourceRadius < 1 || Math.abs(sourceAngle - targetAngle) < 0.01) {
    return `M ${source.x} ${source.y} L ${target.x} ${target.y}`
  }

  // Nudge elbow angle toward the child so sibling links diverge earlier
  // instead of sharing an identical radial segment from the parent.
  const maxElbowOffsetDeg = 24
  const elbowAngle = sourceAngle + clamp(targetAngle - sourceAngle, -maxElbowOffsetDeg, maxElbowOffsetDeg)
  const elbow = toCartesian(elbowAngle, targetRadius, origin)
  const sweep = targetAngle > elbowAngle ? 1 : 0

  return [
    `M ${source.x} ${source.y}`,
    `L ${elbow.x} ${elbow.y}`,
    `A ${targetRadius} ${targetRadius} 0 0 ${sweep} ${target.x} ${target.y}`,
  ].join(' ')
}

const getNodePairKey = (leftId, rightId) => [leftId, rightId].sort().join(':')
const getGroupedSegmentId = (segmentId) => segmentId ?? UNASSIGNED_SEGMENT_ID

const getPairWeightKey = (leftSegmentId, rightSegmentId) =>
  leftSegmentId < rightSegmentId
    ? `${leftSegmentId}::${rightSegmentId}`
    : `${rightSegmentId}::${leftSegmentId}`

const getPairWeight = (pairWeights, leftSegmentId, rightSegmentId) => {
  if (leftSegmentId === rightSegmentId) {
    return 0
  }

  return pairWeights.get(getPairWeightKey(leftSegmentId, rightSegmentId)) ?? 0
}

const buildOptimizedSegmentIdOrder = ({ root, explicitSegments, includeUnassigned }) => {
  const explicitOrderById = new Map(explicitSegments.map((segment, index) => [segment.id, index]))
  const segmentIds = includeUnassigned
    ? [...explicitSegments.map((segment) => segment.id), UNASSIGNED_SEGMENT_ID]
    : explicitSegments.map((segment) => segment.id)

  if (segmentIds.length <= 2) {
    return segmentIds
  }

  const pairWeights = new Map()
  const totalWeightBySegmentId = new Map(segmentIds.map((segmentId) => [segmentId, 0]))
  const links = root.links().filter((link) => link.source.depth > 0)

  for (const link of links) {
    const sourceSegmentId = getGroupedSegmentId(link.source.data.segmentId ?? null)
    const targetSegmentId = getGroupedSegmentId(link.target.data.segmentId ?? null)

    if (!totalWeightBySegmentId.has(sourceSegmentId) || !totalWeightBySegmentId.has(targetSegmentId)) {
      continue
    }

    if (sourceSegmentId === targetSegmentId) {
      totalWeightBySegmentId.set(sourceSegmentId, (totalWeightBySegmentId.get(sourceSegmentId) ?? 0) + 0.4)
      continue
    }

    const key = getPairWeightKey(sourceSegmentId, targetSegmentId)
    const nextWeight = (pairWeights.get(key) ?? 0) + 1
    pairWeights.set(key, nextWeight)
    totalWeightBySegmentId.set(sourceSegmentId, (totalWeightBySegmentId.get(sourceSegmentId) ?? 0) + 1)
    totalWeightBySegmentId.set(targetSegmentId, (totalWeightBySegmentId.get(targetSegmentId) ?? 0) + 1)
  }

  const remaining = new Set(segmentIds)
  const order = []
  const pickByExplicitOrder = (ids) => {
    return [...ids].sort((leftId, rightId) => {
      const leftOrder = explicitOrderById.get(leftId) ?? Number.MAX_SAFE_INTEGER
      const rightOrder = explicitOrderById.get(rightId) ?? Number.MAX_SAFE_INTEGER
      return leftOrder - rightOrder
    })[0]
  }

  const seed = [...remaining].sort((leftId, rightId) => {
    const leftWeight = totalWeightBySegmentId.get(leftId) ?? 0
    const rightWeight = totalWeightBySegmentId.get(rightId) ?? 0

    if (Math.abs(rightWeight - leftWeight) > 1e-6) {
      return rightWeight - leftWeight
    }

    const leftOrder = explicitOrderById.get(leftId) ?? Number.MAX_SAFE_INTEGER
    const rightOrder = explicitOrderById.get(rightId) ?? Number.MAX_SAFE_INTEGER
    return leftOrder - rightOrder
  })[0]

  order.push(seed)
  remaining.delete(seed)

  while (remaining.size > 0) {
    const leftEdgeId = order[0]
    const rightEdgeId = order[order.length - 1]

    const rankedCandidates = [...remaining].map((candidateId) => {
      const leftGain = getPairWeight(pairWeights, candidateId, leftEdgeId)
      const rightGain = getPairWeight(pairWeights, candidateId, rightEdgeId)
      const bestGain = Math.max(leftGain, rightGain)
      const preferredSide = leftGain > rightGain ? 'left' : rightGain > leftGain ? 'right' : 'auto'

      return {
        candidateId,
        bestGain,
        leftGain,
        rightGain,
        preferredSide,
      }
    })

    rankedCandidates.sort((left, right) => {
      if (Math.abs(right.bestGain - left.bestGain) > 1e-6) {
        return right.bestGain - left.bestGain
      }

      const leftOrder = explicitOrderById.get(left.candidateId) ?? Number.MAX_SAFE_INTEGER
      const rightOrder = explicitOrderById.get(right.candidateId) ?? Number.MAX_SAFE_INTEGER
      return leftOrder - rightOrder
    })

    const winner = rankedCandidates[0] ?? { candidateId: pickByExplicitOrder(remaining), preferredSide: 'auto' }
    const winnerId = winner.candidateId
    const appendToLeft =
      winner.preferredSide === 'left'
        ? true
        : winner.preferredSide === 'right'
          ? false
          : (explicitOrderById.get(winnerId) ?? Number.MAX_SAFE_INTEGER) <
            (explicitOrderById.get(rightEdgeId) ?? Number.MAX_SAFE_INTEGER)

    if (appendToLeft) {
      order.unshift(winnerId)
    } else {
      order.push(winnerId)
    }

    remaining.delete(winnerId)
  }

  const scoreOrder = (ids) => {
    let score = 0
    for (let index = 0; index < ids.length; index += 1) {
      for (let inner = index + 1; inner < ids.length; inner += 1) {
        const pairScore = getPairWeight(pairWeights, ids[index], ids[inner])
        const distance = inner - index
        score += pairScore / Math.max(1, distance)
      }
    }

    return score
  }

  let best = [...order]
  let bestScore = scoreOrder(best)
  let improved = true
  let safety = 0

  while (improved && safety < 24) {
    improved = false
    safety += 1

    for (let index = 0; index < best.length - 1; index += 1) {
      const candidate = [...best]
      const left = candidate[index]
      candidate[index] = candidate[index + 1]
      candidate[index + 1] = left
      const candidateScore = scoreOrder(candidate)

      if (candidateScore > bestScore + 1e-6) {
        best = candidate
        bestScore = candidateScore
        improved = true
      }
    }
  }

  return best
}

const buildAutoPromotedLevels = ({ root, segmentOrderIndexById }) => {
  const promotedLevelById = new Map()
  const baseLevelById = new Map()
  const hierarchyNodes = root.descendants().filter((node) => node.depth > 0)

  for (const node of hierarchyNodes) {
    const baseLevel = node.data.ebene !== undefined && node.data.ebene !== null ? node.data.ebene : node.depth
    baseLevelById.set(node.data.id, baseLevel)
    promotedLevelById.set(node.data.id, baseLevel)
  }

  const links = root.links().filter((link) => link.source.depth > 0)
  links.sort((left, right) => left.source.depth - right.source.depth)

  for (const link of links) {
    const sourceId = link.source.data.id
    const targetId = link.target.data.id
    const sourceSegmentId = getGroupedSegmentId(link.source.data.segmentId ?? null)
    const targetSegmentId = getGroupedSegmentId(link.target.data.segmentId ?? null)
    const sourceSegmentOrder = segmentOrderIndexById.get(sourceSegmentId)
    const targetSegmentOrder = segmentOrderIndexById.get(targetSegmentId)

    if (sourceSegmentOrder === undefined || targetSegmentOrder === undefined) {
      continue
    }

    const segmentDistance = Math.abs(sourceSegmentOrder - targetSegmentOrder)
    if (segmentDistance <= 1) {
      continue
    }

    const sourceLevel = promotedLevelById.get(sourceId) ?? baseLevelById.get(sourceId) ?? link.source.depth
    const baseTargetLevel = baseLevelById.get(targetId) ?? link.target.depth
    const requiredTargetLevel = sourceLevel + 1 + (segmentDistance - 1)
    const nextTargetLevel = Math.max(baseTargetLevel, requiredTargetLevel)

    if ((promotedLevelById.get(targetId) ?? baseTargetLevel) < nextTargetLevel) {
      promotedLevelById.set(targetId, nextTargetLevel)
    }
  }

  return promotedLevelById
}

const buildLayoutDiagnostics = ({ nodes, orderedSegments, config, subtreeSpan, additionalIssues = [] }) => {
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

export const solveSkillTreeLayout = (data, config) => {
  const root = hierarchy(data)
  const explicitSegments = data.segments ?? []
  const allHierarchyNodes = root.descendants().filter((node) => node.depth > 0)
  const hasUnassignedNodes = allHierarchyNodes.some((node) => !node.data.segmentId)
  const optimizedSegmentIds = buildOptimizedSegmentIdOrder({
    root,
    explicitSegments,
    includeUnassigned: hasUnassignedNodes,
  })
  const segmentOrderIndexById = new Map(optimizedSegmentIds.map((segmentId, index) => [segmentId, index]))
  const autoPromotedLevelById = buildAutoPromotedLevels({
    root,
    segmentOrderIndexById,
  })

  const segmentLabelById = new Map(explicitSegments.map((segment) => [segment.id, segment.label]))
  const getSegmentLabelText = (segmentId) => {
    if (segmentId === UNASSIGNED_SEGMENT_ID) {
      return ''
    }

    return segmentLabelById.get(segmentId) ?? ''
  }
  const getEstimatedSegmentLabelWidthPx = (segmentId) => {
    const text = getSegmentLabelText(segmentId)
    const textWidth = Math.max(72, text.length * 9)

    return textWidth + 20
  }
  const toAngleSpan = (pixelWidth, radius) => {
    return toDegrees(pixelWidth / Math.max(radius, 1))
  }
  const computeSegmentSlots = ({ segmentIds, statsById, radius, totalSpread }) => {
    if (segmentIds.length === 0) {
      return []
    }

    const domainStart = centerAngle - totalSpread / 2
    const rawMinWidths = segmentIds.map((segmentId) => {
      const stats = statsById.get(segmentId) ?? { count: 0 }
      const labelWidth = toAngleSpan(getEstimatedSegmentLabelWidthPx(segmentId) + config.nodeSize * 0.28, radius)

      if (stats.count > 0) {
        return Math.max(labelWidth, toAngleSpan(config.nodeSize * 0.9, radius))
      }

      return labelWidth
    })

    const minWidthSum = rawMinWidths.reduce((sum, width) => sum + width, 0)
    const minWidthScale = minWidthSum > totalSpread && minWidthSum > 0 ? totalSpread / minWidthSum : 1
    const minWidths = rawMinWidths.map((width) => width * minWidthScale)
    const scaledMinWidthSum = minWidths.reduce((sum, width) => sum + width, 0)
    const weights = segmentIds.map((segmentId) => {
      const stats = statsById.get(segmentId) ?? { count: 0 }
      return stats.count > 0 ? Math.max(1, stats.count) : 0.02
    })
    const weightSum = weights.reduce((sum, weight) => sum + weight, 0) || 1
    const remaining = Math.max(0, totalSpread - scaledMinWidthSum)

    let cursor = domainStart
    return segmentIds.map((segmentId, index) => {
      const width = minWidths[index] + (remaining * weights[index]) / weightSum
      const min = cursor
      const max = cursor + width
      cursor = max

      return {
        id: segmentId,
        min,
        max,
        center: (min + max) / 2,
        width,
      }
    })
  }
  const getSegmentOrderIndex = (segmentId) => {
    const groupedSegmentId = getGroupedSegmentId(segmentId)
    const index = segmentOrderIndexById.get(groupedSegmentId)
    return index !== undefined ? index : optimizedSegmentIds.length + 1
  }
  const compareNodesBySegment = (parentNode, leftNode, rightNode) => {
    const leftIndex = getSegmentOrderIndex(leftNode.data.segmentId ?? null)
    const rightIndex = getSegmentOrderIndex(rightNode.data.segmentId ?? null)

    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex
    }

    const parentSegmentIndex = parentNode?.depth > 0
      ? getSegmentOrderIndex(parentNode.data.segmentId ?? null)
      : null

    if (parentSegmentIndex !== null) {
      const leftDistance = Math.abs(leftIndex - parentSegmentIndex)
      const rightDistance = Math.abs(rightIndex - parentSegmentIndex)
      if (leftDistance !== rightDistance) {
        return leftDistance - rightDistance
      }
    }

    const leftLevel = getEffectiveLevel(leftNode)
    const rightLevel = getEffectiveLevel(rightNode)
    if (leftLevel !== rightLevel) {
      return leftLevel - rightLevel
    }

    return String(leftNode.data.label ?? '').localeCompare(String(rightNode.data.label ?? ''))
  }
  const sortChildrenForParent = (parentNode) => {
    return [...(parentNode.children ?? [])].sort((leftNode, rightNode) =>
      compareNodesBySegment(parentNode, leftNode, rightNode),
    )
  }

  const getEffectiveLevel = (node) => {
    const promotedLevel = autoPromotedLevelById.get(node.data.id)
    if (promotedLevel !== undefined) {
      return promotedLevel
    }

    if (node.data.ebene !== undefined && node.data.ebene !== null) {
      return node.data.ebene
    }

    return node.depth
  }

  if (allHierarchyNodes.length === 0) {
    const outerContentRadius = config.levelSpacing + config.nodeSize
    const width = outerContentRadius * 2 + config.horizontalPadding * 2
    const height = outerContentRadius * 2 + config.topPadding + config.bottomPadding
    const origin = {
      x: config.horizontalPadding + outerContentRadius,
      y: config.topPadding + outerContentRadius,
    }
    const separatorInnerRadius = Math.max(config.nodeSize * 0.9, config.levelSpacing * 0.9)
    const separatorOuterRadius = config.levelSpacing + 120
    const segmentLabelRadius = Math.max(
      config.levelSpacing + config.nodeSize * 0.95,
      separatorInnerRadius + config.nodeSize * 0.7,
    )
    const emptySpread =
      explicitSegments.length > 1
        ? Math.min(config.maxAngleSpread, Math.max(60, (explicitSegments.length - 1) * 28))
        : 0
    const segmentStep = explicitSegments.length > 1 ? emptySpread / (explicitSegments.length - 1) : 0
    const emptySegmentLabels = explicitSegments.map((segment, index) => {
      const anchorAngle = centerAngle - emptySpread / 2 + segmentStep * index
      const point = toCartesian(anchorAngle, segmentLabelRadius, origin)
      let rotation = anchorAngle + 90

      if (rotation > 90 && rotation < 270) {
        rotation += 180
      }

      return {
        id: `segment-label-${segment.id}`,
        segmentId: segment.id,
        text: segment.label,
        x: point.x,
        y: point.y,
        rotation,
        anchorAngle,
      }
    })
    const emptySegmentSeparators = emptySegmentLabels.slice(0, -1).map((segmentLabel, index) => {
      const next = emptySegmentLabels[index + 1]
      const angle = (segmentLabel.anchorAngle + next.anchorAngle) / 2
      const from = toCartesian(angle, separatorInnerRadius, origin)
      const to = toCartesian(angle, separatorOuterRadius, origin)

      return {
        id: `segment-separator-${segmentLabel.segmentId}-${next.segmentId}`,
        path: `M ${from.x} ${from.y} L ${to.x} ${to.y}`,
      }
    })

    const layout = {
      nodes: [],
      links: [],
      segments: {
        separators: emptySegmentSeparators,
        labels: emptySegmentLabels,
      },
      canvas: {
        width,
        height,
        origin,
        maxRadius: config.levelSpacing,
      },
    }

    return {
      layout,
      diagnostics: {
        isValid: true,
        issues: [],
      },
      meta: {
        orderedSegments: explicitSegments.map((segment, index) => ({
          id: segment.id,
          label: segment.label,
          index,
          slotMin: centerAngle,
          slotMax: centerAngle,
        })),
        subtreeSpan: 0,
      },
    }
  }

  const levelCounts = allHierarchyNodes.reduce((acc, node) => {
    const level = getEffectiveLevel(node)
    acc.set(level, (acc.get(level) ?? 0) + 1)
    return acc
  }, new Map())

  const minimumArcGap = config.nodeSize * config.minArcGapFactor
  const sortedLevels = Array.from(levelCounts.keys()).sort((a, b) => a - b)

  const buildRadiusByLevel = (spacingScale = 1) => {
    const radiusByLevel = new Map()
    let previousRadius = 0

    for (const level of sortedLevels) {
      const count = levelCounts.get(level)
      const spacing = config.levelSpacing * spacingScale
      const baseRadius = Math.max(level * spacing, previousRadius + spacing)
      const minimumRadiusForSpread =
        count <= 1
          ? 0
          : (((count - 1) * minimumArcGap) / toRadians(config.maxAngleSpread))
      const radius = Math.max(baseRadius, minimumRadiusForSpread)
      radiusByLevel.set(level, radius)
      previousRadius = radius
    }

    return radiusByLevel
  }

  const getGapByLevel = (radiusByLevel) => {
    const gapByLevel = new Map()

    for (const level of sortedLevels) {
      const radius = radiusByLevel.get(level)
      gapByLevel.set(level, toDegrees(minimumArcGap / radius))
    }

    return gapByLevel
  }

  const getDistanceBetweenSiblings = (left, right, gapByLevel) => {
    const baseGap = Math.max(gapByLevel.get(left.level), gapByLevel.get(right.level))
    const leftSegmentId = getGroupedSegmentId(left.node.data.segmentId ?? null)
    const rightSegmentId = getGroupedSegmentId(right.node.data.segmentId ?? null)
    const segmentGapMultiplier = leftSegmentId === rightSegmentId ? 1 : 2.4

    return (left.span + right.span) / 2 + baseGap * segmentGapMultiplier
  }

  const computeOffsets = (items, distances) => {
    if (items.length === 0) {
      return []
    }

    const centers = [0]
    for (let index = 1; index < items.length; index += 1) {
      centers[index] = centers[index - 1] + distances[index - 1]
    }

    const minBound = centers[0] - items[0].span / 2
    const maxBound = centers[centers.length - 1] + items[items.length - 1].span / 2
    const shift = -((minBound + maxBound) / 2)

    return centers.map((value) => value + shift)
  }

  const computeAngleLayout = (radiusByLevel) => {
    const gapByLevel = getGapByLevel(radiusByLevel)
    const spanByNodeId = new Map()
    const angleByNodeId = new Map()

    const shiftSubtreeAngles = (node, delta) => {
      if (node.depth > 0) {
        angleByNodeId.set(node.data.id, (angleByNodeId.get(node.data.id) ?? centerAngle) + delta)
      }

      for (const child of node.children ?? []) {
        shiftSubtreeAngles(child, delta)
      }
    }

    const alignRootSubtreesToSegments = () => {
      const rootChildren = sortChildrenForParent(root)

      if (rootChildren.length === 0) {
        return
      }

      const rootGroupsMap = new Map()
      for (const child of rootChildren) {
        const segmentId = getGroupedSegmentId(child.data.segmentId ?? null)
        const existing = rootGroupsMap.get(segmentId)

        if (!existing) {
          rootGroupsMap.set(segmentId, { segmentId, nodes: [child] })
          continue
        }

        existing.nodes.push(child)
      }

      const hasUnassignedRoots = rootGroupsMap.has(UNASSIGNED_SEGMENT_ID)
      const orderedSegmentIds = hasUnassignedRoots
        ? (optimizedSegmentIds.includes(UNASSIGNED_SEGMENT_ID)
            ? optimizedSegmentIds
            : [...optimizedSegmentIds, UNASSIGNED_SEGMENT_ID])
        : optimizedSegmentIds.filter((segmentId) => segmentId !== UNASSIGNED_SEGMENT_ID)

      if (orderedSegmentIds.length === 0) {
        return
      }

      const rootGroupGap = (gapByLevel.get(1) ?? toDegrees(minimumArcGap / config.levelSpacing)) * 1.35
      const hasEmptySegmentSlots = orderedSegmentIds.some((segmentId) => !rootGroupsMap.has(segmentId))
      const levelOneRadiusForGroups = radiusByLevel.get(1) ?? config.levelSpacing

      const rootStatsBySegmentId = new Map(
        orderedSegmentIds.map((segmentId) => [segmentId, { count: (rootGroupsMap.get(segmentId)?.nodes.length ?? 0) }]),
      )
      const rootSegmentSpread = config.maxAngleSpread
      const rootSegmentSlots = computeSegmentSlots({
        segmentIds: orderedSegmentIds,
        statsById: rootStatsBySegmentId,
        radius: levelOneRadiusForGroups,
        totalSpread: rootSegmentSpread,
      })
      const slotCenterBySegmentId = new Map(rootSegmentSlots.map((slot) => [slot.id, slot.center]))

      const groupItems = orderedSegmentIds.map((segmentId) => {
        const group = rootGroupsMap.get(segmentId) ?? { segmentId, nodes: [] }

        if (group.nodes.length === 0) {
          const labelSpan = toAngleSpan(
            getEstimatedSegmentLabelWidthPx(segmentId) + config.nodeSize * 0.35,
            levelOneRadiusForGroups,
          )

          return {
            group,
            center: centerAngle,
            span: hasEmptySegmentSlots ? Math.max(labelSpan, rootGroupGap * 0.9) : rootGroupGap * 0.45,
          }
        }

        const bounds = group.nodes.map((node) => {
          const angle = angleByNodeId.get(node.data.id) ?? centerAngle
          const span = spanByNodeId.get(node.data.id) ?? 0

          return {
            min: angle - span / 2,
            max: angle + span / 2,
          }
        })
        const min = Math.min(...bounds.map((bound) => bound.min))
        const max = Math.max(...bounds.map((bound) => bound.max))

        return {
          group,
          center: (min + max) / 2,
          span: Math.max(0, max - min),
        }
      })

      const distances = []
      for (let index = 1; index < groupItems.length; index += 1) {
        const left = groupItems[index - 1]
        const right = groupItems[index]
        const distance = (left.span + right.span) / 2 + rootGroupGap
        distances.push(distance)
      }

      const offsets = computeOffsets(groupItems, distances)

      groupItems.forEach((item, index) => {
        const slotCenter = slotCenterBySegmentId.get(item.group.segmentId) ?? centerAngle
        const packedCenter = centerAngle + offsets[index]
        const desiredCenter = item.group.nodes.length > 0 ? (slotCenter + packedCenter) / 2 : slotCenter
        const delta = desiredCenter - item.center

        if (Math.abs(delta) <= 0.01) {
          return
        }

        if (item.group.nodes.length === 0) {
          return
        }

        item.group.nodes.forEach((node) => {
          shiftSubtreeAngles(node, delta)
        })
      })
    }

    const computeSpan = (node) => {
      const children = sortChildrenForParent(node)

      if (children.length === 0) {
        spanByNodeId.set(node.data.id, 0)
        return 0
      }

      const childItems = children.map((child) => ({
        node: child,
        span: computeSpan(child),
        level: getEffectiveLevel(child),
      }))

      if (childItems.length === 1) {
        spanByNodeId.set(node.data.id, childItems[0].span)
        return childItems[0].span
      }

      const distances = []
      for (let index = 1; index < childItems.length; index += 1) {
        const left = childItems[index - 1]
        const right = childItems[index]
        const distance = getDistanceBetweenSiblings(left, right, gapByLevel)
        distances.push(distance)
      }

      const centers = computeOffsets(childItems, distances)
      const minBound = Math.min(...centers.map((center, idx) => center - childItems[idx].span / 2))
      const maxBound = Math.max(...centers.map((center, idx) => center + childItems[idx].span / 2))
      const totalSpan = maxBound - minBound
      spanByNodeId.set(node.data.id, totalSpan)
      return totalSpan
    }

    const assignAngles = (node, angle) => {
      if (node.depth > 0) {
        angleByNodeId.set(node.data.id, angle)
      }

      const children = sortChildrenForParent(node)
      if (children.length === 0) {
        return
      }

      const childItems = children.map((child) => ({
        node: child,
        span: spanByNodeId.get(child.data.id) ?? 0,
        level: getEffectiveLevel(child),
      }))

      if (childItems.length === 1) {
        assignAngles(childItems[0].node, angle)
        return
      }

      const distances = []
      for (let index = 1; index < childItems.length; index += 1) {
        const left = childItems[index - 1]
        const right = childItems[index]
        const distance = getDistanceBetweenSiblings(left, right, gapByLevel)
        distances.push(distance)
      }

      const offsets = computeOffsets(childItems, distances)

      childItems.forEach((child, index) => {
        assignAngles(child.node, angle + offsets[index])
      })
    }

    const rootChildren = sortChildrenForParent(root)
    rootChildren.forEach((child) => computeSpan(child))
    assignAngles(root, centerAngle)
    alignRootSubtreesToSegments()

    const nextSubtreeSpan = rootChildren.length
      ? (() => {
          const bounds = rootChildren.map((child) => {
            const angle = angleByNodeId.get(child.data.id) ?? centerAngle
            const span = spanByNodeId.get(child.data.id) ?? 0

            return {
              min: angle - span / 2,
              max: angle + span / 2,
            }
          })

          return Math.max(...bounds.map((bound) => bound.max)) - Math.min(...bounds.map((bound) => bound.min))
        })()
      : 0

    return {
      angleByNodeId,
      subtreeSpan: nextSubtreeSpan,
    }
  }

  let spacingScale = 1
  let radiusByLevel = buildRadiusByLevel(spacingScale)
  let { angleByNodeId, subtreeSpan } = computeAngleLayout(radiusByLevel)

  for (let attempt = 0; attempt < 5 && subtreeSpan > config.maxAngleSpread; attempt += 1) {
    spacingScale *= subtreeSpan / config.maxAngleSpread + 0.08
    radiusByLevel = buildRadiusByLevel(spacingScale)
    const nextLayout = computeAngleLayout(radiusByLevel)
    angleByNodeId = nextLayout.angleByNodeId
    subtreeSpan = nextLayout.subtreeSpan
  }

  const allNodes = root.descendants().filter((node) => node.depth > 0)
  let maxRadius = Math.max(config.levelSpacing, ...radiusByLevel.values())

  const getRadiusForLevel = (level) => radiusByLevel.get(level) ?? level * config.levelSpacing
  const packedAngleByNodeId = new Map(angleByNodeId)
  const getAngleForNode = (node) => packedAngleByNodeId.get(node.data.id) ?? centerAngle
  const separatorInnerRadius = Math.max(config.nodeSize * 0.9, config.levelSpacing * 0.9)
  let separatorOuterRadius = maxRadius + 120
  let segmentLabelRadius = Math.max(
    maxRadius + config.nodeSize * 0.95,
    separatorInnerRadius + config.nodeSize * 0.7,
  )
  let origin = { x: 0, y: 0 }

  const segmentEntryById = new Map(explicitSegments.map((segment) => [segment.id, segment]))
  if (hasUnassignedNodes) {
    segmentEntryById.set(UNASSIGNED_SEGMENT_ID, { id: UNASSIGNED_SEGMENT_ID, label: null, isVirtual: true })
  }

  const orderedSegmentIds = hasUnassignedNodes
    ? (optimizedSegmentIds.includes(UNASSIGNED_SEGMENT_ID)
        ? optimizedSegmentIds
        : [...optimizedSegmentIds, UNASSIGNED_SEGMENT_ID])
    : optimizedSegmentIds.filter((segmentId) => segmentId !== UNASSIGNED_SEGMENT_ID)

  const segmentEntries = orderedSegmentIds
    .map((segmentId) => segmentEntryById.get(segmentId))
    .filter(Boolean)

  const nodeCountBySegmentId = new Map(segmentEntries.map((segment) => [segment.id, 0]))
  for (const node of allNodes) {
    const segmentId = getGroupedSegmentId(node.data.segmentId ?? null)
    nodeCountBySegmentId.set(segmentId, (nodeCountBySegmentId.get(segmentId) ?? 0) + 1)
  }

  const segmentStatsById = new Map(
    segmentEntries.map((segment) => {
      const count = nodeCountBySegmentId.get(segment.id) ?? 0
      return [segment.id, { count }]
    }),
  )
  const segmentSlotSpread = config.maxAngleSpread
  const segmentSlots = computeSegmentSlots({
    segmentIds: segmentEntries.map((segment) => segment.id),
    statsById: segmentStatsById,
    radius: segmentLabelRadius,
    totalSpread: segmentSlotSpread,
  })
  const segmentSlotById = new Map(segmentSlots.map((slot) => [slot.id, slot]))

  const orderedSegments = segmentEntries.map((segment, index) => {
    const slot = segmentSlotById.get(segment.id)

    return {
      id: segment.id,
      label: segment.label,
      isVirtual: segment.isVirtual ?? false,
      index,
      min: null,
      max: null,
      anchorAngle: slot.center,
      slotMin: slot.min,
      slotMax: slot.max,
      slotCenter: slot.center,
    }
  })

  const nodeAngularWidthPx = config.nodeSize * 1.02
  const nodeBoundaryMarginPx = config.nodeSize * 0.58
  const nodeOrderWithinLevelSegment = new Map()
  let capacityIssues = []

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const boundaryBySegmentId = new Map(
      orderedSegments.map((segment) => [
        segment.id,
        {
          min: segment.slotMin,
          max: segment.slotMax,
        },
      ]),
    )

    const groupedNodes = new Map()
    for (const node of allNodes) {
      const level = getEffectiveLevel(node)
      const segmentId = getGroupedSegmentId(node.data.segmentId ?? null)
      const key = `${level}|${segmentId}`

      if (!groupedNodes.has(key)) {
        groupedNodes.set(key, { level, segmentId, nodes: [node] })
      } else {
        groupedNodes.get(key).nodes.push(node)
      }
    }

    const neededRadiusByLevel = new Map()
    const iterationCapacityIssues = []

    for (const { level, segmentId, nodes } of groupedNodes.values()) {
      const boundary = boundaryBySegmentId.get(segmentId)
      if (!boundary) {
        continue
      }

      const radius = Math.max(getRadiusForLevel(level), 1)
      const marginDeg = toDegrees(nodeBoundaryMarginPx / radius)
      const spanDeg = toDegrees(nodeAngularWidthPx / radius)
      const gapDeg = toDegrees(minimumArcGap / radius)
      const leftCenter = boundary.min + marginDeg + spanDeg / 2
      const rightCenter = boundary.max - marginDeg - spanDeg / 2
      const availableCenterSpan = Math.max(0, rightCenter - leftCenter)
      const centerGap = spanDeg + gapDeg
      const requiredCenterSpan = Math.max(0, (nodes.length - 1) * centerGap)

      if (requiredCenterSpan > availableCenterSpan + 0.0001) {
        const availableAngle = Math.max(3, boundary.max - boundary.min - marginDeg * 2)
        const requiredPixels = nodes.length * nodeAngularWidthPx + (nodes.length - 1) * minimumArcGap
        const neededRadius = requiredPixels / toRadians(availableAngle)
        setMapMax(neededRadiusByLevel, level, neededRadius)
        iterationCapacityIssues.push({
          type: 'segment-capacity',
          severity: 'error',
          segmentId,
          nodeIds: nodes.map((node) => node.data.id),
          message: 'Segmentkapazitaet auf dieser Ebene ist zu klein.',
        })
        continue
      }

      const sortedNodes = [...nodes].sort((leftNode, rightNode) =>
        getAngleForNode(leftNode) - getAngleForNode(rightNode),
      )

      if (sortedNodes.length === 1) {
        const center = clamp(getAngleForNode(sortedNodes[0]), leftCenter, rightCenter)
        packedAngleByNodeId.set(sortedNodes[0].data.id, center)
        nodeOrderWithinLevelSegment.set(`${level}|${segmentId}`, [sortedNodes[0].data.id])
        continue
      }

      const centers = sortedNodes.map((node) => clamp(getAngleForNode(node), leftCenter, rightCenter))
      for (let index = 1; index < centers.length; index += 1) {
        centers[index] = Math.max(centers[index], centers[index - 1] + centerGap)
      }
      for (let index = centers.length - 2; index >= 0; index -= 1) {
        centers[index] = Math.min(centers[index], centers[index + 1] - centerGap)
      }

      const shiftRight = leftCenter - centers[0]
      if (shiftRight > 0) {
        for (let index = 0; index < centers.length; index += 1) {
          centers[index] += shiftRight
        }
      }

      const shiftLeft = centers[centers.length - 1] - rightCenter
      if (shiftLeft > 0) {
        for (let index = 0; index < centers.length; index += 1) {
          centers[index] -= shiftLeft
        }
      }

      centers.forEach((center, index) => {
        packedAngleByNodeId.set(sortedNodes[index].data.id, center)
      })
      nodeOrderWithinLevelSegment.set(
        `${level}|${segmentId}`,
        sortedNodes.map((node) => node.data.id),
      )
    }

    if (neededRadiusByLevel.size === 0) {
      capacityIssues = []
      break
    }

    capacityIssues = iterationCapacityIssues

    neededRadiusByLevel.forEach((neededRadius, level) => {
      const currentRadius = getRadiusForLevel(level)
      radiusByLevel.set(level, Math.max(currentRadius, neededRadius))
    })
  }

  maxRadius = Math.max(config.levelSpacing, ...radiusByLevel.values())
  separatorOuterRadius = maxRadius + 120
  segmentLabelRadius = Math.max(
    maxRadius + config.nodeSize * 0.95,
    separatorInnerRadius + config.nodeSize * 0.7,
  )

  const segmentRangesMap = new Map()

  for (const node of allNodes) {
    const segmentId = getGroupedSegmentId(node.data.segmentId ?? null)

    const angle = getAngleForNode(node)
    const existing = segmentRangesMap.get(segmentId)

    if (!existing) {
      segmentRangesMap.set(segmentId, {
        id: segmentId,
        min: angle,
        max: angle,
      })
      continue
    }

    existing.min = Math.min(existing.min, angle)
    existing.max = Math.max(existing.max, angle)
  }

  const finalOrderedSegments = orderedSegments.map((segment) => {
    const range = segmentRangesMap.get(segment.id)
    return {
      ...segment,
      min: range?.min ?? null,
      max: range?.max ?? null,
    }
  })

  const outerContentRadius = Math.max(
    maxRadius + config.nodeSize,
    separatorOuterRadius + config.nodeSize * 0.35,
    segmentLabelRadius + config.nodeSize,
  )
  const svgWidth = outerContentRadius * 2 + config.horizontalPadding * 2
  const svgHeight = outerContentRadius * 2 + config.topPadding + config.bottomPadding
  origin = {
    x: config.horizontalPadding + outerContentRadius,
    y: config.topPadding + outerContentRadius,
  }

  const nodes = allNodes.map((node) => {
    const angle = getAngleForNode(node)
    const effectiveLevel = getEffectiveLevel(node)
    const radius = getRadiusForLevel(effectiveLevel)
    const point = toCartesian(angle, radius, origin)

    return {
      id: node.data.id,
      label: node.data.label,
      status: node.data.status,
      segmentId: node.data.segmentId ?? null,
      depth: node.depth,
      level: effectiveLevel,
      angle,
      radius,
      x: point.x,
      y: point.y,
      parentId: node.parent?.data.id ?? null,
    }
  })

  const links = root.links().map((link) => {
    const sourceAngle = getAngleForNode(link.source)
    const targetAngle = getAngleForNode(link.target)
    const getEffectiveLevelForLink = (node) => {
      if (node.data.ebene !== undefined && node.data.ebene !== null) {
        return node.data.ebene
      }
      return node.depth
    }
    const sourceRadius = getRadiusForLevel(getEffectiveLevelForLink(link.source))
    const targetRadius = getRadiusForLevel(getEffectiveLevelForLink(link.target))

    return {
      id: `${link.source.data.id}-${link.target.data.id}`,
      sourceDepth: link.source.depth,
      path: buildRadialEdgePath(
        sourceAngle,
        sourceRadius,
        targetAngle,
        targetRadius,
        origin,
      ),
    }
  })

  const depthOneNodes = [...(root.children ?? [])]
  depthOneNodes.sort((a, b) => getAngleForNode(a) - getAngleForNode(b))
  const levelOneRadius = getRadiusForLevel(1)

  const siblingArcs = depthOneNodes.slice(0, -1).map((node, index) => {
    const next = depthOneNodes[index + 1]
    const fromAngle = getAngleForNode(node)
    const toAngle = getAngleForNode(next)
    const from = toCartesian(fromAngle, levelOneRadius, origin)
    const to = toCartesian(toAngle, levelOneRadius, origin)
    const sweep = toAngle > fromAngle ? 1 : 0

    return {
      id: `sibling-${node.data.id}-${next.data.id}`,
      sourceDepth: 1,
      path: `M ${from.x} ${from.y} A ${levelOneRadius} ${levelOneRadius} 0 0 ${sweep} ${to.x} ${to.y}`,
    }
  })

  const levelOneBridges = depthOneNodes
    .map((node) => {
      const angle = getAngleForNode(node)
      const nodeRadius = getRadiusForLevel(getEffectiveLevel(node))

      if (Math.abs(nodeRadius - levelOneRadius) < 0.01) {
        return null
      }

      const from = toCartesian(angle, levelOneRadius, origin)
      const to = toCartesian(angle, nodeRadius, origin)

      return {
        id: `bridge-level1-${node.data.id}`,
        sourceDepth: 1,
        path: `M ${from.x} ${from.y} L ${to.x} ${to.y}`,
      }
    })
    .filter(Boolean)

  const boundarySafetyMarginDeg = toDegrees((config.nodeSize * 0.58) / Math.max(levelOneRadius, config.levelSpacing))

  const segmentSeparators = finalOrderedSegments.slice(0, -1).map((segment, index) => {
    const next = finalOrderedSegments[index + 1]
    const leftBoundaryAngle = segment.max ?? segment.slotMax
    const rightBoundaryAngle = next.min ?? next.slotMin
    const leftSafe = leftBoundaryAngle + boundarySafetyMarginDeg
    const rightSafe = rightBoundaryAngle - boundarySafetyMarginDeg
    const angle = leftSafe < rightSafe
      ? (leftSafe + rightSafe) / 2
      : (leftBoundaryAngle + rightBoundaryAngle) / 2
    const from = toCartesian(angle, separatorInnerRadius, origin)
    const to = toCartesian(angle, separatorOuterRadius, origin)

    return {
      id: `segment-separator-${segment.id}-${next.id}`,
      path: `M ${from.x} ${from.y} L ${to.x} ${to.y}`,
    }
  })

  const segmentLabels = finalOrderedSegments
    .filter((segment) => !segment.isVirtual)
    .map((segment) => {
      const point = toCartesian(segment.anchorAngle, segmentLabelRadius, origin)
      let rotation = segment.anchorAngle + 90

      if (rotation > 90 && rotation < 270) {
        rotation += 180
      }

      return {
        id: `segment-label-${segment.id}`,
        segmentId: segment.id,
        text: segment.label,
        x: point.x,
        y: point.y,
        rotation,
        anchorAngle: segment.anchorAngle,
      }
    })

  const layout = {
    nodes,
    links: [...links, ...siblingArcs, ...levelOneBridges],
    segments: {
      separators: segmentSeparators,
      labels: segmentLabels,
    },
    canvas: {
      width: svgWidth,
      height: svgHeight,
      origin,
      maxRadius,
    },
  }

  const computedLevelByNodeId = new Map(nodes.map((node) => [node.id, node.level]))

  return {
    layout,
    diagnostics: buildLayoutDiagnostics({
      nodes,
      orderedSegments: finalOrderedSegments,
      config,
      subtreeSpan,
      additionalIssues: capacityIssues,
    }),
    meta: {
      orderedSegments: finalOrderedSegments,
      subtreeSpan,
      autoPromotedLevelById,
      computedLevelByNodeId,
      nodeOrderWithinLevelSegment,
      capacityIssues,
    },
  }
}

export const calculateRadialSkillTree = (data, config) => solveSkillTreeLayout(data, config).layout