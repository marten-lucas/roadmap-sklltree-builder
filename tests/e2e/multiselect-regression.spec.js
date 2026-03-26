import { test, expect } from '@playwright/test'
import {
  startFresh,
  selectNodeByShortName,
  setSelectValueByLabel,
} from './helpers.js'

// Regression: multiselect inspector applies changes to all selected nodes
test.describe('Multiselect regression', () => {
  test.beforeEach(async ({ page }) => {
    await startFresh(page)
  })

  test('apply status to multiple selected nodes', async ({ page }) => {
    // Use two existing root nodes from initial data to avoid fragile creation flow
    await selectNodeByShortName(page, 'FND')

    // ctrl-click the second root to multi-select (use Playwright modifiers)
    const secondSelector = `foreignObject.skill-node-export-anchor[data-short-name="BCK"] .skill-node-button`
    await page.click(secondSelector, { modifiers: ['Control'] })

    // Wait for multi-inspector header to indicate multiple selection
    await page.waitForFunction(() => {
      const el = document.querySelector('.skill-panel__title--large')
      return el && /Ausgewählt/.test(el.textContent || '')
    }, null, { timeout: 5000 })

    // Set Status (für alle) to Done — confirm the bulk-apply dialog
    page.once('dialog', (dialog) => dialog.accept())
    await setSelectValueByLabel(page, 'Status (für alle)', 'Done')

    // Wait for autosave to persist the updated document and assert both nodes were updated
    await page.waitForFunction(() => {
      try {
        const raw = localStorage.getItem('roadmap-skilltree.document.v1')
        if (!raw) return false
        const parsed = JSON.parse(raw)
        const doc = parsed.document ?? parsed

        const findByShort = (nodes, short) => {
          if (!Array.isArray(nodes)) return null
          for (const n of nodes) {
            if ((n.shortName ?? '').toString().trim() === short) return n
            const found = findByShort(n.children, short)
            if (found) return found
          }
          return null
        }

        const a = findByShort(doc.children, 'FND')
        const b = findByShort(doc.children, 'BCK')
        if (!a || !b) return false
        const statusA = (a.levels && a.levels[0] && a.levels[0].status) || a.status
        const statusB = (b.levels && b.levels[0] && b.levels[0].status) || b.status
        return statusA === 'done' && statusB === 'done'
      } catch {
        return false
      }
    }, null, { timeout: 5000 })

    const stored = await page.evaluate(() => localStorage.getItem('roadmap-skilltree.document.v1'))
    const parsed = JSON.parse(stored)
    const doc = parsed.document ?? parsed

    const findByShort = (nodes, short) => {
      if (!Array.isArray(nodes)) return null
      for (const n of nodes) {
        if ((n.shortName ?? '').toString().trim() === short) return n
        const found = findByShort(n.children, short)
        if (found) return found
      }
      return null
    }

    const a = findByShort(doc.children, 'FND')
    const b = findByShort(doc.children, 'BCK')
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()

    const statusA = (a.levels && a.levels[0] && a.levels[0].status) || a.status
    const statusB = (b.levels && b.levels[0] && b.levels[0].status) || b.status
    expect(statusA).toBe('done')
    expect(statusB).toBe('done')
  })
})
