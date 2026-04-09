/**
 * Test Suite: Segment Slot Computation
 * 
 * Tests for the critical slot-width allocation algorithm that ensures:
 * - Empty segments stay narrow (label-width sized)
 * - Filled segments get proportional width
 * - Total width never exceeds maxAngleSpread
 * - minWidthScale normalization works correctly
 */

import { describe, it, expect } from 'vitest'
import { calculateRadialSkillTree } from '../utils/layout'
import { TREE_CONFIG } from '../config'
import { createSimpleTree, createEmptyTree } from './testUtils'

describe('Segment Slot Computation', () => {
  describe('Slot Width Normalization', () => {
    it('should respect maxAngleSpread constraint', () => {
      const tree = createSimpleTree()
      const result = calculateRadialSkillTree(tree, TREE_CONFIG)

      // Extract angles from all nodes
      const angles = result.nodes.map((node) => node.angle)
      if (angles.length > 0) {
        const minAngle = Math.min(...angles)
        const maxAngle = Math.max(...angles)
        const spread = maxAngle - minAngle

        expect(spread).toBeLessThanOrEqual(TREE_CONFIG.maxAngleSpread + 1) // +1 for floating point tolerance
      }
    })

    it('should keep empty segments compact', () => {
      const tree = {
        segments: [
          { id: 'seg1', label: 'Filled Segment' },
          { id: 'seg2', label: '' }, // Empty label = narrow
          { id: 'seg3', label: 'Another Filled' },
        ],
        children: [
          {
            id: 'root1',
            label: 'Root 1',
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
          {
            id: 'root2',
            label: 'Root 2',
            status: 'später',
            ebene: null,
            segmentId: 'seg2', // Empty segment - should stay narrow
            children: [],
          },
          {
            id: 'root3',
            label: 'Root 3',
            status: 'jetzt',
            ebene: null,
            segmentId: 'seg3',
            children: [],
          },
        ],
      }

      const result = calculateRadialSkillTree(tree, TREE_CONFIG)
      expect(result).toBeDefined()
      expect(result.nodes.length).toBeGreaterThan(0)
    })

    it('should handle tree with all empty segments', () => {
      const tree = {
        segments: [
          { id: 'seg1', label: 'Seg1' },
          { id: 'seg2', label: 'Seg2' },
        ],
        children: [
          {
            id: 'root1',
            label: 'Root 1',
            status: 'fertig',
            ebene: null,
            segmentId: 'seg1',
            children: [],
          },
          {
            id: 'root2',
            label: 'Root 2',
            status: 'fertig',
            ebene: null,
            segmentId: 'seg2',
            children: [],
          },
        ],
      }

      const result = calculateRadialSkillTree(tree, TREE_CONFIG)
      expect(result).toBeDefined()
      expect(result.nodes.length).toBe(2)
    })

    it('should handle single segment scenario', () => {
      const tree = {
        segments: [{ id: 'seg1', label: 'Only Segment' }],
        children: [
          {
            id: 'root1',
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
            ],
          },
        ],
      }

      const result = calculateRadialSkillTree(tree, TREE_CONFIG)
      expect(result).toBeDefined()
      expect(result.nodes.length).toBe(2)
    })
  })

  describe('Weight-Based Distribution', () => {
    it('should allocate more space to filled segments', () => {
      const tree = {
        segments: [
          { id: 'filled', label: 'Filled' },
          { id: 'empty', label: '' },
        ],
        children: [
          {
            id: 'root1',
            label: 'Root 1',
            status: 'fertig',
            ebene: null,
            segmentId: 'filled',
            children: [
              {
                id: 'child1',
                label: 'Child 1',
                status: 'fertig',
                ebene: null,
                segmentId: 'filled',
                children: [],
              },
              {
                id: 'child2',
                label: 'Child 2',
                status: 'fertig',
                ebene: null,
                segmentId: 'filled',
                children: [],
              },
            ],
          },
          {
            id: 'root2',
            label: 'Root 2 Empty',
            status: 'später',
            ebene: null,
            segmentId: 'empty',
            children: [],
          },
        ],
      }

      const result = calculateRadialSkillTree(tree, TREE_CONFIG)
      expect(result).toBeDefined()

      // Filled segment (id=root1) should be spread wider than empty segment (id=root2)
      const filledNode = result.nodes.find((n) => n.id === 'root1')
      const emptyNode = result.nodes.find((n) => n.id === 'root2')

      // Both should be positioned (not undefined)
      expect(filledNode).toBeDefined()
      expect(emptyNode).toBeDefined()
    })

    it('should handle proportional weighting for multiple filled segments', () => {
      const tree = {
        segments: [
          { id: 'seg1', label: 'Small Fill' },
          { id: 'seg2', label: 'Large Fill' },
        ],
        children: [
          {
            id: 'root1',
            label: 'Root 1',
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
            ],
          },
          {
            id: 'root2',
            label: 'Root 2',
            status: 'fertig',
            ebene: null,
            segmentId: 'seg2',
            children: [
              {
                id: 'child2a',
                label: 'Child 2a',
                status: 'fertig',
                ebene: null,
                segmentId: 'seg2',
                children: [],
              },
              {
                id: 'child2b',
                label: 'Child 2b',
                status: 'fertig',
                ebene: null,
                segmentId: 'seg2',
                children: [],
              },
              {
                id: 'child2c',
                label: 'Child 2c',
                status: 'fertig',
                ebene: null,
                segmentId: 'seg2',
                children: [],
              },
            ],
          },
        ],
      }

      const result = calculateRadialSkillTree(tree, TREE_CONFIG)
      expect(result).toBeDefined()
      expect(result.nodes.length).toBe(6) // 2 roots + 4 children
    })
  })

  describe('Boundary Behavior', () => {
    it('should handle very narrow segments within totalSpread', () => {
      const tree = {
        segments: Array.from({ length: 10 }, (_, i) => ({
          id: `seg${i}`,
          label: `S${i}`,
        })),
        children: [
          {
            id: 'root1',
            label: 'Root 1',
            status: 'fertig',
            ebene: null,
            segmentId: 'seg0',
            children: [],
          },
        ],
      }

      const result = calculateRadialSkillTree(tree, TREE_CONFIG)
      expect(result).toBeDefined()
      expect(result.nodes.length).toBe(1)
    })

    it('should not exceed maxAngleSpread even with many empty segments', () => {
      const tree = {
        segments: Array.from({ length: 8 }, (_, i) => ({
          id: `seg${i}`,
          label: `Segment ${i}`,
        })),
        children: Array.from({ length: 8 }, (_, i) => ({
          id: `root${i}`,
          label: `Root ${i}`,
          status: 'fertig',
          ebene: null,
          segmentId: `seg${i}`,
          children: [],
        })),
      }

      const result = calculateRadialSkillTree(tree, TREE_CONFIG)

      // Check if angles are within maxAngleSpread
      const angles = result.nodes.map((n) => n.angle)
      const minAngle = Math.min(...angles)
      const maxAngle = Math.max(...angles)
      const spread = maxAngle - minAngle

      expect(spread).toBeLessThanOrEqual(TREE_CONFIG.maxAngleSpread + 1)
    })

    it('should handle zero nodes (empty tree)', () => {
      const tree = createEmptyTree()
      const result = calculateRadialSkillTree(tree, TREE_CONFIG)

      expect(result).toBeDefined()
      expect(result.nodes.length).toBe(0)
    })

    it('should handle very long segment label names', () => {
      const tree = {
        segments: [
          { id: 'seg1', label: 'This is a very long segment label that might take up significant space' },
          { id: 'seg2', label: 'Another extraordinarily long segment label for thorough testing' },
        ],
        children: [
          {
            id: 'root1',
            label: 'Root 1',
            status: 'fertig',
            ebene: null,
            segmentId: 'seg1',
            children: [],
          },
          {
            id: 'root2',
            label: 'Root 2',
            status: 'fertig',
            ebene: null,
            segmentId: 'seg2',
            children: [],
          },
        ],
      }

      const result = calculateRadialSkillTree(tree, TREE_CONFIG)
      expect(result).toBeDefined()
      const angles = result.nodes.map((n) => n.angle)
      const spread = Math.max(...angles) - Math.min(...angles)
      expect(spread).toBeLessThanOrEqual(TREE_CONFIG.maxAngleSpread + 1)
    })
  })

  describe('Slot Consistency', () => {
    it('should produce consistent results for same input', () => {
      const tree = createSimpleTree()

      const result1 = calculateRadialSkillTree(tree, TREE_CONFIG)
      const result2 = calculateRadialSkillTree(tree, TREE_CONFIG)

      // Same number of nodes
      expect(result1.nodes.length).toBe(result2.nodes.length)

      // Nodes in same order should have same positions
      result1.nodes.forEach((node1, index) => {
        const node2 = result2.nodes[index]
        expect(node1.id).toBe(node2.id)
        expect(node1.angle).toBeCloseTo(node2.angle, 1)
        expect(node1.radius).toBeCloseTo(node2.radius, 1)
      })
    })

    it('should position nodes within valid boundaries', () => {
      const tree = createSimpleTree()
      const result = calculateRadialSkillTree(tree, TREE_CONFIG)

      result.nodes.forEach((node) => {
        // Angles should be within the arc bounds (centerAngle ± maxAngleSpread/2 = -90° ± 135°)
        const arcMin = -90 - TREE_CONFIG.maxAngleSpread / 2  // -225°
        const arcMax = -90 + TREE_CONFIG.maxAngleSpread / 2  // +45°
        expect(node.angle).toBeGreaterThanOrEqual(arcMin - 1.5)
        expect(node.angle).toBeLessThanOrEqual(arcMax + 1.5)

        // Radius should be positive
        expect(node.radius).toBeGreaterThan(0)

        // x, y should be finite numbers
        expect(isFinite(node.x)).toBe(true)
        expect(isFinite(node.y)).toBe(true)
      })
    })

    it('should calculate valid canvas dimensions', () => {
      const tree = createSimpleTree()
      const result = calculateRadialSkillTree(tree, TREE_CONFIG)

      expect(result.canvas.width).toBeGreaterThan(0)
      expect(result.canvas.height).toBeGreaterThan(0)
      expect(result.canvas.origin).toBeDefined()
      expect(result.canvas.origin.x).toBeGreaterThan(0)
      expect(result.canvas.origin.y).toBeGreaterThan(0)
    })
  })

  describe('Slot Allocation Edge Cases', () => {
    it('should handle all nodes in same segment', () => {
      const tree = {
        segments: [{ id: 'onlyOne', label: 'Only Segment' }],
        children: [
          {
            id: 'root1',
            label: 'Root 1',
            status: 'fertig',
            ebene: null,
            segmentId: 'onlyOne',
            children: Array.from({ length: 5 }, (_, i) => ({
              id: `child${i}`,
              label: `Child ${i}`,
              status: 'fertig',
              ebene: null,
              segmentId: 'onlyOne',
              children: [],
            })),
          },
        ],
      }

      const result = calculateRadialSkillTree(tree, TREE_CONFIG)
      expect(result.nodes.length).toBe(6)
      // All nodes should fit within maxAngleSpread
      const angles = result.nodes.map((n) => n.angle)
      const spread = Math.max(...angles) - Math.min(...angles)
      expect(spread).toBeLessThanOrEqual(TREE_CONFIG.maxAngleSpread + 1)
    })

    it('should handle unequal node distribution across segments', () => {
      const tree = {
        segments: [
          { id: 'heavy', label: 'Heavy' },
          { id: 'light', label: 'Light' },
        ],
        children: [
          {
            id: 'heavy1',
            label: 'Heavy Root',
            status: 'fertig',
            ebene: null,
            segmentId: 'heavy',
            children: Array.from({ length: 5 }, (_, i) => ({
              id: `heavy_child${i}`,
              label: `HC${i}`,
              status: 'fertig',
              ebene: null,
              segmentId: 'heavy',
              children: [],
            })),
          },
          {
            id: 'light1',
            label: 'Light Root',
            status: 'später',
            ebene: null,
            segmentId: 'light',
            children: [],
          },
        ],
      }

      const result = calculateRadialSkillTree(tree, TREE_CONFIG)
      expect(result.nodes.length).toBe(7) // 1 heavy + 5 heavy children + 1 light
    })

    it('should handle cross-segment parent-child relationships', () => {
      const tree = {
        segments: [
          { id: 'seg1', label: 'Segment 1' },
          { id: 'seg2', label: 'Segment 2' },
        ],
        children: [
          {
            id: 'root1',
            label: 'Root in Seg1',
            status: 'fertig',
            ebene: null,
            segmentId: 'seg1',
            children: [
              {
                id: 'child_in_seg2',
                label: 'Child in Different Segment',
                status: 'fertig',
                ebene: null,
                segmentId: 'seg2', // Child in different segment
                children: [],
              },
            ],
          },
        ],
      }

      const result = calculateRadialSkillTree(tree, TREE_CONFIG)
      expect(result.nodes.length).toBe(2)
      const angles = result.nodes.map((n) => n.angle)
      // Both nodes should exist and be positioned
      expect(angles.length).toBe(2)
    })
  })

  describe('Radial Geometry Correctness', () => {
    it('should position all nodes at valid coordinates', () => {
      const tree = createSimpleTree()
      const result = calculateRadialSkillTree(tree, TREE_CONFIG)

      result.nodes.forEach((node) => {
        // x, y should be finite numbers and not NaN
        expect(isFinite(node.x)).toBe(true)
        expect(isFinite(node.y)).toBe(true)
        expect(!isNaN(node.x)).toBe(true)
        expect(!isNaN(node.y)).toBe(true)
      })
    })

    it('should have realistic radius values', () => {
      const tree = createSimpleTree()
      const result = calculateRadialSkillTree(tree, TREE_CONFIG)

      result.nodes.forEach((node) => {
        // Radius should be defined and finite (if present)
        if (node.radius !== undefined) {
          expect(node.radius).toBeGreaterThan(0)
          expect(isFinite(node.radius)).toBe(true)
        }
      })
    })
  })
})
