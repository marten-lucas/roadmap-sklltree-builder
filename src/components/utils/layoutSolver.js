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
const MIN_SEGMENT_SPREAD_DEG = 52

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
  // Radial orientation: text points along the spoke outward from centre.
  // SVG 0°=right, angles increase clockwise, so a radial label at angle θ
  // needs rotation θ−90 (top of text faces outward).
  // The reading direction becomes inverted when (normalized − 90) lands in
  // (90°, 270°), i.e. when normalized > 180°. Flip those cases by +180° so
  // text is always readable from below (never upside-down).
  const radial = normalized - 90
  if (normalized > 180 && normalized < 360) {
    return radial + 180
  }

  return radial
}

const computeLabelBandRadius = (innerRadius, outerRadius) => {
  const clampedOuter = Math.max(outerRadius, innerRadius)
  const available = Math.max(0, clampedOuter - innerRadius)
  return innerRadius + available * LABEL_RADIUS_OUTER_BIAS
}

const computeSpreadScaleMultiplier = (subtreeSpan, maxAngleSpread) => {
  const safeSpread = Math.max(maxAngleSpread, 1)
  const overflowRatio = subtreeSpan / safeSpread

  if (overflowRatio <= 1) {
    return 1
  }

  // Adaptive damping: strong for extreme overflow, milder for moderate overflow.
  const dampingFactor = overflowRatio >= 1.7 ? 0.4 : 0.48
  const damped = 1 + (overflowRatio - 1) * dampingFactor
  return clamp(damped, 1.03, 1.55)
}

const SEPARATOR_HOMOGENEITY_PROFILES = {
  off: {
    biasFactor: 1,
    useNeighborBias: false,
    useGlobalPass: false,
  },
  balanced: {
    biasFactor: 0.82,
    useNeighborBias: true,
    useGlobalPass: true,
  },
  strong: {
    biasFactor: 0.72,
    useNeighborBias: true,
    useGlobalPass: true,
  },
}

const resolveSeparatorHomogeneityProfile = (profileKey) => {
  const key = String(profileKey ?? 'balanced').trim().toLowerCase()
  return SEPARATOR_HOMOGENEITY_PROFILES[key] ?? SEPARATOR_HOMOGENEITY_PROFILES.balanced
}

const summarizeSeparatorDetours = (separatorResults) => {
  const directions = separatorResults
    .map((separator) => separator.dominantDetourDirection)
    .filter((direction) => direction === 'left' || direction === 'right')
  let directionChanges = 0
  for (let index = 1; index < directions.length; index += 1) {
    if (directions[index] !== directions[index - 1]) {
      directionChanges += 1
    }
  }

  const totalLeftDetours = separatorResults.reduce((sum, separator) => sum + separator.leftDetourCount, 0)
  const totalRightDetours = separatorResults.reduce((sum, separator) => sum + separator.rightDetourCount, 0)
  const totalDetours = totalLeftDetours + totalRightDetours
  const totalDetourDeg = separatorResults.reduce((sum, separator) => sum + separator.totalDetourDeg, 0)
  const dominantDetourDirection =
    totalLeftDetours > totalRightDetours ? 'left' : totalRightDetours > totalLeftDetours ? 'right' : null
  const dominantCount = Math.max(totalLeftDetours, totalRightDetours)
  const consistency = totalDetours > 0 ? dominantCount / totalDetours : 1
  const smoothness = directions.length > 1 ? 1 - directionChanges / (directions.length - 1) : 1
  const meanDetour = totalDetours > 0 ? totalDetourDeg / totalDetours : 0
  const detourEfficiency = 1 / (1 + meanDetour / 20)
  const homogeneityScore = clamp(
    100 * (consistency * 0.5 + smoothness * 0.3 + detourEfficiency * 0.2),
    0,
    100,
  )

  return {
    totalLeftDetours,
    totalRightDetours,
    totalDetours,
    totalDetourDeg,
    directionChanges,
    dominantDetourDirection,
    homogeneityScore,
  }
}

