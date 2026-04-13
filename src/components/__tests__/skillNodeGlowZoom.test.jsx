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

const renderNodeWithLabelMode = (zoomScale, labelMode) => renderToString(
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
})