import { test, expect } from '@playwright/test'
import { startFresh } from './helpers.js'

test.describe('App smoke', () => {
  test('loads the builder without runtime errors', async ({ page }) => {
    const pageErrors = []
    page.on('pageerror', (error) => {
      pageErrors.push(error)
    })

    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeVisible()
    await expect(page.locator('svg.skill-tree-canvas')).toBeVisible()

    expect(pageErrors).toHaveLength(0)
  })

  test('opens the internal notes panel from the toolbar', async ({ page }) => {
    await startFresh(page)

    const notesButton = page.getByRole('button', { name: 'Internal notes', exact: true })
    await expect(notesButton).toBeVisible()

    await notesButton.click()

    await expect(page.getByRole('button', { name: 'Close internal notes panel', exact: true })).toBeVisible()
    await expect(page.locator('.skill-panel__title').getByText('Internal notes', { exact: true })).toBeVisible()
  })
})