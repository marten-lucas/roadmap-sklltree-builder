import { describe, expect, it } from 'vitest'
import { createDocumentHistoryState, documentHistoryReducer } from '../utils/documentState'
import { createSimpleTree } from './testUtils'
import { deleteNodeOnly, updateNodeProgressLevel, findNodeById } from '../utils/treeData'

describe('multiselect helpers (unit)', () => {
  it('batch apply (multiple deletes) is a single history apply', () => {
    const initialDoc = createSimpleTree()
    const state = createDocumentHistoryState(initialDoc)

    // simulate batch deletion of two nodes and apply once
    const afterFirst = deleteNodeOnly(initialDoc, 'child-react')
    const afterSecond = deleteNodeOnly(afterFirst, 'child-vue')

    const applied = documentHistoryReducer(state, { type: 'apply', document: afterSecond })

    expect(applied.past).toHaveLength(1)
    // past should contain the cloned/normalized present document from initial state
    expect(applied.past[0]).toEqual(state.present)

    const undone = documentHistoryReducer(applied, { type: 'undo' })
    // undo should restore the cloned/normalized present from initial state
    expect(undone.present).toEqual(state.present)
  })

  it('applying status to all levels updates each level when invoked per-level', () => {
    const tree = {
      segments: [],
      children: [
        {
          id: 'node-1',
          label: 'Node 1',
          levels: [
            { id: 'lvl-1', label: 'L1', status: 'now', releaseNote: '', scopeIds: [] },
            { id: 'lvl-2', label: 'L2', status: 'later', releaseNote: '', scopeIds: [] },
          ],
          children: [],
        },
      ],
    }

    // apply status change for each level with a releaseId
    const releaseId = 'test-release'
    let next = tree
    const node = findNodeById(next, 'node-1')
    const levels = node.levels.map((l) => l.id)

    for (const levelId of levels) {
      next = updateNodeProgressLevel(next, 'node-1', levelId, { status: 'done' }, releaseId)
    }

    const updatedNode = findNodeById(next, 'node-1')
    const statuses = (updatedNode.levels ?? []).map((l) => l.statuses?.[releaseId])
    expect(statuses).toEqual(['done', 'done'])
  })
})
