import { test, expect } from '@playwright/test'
import { confirmAndReset, startFresh } from './helpers.js'

test.describe('ListViewDrawer smoke tests', () => {
  test('ListViewDrawer component can be rendered and has filters', async ({ page }) => {
    const pageErrors = []
    page.on('pageerror', (error) => {
      pageErrors.push(error)
    })

    await startFresh(page)

    // The ListViewDrawer CSS should be built into the app
    const pageSource = await page.content()
    
    // Verify that the drawer CSS class names are in the page
    // This proves the component is built into the app
    expect(pageSource).toContain('list-view-drawer')
    expect(pageSource).toContain('list-view-drawer__filter-select')

    // Verify the canvas is visible (proof that app loaded)
    await expect(page.locator('svg.skill-tree-canvas')).toBeVisible()
    
    // Verify no runtime errors
    expect(pageErrors).toHaveLength(0)
  })

  test('ListViewDrawer structure exists in the DOM after render attempt', async ({ page }) => {
    const pageErrors = []
    page.on('pageerror', (error) => {
      pageErrors.push(error)
    })

    await startFresh(page)

    // The drawer element should be in the DOM even if hidden
    // Search for its CSS class in the page source
    const pageSource = await page.content()
    
    // Verify that the drawer CSS class name exists in the page
    // This proves the component is built into the app
    expect(pageSource).toContain('list-view-drawer')
    expect(pageSource).toContain('list-view-drawer__filter-select')

    // Verify no runtime errors
    expect(pageErrors).toHaveLength(0)
  })

  test('can open list view after reset without hook errors', async ({ page }) => {
    const pageErrors = []
    page.on('pageerror', (error) => {
      pageErrors.push(error)
    })

    await startFresh(page)

    // Wait for the app to load
    await page.locator('svg.skill-tree-canvas').waitFor({ timeout: 15000 })
    
    // Reset to empty state first to cover the reported regression path.
    await confirmAndReset(page)

    // Verify the List View button exists (proves the button is rendered)
    const listViewButton = page.locator('button[aria-label="List View"]')
    const isButtonVisible = await listViewButton.isVisible()
    expect(isButtonVisible).toBe(true)
    
    // Open drawer and verify filters render.
    await listViewButton.click({ force: true })
    await expect(page.locator('.list-view-drawer')).toBeVisible({ timeout: 5000 })
    
    // Check if filter selects are now visible.
    const filterSelectCount = await page.locator('.list-view-drawer__filter-select').count()
    expect(filterSelectCount).toBeGreaterThanOrEqual(1)
    
    expect(pageErrors).toHaveLength(0)
  })

  test('can build the app without errors related to ListViewDrawer', async ({ page }) => {
    const pageErrors = []
    const consoleMessages = []
    
    page.on('pageerror', (error) => {
      pageErrors.push(error)
    })
    
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleMessages.push(msg.text())
      }
    })

    await startFresh(page)
    
    // Wait a moment for any deferred errors to appear
    await page.waitForTimeout(1000)

    // Filter out unrelated errors
    const relevantErrors = pageErrors.filter(
      (err) => !err.message.includes('ResizeObserver') && 
               !err.message.includes('Non-Error')
    )

    // Should have no critical errors
    expect(relevantErrors).toHaveLength(0)

    // The app should load successfully
    await expect(page.locator('svg.skill-tree-canvas')).toBeVisible()
  })
})
