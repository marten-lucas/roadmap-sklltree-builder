import React, { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { MantineProvider } from '@mantine/core'
import { describe, expect, it } from 'vitest'
import { ReleaseNotesPanel } from '../panels/ReleaseNotesPanel'

describe('ReleaseNotesPanel', () => {
  const release = {
    id: 'rel-1',
    name: 'Release 1',
    notesMarkdown: '- Add specific nodes\n- Review API rollout',
    notesChecked: { '0:Add specific nodes': true },
  }

  it('renders internal notes in execution mode by default', () => {
    const html = renderToString(
      createElement(MantineProvider, null,
        createElement(ReleaseNotesPanel, {
          isOpen: true,
          release,
          onClose: () => {},
          onCommitReleaseNotes: () => {},
        }),
      ),
    )

    expect(html).toContain('Internal notes')
    expect(html).toContain('Edit notes')
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('line-through')
    expect(html).not.toContain('Markdown task list')
  })

  it('renders edit mode with a textarea when requested', () => {
    const html = renderToString(
      createElement(MantineProvider, null,
        createElement(ReleaseNotesPanel, {
          isOpen: true,
          release,
          initialMode: 'edit',
          onClose: () => {},
          onCommitReleaseNotes: () => {},
        }),
      ),
    )

    expect(html).toContain('Done editing')
    expect(html).toContain('Markdown task list')
    expect(html).toContain('Add specific nodes')
    expect(html).toContain('Open large markdown editor')
  })
})
