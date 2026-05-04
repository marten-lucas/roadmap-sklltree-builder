export const toRadians = (angleDeg) => (angleDeg * Math.PI) / 180
export const toDegrees = (angleRad) => (angleRad * 180) / Math.PI
export const centerAngle = -90
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

export const setMapMax = (map, key, value) => {
  const current = map.get(key)
  if (current === undefined || value > current) {
    map.set(key, value)
  }
}

export const toCartesian = (angleDeg, radius, origin) => {
  const radians = (angleDeg * Math.PI) / 180

  return {
    x: origin.x + radius * Math.cos(radians),
    y: origin.y + radius * Math.sin(radians),
  }
}

export const buildRadialEdgePath = (sourceAngle, sourceRadius, targetAngle, targetRadius, origin) => {
  const source = toCartesian(sourceAngle, sourceRadius, origin)
  const target = toCartesian(targetAngle, targetRadius, origin)

  if (sourceRadius < 1 || Math.abs(sourceAngle - targetAngle) < 0.01) {
    return `M ${source.x} ${source.y} L ${target.x} ${target.y}`
  }

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

const shortArcSweep = (fromAngle, toAngle) => {
  const diff = toAngle - fromAngle
  const normalizedDiff = ((diff + 180) % 360 + 360) % 360 - 180
  return normalizedDiff > 0 ? 1 : 0
}

export const buildArcRadialPath = (sourceAngle, sourceRadius, targetAngle, targetRadius, origin) => {
  const source = toCartesian(sourceAngle, sourceRadius, origin)
  const sourceAtTargetAngle = toCartesian(targetAngle, sourceRadius, origin)
  const target = toCartesian(targetAngle, targetRadius, origin)

  const parts = [`M ${source.x} ${source.y}`]

  if (sourceRadius >= 1 && Math.abs(targetAngle - sourceAngle) >= 0.01) {
    const sweep = shortArcSweep(sourceAngle, targetAngle)
    parts.push(`A ${sourceRadius} ${sourceRadius} 0 0 ${sweep} ${sourceAtTargetAngle.x} ${sourceAtTargetAngle.y}`)
  }

  if (Math.abs(targetRadius - sourceRadius) >= 0.01) {
    parts.push(`L ${target.x} ${target.y}`)
  }

  return parts.join(' ')
}

export const buildRadialArcPath = (sourceAngle, sourceRadius, targetAngle, targetRadius, origin) => {
  const source = toCartesian(sourceAngle, sourceRadius, origin)
  const sourceAtTargetAngle = toCartesian(targetAngle, sourceRadius, origin)
  const target = toCartesian(targetAngle, targetRadius, origin)

  const parts = [`M ${source.x} ${source.y}`]

  if (sourceRadius >= 1 && Math.abs(targetAngle - sourceAngle) >= 0.01) {
    const sweep = shortArcSweep(sourceAngle, targetAngle)
    parts.push(`A ${sourceRadius} ${sourceRadius} 0 0 ${sweep} ${sourceAtTargetAngle.x} ${sourceAtTargetAngle.y}`)
  }

  if (Math.abs(targetRadius - sourceRadius) >= 0.01) {
    parts.push(`L ${target.x} ${target.y}`)
  }

  return parts.join(' ')
}

export const getNodePairKey = (leftId, rightId) => [leftId, rightId].sort().join(':')