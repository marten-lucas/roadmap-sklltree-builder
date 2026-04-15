import React, { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { MantineProvider } from '@mantine/core'
import { describe, expect, it } from 'vitest'
import { SystemPanel } from '../panels/SystemPanel'

describe('SystemPanel status descriptions', () => {
  it('renders editable status description fields in the system tab', () => {
    const html = renderToString(
      createElement(MantineProvider, null,
        createElement(SystemPanel, {
          isOpen: true,
          iconSource: '/icon.svg',
          onClose: () => {},
          onUpload: async () => {},
          onResetDefault: () => {},
          roadmapData: {
            systemName: 'Demo System',
            segments: [],
            scopes: [],
            children: [],
            releases: [{ id: 'rel-1', name: 'Release 1', motto: '', introduction: '', date: '', storyPointBudget: null }],
            storyPointMap: { xs: 1, s: 2, m: 3, l: 5, xl: 8 },
            showHiddenNodes: false,
          },
          commitDocument: () => {},
          selectedReleaseId: null,
          onReleaseChange: () => {},
          onDraftChange: () => {},
        }),
      ),
    )

    expect(html).toContain('Status descriptions')
    expect(html).toContain('Now description')
    expect(html).toContain('Next description')
  })
})
