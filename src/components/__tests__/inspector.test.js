import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { MantineProvider } from '@mantine/core'
import { InspectorPanel } from '../panels/InspectorPanel'
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
