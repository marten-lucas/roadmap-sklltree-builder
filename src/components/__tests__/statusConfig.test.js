import React, { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { MantineProvider } from '@mantine/core'
import { describe, expect, it } from 'vitest'
import { DEFAULT_STATUS_DESCRIPTIONS, STATUS_LABELS, STATUS_STYLES, normalizeStatusKey } from '../config'
import { getTemporalLinkPriority } from '../utils/linkPresentation'
import { SkillNode } from '../nodes/SkillNode'

describe('someday status', () => {
  it('supports the someday status label, description, style and normalization', () => {
    expect(normalizeStatusKey('someday')).toBe('someday')
    expect(normalizeStatusKey('irgendwann')).toBe('someday')
    expect(STATUS_LABELS.someday).toBe('Someday')
    expect(DEFAULT_STATUS_DESCRIPTIONS.someday).toBeTruthy()
    expect(STATUS_STYLES.someday).toBeTruthy()
  })

  it('keeps connection lines at a uniform width and uses dashes only for someday', () => {
    const visibleStatuses = ['done', 'now', 'next', 'later', 'someday']
    const widths = visibleStatuses.map((statusKey) => STATUS_STYLES[statusKey]?.linkStrokeWidth)

    expect(new Set(widths).size).toBe(1)
    expect(STATUS_STYLES.someday.linkStrokeDasharray).not.toBe('none')

    visibleStatuses
      .filter((statusKey) => statusKey !== 'someday')
      .forEach((statusKey) => {
        expect(STATUS_STYLES[statusKey].linkStrokeDasharray ?? 'none').toBe('none')
      })
  })

  it('orders nearer roadmap statuses above distant ones', () => {
    expect(getTemporalLinkPriority('now')).toBeGreaterThan(getTemporalLinkPriority('next'))
    expect(getTemporalLinkPriority('next')).toBeGreaterThan(getTemporalLinkPriority('later'))
    expect(getTemporalLinkPriority('later')).toBeGreaterThan(getTemporalLinkPriority('someday'))
    expect(getTemporalLinkPriority('done')).toBeLessThan(getTemporalLinkPriority('later'))
  })

  it('renders a dashed level ring for a single someday level', () => {
    const html = renderToString(
      createElement(
        MantineProvider,
        null,
        createElement(SkillNode, {
          node: {
            id: 'node-someday',
            x: 100,
            y: 100,
            label: 'Someday Node',
            shortName: 'sdy',
            levels: [
              { id: 'level-1', label: 'Level 1', statuses: { rel1: 'someday' }, releaseNote: '', scopeIds: [] },
            ],
          },
          nodeSize: 120,
          isSelected: false,
          onSelect: () => {},
          displayMode: 'full',
          labelMode: 'mid',
          zoomScale: 1,
          scopeOptions: [],
          releaseId: 'rel1',
        }),
      ),
    )

    expect(html).toContain('skill-node-button--status-someday')
    expect(html).toMatch(/skill-node-level-ring[^>]*conic-gradient\([^"]*transparent/)
  })
})
