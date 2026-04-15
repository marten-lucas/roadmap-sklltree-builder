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
import { ListViewDrawer } from '../panels/ListViewDrawer'

const MINIMAL_DOCUMENT = { children: [], scopes: [] }
const DOCUMENT_WITH_LEVEL = {
  children: [
    {
      id: 'node-1',
      label: 'Node 1',
      shortName: 'N1',
      children: [],
      levels: [
        { id: 'level-1', label: 'Level 1', status: 'now', scopeIds: ['scope-1'] },
      ],
    },
  ],
  scopes: [
    { id: 'scope-1', label: 'Series A', color: '#6366f1' },
    { id: 'scope-2', label: 'Platform', color: '#16a34a' },
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
    })))

  expect(html).toContain('list-view-drawer__status-pill--now')
  expect(html).toContain('Now')
  expect(html).toContain('list-view-drawer__scope-select')
  expect(html).toContain('Series A')
})
