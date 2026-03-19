import { hierarchy } from 'd3-hierarchy'

const toRadians = (angleDeg) => (angleDeg * Math.PI) / 180
const toDegrees = (angleRad) => (angleRad * 180) / Math.PI
const centerAngle = -90

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

    return {
      nodes: [],
      links: [],
      segments: {
        separators: [],
        labels: [],
      },
      canvas: {
        width,
        height,
        origin: {
          x: config.horizontalPadding + outerContentRadius,
          y: config.topPadding + outerContentRadius,
        },
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

    const computeSpan = (node) => {
      const children = node.children ?? []

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
        const gap = Math.max(gapByLevel.get(left.level), gapByLevel.get(right.level))
        const distance = (left.span + right.span) / 2 + gap
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

      const children = node.children ?? []
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
        const gap = Math.max(gapByLevel.get(left.level), gapByLevel.get(right.level))
        const distance = (left.span + right.span) / 2 + gap
        distances.push(distance)
      }

      const offsets = computeOffsets(childItems, distances)

      childItems.forEach((child, index) => {
        assignAngles(child.node, angle + offsets[index])
      })
    }

    const rootChildren = root.children ?? []
    rootChildren.forEach((child) => computeSpan(child))
    assignAngles(root, centerAngle)

    const subtreeSpan = rootChildren.length
      ? Math.max(...rootChildren.map((child) => spanByNodeId.get(child.data.id) ?? 0))
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
  const depthOneNodes = root.children ?? []
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

  const explicitSegments = data.segments ?? []
  const segmentLabelById = new Map(explicitSegments.map((segment) => [segment.id, segment.label]))
  const segmentRangesMap = new Map()
  const segmentRootAnglesMap = new Map()

  for (const node of root.children ?? []) {
    const segmentId = node.data.segmentId
    if (!segmentId) {
      continue
    }

    const existingAngles = segmentRootAnglesMap.get(segmentId) ?? []
    existingAngles.push(getAngleForNode(node))
    segmentRootAnglesMap.set(segmentId, existingAngles)
  }

  for (const node of allNodes) {
    const segmentId = node.data.segmentId
    if (!segmentId) {
      continue
    }

    const angle = getAngleForNode(node)
    const existing = segmentRangesMap.get(segmentId)

    if (!existing) {
      segmentRangesMap.set(segmentId, {
        id: segmentId,
        label: segmentLabelById.get(segmentId) ?? segmentId,
        min: angle,
        max: angle,
      })
      continue
    }

    existing.min = Math.min(existing.min, angle)
    existing.max = Math.max(existing.max, angle)
  }

  const segmentRanges = Array.from(segmentRangesMap.values())
    .map((segment) => ({
      ...segment,
      center: (segment.min + segment.max) / 2,
      anchorAngle: (() => {
        const rootAngles = segmentRootAnglesMap.get(segment.id) ?? []

        if (rootAngles.length === 0) {
          return (segment.min + segment.max) / 2
        }

        return rootAngles.reduce((sum, angle) => sum + angle, 0) / rootAngles.length
      })(),
    }))
    .sort((a, b) => a.center - b.center)

  const segmentSeparators = segmentRanges.slice(0, -1).map((segment, index) => {
    const next = segmentRanges[index + 1]
    const angle = (segment.max + next.min) / 2
    const from = toCartesian(angle, separatorInnerRadius, origin)
    const to = toCartesian(angle, separatorOuterRadius, origin)

    return {
      id: `segment-separator-${segment.id}-${next.id}`,
      path: `M ${from.x} ${from.y} L ${to.x} ${to.y}`,
    }
  })

  const segmentLabels = segmentRanges.map((segment) => {
    const point = toCartesian(segment.anchorAngle, segmentLabelRadius, origin)
    let rotation = segment.anchorAngle + 90

    // Keep text readable by flipping labels on the lower half.
    if (rotation > 90 && rotation < 270) {
      rotation += 180
    }

    return {
      id: `segment-label-${segment.id}`,
      text: segment.label,
      x: point.x,
      y: point.y,
      rotation,
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
