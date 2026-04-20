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

test.describe('Viewport keyboard and fit interactions', () => {
  test.beforeEach(async ({ page }) => {
    await startFresh(page)
  })

  test('centers the icon artwork inside the center icon placeholder', async ({ page }) => {
    const foreign = page.locator('.skill-tree-center-icon__foreign')
    const image = page.locator('.skill-tree-center-icon__image')

    const foreignBox = await foreign.boundingBox()
    const imageBox = await image.boundingBox()

    expect(foreignBox).toBeTruthy()
    expect(imageBox).toBeTruthy()
    expect(Math.abs(foreignBox.x - imageBox.x)).toBeLessThan(2)
    expect(Math.abs(foreignBox.y - imageBox.y)).toBeLessThan(2)
    expect(Math.abs(foreignBox.width - imageBox.width)).toBeLessThan(2)
    expect(Math.abs(foreignBox.height - imageBox.height)).toBeLessThan(2)
  })

  test('double-clicking empty builder canvas fits to screen', async ({ page }) => {
    const transform = page.locator('.skill-tree-transform-content').first()
    await expect(transform).toBeVisible()

    // Move viewport away from fit position first.
    await page.keyboard.down('Shift')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.up('Shift')

    const moved = parseMatrix(await getTransform(page))
    expect(Number.isFinite(moved.x)).toBe(true)

    const fitButton = page.getByRole('button', { name: 'Fit to screen' }).first()
    await expect(fitButton).toBeVisible()

    await fitButton.click()

    const viewport = page.viewportSize()
    await expect.poll(async () => {
      const box = await page.locator('.skill-tree-center-icon__foreign').boundingBox()
      if (!box) {
        return false
      }

      const centeredX = Math.abs((box.x + box.width / 2) - viewport.width / 2)
      const centeredY = Math.abs((box.y + box.height / 2) - viewport.height / 2)
      return centeredX < 8 && centeredY < 8
    }, { timeout: 3000 }).toBeTruthy()
  })

  test('double right-click on canvas fits to screen', async ({ page }) => {
    const canvasArea = page.locator('.skill-tree-canvas-area').first()
    await expect(canvasArea).toBeVisible()

    // Move viewport away from fit position first.
    await page.keyboard.down('Shift')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.up('Shift')

    const moved = parseMatrix(await getTransform(page))
    expect(Number.isFinite(moved.x)).toBe(true)
    expect(moved.x !== 0 || moved.y !== 0).toBe(true)

    const canvasBox = await canvasArea.boundingBox()
    const centerX = canvasBox.x + canvasBox.width / 2
    const centerY = canvasBox.y + canvasBox.height / 2

    // First right-click
    await page.mouse.click(centerX, centerY, { button: 'right' })
    // Second right-click (within 400ms)
    await page.mouse.click(centerX, centerY, { button: 'right' })

    const viewport = page.viewportSize()
    await expect.poll(async () => {
      const box = await page.locator('.skill-tree-center-icon__foreign').boundingBox()
      if (!box) {
        return false
      }

      const centeredX = Math.abs((box.x + box.width / 2) - viewport.width / 2)
      const centeredY = Math.abs((box.y + box.height / 2) - viewport.height / 2)
      return centeredX < 8 && centeredY < 8
    }, { timeout: 3000 }).toBeTruthy()
  })
})
