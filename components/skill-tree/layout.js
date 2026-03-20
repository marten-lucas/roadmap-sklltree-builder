import { hierarchy } from 'd3-hierarchy'

const toRadians = (angleDeg) => (angleDeg * Math.PI) / 180
const toDegrees = (angleRad) => (angleRad * 180) / Math.PI
const centerAngle = -90
const UNASSIGNED_SEGMENT_ID = '__unassigned__'

const toCartesian = (angleDeg, radius, origin) => {
  const radians = (angleDeg * Math.PI) / 180

  return {
    x: origin.x + radius * Math.cos(radians),
    y: origin.y + radius * Math.sin(radians),
  }
}

// Builds a radial edge: straight line outward to targetRadius, then arc along the outer ring.
// This matches the L-shaped style seen in game skill trees (e.g. Jedi Survivor).
const buildRadialEdgePath = (sourceAngle, sourceRadius, targetAngle, targetRadius, origin) => {
  const source = toCartesian(sourceAngle, sourceRadius, origin)
  const target = toCartesian(targetAngle, targetRadius, origin)

  // Pure radial line (same angle or root at origin).
  if (sourceRadius < 1 || Math.abs(sourceAngle - targetAngle) < 0.01) {
    return `M ${source.x} ${source.y} L ${target.x} ${target.y}`
  }

  // Elbow: go radially outward from source to targetRadius at the SOURCE angle,
  // then arc along the outer ring to the target node.
  const elbow = toCartesian(sourceAngle, targetRadius, origin)

  // sweep=1 (CW in SVG) when target angle is larger (rightward in our fan),
  // sweep=0 (CCW) when going leftward — always takes the short arc.
  const sweep = targetAngle > sourceAngle ? 1 : 0

  return [
    `M ${source.x} ${source.y}`,
    `L ${elbow.x} ${elbow.y}`,
    `A ${targetRadius} ${targetRadius} 0 0 ${sweep} ${target.x} ${target.y}`,
  ].join(' ')
}

