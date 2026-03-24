import { describe, it, expect } from 'vitest'
import { resolveInspectorSelectedNode } from '../utils/selection'

describe('inspector resolver', () => {
  it('returns null when multiple node ids are selected', () => {
    const node = { id: 'a', label: 'A' }
    const result = resolveInspectorSelectedNode(node, ['a', 'b', 'c'])
    expect(result).toBeNull()
  })

  it('returns node when single or no selection', () => {
    const node = { id: 'a', label: 'A' }
    expect(resolveInspectorSelectedNode(node, ['a'])).toBe(node)
    expect(resolveInspectorSelectedNode(node, [])).toBe(node)
  })
})
