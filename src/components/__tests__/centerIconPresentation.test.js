import { describe, expect, it } from 'vitest'
import { TREE_CONFIG } from '../config'
import { computeCenterIconSize } from '../utils/centerIconPresentation'

describe('centerIconPresentation', () => {
  const buildNodes = ({ firstLevelRadius, maxRadius }) => ([
    { id: 'n-1', level: 1, radius: firstLevelRadius },
    { id: 'n-2', level: 2, radius: Math.max(firstLevelRadius + 120, maxRadius * 0.6) },
    { id: 'n-3', level: 3, radius: maxRadius },
  ])

  it('grows center icon for larger trees when segment labels are absent', () => {
    const smallTreeSize = computeCenterIconSize({
      nodes: buildNodes({ firstLevelRadius: 520, maxRadius: 700 }),
      hasSegmentLabels: false,
      maxEstimatedSegmentLabelHeightPx: TREE_CONFIG.nodeSize * 0.4,
      labelLevelOneGapPx: 14,
      centerLabelGapPx: 12,
    })

    const largeTreeSize = computeCenterIconSize({
      nodes: buildNodes({ firstLevelRadius: 520, maxRadius: 2100 }),
      hasSegmentLabels: false,
      maxEstimatedSegmentLabelHeightPx: TREE_CONFIG.nodeSize * 0.4,
      labelLevelOneGapPx: 14,
      centerLabelGapPx: 12,
    })

    expect(largeTreeSize).toBeGreaterThan(smallTreeSize)
  })

  it('keeps center icon smaller when segment labels exist', () => {
    const nodes = buildNodes({ firstLevelRadius: 640, maxRadius: 1800 })

    const sizeWithLabels = computeCenterIconSize({
      nodes,
      hasSegmentLabels: true,
      maxEstimatedSegmentLabelHeightPx: 56,
      labelLevelOneGapPx: 14,
      centerLabelGapPx: 12,
    })

    const sizeWithoutLabels = computeCenterIconSize({
      nodes,
      hasSegmentLabels: false,
      maxEstimatedSegmentLabelHeightPx: 56,
      labelLevelOneGapPx: 14,
      centerLabelGapPx: 12,
    })

    expect(sizeWithoutLabels).toBeGreaterThan(sizeWithLabels)
  })

  it('respects a visual upper limit for export safety', () => {
    const oversizedCandidate = computeCenterIconSize({
      nodes: buildNodes({ firstLevelRadius: 1200, maxRadius: 4600 }),
      hasSegmentLabels: false,
      maxEstimatedSegmentLabelHeightPx: 0,
      labelLevelOneGapPx: 0,
      centerLabelGapPx: 0,
    })

    expect(oversizedCandidate).toBeLessThanOrEqual(TREE_CONFIG.nodeSize * 9.6)
  })
})
