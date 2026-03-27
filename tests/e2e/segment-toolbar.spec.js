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

    // Then wait until the manager panel displays the new segment label
    await page.locator('.skill-panel--segments').getByText(label).first().waitFor({ timeout: 5_000 })

    // Autosave is debounced, so wait until localStorage reflects the new segment.
    await page.waitForFunction((expectedLabel) => {
      try {
        const persisted = JSON.parse(localStorage.getItem('roadmap-skilltree.document.v1') || '{}')
        const document = persisted?.document ?? persisted
        const labels = Array.isArray(document?.segments) ? document.segments.map((s) => String(s?.label ?? '')) : []
        return labels.includes(expectedLabel)
      } catch {
        return false
      }
    }, label, { timeout: 10_000 })

    const labels = await page.evaluate(() => {
      try {
        const persisted = JSON.parse(localStorage.getItem('roadmap-skilltree.document.v1') || '{}')
        const document = persisted?.document ?? persisted
        return Array.isArray(document?.segments) ? document.segments.map((s) => s.label) : []
      } catch {
        return []
      }
    })

    expect(labels).toContain(label)
  })
})
