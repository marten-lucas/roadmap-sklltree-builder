import { test, expect } from '@playwright/test'

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
})