import { hierarchy, tree } from 'd3-hierarchy'

const toCartesian = (angleDeg, radius, origin) => {
  const radians = (angleDeg * Math.PI) / 180

  return {
    x: origin.x + radius * Math.cos(radians),
    y: origin.y + radius * Math.sin(radians),
  }
}

export const calculateRadialSkillTree = (data, config) => {
  const root = hierarchy(data)
  const radialLayout = tree().size([config.angleSpread, config.maxRadius])
  const laidOut = radialLayout(root)

  const nodes = laidOut.descendants().map((node) => {
    // Center the fan around upward direction so depth grows towards the top.
    const centeredAngle = node.x - config.angleSpread / 2 - 90
    const point = toCartesian(centeredAngle, node.y, config.origin)

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
    const source = toCartesian(sourceAngle, link.source.y, config.origin)
    const target = toCartesian(targetAngle, link.target.y, config.origin)

    const controlY = (source.y + target.y) / 2

    return {
      id: `${link.source.data.id}-${link.target.data.id}`,
      path: `M ${source.x} ${source.y} C ${source.x} ${controlY}, ${target.x} ${controlY}, ${target.x} ${target.y}`,
    }
  })

  return { nodes, links }
}
