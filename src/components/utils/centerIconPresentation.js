import { TREE_CONFIG } from '../config'

export const CENTER_ICON_DEFAULT_SIZE = 156
export const CENTER_ICON_HIT_PADDING = 8

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

export const resolveCenterIconSize = (value, fallback = CENTER_ICON_DEFAULT_SIZE) => {
  const parsed = Number.parseFloat(String(value ?? ''))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export const computeCenterIconSize = ({
  nodes = [],
  maxEstimatedSegmentLabelHeightPx = TREE_CONFIG.nodeSize * 0.4,
  labelLevelOneGapPx = 0,
  centerLabelGapPx = 0,
  hasSegmentLabels = true,
}) => {
  const firstLevelNode = Array.isArray(nodes) ? nodes.find((node) => node.level === 1) : null
  const maxNodeRadius = Array.isArray(nodes) && nodes.length > 0
    ? nodes.reduce((maxRadius, node) => Math.max(maxRadius, Number(node?.radius ?? 0)), 0)
    : TREE_CONFIG.levelSpacing
  const firstLevelRadius = firstLevelNode?.radius ?? TREE_CONFIG.levelSpacing
  const additionalDependencyPortalAllowance = TREE_CONFIG.nodeSize * 0.2
  const levelOneNodeClearance = TREE_CONFIG.nodeSize * 0.5 + additionalDependencyPortalAllowance
  const minRadius = TREE_CONFIG.nodeSize * 0.5
  const labelBandHeight = hasSegmentLabels ? maxEstimatedSegmentLabelHeightPx : 0
  const effectiveLabelLevelOneGapPx = hasSegmentLabels ? labelLevelOneGapPx : 0
  const effectiveCenterLabelGapPx = hasSegmentLabels ? centerLabelGapPx : 0

  const maxAllowedRadius = Math.max(
    minRadius,
    firstLevelRadius - levelOneNodeClearance - effectiveLabelLevelOneGapPx - labelBandHeight - effectiveCenterLabelGapPx,
  )

  // Let the icon fill most of the inner void and grow smoothly with tree size.
  // Log scaling avoids runaway growth on extreme datasets while still making
  // very large trees visibly different from compact ones.
  const normalizedTreeScale = Math.max(1, maxNodeRadius / Math.max(firstLevelRadius, 1))
  const logGrowthBoost = 1 + 0.22 * Math.log10(normalizedTreeScale)

  const maxVisualRadius = Math.min(
    hasSegmentLabels ? TREE_CONFIG.nodeSize * 3.2 : TREE_CONFIG.nodeSize * 4.8,
    hasSegmentLabels ? firstLevelRadius * 0.62 : firstLevelRadius * 0.82,
  )
  const targetRadius = Math.min(maxAllowedRadius, maxVisualRadius)
  const fillFactor = hasSegmentLabels ? 0.7 : 0.88
  const preferredRadius = targetRadius * fillFactor * logGrowthBoost
  const radius = clamp(preferredRadius, minRadius, targetRadius)

  return radius * 2
}

export const getCenterIconExportMetrics = (centerGroup) => {
  const centerForeign = centerGroup?.querySelector?.('.skill-tree-center-icon__foreign') ?? null
  const centerImage = centerGroup?.querySelector?.('.skill-tree-center-icon__image') ?? null
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