export const calculateRadialSkillTree = (data, config) => {
  const root = hierarchy(data)
  const explicitSegments = data.segments ?? []
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
    if (!segmentId) {
      return explicitSegments.length
    }

    const index = explicitSegments.findIndex((segment) => segment.id === segmentId)
    return index >= 0 ? index : explicitSegments.length + 1
  }
  const compareNodesBySegment = (left, right) => {
    return getSegmentOrderIndex(left.data.segmentId ?? null) - getSegmentOrderIndex(right.data.segmentId ?? null)
  }
  const getGroupedSegmentId = (segmentId) => segmentId ?? UNASSIGNED_SEGMENT_ID

  // Helper: Get effective level (custom ebene or depth), and find max level for scaling
  const getEffectiveLevel = (node) => {
    if (node.data.ebene !== undefined && node.data.ebene !== null) {
      return node.data.ebene
    }
    return node.depth
  }

  const allHierarchyNodes = root.descendants().filter((node) => node.depth > 0)
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

    return {
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
      const rootChildren = [...(root.children ?? [])].sort(compareNodesBySegment)

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
        ? [...explicitSegments.map((segment) => segment.id), UNASSIGNED_SEGMENT_ID]
        : explicitSegments.map((segment) => segment.id)

      if (orderedSegmentIds.length === 0) {
        return
      }

      const rootGroupGap = (gapByLevel.get(1) ?? toDegrees(minimumArcGap / config.levelSpacing)) * 1.35
      const hasEmptySegmentSlots = orderedSegmentIds.some((segmentId) => !rootGroupsMap.has(segmentId))
      const levelOneRadiusForGroups = radiusByLevel.get(1) ?? config.levelSpacing

      const rootStatsBySegmentId = new Map(
        orderedSegmentIds.map((segmentId) => [segmentId, { count: (rootGroupsMap.get(segmentId)?.nodes.length ?? 0) }]),
      )
      const rootSegmentSpread = Math.min(180, config.maxAngleSpread)
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
      const children = [...(node.children ?? [])].sort(compareNodesBySegment)

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

      const children = [...(node.children ?? [])].sort(compareNodesBySegment)
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

    const rootChildren = [...(root.children ?? [])].sort(compareNodesBySegment)
    rootChildren.forEach((child) => computeSpan(child))
    assignAngles(root, centerAngle)
    alignRootSubtreesToSegments()

    const subtreeSpan = rootChildren.length
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
      subtreeSpan,
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
  const maxRadius = Math.max(config.levelSpacing, ...radiusByLevel.values())

  const getRadiusForLevel = (level) => radiusByLevel.get(level) ?? level * config.levelSpacing
  const getAngleForNode = (node) => angleByNodeId.get(node.data.id) ?? centerAngle
  const separatorInnerRadius = Math.max(config.nodeSize * 0.9, config.levelSpacing * 0.9)
  const separatorOuterRadius = maxRadius + 120
  const segmentLabelRadius = Math.max(
    maxRadius + config.nodeSize * 0.95,
    separatorInnerRadius + config.nodeSize * 0.7,
  )
  const outerContentRadius = Math.max(
    maxRadius + config.nodeSize,
    separatorOuterRadius + config.nodeSize * 0.35,
    segmentLabelRadius + config.nodeSize,
  )
  const svgWidth = outerContentRadius * 2 + config.horizontalPadding * 2
  const svgHeight = outerContentRadius * 2 + config.topPadding + config.bottomPadding
  const origin = {
    x: config.horizontalPadding + outerContentRadius,
    y: config.topPadding + outerContentRadius,
  }

  const nodes = allNodes.map((node) => {
    const centeredAngle = getAngleForNode(node)
    const effectiveLevel = getEffectiveLevel(node)
    const radius = getRadiusForLevel(effectiveLevel)
    const point = toCartesian(centeredAngle, radius, origin)

    return {
      id: node.data.id,
      label: node.data.label,
      status: node.data.status,
      segmentId: node.data.segmentId ?? null,
      depth: node.depth,
      level: effectiveLevel,
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

  // Connect all level-1 siblings with a continuous arc along their shared radius.
  const depthOneNodes = [...(root.children ?? [])]
  depthOneNodes.sort((a, b) => getAngleForNode(a) - getAngleForNode(b))
  const levelOneRadius = getRadiusForLevel(1)

  const siblingArcs = depthOneNodes.slice(0, -1).map((node, i) => {
    const next = depthOneNodes[i + 1]
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

  // If a depth-1 node is moved to another level, draw a radial bridge from level 1.
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

  const segmentRangesMap = new Map()
  const segmentRootAnglesMap = new Map()
  const hasUnassignedNodes = allNodes.some((node) => !node.data.segmentId)

  for (const node of root.children ?? []) {
    const segmentId = getGroupedSegmentId(node.data.segmentId ?? null)

    const existingAngles = segmentRootAnglesMap.get(segmentId) ?? []
    existingAngles.push(getAngleForNode(node))
    segmentRootAnglesMap.set(segmentId, existingAngles)
  }

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

  const segmentEntries = hasUnassignedNodes
    ? [...explicitSegments, { id: UNASSIGNED_SEGMENT_ID, label: null, isVirtual: true }]
    : explicitSegments
  const segmentStatsById = new Map(
    segmentEntries.map((segment) => {
      const range = segmentRangesMap.get(segment.id)
      const count = allNodes.filter((node) => getGroupedSegmentId(node.data.segmentId ?? null) === segment.id).length

      return [segment.id, { count, range }]
    }),
  )
  const segmentSlotSpread = Math.min(180, config.maxAngleSpread)
  const segmentSlots = computeSegmentSlots({
    segmentIds: segmentEntries.map((segment) => segment.id),
    statsById: segmentStatsById,
    radius: segmentLabelRadius,
    totalSpread: segmentSlotSpread,
  })
  const segmentSlotById = new Map(segmentSlots.map((slot) => [slot.id, slot]))

  const orderedSegments = segmentEntries.map((segment, index) => {
    const range = segmentRangesMap.get(segment.id) ?? null
    const rootSegmentAngles = segmentRootAnglesMap.get(segment.id) ?? []
    const slot = segmentSlotById.get(segment.id)
    const populatedAnchorAngle =
      range
        ? Math.max(slot.min + 0.5, Math.min(slot.max - 0.5, (range.min + range.max) / 2))
        : rootSegmentAngles.length > 0
          ? rootSegmentAngles.reduce((sum, angle) => sum + angle, 0) / rootSegmentAngles.length
          : slot.center

    return {
      id: segment.id,
      label: segment.label,
      isVirtual: segment.isVirtual ?? false,
      index,
      min: range?.min ?? null,
      max: range?.max ?? null,
      anchorAngle: populatedAnchorAngle,
      slotMin: slot.min,
      slotMax: slot.max,
      slotCenter: slot.center,
    }
  })

  const boundarySafetyMarginDeg = toDegrees((config.nodeSize * 0.58) / Math.max(levelOneRadius, config.levelSpacing))

  const segmentSeparators = orderedSegments.slice(0, -1).map((segment, index) => {
    const next = orderedSegments[index + 1]
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

  const segmentLabels = orderedSegments
    .filter((segment) => !segment.isVirtual)
    .map((segment) => {
    const point = toCartesian(segment.anchorAngle, segmentLabelRadius, origin)
    let rotation = segment.anchorAngle + 90

    // Keep text readable by flipping labels on the lower half.
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

  return {
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
}
