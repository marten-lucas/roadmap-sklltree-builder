import { describe, expect, it } from 'vitest'
import { renderScopeLabelsMarkup, resolveScopeLabels } from '../utils/scopeDisplay'

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
})