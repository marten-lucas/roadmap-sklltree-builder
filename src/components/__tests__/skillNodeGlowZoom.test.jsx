import React from 'react'
import { renderToString } from 'react-dom/server'
import { MantineProvider } from '@mantine/core'
import { describe, expect, it, vi } from 'vitest'
import { SkillNode } from '../nodes/SkillNode'

const baseNode = {
  id: 'node-1',
  x: 100,
  y: 100,
  label: 'Foundation',
  shortName: 'FND',
  status: 'next',
  levels: [
    {
      id: 'level-1',
      label: 'Level 1',
      status: 'next',
      releaseNote: 'hello',
      scopeIds: [],
      effort: { size: 'm', customPoints: null },
      benefit: { size: 'l' },
    },
  ],
}

const renderNode = (zoomScale) => renderToString(
  React.createElement(MantineProvider, null,
    React.createElement(
      'svg',
      null,
      React.createElement(SkillNode, {
        node: baseNode,
        nodeSize: 120,
        isSelected: false,
        isPortalPeerHovered: false,
        onSelect: vi.fn(),
        onSelectLevel: vi.fn(),
        onZoomToNode: vi.fn(),
        displayMode: 'full',
        labelMode: 'very-close',
        zoomScale,
        scopeOptions: [],
        storyPointMap: {},
        releaseId: null,
      }),
    ),
  ),
)

const renderNodeWithLabelMode = (zoomScale, labelMode, isPortalPeerHovered = false, displayMode = 'full', nodeSize = 120) => renderToString(
  React.createElement(MantineProvider, null,
    React.createElement(
      'svg',
      null,
      React.createElement(SkillNode, {
        node: baseNode,
        nodeSize,
        isSelected: false,
        isPortalPeerHovered,
        onSelect: vi.fn(),
        onSelectLevel: vi.fn(),
        onZoomToNode: vi.fn(),
        displayMode,
        labelMode,
        zoomScale,
        scopeOptions: [],
        storyPointMap: {},
        releaseId: null,
      }),
    ),
  ),
)

describe('SkillNode glow intensity', () => {
  it('adds the portal peer hover pulse class when the opposite side is hovered', () => {
    const html = renderNodeWithLabelMode(2, 'close', true)

    expect(html).toContain('skill-node-button--portal-peer-hovered')
    expect(html).toContain('--portal-peer-pulse-duration')
  })

  it('makes the peer pulse stronger when zoomed farther out', () => {
    const farZoomHtml = renderNodeWithLabelMode(0.5, 'close', true)
    const nearZoomHtml = renderNodeWithLabelMode(2, 'close', true)

    const farPulseNear = Number(farZoomHtml.match(/--portal-peer-pulse-near:([\d.]+)px/)?.[1] ?? 0)
    const nearPulseNear = Number(nearZoomHtml.match(/--portal-peer-pulse-near:([\d.]+)px/)?.[1] ?? 0)
    const farPulseScale = Number(farZoomHtml.match(/--portal-peer-pulse-scale:([\d.]+)/)?.[1] ?? 0)
    const nearPulseScale = Number(nearZoomHtml.match(/--portal-peer-pulse-scale:([\d.]+)/)?.[1] ?? 0)

    expect(farPulseNear).toBeGreaterThan(nearPulseNear)
    expect(farPulseScale).toBeGreaterThan(nearPulseScale)
  })

  it('increases glow opacity and blur at higher zoom levels', () => {
    const lowZoomHtml = renderNode(4)
    const highZoomHtml = renderNode(5)

    expect(lowZoomHtml).toContain('opacity:0.90')
    expect(lowZoomHtml).toContain('blur(14.50px)')
    expect(highZoomHtml).toContain('opacity:0.96')
    expect(highZoomHtml).toContain('blur(16.00px)')
  })

  it('renders a larger glow area when zoomed farther out', () => {
    const farZoomHtml = renderNodeWithLabelMode(1, 'mid')
    const closerZoomHtml = renderNodeWithLabelMode(3, 'close')

    expect(farZoomHtml).toContain('padding:28px')
    expect(farZoomHtml).toContain('inset:13px')
    expect(closerZoomHtml).toContain('padding:21px')
    expect(closerZoomHtml).toContain('inset:9.333333333333334px')
  })

  it('reveals minimal node short name first and full name only at very-close zoom', () => {
    const midZoomHtml = renderNodeWithLabelMode(1.1, 'mid', false, 'minimal', 48)
    const closeZoomHtml = renderNodeWithLabelMode(2, 'close', false, 'minimal', 48)
    const veryCloseHtml = renderNodeWithLabelMode(4.2, 'very-close', false, 'minimal', 48)

    expect(midZoomHtml).toContain('skill-node-button__shortname')
    expect(midZoomHtml).toContain('>fnd<')
    expect(midZoomHtml).toContain('font-size:0.72rem')
    expect(midZoomHtml).not.toContain('skill-node-button__label')
    expect(closeZoomHtml).toContain('skill-node-button__shortname')
    expect(closeZoomHtml).toContain('>fnd<')
    expect(closeZoomHtml).toContain('font-size:0.72rem')
    expect(closeZoomHtml).not.toContain('skill-node-button__label')
    expect(veryCloseHtml).toContain('skill-node-button__label')
    expect(veryCloseHtml).toContain('>Foundation<')
    expect(veryCloseHtml).toContain('font-size:3px')
  })
})