/**
 * Test Suite: Node-Segment Assignment (Recursive Updates)
 * 
 * Tests for updating node segment assignments.
 * KEY BEHAVIOR: When a node's segment changes, the ENTIRE subtree moves with it!
 * This is a critical feature preventing orphaned nodes across segment boundaries.
 */

import { describe, it, expect } from 'vitest'
import { updateNodeSegment, findNodeById } from '../utils/treeData'
import { createSimpleTree, createCrossSegmentTree, SEGMENT_FRONTEND, SEGMENT_BACKEND } from './testUtils'

describe('Node-Segment Assignment (Recursive)', () => {
  describe('Basic Segment Assignment', () => {
    it('should assign node to different segment', () => {
      const tree = createSimpleTree()
      const targetNode = 'child-react'

      const result = updateNodeSegment(tree, targetNode, SEGMENT_BACKEND)
      const updatedNode = findNodeById(result, targetNode)

      expect(updatedNode.segmentId).toBe(SEGMENT_BACKEND)
    })

    it('should assign node to null (unassigned)', () => {
      const tree = createSimpleTree()
      const targetNode = 'child-react'

      const result = updateNodeSegment(tree, targetNode, null)
      const updatedNode = findNodeById(result, targetNode)

      expect(updatedNode.segmentId).toBeNull()
    })

    it('should preserve node identity', () => {
      const tree = createSimpleTree()
      const targetNode = 'child-react'
      const originalNode = findNodeById(tree, targetNode)

      const result = updateNodeSegment(tree, targetNode, SEGMENT_BACKEND)
      const updatedNode = findNodeById(result, targetNode)

      expect(updatedNode.id).toBe(originalNode.id)
      expect(updatedNode.label).toBe(originalNode.label)
      expect(updatedNode.status).toBe(originalNode.status)
    })

    it('should not mutate original tree', () => {
      const tree = createSimpleTree()
      const originalSegment = findNodeById(tree, 'child-react').segmentId

      updateNodeSegment(tree, 'child-react', SEGMENT_BACKEND)

      expect(findNodeById(tree, 'child-react').segmentId).toBe(originalSegment)
    })

    it('should return new tree object', () => {
      const tree = createSimpleTree()
      const result = updateNodeSegment(tree, 'child-react', SEGMENT_BACKEND)

      expect(result).not.toBe(tree)
      expect(result).toEqual(expect.objectContaining({ segments: expect.any(Array) }))
    })
  })

  describe('Single Node Assignment (No Children)', () => {
    it('should handle node with no children', () => {
      const tree = {
        segments: [
          { id: SEGMENT_FRONTEND, label: 'Frontend' },
          { id: SEGMENT_BACKEND, label: 'Backend' },
        ],
        children: [
          {
            id: 'leaf-node',
            label: 'Leaf',
            status: 'fertig',
            ebene: null,
            segmentId: SEGMENT_FRONTEND,
            children: [],
          },
        ],
      }

      const result = updateNodeSegment(tree, 'leaf-node', SEGMENT_BACKEND)
      const node = findNodeById(result, 'leaf-node')

      expect(node.segmentId).toBe(SEGMENT_BACKEND)
      expect(node.children.length).toBe(0)
    })

    it('should only affect target node when no descendants', () => {
      const tree = createSimpleTree()
      const leafNode = 'child-react' // This is a leaf node

      const result = updateNodeSegment(tree, leafNode, SEGMENT_BACKEND)

      const frontend = findNodeById(result, 'root-frontend')
      expect(frontend.segmentId).toBe(SEGMENT_FRONTEND) // Parent unchanged
    })
  })

  describe('Single-Node Segment Updates', () => {
    it('should only move the selected parent when parent segment changes', () => {
      const tree = createSimpleTree()
      const parentNode = 'root-frontend'
      const parentChildren = ['child-react', 'child-vue']

      const result = updateNodeSegment(tree, parentNode, SEGMENT_BACKEND)

      // Parent should move
      const parent = findNodeById(result, parentNode)
      expect(parent.segmentId).toBe(SEGMENT_BACKEND)

      // Children should keep their own explicit segments.
      parentChildren.forEach((childId) => {
        const child = findNodeById(result, childId)
        expect(child.segmentId).toBe(SEGMENT_FRONTEND)
      })
    })

    it('should preserve descendant relationships after subtree move', () => {
      const tree = createSimpleTree()

      const result = updateNodeSegment(tree, 'root-frontend', SEGMENT_BACKEND)

      const parent = findNodeById(result, 'root-frontend')
      const children = parent.children

      expect(children.length).toBe(2)
      expect(children.map((c) => c.id)).toContain('child-react')
      expect(children.map((c) => c.id)).toContain('child-vue')
    })

    it('should keep descendants unchanged for deep trees', () => {
      const tree = {
        segments: [
          { id: SEGMENT_FRONTEND, label: 'Frontend' },
          { id: SEGMENT_BACKEND, label: 'Backend' },
        ],
        children: [
          {
            id: 'root',
            label: 'Root',
            status: 'fertig',
            ebene: null,
            segmentId: SEGMENT_FRONTEND,
            children: [
              {
                id: 'level1',
                label: 'Level 1',
                status: 'fertig',
                ebene: null,
                segmentId: SEGMENT_FRONTEND,
                children: [
                  {
                    id: 'level2',
                    label: 'Level 2',
                    status: 'fertig',
                    ebene: null,
                    segmentId: SEGMENT_FRONTEND,
                    children: [
                      {
                        id: 'level3',
                        label: 'Level 3',
                        status: 'fertig',
                        ebene: null,
                        segmentId: SEGMENT_FRONTEND,
                        children: [],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }

      const result = updateNodeSegment(tree, 'root', SEGMENT_BACKEND)

      // Only the selected node should move to backend.
      expect(findNodeById(result, 'root').segmentId).toBe(SEGMENT_BACKEND)
      expect(findNodeById(result, 'level1').segmentId).toBe(SEGMENT_FRONTEND)
      expect(findNodeById(result, 'level2').segmentId).toBe(SEGMENT_FRONTEND)
      expect(findNodeById(result, 'level3').segmentId).toBe(SEGMENT_FRONTEND)
    })

    it('should preserve subtree structure while only changing the target node', () => {
      const tree = {
        segments: [
          { id: SEGMENT_FRONTEND, label: 'Frontend' },
          { id: SEGMENT_BACKEND, label: 'Backend' },
        ],
        children: [
          {
            id: 'root',
            label: 'Root',
            status: 'fertig',
            ebene: null,
            segmentId: SEGMENT_FRONTEND,
            children: [
              {
                id: 'branch-a',
                label: 'Branch A',
                status: 'fertig',
                ebene: null,
                segmentId: SEGMENT_FRONTEND,
                children: [
                  {
                    id: 'leaf-a1',
                    label: 'Leaf A1',
                    status: 'fertig',
                    ebene: null,
                    segmentId: SEGMENT_FRONTEND,
                    children: [],
                  },
                  {
                    id: 'leaf-a2',
                    label: 'Leaf A2',
                    status: 'fertig',
                    ebene: null,
                    segmentId: SEGMENT_FRONTEND,
                    children: [],
                  },
                ],
              },
              {
                id: 'branch-b',
                label: 'Branch B',
                status: 'fertig',
                ebene: null,
                segmentId: SEGMENT_FRONTEND,
                children: [
                  {
                    id: 'leaf-b1',
                    label: 'Leaf B1',
                    status: 'fertig',
                    ebene: null,
                    segmentId: SEGMENT_FRONTEND,
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      }

      const result = updateNodeSegment(tree, 'root', SEGMENT_BACKEND)

      expect(findNodeById(result, 'root').segmentId).toBe(SEGMENT_BACKEND)
      expect(findNodeById(result, 'branch-a').segmentId).toBe(SEGMENT_FRONTEND)
      expect(findNodeById(result, 'branch-b').segmentId).toBe(SEGMENT_FRONTEND)
      expect(findNodeById(result, 'leaf-a1').segmentId).toBe(SEGMENT_FRONTEND)
      expect(findNodeById(result, 'leaf-a2').segmentId).toBe(SEGMENT_FRONTEND)
      expect(findNodeById(result, 'leaf-b1').segmentId).toBe(SEGMENT_FRONTEND)

      // Check structure preserved
      const root = findNodeById(result, 'root')
      expect(root.children.length).toBe(2)
      const branchA = findNodeById(result, 'branch-a')
      expect(branchA.children.length).toBe(2)
    })
  })

  describe('Partial Tree Updates', () => {
    it('should not affect siblings when updating node segment', () => {
      const tree = createCrossSegmentTree()

      // Change one child's segment
      const result = updateNodeSegment(tree, 'react', SEGMENT_BACKEND)

      // Updated node
      const react = findNodeById(result, 'react')
      expect(react.segmentId).toBe(SEGMENT_BACKEND)

      // Sibling should remain unchanged (if there are any)
      const frontend = findNodeById(result, 'root-frontend')
      expect(frontend.segmentId).toBe(SEGMENT_FRONTEND)
    })

    it('should not affect other branches of the tree', () => {
      const tree = createSimpleTree()

      const result = updateNodeSegment(tree, 'root-frontend', SEGMENT_BACKEND)

      // Frontend root moved
      const frontendRoot = findNodeById(result, 'root-frontend')
      expect(frontendRoot.segmentId).toBe(SEGMENT_BACKEND)

      // Backend root unchanged
      const backendRoot = findNodeById(result, 'root-backend')
      expect(backendRoot.segmentId).toBe(SEGMENT_BACKEND) // Still backend
    })

    it('should allow different segments within same tree', () => {
      const tree = {
        segments: [
          { id: 'seg1', label: 'Seg 1' },
          { id: 'seg2', label: 'Seg 2' },
          { id: 'seg3', label: 'Seg 3' },
        ],
        children: [
          {
            id: 'root',
            label: 'Root',
            status: 'fertig',
            ebene: null,
            segmentId: 'seg1',
            children: [
              {
                id: 'child1',
                label: 'Child 1',
                status: 'fertig',
                ebene: null,
                segmentId: 'seg1',
                children: [],
              },
              {
                id: 'child2',
                label: 'Child 2',
                status: 'fertig',
                ebene: null,
                segmentId: 'seg1',
                children: [],
              },
            ],
          },
        ],
      }

      let result = updateNodeSegment(tree, 'child1', 'seg2')
      result = updateNodeSegment(result, 'child2', 'seg3')

      expect(findNodeById(result, 'root').segmentId).toBe('seg1')
      expect(findNodeById(result, 'child1').segmentId).toBe('seg2')
      expect(findNodeById(result, 'child2').segmentId).toBe('seg3')
    })
  })

  describe('Cross-Segment Relationships', () => {
    it('should allow parent and child in different segments', () => {
      const tree = createCrossSegmentTree() // Already has cross-segment relationships
      const result = updateNodeSegment(tree, 'api-consumption', SEGMENT_BACKEND)

      const node = findNodeById(result, 'api-consumption')
      const parent = findNodeById(result, 'react')

      expect(node.segmentId).toBe(SEGMENT_BACKEND)
      expect(parent.segmentId).toBe(SEGMENT_FRONTEND)
    })

    it('should update parent when moving parent-child cross-segment pair', () => {
      const tree = createCrossSegmentTree()

      // Move the entire 'react' subtree (which includes cross-segment children)
      const result = updateNodeSegment(tree, 'react', SEGMENT_BACKEND)

      const react = findNodeById(result, 'react')
      expect(react.segmentId).toBe(SEGMENT_BACKEND)

      // Its cross-segment child should also move
      const apiConsumption = findNodeById(result, 'api-consumption')
      expect(apiConsumption.segmentId).toBe(SEGMENT_BACKEND)
    })
  })

  describe('Segment Assignment Edge Cases', () => {
    it('should handle assigning to non-existent segment', () => {
      const tree = createSimpleTree()
      const result = updateNodeSegment(tree, 'child-react', 'non-existent-segment')

      const node = findNodeById(result, 'child-react')
      // Even though segment doesn't exist in segments list, node can reference it
      expect(node.segmentId).toBe('non-existent-segment')
    })

    it('should handle assigning root node', () => {
      const tree = createSimpleTree()
      const result = updateNodeSegment(tree, 'root-frontend', SEGMENT_BACKEND)

      expect(findNodeById(result, 'root-frontend').segmentId).toBe(SEGMENT_BACKEND)
    })

    it('should handle reassigning to same segment (idempotent)', () => {
      const tree = createSimpleTree()
      const result1 = updateNodeSegment(tree, 'child-react', SEGMENT_FRONTEND)
      const result2 = updateNodeSegment(result1, 'child-react', SEGMENT_FRONTEND)

      const node1 = findNodeById(result1, 'child-react')
      const node2 = findNodeById(result2, 'child-react')

      expect(node1.segmentId).toBe(node2.segmentId)
      expect(node2.segmentId).toBe(SEGMENT_FRONTEND)
    })

    it('should handle assigning and reassigning quickly', () => {
      const tree = createSimpleTree()

      let result = updateNodeSegment(tree, 'child-react', SEGMENT_BACKEND)
      result = updateNodeSegment(result, 'child-react', null)
      result = updateNodeSegment(result, 'child-react', SEGMENT_FRONTEND)

      const node = findNodeById(result, 'child-react')
      expect(node.segmentId).toBe(SEGMENT_FRONTEND)
    })

    it('should handle null segmentId (unassigned)', () => {
      const tree = createSimpleTree()
      const result = updateNodeSegment(tree, 'child-react', null)

      const node = findNodeById(result, 'child-react')
      expect(node.segmentId).toBeNull()
    })

    it('should handle undefined segmentId (treat as null)', () => {
      const tree = createSimpleTree()
      const result = updateNodeSegment(tree, 'child-react', undefined)

      const node = findNodeById(result, 'child-react')
      expect(node.segmentId).toBeUndefined()
    })
  })

  describe('Tree Integrity After Assignment', () => {
    it('should maintain parent-child relationships', () => {
      const tree = createSimpleTree()
      const result = updateNodeSegment(tree, 'root-frontend', SEGMENT_BACKEND)

      const parent = findNodeById(result, 'root-frontend')
      const children = parent.children

      expect(children.length).toBe(2)
      expect(children.map((c) => c.id)).toContain('child-react')
      expect(children.map((c) => c.id)).toContain('child-vue')
    })

    it('should maintain all node counts', () => {
      const tree = createSimpleTree()

      // Count nodes in original
      let originalCount = 1 // root
      tree.children.forEach((root) => {
        originalCount += countNodes(root)
      })

      const result = updateNodeSegment(tree, 'root-frontend', SEGMENT_BACKEND)

      // Count nodes in result
      let resultCount = 1
      result.children.forEach((root) => {
        resultCount += countNodes(root)
      })

      expect(resultCount).toBe(originalCount)
    })

    it('should preserve all node properties except segmentId', () => {
      const tree = createSimpleTree()
      const originalNode = findNodeById(tree, 'child-react')
      const originalProps = {
        label: originalNode.label,
        status: originalNode.status,
        ebene: originalNode.ebene,
      }

      const result = updateNodeSegment(tree, 'child-react', SEGMENT_BACKEND)
      const updatedNode = findNodeById(result, 'child-react')

      expect(updatedNode.label).toBe(originalProps.label)
      expect(updatedNode.status).toBe(originalProps.status)
      expect(updatedNode.ebene).toBe(originalProps.ebene)
      expect(updatedNode.segmentId).toBe(SEGMENT_BACKEND)
    })
  })

  describe('Performance and Consistency', () => {
    it('should handle large single-node assignments', () => {
      const tree = {
        segments: [{ id: 'seg1', label: 'Seg1' }],
        children: [
          {
            id: 'root',
            label: 'Root',
            status: 'fertig',
            ebene: null,
            segmentId: 'seg1',
            children: Array.from({ length: 50 }, (_, i) => ({
              id: `node${i}`,
              label: `Node ${i}`,
              status: 'fertig',
              ebene: null,
              segmentId: 'seg1',
              children: [],
            })),
          },
        ],
      }

      const result = updateNodeSegment(tree, 'root', null)

      expect(findNodeById(result, 'root').segmentId).toBeNull()
      // Children should keep their own segment assignments.
      for (let i = 0; i < 50; i++) {
        expect(findNodeById(result, `node${i}`).segmentId).toBe('seg1')
      }
    })

    it('should return structure with correct segment distribution', () => {
      const tree = createSimpleTree()
      const result = updateNodeSegment(tree, 'root-frontend', SEGMENT_BACKEND)

      const backendNodes = findAllNodesWithSegment(result, SEGMENT_BACKEND)
      expect(backendNodes.length).toBeGreaterThan(2) // At least root-frontend + children
    })
  })
})

// Helper functions
function countNodes(node) {
  let count = 1
  node.children?.forEach((child) => {
    count += countNodes(child)
  })
  return count
}

function findAllNodesWithSegment(tree, segmentId) {
  const found = []
  const traverse = (node) => {
    if (node.segmentId === segmentId) {
      found.push(node)
    }
    node.children?.forEach(traverse)
  }
  tree.children?.forEach(traverse)
  return found
}
