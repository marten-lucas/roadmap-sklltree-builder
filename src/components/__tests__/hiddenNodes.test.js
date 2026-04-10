import { describe, expect, it } from 'vitest'
import { buildHiddenNodeIdSet } from '../utils/treeData'

describe('buildHiddenNodeIdSet', () => {
  it('returns empty set for empty tree', () => {
    const tree = { children: [] }
    const result = buildHiddenNodeIdSet(tree)
    expect(result.size).toBe(0)
  })

  it('identifies nodes where all levels are hidden', () => {
    const tree = {
      children: [
        {
          id: 'node-1',
          levels: [
            { id: 'l1', status: 'hidden' },
            { id: 'l2', status: 'hidden' },
          ],
          children: []
        },
        {
          id: 'node-2',
          levels: [
            { id: 'l1', status: 'done' },
            { id: 'l2', status: 'hidden' },
          ],
          children: []
        }
      ]
    }
    const result = buildHiddenNodeIdSet(tree)
    expect(result.has('node-1')).toBe(true)
    expect(result.has('node-2')).toBe(false)
  })

  it('recursively hides children of hidden nodes', () => {
    const tree = {
      children: [
        {
          id: 'parent-hidden',
          levels: [{ status: 'hidden' }],
          children: [
            {
              id: 'child-visible-status',
              levels: [{ status: 'done' }],
              children: [
                {
                  id: 'grandchild',
                  levels: [{ status: 'later' }],
                  children: []
                }
              ]
            }
          ]
        },
        {
          id: 'parent-visible',
          levels: [{ status: 'now' }],
          children: [
            {
              id: 'child-hidden-branch',
              levels: [{ status: 'hidden' }],
              children: [
                {
                  id: 'grandchild-hidden',
                  levels: [{ status: 'done' }],
                  children: []
                }
              ]
            }
          ]
        }
      ]
    }
    const result = buildHiddenNodeIdSet(tree)
    
    // Branch 1: Parent hidden -> all descendants hidden
    expect(result.has('parent-hidden')).toBe(true)
    expect(result.has('child-visible-status')).toBe(true)
    expect(result.has('grandchild')).toBe(true)
    
    // Branch 2: Visible parent, but sub-branch hidden
    expect(result.has('parent-visible')).toBe(false)
    expect(result.has('child-hidden-branch')).toBe(true)
    expect(result.has('grandchild-hidden')).toBe(true)
  })

  it('handles nodes without levels by checking top-level status property', () => {
    const tree = {
      children: [
        {
          id: 'node-no-levels-hidden',
          status: 'hidden',
          children: []
        },
        {
          id: 'node-no-levels-visible',
          status: 'done',
          children: []
        }
      ]
    }
    const result = buildHiddenNodeIdSet(tree)
    expect(result.has('node-no-levels-hidden')).toBe(true)
    expect(result.has('node-no-levels-visible')).toBe(false)
  })
})
