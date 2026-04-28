import React, { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { MantineProvider } from '@mantine/core'
import { describe, expect, it, vi } from 'vitest'
import { PANEL_INSPECTOR } from '../utils/panelsState'

vi.mock('../utils/documentState', async (importOriginal) => {
  const actual = await importOriginal()

  return {
    ...actual,
    createEmptyDocument: () => ({
      systemName: 'myKyana',
      segments: [
        { id: 'segment-backend', label: 'Backend' },
        { id: 'segment-frontend', label: 'Frontend' },
      ],
      scopes: [],
      releases: [
        {
          id: 'release-1',
          name: 'Release 1',
          motto: '',
          introduction: '',
          voiceOfCustomer: '',
          fictionalCustomerName: '',
          date: '',
          storyPointBudget: null,
          statusBudgets: { done: null, now: null, next: null, later: null, someday: null },
          featureStatuses: { done: false, now: true, next: true, later: false, someday: false },
          notesMarkdown: '',
          notesChecked: {},
        },
      ],
      children: [
        {
          id: 'node-backend',
          label: 'Backend',
          shortName: 'BCK',
          segmentId: 'segment-backend',
          children: [],
          levels: [
            { id: 'level-backend', label: 'Level 1', statuses: { 'release-1': 'now' }, releaseNote: '', scopeIds: [] },
          ],
        },
        {
          id: 'node-frontend',
          label: 'Frontend',
          shortName: 'FND',
          segmentId: 'segment-frontend',
          children: [],
          levels: [
            { id: 'level-frontend', label: 'Level 1', statuses: { 'release-1': 'done' }, releaseNote: '', scopeIds: [] },
          ],
        },
      ],
      showHiddenNodes: false,
    }),
  }
})

vi.mock('../../hooks/useSkillTreeUiState', () => ({
  useSkillTreeUiState: () => ({
    selectedNodeId: null,
    setSelectedNodeId: () => {},
    selectedNodeIds: ['node-backend', 'node-frontend'],
    setSelectedNodeIds: () => {},
    selectedLevelKeys: [],
    setSelectedLevelKeys: () => {},
    selectedProgressLevelId: null,
    setSelectedProgressLevelId: () => {},
    selectedSegmentId: null,
    _setSelectedSegmentId: () => {},
    selectedPortalKey: null,
    setSelectedPortalKey: () => {},
    rightPanel: PANEL_INSPECTOR,
    setRightPanel: () => {},
    isReleaseNotesPanelOpen: true,
    setIsReleaseNotesPanelOpen: () => {},
    isToolbarCollapsed: false,
    setIsToolbarCollapsed: () => {},
    isLegendVisible: false,
    setIsLegendVisible: () => {},
    selectedScopeFilterId: '__all__',
    setSelectedScopeFilterId: () => {},
    releaseFilter: 'all',
    setReleaseFilter: () => {},
    transformKey: 0,
    setTransformKey: () => {},
    selectNodeId: () => {},
    selectSegmentId: () => {},
    resetSelections: () => {},
    selectedReleaseId: null,
    setSelectedReleaseId: () => {},
  }),
}))

import { SkillTree } from '../SkillTree'

describe('SkillTree internal notes integration', () => {
  it('renders inspector and internal notes together in the right sidebar', () => {
    const html = renderToString(
      createElement(MantineProvider, null,
        createElement(SkillTree),
      ),
    )

    expect(html).toContain('Inspector')
    expect(html).toContain('2 selected')
    expect(html).toContain('Internal notes')
    expect(html).toContain('Close internal notes panel')
  })
})
