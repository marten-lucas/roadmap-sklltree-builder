import React, { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { MantineProvider } from '@mantine/core'
import { describe, expect, it } from 'vitest'
import { ReleaseNotesPanel, appendChecklistItem, deleteChecklistItem, reorderChecklistItems } from '../panels/ReleaseNotesPanel'
import { convertRichTextHtmlToMarkdown } from '../utils/markdown'

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

  it('renders execute mode with reorder and add affordances', () => {
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

    expect(html).toContain('Add item')
    expect(html).toContain('Drag to reorder')
    expect(html).toContain('Delete item')
  })

  it('reorders checklist items while preserving checked state', () => {
    const result = reorderChecklistItems({
      markdown: '- Add specific nodes\n- Review API rollout',
      checkedMap: { '0:Add specific nodes': true },
      sourceKey: '0:Add specific nodes',
      targetKey: '1:Review API rollout',
      insertPosition: 'after',
    })

    expect(result.notesMarkdown).toBe('- [ ] Review API rollout\n- [x] Add specific nodes')
    expect(result.notesChecked).toEqual({ '1:Add specific nodes': true })
  })

  it('appends a new checklist item at the end of the list', () => {
    const result = appendChecklistItem({
      markdown: '- Add specific nodes',
      checkedMap: { '0:Add specific nodes': true },
      text: 'Prepare handoff',
    })

    expect(result.notesMarkdown).toBe('- [x] Add specific nodes\n- [ ] Prepare handoff')
    expect(result.notesChecked).toEqual({ '0:Add specific nodes': true })
  })

  it('deletes a checklist item and preserves the remaining checked state', () => {
    const result = deleteChecklistItem({
      markdown: '- [x] Add specific nodes\n- [ ] Review API rollout',
      checkedMap: { '0:Add specific nodes': true },
      itemKey: '0:Add specific nodes',
    })

    expect(result.notesMarkdown).toBe('- [ ] Review API rollout')
    expect(result.notesChecked).toEqual({})
  })

  it('converts pasted rich HTML into Markdown', () => {
    const markdown = convertRichTextHtmlToMarkdown('<h2>Title</h2><p>Hello <strong>world</strong> and <em>team</em>.</p><ul><li>First</li><li><a href="https://example.com">Docs</a></li></ul>')

    expect(markdown).toBe('## Title\n\nHello **world** and *team*.\n\n- First\n- [Docs](https://example.com)')
  })

  it('converts Google-Docs-style span formatting into Markdown', () => {
    const markdown = convertRichTextHtmlToMarkdown('<p><span style="font-weight:700">Bold</span> and <span style="font-style:italic">italic</span></p>')

    expect(markdown).toBe('**Bold** and *italic*')
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
