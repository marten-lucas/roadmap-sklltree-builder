/**
 * Smoke test for ListViewDrawer.
 *
 * Rationale: TDZ (Temporal Dead Zone) bugs — where a const binding from useState
 * is referenced in a useCallback/useEffect declared above it — only surface at
 * render time, not at import time.  ESLint's react-hooks plugin does NOT catch
 * declaration-order issues (it only checks conditional hook calls).
 *
 * This test renders the component via react-dom/server renderToString (works in
 * the node environment — no DOM required) so that any initialization-time hook
 * error throws immediately and fails the test.
 */
import { renderToString } from 'react-dom/server'
import React from 'react'
import { MantineProvider } from '@mantine/core'
import { ListViewDrawer, sortFlatLevelEntries, sortFlatNodesBySelection } from '../panels/ListViewDrawer'

const MINIMAL_DOCUMENT = { children: [], scopes: [] }
const DOCUMENT_WITH_LEVEL = {
  children: [
    {
      id: 'node-1',
      label: 'Node 1',
      shortName: 'N1',
      children: [],
      levels: [
        { id: 'level-1', label: 'Level 1', status: 'now', scopeIds: ['scope-1'], hasOpenPoints: true, openPointsLabel: 'Status values missing' },
      ],
    },
  ],
  scopes: [
    { id: 'scope-1', label: 'Series A', color: '#6366f1' },
    { id: 'scope-2', label: 'Platform', color: '#16a34a' },
  ],
}

const DOCUMENT_WITH_LONG_CONTENT = {
  children: [
    {
      id: 'node-long',
      label: 'Extremely Long Capability Name For Autosizing',
      shortName: 'LONG',
      children: [],
      levels: [
        {
          id: 'level-long',
          label: 'Cross-team rollout and migration coordination',
          status: 'someday',
          scopeIds: ['scope-enterprise-platform'],
          hasOpenPoints: false,
          releaseNote: 'A fairly detailed note that should not break the table alignment.',
        },
      ],
    },
  ],
  scopes: [
    { id: 'scope-enterprise-platform', label: 'Enterprise Platform Rollout', color: '#0ea5e9' },
  ],
}

const defaultProps = {
  opened: true,
  document: MINIMAL_DOCUMENT,
  onClose: () => {},
  onSelectNode: () => {},
  onSelectLevel: () => {},
}

test('ListViewDrawer renders without crashing (guards against TDZ regressions)', () => {
  expect(() =>
    renderToString(React.createElement(MantineProvider, null,
      React.createElement(ListViewDrawer, defaultProps)))
  ).not.toThrow()
})

test('ListViewDrawer renders compact colored status pills for list mode', () => {
  const html = renderToString(React.createElement(MantineProvider, null,
    React.createElement(ListViewDrawer, {
      ...defaultProps,
      document: DOCUMENT_WITH_LEVEL,
      selectedLevelKeys: ['node-1::level-1'],
      selectedNodeIds: ['node-1'],
      selectionMode: true,
    })))

  expect(html).toContain('list-view-drawer__status-pill--now')
  expect(html).toContain('Multi-select')
  expect(html).toContain('Selected 1')
  expect(html).toContain('Now')
  expect(html).toContain('list-view-drawer__scope-select')
  expect(html).toContain('Series A')
  expect(html).toContain('Open points')
  expect(html).toContain('Open points 1/1')
  expect(html).toContain('Filter by status')
  expect(html).toContain('Roadmap order')
  expect(html).toContain('A → Z')
  expect(html).toContain('Z → A')
  expect(html).toContain('Columns')
  expect(html).toContain('Inspector')
  expect(html).toContain('list-view-drawer__metrics-header-col--status')
  expect(html).not.toContain('No nodes match the selected filters.')
})

test('ListViewDrawer exposes shared CSS column widths for aligned table layout', () => {
  const html = renderToString(React.createElement(MantineProvider, null,
    React.createElement(ListViewDrawer, {
      ...defaultProps,
      document: DOCUMENT_WITH_LONG_CONTENT,
    })))

  expect(html).toContain('--listview-label-col-width:')
  expect(html).toContain('--listview-status-col-width:')
  expect(html).toContain('--listview-scopes-col-width:')
})

test('sort helpers support roadmap order and alphabetical ordering for list view columns', () => {
  const scopeMap = new Map([
    ['scope-1', { id: 'scope-1', label: 'Series A' }],
    ['scope-2', { id: 'scope-2', label: 'Platform' }],
  ])

  const levelEntries = [
    {
      node: { id: 'node-b', label: 'Beta', shortName: 'B' },
      level: { id: 'level-z', label: 'Zebra', status: 'later', scopeIds: ['scope-2'], releaseNote: 'Zulu note' },
      levelIndex: 0,
    },
    {
      node: { id: 'node-a', label: 'Alpha', shortName: 'A' },
      level: { id: 'level-a', label: 'Alpha', status: 'done', scopeIds: ['scope-1'], releaseNote: 'Alpha note' },
      levelIndex: 0,
    },
  ]

  expect(sortFlatLevelEntries(levelEntries, { field: 'roadmap', direction: 'roadmap', scopeMap }).map(({ node }) => node.label)).toEqual(['Beta', 'Alpha'])
  expect(sortFlatLevelEntries(levelEntries, { field: 'name', direction: 'asc', scopeMap }).map(({ node }) => node.label)).toEqual(['Alpha', 'Beta'])
  expect(sortFlatLevelEntries(levelEntries, { field: 'name', direction: 'desc', scopeMap }).map(({ node }) => node.label)).toEqual(['Beta', 'Alpha'])
  expect(sortFlatLevelEntries(levelEntries, { field: 'notes', direction: 'asc', scopeMap }).map(({ level }) => level.id)).toEqual(['level-a', 'level-z'])

  const nodes = [
    { id: 'node-b', label: 'Beta', shortName: 'B', levels: [{ status: 'later', scopeIds: ['scope-2'] }] },
    { id: 'node-a', label: 'Alpha', shortName: 'A', levels: [{ status: 'done', scopeIds: ['scope-1'] }] },
  ]

  expect(sortFlatNodesBySelection(nodes, { field: 'name', direction: 'asc', scopeMap }).map((node) => node.label)).toEqual(['Alpha', 'Beta'])
})
