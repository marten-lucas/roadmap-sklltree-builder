import { toDegrees } from './layoutMath'

const normalizeAngle = (angle) => ((angle % 360) + 360) % 360

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
