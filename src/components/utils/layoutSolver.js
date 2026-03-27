import { buildLayoutDiagnostics } from './layoutDiagnostics'
import { buildEdgeRoutingModel, buildRoutedEdgeLinks } from './edgeRouter'
import { analyzeSegmentLevelFeasibility, buildSegmentLevelGroups } from './layoutFeasibility'
import {
  buildArcRadialPath,
  buildRadialArcPath,
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

const EPSILON = 0.01
const MAX_SEGMENT_LABEL_CHARS_PER_LINE = 15
const CENTER_LABEL_GAP_PX = 12
const LABEL_LEVEL_ONE_GAP_PX = 14
const LABEL_RADIUS_OUTER_BIAS = 0.68

const estimateWrappedLineCount = (text) => {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) {
    return 1
  }

  let lineCount = 0
  let currentLine = ''
  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word
    if (candidate.length <= MAX_SEGMENT_LABEL_CHARS_PER_LINE) {
      currentLine = candidate
      continue
    }

    if (currentLine) {
      lineCount += 1
    }
    currentLine = word
  }

  if (currentLine) {
    lineCount += 1
  }

  return Math.max(lineCount, 1)
}

const normalizeAngleDeg = (angle) => {
  const normalized = ((Number(angle) % 360) + 360) % 360
  return Number.isFinite(normalized) ? normalized : 0
}

const getReadableRadialLabelRotation = (anchorAngleDeg) => {
  const normalized = normalizeAngleDeg(anchorAngleDeg)
  if (normalized > 90 && normalized < 270) {
    return normalized + 180
  }

  return normalized
}

const computeLabelBandRadius = (innerRadius, outerRadius) => {
  const clampedOuter = Math.max(outerRadius, innerRadius)
  const available = Math.max(0, clampedOuter - innerRadius)
  return innerRadius + available * LABEL_RADIUS_OUTER_BIAS
}

