import { hierarchy, tree } from 'd3-hierarchy'

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
  const radialLayout = tree().size([config.angleSpread, config.maxRadius])
  const laidOut = radialLayout(root)

  // Helper: Get effective level (custom ebene or depth), and find max level for scaling
  const getEffectiveLevel = (node) => {
    if (node.data.ebene !== undefined && node.data.ebene !== null) {
      return node.data.ebene
    }
    return node.depth
  }

  const allNodes = laidOut.descendants().filter((node) => node.depth > 0)
  const maxEffectiveLevel = Math.max(1, Math.max(...allNodes.map(getEffectiveLevel)))

  // Helper: Calculate radius based on effective level
  const getRadiusForLevel = (level) => {
    if (maxEffectiveLevel <= 1) return config.maxRadius * 0.3
    return (level / maxEffectiveLevel) * config.maxRadius
  }

  const nodes = allNodes.map((node) => {
    const centeredAngle = node.x - config.angleSpread / 2 - 90
    const effectiveLevel = getEffectiveLevel(node)
    const radius = getRadiusForLevel(effectiveLevel)
    const point = toCartesian(centeredAngle, radius, config.origin)

    return {
      id: node.data.id,
      label: node.data.label,
      status: node.data.status,
      x: point.x,
      y: point.y,
      parentId: node.parent?.data.id ?? null,
    }
  })

  const links = laidOut.links().map((link) => {
    const sourceAngle = link.source.x - config.angleSpread / 2 - 90
    const targetAngle = link.target.x - config.angleSpread / 2 - 90
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
        config.origin,
      ),
    }
  })

  // Connect all level-1 siblings with a continuous arc along their shared radius.
  const depthOneNodes = laidOut
    .descendants()
    .filter((n) => n.depth === 1)
    .sort((a, b) => a.x - b.x)
  const levelOneRadius = getRadiusForLevel(1)

  const siblingArcs = depthOneNodes.slice(0, -1).map((node, i) => {
    const next = depthOneNodes[i + 1]
    const fromAngle = node.x - config.angleSpread / 2 - 90
    const toAngle = next.x - config.angleSpread / 2 - 90
    const from = toCartesian(fromAngle, levelOneRadius, config.origin)
    const to = toCartesian(toAngle, levelOneRadius, config.origin)
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
      const angle = node.x - config.angleSpread / 2 - 90
      const nodeRadius = getRadiusForLevel(getEffectiveLevel(node))

      if (Math.abs(nodeRadius - levelOneRadius) < 0.01) {
        return null
      }

      const from = toCartesian(angle, levelOneRadius, config.origin)
      const to = toCartesian(angle, nodeRadius, config.origin)

      return {
        id: `bridge-level1-${node.data.id}`,
        sourceDepth: 1,
        path: `M ${from.x} ${from.y} L ${to.x} ${to.y}`,
      }
    })
    .filter(Boolean)

  return { nodes, links: [...links, ...siblingArcs, ...levelOneBridges] }
}
