/**
 * Test Suite: Segment CRUD Operations
 * 
 * Tests for segment creation, retrieval, update, and deletion operations.
 * Ensures segment management works correctly and preserves tree integrity.
 */

import { describe, it, expect } from 'vitest'
import {
  addInitialSegmentWithResult,
  addSegmentNearWithResult,
  deleteSegment,
  updateSegmentLabel,
  findNodeById,
} from '../treeData'
import { createSimpleTree, createNodelessTree, findNodeInTree, SEGMENT_FRONTEND, SEGMENT_BACKEND } from './testUtils'

describe('Segment CRUD Operations', () => {
  describe('addInitialSegmentWithResult', () => {
    it('should add first segment to empty tree', () => {
      const tree = createNodelessTree()
      const result = addInitialSegmentWithResult(tree)

      expect(result.tree.segments.length).toBe(1)
      expect(result.createdSegmentId).toBeDefined()
      expect(result.createdSegmentId).toBeTruthy()
    })

    it('should return createdSegmentId in result', () => {
      const tree = createNodelessTree()
      const result = addInitialSegmentWithResult(tree)

      expect(result.createdSegmentId).toBe(result.tree.segments[0].id)
    })

    it('should add segment with default label', () => {
      const tree = createNodelessTree()
      const result = addInitialSegmentWithResult(tree)

      expect(result.tree.segments[0].label).toBeDefined()
      expect(typeof result.tree.segments[0].label).toBe('string')
    })

    it('should not mutate original tree', () => {
      const tree = createNodelessTree()
      const originalLength = tree.segments.length
      addInitialSegmentWithResult(tree)

      expect(tree.segments.length).toBe(originalLength)
    })

    it('should add segment to tree with existing segments', () => {
      const tree = createSimpleTree()
      const initialCount = tree.segments.length
      const result = addInitialSegmentWithResult(tree)

      expect(result.tree.segments.length).toBe(initialCount + 1)
    })

    it('should generate unique segment IDs', () => {
      const tree = createNodelessTree()
      const result1 = addInitialSegmentWithResult(tree)
      const result2 = addInitialSegmentWithResult(result1.tree)

      expect(result1.createdSegmentId).not.toBe(result2.createdSegmentId)
    })
  })

  describe('addSegmentNearWithResult', () => {
    it('should add segment to the right of anchor', () => {
      const tree = createSimpleTree()
      const anchorId = tree.segments[0].id
      const result = addSegmentNearWithResult(tree, anchorId, 'right')

      const anchorIndex = result.tree.segments.findIndex((s) => s.id === anchorId)
      const newSegmentIndex = result.tree.segments.findIndex((s) => s.id === result.createdSegmentId)

      expect(newSegmentIndex).toBe(anchorIndex + 1)
    })

    it('should add segment to the left of anchor', () => {
      const tree = createSimpleTree()
      const anchorId = tree.segments[0].id
      const result = addSegmentNearWithResult(tree, anchorId, 'left')

      const anchorIndex = result.tree.segments.findIndex((s) => s.id === anchorId)
      const newSegmentIndex = result.tree.segments.findIndex((s) => s.id === result.createdSegmentId)

      expect(newSegmentIndex).toBe(anchorIndex - 1)
    })

    it('should handle right placement at end of list', () => {
      const tree = createSimpleTree()
      const lastSegmentId = tree.segments[tree.segments.length - 1].id
      const result = addSegmentNearWithResult(tree, lastSegmentId, 'right')

      expect(result.tree.segments[result.tree.segments.length - 1].id).toBe(result.createdSegmentId)
    })

    it('should handle left placement at start of list', () => {
      const tree = createSimpleTree()
      const firstSegmentId = tree.segments[0].id
      const result = addSegmentNearWithResult(tree, firstSegmentId, 'left')

      expect(result.tree.segments[0].id).toBe(result.createdSegmentId)
    })

    it('should return null createdSegmentId for non-existent anchor', () => {
      const tree = createSimpleTree()
      const result = addSegmentNearWithResult(tree, 'non-existent-id', 'right')

      expect(result.createdSegmentId).toBeNull()
      expect(result.tree).toBe(tree)
    })

    it('should not mutate original tree', () => {
      const tree = createSimpleTree()
      const originalLength = tree.segments.length
      const originalSegments = tree.segments.map((s) => s.id)
      addSegmentNearWithResult(tree, tree.segments[0].id, 'right')

      expect(tree.segments.length).toBe(originalLength)
      expect(tree.segments.map((s) => s.id)).toEqual(originalSegments)
    })

    it('should preserve adjacent segment order', () => {
      const tree = createSimpleTree()
      const seg1 = tree.segments[0].id
      const seg2 = tree.segments[1].id
      const result = addSegmentNearWithResult(tree, seg1, 'right')

      const newSeg1Index = result.tree.segments.findIndex((s) => s.id === seg1)
      const newSegIndex = result.tree.segments.findIndex((s) => s.id === result.createdSegmentId)
      const newSeg2Index = result.tree.segments.findIndex((s) => s.id === seg2)

      expect(newSeg1Index).toBeLessThan(newSegIndex)
      expect(newSegIndex).toBeLessThan(newSeg2Index)
    })

    it('should default to right placement when side not specified', () => {
      const tree = createSimpleTree()
      const anchorId = tree.segments[0].id
      const result1 = addSegmentNearWithResult(tree, anchorId)
      const result2 = addSegmentNearWithResult(tree, anchorId, 'right')

      const index1 = result1.tree.segments.findIndex((s) => s.id === result1.createdSegmentId)
      const index2 = result2.tree.segments.findIndex((s) => s.id === result2.createdSegmentId)

      expect(index1).toBe(index2)
    })
  })

  describe('deleteSegment', () => {
    it('should remove segment from list', () => {
      const tree = createSimpleTree()
      const segmentToDelete = tree.segments[0].id
      const initialLength = tree.segments.length
      const result = deleteSegment(tree, segmentToDelete)

      expect(result.segments.length).toBe(initialLength - 1)
      expect(result.segments.some((s) => s.id === segmentToDelete)).toBe(false)
    })

    it('should clear segmentId on all nodes with that segment', () => {
      const tree = createSimpleTree()
      const segmentToDelete = SEGMENT_FRONTEND
      const result = deleteSegment(tree, segmentToDelete)

      // Find all nodes that had this segment
      const nodeWithSegment = findNodeInTree(result, (node) => node.segmentId === null)
      expect(nodeWithSegment).toBeDefined()
    })

    it('should not delete nodes, only clear their segment', () => {
      const tree = createSimpleTree()
      const initialNodeCount = JSON.stringify(tree).split('"id":"').length - 2 // estimate
      const segmentToDelete = SEGMENT_FRONTEND
      const result = deleteSegment(tree, segmentToDelete)

      const resultNodeCount = JSON.stringify(result).split('"id":"').length - 2 // estimate
      expect(resultNodeCount).toBe(initialNodeCount)
    })

    it('should preserve nodes with different segments', () => {
      const tree = createSimpleTree()
      const segmentToDelete = SEGMENT_FRONTEND
      const result = deleteSegment(tree, segmentToDelete)

      // Backend nodes should still have their segment
      const backendNode = findNodeById(result, 'root-backend')
      expect(backendNode).toBeDefined()
      expect(backendNode.segmentId).toBe(SEGMENT_BACKEND)
    })

    it('should not mutate original tree', () => {
      const tree = createSimpleTree()
      const originalSegmentCount = tree.segments.length
      const originalNodeSegment = findNodeById(tree, 'root-frontend').segmentId
      deleteSegment(tree, SEGMENT_FRONTEND)

      expect(tree.segments.length).toBe(originalSegmentCount)
      expect(findNodeById(tree, 'root-frontend').segmentId).toBe(originalNodeSegment)
    })

    it('should handle deletion of non-existent segment', () => {
      const tree = createSimpleTree()
      const result = deleteSegment(tree, 'non-existent-id')

      expect(result.segments.length).toBe(tree.segments.length)
      expect(result.children.length).toBe(tree.children.length)
    })

    it('should maintain segment order for remaining segments', () => {
      const tree = createSimpleTree()
      const remaining = tree.segments.filter((s) => s.id !== SEGMENT_FRONTEND)
      const result = deleteSegment(tree, SEGMENT_FRONTEND)

      expect(result.segments.map((s) => s.id)).toEqual(remaining.map((s) => s.id))
    })

    it('should handle deleting only segment', () => {
      const tree = {
        segments: [{ id: 'only-seg', label: 'Only' }],
        children: [
          {
            id: 'root',
            label: 'Root',
            status: 'fertig',
            ebene: null,
            segmentId: 'only-seg',
            children: [],
          },
        ],
      }

      const result = deleteSegment(tree, 'only-seg')

      expect(result.segments.length).toBe(0)
      expect(result.children[0].segmentId).toBeNull()
    })
  })

  describe('updateSegmentLabel', () => {
    it('should update segment label', () => {
      const tree = createSimpleTree()
      const segmentId = tree.segments[0].id
      const newLabel = 'Web Development'
      const result = updateSegmentLabel(tree, segmentId, newLabel)

      const updatedSegment = result.segments.find((s) => s.id === segmentId)
      expect(updatedSegment.label).toBe(newLabel)
    })

    it('should not affect other segments', () => {
      const tree = createSimpleTree()
      const seg1Id = tree.segments[0].id
      const seg2Id = tree.segments[1].id
      const originalSeg2Label = tree.segments[1].label
      const result = updateSegmentLabel(tree, seg1Id, 'New Label')

      const seg2 = result.segments.find((s) => s.id === seg2Id)
      expect(seg2.label).toBe(originalSeg2Label)
    })

    it('should not mutate original tree', () => {
      const tree = createSimpleTree()
      const originalLabel = tree.segments[0].label
      updateSegmentLabel(tree, tree.segments[0].id, 'Changed')

      expect(tree.segments[0].label).toBe(originalLabel)
    })

    it('should handle non-existent segment', () => {
      const tree = createSimpleTree()
      const result = updateSegmentLabel(tree, 'non-existent', 'New')

      expect(result.segments).toEqual(tree.segments)
    })

    it('should support empty label', () => {
      const tree = createSimpleTree()
      const segmentId = tree.segments[0].id
      const result = updateSegmentLabel(tree, segmentId, '')

      const updatedSegment = result.segments.find((s) => s.id === segmentId)
      expect(updatedSegment.label).toBe('')
    })

    it('should support long labels', () => {
      const tree = createSimpleTree()
      const segmentId = tree.segments[0].id
      const longLabel = 'Very Long Segment Label With Many Words For Testing Purposes'
      const result = updateSegmentLabel(tree, segmentId, longLabel)

      const updatedSegment = result.segments.find((s) => s.id === segmentId)
      expect(updatedSegment.label).toBe(longLabel)
    })

    it('should support Unicode labels', () => {
      const tree = createSimpleTree()
      const segmentId = tree.segments[0].id
      const unicodeLabel = 'フロントエンド 前端'
      const result = updateSegmentLabel(tree, segmentId, unicodeLabel)

      const updatedSegment = result.segments.find((s) => s.id === segmentId)
      expect(updatedSegment.label).toBe(unicodeLabel)
    })
  })

  describe('Segment CRUD Sequences', () => {
    it('should support add -> update -> delete sequence', () => {
      let tree = createSimpleTree()
      const initialCount = tree.segments.length

      // Add
      const addResult = addInitialSegmentWithResult(tree)
      tree = addResult.tree
      expect(tree.segments.length).toBe(initialCount + 1)

      // Update
      const newLabel = 'Updated Label'
      tree = updateSegmentLabel(tree, addResult.createdSegmentId, newLabel)
      const updated = tree.segments.find((s) => s.id === addResult.createdSegmentId)
      expect(updated.label).toBe(newLabel)

      // Delete
      tree = deleteSegment(tree, addResult.createdSegmentId)
      expect(tree.segments.length).toBe(initialCount)
    })

    it('should support multiple concurrent segment operations', () => {
      let tree = createSimpleTree()

      // Add multiple segments
      const result1 = addInitialSegmentWithResult(tree)
      tree = result1.tree

      const result2 = addSegmentNearWithResult(tree, result1.createdSegmentId, 'right')
      tree = result2.tree

      expect(tree.segments.length).toBe(4) // 2 initial + 2 new
      expect(tree.segments.map((s) => s.id)).toContain(result1.createdSegmentId)
      expect(tree.segments.map((s) => s.id)).toContain(result2.createdSegmentId)
    })

    it('should handle delete and recreate cycle', () => {
      let tree = createSimpleTree()
      const targetSegmentId = tree.segments[0].id

      tree = deleteSegment(tree, targetSegmentId)
      expect(tree.segments.some((s) => s.id === targetSegmentId)).toBe(false)

      const recreaResult = addInitialSegmentWithResult(tree)
      tree = recreaResult.tree

      expect(tree.segments.length).toBe(2) // Back to 2 segments
      expect(tree.segments[tree.segments.length - 1].id).toBe(recreaResult.createdSegmentId)
    })
  })
})
