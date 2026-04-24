import fs from 'node:fs'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { MantineProvider } from '@mantine/core'
import { describe, expect, it, vi } from 'vitest'
import { SkillTreeCanvas } from '../canvas/SkillTreeCanvas'
import { getPreferredPortalCenterAngle, pickPortalSlotAngle } from '../utils/portalPlacement'

const createBaseProps = () => ({
  canvasRef: { current: null },
  canvas: { width: 800, height: 600, origin: { x: 400, y: 300 }, maxRadius: 250 },
  currentZoomScale: 1,
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

const extractPortalMetric = (html, className, attribute) => {
  const match = html.match(new RegExp(`${className}[^>]*${attribute}="([\\d.]+)"`))
  return match ? Number(match[1]) : null
}

const extractPortalStrokeWidth = (html) => {
  const match = html.match(/skill-tree-portal__hoverline[^>]*stroke-width:([\d.]+)/)
  return match ? Number(match[1]) : null
}

const extractChevronPath = (html, type) => {
  const classPattern = `skill-tree-portal__chevrons(?: [^"]*)? skill-tree-portal__chevrons--${type}`
  const dBeforeClass = html.match(new RegExp(`<path[^>]*d="([^"]+)"[^>]*class="${classPattern}[^"]*"`))
  if (dBeforeClass) return dBeforeClass[1]
  const classBeforeD = html.match(new RegExp(`<path[^>]*class="${classPattern}[^"]*"[^>]*d="([^"]+)"`))
  return classBeforeD ? classBeforeD[1] : null
}

const extractFirstChevronX = (pathD) => {
  const numbers = pathD?.match(/-?\d+(?:\.\d+)?/g)?.map(Number)
  if (!numbers || numbers.length < 6) return null
  return {
    arm1X: numbers[0],
    tipX: numbers[2],
    arm2X: numbers[4],
  }
}

const extractRingRotation = (html, type) => {
  const match = html.match(new RegExp(`<path[^>]*class="[^"]*skill-tree-portal__ring--${type}[^"]*"[^>]*transform="[^"]*rotate\\(([-\\d.]+)\\)`))
  return match ? Number(match[1]) : null
}

const normalizeAngle = (angle) => {
  const normalized = angle % 360
  return normalized < 0 ? normalized + 360 : normalized
}

const minimalAngleDelta = (left, right) => {
  const delta = Math.abs(normalizeAngle(left) - normalizeAngle(right))
  return Math.min(delta, 360 - delta)
}

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

  it('prefers the peer-facing direction for first-ring source portals', () => {
    const angle = getPreferredPortalCenterAngle({
      layoutNode: { x: 100, y: 0 },
      peerNode: { x: 220, y: 0 },
      canvasOrigin: { x: 0, y: 0 },
      type: 'source',
    })

    expect(angle).toBeCloseTo(0, 5)
  })

  it('offsets requires portals away from blocked inward connection lines', () => {
    const angle = pickPortalSlotAngle({
      type: 'source',
      inwardAngle: 0,
      blockedDirs: [0],
      reservedAngles: [],
    })

    expect(angle).not.toBeCloseTo(0, 5)
    expect(Math.abs(angle)).toBeLessThanOrEqual(80)
  })

  it('offsets enables portals away from blocked outward connection lines', () => {
    const angle = pickPortalSlotAngle({
      type: 'target',
      inwardAngle: 0,
      blockedDirs: [180],
      reservedAngles: [],
    })

    expect(angle).not.toBeCloseTo(180, 5)
    const outwardDelta = Math.abs((((angle - 180) % 360) + 540) % 360 - 180)
    expect(outwardDelta).toBeLessThanOrEqual(80)
  })

  it('keeps source inward and target outward hemispheres for all four cardinal center directions', () => {
    const inwardAngles = [0, 90, 180, 270]

    for (const inwardAngle of inwardAngles) {
      const outwardAngle = normalizeAngle(inwardAngle + 180)

      const sourceAngle = pickPortalSlotAngle({
        type: 'source',
        inwardAngle,
        blockedDirs: [inwardAngle],
        reservedAngles: [],
      })

      const targetAngle = pickPortalSlotAngle({
        type: 'target',
        inwardAngle,
        blockedDirs: [outwardAngle],
        reservedAngles: [],
      })

      expect(minimalAngleDelta(sourceAngle, inwardAngle)).toBeLessThanOrEqual(80)
      expect(minimalAngleDelta(sourceAngle, outwardAngle)).toBeGreaterThan(80)
      expect(minimalAngleDelta(targetAngle, outwardAngle)).toBeLessThanOrEqual(80)
      expect(minimalAngleDelta(targetAngle, inwardAngle)).toBeGreaterThan(80)
    }
  })

  it('renders the same hover hitbox primitives for sockets and plugs', () => {
    const props = createBaseProps()
    props.layoutNodesById = new Map([
      ['node-a', { id: 'node-a', x: 100, y: 100 }],
      ['node-b', { id: 'node-b', x: 260, y: 100 }],
    ])
    props.renderedNodes = [
      { id: 'node-a', x: 100, y: 100, label: 'Alpha' },
      { id: 'node-b', x: 260, y: 100, label: 'Beta' },
    ]
    props.visibleDependencyPortals = [
      { key: 'dep-a:source', nodeId: 'node-a', sourceId: 'node-a', targetId: 'node-b', type: 'source', otherLabel: 'BET·Rollout', tooltip: 'Requires Beta', x: 180, y: 100, angle: 0, isMinimal: false, isInteractive: true },
      { key: 'dep-a:target', nodeId: 'node-b', sourceId: 'node-a', targetId: 'node-b', type: 'target', otherLabel: 'ALP·Foundation', tooltip: 'Enables Alpha', x: 180, y: 100, angle: 180, isMinimal: false, isInteractive: true },
    ]

    const html = renderToString(
      createElement(
        MantineProvider,
        null,
        createElement(SkillTreeCanvas, props),
      ),
    )

    expect((html.match(/skill-tree-portal__hoverline/g) ?? []).length).toBe(2)
    expect((html.match(/skill-tree-portal__hit/g) ?? []).length).toBe(2)
    expect(html).toContain('skill-tree-portal__ring--source')
    expect(html).toContain('skill-tree-portal__ring--target')
    expect(html).toContain('data-portal-key="dep-a:source"')
    expect(html).toContain('data-portal-key="dep-a:target"')
    expect(html).toContain('data-portal-angle="0"')
    expect(html).toContain('data-portal-orbit-ratio=')
  })

  it('enlarges the portal hitbox when zoomed farther out', () => {
    const baseProps = createBaseProps()
    baseProps.layoutNodesById = new Map([
      ['node-a', { id: 'node-a', x: 100, y: 100 }],
      ['node-b', { id: 'node-b', x: 260, y: 100 }],
    ])
    baseProps.renderedNodes = [
      { id: 'node-a', x: 100, y: 100, label: 'Alpha' },
      { id: 'node-b', x: 260, y: 100, label: 'Beta' },
    ]
    baseProps.visibleDependencyPortals = [
      { key: 'dep-a:source', nodeId: 'node-a', sourceId: 'node-a', targetId: 'node-b', type: 'source', otherLabel: 'BET·Rollout', tooltip: 'Requires Beta', x: 180, y: 100, angle: 0, isMinimal: false, isInteractive: true },
    ]

    const zoomedOutHtml = renderToString(
      createElement(
        MantineProvider,
        null,
        createElement(SkillTreeCanvas, { ...baseProps, currentZoomScale: 0.5 }),
      ),
    )
    const zoomedInHtml = renderToString(
      createElement(
        MantineProvider,
        null,
        createElement(SkillTreeCanvas, { ...baseProps, currentZoomScale: 2 }),
      ),
    )

    expect(extractPortalMetric(zoomedOutHtml, 'skill-tree-portal__hit', 'rx')).toBeGreaterThan(extractPortalMetric(zoomedInHtml, 'skill-tree-portal__hit', 'rx'))
    expect(extractPortalStrokeWidth(zoomedOutHtml)).toBeGreaterThan(extractPortalStrokeWidth(zoomedInHtml))
  })

  it('keeps markdown list bullets visible inside canvas note cards', () => {
    const css = fs.readFileSync(new URL('../styles/skillTree.nodes.css', import.meta.url), 'utf8')

    expect(css).toContain('.skill-node-vc__body--markdown ul')
    expect(css).toContain('list-style-position: inside')
    expect(css).toContain('list-style-type: disc')
  })

  it('lets minimal nodes reveal short name first and full name only at very-close zoom', () => {
    const props = createBaseProps()
    props.layoutNodesById = new Map([
      ['node-a', { id: 'node-a', x: 100, y: 100, label: 'Alpha', shortName: 'ALP' }],
    ])
    props.renderedNodes = [
      { id: 'node-a', x: 100, y: 100, label: 'Alpha', shortName: 'ALP' },
    ]
    props.nodeVisibilityModeById = new Map([
      ['node-a', 'minimal'],
    ])

    const midHtml = renderToString(
      createElement(
        MantineProvider,
        null,
        createElement(SkillTreeCanvas, { ...props, labelMode: 'mid', currentZoomScale: 1.1 }),
      ),
    )
    const closeHtml = renderToString(
      createElement(
        MantineProvider,
        null,
        createElement(SkillTreeCanvas, { ...props, labelMode: 'close', currentZoomScale: 2 }),
      ),
    )
    const veryCloseHtml = renderToString(
      createElement(
        MantineProvider,
        null,
        createElement(SkillTreeCanvas, { ...props, labelMode: 'very-close', currentZoomScale: 4.2 }),
      ),
    )

    expect(midHtml).toContain('skill-node-button__shortname')
    expect(midHtml).toContain('>alp<')
    expect(midHtml).not.toContain('skill-node-button__label')
    expect(closeHtml).toContain('skill-node-button__shortname')
    expect(closeHtml).toContain('>alp<')
    expect(closeHtml).not.toContain('skill-node-button__label')
    expect(veryCloseHtml).toContain('skill-node-button__label')
    expect(veryCloseHtml).toContain('>Alpha<')
  })

  it('orients source and target spoke chevrons toward the portal semantics', () => {
    const props = createBaseProps()
    props.layoutNodesById = new Map([
      ['node-a', { id: 'node-a', x: 100, y: 100 }],
      ['node-b', { id: 'node-b', x: 260, y: 100 }],
    ])
    props.renderedNodes = [
      { id: 'node-a', x: 100, y: 100, label: 'Alpha' },
      { id: 'node-b', x: 260, y: 100, label: 'Beta' },
    ]
    props.visibleDependencyPortals = [
      { key: 'dep-a:source', nodeId: 'node-a', sourceId: 'node-a', targetId: 'node-b', type: 'source', otherLabel: 'BET·Rollout', tooltip: 'Requires Beta', x: 180, y: 100, angle: 0, isMinimal: false, isInteractive: true },
      { key: 'dep-a:target', nodeId: 'node-b', sourceId: 'node-a', targetId: 'node-b', type: 'target', otherLabel: 'ALP·Foundation', tooltip: 'Enables Alpha', x: 180, y: 100, angle: 180, isMinimal: false, isInteractive: true },
    ]

    const html = renderToString(
      createElement(
        MantineProvider,
        null,
        createElement(SkillTreeCanvas, props),
      ),
    )

    const sourceChevron = extractFirstChevronX(extractChevronPath(html, 'source'))
    const targetChevron = extractFirstChevronX(extractChevronPath(html, 'target'))

    expect(sourceChevron).toBeTruthy()
    expect(targetChevron).toBeTruthy()
    expect(sourceChevron.tipX).toBeLessThan(sourceChevron.arm1X)
    expect(sourceChevron.tipX).toBeLessThan(sourceChevron.arm2X)
    expect(targetChevron.tipX).toBeLessThan(targetChevron.arm1X)
    expect(targetChevron.tipX).toBeLessThan(targetChevron.arm2X)
  })

  it('hides the portal spoke and chevrons when the portal is minimized', () => {
    const props = createBaseProps()
    props.layoutNodesById = new Map([
      ['node-a', { id: 'node-a', x: 100, y: 100 }],
      ['node-b', { id: 'node-b', x: 260, y: 100 }],
    ])
    props.renderedNodes = [
      { id: 'node-a', x: 100, y: 100, label: 'Alpha' },
      { id: 'node-b', x: 260, y: 100, label: 'Beta' },
    ]
    props.visibleDependencyPortals = [
      { key: 'dep-a:source', nodeId: 'node-a', sourceId: 'node-a', targetId: 'node-b', type: 'source', otherLabel: 'BET·Rollout', tooltip: 'Requires Beta', x: 180, y: 100, angle: 0, isMinimal: true, isInteractive: true },
      { key: 'dep-a:target', nodeId: 'node-b', sourceId: 'node-a', targetId: 'node-b', type: 'target', otherLabel: 'ALP·Foundation', tooltip: 'Enables Alpha', x: 180, y: 100, angle: 180, isMinimal: true, isInteractive: true },
    ]

    const html = renderToString(
      createElement(
        MantineProvider,
        null,
        createElement(SkillTreeCanvas, props),
      ),
    )

    expect(html).toContain('skill-tree-portal__hoverline')
    expect(html).toContain('skill-tree-portal__spoke')
    expect(html).toContain('skill-tree-portal__chevrons')
    expect(html).toMatch(/skill-tree-portal__hoverline[^>]*display:none/)
    expect(html).toMatch(/skill-tree-portal__spoke[^>]*display:none/)
    expect(html).toMatch(/skill-tree-portal__chevrons[^>]*display:none/)
    expect(html).toContain('skill-tree-portal__ring--source')
    expect(html).toContain('skill-tree-portal__ring--target')
    expect(extractRingRotation(html, 'source')).toBeCloseTo(0, 5)
  })
})
