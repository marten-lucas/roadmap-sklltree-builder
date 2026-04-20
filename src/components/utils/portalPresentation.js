export const getPortalViewModel = ({
  portal,
  nodeX,
  nodeY,
  nodeSize,
  minimalNodeSize = 36,
  labelMode = 'far',
  currentZoomScale = 1,
}) => {
  const CHEVRON_SPACING = 7
  const CHEVRON_HALF_OPEN = 25 * (Math.PI / 180)

  const buildPortalSocketPath = (size) => {
    const radius = size * 0.5
    return `M 0 ${-radius} A ${radius} ${radius} 0 0 1 0 ${radius}`
  }

  const buildPortalPlugPath = (width, height, tipLength) => {
    const halfH = height * 0.5
    const bodyStart = -width * 0.5
    const bodyEnd = width * 0.5 - tipLength
    return [
      `M ${bodyStart} ${-halfH}`,
      `L ${bodyEnd} ${-halfH}`,
      `L ${width * 0.5} 0`,
      `L ${bodyEnd} ${halfH}`,
      `L ${bodyStart} ${halfH}`,
      'Z',
    ].join(' ')
  }

  const chevronArm = (lineWidth) => (lineWidth * 0.44) / Math.sin(CHEVRON_HALF_OPEN)

  const buildChevronPath = (samples, armLen, halfOpen, reverseDir = false) => {
    if (!Array.isArray(samples) || samples.length === 0) return ''
    const parts = []
    for (const { x, y, angle } of samples) {
      const dir = reverseDir ? angle + Math.PI : angle
      const a1 = dir + Math.PI + halfOpen
      const a2 = dir + Math.PI - halfOpen
      const ax1 = (x + armLen * Math.cos(a1)).toFixed(2)
      const ay1 = (y + armLen * Math.sin(a1)).toFixed(2)
      const ax2 = (x + armLen * Math.cos(a2)).toFixed(2)
      const ay2 = (y + armLen * Math.sin(a2)).toFixed(2)
      parts.push(`M${ax1},${ay1} L${x.toFixed(2)},${y.toFixed(2)} L${ax2},${ay2}`)
    }
    return parts.join(' ')
  }

  const splitPortalLabel = (value) => {
    const raw = String(value ?? '')
    const dotIdx = raw.indexOf('\u00B7')
    return {
      labelName: dotIdx >= 0 ? raw.slice(0, dotIdx) : raw,
      labelLevel: dotIdx >= 0 ? raw.slice(dotIdx + 1) : null,
    }
  }

  const isFiniteNumber = (value) => Number.isFinite(value) && !Number.isNaN(value)
  const type = portal?.type === 'target' ? 'target' : 'source'
  const otherLabel = String(portal?.otherLabel ?? '')
  const { labelName, labelLevel } = splitPortalLabel(otherLabel)
  const effectiveNodeSize = portal?.isMinimal ? minimalNodeSize : nodeSize
  const safeNodeSize = isFiniteNumber(effectiveNodeSize) && effectiveNodeSize > 0 ? effectiveNodeSize : 1
  const angle = Number.parseFloat(String(portal?.angle ?? '0'))
  const angleRad = (Number.isFinite(angle) ? angle : 0) * Math.PI / 180
  const derivedOrbit = Math.hypot((Number(portal?.x) || 0) - nodeX, (Number(portal?.y) || 0) - nodeY)
  const orbitRatio = Number.parseFloat(String(portal?.orbitRatio ?? ''))
  const safeOrbitRatio = Number.isFinite(orbitRatio) && orbitRatio > 0 ? orbitRatio : (derivedOrbit > 0 ? derivedOrbit / safeNodeSize : 0.74)
  const orbit = safeOrbitRatio * safeNodeSize
  const portalX = nodeX + Math.cos(angleRad) * orbit
  const portalY = nodeY + Math.sin(angleRad) * orbit
  const halfSize = safeNodeSize / 2
  const boundaryRadius = labelMode === 'very-close'
    ? halfSize / Math.max(Math.abs(Math.cos(angleRad)), Math.abs(Math.sin(angleRad)))
    : halfSize
  const bxLocal = (nodeX + Math.cos(angleRad) * boundaryRadius) - portalX
  const byLocal = (nodeY + Math.sin(angleRad) * boundaryRadius) - portalY
  const spokeLen = Math.sqrt(bxLocal * bxLocal + byLocal * byLocal)
  const ext = (labelMode === 'very-close' && !portal?.isMinimal)
    ? halfSize * (1 / Math.max(Math.abs(Math.cos(angleRad)), Math.abs(Math.sin(angleRad))) - 1)
    : 0
  const extTipX = spokeLen > 0 ? (-bxLocal / spokeLen) * ext : 0
  const extTipY = spokeLen > 0 ? (-byLocal / spokeLen) * ext : 0
  const spokeDx = extTipX - bxLocal
  const spokeDy = extTipY - byLocal
  const spokeDist = Math.sqrt(spokeDx * spokeDx + spokeDy * spokeDy)
  const spokeLinePath = `M${bxLocal.toFixed(2)},${byLocal.toFixed(2)} L${extTipX.toFixed(2)},${extTipY.toFixed(2)}`
  const spokeTangent = spokeDist > 0 ? Math.atan2(spokeDy, spokeDx) : 0
  const spokeSamples = []

  if (spokeDist > CHEVRON_SPACING * 0.5) {
    const n = Math.floor(spokeDist / CHEVRON_SPACING)
    for (let ci = 1; ci <= n; ci++) {
      const t = (ci * CHEVRON_SPACING) / spokeDist
      if (t < 1) {
        spokeSamples.push({ x: bxLocal + spokeDx * t, y: byLocal + spokeDy * t, angle: spokeTangent })
      }
    }
  }

  const spokeChevronD = buildChevronPath(spokeSamples, chevronArm(3), CHEVRON_HALF_OPEN, type === 'source')
  const zoomSafe = Math.max(0.35, currentZoomScale)
  const hitScale = Math.max(1, Math.min(2.4, 1 / zoomSafe))
  const baseHitRadius = portal?.isMinimal ? 24 : 28
  const baseHoverStrokeWidth = portal?.isMinimal ? 20 : 24
  const portalHitRadius = Math.max(18, Math.min(72, baseHitRadius * hitScale))
  const portalHoverStrokeWidth = Math.max(14, Math.min(64, baseHoverStrokeWidth * hitScale))
  const portalHitWidth = Math.max(portalHitRadius, Math.min(88, (Math.max(labelName.length, 2) * 6 + 10) * hitScale))
  const portalHitHeight = Math.max(portalHitRadius * 0.72, Math.min(42, (portal?.isMinimal ? 16 : 20) * hitScale))

  return {
    type,
    labelName,
    labelLevel,
    orbitRatio: safeOrbitRatio,
    portalX,
    portalY,
    groupTransform: `translate(${portalX} ${portalY})`,
    spokeLinePath,
    spokeChevronD,
    portalHoverStrokeWidth,
    portalHitWidth,
    portalHitHeight,
    ringPath: type === 'source'
      ? buildPortalSocketPath(portal?.isMinimal ? 10 : 18)
      : buildPortalPlugPath(portal?.isMinimal ? 14 : 28, portal?.isMinimal ? 8 : 14, portal?.isMinimal ? 4 : 7),
    ringTransform: `translate(${extTipX} ${extTipY}) rotate(${(spokeTangent * 180) / Math.PI})`,
    hitCx: extTipX,
    hitCy: extTipY,
    showSpoke: !portal?.isMinimal,
    showLabel: !portal?.isMinimal,
  }
}
