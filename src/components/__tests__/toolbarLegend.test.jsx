import React, { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { MantineProvider } from '@mantine/core'
import { describe, expect, it } from 'vitest'
import { SkillTreeToolbar } from '../toolbar/SkillTreeToolbar'

describe('SkillTreeToolbar legend toggle', () => {
  it('renders a legend toggle action for the status help', () => {
    const html = renderToString(
      createElement(MantineProvider, null,
        createElement(SkillTreeToolbar, {
          isCollapsed: false,
          onToggleCollapsed: () => {},
          onOpenDocumentPicker: () => {},
          onOpenCsvDocumentPicker: () => {},
          onOpenJsonDocumentPicker: () => {},
          onExportHtml: () => {},
          onExportCsv: () => {},
          onExportJson: () => {},
          onExportPdf: () => {},
          onExportSvg: () => {},
          onExportPng: () => {},
          onExportCleanSvg: () => {},
          onUndo: () => {},
          canUndo: false,
          onRedo: () => {},
          canRedo: false,
          onReset: () => {},
          onOpenSegmentManager: () => {},
          onOpenScopeManager: () => {},
          onOpenPriorityMatrix: () => {},
          onOpenListView: () => {},
          releaseFilter: 'all',
          setReleaseFilter: () => {},
          selectedReleaseFilterLabel: 'All',
          selectedScopeFilterId: '__all__',
          setSelectedScopeFilterId: () => {},
          selectedScopeFilterLabel: 'All scopes',
          scopeOptions: [],
          autosaveLabel: 'Saved',
          allNodesById: new Map(),
          onSelectNode: () => {},
          currentZoomScale: 1,
          onZoomIn: () => {},
          onZoomOut: () => {},
          onZoomToScale: () => {},
          onFitToScreen: () => {},
          hiddenNodeCount: 0,
          showHiddenNodes: false,
          onToggleShowHiddenNodes: () => {},
          releases: [],
          selectedReleaseId: null,
          onReleaseChange: () => {},
          releaseBudgetSummaries: new Map(),
        }),
      ),
    )

    expect(html).toContain('Show legend')
  })
})
