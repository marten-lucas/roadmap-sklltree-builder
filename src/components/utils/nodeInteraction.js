export const getNodeLevelIndexFromPointer = ({
  event,
  nodeSize,
  levelsLength,
  innerRadiusRatio = 0.5,
}) => {
  if (!event?.currentTarget || !Number.isFinite(nodeSize) || !Number.isInteger(levelsLength) || levelsLength <= 0) {
    return null
  }

  const rect = event.currentTarget.getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const dx = event.clientX - cx
  const dy = event.clientY - cy
  const dist = Math.sqrt(dx * dx + dy * dy)

  if (dist < (nodeSize / 2) * innerRadiusRatio) {
    return null
  }

  if (levelsLength === 1) {
    return 0
  }

  const angle = (Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360) % 360
  return Math.min(Math.floor(angle / (360 / levelsLength)), levelsLength - 1)
}

export const isDoubleActivation = (lastTimestamp, now = Date.now(), thresholdMs = 400) => {
  if (!Number.isFinite(lastTimestamp) || !Number.isFinite(now)) {
    return false
  }

  return now - lastTimestamp < thresholdMs
}

export const getPortalCounterpartNodeIdFromData = ({
  nodeId,
  sourceId,
  targetId,
  portalKey = '',
}) => {
  const normalizedNodeId = String(nodeId ?? '')
  const normalizedSourceId = String(sourceId ?? '')
  const normalizedTargetId = String(targetId ?? '')
  const normalizedPortalKey = String(portalKey ?? '')

  if (!normalizedNodeId || !normalizedSourceId || !normalizedTargetId) {
    return null
  }

  if (normalizedNodeId === normalizedSourceId) {
    return normalizedTargetId
  }

  if (normalizedNodeId === normalizedTargetId) {
    return normalizedSourceId
  }

  if (normalizedPortalKey.endsWith(':source')) {
    return normalizedTargetId
  }

  if (normalizedPortalKey.endsWith(':target')) {
    return normalizedSourceId
  }

  return normalizedTargetId
}
