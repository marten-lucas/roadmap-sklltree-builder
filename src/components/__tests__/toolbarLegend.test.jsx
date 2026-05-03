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
    expect(html).toContain('Internal notes')
    expect(html).toContain('Show budget overview')
    expect(html).toContain('aria-label="Filter"')
    expect(html).not.toContain('aria-label="Filter (active)"')
    expect(html).not.toContain('Open points for selected levels')
  })

  it('marks the filter action as active when a status filter is set', () => {
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
          releaseFilter: 'next',
          setReleaseFilter: () => {},
          selectedReleaseFilterLabel: 'Next',
          selectedScopeFilterId: ['scope-a'],
          setSelectedScopeFilterId: () => {},
          selectedScopeFilterLabel: 'Payments',
          scopeOptions: [{ value: 'scope-a', label: 'Payments', color: '#16a34a' }],
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

    expect(html).toContain('Filter (active)')
    expect(html).not.toContain('background:currentColor')
    expect(html).not.toContain('box-shadow:0 0 0 2px rgba(15, 23, 42, 0.85)')
  })

  it('marks the filter action as active when only a scope filter is set', () => {
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
          selectedScopeFilterId: ['scope-a'],
          setSelectedScopeFilterId: () => {},
          selectedScopeFilterLabel: 'Payments',
          scopeOptions: [{ value: 'scope-a', label: 'Payments', color: '#16a34a' }],
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

    expect(html).toContain('Filter (active)')
  })

})
