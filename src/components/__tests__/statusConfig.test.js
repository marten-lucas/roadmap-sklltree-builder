import React, { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { MantineProvider } from '@mantine/core'
import { describe, expect, it } from 'vitest'
import { DEFAULT_STATUS_DESCRIPTIONS, STATUS_LABELS, STATUS_STYLES, normalizeStatusKey } from '../config'
import { SkillNode } from '../nodes/SkillNode'

describe('someday status', () => {
  it('supports the someday status label, description, style and normalization', () => {
    expect(normalizeStatusKey('someday')).toBe('someday')
    expect(normalizeStatusKey('irgendwann')).toBe('someday')
    expect(STATUS_LABELS.someday).toBe('Someday')
    expect(DEFAULT_STATUS_DESCRIPTIONS.someday).toBeTruthy()
    expect(STATUS_STYLES.someday).toBeTruthy()
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
    expect(html).toMatch(/skill-node-level-ring[^>]*conic-gradient\([^\"]*transparent/)
  })
})
