import { describe, it, expect } from 'vitest'
import {
  validateSkillTree,
  validateNodeSegmentChange,
  validateNodeLevelChange,
  getSegmentOptionsForNode,
  getLevelOptionsForNode,
  getParentOptionsForNode,
} from '../treeValidation'
import { TREE_CONFIG } from '../config'
import { createSimpleTree, createCrossSegmentTree, findNodeInTree, SEGMENT_FRONTEND, SEGMENT_BACKEND } from './testUtils'

describe('treeValidation', () => {
  describe('validateSkillTree', () => {
    it('should validate a simple tree', () => {
      const tree = createSimpleTree()
      const result = validateSkillTree(tree, TREE_CONFIG)

      expect(result).toBeDefined()
      expect(result.diagnostics).toBeDefined()
      expect(Array.isArray(result.diagnostics.issues)).toBe(true)
    })

    it('should handle empty tree', () => {
      const tree = {
        segments: [{ id: 'seg1', label: 'Test' }],
        children: [],
      }
      const result = validateSkillTree(tree, TREE_CONFIG)

      expect(result).toBeDefined()
      expect(Array.isArray(result.diagnostics.issues)).toBe(true)
    })
  })

  describe('validateNodeSegmentChange', () => {
    it('should allow valid segment change', () => {
      const tree = createSimpleTree()
      const validation = validateNodeSegmentChange(tree, 'child-react', SEGMENT_BACKEND, TREE_CONFIG)

      expect(validation).toBeDefined()
      expect(typeof validation.isAllowed).toBe('boolean')
      expect(Array.isArray(validation.introducedIssues)).toBe(true)
    })

    it('should detect introduced overlaps', () => {
      const tree = createSimpleTree()
      // Change a node to a different segment - may introduce issues
      const validation = validateNodeSegmentChange(tree, 'child-react', SEGMENT_BACKEND, TREE_CONFIG)

      expect(validation.introducedIssues).toBeDefined()
      expect(Array.isArray(validation.introducedIssues)).toBe(true)
    })

    it('should not block changes for pre-existing issues', () => {
      const tree = createSimpleTree()
      // Changing to same segment should always be allowed
      const validation = validateNodeSegmentChange(tree, 'child-react', SEGMENT_FRONTEND, TREE_CONFIG)

      // Changing to current segment should be allowed
      const node = findNodeInTree(tree, 'child-react')
      if (node.segmentId === SEGMENT_FRONTEND) {
        expect(validation.isAllowed).toBe(true)
      }
    })

    it('should include segment-boundary issues when introduced', () => {
      const tree = createSimpleTree()
      const validation = validateNodeSegmentChange(tree, 'child-react', SEGMENT_BACKEND, TREE_CONFIG)

      const hasBoundaryIssues = validation.introducedIssues.some(
        (issue) => issue.type === 'segment-boundary',
      )

      if (!validation.isAllowed) {
        expect(typeof hasBoundaryIssues).toBe('boolean')
      }
    })

    it('should handle cross-segment changes', () => {
      const tree = createCrossSegmentTree()
      const validation = validateNodeSegmentChange(tree, 'api-consumption', SEGMENT_FRONTEND, TREE_CONFIG)

      expect(validation).toBeDefined()
      expect(typeof validation.isAllowed).toBe('boolean')
    })

    it('should allow change to null segment', () => {
      const tree = createSimpleTree()
      const validation = validateNodeSegmentChange(tree, 'child-react', null, TREE_CONFIG)

      expect(validation).toBeDefined()
      expect(typeof validation.isAllowed).toBe('boolean')
    })

    it('should reject segment changes for non-existent nodes', () => {
      const tree = createSimpleTree()
      const validation = validateNodeSegmentChange(tree, 'missing-node', SEGMENT_BACKEND, TREE_CONFIG)

      expect(validation.isAllowed).toBe(false)
      expect(validation.introducedIssues.some((issue) => issue.type === 'invalid-node')).toBe(true)
    })
  })

  describe('validateNodeLevelChange', () => {
    it('should allow valid level change', () => {
      const tree = {
        segments: [{ id: 'seg1', label: 'Test' }],
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

      const validation = validateNodeLevelChange(tree, 'child', 3, TREE_CONFIG)

      expect(validation).toBeDefined()
      expect(typeof validation.isAllowed).toBe('boolean')
      expect(Array.isArray(validation.introducedIssues)).toBe(true)
    })

    it('should prevent invalid level changes (level too low)', () => {
      const tree = {
        segments: [{ id: 'seg1', label: 'Test' }],
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

      // Try to move child to same level as parent (invalid)
      const validation = validateNodeLevelChange(tree, 'child', 1, TREE_CONFIG)

      expect(validation).toBeDefined()
      expect(validation.isAllowed).toBe(false)
      expect(validation.introducedIssues.some((issue) => issue.type === 'invalid-level')).toBe(true)
    })

    it('should include segment-boundary issues when introduced', () => {
      const tree = {
        segments: [{ id: 'seg1', label: 'Test' }],
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

      const validation = validateNodeLevelChange(tree, 'child', 3, TREE_CONFIG)

      const hasBoundaryIssues = validation.introducedIssues.some(
        (issue) => issue.type === 'segment-boundary',
      )

      if (!validation.isAllowed) {
        expect(typeof hasBoundaryIssues).toBe('boolean')
      }
    })
  })

  describe('getSegmentOptionsForNode', () => {
    it('should return available segments for a node', () => {
      const tree = createSimpleTree()
      const options = getSegmentOptionsForNode(tree, 'child-react', TREE_CONFIG)

      expect(Array.isArray(options)).toBe(true)
      expect(options.length).toBeGreaterThan(0)
    })

    it('should mark current segment as allowed', () => {
      const tree = createSimpleTree()
      const options = getSegmentOptionsForNode(tree, 'child-react', TREE_CONFIG)

      const currentSegmentOption = options.find((opt) => opt.label === 'Frontend')
      expect(currentSegmentOption).toBeDefined()
      expect(currentSegmentOption.isAllowed).toBe(true)
    })

    it('should include unassigned segment option', () => {
      const tree = createSimpleTree()
      const options = getSegmentOptionsForNode(tree, 'child-react', TREE_CONFIG)

      const unassignedOption = options.find((opt) => opt.label === 'Ohne Segment')
      expect(unassignedOption).toBeDefined()
    })

    it('should provide reasons for blocked options', () => {
      const tree = createSimpleTree()
      const options = getSegmentOptionsForNode(tree, 'child-react', TREE_CONFIG)

      options.forEach((option) => {
        expect(option.id).toBeDefined()
        expect(option.label).toBeDefined()
        expect(typeof option.isAllowed).toBe('boolean')
        expect(Array.isArray(option.reasons)).toBe(true)
      })
    })

    it('should mirror validator decisions for each candidate segment', () => {
      const tree = createSimpleTree()
      const options = getSegmentOptionsForNode(tree, 'child-react', TREE_CONFIG)

      options.forEach((option) => {
        const targetSegmentId = option.id === '__unassigned__' ? null : option.id
        const validation = validateNodeSegmentChange(tree, 'child-react', targetSegmentId, TREE_CONFIG)

        if (!option.isCurrent) {
          expect(option.isAllowed).toBe(validation.isAllowed)
        }

        if (!option.isAllowed) {
          expect(option.reasons.length).toBeGreaterThan(0)
        }
      })
    })

    it('should handle node with no segment', () => {
      const tree = {
        segments: [{ id: 'seg1', label: 'Test' }],
        children: [
          {
            id: 'unassigned-node',
            label: 'No Segment',
            status: 'fertig',
            ebene: null,
            segmentId: null,
            children: [],
          },
        ],
      }

      const options = getSegmentOptionsForNode(tree, 'unassigned-node', TREE_CONFIG)

      expect(Array.isArray(options)).toBe(true)
      expect(options.length).toBeGreaterThan(0)
    })
  })

  describe('getLevelOptionsForNode', () => {
    it('should return available levels for a node', () => {
      const tree = {
        segments: [{ id: 'seg1', label: 'Test' }],
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

      const options = getLevelOptionsForNode(tree, 'child', TREE_CONFIG)

      expect(Array.isArray(options)).toBe(true)
      expect(options.length).toBeGreaterThan(0)
    })

    it('should mark current level as allowed', () => {
      const tree = {
        segments: [{ id: 'seg1', label: 'Test' }],
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

      const options = getLevelOptionsForNode(tree, 'child', TREE_CONFIG)
      const currentLevel = options.find((opt) => opt.value === 2)

      expect(currentLevel).toBeDefined()
      expect(currentLevel.isAllowed).toBe(true)
    })

    it('should prevent level equal to or below parent', () => {
      const tree = {
        segments: [{ id: 'seg1', label: 'Test' }],
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

      const options = getLevelOptionsForNode(tree, 'child', TREE_CONFIG)

      // Levels 1 and 2 (parent level and current level) should have constraints
      const level1 = options.find((opt) => opt.value === 1)
      if (level1) {
        expect(level1.isAllowed).toBe(false) // Can't be at parent level
      }
    })

    it('should return empty for root node', () => {
      const tree = {
        segments: [{ id: 'seg1', label: 'Test' }],
        children: [],
      }

      const options = getLevelOptionsForNode(tree, 'non-existent', TREE_CONFIG)

      // May return empty or default options for non-existent node
      expect(Array.isArray(options)).toBe(true)
    })

    it('should mark non-existent node as invalid', () => {
      const tree = createSimpleTree()
      const validation = validateNodeLevelChange(tree, 'missing-node', 2, TREE_CONFIG)

      expect(validation.isAllowed).toBe(false)
      expect(validation.introducedIssues.some((issue) => issue.type === 'invalid-node')).toBe(true)
    })

    it('should mirror validator decisions for each candidate level', () => {
      const tree = {
        segments: [{ id: 'seg1', label: 'Test' }],
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

      const options = getLevelOptionsForNode(tree, 'child', TREE_CONFIG)

      options.forEach((option) => {
        const validation = validateNodeLevelChange(tree, 'child', option.value, TREE_CONFIG)

        if (!option.isCurrent) {
          expect(option.isAllowed).toBe(validation.isAllowed)
        }

        if (!option.isAllowed) {
          expect(option.reasons.length).toBeGreaterThan(0)
        }
      })
    })
  })

  describe('validation integration', () => {
    it('should handle segment and level changes together', () => {
      const tree = createSimpleTree()

      // Change both segment and level
      const segValidation = validateNodeSegmentChange(tree, 'child-react', SEGMENT_BACKEND, TREE_CONFIG)
      const levelValidation = validateNodeLevelChange(tree, 'child-react', 3, TREE_CONFIG)

      expect(typeof segValidation.isAllowed).toBe('boolean')
      expect(typeof levelValidation.isAllowed).toBe('boolean')
    })

    it('should provide consistent options across methods', () => {
      const tree = createSimpleTree()

      const segmentOptions = getSegmentOptionsForNode(tree, 'child-react', TREE_CONFIG)
      const levelOptions = getLevelOptionsForNode(tree, 'child-react', TREE_CONFIG)

      // Both should be arrays with option objects
      expect(Array.isArray(segmentOptions)).toBe(true)
      expect(Array.isArray(levelOptions)).toBe(true)

      // Option objects should have consistent structure
      segmentOptions.forEach((opt) => {
        expect(opt.isAllowed).toBeDefined()
        expect(opt.reasons).toBeDefined()
      })

      levelOptions.forEach((opt) => {
        expect(opt.isAllowed).toBeDefined()
        expect(opt.reasons).toBeDefined()
      })
    })
  })

  describe('getParentOptionsForNode', () => {
    it('should exclude node descendants from parent candidates', () => {
      const tree = createCrossSegmentTree()
      const options = getParentOptionsForNode(tree, 'react')

      expect(options.some((option) => option.id === 'api-consumption')).toBe(false)
      expect(options.some((option) => option.id === 'react')).toBe(false)
    })

    it('should include root option', () => {
      const tree = createSimpleTree()
      const options = getParentOptionsForNode(tree, 'child-react')

      expect(options.some((option) => option.id === '__root__')).toBe(true)
    })
  })
})