const chooseBetterSeparatorStrategy = ({ baselineSummary, candidateSummary }) => {
  if (candidateSummary.totalDetours === 0 && baselineSummary.totalDetours > 0) {
    return 'candidate'
  }
  if (candidateSummary.directionChanges < baselineSummary.directionChanges) {
    return 'candidate'
  }
  if (candidateSummary.directionChanges > baselineSummary.directionChanges) {
    return 'baseline'
  }
  if (candidateSummary.totalDetourDeg < baselineSummary.totalDetourDeg - 0.1) {
    return 'candidate'
  }
  if (candidateSummary.totalDetourDeg > baselineSummary.totalDetourDeg + 0.1) {
    return 'baseline'
  }
  return candidateSummary.homogeneityScore >= baselineSummary.homogeneityScore ? 'candidate' : 'baseline'
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
  preferredDetourDirection = null,
  detourBiasFactor = 1,
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

  let leftDetourCount = 0
  let rightDetourCount = 0
  let totalDetourDeg = 0

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
    const clampedBias = clamp(detourBiasFactor, 0.6, 1)
    const leftPenalty = preferredDetourDirection === 'left' ? clampedBias : 1
    const rightPenalty = preferredDetourDirection === 'right' ? clampedBias : 1
    const weightedLeftDistance = leftDistance * leftPenalty
    const weightedRightDistance = rightDistance * rightPenalty
    const nextAngle = weightedLeftDistance <= weightedRightDistance ? leftEscape : rightEscape

    if (nextAngle === leftEscape) {
      leftDetourCount += 1
    } else {
      rightDetourCount += 1
    }
    totalDetourDeg += Math.abs(nextAngle - currentAngle)

    addArcSegmentToAngle(nextAngle)

    const exitRadius = clamp(blocker.blockEndRadius, currentRadius, outerRadius)
    addRaySegmentToRadius(exitRadius)
  }

  addRaySegmentToRadius(outerRadius)

  let dominantDetourDirection = null
  if (leftDetourCount > rightDetourCount) {
    dominantDetourDirection = 'left'
  } else if (rightDetourCount > leftDetourCount) {
    dominantDetourDirection = 'right'
  }

  return {
    path: parts.join(' '),
    dominantDetourDirection,
    leftDetourCount,
    rightDetourCount,
    totalDetourDeg,
  }
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
    config,
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
  const getMinimumSegmentWidthDeg = (segmentId, currentRadius, stats) => {
    const segmentStats = stats ?? { count: 0 }
    const labelWidth = toAngleSpan(
      getEstimatedSegmentLabelWidthPx(segmentId) + config.nodeSize * 0.28,
      currentRadius,
    )

    if (segmentStats.count > 0) {
      return Math.max(labelWidth, toAngleSpan(config.nodeSize * 0.9, currentRadius))
    }

    return labelWidth
  }
  const computeAdaptiveSegmentSpread = ({ segmentIds, statsById, radius }) => {
    if (segmentIds.length <= 1) {
      return 0
    }

    const minimumWidthSum = segmentIds.reduce(
      (sum, segmentId) => sum + getMinimumSegmentWidthDeg(segmentId, radius, statsById.get(segmentId)),
      0,
    )
    // Preserve a small global slack budget for visual breathing room while avoiding
    // large unused gaps when the current radius already provides enough angular room.
    const slack = Math.max(10, Math.min(42, (segmentIds.length - 1) * 3.8))
    return clamp(minimumWidthSum + slack, MIN_SEGMENT_SPREAD_DEG, config.maxAngleSpread)
  }
  const computeSegmentSlots = ({ segmentIds, statsById, radius, totalSpread }) => {
    return computeWeightedSegmentSlots({
      segmentIds,
      statsById,
      radius,
      totalSpread,
      centerAngle,
      getMinimumWidth: (segmentId, currentRadius, stats) =>
        getMinimumSegmentWidthDeg(segmentId, currentRadius, stats),
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

      // First smooth with cheap local swaps.
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

      // Then try single-item relocation moves to escape local swap optima.
      for (let from = 0; from < best.length; from += 1) {
        for (let to = 0; to < best.length; to += 1) {
          if (from === to) {
            continue
          }

          const candidate = [...best]
          const [moved] = candidate.splice(from, 1)
          candidate.splice(to, 0, moved)
          const candidateScore = scoreChildOrder(parentNode, candidate)

          if (candidateScore < bestScore - 1e-6) {
            best = candidate
            bestScore = candidateScore
            improved = true
          }
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
      const separatorPath = buildSeparatorPathWithDetours({
        baseAngle: angle,
        innerRadius: separatorInnerRadius,
        outerRadius: separatorOuterRadius,
        origin,
        nodes: [],
        allowedMinAngle: safeMinAngle,
        allowedMaxAngle: safeMaxAngle,
        nodeSize: config.nodeSize,
        angleSafetyDeg: 0,
      })

      return {
        id: `segment-separator-${slot.id}-${next.id}`,
        leftSegmentId: slot.id,
        rightSegmentId: next.id,
        path: separatorPath.path,
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

  const segmentLevelCounts = allHierarchyNodes.reduce((acc, node) => {
    const level = getEffectiveLevel(node)
    const segmentId = getGroupedSegmentId(node.data.segmentId ?? null)
    const key = `${level}|${segmentId}`
    acc.set(key, (acc.get(key) ?? 0) + 1)
    return acc
  }, new Map())

  const maxNodesPerSegmentLevel = Math.max(1, ...segmentLevelCounts.values())
  const denseGapScale =
    maxNodesPerSegmentLevel >= 12 ? 0.84
      : maxNodesPerSegmentLevel >= 8 ? 0.9
        : maxNodesPerSegmentLevel >= 5 ? 0.95
          : 1

  const minimumArcGap = config.nodeSize * config.minArcGapFactor * denseGapScale

  const crossSegmentGapFactor = 2.4

  const sortedLevels = Array.from(levelCounts.keys()).sort((a, b) => a - b)
  const firstNodeLevel = sortedLevels[0] ?? 1
  const maxNodeLevel = sortedLevels[sortedLevels.length - 1] ?? firstNodeLevel
  const depthAlignedLevelCount = allHierarchyNodes.filter((node) => (
    node.data.ebene === node.depth
  )).length
  const depthAlignedLevelCoverage = depthAlignedLevelCount / Math.max(1, allHierarchyNodes.length)
  const shouldCompressDeepTreeSpacing = depthAlignedLevelCoverage < 0.8

  // Phase C: deep trees get a gentle global spacing compression to curb outer-radius growth,
  // but only when levels are not mostly depth-aligned (no-manual-levels variants set ebene=depth).
  const deepTreeSpacingCompression = shouldCompressDeepTreeSpacing
    ? maxNodeLevel >= 14 ? 0.88
      : maxNodeLevel >= 10 ? 0.92
        : maxNodeLevel >= 8 ? 0.96
          : 1
    : 1
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
      const spacing = config.levelSpacing * spacingScale * deepTreeSpacingCompression
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

    if (leftSegmentId === rightSegmentId) {
      return (left.span + right.span) / 2 + baseGap
    }

    const level = Math.max(left.level, right.level)
    const actualRadius = radiusByLevel.get(level) ?? level * config.levelSpacing
    const cappedRadius = Math.min(actualRadius, config.levelSpacing * 3)
    const effectiveCrossSegGap = Math.max(baseGap, toDegrees(minimumArcGap / cappedRadius)) * crossSegmentGapFactor

    return (left.span + right.span) / 2 + effectiveCrossSegGap
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
      const rootSegmentSlotById = new Map(rootSegmentSlots.map((slot) => [slot.id, slot]))

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

      const filledGroupItems = groupItems.filter((item) => item.group.nodes.length > 0)
      const firstFilledItem = filledGroupItems[0] ?? null
      const lastFilledItem = filledGroupItems[filledGroupItems.length - 1] ?? null

      groupItems.forEach((item, index) => {
        const slotCenter = slotCenterBySegmentId.get(item.group.segmentId) ?? centerAngle
        const packedCenter = centerAngle + offsets[index]
        const slot = rootSegmentSlotById.get(item.group.segmentId)

        // Groups whose angular span is much smaller than their assigned slot
        // (e.g. two leaf-level nodes in a wide segment) drift far from the slot
        // centre with a naive 50/50 blend. For the outermost filled groups in a
        // multi-segment tree, also check whether the default formula would leave
        // the group too far from the arc boundary (which opens the top gap beyond
        // 120°). If so, pin the group edge to the arc boundary instead.
        const defaultDesiredCenter = item.group.nodes.length > 0 ? (slotCenter + packedCenter) / 2 : slotCenter
        let desiredCenter = defaultDesiredCenter

        if (
          slot != null &&
          filledGroupItems.length > 1 &&
          item.group.nodes.length > 0 &&
          item.span <= slot.max - slot.min
        ) {
                    if (item === firstFilledItem) {
            const defaultLeftEdge = defaultDesiredCenter - item.span / 2
            const leftGap = defaultLeftEdge - slot.min
            if (leftGap > 0.1) {
              desiredCenter = slot.min + item.span / 2 + 1e-3
            }
          } else if (item === lastFilledItem) {
            const defaultRightEdge = defaultDesiredCenter + item.span / 2
            const rightGap = slot.max - defaultRightEdge
            if (rightGap > 0.1) {
              desiredCenter = slot.max - item.span / 2 - 1e-3
            }
          }
        }

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

  const spreadTargetUpperBound = config.maxAngleSpread * 1.02
  for (let attempt = 0; attempt < 6 && subtreeSpan > spreadTargetUpperBound; attempt += 1) {
    spacingScale *= computeSpreadScaleMultiplier(subtreeSpan, config.maxAngleSpread)
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
          if (!parentId) {
            // Root children have no shared placement anchor – each node keeps its own
            // preferred angle derived from the initial computeAngleLayout placement.
            for (let i = start; i < end; i += 1) {
              preferredCenters.push(clamp(getPreferredPlacementAngle(orderedNodes[i]), leftCenter, rightCenter))
            }
            start = end
            continue
          }
          if (groupSize === 1) {
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

  const visualSegmentSpread = computeAdaptiveSegmentSpread({
    segmentIds: segmentEntries.map((segment) => segment.id),
    statsById: segmentStatsById,
    radius: segmentLabelRadius,
  })
  const visualSegmentSlots = computeSegmentSlots({
    segmentIds: segmentEntries.map((segment) => segment.id),
    statsById: segmentStatsById,
    radius: segmentLabelRadius,
    totalSpread: visualSegmentSpread,
  })
  const visualSegmentSlotById = new Map(visualSegmentSlots.map((slot) => [slot.id, slot]))

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
    // Keep segment geometry (min/max/wedge*) aligned with the layout slots so that
    // nodes placed within those slots are always reported as inside their wedge.
    // The visualSegmentSlots are only used for separator geometry and label anchors
    // via the separate segmentLabels / segmentSeparators computations below.
    return {
      ...segment,
      observedMin: range?.min ?? null,
      observedMax: range?.max ?? null,
    }
  })

  const segmentSpanDegById = new Map(
    finalOrderedSegments.map((segment) => {
      const min = segment.slotMin ?? segment.wedgeMin ?? segment.anchorAngle
      const max = segment.slotMax ?? segment.wedgeMax ?? segment.anchorAngle
      return [segment.id, Math.max(1, max - min)]
    }),
  )
  const getSegmentSpanDeg = (segmentId) => {
    const groupedSegmentId = getGroupedSegmentId(segmentId ?? null)
    return segmentSpanDegById.get(groupedSegmentId) ?? config.maxAngleSpread
  }

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
    getSegmentSpanDeg,
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

  const boundarySafetyMarginPx = config.nodeSize * 0.5 + additionalDependencyPortalAllowancePx
  const boundarySafetyMarginDeg = toDegrees(boundarySafetyMarginPx / Math.max(levelOneRadius, config.levelSpacing))

  const separatorSpecs = finalOrderedSegments.slice(0, -1).map((segment, index) => {
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
      baseAngle: angle,
      safeMinAngle,
      safeMaxAngle,
    }
  })

  const separatorProfile = resolveSeparatorHomogeneityProfile(config.separatorHomogeneityProfile)

  const buildSeparatorSet = ({ globalDirection = null, useNeighborBias = false }) => {
    let runningNeighborDirection = globalDirection

    const results = separatorSpecs.map((separator) => {
      const preferredDirection = useNeighborBias ? runningNeighborDirection : globalDirection
      const separatorPath = buildSeparatorPathWithDetours({
        baseAngle: separator.baseAngle,
        innerRadius: separatorInnerRadius,
        outerRadius: separatorOuterRadius,
        origin,
        nodes,
        allowedMinAngle: separator.safeMinAngle,
        allowedMaxAngle: separator.safeMaxAngle,
        nodeSize: config.nodeSize,
        angleSafetyDeg: boundarySafetyMarginDeg,
        preferredDetourDirection: preferredDirection,
        detourBiasFactor: separatorProfile.biasFactor,
      })

      if (useNeighborBias && separatorPath.dominantDetourDirection) {
        runningNeighborDirection = separatorPath.dominantDetourDirection
      }

      return {
        ...separator,
        path: separatorPath.path,
        dominantDetourDirection: separatorPath.dominantDetourDirection,
        leftDetourCount: separatorPath.leftDetourCount,
        rightDetourCount: separatorPath.rightDetourCount,
        totalDetourDeg: separatorPath.totalDetourDeg,
      }
    })

    return {
      separators: results,
      summary: summarizeSeparatorDetours(results),
    }
  }

  const baselineSeparatorSet = buildSeparatorSet({
    globalDirection: null,
    useNeighborBias: false,
  })
  let selectedSeparatorSet = baselineSeparatorSet
  let selectedSeparatorStrategy = 'baseline'

  if (separatorProfile.useGlobalPass) {
    const candidateSeparatorSet = buildSeparatorSet({
      globalDirection: baselineSeparatorSet.summary.dominantDetourDirection,
      useNeighborBias: separatorProfile.useNeighborBias,
    })

    selectedSeparatorStrategy = chooseBetterSeparatorStrategy({
      baselineSummary: baselineSeparatorSet.summary,
      candidateSummary: candidateSeparatorSet.summary,
    })

    if (selectedSeparatorStrategy === 'candidate') {
      selectedSeparatorSet = candidateSeparatorSet
    }
  }

  const segmentSeparators = selectedSeparatorSet.separators.map((separator) => ({
    id: separator.id,
    leftSegmentId: separator.leftSegmentId,
    rightSegmentId: separator.rightSegmentId,
    path: separator.path,
  }))

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

      const preferredAnchorAngle = (wedgeMin + wedgeMax) / 2

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
      separatorOptimization: {
        profile: String(config.separatorHomogeneityProfile ?? 'balanced').trim().toLowerCase(),
        selectedStrategy: selectedSeparatorStrategy,
        baseline: baselineSeparatorSet.summary,
        selected: selectedSeparatorSet.summary,
      },
    },
  }
}

export const calculateRadialSkillTree = (data, config) => solveSkillTreeLayout(data, config).layout