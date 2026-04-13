import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { MantineProvider } from '@mantine/core'
import { describe, expect, it, vi } from 'vitest'
import { SkillTreeCanvas } from '../canvas/SkillTreeCanvas'

const createBaseProps = () => ({
  canvasRef: { current: null },
  canvas: { width: 800, height: 600, origin: { x: 400, y: 300 }, maxRadius: 250 },
  centerIconSource: '/icon.svg',
  centerIconSize: 120,
  systemName: 'System A',
  activeRelease: {
    id: 'r1',
    name: 'Release 1',
    motto: 'Go',
    date: '2026-04-13',
    introduction: 'Hello **world**',
  },
  draftRelease: null,
  filteredSegmentSeparators: [],
  filteredSegmentLabels: [],
  filteredLinks: [],
  layoutNodesById: new Map(),
  renderedNodes: [],
  nodeVisibilityModeById: new Map(),
  selectedNodeId: null,
  selectedNodeIds: [],
  selectedSegmentId: null,
  selectedPortalKey: null,
  visibleDependencyPortals: [],
  selectedLayoutNode: null,
  selectedControlGeometry: null,
  selectedSegmentLabel: null,
  selectedSegmentControlGeometry: null,
  emptyStateAddControl: null,
  emptySegmentAddControl: null,
  onCanvasClick: vi.fn(),
  onCanvasDoubleClick: vi.fn(),
  onOpenCenterIconPanel: vi.fn(),
  onSelectSegment: vi.fn(),
  onSelectPortal: vi.fn(),
  onAddInitialRoot: vi.fn(),
  onAddInitialSegment: vi.fn(),
  onAddRootNear: vi.fn(),
  onAddSegmentNear: vi.fn(),
  onAddChild: vi.fn(),
  onSelectNode: vi.fn(),
  onZoomToNode: vi.fn(),
})

describe('SkillTreeCanvas', () => {
  it('renders to string without runtime reference errors', () => {
    const html = renderToString(
      createElement(
        MantineProvider,
        null,
        createElement(SkillTreeCanvas, createBaseProps()),
      ),
    )

    expect(html).toContain('skill-tree-canvas')
    expect(html).toContain('skill-tree-center-icon')
  })

  it('renders root-near controls when a root node is selected', () => {
    const props = createBaseProps()
    props.selectedLayoutNode = { id: 'root-a', depth: 1, level: 1 }
    props.selectedControlGeometry = {
      child: { x: 100, y: 120 },
      left: { x: 80, y: 120 },
      right: { x: 120, y: 120 },
    }

    const html = renderToString(
      createElement(
        MantineProvider,
        null,
        createElement(SkillTreeCanvas, props),
      ),
    )

    expect(html).toContain('data-add-control="root-near"')
    expect(html).toContain('data-node-id="root-a"')
  })
})
