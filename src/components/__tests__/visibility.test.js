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

  it('applies the no-scope rule within the selected color group only', () => {
    const scopes = [
      { id: 'module-a', label: 'Module A', color: '#ff0000' },
      { id: 'module-b', label: 'Module B', color: '#ff0000' },
      { id: 'machine-x', label: 'Machine X', color: '#0000ff' },
    ]

    expect(nodeMatchesScopeFilter({ levels: [{ id: 'l1', scopeIds: ['machine-x'] }] }, 'module-a', scopes)).toBe(true)
    expect(nodeMatchesScopeFilter({ levels: [{ id: 'l1', scopeIds: [] }] }, 'module-a', scopes)).toBe(true)
    expect(nodeMatchesScopeFilter({ levels: [{ id: 'l1', scopeIds: ['module-a', 'machine-x'] }] }, 'module-a', scopes)).toBe(true)
    expect(nodeMatchesScopeFilter({ levels: [{ id: 'l1', scopeIds: ['module-b'] }] }, 'module-a', scopes)).toBe(false)
  })

  it('supports selecting multiple scopes from the same group', () => {
    const scopes = [
      { id: 'module-a', label: 'Module A', color: '#ff0000' },
      { id: 'module-b', label: 'Module B', color: '#ff0000' },
      { id: 'module-c', label: 'Module C', color: '#ff0000' },
    ]

    expect(nodeMatchesScopeFilter({ levels: [{ id: 'l1', scopeIds: ['module-a'] }] }, ['module-a', 'module-b'], scopes)).toBe(true)
    expect(nodeMatchesScopeFilter({ levels: [{ id: 'l1', scopeIds: ['module-b'] }] }, ['module-a', 'module-b'], scopes)).toBe(true)
    expect(nodeMatchesScopeFilter({ levels: [{ id: 'l1', scopeIds: ['module-c'] }] }, ['module-a', 'module-b'], scopes)).toBe(false)
  })

  it('applies multi-select scope filtering across groups', () => {
    const scopes = [
      { id: 'module-a', label: 'Module A', color: '#ff0000' },
      { id: 'module-b', label: 'Module B', color: '#ff0000' },
      { id: 'machine-x', label: 'Machine X', color: '#0000ff' },
      { id: 'machine-y', label: 'Machine Y', color: '#0000ff' },
    ]

    expect(nodeMatchesScopeFilter({ levels: [{ id: 'l1', scopeIds: ['module-a', 'machine-x'] }] }, ['module-a', 'machine-x'], scopes)).toBe(true)
    expect(nodeMatchesScopeFilter({ levels: [{ id: 'l1', scopeIds: ['module-a'] }] }, ['module-a', 'machine-x'], scopes)).toBe(true)
    expect(nodeMatchesScopeFilter({ levels: [{ id: 'l1', scopeIds: ['module-b', 'machine-x'] }] }, ['module-a', 'machine-x'], scopes)).toBe(false)
    expect(nodeMatchesScopeFilter({ levels: [{ id: 'l1', scopeIds: ['module-a', 'machine-y'] }] }, ['module-a', 'machine-x'], scopes)).toBe(false)
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

  it('resets all nodes back to full when the release filter returns to all', () => {
    expect(getReleaseVisibilityMode('now', RELEASE_FILTER_OPTIONS.all)).toBe('full')
    expect(getReleaseVisibilityMode('next', RELEASE_FILTER_OPTIONS.all)).toBe('full')
    expect(getReleaseVisibilityMode('done', RELEASE_FILTER_OPTIONS.all)).toBe('full')
    expect(getReleaseVisibilityMode('later', RELEASE_FILTER_OPTIONS.all)).toBe('full')
  })
})