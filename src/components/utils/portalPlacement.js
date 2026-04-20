import { toDegrees } from './layoutMath'

const normalizeAngle = (angle) => ((angle % 360) + 360) % 360

const getAngleDelta = (left, right) => {
  const delta = normalizeAngle(left - right)
  return delta > 180 ? delta - 360 : delta
}

const isAngleNear = (candidate, blocked, thresholdDeg) => (
  Math.abs(getAngleDelta(candidate, blocked)) < thresholdDeg
)

const buildSlots = (center, step = 20, span = 80) => {
  const slots = [normalizeAngle(center)]
  for (let offset = step; offset <= span; offset += step) {
    slots.push(normalizeAngle(center + offset))
    slots.push(normalizeAngle(center - offset))
  }
  return slots
}

export const pickPortalSlotAngle = ({
  type = 'source',
  inwardAngle = 180,
  blockedDirs = [],
  reservedAngles = [],
  slotStep = 20,
  hemiSpan = 80,
  linkBlock = 26,
  portalSep = 20,
} = {}) => {
  const center = normalizeAngle(type === 'source' ? inwardAngle : inwardAngle + 180)
  const slots = buildSlots(center, slotStep, hemiSpan)

  let bestSlot = slots[0] ?? center
  let bestScore = Number.POSITIVE_INFINITY

  for (const slot of slots) {
    const linkHits = blockedDirs.filter((angle) => isAngleNear(slot, angle, linkBlock)).length
    const portalHits = reservedAngles.filter((angle) => isAngleNear(slot, angle, portalSep)).length

    // Priority order:
    // 1) avoid hierarchy/connection-line collisions,
    // 2) avoid piling portals on top of each other,
    // 3) stay close to the semantic center radial for the given type.
    const score = linkHits * 1_000_000 + portalHits * 10_000 + Math.abs(getAngleDelta(slot, center))

    if (score < bestScore) {
      bestScore = score
      bestSlot = slot
    }
  }

  return normalizeAngle(bestSlot)
}

export const getPreferredPortalCenterAngle = ({ layoutNode, peerNode, canvasOrigin, type = 'source' }) => {
  if (layoutNode && peerNode) {
    const dx = Number(peerNode.x) - Number(layoutNode.x)
    const dy = Number(peerNode.y) - Number(layoutNode.y)
    if (Number.isFinite(dx) && Number.isFinite(dy) && Math.hypot(dx, dy) > 1e-6) {
      return normalizeAngle(toDegrees(Math.atan2(dy, dx)))
    }
  }

  if (!layoutNode || !canvasOrigin) {
    return type === 'source' ? 180 : 0
  }

  const inwardAngle = normalizeAngle(
    toDegrees(Math.atan2(Number(canvasOrigin.y) - Number(layoutNode.y), Number(canvasOrigin.x) - Number(layoutNode.x))),
  )

  return type === 'source' ? inwardAngle : normalizeAngle(inwardAngle + 180)
}

export default getPreferredPortalCenterAngle
