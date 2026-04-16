import { test, expect } from '@playwright/test'
import { confirmAndReset, startFresh } from './helpers.js'

test.describe('ListViewDrawer with status and scope filters', () => {
  test.beforeEach(async ({ page }) => {
    await startFresh(page)
  })

  test.skip('debug: list all toolbar buttons', async ({ page }) => {
    // This test helps identify correct button selectors
    const buttons = page.locator('.skill-tree-toolbar button')
    const count = await buttons.count()
    console.log(`Found ${count} toolbar buttons`)

    for (let i = 0; i < count; i++) {
      const ariaLabel = await buttons.nth(i).getAttribute('aria-label')
      const title = await buttons.nth(i).getAttribute('title')
      const className = await buttons.nth(i).getAttribute('class')
      console.log(`Button ${i}: aria-label="${ariaLabel}", title="${title}", class="${className}"`)
    }
  })

  test('opens list view and renders filter controls', async ({ page }) => {
    const pageErrors = []
    page.on('pageerror', (error) => {
      pageErrors.push(error)
    })

    // Wait for toolbar to be ready
    await expect(page.locator('.skill-tree-toolbar')).toBeVisible()
    
    // List all buttons to find list view button
    const toolbarButtons = page.locator('.skill-tree-toolbar button')
    let listViewButton = null
    const buttonCount = await toolbarButtons.count()

    for (let i = 0; i < buttonCount; i++) {
      const ariaLabel = await toolbarButtons.nth(i).getAttribute('aria-label')
      if (ariaLabel && ariaLabel.toLowerCase().includes('list')) {
        listViewButton = toolbarButtons.nth(i)
        break
      }
    }

    expect(listViewButton).not.toBeNull()
    
    await listViewButton.click()

    // Wait for drawer to appear
    await expect(page.locator('.list-view-drawer')).toBeVisible({ timeout: 5000 })

    // Verify header and title
    await expect(page.locator('.list-view-drawer__header')).toBeVisible()
    await expect(page.locator('.list-view-drawer__title')).toContainText('Node List')

    // Default mode should open in list view with levels shown.
    await expect(page.locator('.list-view-drawer button[title="List view"]')).toHaveClass(/list-view-drawer__icon-toggle--active/)
    await expect(page.locator('.list-view-drawer__search-input')).toBeVisible()

    // Verify filter selects are present (Status and Scope)
    const filterSelects = page.locator('.list-view-drawer__filter-select')
    await expect(filterSelects).toHaveCount(2)

    // Verify content area exists
    await expect(page.locator('.list-view-drawer__content')).toBeVisible()
    await expect(page.locator('.list-view-drawer__list')).toBeVisible()

    expect(pageErrors).toHaveLength(0)
  })

  test('displays all status filter options', async ({ page }) => {
    const pageErrors = []
    page.on('pageerror', (error) => {
      pageErrors.push(error)
    })

    // Open list view
    await expect(page.locator('.skill-tree-toolbar')).toBeVisible()
    await page.waitForSelector('button[aria-label="List View"]', { timeout: 5000 })
    const listViewButton = page.locator('button[aria-label="List View"]')
    await listViewButton.click()
    await expect(page.locator('.list-view-drawer')).toBeVisible({ timeout: 5000 })

    // Get status filter options
    const statusFilter = page.locator('.list-view-drawer__filter-select').nth(0)
    const statusOptions = statusFilter.locator('option')

    // Should include All Statuses plus the currently supported status values.
    await expect(statusOptions).toHaveCount(7)
    await expect(statusFilter).toContainText('All Statuses')
    await expect(statusFilter).toContainText('Done')
    await expect(statusFilter).toContainText('Now')
    await expect(statusFilter).toContainText('Next')
    await expect(statusFilter).toContainText('Later')
    await expect(statusFilter).toContainText('Hidden')
    await expect(statusFilter).toContainText('Someday')

    expect(pageErrors).toHaveLength(0)
  })

  test('can change status filter', async ({ page }) => {
    const pageErrors = []
    page.on('pageerror', (error) => {
      pageErrors.push(error)
    })

    // Open list view
    await expect(page.locator('.skill-tree-toolbar')).toBeVisible()
    await page.waitForSelector('button[aria-label="List View"]', { timeout: 5000 })
    const listViewButton = page.locator('button[aria-label="List View"]')
    await listViewButton.click()
    await expect(page.locator('.list-view-drawer')).toBeVisible({ timeout: 5000 })

    // Change status filter to 'now'
    const statusFilter = page.locator('.list-view-drawer__filter-select').nth(0)
    await statusFilter.selectOption('now')

    // Verify selection changed
    await expect(statusFilter).toHaveValue('now')

    expect(pageErrors).toHaveLength(0)
  })

  test('displays scope filter', async ({ page }) => {
    const pageErrors = []
    page.on('pageerror', (error) => {
      pageErrors.push(error)
    })

    // Open list view
    await expect(page.locator('.skill-tree-toolbar')).toBeVisible()
    await page.waitForSelector('button[aria-label="List View"]', { timeout: 5000 })
    const listViewButton = page.locator('button[aria-label="List View"]')
    await listViewButton.click()
    await expect(page.locator('.list-view-drawer')).toBeVisible({ timeout: 5000 })

    // Get scope filter
    const scopeFilter = page.locator('.list-view-drawer__filter-select').nth(1)
    const scopeOptions = scopeFilter.locator('option')

    // Should have at least "All Scopes" option
    await expect(scopeOptions.filter({ hasText: 'All Scopes' })).toHaveCount(1)

    expect(pageErrors).toHaveLength(0)
  })

  test('filters visible list entries by search text', async ({ page }) => {
    await expect(page.locator('.skill-tree-toolbar')).toBeVisible()
    await page.locator('button[aria-label="List View"]').click()
    await expect(page.locator('.list-view-drawer')).toBeVisible({ timeout: 5000 })

    const searchInput = page.locator('.list-view-drawer__search-input')
    await expect(searchInput).toBeVisible()

    const listItems = page.locator('.list-view-drawer__item--level')
    const countBefore = await listItems.count()
    expect(countBefore).toBeGreaterThan(1)

    const firstNodePrefixText = await page.locator('.list-view-drawer__node-prefix').first().textContent()
    const searchTerm = String(firstNodePrefixText ?? '').replace(/·/g, '').trim()
    expect(searchTerm.length).toBeGreaterThan(0)

    await searchInput.fill(searchTerm)

    await expect.poll(async () => await listItems.count()).toBeGreaterThan(0)
    const countAfter = await listItems.count()
    expect(countAfter).toBeLessThan(countBefore)
  })

  test('closes and reopens list view with filters intact', async ({ page }) => {
    const pageErrors = []
    page.on('pageerror', (error) => {
      pageErrors.push(error)
    })

    // Wait for toolbar to be ready
    await expect(page.locator('.skill-tree-toolbar')).toBeVisible()
    await page.waitForSelector('button[aria-label="List View"]', { timeout: 5000 })
    const listViewButton = page.locator('button[aria-label="List View"]')
    const drawer = page.locator('.list-view-drawer')
    const filterSelects = page.locator('.list-view-drawer__filter-select')

    // Open
    await listViewButton.click()
    await expect(drawer).toBeVisible({ timeout: 5000 })
    await expect(filterSelects).toHaveCount(2)

    // Close
    await page.locator('.list-view-drawer__close').click()
    await expect(drawer).not.toBeVisible()

    // Reopen
    await listViewButton.click()
    await expect(drawer).toBeVisible()
    await expect(filterSelects).toHaveCount(2)

    expect(pageErrors).toHaveLength(0)
  })

  test('regression: reset then open list view does not trigger hook-order errors', async ({ page }) => {
    const pageErrors = []
    const consoleErrors = []

    page.on('pageerror', (error) => {
      pageErrors.push(error)
    })

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })

    await confirmAndReset(page)

    await expect(page.locator('.skill-tree-toolbar')).toBeVisible()
    await page.locator('button[aria-label="List View"]').click()
    await expect(page.locator('.list-view-drawer')).toBeVisible({ timeout: 5000 })

    const hookPageErrors = pageErrors.filter((error) => (
      error.message.includes('Rendered more hooks')
      || error.message.includes('change in the order of Hooks')
      || error.message.includes('different number of hooks')
    ))
    const hookConsoleErrors = consoleErrors.filter((message) => (
      message.includes('Rendered more hooks')
      || message.includes('change in the order of Hooks')
      || message.includes('different number of hooks')
    ))

    expect(hookPageErrors).toHaveLength(0)
    expect(hookConsoleErrors).toHaveLength(0)
  })

  test('shows compact effort/value columns in level mode and allows quick updates', async ({ page }) => {
    const pageErrors = []
    page.on('pageerror', (error) => {
      pageErrors.push(error)
    })

    await expect(page.locator('.skill-tree-toolbar')).toBeVisible()
    await page.locator('button[aria-label="List View"]').click()
    await expect(page.locator('.list-view-drawer')).toBeVisible({ timeout: 5000 })

    await page.locator('.list-view-drawer button[title="Columns"]').click()
    await page.locator('.list-view-drawer__columns-menu').getByLabel('Effort / Value').check({ force: true })
    await expect(page.locator('.list-view-drawer')).toHaveClass(/list-view-drawer--wide/)
    await expect(page.locator('.list-view-drawer__metric-slider').first()).toBeVisible()

    const firstEffortSlider = page.locator('.list-view-drawer__metric-slider--effort').first().locator('.list-view-drawer__slider-input').first()
    await firstEffortSlider.fill('1')
    await expect(firstEffortSlider).toHaveValue('1')

    const firstValueSlider = page.locator('.list-view-drawer__metric-slider--value').first().locator('.list-view-drawer__slider-input').first()
    await firstValueSlider.fill('4')
    await expect(firstValueSlider).toHaveValue('4')

    expect(pageErrors).toHaveLength(0)
  })
})
