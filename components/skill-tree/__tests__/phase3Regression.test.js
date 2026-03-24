import { describe, expect, it } from 'vitest'
import { calculateRadialSkillTree } from '../layout'
import { TREE_CONFIG } from '../config'
import {
  addScopeWithResult,
  deleteScopeWithResult,
  findNodeById,
  updateNodeProgressLevel,
  updateNodeData,
  updateNodeSegment,
} from '../treeData'
import { parseDocumentPayload, serializeDocumentPayload } from '../documentPersistence'
import {
  createSimpleTree,
  createCrossSegmentTree,
  SEGMENT_BACKEND,
  SEGMENT_FRONTEND,
} from './testUtils'

const snapshotLayout = (layoutResult) => new Map(
  layoutResult.nodes.map((node) => [node.id, {
    x: node.x,
    y: node.y,
    angle: node.angle,
    radius: node.radius,
    parentId: node.parentId,
  }]),
)

describe('phase 3 regression suite', () => {
  it('keeps layout deterministic when only scope assignments change', () => {
    const tree = createSimpleTree()
    const withLevels = updateNodeData(tree, 'child-react', 'React', 'done')
    const created = addScopeWithResult(withLevels, 'Serie A')

    expect(created.ok).toBe(true)

    const levelId = findNodeById(withLevels, 'child-react').levels[0].id
    const withScopeAssignments = updateNodeProgressLevel(created.tree, 'child-react', levelId, {
      scopeIds: [created.scope.id],
    })

    const before = calculateRadialSkillTree(withLevels, TREE_CONFIG)
    const after = calculateRadialSkillTree(withScopeAssignments, TREE_CONFIG)

    expect(after.nodes.length).toBe(before.nodes.length)
    expect(snapshotLayout(after)).toEqual(snapshotLayout(before))
  })

  it('sanitizes scope references without affecting the tree structure', () => {
    const tree = createSimpleTree()
    const withLevels = updateNodeData(tree, 'child-react', 'React', 'done')
    const created = addScopeWithResult(withLevels, 'Serie A')
    const levelId = findNodeById(withLevels, 'child-react').levels[0].id
    const withScopeAssignments = updateNodeProgressLevel(created.tree, 'child-react', levelId, {
      scopeIds: [created.scope.id],
    })

    const deleted = deleteScopeWithResult(withScopeAssignments, created.scope.id)

    expect(deleted.ok).toBe(true)
    expect(findNodeById(deleted.tree, 'child-react').levels[0].scopeIds).toEqual([])
    expect(deleted.tree.children).toHaveLength(withScopeAssignments.children.length)

    const before = calculateRadialSkillTree(withScopeAssignments, TREE_CONFIG)
    const after = calculateRadialSkillTree(deleted.tree, TREE_CONFIG)
    expect(snapshotLayout(after)).toEqual(snapshotLayout(before))
  })

  it('keeps segment reassignment local to the target subtree', () => {
    const tree = createCrossSegmentTree()
    const reassigned = updateNodeSegment(tree, 'react', SEGMENT_BACKEND)

    expect(findNodeById(reassigned, 'react').segmentId).toBe(SEGMENT_BACKEND)
    expect(findNodeById(reassigned, 'api-consumption').segmentId).toBe(SEGMENT_BACKEND)
    expect(findNodeById(reassigned, 'root-backend').segmentId).toBe(SEGMENT_BACKEND)
    expect(findNodeById(reassigned, 'root-frontend').segmentId).toBe(SEGMENT_FRONTEND)

    const result = calculateRadialSkillTree(reassigned, TREE_CONFIG)
    expect(result.nodes.length).toBe(5)
    result.nodes.forEach((node) => {
      expect(Number.isFinite(node.x)).toBe(true)
      expect(Number.isFinite(node.y)).toBe(true)
      expect(Number.isFinite(node.angle)).toBe(true)
      expect(Number.isFinite(node.radius)).toBe(true)
    })
  })

  it('roundtrips persisted documents with scopes and levels intact', () => {
    const document = {
      segments: [{ id: SEGMENT_FRONTEND, label: 'Frontend' }],
      scopes: [{ id: 'scope-a', label: 'Serie A' }],
      children: [
        {
          id: 'root',
          label: 'Root',
          status: 'done',
          ebene: null,
          segmentId: SEGMENT_FRONTEND,
          children: [],
          levels: [
            {
              id: 'level-root',
              label: 'Level 1',
              status: 'done',
              releaseNote: '',
              scopeIds: ['scope-a'],
            },
          ],
        },
      ],
      centerIconSrc: '/icons/default.svg',
    }

    const parsed = parseDocumentPayload(serializeDocumentPayload(document))

    expect(parsed.ok).toBe(true)
    expect(parsed.value).toEqual(document)
  })
})