const buildSeparatorPathWithDetours = ({
  baseAngle,
  innerRadius,
  outerRadius,
  origin,
  nodes,
  allowedMinAngle,
  allowedMaxAngle,
  nodeSize,
  angleSafetyDeg,
}) => {
  const clampedBaseAngle = clamp(baseAngle, allowedMinAngle, allowedMaxAngle)
  const start = toCartesian(clampedBaseAngle, innerRadius, origin)
  const parts = [`M ${start.x} ${start.y}`]

  let currentAngle = clampedBaseAngle
  let currentRadius = innerRadius

  const nodeHalfSize = nodeSize * 0.56
  const radialClearance = Math.max(nodeSize * 0.42, 24)
  const detourPadding = Math.max(angleSafetyDeg * 0.5, 1.4)

  const blockers = nodes
    .map((node) => {
      const blockStartRadius = node.radius - radialClearance
      const blockEndRadius = node.radius + radialClearance

      if (blockEndRadius <= innerRadius || blockStartRadius >= outerRadius) {
        return null
      }

      const angularHalfWidth = toDegrees(nodeHalfSize / Math.max(node.radius, 1))
      return {
        angleMin: node.angle - angularHalfWidth,
        angleMax: node.angle + angularHalfWidth,
        blockStartRadius,
        blockEndRadius,
      }
    })
    .filter(Boolean)
    .sort((left, right) => left.blockStartRadius - right.blockStartRadius)

  const addRaySegmentToRadius = (nextRadius) => {
    if (nextRadius - currentRadius < EPSILON) {
      return
    }

    const point = toCartesian(currentAngle, nextRadius, origin)
    parts.push(`L ${point.x} ${point.y}`)
    currentRadius = nextRadius
  }

  const addArcSegmentToAngle = (nextAngle) => {
    if (Math.abs(nextAngle - currentAngle) < EPSILON || currentRadius < 1) {
      return
    }

    const point = toCartesian(nextAngle, currentRadius, origin)
    const sweep = nextAngle > currentAngle ? 1 : 0
    parts.push(`A ${currentRadius} ${currentRadius} 0 0 ${sweep} ${point.x} ${point.y}`)
    currentAngle = nextAngle
  }

  for (const blocker of blockers) {
    if (blocker.blockEndRadius <= currentRadius + EPSILON) {
      continue
    }

    const isAngleBlocked =
      currentAngle >= blocker.angleMin - EPSILON && currentAngle <= blocker.angleMax + EPSILON

    if (!isAngleBlocked) {
      continue
    }

    const pivotRadius = clamp(blocker.blockStartRadius, currentRadius, outerRadius)
    addRaySegmentToRadius(pivotRadius)

    const leftEscape = clamp(blocker.angleMin - detourPadding, allowedMinAngle, allowedMaxAngle)
    const rightEscape = clamp(blocker.angleMax + detourPadding, allowedMinAngle, allowedMaxAngle)

    const leftDistance = Math.abs(currentAngle - leftEscape)
    const rightDistance = Math.abs(rightEscape - currentAngle)
    const nextAngle = leftDistance <= rightDistance ? leftEscape : rightEscape

    addArcSegmentToAngle(nextAngle)

    const exitRadius = clamp(blocker.blockEndRadius, currentRadius, outerRadius)
    addRaySegmentToRadius(exitRadius)
  }

  addRaySegmentToRadius(outerRadius)

  return parts.join(' ')
}

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
    const words = text.split(/\s+/).filter(Boolean)
    const wrappedLines = []
    let currentLine = ''

    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word
      if (candidate.length <= MAX_SEGMENT_LABEL_CHARS_PER_LINE) {
        currentLine = candidate
      } else {
        if (currentLine) {
          wrappedLines.push(currentLine)
        }
        currentLine = word
      }
    }

    if (currentLine) {
      wrappedLines.push(currentLine)
    }

    const textWidth = Math.max(72, ...wrappedLines.map((line) => line.length * 9))

    return textWidth + 20
  }
  const getEstimatedSegmentLabelHeightPx = (segmentId) => {
    const lineCount = estimateWrappedLineCount(getSegmentLabelText(segmentId))
    return 24 + Math.max(0, lineCount - 1) * 16
  }
  const getMaxEstimatedSegmentLabelHeightPx = () => Math.max(
    config.nodeSize * 0.4,
    ...explicitSegments.map((segment) => getEstimatedSegmentLabelHeightPx(segment.id)),
  )
  const centerIconRadiusPx = config.nodeSize * 0.72
  const additionalDependencyPortalAllowancePx = config.nodeSize * 0.2
  const levelOneNodeClearancePx = config.nodeSize * 0.5 + additionalDependencyPortalAllowancePx
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
    const maxLabelHeightPx = getMaxEstimatedSegmentLabelHeightPx()
    const labelHalfHeight = maxLabelHeightPx / 2
    const labelInnerLimit = centerIconRadiusPx + CENTER_LABEL_GAP_PX + labelHalfHeight
    const labelOuterLimit =
      config.levelSpacing - levelOneNodeClearancePx - LABEL_LEVEL_ONE_GAP_PX - labelHalfHeight
    const segmentLabelRadius = Math.max(
      labelInnerLimit,
      computeLabelBandRadius(labelInnerLimit, labelOuterLimit),
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

      return {
        id: `segment-label-${segment.id}`,
        segmentId: segment.id,
        text: segment.label,
        x: point.x,
        y: point.y,
        rotation: getReadableRadialLabelRotation(anchorAngle),
        anchorAngle,
      }
    })
    const emptySegmentSeparators = emptySlots.slice(0, -1).map((slot, index) => {
      const next = emptySlots[index + 1]
      const angle = (slot.max + next.min) / 2
      const safeMinAngle = Math.min(slot.max, next.min)
      const safeMaxAngle = Math.max(slot.max, next.min)

      return {
        id: `segment-separator-${slot.id}-${next.id}`,
        leftSegmentId: slot.id,
        rightSegmentId: next.id,
        path: buildSeparatorPathWithDetours({
          baseAngle: angle,
          innerRadius: separatorInnerRadius,
          outerRadius: separatorOuterRadius,
          origin,
          nodes: [],
          allowedMinAngle: safeMinAngle,
          allowedMaxAngle: safeMaxAngle,
          nodeSize: config.nodeSize,
          angleSafetyDeg: 0,
        }),
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
  const firstNodeLevel = sortedLevels[0] ?? 1
  const maxEstimatedSegmentLabelHeightPx = getMaxEstimatedSegmentLabelHeightPx()
  const minimumFirstLevelRadiusForLabelBand =
    centerIconRadiusPx
    + CENTER_LABEL_GAP_PX
    + maxEstimatedSegmentLabelHeightPx
    + LABEL_LEVEL_ONE_GAP_PX
    + levelOneNodeClearancePx

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
      const radius = Math.max(
        baseRadius,
        minimumRadiusForSpread,
        level === firstNodeLevel ? minimumFirstLevelRadiusForLabelBand : 0,
      )
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
  const firstLevelRadius = getRadiusForLevel(firstNodeLevel)
  const labelHalfHeight = maxEstimatedSegmentLabelHeightPx / 2
  const labelInnerRadius = centerIconRadiusPx + CENTER_LABEL_GAP_PX + labelHalfHeight
  const labelOuterRadius = firstLevelRadius - levelOneNodeClearancePx - LABEL_LEVEL_ONE_GAP_PX - labelHalfHeight
  let segmentLabelRadius = Math.max(
    labelInnerRadius,
    computeLabelBandRadius(labelInnerRadius, labelOuterRadius),
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

  const enforceMonotonicRadii = () => {
    for (let i = 1; i < sortedLevels.length; i += 1) {
      const prev = sortedLevels[i - 1]
      const curr = sortedLevels[i]
      const prevRadius = radiusByLevel.get(prev) ?? prev * config.levelSpacing
      const currRadius = radiusByLevel.get(curr) ?? curr * config.levelSpacing
      const minRequired = prevRadius + config.levelSpacing

      if (currRadius < minRequired) {
        radiusByLevel.set(curr, minRequired)
      }
    }
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

      const getPreferredPlacementAngle = (node) => {
        if (node.parent && node.parent.depth > 0) {
          return getAngleForNode(node.parent)
        }

        return getAngleForNode(node)
      }

      const buildPreferredCenters = (orderedNodes) => {
        const preferredCenters = []

        for (let start = 0; start < orderedNodes.length;) {
          const parentId = orderedNodes[start].parent?.data.id ?? null
          const baseAngle = clamp(getPreferredPlacementAngle(orderedNodes[start]), leftCenter, rightCenter)
          let end = start + 1

          while (end < orderedNodes.length && (orderedNodes[end].parent?.data.id ?? null) === parentId) {
            end += 1
          }

          const groupSize = end - start
          if (!parentId || groupSize === 1) {
            preferredCenters.push(baseAngle)
            start = end
            continue
          }

          const offsets = Array.from({ length: groupSize }, (_, index) =>
            (index - (groupSize - 1) / 2) * centerGap,
          )

          if (groupSize > 1 && offsets.some((offset) => Math.abs(offset) < 1e-6)) {
            const leftRoom = baseAngle - leftCenter
            const rightRoom = rightCenter - baseAngle
            const shift = (rightRoom >= leftRoom ? 0.5 : -0.5) * centerGap

            offsets.forEach((offset) => {
              preferredCenters.push(clamp(baseAngle + offset + shift, leftCenter, rightCenter))
            })
            start = end
            continue
          }

          offsets.forEach((offset) => {
            preferredCenters.push(clamp(baseAngle + offset, leftCenter, rightCenter))
          })
          start = end
        }

        return preferredCenters
      }

      const sortedNodes = [...nodes].sort((leftNode, rightNode) =>
        getPreferredPlacementAngle(leftNode) - getPreferredPlacementAngle(rightNode)
          || getAngleForNode(leftNode) - getAngleForNode(rightNode),
      )

      if (sortedNodes.length === 1) {
        const center = clamp(getPreferredPlacementAngle(sortedNodes[0]), leftCenter, rightCenter)
        packedAngleByNodeId.set(sortedNodes[0].data.id, center)
        nodeOrderWithinLevelSegment.set(`${level}|${segmentId}`, [sortedNodes[0].data.id])
        continue
      }

      const centers = buildPreferredCenters(sortedNodes)
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

      // Keep single-child chains close to their parent ray whenever spacing constraints allow it.
      for (let index = 0; index < sortedNodes.length; index += 1) {
        const node = sortedNodes[index]
        const parentChildCount = node.parent?.children?.length ?? 0
        if (parentChildCount !== 1 || !node.parent || node.parent.depth <= 0) {
          continue
        }

        let desired = clamp(getAngleForNode(node.parent), leftCenter, rightCenter)
        if (index > 0) {
          desired = Math.max(desired, centers[index - 1] + centerGap)
        }
        if (index < centers.length - 1) {
          desired = Math.min(desired, centers[index + 1] - centerGap)
        }

        if (desired >= leftCenter && desired <= rightCenter) {
          centers[index] = desired
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

    enforceMonotonicRadii()
  }

  enforceMonotonicRadii()

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
  const recomputedFirstLevelRadius = getRadiusForLevel(firstNodeLevel)
  const recomputedLabelOuterRadius =
    recomputedFirstLevelRadius - levelOneNodeClearancePx - LABEL_LEVEL_ONE_GAP_PX - labelHalfHeight
  segmentLabelRadius = Math.max(
    labelInnerRadius,
    computeLabelBandRadius(labelInnerRadius, recomputedLabelOuterRadius),
  )

  const observedSegmentRangesMap = new Map()

  for (const node of allNodes) {
    const segmentId = getGroupedSegmentId(node.data.segmentId ?? null)

    const angle = getAngleForNode(node)
    const level = getEffectiveLevel(node)
    const radius = getRadiusForLevel(level)
    const halfNodeWithPortalPx = config.nodeSize * 0.5 + additionalDependencyPortalAllowancePx
    const angularHalfSpan = toDegrees(halfNodeWithPortalPx / Math.max(radius, 1))
    const existing = observedSegmentRangesMap.get(segmentId)

    if (!existing) {
      observedSegmentRangesMap.set(segmentId, {
        id: segmentId,
        min: angle - angularHalfSpan,
        max: angle + angularHalfSpan,
      })
      continue
    }

    existing.min = Math.min(existing.min, angle - angularHalfSpan)
    existing.max = Math.max(existing.max, angle + angularHalfSpan)
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
      shortName: node.data.shortName,
      status: node.data.status,
      levels: node.data.levels,
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

  const edgeRouting = buildEdgeRoutingModel({
    root,
    config,
    getEffectiveLevel,
    getAngleForNode,
    getRadiusForLevel,
    getSegmentOrderIndex,
  })

  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const routedLinks = buildRoutedEdgeLinks({
    edgeRouting,
    nodesById,
    origin,
  })

  const levelOneRadius = getRadiusForLevel(1)

  const rootLevelBridges = nodes
    .filter((node) => node.depth === 1 && node.level > 1)
    .map((node) => ({
      id: `root-bridge-${node.id}`,
      linkKind: 'direct',
      sourceDepth: 1,
      sourceId: node.parentId ?? null,
      targetId: node.id,
      path: buildArcRadialPath(centerAngle, levelOneRadius, node.angle, node.radius, origin),
    }))

  const levelOneNodes = nodes
    .filter((node) => node.level === 1)
    .sort((a, b) => a.angle - b.angle)
  const levelOneRingArcs = []
  for (let i = 0; i < levelOneNodes.length - 1; i += 1) {
    const a = levelOneNodes[i]
    const b = levelOneNodes[i + 1]
    const r = a.radius
    levelOneRingArcs.push({
      id: `level1-ring-${a.id}-${b.id}`,
      linkKind: 'ring',
      sourceDepth: 1,
      sourceId: a.id,
      targetId: b.id,
      path: `M ${a.x} ${a.y} A ${r} ${r} 0 0 1 ${b.x} ${b.y}`,
    })
  }

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
    const safeMinAngle = Math.min(leftSafe, rightSafe)
    const safeMaxAngle = Math.max(leftSafe, rightSafe)

    return {
      id: `segment-separator-${segment.id}-${next.id}`,
      leftSegmentId: segment.id,
      rightSegmentId: next.id,
      path: buildSeparatorPathWithDetours({
        baseAngle: angle,
        innerRadius: separatorInnerRadius,
        outerRadius: separatorOuterRadius,
        origin,
        nodes,
        allowedMinAngle: safeMinAngle,
        allowedMaxAngle: safeMaxAngle,
        nodeSize: config.nodeSize,
        angleSafetyDeg: boundarySafetyMarginDeg,
      }),
    }
  })

  const segmentLabels = finalOrderedSegments
    .filter((segment) => !segment.isVirtual)
    .map((segment, index, visibleSegments) => {
      const estimatedLabelWidthPx = getEstimatedSegmentLabelWidthPx(segment.id)
      const angularHalfSpan = toDegrees((estimatedLabelWidthPx * 0.5) / Math.max(segmentLabelRadius, 1))
      const wedgeMin = segment.wedgeMin ?? segment.slotMin ?? segment.anchorAngle
      const wedgeMax = segment.wedgeMax ?? segment.slotMax ?? segment.anchorAngle
      const safeMin = wedgeMin + angularHalfSpan
      const safeMax = wedgeMax - angularHalfSpan
      const isFirstVisible = index === 0
      const isLastVisible = index === visibleSegments.length - 1

      let preferredAnchorAngle
      if (visibleSegments.length > 1 && isFirstVisible) {
        const outerNodeEdge = segment.observedMin ?? wedgeMin
        preferredAnchorAngle = (wedgeMax + outerNodeEdge) / 2
      } else if (visibleSegments.length > 1 && isLastVisible) {
        const outerNodeEdge = segment.observedMax ?? wedgeMax
        preferredAnchorAngle = (wedgeMin + outerNodeEdge) / 2
      } else {
        preferredAnchorAngle = (wedgeMin + wedgeMax) / 2
      }

      const anchorAngle = safeMin <= safeMax
        ? clamp(preferredAnchorAngle, safeMin, safeMax)
        : preferredAnchorAngle
      const point = toCartesian(anchorAngle, segmentLabelRadius, origin)

      return {
        id: `segment-label-${segment.id}`,
        segmentId: segment.id,
        text: segment.label,
        x: point.x,
        y: point.y,
        rotation: getReadableRadialLabelRotation(anchorAngle),
        anchorAngle,
      }
    })

  const layout = {
    nodes,
    links: [...routedLinks, ...rootLevelBridges, ...levelOneRingArcs],
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
      edgeRouting,
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