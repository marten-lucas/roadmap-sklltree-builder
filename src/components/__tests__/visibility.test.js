import { describe, expect, it } from 'vitest'
import { RELEASE_FILTER_OPTIONS, SCOPE_FILTER_ALL, getReleaseVisibilityMode, nodeMatchesScopeFilter } from '../utils/visibility'

describe('visibility', () => {
  it('treats nodes without scope assignments as visible for every scope filter', () => {
    const node = {
      levels: [{ id: 'level-1', scopeIds: [] }],
    }

    expect(nodeMatchesScopeFilter(node, SCOPE_FILTER_ALL)).toBe(true)
    expect(nodeMatchesScopeFilter(node, 'scope-a')).toBe(true)
    expect(nodeMatchesScopeFilter({ levels: [] }, 'scope-a')).toBe(true)
  })

  it('maps release filters to full and minimal visibility as expected', () => {
    expect(getReleaseVisibilityMode('now', RELEASE_FILTER_OPTIONS.now)).toBe('full')
    expect(getReleaseVisibilityMode('next', RELEASE_FILTER_OPTIONS.now)).toBe('minimal')
    expect(getReleaseVisibilityMode('done', RELEASE_FILTER_OPTIONS.now)).toBe('minimal')
    expect(getReleaseVisibilityMode('later', RELEASE_FILTER_OPTIONS.now)).toBe('minimal')

    expect(getReleaseVisibilityMode('now', RELEASE_FILTER_OPTIONS.next)).toBe('full')
    expect(getReleaseVisibilityMode('next', RELEASE_FILTER_OPTIONS.next)).toBe('full')
    expect(getReleaseVisibilityMode('done', RELEASE_FILTER_OPTIONS.next)).toBe('minimal')
    expect(getReleaseVisibilityMode('later', RELEASE_FILTER_OPTIONS.next)).toBe('minimal')
  })
})