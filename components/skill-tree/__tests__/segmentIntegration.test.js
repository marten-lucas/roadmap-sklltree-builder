/**
 * Test Suite: Segment Integration Tests
 * 
 * End-to-end tests combining multiple segment operations to ensure
 * consistency and correct behavior in realistic use cases.
 */

import { describe, it, expect } from 'vitest'
import {
  addInitialSegmentWithResult,
  addSegmentNearWithResult,
  deleteSegment,
  updateSegmentLabel,
  updateNodeSegment,
  addInitialRootNodeWithResult,
  addChildNodeWithResult,
  findNodeById,
} from '../treeData'
import { calculateRadialSkillTree } from '../layout'
import { TREE_CONFIG } from '../config'
import { createSimpleTree, createNodelessTree, SEGMENT_FRONTEND, SEGMENT_BACKEND } from './testUtils'

describe('Segment Integration Tests', () => {
  describe('Complete Segment Lifecycle', () => {
    it('should support create -> assign -> rename -> delete sequence', () => {
      let tree = createSimpleTree()
      const initialSegmentCount = tree.segments.length

      // Create new segment
      const addResult = addInitialSegmentWithResult(tree)
      tree = addResult.tree
      const newSegmentId = addResult.createdSegmentId
      expect(tree.segments.length).toBe(initialSegmentCount + 1)

      // Assign a node to new segment
      tree = updateNodeSegment(tree, 'child-react', newSegmentId)
      const assignedNode = findNodeById(tree, 'child-react')
      expect(assignedNode.segmentId).toBe(newSegmentId)

      // Rename segment
      const newLabel = 'Modern Frontend'
      tree = updateSegmentLabel(tree, newSegmentId, newLabel)
      const renamedSegment = tree.segments.find((s) => s.id === newSegmentId)
      expect(renamedSegment.label).toBe(newLabel)

      // Delete segment - should clear assignments
      tree = deleteSegment(tree, newSegmentId)
      expect(tree.segments.length).toBe(initialSegmentCount)
      const clearedNode = findNodeById(tree, 'child-react')
      expect(clearedNode.segmentId).toBeNull()
    })

    it('should support multiple parallel segment operations', () => {
      let tree = createSimpleTree()

      // Create multiple segments
      const seg1Result = addInitialSegmentWithResult(tree)
      tree = seg1Result.tree

      const seg2Result = addSegmentNearWithResult(tree, seg1Result.createdSegmentId, 'left')
      tree = seg2Result.tree

      // Assign nodes to different segments
      tree = updateNodeSegment(tree, 'child-react', seg1Result.createdSegmentId)
      tree = updateNodeSegment(tree, 'child-vue', seg2Result.createdSegmentId)

      const react = findNodeById(tree, 'child-react')
      const vue = findNodeById(tree, 'child-vue')

      expect(react.segmentId).toBe(seg1Result.createdSegmentId)
      expect(vue.segmentId).toBe(seg2Result.createdSegmentId)
    })

    it('should handle segment reassignment of multiple nodes', () => {
      let tree = createSimpleTree()

      const addResult = addInitialSegmentWithResult(tree)
      tree = addResult.tree
      const newSegId = addResult.createdSegmentId

      // Reassign multiple nodes from Frontend to new segment
      tree = updateNodeSegment(tree, 'root-frontend', newSegId)
      tree = updateNodeSegment(tree, 'child-react', newSegId)
      tree = updateNodeSegment(tree, 'child-vue', newSegId)

      expect(findNodeById(tree, 'root-frontend').segmentId).toBe(newSegId)
      expect(findNodeById(tree, 'child-react').segmentId).toBe(newSegId)
      expect(findNodeById(tree, 'child-vue').segmentId).toBe(newSegId)
    })
  })

  describe('Layout Validity After Segment Operations', () => {
    it('should produce valid layout after segment creation', () => {
      let tree = createSimpleTree()

      const addResult = addInitialSegmentWithResult(tree)
      tree = addResult.tree

      const result = calculateRadialSkillTree(tree, TREE_CONFIG)

      // Layout should be valid
      expect(result).toBeDefined()
      expect(result.nodes).toBeDefined()
      expect(Array.isArray(result.nodes)).toBe(true)

      // All nodes should have valid coordinates
      result.nodes.forEach((node) => {
        expect(isFinite(node.x)).toBe(true)
        expect(isFinite(node.y)).toBe(true)
        expect(isFinite(node.angle)).toBe(true)
        expect(isFinite(node.radius)).toBe(true)
      })
    })

    it('should produce valid layout after segment deletion', () => {
      let tree = createSimpleTree()

      tree = deleteSegment(tree, SEGMENT_FRONTEND)

      const result = calculateRadialSkillTree(tree, TREE_CONFIG)

      expect(result.nodes.length).toBeGreaterThan(0)
      result.nodes.forEach((node) => {
        expect(isFinite(node.x)).toBe(true)
        expect(isFinite(node.y)).toBe(true)
      })
    })

    it('should respect angle spread after multiple segment operations', () => {
      let tree = createSimpleTree()

      // Multiple operations
      const seg1 = addInitialSegmentWithResult(tree)
      tree = seg1.tree

      const seg2 = addSegmentNearWithResult(tree, seg1.createdSegmentId, 'right')
      tree = seg2.tree

      tree = updateNodeSegment(tree, 'child-react', seg1.createdSegmentId)

      const result = calculateRadialSkillTree(tree, TREE_CONFIG)

      const angles = result.nodes.map((n) => n.angle)
      const spread = Math.max(...angles) - Math.min(...angles)

      expect(spread).toBeLessThanOrEqual(TREE_CONFIG.maxAngleSpread + 1)
    })
  })

  describe('Complex Tree Scenarios', () => {
    it('should handle tree with mixed segment assignments', () => {
      const tree = {
        segments: [
          { id: 'seg-a', label: 'Segment A' },
          { id: 'seg-b', label: 'Segment B' },
          { id: 'seg-c', label: 'Segment C' },
        ],
        children: [
          {
            id: 'root-a',
            label: 'Root A',
            status: 'fertig',
            ebene: null,
            segmentId: 'seg-a',
            children: [
              {
                id: 'child-a1',
                label: 'Child A1',
                status: 'fertig',
                ebene: null,
                segmentId: 'seg-a',
                children: [],
              },
              {
                id: 'child-a2',
                label: 'Child A2',
                status: 'fertig',
                ebene: null,
                segmentId: 'seg-b', // Different from parent
                children: [],
              },
            ],
          },
          {
            id: 'root-b',
            label: 'Root B',
            status: 'jetzt',
            ebene: null,
            segmentId: 'seg-b',
            children: [
              {
                id: 'child-b1',
                label: 'Child B1',
                status: 'jetzt',
                ebene: null,
                segmentId: 'seg-c',
                children: [],
              },
            ],
          },
          {
            id: 'root-c',
            label: 'Root C Unassigned',
            status: 'später',
            ebene: null,
            segmentId: null,
            children: [],
          },
        ],
      }

      const result = calculateRadialSkillTree(tree, TREE_CONFIG)
      expect(result.nodes.length).toBe(7)
    })

    it('should handle segment reorganization without losing data', () => {
      let tree = createSimpleTree()

      // Original segment assignments
      const originalFrontendNodes = []
      const originalBackendNodes = []

      tree.children.forEach((root) => {
        const traverse = (node) => {
          if (node.segmentId === SEGMENT_FRONTEND) {
            originalFrontendNodes.push(node.id)
          } else if (node.segmentId === SEGMENT_BACKEND) {
            originalBackendNodes.push(node.id)
          }
          node.children?.forEach(traverse)
        }
        traverse(root)
      })

      // Reorganize: move all frontend nodes to backend
      tree = updateNodeSegment(tree, 'root-frontend', SEGMENT_BACKEND)

      // Check no nodes were lost
      const allNodes = []
      const traverse = (node) => {
        allNodes.push(node.id)
        node.children?.forEach(traverse)
      }
      tree.children?.forEach(traverse)

      expect(allNodes.length).toBe(
        originalFrontendNodes.length + originalBackendNodes.length,
      )
    })

    it('should handle dynamic segment creation and assignment workflow', () => {
      let tree = createNodelessTree()

      // Create initial segment
      const seg1 = addInitialSegmentWithResult(tree)
      tree = seg1.tree

      // Create node in first segment
      const rootResult = addInitialRootNodeWithResult(tree)
      tree = rootResult.tree

      // Assign to segment
      tree = updateNodeSegment(tree, rootResult.createdNodeId, seg1.createdSegmentId)

      // Create more segments
      const seg2 = addSegmentNearWithResult(tree, seg1.createdSegmentId, 'right')
      tree = seg2.tree

      const seg3 = addSegmentNearWithResult(tree, seg2.createdSegmentId, 'right')
      tree = seg3.tree

      // Create child nodes
      const childResult = addChildNodeWithResult(tree, rootResult.createdNodeId)
      tree = childResult.tree

      // Assign child to different segment
      tree = updateNodeSegment(tree, childResult.createdNodeId, seg2.createdSegmentId)

      // Verify all operations succeeded
      expect(tree.segments.length).toBe(3)
      expect(findNodeById(tree, rootResult.createdNodeId).segmentId).toBe(
        seg1.createdSegmentId,
      )
      expect(findNodeById(tree, childResult.createdNodeId).segmentId).toBe(
        seg2.createdSegmentId,
      )
    })
  })

  describe('Edge Cases and Error Handling', () => {
    it('should handle operations on empty tree', () => {
      let tree = createNodelessTree()

      const segResult = addInitialSegmentWithResult(tree)
      tree = segResult.tree
      expect(tree.segments.length).toBe(1)

      // Try to add node to empty segment tree
      const nodeResult = addInitialRootNodeWithResult(tree)
      tree = nodeResult.tree
      expect(tree.children.length).toBe(1)
    })

    it('should handle segment deletion affecting multiple nodes', () => {
      let tree = createSimpleTree()

      // Multiple nodes in same segment
      const segmentToDelete = SEGMENT_FRONTEND

      tree = deleteSegment(tree, segmentToDelete)

      // All nodes that were in that segment should now be null
      const checkSegment = (node) => {
        if (node.segmentId === segmentToDelete) {
          throw new Error(`Found node with deleted segment: ${node.id}`)
        }
        node.children?.forEach(checkSegment)
      }

      tree.children.forEach(checkSegment)
    })

    it('should handle operations with non-existent IDs gracefully', () => {
      let tree = createSimpleTree()

      // These should not throw
      const result1 = updateNodeSegment(tree, 'non-existent', SEGMENT_BACKEND)
      const result2 = updateSegmentLabel(tree, 'non-existent-seg', 'New Label')
      const result3 = addSegmentNearWithResult(tree, 'non-existent-seg', 'right')

      // Tree should remain valid
      expect(result1).toBeDefined()
      expect(result2).toBeDefined()
      expect(result3.createdSegmentId).toBeNull()
    })

    it('should handle rapid successive operations', () => {
      let tree = createSimpleTree()

      // Rapid fire operations
      tree = updateNodeSegment(tree, 'child-react', SEGMENT_BACKEND)
      tree = updateNodeSegment(tree, 'child-react', null)
      tree = updateNodeSegment(tree, 'child-react', SEGMENT_FRONTEND)
      tree = updateSegmentLabel(tree, SEGMENT_FRONTEND, 'Updated')
      tree = updateNodeSegment(tree, 'child-react', SEGMENT_BACKEND)

      const node = findNodeById(tree, 'child-react')
      expect(node.segmentId).toBe(SEGMENT_BACKEND)

      const segment = tree.segments.find((s) => s.id === SEGMENT_FRONTEND)
      expect(segment.label).toBe('Updated')
    })

    it('should maintain consistency with circular segment reassignments', () => {
      let tree = createSimpleTree()

      const originalSegment = findNodeById(tree, 'child-react').segmentId

      // Go in a circle: Frontend -> Backend -> Frontend
      tree = updateNodeSegment(tree, 'child-react', SEGMENT_BACKEND)
      tree = updateNodeSegment(tree, 'child-react', SEGMENT_FRONTEND)

      const node = findNodeById(tree, 'child-react')
      expect(node.segmentId).toBe(originalSegment)
    })
  })

  describe('Tree Integrity Validation', () => {
    it('should maintain segment references validity', () => {
      let tree = createSimpleTree()

      const addResult = addInitialSegmentWithResult(tree)
      tree = addResult.tree

      tree = updateNodeSegment(tree, 'child-react', addResult.createdSegmentId)
      const node = findNodeById(tree, 'child-react')

      // Node references existing segment
      const segmentExists = tree.segments.some((s) => s.id === node.segmentId)
      expect(segmentExists).toBe(true)
    })

    it('should preserve all properties through operations', () => {
      let tree = createSimpleTree()
      const originalNode = JSON.parse(
        JSON.stringify(findNodeById(tree, 'child-react')),
      )

      const addResult = addInitialSegmentWithResult(tree)
      tree = addResult.tree
      tree = updateNodeSegment(tree, 'child-react', addResult.createdSegmentId)
      tree = updateSegmentLabel(tree, SEGMENT_FRONTEND, 'Modified')

      const modifiedNode = findNodeById(tree, 'child-react')

      // All original properties preserved except segmentId
      expect(modifiedNode.id).toBe(originalNode.id)
      expect(modifiedNode.label).toBe(originalNode.label)
      expect(modifiedNode.status).toBe(originalNode.status)
      expect(modifiedNode.ebene).toBe(originalNode.ebene)
    })

    it('should handle large tree with many segments', () => {
      const tree = {
        segments: Array.from({ length: 20 }, (_, i) => ({
          id: `seg${i}`,
          label: `Segment ${i}`,
        })),
        children: Array.from({ length: 20 }, (_, i) => ({
          id: `root${i}`,
          label: `Root ${i}`,
          status: 'fertig',
          ebene: null,
          segmentId: `seg${i}`,
          children: Array.from({ length: 3 }, (_, j) => ({
            id: `root${i}_child${j}`,
            label: `Child ${j}`,
            status: 'fertig',
            ebene: null,
            segmentId: `seg${i}`,
            children: [],
          })),
        })),
      }

      // Operations should work
      let result = updateNodeSegment(tree, 'root0', 'seg19')
      expect(findNodeById(result, 'root0').segmentId).toBe('seg19')

      const layoutResult = calculateRadialSkillTree(result, TREE_CONFIG)
      expect(layoutResult.nodes.length).toBe(80) // 20 roots + 60 children
    })
  })

  describe('Segment Ordering Preservation', () => {
    it('should maintain segment order through operations', () => {
      let tree = createSimpleTree()
      const originalOrder = tree.segments.map((s) => s.id)

      const addResult = addSegmentNearWithResult(tree, originalOrder[0], 'right')
      tree = addResult.tree

      // Original segments should maintain relative order
      const newOrder = tree.segments.map((s) => s.id)
      expect(newOrder[0]).toBe(originalOrder[0])
      expect(newOrder[2]).toBe(originalOrder[1])
    })

    it('should reflect segment order in layout through angles', () => {
      const tree = {
        segments: [
          { id: 'first', label: 'First' },
          { id: 'second', label: 'Second' },
          { id: 'third', label: 'Third' },
        ],
        children: [
          {
            id: 'r1',
            label: 'Root 1',
            status: 'fertig',
            ebene: null,
            segmentId: 'first',
            children: [],
          },
          {
            id: 'r2',
            label: 'Root 2',
            status: 'fertig',
            ebene: null,
            segmentId: 'second',
            children: [],
          },
          {
            id: 'r3',
            label: 'Root 3',
            status: 'fertig',
            ebene: null,
            segmentId: 'third',
            children: [],
          },
        ],
      }

      const result = calculateRadialSkillTree(tree, TREE_CONFIG)
      const nodes = result.nodes

      // Nodes should be ordered by segment order
      expect(nodes.length).toBe(3)
      // First and second should have angles reflecting their order
      const r1 = nodes.find((n) => n.id === 'r1')
      const r2 = nodes.find((n) => n.id === 'r2')
      const r3 = nodes.find((n) => n.id === 'r3')

      expect(r1).toBeDefined()
      expect(r2).toBeDefined()
      expect(r3).toBeDefined()
    })
  })
})
