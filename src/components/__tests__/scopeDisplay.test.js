import { describe, expect, it } from 'vitest'
import { buildGroupedScopeSelectData, renderScopeLabelsMarkup, resolveScopeLabels } from '../utils/scopeDisplay'

describe('scopeDisplay', () => {
  it('resolves scope labels from ids and deduplicates them', () => {
    const labels = resolveScopeLabels(['scope-a', 'scope-b', 'scope-a', 'missing'], [
      { id: 'scope-a', label: 'Frontend' },
      { value: 'scope-b', label: 'Platform' },
      { id: 'scope-c', label: 'Ignored' },
    ])

    expect(labels).toEqual(['Frontend', 'Platform'])
  })

  it('renders escaped scope badge markup', () => {
    const markup = renderScopeLabelsMarkup(['Frontend', 'Platform & Ops', '<script>'])

    expect(markup).toContain('skill-node-tooltip__scope')
    expect(markup).toContain('Frontend')
    expect(markup).toContain('Platform &amp; Ops')
    expect(markup).toContain('&lt;script&gt;')
  })

  it('groups scope select data by group label and uncolored fallback', () => {
    expect(buildGroupedScopeSelectData([
      { id: 'scope-a', label: 'Payments', groupLabel: 'Product', color: '#16a34a' },
      { id: 'scope-b', label: 'Identity', groupLabel: 'Platform', color: '#0ea5e9' },
      { id: 'scope-c', label: 'Design', color: null },
    ])).toEqual([
      {
        group: 'Product',
        items: [{ value: 'scope-a', label: 'Payments', color: '#16a34a' }],
      },
      {
        group: 'Platform',
        items: [{ value: 'scope-b', label: 'Identity', color: '#0ea5e9' }],
      },
      {
        group: 'Uncolored',
        items: [{ value: 'scope-c', label: 'Design', color: null }],
      },
    ])
  })
})