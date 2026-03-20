import { describe, it, expect } from 'vitest'
import { findNodeById, updateNodeData, updateNodeSegment, updateNodeLevel } from '../treeData'
import { createSimpleTree, createCrossSegmentTree, SEGMENT_FRONTEND, SEGMENT_BACKEND } from './testUtils'

describe('treeData', () => {
  describe('findNodeById', () => {
    const tree = createSimpleTree()

    it('should find node by id at root level', () => {
      const node = findNodeById(tree, 'root-frontend')
      expect(node).toBeDefined()
      expect(node.label).toBe('Frontend')
    })

    it('should find node by id in nested children', () => {
      const node = findNodeById(tree, 'child-react')
      expect(node).toBeDefined()
      expect(node.label).toBe('React')
    })

    it('should return null for non-existent node', () => {
      const node = findNodeById(tree, 'non-existent')
      expect(node).toBeNull()
    })

    it('should return null for null input', () => {
      const node = findNodeById(null, 'any-id')
      expect(node).toBeNull()
    })
  })

  describe('updateNodeData', () => {
    it('should update label and status of a node', () => {
      const tree = createSimpleTree()
      const newTree = updateNodeData(tree, 'child-react', 'React.js', 'jetzt')

      expect(tree).not.toBe(newTree) // Should be a new object
      const updatedNode = findNodeById(newTree, 'child-react')
      expect(updatedNode.label).toBe('React.js')
      expect(updatedNode.status).toBe('jetzt')
    })

    it('should not mutate original tree', () => {
      const tree = createSimpleTree()
      const originalLabel = findNodeById(tree, 'child-react').label
      updateNodeData(tree, 'child-react', 'Changed', 'später')

      expect(findNodeById(tree, 'child-react').label).toBe(originalLabel)
    })

    it('should update nested nodes', () => {
      const tree = createSimpleTree()
      const newTree = updateNodeData(tree, 'child-db', 'PostgreSQL', 'fertig')

      const updatedNode = findNodeById(newTree, 'child-db')
      expect(updatedNode.label).toBe('PostgreSQL')
      expect(updatedNode.status).toBe('fertig')
    })
  })

  describe('updateNodeSegment', () => {
    it('should change node segment to different segment', () => {
      const tree = createSimpleTree()
      const newTree = updateNodeSegment(tree, 'child-react', SEGMENT_BACKEND)

      const updatedNode = findNodeById(newTree, 'child-react')
      expect(updatedNode.segmentId).toBe(SEGMENT_BACKEND)
    })

    it('should change node segment to null', () => {
      const tree = createSimpleTree()
      const newTree = updateNodeSegment(tree, 'child-react', null)

      const updatedNode = findNodeById(newTree, 'child-react')
      expect(updatedNode.segmentId).toBeNull()
    })

    it('should move entire subtree when parent segment changes (recursive)', () => {
      const tree = createSimpleTree()
      const newTree = updateNodeSegment(tree, 'root-frontend', SEGMENT_BACKEND)

      // Parent and ALL descendants should change (recursive behavior)
      const parent = findNodeById(newTree, 'root-frontend')
      const child = findNodeById(newTree, 'child-react')

      expect(parent.segmentId).toBe(SEGMENT_BACKEND)
      expect(child.segmentId).toBe(SEGMENT_BACKEND) // Descendants move with parent
    })

    it('should preserve tree structure', () => {
      const tree = createSimpleTree()
      const newTree = updateNodeSegment(tree, 'child-react', SEGMENT_BACKEND)

      expect(newTree.segments).toEqual(tree.segments)
      expect(newTree.children.length).toBe(tree.children.length)
    })

    it('should handle cross-segment trees', () => {
      const tree = createCrossSegmentTree()
      const newTree = updateNodeSegment(tree, 'api-consumption', SEGMENT_FRONTEND)

      const node = findNodeById(newTree, 'api-consumption')
      expect(node.segmentId).toBe(SEGMENT_FRONTEND)
    })
  })

  describe('updateNodeLevel', () => {
    it('should update node level', () => {
      const tree = {
        segments: [{ id: 'seg1', label: 'Segment 1' }],
        children: [
          {
            id: 'parent',
            label: 'Parent',
            status: 'fertig',
            ebene: 1,
            segmentId: 'seg1',
            children: [
              {
                id: 'child',
                label: 'Child',
                status: 'fertig',
                ebene: 2,
                segmentId: 'seg1',
                children: [],
              },
            ],
          },
        ],
      }

      const newTree = updateNodeLevel(tree, 'child', 3)
      const updatedNode = findNodeById(newTree, 'child')

      expect(updatedNode.ebene).toBe(3)
    })

    it('should increase all children levels proportionally', () => {
      const tree = {
        segments: [{ id: 'seg1', label: 'Segment 1' }],
        children: [
          {
            id: 'root',
            label: 'Root',
            status: 'fertig',
            ebene: 1,
            segmentId: 'seg1',
            children: [
              {
                id: 'level-2',
                label: 'Level 2',
                status: 'fertig',
                ebene: 2,
                segmentId: 'seg1',
                children: [
                  {
                    id: 'level-3',
                    label: 'Level 3',
                    status: 'fertig',
                    ebene: 3,
                    segmentId: 'seg1',
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      }

      const newTree = updateNodeLevel(tree, 'level-2', 4)

      const level2 = findNodeById(newTree, 'level-2')
      const level3 = findNodeById(newTree, 'level-3')

      expect(level2.ebene).toBe(4)
      expect(level3.ebene).toBeGreaterThan(4) // Should adjust children
    })
  })
})
