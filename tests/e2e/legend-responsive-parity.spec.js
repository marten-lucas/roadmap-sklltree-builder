import { test, expect } from '@playwright/test'
import { exportHtml, startFresh } from './helpers.js'

const VIEWPORT_CASES = [
  { name: 'desktop-xl', width: 1920, height: 900 },
  { name: 'desktop-lg', width: 1440, height: 900 },
  { name: 'desktop-md', width: 1280, height: 900 },
  { name: 'desktop-sm', width: 1024, height: 900 },
  { name: 'tablet', width: 900, height: 900 },
]

const getLegendBoxMetrics = async (page, rootSelector) => page.evaluate((selector) => {
  const root = document.querySelector(selector)
  if (!root) {
    return null
  }

  const footer = root.closest('.skill-tree-legend-footer')
  const footerRect = footer?.getBoundingClientRect() ?? root.getBoundingClientRect()
  const footerStyle = footer ? window.getComputedStyle(footer) : null
  const footerPaddingLeft = footerStyle ? Number.parseFloat(footerStyle.paddingLeft || '0') : 0
  const footerPaddingRight = footerStyle ? Number.parseFloat(footerStyle.paddingRight || '0') : 0
  const rootRect = root.getBoundingClientRect()
  const footerContentWidth = Math.max(0, footerRect.width - footerPaddingLeft - footerPaddingRight)

  return {
    rootClientWidth: root.clientWidth,
    rootScrollWidth: root.scrollWidth,
    rootRectWidth: rootRect.width,
    footerRectWidth: footerRect.width,
    footerContentWidth,
  }
}, rootSelector)

const getLegendOverlapMetrics = async (page, rootSelector) => page.evaluate((selector) => {
  const root = document.querySelector(selector)
  if (!root) {
    return null
  }

  const legendItems = Array.from(root.querySelectorAll('.skill-tree-legend__symbol-item'))
    .map((element) => element.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0)

  let overlapCount = 0

  for (let i = 0; i < legendItems.length; i += 1) {
    for (let j = i + 1; j < legendItems.length; j += 1) {
      const left = legendItems[i]
      const right = legendItems[j]

      const overlapX = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left))
      const overlapY = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top))
      const overlapArea = overlapX * overlapY

      if (overlapArea > 4) {
        overlapCount += 1
      }
    }
  }

  const invisibleCopyCount = Array.from(root.querySelectorAll('.skill-tree-legend__symbol-copy'))
    .filter((element) => {
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return rect.width < 2 || rect.height < 2 || style.visibility === 'hidden' || style.display === 'none'
    })
    .length

  return {
    itemCount: legendItems.length,
    overlapCount,
    invisibleCopyCount,
  }
}, rootSelector)

const getLegendReadabilityMetrics = async (page, rootSelector) => page.evaluate((selector) => {
  const root = document.querySelector(selector)
  if (!root) {
    return null
  }

  const density = String(root.getAttribute('data-legend-density') ?? 'full')

  const readTextMetrics = (nodeList) => Array.from(nodeList).map((element) => {
    const style = window.getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    const text = String(element.textContent ?? '').trim()
    const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
    const isTruncated = isVisible && element.scrollWidth > element.clientWidth + 1

    return {
      text,
      isVisible,
      isTruncated,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }
  })

  const titleMetrics = readTextMetrics(root.querySelectorAll('.skill-tree-legend__symbol-title'))
  const copyMetrics = readTextMetrics(root.querySelectorAll('.skill-tree-legend__symbol-copy'))

  const visibleTitles = titleMetrics.filter((entry) => entry.isVisible)
  const visibleCopies = copyMetrics.filter((entry) => entry.isVisible)

  return {
    density,
    visibleTitleCount: visibleTitles.length,
    visibleCopyCount: visibleCopies.length,
    truncatedVisibleTitleCount: visibleTitles.filter((entry) => entry.isTruncated).length,
    truncatedVisibleCopyCount: visibleCopies.filter((entry) => entry.isTruncated).length,
    tinyVisibleTitleCount: visibleTitles.filter((entry) => entry.clientWidth < 28).length,
  }
}, rootSelector)

