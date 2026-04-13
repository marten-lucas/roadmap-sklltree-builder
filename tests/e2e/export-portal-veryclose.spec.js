import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { startFresh, exportHtml, importCsvViaToolbar } from './helpers.js'

const KYANA_CSV_PATH = resolve(process.cwd(), 'tests/e2e/datasets/myKyana.csv')

const stripXmlPrefix = (value) => String(value ?? '').replace(/^<\?xml[^>]*\?>\s*/i, '')

const openGeneratedExportHtml = async (page, browser) => {
  await startFresh(page)
  const csv = readFileSync(KYANA_CSV_PATH, 'utf-8')
  await importCsvViaToolbar(page, csv, {
    processSegments: false,
    processManualLevels: false,
  })

  const html = await exportHtml(page)
  const exportContext = await browser.newContext()
  const exportPage = await exportContext.newPage()
  const pageErrors = []
  exportPage.on('pageerror', (error) => {
    pageErrors.push(String(error?.message ?? error))
  })
  await exportPage.setContent(html)
  await exportPage.waitForSelector('#html-export-tree-canvas svg', { timeout: 15_000 })
  return { exportPage, exportContext, pageErrors }
}

const setVeryCloseZoom = async (page) => {
  const viewerReady = await page.evaluate(() => Boolean(window.__skilltreeExportViewerReady))
  expect(viewerReady).toBe(true)

  // Let deferred initial-fit timers settle before forcing zoom.
  await page.waitForTimeout(700)

  const zoomToggle = page.locator('#html-export-zoom-toggle')
  await expect(zoomToggle).toBeVisible()
  await zoomToggle.click()

  const slider = page.locator('#html-export-zoom-slider')
  await expect(slider).toBeVisible()

  await slider.evaluate((element) => {
    element.value = '400'
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await page.waitForTimeout(200)

  const zoomPercent = await page.locator('#html-export-zoom-value').evaluate((element) => {
    const parsed = Number.parseInt(String(element.textContent ?? '').replace(/[^\d]/g, ''), 10)
    return Number.isFinite(parsed) ? parsed : 0
  })
  expect(zoomPercent).toBeGreaterThanOrEqual(400)

  await expect(page.locator('.skill-node-foreign--veryclose').first()).toBeVisible({ timeout: 10_000 })
}

const expectVeryCloseNodeContent = async (page) => {
  const nodeWithReleaseNote = page
    .locator('foreignObject.skill-node-export-anchor[data-export-note]:not([data-export-note=""])')
    .first()

  await expect(nodeWithReleaseNote).toBeVisible({ timeout: 10_000 })

  const veryCloseCard = nodeWithReleaseNote.locator('.skill-node-foreign--veryclose .skill-node-button__content--veryclose')
  await expect(veryCloseCard).toBeVisible()
  await expect(veryCloseCard.locator('.skill-node-vc__headline')).toBeVisible()
  await expect(veryCloseCard.locator('.skill-node-vc__body')).toBeVisible()

  const tooltipLayerVisibleCount = await page
    .locator('[data-tooltip-node-id]')
    .evaluateAll((elements) => elements.filter((element) => getComputedStyle(element).display !== 'none').length)

  expect(tooltipLayerVisibleCount).toBe(0)
}

const expectPortalCounterpartHighlight = async (page) => {
  const triggered = await page.evaluate(() => {
    const portal = document.querySelector('[data-portal-key].skill-tree-portal--interactive')
    if (!portal) {
      return false
    }

    portal.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true, cancelable: true }))
    return true
  })
  expect(triggered).toBe(true)

  await expect(page.locator('.skill-node-button--portal-peer-hovered').first()).toBeVisible()
  await expect(page.locator('.skill-tree-portal--peer-hovered').first()).toBeVisible()
}

const downloadInteractiveSvg = async (page) => {
  await page.getByLabel('Export', { exact: true }).click()
  await expect(page.locator('#html-export-svg')).toBeVisible()

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#html-export-svg').click(),
  ])

  return readFileSync(await download.path(), 'utf-8')
}

test.describe('Export parity for very-close and portal hover', () => {
  test.use({ viewport: { width: 1600, height: 1000 } })

  test('html export and interactive svg keep very-close behavior and portal peer highlight hooks', async ({ page, browser }) => {
    const { exportPage, exportContext, pageErrors } = await openGeneratedExportHtml(page, browser)
    try {
      expect(pageErrors).toEqual([])
      await setVeryCloseZoom(exportPage)
      await expectVeryCloseNodeContent(exportPage)
      await expectPortalCounterpartHighlight(exportPage)

      const interactiveSvg = await downloadInteractiveSvg(exportPage)

      const svgContext = await browser.newContext()
      const svgPage = await svgContext.newPage()

      try {
        await svgPage.setContent(`<html><body style="margin:0;background:#000">${stripXmlPrefix(interactiveSvg)}</body></html>`)
        await svgPage.waitForSelector('svg', { timeout: 10_000 })

        await expect(svgPage.locator('foreignObject.skill-node-export-anchor .skill-node-foreign--veryclose').first()).toBeVisible()
        await expect(svgPage.locator('[data-portal-key][data-portal-node-id][data-portal-source-id][data-portal-target-id]').first()).toBeVisible()
      } finally {
        await svgPage.close()
        await svgContext.close()
      }
    } finally {
      await exportPage.close()
      await exportContext.close()
    }
  })
})
