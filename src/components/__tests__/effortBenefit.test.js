import { describe, it, expect } from 'vitest'
import {
  EFFORT_SIZES,
  BENEFIT_SIZES,
  DEFAULT_STORY_POINT_MAP,
  createDefaultEffort,
  createDefaultBenefit,
  normalizeEffort,
  normalizeBenefit,
  normalizeStoryPointMap,
  resolveStoryPoints,
  computeBudgetSummary,
} from '../utils/effortBenefit'
import { createEmptyDocument } from '../utils/documentState'
import { addInitialRootNodeWithResult, updateNodeEffort, updateNodeBenefit, findNodeById } from '../utils/treeData'

describe('EFFORT_SIZES / BENEFIT_SIZES constants', () => {
  it('effort sizes include all expected values', () => {
    expect(EFFORT_SIZES).toContain('unclear')
    expect(EFFORT_SIZES).toContain('xs')
    expect(EFFORT_SIZES).toContain('s')
    expect(EFFORT_SIZES).toContain('m')
    expect(EFFORT_SIZES).toContain('l')
    expect(EFFORT_SIZES).toContain('xl')
    expect(EFFORT_SIZES).toContain('custom')
  })

  it('benefit sizes do not include custom', () => {
    expect(BENEFIT_SIZES).not.toContain('custom')
    expect(BENEFIT_SIZES).toContain('unclear')
    expect(BENEFIT_SIZES).toContain('xl')
  })
})

describe('DEFAULT_STORY_POINT_MAP', () => {
  it('has Fibonacci-like defaults', () => {
    expect(DEFAULT_STORY_POINT_MAP).toEqual({ xs: 1, s: 3, m: 5, l: 8, xl: 13 })
  })
})

describe('createDefaultEffort', () => {
  it('returns unclear with null customPoints', () => {
    expect(createDefaultEffort()).toEqual({ size: 'unclear', customPoints: null })
  })
})

describe('createDefaultBenefit', () => {
  it('returns unclear', () => {
    expect(createDefaultBenefit()).toEqual({ size: 'unclear' })
  })
})

describe('normalizeEffort', () => {
  it('falls back to unclear for null/undefined', () => {
    expect(normalizeEffort(null)).toEqual({ size: 'unclear', customPoints: null })
    expect(normalizeEffort(undefined)).toEqual({ size: 'unclear', customPoints: null })
  })

  it('falls back to unclear for unknown size', () => {
    expect(normalizeEffort({ size: 'huge' })).toEqual({ size: 'unclear', customPoints: null })
  })

  it('preserves valid sizes', () => {
    for (const size of ['xs', 's', 'm', 'l', 'xl']) {
      expect(normalizeEffort({ size }).size).toBe(size)
    }
  })

  it('strips customPoints for non-custom sizes', () => {
    expect(normalizeEffort({ size: 'm', customPoints: 42 })).toEqual({ size: 'm', customPoints: null })
  })

  it('preserves customPoints for custom size', () => {
    expect(normalizeEffort({ size: 'custom', customPoints: 21 })).toEqual({ size: 'custom', customPoints: 21 })
  })

  it('rejects negative customPoints', () => {
    expect(normalizeEffort({ size: 'custom', customPoints: -5 })).toEqual({ size: 'custom', customPoints: null })
  })
})

describe('normalizeBenefit', () => {
  it('falls back to unclear for null', () => {
    expect(normalizeBenefit(null)).toEqual({ size: 'unclear' })
  })

  it('preserves valid sizes', () => {
    for (const size of ['xs', 's', 'm', 'l', 'xl']) {
      expect(normalizeBenefit({ size }).size).toBe(size)
    }
  })

  it('falls back to unclear for custom (not in benefit sizes)', () => {
    expect(normalizeBenefit({ size: 'custom' })).toEqual({ size: 'unclear' })
  })
})

describe('normalizeStoryPointMap', () => {
  it('returns defaults for null', () => {
    expect(normalizeStoryPointMap(null)).toEqual(DEFAULT_STORY_POINT_MAP)
  })

  it('fills missing keys with defaults', () => {
    const result = normalizeStoryPointMap({ xs: 2 })
    expect(result.xs).toBe(2)
    expect(result.s).toBe(DEFAULT_STORY_POINT_MAP.s)
  })

  it('rejects negative values, replaces with default', () => {
    const result = normalizeStoryPointMap({ xs: -1, s: 3, m: 5, l: 8, xl: 13 })
    expect(result.xs).toBe(DEFAULT_STORY_POINT_MAP.xs)
  })
})

