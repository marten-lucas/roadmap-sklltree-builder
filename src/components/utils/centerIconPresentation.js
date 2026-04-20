import { TREE_CONFIG } from '../config'

export const CENTER_ICON_DEFAULT_SIZE = 156
export const CENTER_ICON_HIT_PADDING = 8

export const resolveCenterIconSize = (value, fallback = CENTER_ICON_DEFAULT_SIZE) => {
  const parsed = Number.parseFloat(String(value ?? ''))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export const computeCenterIconSize = ({
  nodes = [],
  maxEstimatedSegmentLabelHeightPx = TREE_CONFIG.nodeSize * 0.4,
  labelLevelOneGapPx = 0,
  centerLabelGapPx = 0,
}) => {
  const firstLevelNode = Array.isArray(nodes) ? nodes.find((node) => node.level === 1) : null
  const firstLevelRadius = firstLevelNode?.radius ?? TREE_CONFIG.levelSpacing
  const additionalDependencyPortalAllowance = TREE_CONFIG.nodeSize * 0.2
  const levelOneNodeClearance = TREE_CONFIG.nodeSize * 0.5 + additionalDependencyPortalAllowance
  const minRadius = TREE_CONFIG.nodeSize * 0.5
  const preferredRadius = TREE_CONFIG.nodeSize * 0.72
  const labelBandHeight = maxEstimatedSegmentLabelHeightPx
  const maxAllowedRadius = Math.max(
    minRadius,
    firstLevelRadius - levelOneNodeClearance - labelLevelOneGapPx - labelBandHeight - centerLabelGapPx,
  )
  const maxVisualRadius = Math.min(
    TREE_CONFIG.nodeSize * 1.35,
    firstLevelRadius * 0.42,
  )
  const targetRadius = Math.min(maxAllowedRadius, maxVisualRadius)
  const radius = Math.max(minRadius, Math.max(preferredRadius, targetRadius))

  return radius * 2
}

export const getCenterIconExportMetrics = (centerGroup) => {
  const centerForeign = centerGroup?.querySelector?.('.skill-tree-center-icon__foreign') ?? null
  const centerImage = centerGroup?.querySelector?.('.skill-tree-center-icon__image') ?? null
  const centerHitArea = centerGroup?.querySelector?.('.skill-tree-center-icon__hit-area') ?? null
  const size = resolveCenterIconSize(
    centerGroup?.getAttribute?.('data-center-icon-size')
      ?? centerForeign?.getAttribute?.('width')
      ?? centerImage?.getAttribute?.('width'),
    CENTER_ICON_DEFAULT_SIZE,
  )

  return {
    size,
    half: size / 2,
    hitRadius: size / 2 + CENTER_ICON_HIT_PADDING,
  }
}
