import { test, expect } from '@playwright/test'
import { startFresh } from './helpers.js'

test.describe('Toolbar status filter chips', () => {
  test('toggles per-status visibility modes via icon controls', async ({ page }) => {
    await startFresh(page)

    const filterButton = page.getByRole('button', { name: 'Filter', exact: true })
    await expect(filterButton).toBeVisible()

    await filterButton.click()
    const nowHiddenControl = page.getByRole('button', { name: 'Now: hidden', exact: true })
    await expect(nowHiddenControl).toBeVisible()

    await nowHiddenControl.click()
    await expect(page.getByRole('button', { name: 'Filter (active)', exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Filter (active)', exact: true }).click()
    await page.getByRole('menuitem', { name: 'All Statuses', exact: true }).click()

    await expect(page.getByRole('button', { name: 'Filter', exact: true })).toBeVisible()
  })
})
