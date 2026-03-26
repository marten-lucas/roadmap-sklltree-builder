import { test, expect } from '@playwright/test'
import { startFresh } from './helpers.js'

const readTooltipStyle = async (tooltip) => tooltip.evaluate((element) => {
  const computedStyle = window.getComputedStyle(element)
  return {
    backgroundColor: computedStyle.backgroundColor,
    borderColor: computedStyle.borderColor,
    boxShadow: computedStyle.boxShadow,
    backdropFilter: computedStyle.backdropFilter,
  }
})

const getTooltipTextBox = async (tooltip) => tooltip.evaluate((element) => {
  const range = document.createRange()
  range.selectNodeContents(element)
  const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0)

  if (rects.length === 0) {
    return null
  }

  const left = Math.min(...rects.map((rect) => rect.left))
  const top = Math.min(...rects.map((rect) => rect.top))
  const right = Math.max(...rects.map((rect) => rect.right))
  const bottom = Math.max(...rects.map((rect) => rect.bottom))

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  }
})

const assertTooltipFitsViewport = async (page, tooltip, triggerBox) => {
  const tooltipBox = await tooltip.boundingBox()
  expect(tooltipBox).toBeTruthy()

  const viewport = page.viewportSize()
  expect(viewport).toBeTruthy()

  expect(tooltipBox.x).toBeGreaterThanOrEqual(0)
  expect(tooltipBox.y).toBeGreaterThanOrEqual(-16)
  expect(tooltipBox.x + tooltipBox.width).toBeLessThanOrEqual(viewport.width)
  expect(tooltipBox.y + tooltipBox.height).toBeLessThanOrEqual(viewport.height)

  if (triggerBox) {
    expect(tooltipBox.y + tooltipBox.height).toBeLessThan(triggerBox.y + triggerBox.height)
  }

  const textBox = await getTooltipTextBox(tooltip)
  expect(textBox).toBeTruthy()
  expect(textBox.x).toBeGreaterThanOrEqual(tooltipBox.x + 3)
  expect(textBox.y).toBeGreaterThanOrEqual(tooltipBox.y + 2)
  expect(textBox.x + textBox.width).toBeLessThanOrEqual(tooltipBox.x + tooltipBox.width - 3)
  expect(textBox.y + textBox.height).toBeLessThanOrEqual(tooltipBox.y + tooltipBox.height + 4)
}

test.describe('Rendered toolbar', () => {
  test.use({ viewport: { width: 1600, height: 900 } })

  test.beforeEach(async ({ page }) => {
    await startFresh(page)
  })

  test('matches the toolbar icon layout snapshot', async ({ page }) => {
    const toolbar = page.locator('.skill-tree-toolbar').first()

    await expect(toolbar).toBeVisible()
    await page.waitForTimeout(300)

    const iconSvgs = toolbar.locator('button[aria-label] svg')
    await expect(iconSvgs).toHaveCount(13)

    const strokeWidths = await iconSvgs.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('stroke-width')),
    )
    expect(new Set(strokeWidths)).toEqual(new Set(['2.5']))

    await expect(toolbar).toHaveScreenshot('skill-tree-toolbar.png', {
      maxDiffPixelRatio: 0.05,
    })
  })

  test('shows toolbar tooltips above the trigger', async ({ page }) => {
    const tooltipCases = [
      { trigger: 'Menü einklappen', tooltip: 'Menü einklappen' },
      { trigger: 'HTML importieren', tooltip: 'HTML importieren (Ctrl+O)' },
      { trigger: 'Undo', tooltip: 'Undo (Ctrl+Z)' },
      { trigger: 'Redo', tooltip: 'Redo (Ctrl+Y / Ctrl+Shift+Z)' },
      { trigger: 'Reset', tooltip: 'Reset (Ctrl+Shift+Backspace)' },
      { trigger: 'Segmente verwalten', tooltip: 'Segmente verwalten' },
      { trigger: 'Scopes verwalten', tooltip: 'Scopes verwalten' },
      { trigger: 'Filter', tooltip: 'Filter:' },
    ]

    for (const { trigger, tooltip } of tooltipCases) {
      const triggerButton = page.getByRole('button', { name: trigger, exact: trigger !== 'Filter' }).first()
      await expect(triggerButton).toBeVisible()

      const triggerBox = await triggerButton.boundingBox()
      expect(triggerBox).toBeTruthy()

      await triggerButton.hover()

      const tooltipLocator = page.getByRole('tooltip').filter({ hasText: tooltip }).first()
      await expect(tooltipLocator).toBeVisible()

      await assertTooltipFitsViewport(page, tooltipLocator, triggerBox)
      await page.mouse.move(0, 0)
    }
  })

  test('matches node hover tooltip styling', async ({ page }) => {
    const toolbarButton = page.getByRole('button', { name: 'Menü einklappen', exact: true }).first()
    await toolbarButton.hover()

    const toolbarTooltip = page.getByRole('tooltip').filter({ hasText: 'Menü einklappen' }).first()
    await expect(toolbarTooltip).toBeVisible()
    const toolbarStyle = await readTooltipStyle(toolbarTooltip)

    const firstNodeButton = page.locator('.skill-node-button').first()
    await firstNodeButton.hover()

    const nodeTooltip = page.getByRole('tooltip').filter({ hasText: 'Landing page and design system are live' }).first()
    await expect(nodeTooltip).toBeVisible()
    const nodeStyle = await readTooltipStyle(nodeTooltip)

    expect(toolbarStyle).toEqual(nodeStyle)
  })
})