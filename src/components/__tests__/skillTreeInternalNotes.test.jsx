import React, { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { MantineProvider } from '@mantine/core'
import { describe, expect, it, vi } from 'vitest'
import { PANEL_RELEASE_NOTES } from '../utils/panelsState'

vi.mock('../../hooks/useSkillTreeUiState', () => ({
  useSkillTreeUiState: () => ({
    selectedNodeId: null,
    setSelectedNodeId: () => {},
    selectedNodeIds: [],
    setSelectedNodeIds: () => {},
    selectedLevelKeys: [],
    setSelectedLevelKeys: () => {},
    selectedProgressLevelId: null,
    setSelectedProgressLevelId: () => {},
    selectedSegmentId: null,
    _setSelectedSegmentId: () => {},
    selectedPortalKey: null,
    setSelectedPortalKey: () => {},
    rightPanel: PANEL_RELEASE_NOTES,
    setRightPanel: () => {},
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
  it('renders the internal notes sidebar when the release notes panel is active', () => {
    const html = renderToString(
      createElement(MantineProvider, null,
        createElement(SkillTree),
      ),
    )

    expect(html).toContain('Internal notes')
    expect(html).toContain('Close internal notes panel')
  })
})
