import { expect, test } from '@playwright/test'
import { exportHtml, startFresh } from './helpers.js'

test.describe('Export status matrix', () => {
  test('filters tree and release notes independently in HTML export', async ({ page }) => {
    await startFresh(page)

    const html = await exportHtml(page, {
      treeStatuses: {
        done: true,
        now: false,
        next: false,
        later: false,
        someday: false,
      },
      releaseNoteStatuses: {
        done: false,
        now: true,
        next: false,
        later: false,
        someday: false,
      },
    })

    expect(html).toContain('data-export-label="Frontend"')
    expect(html).not.toContain('data-export-label="Backend"')
    expect(html).not.toContain('data-export-label="API Design"')

    expect(html).toContain('<div class="html-export__note-markdown"><p>Service hardening is in active implementation.</p></div>')
    expect(html).toContain('<div class="html-export__note-markdown"><p>New API contracts are being validated with pilot customers.</p></div>')
    expect(html).not.toContain('<div class="html-export__note-markdown"><p>Landing page and design system are live for all customers.</p></div>')
  })
})