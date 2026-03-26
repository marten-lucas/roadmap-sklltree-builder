import { describe, it, expect } from 'vitest'
import { createSimpleTree } from './testUtils'
import {
  addInitialSegmentWithResult,
  addSegmentNearWithResult,
  updateSegmentLabel,
  deleteSegment,
} from '../utils/treeData'

describe('segment CRUD helpers', () => {
  it('adds an initial segment when none exist', () => {
    const tree = { segments: [], children: [] }
    const result = addInitialSegmentWithResult(tree)

    expect(result).toBeDefined()
    expect(result.tree).toBeDefined()
    expect(result.createdSegmentId).toBeTruthy()
    expect(result.tree.segments.some((s) => s.id === result.createdSegmentId)).toBe(true)
  })

  it('adds a segment near an existing anchor', () => {
    const tree = createSimpleTree()
    const anchor = tree.segments[0].id
    const result = addSegmentNearWithResult(tree, anchor, 'right')

    expect(result).toBeDefined()
    expect(result.createdSegmentId).toBeTruthy()
    const idx = result.tree.segments.findIndex((s) => s.id === anchor)
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(result.tree.segments[idx + 1].id).toBe(result.createdSegmentId)
  })

  it('updates a segment label', () => {
    const tree = createSimpleTree()
    const seg = tree.segments[0]
    const next = updateSegmentLabel(tree, seg.id, 'New Label')

    expect(next).not.toBe(tree)
    expect(next.segments.find((s) => s.id === seg.id).label).toBe('New Label')
  })

  it('deletes a segment and clears assignments', () => {
    const tree = createSimpleTree()
    const segId = tree.segments[0].id
    const result = deleteSegment(tree, segId)

    expect(result.segments.some((s) => s.id === segId)).toBe(false)
    const nodeIds = []
    const queue = [...(result.children ?? [])]
    while (queue.length > 0) {
      const n = queue.shift()
      nodeIds.push(n.segmentId ?? null)
      queue.push(...(n.children ?? []))
    }

    expect(nodeIds.includes(segId)).toBe(false)
  })
})
