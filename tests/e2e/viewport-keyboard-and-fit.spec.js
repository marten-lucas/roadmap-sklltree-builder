import { test, expect } from '@playwright/test'
import { startFresh } from './helpers.js'

const getTransform = async (page) => page.locator('.skill-tree-transform-content').evaluate((element) => {
  const style = window.getComputedStyle(element)
  return style.transform
})

const parseMatrix = (transform) => {
  const match = String(transform ?? '').match(/matrix\(([^)]+)\)/)
  if (!match) {
    throw new Error(`Unsupported transform format: ${transform}`)
  }

  const values = match[1].split(',').map((value) => Number.parseFloat(value.trim()))
  if (values.length !== 6 || values.some((value) => !Number.isFinite(value))) {
    throw new Error(`Invalid matrix values: ${transform}`)
  }

  return {
    scale: values[0],
    x: values[4],
    y: values[5],
  }
}

const computeExpectedTransform = (bounds, viewportWidth, viewportHeight, padding = 72) => {
  const width = Math.max(1, Number(bounds.width) || 1)
  const height = Math.max(1, Number(bounds.height) || 1)
  const scale = Math.min(
    viewportWidth / (width + padding * 2),
    viewportHeight / (height + padding * 2),
  )
  const centerX = (Number(bounds.x) || 0) + width / 2
  const centerY = (Number(bounds.y) || 0) + height / 2

  return {
    scale,
    x: viewportWidth / 2 - centerX * scale,
    y: viewportHeight / 2 - centerY * scale,
  }
}

test.describe('Viewport keyboard and fit interactions', () => {
  test.beforeEach(async ({ page }) => {
    await startFresh(page)
  })

  test('double-clicking empty builder canvas fits to screen', async ({ page }) => {
    const transform = page.locator('.skill-tree-transform-content').first()
    await expect(transform).toBeVisible()

    const contentBounds = await page.locator('.skill-tree-canvas__content').evaluate((element) => {
      const bounds = element.getBBox()
      return {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      }
    })

    const viewport = page.viewportSize()
    const expected = computeExpectedTransform(contentBounds, viewport.width, viewport.height)

    // Move viewport away from fit position first.
    await page.keyboard.down('Shift')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.up('Shift')

    const moved = parseMatrix(await getTransform(page))
    expect(Math.round(moved.x)).not.toBe(Math.round(expected.x))

    const fitButton = page.getByRole('button', { name: 'Fit to screen' }).first()
    await expect(fitButton).toBeVisible()

    await fitButton.click()

    const round = (value) => Math.round(value * 100) / 100

    await expect
      .poll(async () => {
        const after = parseMatrix(await getTransform(page))
        return {
          scale: round(after.scale),
          x: round(after.x),
          y: round(after.y),
        }
      }, { timeout: 3000 })
      .toEqual({
        scale: round(expected.scale),
        x: round(expected.x),
        y: round(expected.y),
      })
  })
})
