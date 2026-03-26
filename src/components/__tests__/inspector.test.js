import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { MantineProvider } from '@mantine/core'
import { InspectorPanel } from '../panels/InspectorPanel'
import { commitInspectorDrafts, shouldCenterInspectorOnCommit } from '../utils/inspectorCommit'
import { resolveInspectorSelectedNode } from '../utils/selection'

describe('inspector resolver', () => {
  it('returns null when multiple node ids are selected', () => {
    const node = { id: 'a', label: 'A' }
    const result = resolveInspectorSelectedNode(node, ['a', 'b', 'c'])
    expect(result).toBeNull()
  })

  it('returns node when single or no selection', () => {
    const node = { id: 'a', label: 'A' }
    expect(resolveInspectorSelectedNode(node, ['a'])).toBe(node)
    expect(resolveInspectorSelectedNode(node, [])).toBe(node)
  })
})

describe('InspectorPanel render', () => {
  it('renders the inspector panel without crashing', () => {
    const html = renderToString(
      createElement(MantineProvider, null,
        createElement(InspectorPanel, {
          selectedNode: {
            id: 'node-1',
            label: 'Node 1',
            shortName: 'N1',
            segmentId: null,
            status: 'now',
            levels: [
              { id: 'level-1', label: 'Level 1', status: 'now', releaseNote: '', scopeIds: [] },
            ],
            children: [],
          },
          selectedNodeIds: [],
          roadmapData: { segments: [], scopes: [], children: [] },
          currentLevel: 1,
          selectedProgressLevelId: 'level-1',
          onClose: () => {},
          onLabelChange: () => {},
          onShortNameChange: () => {},
          onStatusChange: () => {},
          onReleaseNoteChange: () => {},
          onScopeIdsChange: () => {},
          scopeOptions: [],
          onCreateScope: () => ({ ok: true }),
          onRenameScope: () => ({ ok: true }),
          onDeleteScope: () => ({ ok: true }),
          onCreateSegment: () => ({ ok: true }),
          onRenameSegment: () => ({ ok: true }),
          onDeleteSegment: () => ({ ok: true }),
          onSelectProgressLevel: () => {},
          onAddProgressLevel: () => {},
          onDeleteProgressLevel: () => {},
          onLevelChange: () => {},
          levelOptions: [{ value: 1, isAllowed: true }],
          segmentOptions: [],
          parentOptions: [],
          selectedParentId: null,
          additionalDependencyOptions: [],
          selectedAdditionalDependencyIds: [],
          incomingDependencyLabels: [],
          validationMessage: null,
          onParentChange: () => {},
          onAdditionalDependenciesChange: () => {},
          onSegmentChange: () => {},
          onDeleteNodeOnly: () => {},
          onDeleteNodeBranch: () => {},
          onFocusNode: () => {},
        }),
      ),
    )

    expect(html).toContain('Inspector')
    expect(html).toContain('Skill bearbeiten')
  })
})

describe('commitInspectorDrafts', () => {
  it('commits only the drafts that changed', () => {
    const onNameChange = vi.fn()
    const onShortNameChange = vi.fn()
    const onReleaseNoteChange = vi.fn()

    const result = commitInspectorDrafts({
      nameDraft: 'Node A',
      currentName: 'Node B',
      onNameChange,
      shortNameDraft: 'NA',
      currentShortName: 'NA',
      onShortNameChange,
      releaseNoteDraft: 'Release notes',
      currentReleaseNote: 'Old notes',
      onReleaseNoteChange,
    })

    expect(result).toEqual({
      nameCommitted: true,
      shortNameCommitted: false,
      releaseNoteCommitted: true,
    })
    expect(onNameChange).toHaveBeenCalledWith('Node A')
    expect(onShortNameChange).not.toHaveBeenCalled()
    expect(onReleaseNoteChange).toHaveBeenCalledWith('Release notes')
  })
})

describe('shouldCenterInspectorOnCommit', () => {
  it('centers only on real inspector edits and not on selection-change cleanup', () => {
    expect(shouldCenterInspectorOnCommit({ nameCommitted: true }, 'explicit')).toBe(true)
    expect(shouldCenterInspectorOnCommit({ nameCommitted: false, shortNameCommitted: false, releaseNoteCommitted: false }, 'explicit')).toBe(false)
    expect(shouldCenterInspectorOnCommit({ nameCommitted: true }, 'selection-change')).toBe(false)
  })
})