describe('resolveStoryPoints', () => {
  it('returns null for unclear', () => {
    expect(resolveStoryPoints({ effort: { size: 'unclear' } }, DEFAULT_STORY_POINT_MAP)).toBeNull()
  })

  it('returns null for node without effort', () => {
    expect(resolveStoryPoints({}, DEFAULT_STORY_POINT_MAP)).toBeNull()
  })

  it('resolves named sizes from map', () => {
    expect(resolveStoryPoints({ effort: { size: 'xs' } }, DEFAULT_STORY_POINT_MAP)).toBe(1)
    expect(resolveStoryPoints({ effort: { size: 'm' } }, DEFAULT_STORY_POINT_MAP)).toBe(5)
    expect(resolveStoryPoints({ effort: { size: 'xl' } }, DEFAULT_STORY_POINT_MAP)).toBe(13)
  })

  it('resolves custom size from customPoints', () => {
    expect(resolveStoryPoints({ effort: { size: 'custom', customPoints: 7 } }, DEFAULT_STORY_POINT_MAP)).toBe(7)
  })

  it('returns null for custom with null customPoints', () => {
    expect(resolveStoryPoints({ effort: { size: 'custom', customPoints: null } }, DEFAULT_STORY_POINT_MAP)).toBeNull()
  })

  it('uses custom map values', () => {
    const map = { xs: 2, s: 4, m: 8, l: 16, xl: 32 }
    expect(resolveStoryPoints({ effort: { size: 's' } }, map)).toBe(4)
  })
})

describe('computeBudgetSummary', () => {
  it('sums all resolvable story points', () => {
    const nodes = [
      { effort: { size: 'xs' } },
      { effort: { size: 'm' } },
      { effort: { size: 'unclear' } },
    ]
    const doc = createEmptyDocument()
    const result = computeBudgetSummary(nodes, doc)
    expect(result.total).toBe(1 + 5) // xs + m, unclear skipped
  })

  it('detects over-budget', () => {
    const nodes = [{ effort: { size: 'xl' } }]
    const doc = { ...createEmptyDocument(), storyPointBudget: 10 }
    const result = computeBudgetSummary(nodes, doc)
    expect(result.isOverBudget).toBe(true)
  })

  it('does not flag over-budget when within limit', () => {
    const nodes = [{ effort: { size: 'xs' } }]
    const doc = { ...createEmptyDocument(), storyPointBudget: 10 }
    const result = computeBudgetSummary(nodes, doc)
    expect(result.isOverBudget).toBe(false)
  })

  it('returns null budget when not set', () => {
    const doc = createEmptyDocument()
    const result = computeBudgetSummary([], doc)
    expect(result.budget).toBeNull()
    expect(result.isOverBudget).toBe(false)
  })
})

describe('createEmptyDocument', () => {
  it('includes storyPointMap and storyPointBudget per-release', () => {
    const doc = createEmptyDocument()
    expect(doc.storyPointMap).toEqual(DEFAULT_STORY_POINT_MAP)
    expect(doc.releases[0].storyPointBudget).toBeNull()
  })
})

describe('updateNodeEffort / updateNodeBenefit', () => {
  const buildDoc = () => {
    const doc = createEmptyDocument()
    const result = addInitialRootNodeWithResult(doc)
    return { doc: result.tree, nodeId: result.createdNodeId }
  }

  it('updateNodeEffort sets effort size', () => {
    const { doc, nodeId } = buildDoc()
    const next = updateNodeEffort(doc, nodeId, { size: 'm', customPoints: null })
    const node = findNodeById(next, nodeId)
    expect(node.effort.size).toBe('m')
  })

  it('updateNodeEffort preserves customPoints for custom size', () => {
    const { doc, nodeId } = buildDoc()
    const next = updateNodeEffort(doc, nodeId, { size: 'custom', customPoints: 15 })
    const node = findNodeById(next, nodeId)
    expect(node.effort.size).toBe('custom')
    expect(node.effort.customPoints).toBe(15)
  })

  it('updateNodeBenefit sets benefit size', () => {
    const { doc, nodeId } = buildDoc()
    const next = updateNodeBenefit(doc, nodeId, { size: 'xl' })
    const node = findNodeById(next, nodeId)
    expect(node.benefit.size).toBe('xl')
  })

  it('new nodes have default effort and benefit', () => {
    const { doc, nodeId } = buildDoc()
    const node = findNodeById(doc, nodeId)
    expect(node.effort).toEqual({ size: 'unclear', customPoints: null })
    expect(node.benefit).toEqual({ size: 'unclear' })
  })
})
