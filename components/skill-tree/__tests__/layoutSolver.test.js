import { describe, it, expect } from 'vitest'
import { solveSkillTreeLayout } from '../layoutSolver'
import { TREE_CONFIG } from '../config'
import { createSimpleTree, createCrossSegmentTree, createDenseTree, createEmptyTree, countNodesInTree } from './testUtils'

describe('layoutSolver', () => {
  describe('solveSkillTreeLayout', () => {
    it('should solve layout for simple tree', () => {
      const tree = createSimpleTree()
      const result = solveSkillTreeLayout(tree, TREE_CONFIG)

      expect(result).toBeDefined()
      expect(result.layout).toBeDefined()
      expect(result.diagnostics).toBeDefined()
      expect(result.meta).toBeDefined()
      expect(Array.isArray(result.diagnostics.issues)).toBe(true)
    })

    it('should return same layout for identical inputs (determinism)', () => {
      const tree = createSimpleTree()
      const result1 = solveSkillTreeLayout(tree, TREE_CONFIG)
      const result2 = solveSkillTreeLayout(tree, TREE_CONFIG)

      expect(result1.layout.nodes.length).toBe(result2.layout.nodes.length)
    })

    it('should handle empty tree', () => {
      const tree = createEmptyTree()
      const result = solveSkillTreeLayout(tree, TREE_CONFIG)

      expect(result).toBeDefined()
      expect(result.layout.nodes.length).toBe(0)
      expect(result.diagnostics).toBeDefined()
    })

    it('should position all nodes', () => {
      const tree = createSimpleTree()
      const result = solveSkillTreeLayout(tree, TREE_CONFIG)

      const nodeCount = countNodesInTree(tree)
      expect(result.layout.nodes.length).toBe(nodeCount)

      result.layout.nodes.forEach((node) => {
        expect(node.x).toBeDefined()
        expect(node.y).toBeDefined()
        expect(node.angle).toBeDefined()
        expect(node.radius).toBeDefined()
        expect(typeof node.x).toBe('number')
        expect(typeof node.y).toBe('number')
        expect(typeof node.angle).toBe('number')
        expect(typeof node.radius).toBe('number')
      })
    })

    it('should respect angular spread constraint', () => {
      const tree = createSimpleTree()
      const maxSpread = TREE_CONFIG.maxAngleSpread
      const result = solveSkillTreeLayout(tree, TREE_CONFIG)

      const angles = result.layout.nodes.map((n) => n.angle)
      if (angles.length > 0) {
        const minAngle = Math.min(...angles)
        const maxAngle = Math.max(...angles)
        const spread = maxAngle - minAngle
        expect(spread).toBeLessThanOrEqual(maxSpread + 1)
      }
    })

    it('should handle cross-segment tree', () => {
      const tree = createCrossSegmentTree()
      const result = solveSkillTreeLayout(tree, TREE_CONFIG)

      expect(result).toBeDefined()
      expect(result.layout.nodes.length).toBe(countNodesInTree(tree))
    })

    it('should provide canvas data', () => {
      const tree = createSimpleTree()
      const result = solveSkillTreeLayout(tree, TREE_CONFIG)

      expect(result.layout.canvas).toBeDefined()
      expect(result.layout.canvas.width).toBeDefined()
      expect(result.layout.canvas.height).toBeDefined()
      expect(result.layout.canvas.origin).toBeDefined()
      expect(result.layout.canvas.maxRadius).toBeDefined()
    })

    it('should provide metadata about layout', () => {
      const tree = createSimpleTree()
      const result = solveSkillTreeLayout(tree, TREE_CONFIG)

      expect(result.meta).toBeDefined()
      expect(result.meta.computedLevelByNodeId).toBeDefined()
      expect(result.meta.orderedSegments).toBeDefined()
      expect(result.meta.feasibility).toBeDefined()
    })

    it('should compute levels for all nodes', () => {
      const tree = createSimpleTree()
      const result = solveSkillTreeLayout(tree, TREE_CONFIG)

      const nodeCount = countNodesInTree(tree)
      expect(result.meta.computedLevelByNodeId.size).toBe(nodeCount)

      result.meta.computedLevelByNodeId.forEach((level) => {
        expect(typeof level).toBe('number')
        expect(level).toBeGreaterThanOrEqual(1)
      })
    })

    it('should keep final segment geometry aligned with wedges', () => {
      const tree = createSimpleTree()
      const result = solveSkillTreeLayout(tree, TREE_CONFIG)

      result.meta.orderedSegments.forEach((segment) => {
        expect(segment.min).toBeCloseTo(segment.slotMin, 6)
        expect(segment.max).toBeCloseTo(segment.slotMax, 6)
        expect(segment.wedgeCenter).toBeCloseTo((segment.wedgeMin + segment.wedgeMax) / 2, 6)
      })

      result.layout.segments.labels.forEach((label) => {
        const segment = result.meta.orderedSegments.find((entry) => entry.id === label.segmentId)
        expect(segment).toBeDefined()
        expect(label.anchorAngle).toBeCloseTo(segment.wedgeCenter, 6)
      })
    })

    it('should expose final feasibility metadata', () => {
      const tree = createSimpleTree()
      const result = solveSkillTreeLayout(tree, TREE_CONFIG)

      expect(result.meta.feasibility.isFeasible).toBe(true)
      expect(Array.isArray(result.meta.feasibility.segmentLevelEntries)).toBe(true)
      expect(result.meta.feasibility.segmentLevelEntries.length).toBeGreaterThan(0)

      result.meta.feasibility.segmentLevelEntries.forEach((entry) => {
        expect(typeof entry.level).toBe('number')
        expect(typeof entry.segmentId).toBe('string')
        expect(typeof entry.nodeCount).toBe('number')
        expect(typeof entry.requiredPixels).toBe('number')
        expect(typeof entry.availableAngle).toBe('number')
        expect(typeof entry.isFeasible).toBe('boolean')
      })
    })

    it('should track capacity analysis for dense segment-level groups', () => {
      const tree = createDenseTree()
      const result = solveSkillTreeLayout(tree, TREE_CONFIG)

      const denseEntry = result.meta.feasibility.segmentLevelEntries.find(
        (entry) => entry.segmentId === 'segment-frontend' && entry.nodeCount >= 10,
      )

      expect(denseEntry).toBeDefined()
      expect(denseEntry.requiredPixels).toBeGreaterThan(0)
      expect(denseEntry.neededRadius).toBeGreaterThan(0)
    })
  })

  describe('layoutSolver validation', () => {
    it('should not report overlap issues for simple valid tree', () => {
      const tree = createSimpleTree()
      const result = solveSkillTreeLayout(tree, TREE_CONFIG)

      const overlapIssues = result.diagnostics.issues.filter(
        (issue) => issue.type === 'node-overlap',
      )
      expect(overlapIssues.length).toBe(0)
    })

    it('should report on layout diagnostics format', () => {
      const tree = createSimpleTree()
      const result = solveSkillTreeLayout(tree, TREE_CONFIG)

      result.diagnostics.issues.forEach((issue) => {
        expect(issue.type).toBeDefined()
        expect(issue.severity).toBeDefined()
        expect(['error', 'warning']).toContain(issue.severity)
        expect(issue.message).toBeDefined()
      })
    })

    it('should handle tree with no segments', () => {
      const tree = {
        segments: [],
        children: [
          {
            id: 'node1',
            label: 'Test',
            status: 'fertig',
            ebene: null,
            segmentId: null,
            children: [],
          },
        ],
      }
      const result = solveSkillTreeLayout(tree, TREE_CONFIG)

      expect(result.layout.nodes.length).toBeGreaterThan(0)
      expect(result.diagnostics).toBeDefined()
    })
  })

  describe('layoutSolver consistency', () => {
    it('should maintain tree structure in layout', () => {
      const tree = createSimpleTree()
      const result = solveSkillTreeLayout(tree, TREE_CONFIG)

      const treeNodeCount = countNodesInTree(tree)
      const layoutNodeCount = result.layout.nodes.length

      expect(layoutNodeCount).toBe(treeNodeCount)
    })

    it('should create links for relationships', () => {
      const tree = createSimpleTree()
      const result = solveSkillTreeLayout(tree, TREE_CONFIG)

      expect(Array.isArray(result.layout.links)).toBe(true)
      expect(result.layout.links.length).toBeGreaterThan(0)
    })
  })

  describe('layoutSolver edge cases', () => {
    it('should handle single node tree', () => {
      const tree = {
        segments: [{ id: 'seg1', label: 'Test' }],
        children: [
          {
            id: 'single',
            label: 'Single Node',
            status: 'fertig',
            ebene: null,
            segmentId: 'seg1',
            children: [],
          },
        ],
      }

      const result = solveSkillTreeLayout(tree, TREE_CONFIG)

      expect(result.layout.nodes.length).toBe(1)
      expect(result.layout.nodes[0].x).toBeDefined()
      expect(result.layout.nodes[0].y).toBeDefined()
    })

    it('should handle deeply nested tree', () => {
      const tree = {
        segments: [{ id: 'seg1', label: 'Test' }],
        children: [
          {
            id: 'level1',
            label: 'Level 1',
            status: 'fertig',
            ebene: null,
            segmentId: 'seg1',
            children: [
              {
                id: 'level2',
                label: 'Level 2',
                status: 'fertig',
                ebene: null,
                segmentId: 'seg1',
                children: [
                  {
                    id: 'level3',
                    label: 'Level 3',
                    status: 'fertig',
                    ebene: null,
                    segmentId: 'seg1',
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      }

      const result = solveSkillTreeLayout(tree, TREE_CONFIG)

      expect(result.layout.nodes.length).toBe(3)
      expect(result.layout.links.length).toBeGreaterThan(0)
    })

    it('should handle wide tree (many siblings)', () => {
      const children = Array.from({ length: 10 }).map((_, i) => ({
        id: `node-${i}`,
        label: `Node ${i}`,
        status: 'fertig',
        ebene: null,
        segmentId: 'seg1',
        children: [],
      }))

      const tree = {
        segments: [{ id: 'seg1', label: 'Test' }],
        children: [
          {
            id: 'root',
            label: 'Root',
            status: 'fertig',
            ebene: null,
            segmentId: 'seg1',
            children,
          },
        ],
      }

      const result = solveSkillTreeLayout(tree, TREE_CONFIG)

      expect(result.layout.nodes.length).toBe(11)
    })
  })
})