const getLegendSignature = async (page, rootSelector) => page.evaluate((selector) => {
  const root = document.querySelector(selector)
  if (!root) {
    return null
  }

  const items = Array.from(root.querySelectorAll('.skill-tree-legend__symbol-item')).map((item) => {
    const title = item.querySelector('.skill-tree-legend__symbol-title')?.textContent?.trim() ?? ''
    const copy = item.querySelector('.skill-tree-legend__symbol-copy')?.textContent?.trim() ?? ''
    const itemClass = item.className
    const pathSignature = Array.from(item.querySelectorAll('path'))
      .map((path) => ({
        d: path.getAttribute('d') ?? '',
        className: path.getAttribute('class') ?? '',
      }))

    return {
      title,
      copy,
      itemClass,
      pathSignature,
    }
  })

  return {
    itemCount: items.length,
    items,
  }
}, rootSelector)

test.describe('Legend responsive parity', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test.beforeEach(async ({ page }) => {
    await startFresh(page)
  })

  test('builder legend uses available space and remains readable across viewport sizes', async ({ page }) => {
    const legendRootSelector = '.skill-tree-legend-wrapper .skill-tree-legend'

    for (const viewport of VIEWPORT_CASES) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.waitForTimeout(120)

      await expect(page.locator(legendRootSelector)).toBeVisible()

      const boxMetrics = await getLegendBoxMetrics(page, legendRootSelector)
      expect(boxMetrics).toBeTruthy()

      // Legend should use almost the full width available inside the footer content area.
      expect(boxMetrics.rootRectWidth).toBeGreaterThanOrEqual(boxMetrics.footerContentWidth - 4)

      // Legend content must fit horizontally inside available width.
      expect(boxMetrics.rootScrollWidth).toBeLessThanOrEqual(boxMetrics.rootClientWidth + 2)

      const overlapMetrics = await getLegendOverlapMetrics(page, legendRootSelector)
      expect(overlapMetrics).toBeTruthy()
      expect(overlapMetrics.itemCount).toBeGreaterThan(0)

      // Legend labels must remain non-overlapping.
      expect(overlapMetrics.overlapCount).toBe(0)

      const readabilityMetrics = await getLegendReadabilityMetrics(page, legendRootSelector)
      expect(readabilityMetrics).toBeTruthy()

      // Readability expectations by density mode.
      if (readabilityMetrics.density === 'icons-only') {
        expect(readabilityMetrics.visibleTitleCount).toBe(0)
        expect(readabilityMetrics.visibleCopyCount).toBe(0)
      } else if (readabilityMetrics.density === 'compact' || readabilityMetrics.density === 'no-portals') {
        expect(readabilityMetrics.visibleTitleCount).toBeGreaterThanOrEqual(5)
        expect(readabilityMetrics.truncatedVisibleTitleCount).toBe(0)
        expect(readabilityMetrics.tinyVisibleTitleCount).toBe(0)
      } else {
        // full mode: both title and copy should be visible and not clipped.
        expect(readabilityMetrics.visibleTitleCount).toBeGreaterThanOrEqual(7)
        expect(readabilityMetrics.visibleCopyCount).toBeGreaterThanOrEqual(7)
        expect(readabilityMetrics.truncatedVisibleTitleCount).toBe(0)
        expect(readabilityMetrics.truncatedVisibleCopyCount).toBe(0)
        expect(readabilityMetrics.tinyVisibleTitleCount).toBe(0)
      }
    }
  })

  test('export legend matches builder legend symbols, layout and content', async ({ page, browser }) => {
    const builderLegendRootSelector = '.skill-tree-legend-wrapper .skill-tree-legend'
    await expect(page.locator(builderLegendRootSelector)).toBeVisible()

    const builderSignature = await getLegendSignature(page, builderLegendRootSelector)
    expect(builderSignature).toBeTruthy()
    expect(builderSignature.itemCount).toBeGreaterThan(0)

    const html = await exportHtml(page)
    const exportContext = await browser.newContext()
    const exportPage = await exportContext.newPage()

    try {
      await exportPage.setContent(html)
      await exportPage.waitForLoadState('domcontentloaded')

      const exportLegendRootSelector = '.skill-tree-legend'
      await expect(exportPage.locator(exportLegendRootSelector)).toBeVisible()

      const exportSignature = await getLegendSignature(exportPage, exportLegendRootSelector)
      expect(exportSignature).toBeTruthy()

      // Export legend must be structurally identical to builder legend.
      expect(exportSignature).toEqual(builderSignature)
    } finally {
      await exportPage.close()
      await exportContext.close()
    }
  })
})
