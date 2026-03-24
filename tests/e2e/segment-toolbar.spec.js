import { test, expect } from '@playwright/test'
import { startFresh } from './helpers.js'

test.describe('Segments – toolbar manager', () => {
  test.beforeEach(async ({ page }) => {
    await startFresh(page)
  })

  test('creates a new segment using only the toolbar manager', async ({ page }) => {
    const label = 'E2E Segment'

    // Ensure toolbar is expanded (toggle if collapsed), then open segment manager
    const menuToggle = page.locator('.skill-tree-toolbar [aria-label="Menü aufklappen"]').first()
    if ((await menuToggle.count()) > 0) {
      await menuToggle.click()
    }

    await page.locator('.skill-tree-toolbar [aria-label="Segmente verwalten"]').first().click()
    await page.waitForSelector('.skill-panel--segments', { timeout: 10_000 })

    // Fill new segment name and submit
    const textbox = page.getByRole('textbox', { name: 'Segmente verwalten', exact: true }).first()
    await textbox.fill(label)

    // Click the add button (accessible label used by the manager)
    await page.getByRole('button', { name: 'Segment hinzufügen' }).filter({ visible: true }).first().click()

    // Capture panel HTML and persisted document immediately for debugging
    const panelHtml = await page.locator('.skill-panel--segments').first().innerHTML()
    console.log('SEGMENT_PANEL_HTML:', panelHtml.slice(0, 2000))

    const persisted = await page.evaluate(() => localStorage.getItem('roadmap-skilltree.document.v1'))
    console.log('PERSISTED_DOCUMENT:', persisted ? persisted.slice(0, 2000) : persisted)

    // Then wait until the manager panel displays the new segment label
    await page.locator('.skill-panel--segments').getByText(label).first().waitFor({ timeout: 5_000 })

    // Also verify it's present in persisted document (best-effort)
    const labels = await page.evaluate(() => {
      try {
        const doc = JSON.parse(localStorage.getItem('roadmap-skilltree.document.v1') || '{}')
        return Array.isArray(doc.segments) ? doc.segments.map((s) => s.label) : []
      } catch (e) {
        return []
      }
    })

    expect(labels).toContain(label)
  })
})
