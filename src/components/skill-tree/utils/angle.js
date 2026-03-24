export const normalizeAngle = (angleDeg) => {
  const normalized = angleDeg % 360
  return normalized < 0 ? normalized + 360 : normalized
}

export const getAngleDelta = (leftDeg, rightDeg) => {
  const delta = normalizeAngle(leftDeg - rightDeg)
  return delta > 180 ? delta - 360 : delta
}

export const isAngleNear = (candidate, blocked, thresholdDeg) => {
  return Math.abs(getAngleDelta(candidate, blocked)) < thresholdDeg
}
