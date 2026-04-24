import { buildLayoutDiagnostics } from './layoutDiagnostics'
import { buildEdgeRoutingModel, buildRoutedEdgeLinks } from './edgeRouter'
import { detectCrossingLinks } from './edgeCrossings'
import { analyzeSegmentLevelFeasibility, buildSegmentLevelGroups } from './layoutFeasibility'
import {
  buildArcRadialPath,
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
const MIN_SEGMENT_SPREAD_DEG = 18

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

const getAbsAngularDelta = (leftAngle, rightAngle) => {
  const left = normalizeAngleDeg(leftAngle)
  const right = normalizeAngleDeg(rightAngle)
  const delta = Math.abs(left - right)
  return Math.min(delta, 360 - delta)
}

const getReadableRadialLabelRotation = (anchorAngleDeg) => {
  const normalized = normalizeAngleDeg(anchorAngleDeg)
  // Keep the label baseline radial, but flip any upside-down orientation so
  // multi-line segment labels stay readable on the top and right-hand wedges.
  let rotation = normalized - 90
  const normalizedRotation = normalizeAngleDeg(rotation)
  if (normalizedRotation > 90 && normalizedRotation < 270) {
    rotation += 180
  }
  return rotation
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

  // Use a while-loop so that after each detour we re-evaluate all blockers
  // from the new (currentAngle, currentRadius). This handles cases where the
  // detour arc ends at an angle that coincides with a different node, or
  // where the radial after a detour would pass through a node that was not
  // blocking the original angle.
  const processedBlockers = new Set()
  const MAX_ITERATIONS = blockers.length * blockers.length + 10
  let iterations = 0

  while (currentRadius < outerRadius - EPSILON && iterations < MAX_ITERATIONS) {
    iterations++

    // Find the closest unprocessed blocker at the current angle and beyond currentRadius.
    let nextBlocker = null
    for (const blocker of blockers) {
      if (processedBlockers.has(blocker)) continue
      if (blocker.blockEndRadius <= currentRadius + EPSILON) continue

      const isAngleBlocked =
        currentAngle >= blocker.angleMin - EPSILON && currentAngle <= blocker.angleMax + EPSILON
      if (!isAngleBlocked) continue

      if (nextBlocker === null || blocker.blockStartRadius < nextBlocker.blockStartRadius) {
        nextBlocker = blocker
      }
    }

    if (nextBlocker === null) {
      // No more blockers on this radial – advance straight to the outer edge.
      break
    }

    const pivotRadius = clamp(nextBlocker.blockStartRadius, currentRadius, outerRadius)
    addRaySegmentToRadius(pivotRadius)

    const leftEscape = clamp(nextBlocker.angleMin - detourPadding, allowedMinAngle, allowedMaxAngle)
    const rightEscape = clamp(nextBlocker.angleMax + detourPadding, allowedMinAngle, allowedMaxAngle)

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

    // Mark this blocker as handled. We do NOT immediately advance past its
    // blockEndRadius because the new angle may run into yet another node
    // between pivotRadius and blockEndRadius — the loop will catch that.
    processedBlockers.add(nextBlocker)
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
      return Math.max(labelWidth, toAngleSpan(config.nodeSize * 1.15, currentRadius))
    }

    return labelWidth
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

  // Level override maps: populated between the first and second layout pass.
  // crossingPromotedLevelById: Phase 2 — child earns +1 ring to open a routing corridor.
  // compactedLevelById:        Phase 3 — fully-portalized node moved to an inner ring.
  // reDemotionLevelById:       Phase 4 — auto-promoted subtree with portalized parent moved
  //                            to lowest free ring in its own segment.
  const crossingPromotedLevelById = new Map()
  const compactedLevelById = new Map()
  const reDemotionLevelById = new Map()

  const getEffectiveLevel = (node) => {
    const id = node.data.id
    // Phase 4 re-demotion takes highest priority (overrides auto-promotion cascade).
    const reDemoted = reDemotionLevelById.get(id)
    if (reDemoted !== undefined) return reDemoted
    // Phase 3 compaction.
    const compacted = compactedLevelById.get(id)
    if (compacted !== undefined) return compacted
    // Phase 2 crossing promotion.
    const crossingPromoted = crossingPromotedLevelById.get(id)
    if (crossingPromoted !== undefined) return crossingPromoted
    // Existing auto-promotion (angular conflict resolution).
    const promoted = autoPromotedLevelById.get(id)
    if (promoted !== undefined) return promoted
    if (node.data.ebene !== undefined && node.data.ebene !== null) return node.data.ebene
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

  // Base levels before any promotion — used as the cap reference for Phase 2.
  const baseLevelById = new Map(
    allHierarchyNodes.map((node) => [
      node.data.id,
      node.data.ebene !== undefined && node.data.ebene !== null ? node.data.ebene : node.depth,
    ]),
  )

  // Accumulate Phase 2/3/4 details for meta reporting.
  const crossingPromotionDetails = []
  const compactionDetails = []
  const reDemotionDetails = []

  // Two-pass layout: first pass detects crossings; if level adjustments are
  // computed, the second pass re-runs with updated effective levels.  At most
  // two full iterations (no feedback loop).
  let pass = null
  for (let _layoutPass = 0; _layoutPass < 2; _layoutPass++) {
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

  const crossSegmentGapFactor = 1.05

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
    const cappedRadius = Math.min(actualRadius, config.levelSpacing * 6)
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

      const rootGroupGap = (gapByLevel.get(1) ?? toDegrees(minimumArcGap / config.levelSpacing)) * 1.0
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

      // Local refinement for root order inside each segment:
      // reorder roots by the barycenter of their immediate children angles.
      // This preserves each segment footprint (same occupied angle slots) but can
      // reduce avoidable crossings for root->child edges.
      const optimizeRootOrderInsideSegments = () => {
        for (const group of rootGroupsMap.values()) {
          if ((group.nodes?.length ?? 0) <= 1) {
            continue
          }

          const rootAnglesSorted = [...group.nodes]
            .map((node) => ({ node, angle: angleByNodeId.get(node.data.id) ?? centerAngle }))
            .sort((left, right) => left.angle - right.angle)
            .map((entry) => entry.angle)

          const childAngleBarycenter = (node) => {
            const children = node.children ?? []
            if (children.length === 0) {
              return angleByNodeId.get(node.data.id) ?? centerAngle
            }

            const childAngles = children
              .map((child) => angleByNodeId.get(child.data.id))
              .filter((angle) => angle != null)

            if (childAngles.length === 0) {
              return angleByNodeId.get(node.data.id) ?? centerAngle
            }

            return childAngles.reduce((sum, angle) => sum + angle, 0) / childAngles.length
          }

          const rootGeometryById = new Map(
            group.nodes.map((node) => [
              node.data.id,
              {
                node,
                rootAngle: angleByNodeId.get(node.data.id) ?? centerAngle,
                childAngles: (node.children ?? [])
                  .map((child) => angleByNodeId.get(child.data.id))
                  .filter((angle) => angle != null),
              },
            ]),
          )

          const barycenterOrder = [...group.nodes]
            .map((node) => ({
              node,
              key: childAngleBarycenter(node),
              currentAngle: angleByNodeId.get(node.data.id) ?? centerAngle,
            }))
            .sort((left, right) => {
              if (Math.abs(left.key - right.key) > 1e-6) {
                return left.key - right.key
              }
              return left.currentAngle - right.currentAngle
            })

          const enumeratePermutations = (nodes) => {
            if (nodes.length > 6) {
              return [nodes]
            }

            const result = []
            const work = [...nodes]

            const permute = (startIndex) => {
              if (startIndex >= work.length - 1) {
                result.push([...work])
                return
              }

              for (let index = startIndex; index < work.length; index += 1) {
                const tmp = work[startIndex]
                work[startIndex] = work[index]
                work[index] = tmp
                permute(startIndex + 1)
                work[index] = work[startIndex]
                work[startIndex] = tmp
              }
            }

            permute(0)
            return result
          }

          const scoreOrder = (orderedNodes) => {
            const assignedAngleByRootId = new Map(
              orderedNodes.map((node, index) => [node.data.id, rootAnglesSorted[index]]),
            )

            const edges = []
            let barycenterPenalty = 0
            for (const node of orderedNodes) {
              const geometry = rootGeometryById.get(node.data.id)
              if (!geometry) {
                continue
              }

              const parentAngle = assignedAngleByRootId.get(node.data.id) ?? geometry.rootAngle
              const delta = parentAngle - geometry.rootAngle
              const children = geometry.childAngles

              if (children.length === 0) {
                edges.push({ rootId: node.data.id, parentAngle, childAngle: parentAngle })
                continue
              }

              const barycenter = children.reduce((sum, angle) => sum + angle, 0) / children.length
              barycenterPenalty += getAbsAngularDelta(parentAngle, barycenter)

              for (const childAngle of children) {
                edges.push({ rootId: node.data.id, parentAngle, childAngle: childAngle + delta })
              }
            }

            let inversionCount = 0
            for (let left = 0; left < edges.length; left += 1) {
              for (let right = left + 1; right < edges.length; right += 1) {
                const a = edges[left]
                const b = edges[right]
                if (a.rootId === b.rootId) {
                  continue
                }

                if ((a.parentAngle < b.parentAngle && a.childAngle > b.childAngle)
                  || (a.parentAngle > b.parentAngle && a.childAngle < b.childAngle)) {
                  inversionCount += 1
                }
              }
            }

            // Prefer orders that keep roots close to their child barycentres.
            // Stable placement is still kept as the last tie-breaker.
            let displacementPenalty = 0
            for (let index = 0; index < orderedNodes.length; index += 1) {
              const currentIndex = group.nodes.indexOf(orderedNodes[index])
              displacementPenalty += Math.abs(currentIndex - index)
            }

            return inversionCount * 1000 + barycenterPenalty * 10 + displacementPenalty
          }

          const candidateOrders = []
          candidateOrders.push(group.nodes)
          candidateOrders.push(barycenterOrder.map((entry) => entry.node))
          candidateOrders.push(...enumeratePermutations(group.nodes))

          let bestOrder = group.nodes
          let bestScore = scoreOrder(bestOrder)

          for (const candidate of candidateOrders) {
            const candidateScore = scoreOrder(candidate)
            if (candidateScore < bestScore) {
              bestScore = candidateScore
              bestOrder = candidate
            }
          }

          const desiredOrder = bestOrder.map((node) => ({ node }))

          desiredOrder.forEach((entry, index) => {
            const currentAngle = angleByNodeId.get(entry.node.data.id) ?? centerAngle
            const targetAngle = rootAnglesSorted[index]
            const delta = targetAngle - currentAngle
            if (Math.abs(delta) > 0.01) {
              shiftSubtreeAngles(entry.node, delta)
            }
          })

          group.nodes = desiredOrder.map((entry) => entry.node)
        }
      }

      optimizeRootOrderInsideSegments()

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

        // Collect only in-segment descendant angles so that cross-segment subtrees
        // (e.g. a KA root node whose child belongs to D&C) do not inflate this
        // group's claimed angular range and push neighbouring groups too far away.
        const inSegmentAngles = []
        const collectInSegAngles = (node) => {
          const nodeSegId = getGroupedSegmentId(node.data.segmentId ?? null)
          if (node.depth > 0 && nodeSegId === segmentId) {
            const a = angleByNodeId.get(node.data.id)
            if (a != null) inSegmentAngles.push(a)
          }
          for (const child of (node.children ?? [])) {
            collectInSegAngles(child)
          }
        }
        group.nodes.forEach((node) => collectInSegAngles(node))

        const nodeHalfAngle = toDegrees(
          config.nodeSize * 0.5 / (radiusByLevel.get(1) ?? config.levelSpacing),
        )
        const min = inSegmentAngles.length > 0
          ? Math.min(...inSegmentAngles) - nodeHalfAngle
          : (angleByNodeId.get(group.nodes[0].data.id) ?? centerAngle)
        const max = inSegmentAngles.length > 0
          ? Math.max(...inSegmentAngles) + nodeHalfAngle
          : (angleByNodeId.get(group.nodes[0].data.id) ?? centerAngle)

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
        // When the tree is dense (many nodes), drift less and stick closer to the packed center
        // to minimize gaps between subtrees. This helps reduce large angular voids in wide segments.
        const blendFactor = filledGroupItems.length > 4 ? 0.88 : 0.5;
        const defaultDesiredCenter = item.group.nodes.length > 0 
          ? (slotCenter * (1 - blendFactor) + packedCenter * blendFactor) 
          : slotCenter;
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

      const getExternalAnchorAngles = (node) => {
        const externalAngles = []

        if (node.parent && node.parent.depth > 0) {
          const parentSegmentId = getGroupedSegmentId(node.parent.data.segmentId ?? null)
          if (parentSegmentId !== segmentId) {
            externalAngles.push(getAngleForNode(node.parent))
          }
        }

        const sameSegmentChildren = []
        const crossSegmentChildren = []
        for (const childNode of node.children ?? []) {
          const childSegmentId = getGroupedSegmentId(childNode.data.segmentId ?? null)
          if (childSegmentId === segmentId) {
            sameSegmentChildren.push(childNode)
          } else {
            crossSegmentChildren.push(childNode)
          }
        }

        if (crossSegmentChildren.length === 1 && sameSegmentChildren.length === 0) {
          externalAngles.push(getAngleForNode(crossSegmentChildren[0]))
        }

        const deps = data.additionalDependencies?.filter((dependency) =>
          dependency.sourceId === node.data.id || dependency.targetId === node.data.id,
        ) ?? []

        for (const dep of deps) {
          const otherId = dep.sourceId === node.data.id ? dep.targetId : dep.sourceId
          const otherNode = allHierarchyNodes.find((candidate) => candidate.data.id === otherId)
          if (!otherNode) {
            continue
          }

          const otherSegmentId = getGroupedSegmentId(otherNode.data.segmentId ?? null)
          if (otherSegmentId !== segmentId) {
            externalAngles.push(getAngleForNode(otherNode))
          }
        }

        return externalAngles
      }

      const getPreferredPlacementAngle = (node) => {
        const baseAngle = node.parent && node.parent.depth > 0
          ? getAngleForNode(node.parent)
          : getAngleForNode(node)
        const externalAngles = getExternalAnchorAngles(node)

        if (externalAngles.length === 0) {
          return baseAngle
        }

        const meanExternal = externalAngles.reduce((sum, angle) => sum + angle, 0) / externalAngles.length
        // Strong bias to close cross-segment hierarchy and dependency gaps while
        // still keeping the node inside its local pack constraints.
        return baseAngle * 0.15 + meanExternal * 0.85
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

      const sortedNodes = [...nodes].sort((leftNode, rightNode) => {
        const lp = getPreferredPlacementAngle(leftNode)
        const rp = getPreferredPlacementAngle(rightNode)
        if (Math.abs(lp - rp) > 0.001) return lp - rp

        // Stable tie-breaker with portal reduction bias:
        // Check if one node has an external dependency pull that wasn't strong enough
        // to change the preferred angle significantly but should affect relative order.
        const getOrderBias = (node) => {
          const externalAngles = getExternalAnchorAngles(node)
          if (externalAngles.length === 0) return 0

          let bias = 0
          for (const externalAngle of externalAngles) {
            // Smaller external angles should move the node toward the segment start,
            // larger angles toward the segment end.
            bias += externalAngle < getAngleForNode(node) ? -1000 : 1000
          }
          return bias
        }
        
        const b1 = getOrderBias(leftNode)
        const b2 = getOrderBias(rightNode)
        if (b1 !== b2) return b1 - b2

        return getAngleForNode(leftNode) - getAngleForNode(rightNode)
      })

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

  // Post-packing nudge: rigidly shift each segment×level pack toward any
  // cross-segment parent angle (or toward a same-segment parent that was itself
  // shifted by this pass).  The pack moves as one unit so node spacing is
  // preserved; the shift is bounded by [leftCenter, rightCenter] so no node
  // leaves its slot.  Processing in level order lets shifts cascade naturally
  // from shallower levels down to deeper ones.
  const allNodeById = new Map(allNodes.map((node) => [node.data.id, node]))
  const postPackNudgeShifts = new Map()
  for (const entry of feasibilityAnalysis.segmentLevelEntries) {
    if (!entry.isFeasible) continue
    const { leftCenter, rightCenter, nodeIds } = entry
    const sortedGroup = nodeIds
      .map((id) => ({ id, node: allNodeById.get(id), angle: packedAngleByNodeId.get(id) ?? centerAngle }))
      .filter(({ node }) => node != null)
      .sort((a, b) => a.angle - b.angle)
    if (sortedGroup.length === 0) continue
    const packMin = sortedGroup[0].angle
    const packMax = sortedGroup[sortedGroup.length - 1].angle
    let netPull = 0
    for (const { id, node } of sortedGroup) {
      // Pull toward cross-segment parent or a same-segment parent that was shifted.
      if (node.parent && node.parent.depth > 0) {
        const parentId = node.parent.data.id
        const parentSegId = getGroupedSegmentId(node.parent.data.segmentId ?? null)
        const parentShift = postPackNudgeShifts.get(parentId) ?? 0
        if (parentSegId !== entry.segmentId || parentShift !== 0) {
          netPull += (packedAngleByNodeId.get(parentId) ?? centerAngle) - (packedAngleByNodeId.get(id) ?? centerAngle)
        }
      }
      // Pull toward cross-segment children so the parent also moves to close the gap.
      for (const childNode of (node.children ?? [])) {
        const childSegId = getGroupedSegmentId(childNode.data.segmentId ?? null)
        if (childSegId !== entry.segmentId) {
          netPull += (packedAngleByNodeId.get(childNode.data.id) ?? centerAngle) - (packedAngleByNodeId.get(id) ?? centerAngle)
        }
      }
    }
    if (netPull === 0) continue
    const shift = netPull > 0
      ? Math.max(0, Math.min(netPull, rightCenter - packMax))
      : Math.min(0, Math.max(netPull, leftCenter - packMin))
    if (Math.abs(shift) < 0.01) continue
    for (const { id } of sortedGroup) {
      const cur = packedAngleByNodeId.get(id) ?? centerAngle
      packedAngleByNodeId.set(id, cur + shift)
      postPackNudgeShifts.set(id, (postPackNudgeShifts.get(id) ?? 0) + shift)
    }
  }

  // ── Post-packing gap compaction ────────────────────────────────────────────
  // Close large angular voids between any consecutive node clusters, whether
  // inter-segment or intra-segment (e.g. two sub-trees of the same segment
  // placed far apart).  All nodes are sorted by angle; edge-to-edge gaps
  // larger than the threshold are closed by shifting the right half leftward.
  //
  // Running AFTER packing ensures measured positions reflect the true final
  // node distribution.  Both `packedAngleByNodeId` and `orderedSegments` are
  // updated in-place so downstream routing passes use consistent values.
  {
    const GAP_COMPACTION_THRESHOLD_DEG = 14
    const GAP_COMPACTION_MIN_DEG = 8

    // 1. Per-node halfSpan (visual footprint in degrees) and segId lookup.
    const nodeSegId = new Map()
    const nodeHalfSpanDeg = new Map()
    for (const node of allNodes) {
      const segId = getGroupedSegmentId(node.data.segmentId ?? null)
      nodeSegId.set(node.data.id, segId)
      const level = getEffectiveLevel(node)
      const radius = getRadiusForLevel(level)
      nodeHalfSpanDeg.set(node.data.id, (config.nodeSize * 0.56 * 180) / (Math.PI * Math.max(radius, 1)))
    }

    // 2. Sort all nodes by current packed angle.
    const sorted = allNodes
      .map((n) => ({ id: n.data.id, angle: packedAngleByNodeId.get(n.data.id) }))
      .filter((e) => e.angle != null)
      .sort((a, b) => a.angle - b.angle)

    if (sorted.length >= 2) {
      let anyCompaction = false

      // 3. Right-to-left: close edge-to-edge gaps > threshold.
      for (let i = sorted.length - 1; i >= 1; i--) {
        const leftEdge  = sorted[i - 1].angle + (nodeHalfSpanDeg.get(sorted[i - 1].id) ?? 0)
        const rightEdge = sorted[i].angle     - (nodeHalfSpanDeg.get(sorted[i].id)     ?? 0)
        const gap = rightEdge - leftEdge
        if (gap <= GAP_COMPACTION_THRESHOLD_DEG) continue
        const shift = gap - GAP_COMPACTION_MIN_DEG
        anyCompaction = true
        for (let j = i; j < sorted.length; j++) {
          sorted[j].angle -= shift
          packedAngleByNodeId.set(sorted[j].id, sorted[j].angle)
        }
      }

      if (anyCompaction) {
        // 4. Recompute per-segment extents from the new node positions.
        const segExtent = new Map()
        for (const e of sorted) {
          const segId   = nodeSegId.get(e.id)
          const halfSpan = nodeHalfSpanDeg.get(e.id) ?? 0
          const ext = segExtent.get(segId)
          if (!ext) {
            segExtent.set(segId, { min: e.angle - halfSpan, max: e.angle + halfSpan })
          } else {
            if (e.angle - halfSpan < ext.min) ext.min = e.angle - halfSpan
            if (e.angle + halfSpan > ext.max) ext.max = e.angle + halfSpan
          }
        }

        // 5. Stitch orderedSegments wedge/slot boundaries using midpoints between
        //    adjacent extents in angular order.  Objects in segsByNewAngle are the
        //    same references as in orderedSegments, so mutations propagate.
        const segsByNewAngle = [...orderedSegments]
          .filter((s) => segExtent.has(s.id))
          .sort((a, b) => segExtent.get(a.id).min - segExtent.get(b.id).min)

        for (let i = 0; i < segsByNewAngle.length - 1; i++) {
          const leftSeg  = segsByNewAngle[i]
          const rightSeg = segsByNewAngle[i + 1]
          const boundary = (segExtent.get(leftSeg.id).max + segExtent.get(rightSeg.id).min) / 2

          leftSeg.wedgeMax    = leftSeg.slotMax     = leftSeg.max        = boundary
          leftSeg.slotCenter  = leftSeg.wedgeCenter = leftSeg.anchorAngle = (leftSeg.wedgeMin + boundary) / 2

          rightSeg.wedgeMin   = rightSeg.slotMin    = rightSeg.min       = boundary
          rightSeg.slotCenter = rightSeg.wedgeCenter = rightSeg.anchorAngle = (boundary + rightSeg.wedgeMax) / 2
        }

        // 6. Tighten the rightmost segment's outer boundary to its actual extent.
        const lastSeg = segsByNewAngle[segsByNewAngle.length - 1]
        const lastExt = segExtent.get(lastSeg.id)
        if (lastExt && lastSeg.wedgeMax > lastExt.max) {
          lastSeg.wedgeMax    = lastSeg.slotMax     = lastSeg.max        = lastExt.max
          lastSeg.slotCenter  = lastSeg.wedgeCenter = lastSeg.anchorAngle = (lastSeg.wedgeMin + lastExt.max) / 2
        }
      }
    }
  }

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

  // ── Late root refinement: crossing-aware adjacent swaps ───────────────────
  // After all packing/compaction, run a small local search over adjacent root
  // nodes inside the same segment. Keep swaps only when they reduce detected
  // portals (with extra weight on root->child portals).
  {
    const scoreOrigin = { x: 0, y: 0 }
    const shiftSubtreePackedAngles = (hierarchyNode, delta) => {
      if (!hierarchyNode || Math.abs(delta) < 1e-6) {
        return
      }

      if (hierarchyNode.depth > 0) {
        const id = hierarchyNode.data.id
        const currentAngle = packedAngleByNodeId.get(id) ?? centerAngle
        packedAngleByNodeId.set(id, currentAngle + delta)
      }

      for (const child of hierarchyNode.children ?? []) {
        shiftSubtreePackedAngles(child, delta)
      }
    }

    const evaluateCurrentRootOrderScore = () => {
      const getAbsAngularDelta = (leftAngle, rightAngle) => {
        const left = normalizeAngleDeg(leftAngle)
        const right = normalizeAngleDeg(rightAngle)
        const delta = Math.abs(left - right)
        return Math.min(delta, 360 - delta)
      }

      const evaluationNodes = allNodes.map((node) => {
        const angle = getAngleForNode(node)
        const level = getEffectiveLevel(node)
        const radius = getRadiusForLevel(level)
        const point = toCartesian(angle, radius, scoreOrigin)

        return {
          id: node.data.id,
          segmentId: node.data.segmentId ?? null,
          depth: node.depth,
          level,
          angle,
          radius,
          x: point.x,
          y: point.y,
          parentId: node.parent?.data.id ?? null,
        }
      })

      const evaluationNodeById = new Map(evaluationNodes.map((node) => [node.id, node]))
      const evaluationEdgeRouting = buildEdgeRoutingModel({
        root,
        config,
        getEffectiveLevel,
        getAngleForNode,
        getRadiusForLevel,
        getSegmentOrderIndex,
        getSegmentSpanDeg,
      })
      const routedLinks = buildRoutedEdgeLinks({
        edgeRouting: evaluationEdgeRouting,
        nodesById: evaluationNodeById,
        origin: scoreOrigin,
        nodeSize: config.nodeSize,
        getSegmentOrderIndex,
      })

      const levelOneRadiusForEvaluation = getRadiusForLevel(1)
      const rootLevelBridges = evaluationNodes
        .filter((node) => node.depth === 1 && node.level > 1)
        .map((node) => ({
          id: `root-bridge-${node.id}`,
          linkKind: 'direct',
          sourceDepth: 1,
          sourceId: node.parentId ?? null,
          targetId: node.id,
          path: buildArcRadialPath(centerAngle, levelOneRadiusForEvaluation, node.angle, node.radius, scoreOrigin),
        }))

      const levelOneNodesForEvaluation = evaluationNodes
        .filter((node) => node.level === 1)
        .sort((left, right) => left.angle - right.angle)
      const levelOneRingArcs = []
      for (let index = 0; index < levelOneNodesForEvaluation.length - 1; index += 1) {
        const left = levelOneNodesForEvaluation[index]
        const right = levelOneNodesForEvaluation[index + 1]
        const radius = left.radius
        levelOneRingArcs.push({
          id: `level1-ring-${left.id}-${right.id}`,
          linkKind: 'ring',
          sourceDepth: 1,
          sourceId: left.id,
          targetId: right.id,
          path: `M ${left.x} ${left.y} A ${radius} ${radius} 0 0 1 ${right.x} ${right.y}`,
        })
      }

      const evaluationLinks = [...routedLinks, ...rootLevelBridges, ...levelOneRingArcs]
      const portalIds = detectCrossingLinks(evaluationLinks, {
        nodes: evaluationNodes,
        nodeSize: config.nodeSize,
      })

      let rootPortalCount = 0
      let rootAngularPenalty = 0
      for (const link of evaluationLinks) {
        if ((link.linkKind === 'direct' || link.linkKind === 'routed') && (link.sourceDepth ?? 0) === 1) {
          const source = evaluationNodeById.get(link.sourceId)
          const target = evaluationNodeById.get(link.targetId)
          if (source && target) {
            rootAngularPenalty += getAbsAngularDelta(source.angle, target.angle)
          }

          if (portalIds.has(link.id)) {
            rootPortalCount += 1
          }
        }
      }

      return {
        totalPortalCount: portalIds.size,
        rootPortalCount,
        rootAngularPenalty,
        score: portalIds.size * 10000 + rootPortalCount * 100 + rootAngularPenalty,
      }
    }

    const rootChildren = [...(root.children ?? [])]
    if (rootChildren.length > 1) {
      let best = evaluateCurrentRootOrderScore()
      let improved = true
      let safety = 0

      while (improved && safety < 40) {
        improved = false
        safety += 1

        const orderedRoots = [...rootChildren].sort(
          (left, right) => (packedAngleByNodeId.get(left.data.id) ?? centerAngle) - (packedAngleByNodeId.get(right.data.id) ?? centerAngle),
        )

        for (let index = 0; index < orderedRoots.length; index += 1) {
          const leftRoot = orderedRoots[index]
          const rightRoot = orderedRoots[(index + 1) % orderedRoots.length]
          
          // Try swapping adjacent roots globally (across segments) to further reduce portals
          const leftAngle = packedAngleByNodeId.get(leftRoot.data.id) ?? centerAngle
          let rightAngle = packedAngleByNodeId.get(rightRoot.data.id) ?? centerAngle

          // Wrap around handle
          if (index === orderedRoots.length - 1) {
            rightAngle += 360
          }

          shiftSubtreePackedAngles(leftRoot, rightAngle - leftAngle)
          shiftSubtreePackedAngles(rightRoot, leftAngle - rightAngle)

          const candidate = evaluateCurrentRootOrderScore()

          // Heuristic: Prefer configurations with fewer portals.
          // If portals are equal, prefer those with lower root-angular-penalty (straighter root-child connections).
          // We also include the total score (which includes homogeneity) as a final tie breaker.
          let isBetter = false
          if (candidate.totalPortalCount < best.totalPortalCount) {
            isBetter = true
          } else if (candidate.totalPortalCount === best.totalPortalCount) {
            if (candidate.rootPortalCount < best.rootPortalCount) {
              isBetter = true
            } else if (candidate.rootPortalCount === best.rootPortalCount) {
              if (candidate.rootAngularPenalty < best.rootAngularPenalty - 0.1) {
                isBetter = true
              } else if (Math.abs(candidate.rootAngularPenalty - best.rootAngularPenalty) < 0.1) {
                if (candidate.score < best.score - 1e-6) {
                  isBetter = true
                }
              }
            }
          }

          if (isBetter) {
            best = candidate
            improved = true
            
            // Apply normalization to keep angles in check after swap
            if (index === orderedRoots.length - 1) {
              shiftSubtreePackedAngles(rightRoot, 360)
            }
            break
          }

          // Revert when not better.
          shiftSubtreePackedAngles(leftRoot, leftAngle - rightAngle)
          shiftSubtreePackedAngles(rightRoot, rightAngle - leftAngle)
        }
      }
    }
  }

  // Keep enough outer radius so controls anchored beyond segment labels stay inside the SVG.
  // This is especially important when there are no segments yet and the "add segment" button
  // sits at ~1.32x segmentLabelRadius.
  const emptySegmentAddControlRadius = finalOrderedSegments.length === 0
    ? segmentLabelRadius * 1.32 + config.nodeSize * 0.5
    : 0

  const outerContentRadius = Math.max(
    maxRadius + config.nodeSize,
    separatorOuterRadius + config.nodeSize * 0.35,
    segmentLabelRadius + config.nodeSize,
    emptySegmentAddControlRadius,
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
    nodeSize: config.nodeSize,
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
    .map((segment) => {
      const estimatedLabelWidthPx = getEstimatedSegmentLabelWidthPx(segment.id)
      const angularHalfSpan = toDegrees((estimatedLabelWidthPx * 0.5) / Math.max(segmentLabelRadius, 1))
      const wedgeMin = segment.wedgeMin ?? segment.slotMin ?? segment.anchorAngle
      const wedgeMax = segment.wedgeMax ?? segment.slotMax ?? segment.anchorAngle
      const safeMin = wedgeMin + angularHalfSpan
      const safeMax = wedgeMax - angularHalfSpan
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

    const allLinks = [...routedLinks, ...rootLevelBridges, ...levelOneRingArcs]

    // Stash all values produced this iteration so they are accessible after the loop.
    pass = {
      nodes,
      allLinks,
      finalOrderedSegments,
      subtreeSpan,
      capacityIssues,
      nodeOrderWithinLevelSegment,
      edgeRouting,
      feasibilityAnalysis,
      nodeAngularWidthPx,
      nodeBoundaryMarginPx,
      minimumArcGap,
      selectedSeparatorStrategy,
      baselineSeparatorSet,
      selectedSeparatorSet,
      segmentSeparators,
      segmentLabels,
      svgWidth,
      svgHeight,
      origin,
      maxRadius,
    }

    // ── Phase 2 & 3: crossing-aware level adjustments (first pass only) ──────
    if (_layoutPass === 0) {
      const firstCrossingIds = detectCrossingLinks(pass.allLinks, { nodes: pass.nodes, nodeSize: config.nodeSize })

      // No crossings → first pass is already final; skip second pass.
      if (firstCrossingIds.size === 0) break

      const firstPassNodesById = new Map(pass.nodes.map((n) => [n.id, n]))

      // Returns true when the node still has at least one non-portalized hierarchy edge.
      const hasAnyLineConnections = (nodeId) =>
        pass.allLinks.some(
          (l) =>
            (l.sourceId === nodeId || l.targetId === nodeId) &&
            (l.linkKind === 'direct' || l.linkKind === 'routed') &&
            !firstCrossingIds.has(l.id),
        )

      for (const link of pass.allLinks) {
        if (link.linkKind !== 'direct' && link.linkKind !== 'routed') continue
        if (!firstCrossingIds.has(link.id)) continue

        const parentNode = firstPassNodesById.get(link.sourceId)
        const childNode = firstPassNodesById.get(link.targetId)
        if (!parentNode || !childNode) continue

        // One adjustment per node — the first crossing that involves it wins.
        if (crossingPromotedLevelById.has(link.targetId) || compactedLevelById.has(link.targetId)) continue

        const gap = childNode.level - parentNode.level
        const childHasLineChildren = pass.allLinks.some(
          (l) =>
            l.sourceId === link.targetId &&
            (l.linkKind === 'direct' || l.linkKind === 'routed') &&
            !firstCrossingIds.has(l.id),
        )

        if (gap <= 1 && childHasLineChildren) {
          // Phase 2: push child one ring outward to open a routing corridor.
          // Hard cap: base level + 4 (shared ceiling with auto-promotion budget).
          const currentLevel = childNode.level
          const baseLevel = baseLevelById.get(link.targetId) ?? currentLevel
          const newLevel = currentLevel + 1
          const wouldBreakChildOutwardInvariant = pass.allLinks.some((childLink) => {
            if (childLink.sourceId !== link.targetId) return false
            if (childLink.linkKind !== 'direct' && childLink.linkKind !== 'routed') return false
            if (firstCrossingIds.has(childLink.id)) return false

            const grandChildNode = firstPassNodesById.get(childLink.targetId)
            if (!grandChildNode) return false

            return grandChildNode.level <= newLevel
          })

          if (newLevel <= baseLevel + 4) {
            if (!wouldBreakChildOutwardInvariant) {
              crossingPromotedLevelById.set(link.targetId, newLevel)
              crossingPromotionDetails.push({ childId: link.targetId, parentId: link.sourceId, fromLevel: currentLevel, toLevel: newLevel, gap })
            }
          }
        } else if (!hasAnyLineConnections(link.targetId)) {
          // Phase 3: node is fully portalized — compact to an inner ring.
          // Keep hierarchy edges outward: compaction may move a far-away node inward,
          // but never onto or inside the parent ring.
          const compactedLevel = Math.max(parentNode.level + 1, 1)
          if (compactedLevel < childNode.level) {
            compactedLevelById.set(link.targetId, compactedLevel)
            compactionDetails.push({ nodeId: link.targetId, parentId: link.sourceId, fromLevel: childNode.level, toLevel: compactedLevel })
          }
        }
        // gap > 1 AND childHasLineChildren: geometrically unsolvable — stays a portal,
        // no level change.
      }

      // Phase 4: Re-root portalized-parent subtrees to lowest free ring in segment.
      // Applies when a node was auto-promoted solely because its parent is in a distant
      // segment, but that parent→child edge is now portalized anyway.  With the line
      // connection gone, the auto-promotion overhead is wasted — compact the whole subtree
      // to the first ring not already occupied by other nodes in the same segment.
      //
      // Preconditions (over the same `link` loop variable):
      //   • parent→child edge is crossing (portalized)
      //   • child was auto-promoted (cross-segment ring inflation)
      //   • child not already adjusted by Phase 2 or 3
      const subtreeNodeIds = (startHNode) => {
        const ids = new Set([startHNode.data.id])
        const queue = [...(startHNode.children ?? [])]
        while (queue.length > 0) {
          const hn = queue.shift()
          ids.add(hn.data.id)
          queue.push(...(hn.children ?? []))
        }
        return ids
      }
      const hierarchyNodeById = new Map(allHierarchyNodes.map((hn) => [hn.data.id, hn]))

      for (const link of pass.allLinks) {
        if (link.linkKind !== 'direct' && link.linkKind !== 'routed') continue
        if (!firstCrossingIds.has(link.id)) continue
        if (!autoPromotedLevelById.has(link.targetId)) continue
        if (crossingPromotedLevelById.has(link.targetId) || compactedLevelById.has(link.targetId)) continue
        if (reDemotionLevelById.has(link.targetId)) continue // first portalized edge wins

        const childNode = firstPassNodesById.get(link.targetId)
        if (!childNode) continue
        const childHierarchyNode = hierarchyNodeById.get(link.targetId)
        if (!childHierarchyNode) continue

        const subtreeIds = subtreeNodeIds(childHierarchyNode)
        const childSegId = getGroupedSegmentId(childNode.segmentId ?? null)

        // Levels occupied in the same segment by nodes outside the subtree.
        const occupiedInSegment = new Set()
        for (const n of pass.nodes) {
          if (subtreeIds.has(n.id)) continue
          if (getGroupedSegmentId(n.segmentId ?? null) !== childSegId) continue
          occupiedInSegment.add(n.level)
        }

        // First ring (counting from 1) not occupued by any other segment node.
        let lowestFree = 1
        while (occupiedInSegment.has(lowestFree)) lowestFree++

        const delta = lowestFree - childNode.level
        if (delta >= 0) continue // already at or inside lowest free ring — nothing to do

        // Apply the same delta to child and every descendant (preserves internal spacing).
        for (const id of subtreeIds) {
          const n = firstPassNodesById.get(id)
          if (n) reDemotionLevelById.set(id, n.level + delta)
        }
        reDemotionDetails.push({
          nodeId: link.targetId,
          parentId: link.sourceId,
          fromLevel: childNode.level,
          toLevel: lowestFree,
        })
      }

      // No adjustments computed → first pass is already optimal; skip second pass.
      if (crossingPromotedLevelById.size === 0 && compactedLevelById.size === 0 && reDemotionLevelById.size === 0) break
    }
  } // end two-pass layout loop

  // ── Final crossing detection (definitive portals) ─────────────────────────
  const crossingPortalIds = detectCrossingLinks(pass.allLinks, { nodes: pass.nodes, nodeSize: config.nodeSize })

  // Compacted edges (Phase 3) are definitively non-routable: force them to
  // always be portals regardless of whether the second-pass path happens to
  // avoid geometric crossings.
  for (const { nodeId, parentId } of compactionDetails) {
    const edge = pass.allLinks.find((l) => l.targetId === nodeId && l.sourceId === parentId)
    if (edge) crossingPortalIds.add(edge.id)
  }

  const crossingEdges = pass.allLinks
    .filter((l) => crossingPortalIds.has(l.id))
    .map((l) => ({ id: l.id, parentId: l.sourceId, childId: l.targetId }))

  const layout = {
    nodes: pass.nodes,
    links: pass.allLinks.filter((l) => !crossingPortalIds.has(l.id)),
    crossingEdges,
    segments: {
      separators: pass.segmentSeparators,
      labels: pass.segmentLabels,
    },
    canvas: {
      width: pass.svgWidth,
      height: pass.svgHeight,
      origin: pass.origin,
      maxRadius: pass.maxRadius,
    },
    rootOrder: optimizedSegmentIds,
  }

  const computedLevelByNodeId = new Map(pass.nodes.map((node) => [node.id, node.level]))

  return {
    layout,
    diagnostics: buildLayoutDiagnostics({
      nodes: pass.nodes,
      orderedSegments: pass.finalOrderedSegments,
      config,
      subtreeSpan: pass.subtreeSpan,
      additionalIssues: pass.capacityIssues,
    }),
    meta: {
      orderedSegments: pass.finalOrderedSegments,
      subtreeSpan: pass.subtreeSpan,
      autoPromotedLevelById,
      promotedByConflict: [...promotedByConflict.values()],
      edgePromotionDetails,
      computedLevelByNodeId,
      nodeOrderWithinLevelSegment: pass.nodeOrderWithinLevelSegment,
      segmentOrder: optimizedSegmentIds,
      edgeRouting: pass.edgeRouting,
      feasibility: {
        isFeasible: pass.feasibilityAnalysis.isFeasible,
        nodeAngularWidthPx: pass.nodeAngularWidthPx,
        nodeBoundaryMarginPx: pass.nodeBoundaryMarginPx,
        minimumArcGapPx: pass.minimumArcGap,
        segmentLevelEntries: pass.feasibilityAnalysis.segmentLevelEntries,
      },
      capacityIssues: pass.capacityIssues,
      separatorOptimization: {
        profile: String(config.separatorHomogeneityProfile ?? 'balanced').trim().toLowerCase(),
        selectedStrategy: pass.selectedSeparatorStrategy,
        baseline: pass.baselineSeparatorSet.summary,
        selected: pass.selectedSeparatorSet.summary,
      },
      crossingPromotionDetails,
      compactionDetails,
      reDemotionDetails,
    },
  }
}

export const calculateRadialSkillTree = (data, config) => solveSkillTreeLayout(data, config).layout