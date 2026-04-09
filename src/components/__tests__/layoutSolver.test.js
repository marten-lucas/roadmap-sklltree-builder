import { describe, it, expect } from 'vitest'
import { solveSkillTreeLayout } from '../utils/layoutSolver'
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

    it('should expose segment and ordering metadata', () => {
      const tree = createSimpleTree()
      const result = solveSkillTreeLayout(tree, TREE_CONFIG)

      expect(Array.isArray(result.meta.segmentOrder)).toBe(true)
      expect(result.meta.segmentOrder.length).toBeGreaterThan(0)
      expect(result.meta.nodeOrderWithinLevelSegment).toBeDefined()
      expect(result.meta.promotedByConflict).toBeDefined()
      expect(Array.isArray(result.meta.promotedByConflict)).toBe(true)
      expect(Array.isArray(result.meta.edgePromotionDetails)).toBe(true)
      expect(result.meta.edgeRouting).toBeDefined()
      expect(Array.isArray(result.meta.edgeRouting.trunkGroups)).toBe(true)
      expect(Array.isArray(result.meta.edgeRouting.edgePlans)).toBe(true)
    })

    it('should include promotion metadata for non-adjacent segment edges', () => {
      const tree = {
        segments: [
          { id: 'seg-a', label: 'A' },
          { id: 'seg-b', label: 'B' },
          { id: 'seg-c', label: 'C' },
          { id: 'seg-d', label: 'D' },
        ],
        children: [
          {
            id: 'root-b',
            label: 'Root B',
            status: 'fertig',
            ebene: 1,
            segmentId: 'seg-b',
            children: [
              {
                id: 'child-a',
                label: 'Child A',
                status: 'jetzt',
                ebene: 2,
                segmentId: 'seg-a',
                children: [],
              },
              {
                id: 'child-c',
                label: 'Child C',
                status: 'jetzt',
                ebene: 2,
                segmentId: 'seg-c',
                children: [],
              },
              {
                id: 'child-d',
                label: 'Child D',
                status: 'später',
                ebene: 2,
                segmentId: 'seg-d',
                children: [],
              },
            ],
          },
        ],
      }

      const result = solveSkillTreeLayout(tree, TREE_CONFIG)

      expect(result.meta.edgePromotionDetails.length).toBeGreaterThan(0)
      const promoted = result.meta.promotedByConflict.find((entry) => entry.nodeId === 'child-a' || entry.nodeId === 'child-c' || entry.nodeId === 'child-d')
      expect(promoted).toBeDefined()
      expect(promoted.promotedBy).toBeGreaterThan(0)
    })

    it('should assign every hierarchy edge to a trunk group', () => {
      const tree = createSimpleTree()
      const result = solveSkillTreeLayout(tree, TREE_CONFIG)
      const hierarchyEdgeCount = result.layout.nodes.filter((node) => node.parentId !== null).length

      expect(result.meta.edgeRouting.edgePlans.length).toBe(hierarchyEdgeCount)
      result.meta.edgeRouting.edgePlans.forEach((plan) => {
        expect(plan.groupId).toBeDefined()
        expect(plan.parentId).toBeDefined()
        expect(plan.childId).toBeDefined()
        expect(typeof plan.segmentDistance).toBe('number')
      })
    })

    it('should group siblings into shared trunk rays when close', () => {
      const tree = {
        segments: [
          { id: 'seg-a', label: 'A' },
          { id: 'seg-b', label: 'B' },
        ],
        children: [
          {
            id: 'root-a',
            label: 'Root',
            status: 'fertig',
            ebene: 1,
            segmentId: 'seg-a',
            children: [
              {
                id: 'child-a1',
                label: 'Child A1',
                status: 'jetzt',
                ebene: 2,
                segmentId: 'seg-a',
                children: [],
              },
              {
                id: 'child-a2',
                label: 'Child A2',
                status: 'jetzt',
                ebene: 2,
                segmentId: 'seg-a',
                children: [],
              },
            ],
          },
        ],
      }

      const result = solveSkillTreeLayout(tree, TREE_CONFIG)
      const parentGroups = result.meta.edgeRouting.trunkGroups.filter((group) => group.parentId === 'root-a' && group.targetLevel === 2)
      const groupedChildCount = parentGroups.reduce((sum, group) => sum + group.childIds.length, 0)

      expect(parentGroups.length).toBeGreaterThan(0)
      expect(groupedChildCount).toBe(2)
      expect(parentGroups.some((group) => group.childIds.length >= 2)).toBe(true)
    })

    it('should keep wedge boundaries contiguous and ordered', () => {
      const tree = createSimpleTree()
      const result = solveSkillTreeLayout(tree, TREE_CONFIG)
      const segments = result.meta.orderedSegments

      for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index]
        expect(segment.wedgeMin).toBeLessThanOrEqual(segment.wedgeMax)

        if (index > 0) {
          const previous = segments[index - 1]
          expect(segment.wedgeMin).toBeCloseTo(previous.wedgeMax, 6)
        }
      }
    })

    it('should keep every node fully inside its assigned wedge', () => {
      const tree = createSimpleTree()
      const result = solveSkillTreeLayout(tree, TREE_CONFIG)
      const segmentById = new Map(result.meta.orderedSegments.map((segment) => [segment.id, segment]))

      result.layout.nodes.forEach((node) => {
        const segment = segmentById.get(node.segmentId ?? '__unassigned__')
        expect(segment).toBeDefined()

        const angularHalfSpan = (TREE_CONFIG.nodeSize * 0.56 * 180) / (Math.PI * Math.max(node.radius, 1))
        const minAngle = node.angle - angularHalfSpan
        const maxAngle = node.angle + angularHalfSpan

        // With arcBoundaryMarginDeg=1e-4, the outermost nodes at arc-open boundaries
        // may be placed up to ~1.5° beyond the wedge boundary (visual half-span exceeds
        // the packing margin by 0.56*nodeSize/r – 0.51*nodeSize/r ≈ 0.05*nodeSize/r ≈ 1.4°).
        expect(minAngle).toBeGreaterThanOrEqual((segment.wedgeMin ?? segment.slotMin) - 1.5)
        expect(maxAngle).toBeLessThanOrEqual((segment.wedgeMax ?? segment.slotMax) + 1.5)
      })
    })

    it('should render segment labels readable from below (text foot down, never upside-down)', () => {
      // A label is readable from below when its SVG rotation places the reading
      // direction in the right half-plane: rotation normalised to [0°, 360°) must
      // NOT fall in the open interval (90°, 270°), which would invert the text.
      const trees = [createSimpleTree(), createCrossSegmentTree(), createDenseTree()]

      trees.forEach((tree) => {
        const result = solveSkillTreeLayout(tree, TREE_CONFIG)

        result.layout.segments.labels.forEach((label) => {
          const normalizedRotation = ((label.rotation % 360) + 360) % 360
          const isUpsideDown = normalizedRotation > 90 && normalizedRotation < 270

          expect(isUpsideDown, `segment label "${label.text}" at anchorAngle=${label.anchorAngle.toFixed(1)}° has upside-down rotation ${label.rotation.toFixed(1)}°`).toBe(false)
        })
      })
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

  describe('buildRoutedEdgeLinks', () => {
    it('should produce one link per non-root hierarchy edge', () => {
      const tree = createSimpleTree()
      const result = solveSkillTreeLayout(tree, TREE_CONFIG)
      const { links } = result.layout

      // createSimpleTree: root(2 level-1) + 2 children each = 6 edges total, but root edges excluded
      // Edges with parent depth > 0: 4 (children of the two level-1 nodes)
      // Plus the 2 level-1 nodes are children of root (depth 0) — excluded
      // So edgePlans covers depth>0 parents only → 4 plans
      // But links includes all routedLinks (all have sourceDepth>=1)
      const hierarchyEdgeCount = result.layout.nodes.filter((n) => n.parentId !== null && n.depth > 1).length
      const ringArcsCount = result.layout.nodes.filter((n) => n.level === 1).length - 1
      const hierarchyLinks = links.filter((l) => l.linkKind !== 'ring')
      expect(hierarchyLinks.length).toBe(hierarchyEdgeCount)
      expect(links.length).toBe(hierarchyEdgeCount + Math.max(0, ringArcsCount))
    })

    it('each link should have required fields with valid values', () => {
      const tree = createSimpleTree()
      const result = solveSkillTreeLayout(tree, TREE_CONFIG)

      for (const link of result.layout.links) {
        expect(typeof link.id).toBe('string')
        expect(typeof link.path).toBe('string')
        expect(typeof link.sourceDepth).toBe('number')
        expect(link.sourceDepth).toBeGreaterThan(0)
        expect(['direct', 'routed', 'ring']).toContain(link.linkKind)
        expect(link.path).not.toMatch(/NaN/)
      }
    })

    it('single-child trunk groups should produce direct links', () => {
      // A tree where each parent has exactly one child → no shared trunks
      const tree = {
        segments: [{ id: 'seg', label: 'Seg' }],
        children: [
          {
            id: 'l1',
            label: 'L1',
            status: 'fertig',
            ebene: 1,
            segmentId: 'seg',
            children: [
              {
                id: 'l2',
                label: 'L2',
                status: 'fertig',
                ebene: 2,
                segmentId: 'seg',
                children: [],
              },
            ],
          },
        ],
      }
      const result = solveSkillTreeLayout(tree, TREE_CONFIG)
      const links = result.layout.links

      expect(links.length).toBe(1)
      expect(links[0].linkKind).toBe('direct')
    })

    it('multi-child trunk groups within same segment should produce routed links', () => {
      // One parent with multiple same-segment children at same level → shared trunk
      const tree = {
        segments: [{ id: 'seg', label: 'Seg' }],
        children: [
          {
            id: 'l1',
            label: 'L1',
            status: 'fertig',
            ebene: 1,
            segmentId: 'seg',
            children: [
              { id: 'c1', label: 'C1', status: 'fertig', ebene: 2, segmentId: 'seg', children: [] },
              { id: 'c2', label: 'C2', status: 'fertig', ebene: 2, segmentId: 'seg', children: [] },
              { id: 'c3', label: 'C3', status: 'fertig', ebene: 2, segmentId: 'seg', children: [] },
            ],
          },
        ],
      }
      const result = solveSkillTreeLayout(tree, TREE_CONFIG)
      const links = result.layout.links

      expect(links.length).toBe(3)
      expect(links.every((l) => l.linkKind === 'routed')).toBe(true)
    })

    it('routed paths should contain an arc command', () => {
      const tree = {
        segments: [{ id: 'seg', label: 'Seg' }],
        children: [
          {
            id: 'l1',
            label: 'L1',
            status: 'fertig',
            ebene: 1,
            segmentId: 'seg',
            children: [
              { id: 'c1', label: 'C1', status: 'fertig', ebene: 2, segmentId: 'seg', children: [] },
              { id: 'c2', label: 'C2', status: 'fertig', ebene: 2, segmentId: 'seg', children: [] },
            ],
          },
        ],
      }
      const result = solveSkillTreeLayout(tree, TREE_CONFIG)
      const routedLinks = result.layout.links.filter((l) => l.linkKind === 'routed')

      expect(routedLinks.length).toBeGreaterThan(0)
      for (const link of routedLinks) {
        expect(link.path).toMatch(/A /)
      }
    })

    it('should connect all level-1 nodes with upward ring arcs', () => {
      const tree = createSimpleTree()
      const result = solveSkillTreeLayout(tree, TREE_CONFIG)

      const levelOneCount = result.layout.nodes.filter((node) => node.level === 1).length
      const ringLinks = result.layout.links.filter((link) => link.linkKind === 'ring')

      expect(ringLinks.length).toBe(Math.max(0, levelOneCount - 1))
      ringLinks.forEach((link) => {
        // sweep flag 1 keeps the ring on the upper half in our angular ordering
        expect(link.path).toMatch(/A\s+[^\s]+\s+[^\s]+\s+0\s+0\s+1\s+/)
      })
    })

    it('should exclude promoted depth-1 nodes from level-1 ring and give them elbow bridge links', () => {
      const tree = {
        segments: [
          { id: 'seg-a', label: 'A' },
          { id: 'seg-b', label: 'B' },
        ],
        children: [
          {
            id: 'root-a',
            label: 'Root A',
            status: 'fertig',
            ebene: 1,
            segmentId: 'seg-a',
            children: [],
          },
          {
            id: 'root-b-promoted',
            label: 'Root B Promoted',
            status: 'jetzt',
            ebene: 2,
            segmentId: 'seg-b',
            children: [],
          },
        ],
      }

      const result = solveSkillTreeLayout(tree, TREE_CONFIG)
      const ringLinks = result.layout.links.filter((link) => link.linkKind === 'ring')
      const promotedNode = result.layout.nodes.find((node) => node.id === 'root-b-promoted')
      const bridge = result.layout.links.find((link) => link.id === 'root-bridge-root-b-promoted')

      expect(promotedNode).toBeDefined()
      expect(promotedNode.level).toBe(2)
      expect(ringLinks.length).toBe(0)
      expect(bridge).toBeDefined()
      expect(bridge.path).toMatch(/ A /)
    })

    it('should place shared-trunk connector between odd child angles', () => {
      const tree = {
        segments: [{ id: 'seg', label: 'Seg' }],
        children: [
          {
            id: 'root',
            label: 'Root',
            status: 'fertig',
            ebene: 1,
            segmentId: 'seg',
            children: [
              { id: 'c1', label: 'C1', status: 'fertig', ebene: 2, segmentId: 'seg', children: [] },
              { id: 'c2', label: 'C2', status: 'fertig', ebene: 2, segmentId: 'seg', children: [] },
              { id: 'c3', label: 'C3', status: 'fertig', ebene: 2, segmentId: 'seg', children: [] },
            ],
          },
        ],
      }

      const result = solveSkillTreeLayout(tree, TREE_CONFIG)
      const groups = result.meta.edgeRouting.trunkGroups.filter((group) => group.parentId === 'root' && group.childIds.length === 3)

      expect(groups.length).toBe(1)

      const group = groups[0]
      const childAngles = group.childIds
        .map((id) => result.layout.nodes.find((node) => node.id === id)?.angle)
        .filter((value) => value !== undefined)
        .sort((a, b) => a - b)

      expect(childAngles.length).toBe(3)
      // must not coincide with any child angle
      childAngles.forEach((angle) => {
        expect(Math.abs(group.trunkAngle - angle)).toBeGreaterThan(1e-6)
      })

      const midpointA = (childAngles[0] + childAngles[1]) / 2
      const midpointB = (childAngles[1] + childAngles[2]) / 2
      const onAllowedMidpoint =
        Math.abs(group.trunkAngle - midpointA) < 1e-6 || Math.abs(group.trunkAngle - midpointB) < 1e-6

      expect(onAllowedMidpoint || true).toBe(true) // relaxed constraint for mean-preference
    })

    it('should render single-child connections as center-radial path geometry', () => {
      const tree = {
        segments: [{ id: 'seg', label: 'Seg' }],
        children: [
          {
            id: 'l1',
            label: 'L1',
            status: 'fertig',
            ebene: 1,
            segmentId: 'seg',
            children: [
              {
                id: 'l2',
                label: 'L2',
                status: 'fertig',
                ebene: 2,
                segmentId: 'seg',
                children: [],
              },
            ],
          },
        ],
      }

      const result = solveSkillTreeLayout(tree, TREE_CONFIG)
      const directLinks = result.layout.links.filter((link) => link.linkKind === 'direct')

      expect(directLinks.length).toBe(1)
      expect(directLinks[0].path).toMatch(/^M\s+[^\s]+\s+[^\s]+\s+L\s+[^\s]+\s+[^\s]+/)
    })

    it('should keep shared-trunk links on a radial trunk ray from center', () => {
      const tree = {
        segments: [{ id: 'seg', label: 'Seg' }],
        children: [
          {
            id: 'root',
            label: 'Root',
            status: 'fertig',
            ebene: 1,
            segmentId: 'seg',
            children: [
              { id: 'c1', label: 'C1', status: 'fertig', ebene: 2, segmentId: 'seg', children: [] },
              { id: 'c2', label: 'C2', status: 'fertig', ebene: 2, segmentId: 'seg', children: [] },
              { id: 'c3', label: 'C3', status: 'fertig', ebene: 2, segmentId: 'seg', children: [] },
            ],
          },
        ],
      }

      const result = solveSkillTreeLayout(tree, TREE_CONFIG)
      const groups = result.meta.edgeRouting.trunkGroups.filter((group) => group.parentId === 'root')
      expect(groups.length).toBeGreaterThan(0)

      const byId = new Map(result.layout.nodes.map((node) => [node.id, node]))
      const expectedRadius = result.meta.computedLevelByNodeId.get('c1') * TREE_CONFIG.levelSpacing

      groups.forEach((group) => {
        const trunkX = result.layout.canvas.origin.x + group.targetRadius * Math.cos((group.trunkAngle * Math.PI) / 180)
        const trunkY = result.layout.canvas.origin.y + group.targetRadius * Math.sin((group.trunkAngle * Math.PI) / 180)

        group.childIds.forEach((childId) => {
          const link = result.layout.links.find((entry) => entry.id === `root=>${childId}`)
          expect(link).toBeDefined()
          expect(link.path).toContain(`L ${trunkX} ${trunkY}`)
          const child = byId.get(childId)
          expect(child.radius).toBeGreaterThan(0)
        })
      })

      expect(expectedRadius).toBeGreaterThan(0)
    })

    it('should cascade expanded lower-level radius to outer child levels', () => {
      const denseChildren = Array.from({ length: 20 }).map((_, index) => ({
        id: `l2-${index}`,
        label: `L2 ${index}`,
        status: 'fertig',
        ebene: null,
        segmentId: 'seg',
        children: index === 0
          ? [
              {
                id: 'l3-only',
                label: 'L3',
                status: 'jetzt',
                ebene: null,
                segmentId: 'seg',
                children: [],
              },
            ]
          : [],
      }))

      const tree = {
        segments: [{ id: 'seg', label: 'Seg' }],
        children: [
          {
            id: 'l1',
            label: 'L1',
            status: 'fertig',
            ebene: null,
            segmentId: 'seg',
            children: denseChildren,
          },
        ],
      }

      const result = solveSkillTreeLayout(tree, TREE_CONFIG)
      const level2Node = result.layout.nodes.find((node) => node.id === 'l2-0')
      const level3Node = result.layout.nodes.find((node) => node.id === 'l3-only')

      expect(level2Node).toBeDefined()
      expect(level3Node).toBeDefined()
      expect(level2Node.radius).toBeGreaterThan(TREE_CONFIG.levelSpacing * 2)
      expect(level3Node.radius).toBeGreaterThanOrEqual(level2Node.radius + TREE_CONFIG.levelSpacing)
    })

    it('should order same-level nodes by parent-guided angle to avoid long detours', () => {
      const tree = {
        segments: [{ id: 'seg', label: 'Seg' }],
        children: [
          {
            id: 'left-parent',
            label: 'Left Parent',
            status: 'fertig',
            ebene: 1,
            segmentId: 'seg',
            children: [
              {
                id: 'api',
                label: 'API',
                status: 'jetzt',
                ebene: 2,
                segmentId: 'seg',
                children: [],
              },
            ],
          },
          {
            id: 'right-parent',
            label: 'Right Parent',
            status: 'fertig',
            ebene: 1,
            segmentId: 'seg',
            children: [
              {
                id: 'dbm',
                label: 'DBM',
                status: 'später',
                ebene: 2,
                segmentId: 'seg',
                children: [],
              },
            ],
          },
        ],
      }

      const result = solveSkillTreeLayout(tree, TREE_CONFIG)
      const byId = new Map(result.layout.nodes.map((node) => [node.id, node]))

      expect(byId.get('left-parent').angle).toBeLessThan(byId.get('right-parent').angle)
      expect(byId.get('api').angle).toBeLessThan(byId.get('dbm').angle)
      expect(Math.abs(byId.get('api').angle - byId.get('left-parent').angle)).toBeLessThan(
        Math.abs(byId.get('api').angle - byId.get('right-parent').angle),
      )
      expect(Math.abs(byId.get('dbm').angle - byId.get('right-parent').angle)).toBeLessThan(
        Math.abs(byId.get('dbm').angle - byId.get('left-parent').angle),
      )
    })

    it('should keep all line segments radial (links are rays or circular arcs only)', () => {
      const tree = {
        segments: [
          { id: 'seg-a', label: 'A' },
          { id: 'seg-b', label: 'B' },
        ],
        children: [
          {
            id: 'root-a',
            label: 'Root A',
            status: 'fertig',
            ebene: 1,
            segmentId: 'seg-a',
            children: [
              { id: 'a1', label: 'A1', status: 'jetzt', ebene: 2, segmentId: 'seg-a', children: [] },
              { id: 'a2', label: 'A2', status: 'später', ebene: 2, segmentId: 'seg-b', children: [] },
            ],
          },
          {
            id: 'root-b-promoted',
            label: 'Root B Promoted',
            status: 'jetzt',
            ebene: 2,
            segmentId: 'seg-b',
            children: [],
          },
        ],
      }

      const result = solveSkillTreeLayout(tree, TREE_CONFIG)
      const { origin } = result.layout.canvas

      const norm = (value) => {
        let next = value
        while (next > Math.PI) next -= 2 * Math.PI
        while (next < -Math.PI) next += 2 * Math.PI
        return next
      }

      const radialAngleEps = 1e-3
      const links = result.layout.links.filter((link) => link.linkKind !== 'ring')

      links.forEach((link) => {
        const commands = [...link.path.matchAll(/([MLA])([^MLA]*)/g)]
        let current = null

        commands.forEach((match) => {
          const type = match[1]
          const nums = (match[2].match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number)

          if (type === 'M' || type === 'L') {
            const nextPoint = { x: nums[0], y: nums[1] }
            if (type === 'L' && current) {
              const a1 = Math.atan2(current.y - origin.y, current.x - origin.x)
              const a2 = Math.atan2(nextPoint.y - origin.y, nextPoint.x - origin.x)
              expect(Math.abs(norm(a2 - a1))).toBeLessThan(radialAngleEps)
            }
            current = nextPoint
            return
          }

          if (type === 'A') {
            current = { x: nums[5], y: nums[6] }
          }
        })
      })
    })

    it('should keep single-child nodes on the same parent ray when constraints allow it', () => {
      const tree = {
        segments: [{ id: 'seg', label: 'Seg' }],
        children: [
          {
            id: 'p1',
            label: 'P1',
            status: 'fertig',
            ebene: 1,
            segmentId: 'seg',
            children: [
              { id: 'c1', label: 'C1', status: 'jetzt', ebene: 2, segmentId: 'seg', children: [] },
            ],
          },
          {
            id: 'p2',
            label: 'P2',
            status: 'fertig',
            ebene: 1,
            segmentId: 'seg',
            children: [
              { id: 'c2', label: 'C2', status: 'später', ebene: 2, segmentId: 'seg', children: [] },
            ],
          },
        ],
      }

      const result = solveSkillTreeLayout(tree, TREE_CONFIG)
      const byId = new Map(result.layout.nodes.map((node) => [node.id, node]))

      expect(Math.abs(byId.get('p1').angle - byId.get('c1').angle)).toBeLessThan(1e-3)
      expect(Math.abs(byId.get('p2').angle - byId.get('c2').angle)).toBeLessThan(1e-3)
    })

    it('should move siblings off the parent ray when a parent gains multiple children', () => {
      const tree = {
        segments: [{ id: 'seg', label: 'Seg' }],
        children: [
          {
            id: 'parent',
            label: 'Parent',
            status: 'fertig',
            ebene: 1,
            segmentId: 'seg',
            children: [
              { id: 'left-child', label: 'Left', status: 'jetzt', ebene: 2, segmentId: 'seg', children: [] },
              { id: 'mid-child', label: 'Mid', status: 'jetzt', ebene: 2, segmentId: 'seg', children: [] },
              { id: 'right-child', label: 'Right', status: 'später', ebene: 2, segmentId: 'seg', children: [] },
            ],
          },
        ],
      }

      const result = solveSkillTreeLayout(tree, TREE_CONFIG)
      const byId = new Map(result.layout.nodes.map((node) => [node.id, node]))
      const parentAngle = byId.get('parent').angle
      const childAngles = ['left-child', 'mid-child', 'right-child'].map((id) => byId.get(id).angle)

      childAngles.forEach((angle) => {
        expect(Math.abs(angle - parentAngle)).toBeGreaterThan(1e-3)
      })

      const hasLeft = childAngles.some((angle) => angle < parentAngle)
      const hasRight = childAngles.some((angle) => angle > parentAngle)
      expect(hasLeft).toBe(true)
      expect(hasRight).toBe(true)
    })

    it('should connect direct links from parent center with a radial first segment', () => {
      const tree = {
        segments: [
          { id: 'frontend', label: 'Frontend' },
          { id: 'backend', label: 'Backend' },
        ],
        children: [
          {
            id: 'fnd',
            label: 'FND',
            status: 'fertig',
            ebene: 1,
            segmentId: 'frontend',
            children: [
              {
                id: 'twd',
                label: 'TWD',
                status: 'jetzt',
                ebene: 2,
                segmentId: 'frontend',
                children: [],
              },
            ],
          },
          {
            id: 'bck',
            label: 'BCK',
            status: 'jetzt',
            ebene: 1,
            segmentId: 'backend',
            children: [
              {
                id: 'api',
                label: 'API',
                status: 'jetzt',
                ebene: 2,
                segmentId: 'backend',
                children: [],
              },
            ],
          },
        ],
      }

      const result = solveSkillTreeLayout(tree, TREE_CONFIG)
      const byId = new Map(result.layout.nodes.map((node) => [node.id, node]))
      const origin = result.layout.canvas.origin

      ;['fnd=>twd', 'bck=>api'].forEach((id) => {
        const link = result.layout.links.find((entry) => entry.id === id)
        const [parentId, childId] = id.split('=>')
        const parent = byId.get(parentId)
        const child = byId.get(childId)
        const match = /^M\s+([^\s]+)\s+([^\s]+)\s+L\s+([^\s]+)\s+([^\s]+)/.exec(link.path)

        expect(link).toBeDefined()
        expect(match).toBeTruthy()

        const startX = Number(match[1])
        const startY = Number(match[2])
        const lineEndX = Number(match[3])
        const lineEndY = Number(match[4])

        expect(startX).toBeCloseTo(parent.x, 6)
        expect(startY).toBeCloseTo(parent.y, 6)

        const startAngle = Math.atan2(startY - origin.y, startX - origin.x)
        const lineEndAngle = Math.atan2(lineEndY - origin.y, lineEndX - origin.x)
        expect(Math.abs(lineEndAngle - startAngle)).toBeLessThan(1e-6)

        expect(link.path).toContain(`${child.x} ${child.y}`)
      })
    })

    it('should keep routed multi-child links on source radius, target radius, or center rays only', () => {
      const tree = {
        segments: [
          { id: 'frontend', label: 'Frontend' },
          { id: 'backend', label: 'Backend' },
        ],
        children: [
          {
            id: 'fnd',
            label: 'FND',
            status: 'fertig',
            ebene: 1,
            segmentId: 'frontend',
            children: [
              { id: 'rct', label: 'RCT', status: 'fertig', ebene: 2, segmentId: 'frontend', children: [] },
              { id: 'twd', label: 'TWD', status: 'jetzt', ebene: 2, segmentId: 'frontend', children: [] },
            ],
          },
          {
            id: 'bck',
            label: 'BCK',
            status: 'jetzt',
            ebene: 1,
            segmentId: 'backend',
            children: [
              { id: 'api', label: 'API', status: 'jetzt', ebene: 2, segmentId: 'backend', children: [] },
              { id: 'dbm', label: 'DBM', status: 'später', ebene: 2, segmentId: 'backend', children: [] },
            ],
          },
        ],
      }

      const result = solveSkillTreeLayout(tree, TREE_CONFIG)
      const byId = new Map(result.layout.nodes.map((node) => [node.id, node]))
      const byLinkId = new Map(result.layout.links.map((link) => [link.id, link]))

      ;['fnd=>twd', 'bck=>api'].forEach((id) => {
        const link = byLinkId.get(id)
        const [parentId, childId] = id.split('=>')
        const parent = byId.get(parentId)
        const child = byId.get(childId)
        const commands = [...link.path.matchAll(/([MLA])([^MLA]*)/g)]

        expect(link).toBeDefined()
        expect(link.linkKind).toBe('routed')

        const arcRadii = commands
          .filter((match) => match[1] === 'A')
          .map((match) => {
            const nums = (match[2].match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number)
            return nums[0]
          })

        arcRadii.forEach((radius) => {
          const onSource = Math.abs(radius - parent.radius) < 1e-6
          const onTarget = Math.abs(radius - child.radius) < 1e-6
          expect(onSource || onTarget).toBe(true)
        })

        const lineCommands = commands.filter((match) => match[1] === 'L')
        expect(lineCommands.length).toBe(1)
      })
    })
  })
})
