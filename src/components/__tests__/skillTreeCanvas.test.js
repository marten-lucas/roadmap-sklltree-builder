import { Children, isValidElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { SkillTreeCanvas } from '../canvas/SkillTreeCanvas'

const findElementsByProp = (element, predicate, matches = []) => {
  if (Array.isArray(element)) {
    element.forEach((child) => findElementsByProp(child, predicate, matches))
    return matches
  }

  if (!isValidElement(element)) {
    return matches
  }

  if (predicate(element)) {
    matches.push(element)
  }

  Children.toArray(element.props?.children).forEach((child) => {
    findElementsByProp(child, predicate, matches)
  })

  return matches
}

describe('SkillTreeCanvas', () => {
  it('routes root plus controls to the root insertion handler', () => {
    const onAddRootNear = vi.fn()
    const onAddSegmentNear = vi.fn()

    const element = SkillTreeCanvas({
      canvasRef: { current: null },
      canvas: { width: 800, height: 600, origin: { x: 400, y: 300 }, maxRadius: 250 },
      centerIconSource: '/icon.svg',
      centerIconSize: 120,
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
      selectedLayoutNode: { id: 'root-a', depth: 1, level: 1 },
      selectedControlGeometry: {
        child: { x: 100, y: 120 },
        left: { x: 80, y: 120 },
        right: { x: 120, y: 120 },
      },
      selectedSegmentLabel: null,
      selectedSegmentControlGeometry: null,
      emptyStateAddControl: null,
      emptySegmentAddControl: null,
      onCanvasClick: vi.fn(),
      onOpenCenterIconPanel: vi.fn(),
      onSelectSegment: vi.fn(),
      onSelectPortal: vi.fn(),
      onAddInitialRoot: vi.fn(),
      onAddInitialSegment: vi.fn(),
      onAddRootNear,
      onAddSegmentNear,
      onAddChild: vi.fn(),
      onSelectNode: vi.fn(),
    })

    const rootControls = findElementsByProp(
      element,
      (node) => node.props?.['data-add-control'] === 'root-near',
    )

    expect(rootControls).toHaveLength(2)

    rootControls[0].props.onClick({ stopPropagation: vi.fn() })
    rootControls[1].props.onClick({ stopPropagation: vi.fn() })

    expect(onAddRootNear).toHaveBeenNthCalledWith(1, 'root-a', 'left')
    expect(onAddRootNear).toHaveBeenNthCalledWith(2, 'root-a', 'right')
    expect(onAddSegmentNear).not.toHaveBeenCalled()
  })
})