import { describe, it, expect } from 'vitest'
import {
  addScopeWithResult,
  deleteScopeWithResult,
  findNodeById,
  findParentNodeId,
  getNodeAdditionalDependencies,
  moveNodeToParent,
  renameScopeWithResult,
  setLevelAdditionalDependencies,
  updateNodeProgressLevel,
  updateNodeData,
  updateNodeSegment,
  updateNodeLevel,
  deleteNodeOnly,
} from '../utils/treeData'
import { createSimpleTree, createCrossSegmentTree, SEGMENT_FRONTEND, SEGMENT_BACKEND, LEVEL_CHILD_REACT_1, LEVEL_CHILD_DB_1, LEVEL_ROOT_BACKEND_1 } from './testUtils'
import { solveSkillTreeLayout } from '../utils/layoutSolver'
import { TREE_CONFIG } from '../config'

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

    it('should not affect other nodes in subtree', () => {
      const tree = createSimpleTree()
      const newTree = updateNodeSegment(tree, 'root-frontend', SEGMENT_BACKEND)

      // Only the selected node should change
      const parent = findNodeById(newTree, 'root-frontend')
      const child = findNodeById(newTree, 'child-react')

      expect(parent.segmentId).toBe(SEGMENT_BACKEND)
      expect(child.segmentId).toBe(SEGMENT_FRONTEND) // Not affected
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

  describe('moveNodeToParent', () => {
    it('should move a node under another valid parent', () => {
      const tree = createSimpleTree()
      const moved = moveNodeToParent(tree, 'child-react', 'root-backend')

      expect(findParentNodeId(moved, 'child-react')).toBe('root-backend')
      expect(findNodeById(moved, 'root-frontend').children.some((child) => child.id === 'child-react')).toBe(false)
    })

    it('should prevent moving a node under its own descendant', () => {
      const tree = createCrossSegmentTree()
      const moved = moveNodeToParent(tree, 'react', 'api-consumption')

      expect(findParentNodeId(moved, 'react')).toBe('root-frontend')
      expect(findParentNodeId(moved, 'api-consumption')).toBe('react')
    })

    it('should drop invalid dependencies after move when target becomes ancestor', () => {
      const tree = createSimpleTree()
      const withDependency = setLevelAdditionalDependencies(tree, 'child-react', LEVEL_CHILD_REACT_1, [LEVEL_ROOT_BACKEND_1])
      const moved = moveNodeToParent(withDependency, 'child-react', 'root-backend')
      const deps = getNodeAdditionalDependencies(moved, 'child-react')

      expect(deps.outgoingIds).toEqual([])
    })
  })

  describe('additional dependencies', () => {
    it('should write outgoing dependency and mirrored incoming reference', () => {
      const tree = createSimpleTree()
      const nextTree = setLevelAdditionalDependencies(tree, 'child-react', LEVEL_CHILD_REACT_1, [LEVEL_CHILD_DB_1])

      const sourceDeps = getNodeAdditionalDependencies(nextTree, 'child-react')
      const targetDeps = getNodeAdditionalDependencies(nextTree, 'child-db')

      expect(sourceDeps.outgoingIds).toEqual(['child-db'])
      expect(targetDeps.incomingIds).toEqual(['child-react'])
    })

    it('should remove mirrored references when dependency is removed', () => {
      const tree = createSimpleTree()
      const withDependency = setLevelAdditionalDependencies(tree, 'child-react', LEVEL_CHILD_REACT_1, [LEVEL_CHILD_DB_1])
      const nextTree = setLevelAdditionalDependencies(withDependency, 'child-react', LEVEL_CHILD_REACT_1, [])

      const targetDeps = getNodeAdditionalDependencies(nextTree, 'child-db')
      expect(targetDeps.incomingIds).toEqual([])
    })

    it('should remove mirrored references when source node is deleted', () => {
      const tree = createSimpleTree()
      const withDependency = setLevelAdditionalDependencies(tree, 'child-react', LEVEL_CHILD_REACT_1, [LEVEL_CHILD_DB_1])
      const nextTree = deleteNodeOnly(withDependency, 'child-react')
      const targetDeps = getNodeAdditionalDependencies(nextTree, 'child-db')

      expect(targetDeps.incomingIds).toEqual([])
    })

    it('should reject cyclic additional dependencies', () => {
      const tree = createSimpleTree()
      const withDependency = setLevelAdditionalDependencies(tree, 'child-react', LEVEL_CHILD_REACT_1, [LEVEL_CHILD_DB_1])
      const nextTree = setLevelAdditionalDependencies(withDependency, 'child-db', LEVEL_CHILD_DB_1, [LEVEL_CHILD_REACT_1])

      expect(getNodeAdditionalDependencies(nextTree, 'child-react').outgoingIds).toEqual(['child-db'])
      expect(getNodeAdditionalDependencies(nextTree, 'child-db').outgoingIds).toEqual([])
    })

    it('should not change layout coordinates after dependency-only changes', () => {
      const tree = createSimpleTree()
      const before = solveSkillTreeLayout(tree, TREE_CONFIG)
      const changed = setLevelAdditionalDependencies(tree, 'child-react', LEVEL_CHILD_REACT_1, [LEVEL_CHILD_DB_1])
      const after = solveSkillTreeLayout(changed, TREE_CONFIG)

      const beforeById = new Map(before.layout.nodes.map((node) => [node.id, node]))
      after.layout.nodes.forEach((node) => {
        const previous = beforeById.get(node.id)
        expect(previous).toBeDefined()
        expect(node.x).toBeCloseTo(previous.x, 6)
        expect(node.y).toBeCloseTo(previous.y, 6)
      })
    })
  })

  describe('scopes', () => {
    it('should create a scope and assign it to a level', () => {
      const tree = createSimpleTree()
      const withLevels = updateNodeData(tree, 'child-react', 'React', 'done')
      const created = addScopeWithResult(withLevels, 'Serie A')

      expect(created.ok).toBe(true)
      expect(created.scope).toBeDefined()

      const levelId = findNodeById(withLevels, 'child-react').levels[0].id

      const assigned = updateNodeProgressLevel(created.tree, 'child-react', levelId, {
        scopeIds: [created.scope.id],
      })
      const level = findNodeById(assigned, 'child-react').levels[0]

      expect(level.scopeIds).toEqual([created.scope.id])
    })

    it('should reject blank and duplicate scope names', () => {
      const tree = {
        ...createSimpleTree(),
        scopes: [{ id: 'scope-a', label: 'Serie A' }],
      }

      const blank = addScopeWithResult(tree, '   ')
      expect(blank.ok).toBe(false)

      const duplicate = addScopeWithResult(tree, ' serie a ')
      expect(duplicate.ok).toBe(false)
    })

    it('should reject duplicate names on rename with trim+case-insensitive check', () => {
      const tree = {
        ...createSimpleTree(),
        scopes: [
          { id: 'scope-a', label: 'Serie A' },
          { id: 'scope-b', label: 'Serie B' },
        ],
      }

      const result = renameScopeWithResult(tree, 'scope-b', ' serie a ')
      expect(result.ok).toBe(false)
    })

    it('should remove deleted scope references from all levels', () => {
      const tree = {
        ...createSimpleTree(),
        scopes: [
          { id: 'scope-a', label: 'Serie A' },
          { id: 'scope-b', label: 'Serie B' },
        ],
      }
      const withLevels = updateNodeData(tree, 'child-react', 'React', 'done')
      const levelId = findNodeById(withLevels, 'child-react').levels[0].id

      const withScopes = updateNodeProgressLevel(withLevels, 'child-react', levelId, {
        scopeIds: ['scope-a', 'scope-b'],
      })

      const deleted = deleteScopeWithResult(withScopes, 'scope-a')
      expect(deleted.ok).toBe(true)

      const level = findNodeById(deleted.tree, 'child-react').levels[0]
      expect(level.scopeIds).toEqual(['scope-b'])
    })
  })
})
