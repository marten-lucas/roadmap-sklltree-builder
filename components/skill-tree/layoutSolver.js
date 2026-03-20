import { buildLayoutDiagnostics } from './layoutDiagnostics'
import { analyzeSegmentLevelFeasibility, buildSegmentLevelGroups } from './layoutFeasibility'
import {
  buildRadialEdgePath,
  centerAngle,
  clamp,
  toCartesian,
  toDegrees,
  toRadians,
} from './layoutMath'
import { buildLayoutModel } from './layoutModel'
import { buildAutoPromotedLevels } from './levelAssignment'
import { computeWeightedSegmentSlots } from './radialPacker'
import { UNASSIGNED_SEGMENT_ID, getGroupedSegmentId } from './layoutShared'
import { buildOptimizedSegmentIdOrder } from './segmentOptimizer'

export const solveSkillTreeLayout = (data, config) => {
  const { root, explicitSegments, allHierarchyNodes, hasUnassignedNodes } = buildLayoutModel(data)
  const optimizedSegmentIds = buildOptimizedSegmentIdOrder({
    root,
    explicitSegments,
    includeUnassigned: hasUnassignedNodes,
  })
  const segmentOrderIndexById = new Map(optimizedSegmentIds.map((segmentId, index) => [segmentId, index]))
  const {
    promotedLevelById: autoPromotedLevelById,
    promotedByConflict,
    edgePromotionDetails,
  } = buildAutoPromotedLevels({
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
    return computeWeightedSegmentSlots({
      segmentIds,
      statsById,
      radius,
      totalSpread,
      centerAngle,
      getMinimumWidth: (segmentId, currentRadius, stats) => {
        const segmentStats = stats ?? { count: 0 }
        const labelWidth = toAngleSpan(
          getEstimatedSegmentLabelWidthPx(segmentId) + config.nodeSize * 0.28,
          currentRadius,
        )

        if (segmentStats.count > 0) {
          return Math.max(labelWidth, toAngleSpan(config.nodeSize * 0.9, currentRadius))
        }

        return labelWidth
      },
      getWeight: (_segmentId, stats) => {
        const segmentStats = stats ?? { count: 0 }
        return segmentStats.count > 0 ? Math.max(1, segmentStats.count) : 0.02
      },
    })
  }
  const getSegmentOrderIndex = (segmentId) => {
    const groupedSegmentId = getGroupedSegmentId(segmentId)
    const index = segmentOrderIndexById.get(groupedSegmentId)
    return index !== undefined ? index : optimizedSegmentIds.length + 1
  }

  const subtreeSegmentCenterByNodeId = new Map()
  const getSubtreeSegmentCenter = (node) => {
    const cached = subtreeSegmentCenterByNodeId.get(node.data.id)
    if (cached !== undefined) {
      return cached
    }

    const ownIndex = getSegmentOrderIndex(node.data.segmentId ?? null)
    const children = node.children ?? []

    if (children.length === 0) {
      subtreeSegmentCenterByNodeId.set(node.data.id, ownIndex)
      return ownIndex
    }

    const childCenters = children.map((child) => getSubtreeSegmentCenter(child))
    const center = (ownIndex + childCenters.reduce((sum, value) => sum + value, 0)) / (childCenters.length + 1)
    subtreeSegmentCenterByNodeId.set(node.data.id, center)
    return center
  }

  const getChildOrderCost = (parentNode, candidate) => {
    const childSegmentIndex = getSegmentOrderIndex(candidate.data.segmentId ?? null)
    const childSubtreeCenter = getSubtreeSegmentCenter(candidate)
    const parentSegmentIndex = parentNode?.depth > 0
      ? getSegmentOrderIndex(parentNode.data.segmentId ?? null)
      : null

    const parentDistancePenalty =
      parentSegmentIndex === null ? 0 : Math.abs(childSegmentIndex - parentSegmentIndex) * 1.9
    const subtreeDistancePenalty =
      parentSegmentIndex === null ? 0 : Math.abs(childSubtreeCenter - parentSegmentIndex) * 1.35
    const levelPenalty = getEffectiveLevel(candidate) * 0.02

    return parentDistancePenalty + subtreeDistancePenalty + levelPenalty
  }

  const scoreChildOrder = (parentNode, orderedChildren) => {
    if (!orderedChildren.length) {
      return 0
    }

    let score = 0
    for (let index = 0; index < orderedChildren.length; index += 1) {
      const child = orderedChildren[index]
      score += getChildOrderCost(parentNode, child)

      if (index > 0) {
        const previous = orderedChildren[index - 1]
        const previousSegment = getSegmentOrderIndex(previous.data.segmentId ?? null)
        const currentSegment = getSegmentOrderIndex(child.data.segmentId ?? null)
        score += Math.abs(currentSegment - previousSegment) * 0.9
      }
    }

    return score
  }
  const compareNodesBySegment = (parentNode, leftNode, rightNode) => {
    const leftCost = getChildOrderCost(parentNode, leftNode)
    const rightCost = getChildOrderCost(parentNode, rightNode)

    if (Math.abs(leftCost - rightCost) > 1e-6) {
      return leftCost - rightCost
    }

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
    const sorted = [...(parentNode.children ?? [])].sort((leftNode, rightNode) =>
      compareNodesBySegment(parentNode, leftNode, rightNode),
    )

    let best = sorted
    let bestScore = scoreChildOrder(parentNode, best)
    let improved = true
    let safety = 0

    while (improved && safety < 10) {
      improved = false
      safety += 1

      for (let index = 0; index < best.length - 1; index += 1) {
        const candidate = [...best]
        const tmp = candidate[index]
        candidate[index] = candidate[index + 1]
        candidate[index + 1] = tmp
        const candidateScore = scoreChildOrder(parentNode, candidate)

        if (candidateScore < bestScore - 1e-6) {
          best = candidate
          bestScore = candidateScore
          improved = true
        }
      }
    }

    return best
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
    const emptySlots = computeSegmentSlots({
      segmentIds: explicitSegments.map((segment) => segment.id),
      statsById: new Map(explicitSegments.map((segment) => [segment.id, { count: 0 }])),
      radius: segmentLabelRadius,
      totalSpread: emptySpread,
    })
    const emptySlotBySegmentId = new Map(emptySlots.map((slot) => [slot.id, slot]))
    const emptySegmentLabels = explicitSegments.map((segment) => {
      const slot = emptySlotBySegmentId.get(segment.id)
      const anchorAngle = slot?.center ?? centerAngle
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
    const emptySegmentSeparators = emptySlots.slice(0, -1).map((slot, index) => {
      const next = emptySlots[index + 1]
      const angle = (slot.max + next.min) / 2
      const from = toCartesian(angle, separatorInnerRadius, origin)
      const to = toCartesian(angle, separatorOuterRadius, origin)

      return {
        id: `segment-separator-${slot.id}-${next.id}`,
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
        orderedSegments: explicitSegments.map((segment, index) => {
          const slot = emptySlotBySegmentId.get(segment.id)
          return {
          id: segment.id,
          label: segment.label,
          index,
          min: slot?.min ?? centerAngle,
          max: slot?.max ?? centerAngle,
          wedgeMin: slot?.min ?? centerAngle,
          wedgeMax: slot?.max ?? centerAngle,
          wedgeCenter: slot?.center ?? centerAngle,
          anchorAngle: slot?.center ?? centerAngle,
          slotMin: slot?.min ?? centerAngle,
          slotMax: slot?.max ?? centerAngle,
        }}),
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
      min: slot.min,
      max: slot.max,
      wedgeMin: slot.min,
      wedgeMax: slot.max,
      wedgeCenter: slot.center,
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
  let feasibilityAnalysis = {
    isFeasible: true,
    segmentLevelEntries: [],
    neededRadiusByLevel: new Map(),
    issues: [],
    entryByKey: new Map(),
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const groupedNodes = buildSegmentLevelGroups({
      allNodes,
      getEffectiveLevel,
    })
    feasibilityAnalysis = analyzeSegmentLevelFeasibility({
      groupedNodes,
      orderedSegments,
      getRadiusForLevel,
      nodeAngularWidthPx,
      nodeBoundaryMarginPx,
      minimumArcGap,
    })

    for (const { key, level, segmentId, nodes } of groupedNodes.values()) {
      const feasibilityEntry = feasibilityAnalysis.entryByKey.get(key)
      if (!feasibilityEntry || !feasibilityEntry.isFeasible) {
        continue
      }

      const { leftCenter, rightCenter, centerGap } = feasibilityEntry

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

    if (feasibilityAnalysis.neededRadiusByLevel.size === 0) {
      capacityIssues = []
      break
    }

    capacityIssues = feasibilityAnalysis.issues

    feasibilityAnalysis.neededRadiusByLevel.forEach((neededRadius, level) => {
      const currentRadius = getRadiusForLevel(level)
      radiusByLevel.set(level, Math.max(currentRadius, neededRadius))
    })
  }

  feasibilityAnalysis = analyzeSegmentLevelFeasibility({
    groupedNodes: buildSegmentLevelGroups({
      allNodes,
      getEffectiveLevel,
    }),
    orderedSegments,
    getRadiusForLevel,
    nodeAngularWidthPx,
    nodeBoundaryMarginPx,
    minimumArcGap,
  })
  capacityIssues = feasibilityAnalysis.issues

  maxRadius = Math.max(config.levelSpacing, ...radiusByLevel.values())
  separatorOuterRadius = maxRadius + 120
  segmentLabelRadius = Math.max(
    maxRadius + config.nodeSize * 0.95,
    separatorInnerRadius + config.nodeSize * 0.7,
  )

  const observedSegmentRangesMap = new Map()

  for (const node of allNodes) {
    const segmentId = getGroupedSegmentId(node.data.segmentId ?? null)

    const angle = getAngleForNode(node)
    const existing = observedSegmentRangesMap.get(segmentId)

    if (!existing) {
      observedSegmentRangesMap.set(segmentId, {
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
    const range = observedSegmentRangesMap.get(segment.id)
    return {
      ...segment,
      min: segment.wedgeMin,
      max: segment.wedgeMax,
      observedMin: range?.min ?? null,
      observedMax: range?.max ?? null,
      anchorAngle: segment.wedgeCenter,
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
    const leftBoundaryAngle = segment.wedgeMax ?? segment.slotMax
    const rightBoundaryAngle = next.wedgeMin ?? next.slotMin
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
      const anchorAngle = segment.wedgeCenter ?? segment.anchorAngle
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
      promotedByConflict: [...promotedByConflict.values()],
      edgePromotionDetails,
      computedLevelByNodeId,
      nodeOrderWithinLevelSegment,
      segmentOrder: optimizedSegmentIds,
      feasibility: {
        isFeasible: feasibilityAnalysis.isFeasible,
        nodeAngularWidthPx,
        nodeBoundaryMarginPx,
        minimumArcGapPx: minimumArcGap,
        segmentLevelEntries: feasibilityAnalysis.segmentLevelEntries,
      },
      capacityIssues,
    },
  }
}

export const calculateRadialSkillTree = (data, config) => solveSkillTreeLayout(data, config).layout