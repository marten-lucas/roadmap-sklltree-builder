/**
 * Regression tests for very-close zoom mode.
 *
 * Covers:
 *  1. Export: multi-level node renders named level tabs in very-close mode.
 *  2. Builder: font-size of the very-close body shrinks as zoom increases
 *     (26px / zoomScale), so more text becomes visible the further you zoom in.
 *  3. Export: same font-shrink behaviour after the dynamic font-size was added
 *     to the export viewer's applyLabelMode runtime.
 */
import { test, expect } from '@playwright/test'
import { confirmAndReset, exportHtml, startFresh } from './helpers.js'

// ---------------------------------------------------------------------------
// Shared fixture
// ---------------------------------------------------------------------------

const SINGLE_NODE_DOCUMENT = {
  schemaVersion: 3,
  document: {
    systemName: 'VeryClose Regression',
    segments: [{ id: 'seg-core', label: 'Core' }],
    scopes: [
      { id: 'scope-a', label: 'Alpha', color: '#3b82f6' },
      { id: 'scope-b', label: 'Beta', color: '#10b981' },
    ],
    releases: [
      {
        id: 'rel-1',
        name: 'RC1',
        motto: '',
        introduction: '',
        voiceOfCustomer: '',
        fictionalCustomerName: '',
        date: '2026-09-01',
        storyPointBudget: null,
        statusBudgets: { now: null, next: null, later: null, someday: null, done: null, hidden: null },
        featureStatuses: { now: true, next: true, later: true, someday: true, done: true, hidden: false },
        notesMarkdown: '',
        notesChecked: {},
      },
    ],
    children: [
      {
        id: 'node-vc',
        label: 'VeryClose Node',
        shortName: 'VCN',
        segmentId: 'seg-core',
        children: [],
        levels: [
          {
            id: 'lvl-1',
            label: 'Foundation',
            status: 'now',
            releaseNote: 'Foundation implementation is active and shipping.',
            scopeIds: ['scope-a'],
            effort: { size: 'm', customPoints: null },
            benefit: { size: 'm' },
          },
          {
            id: 'lvl-2',
            label: 'Rollout',
            status: 'next',
            releaseNote: 'Rollout is prepared for the next increment.',
            scopeIds: ['scope-b'],
            effort: { size: 'l', customPoints: null },
            benefit: { size: 'l' },
          },
          {
            id: 'lvl-3',
            label: 'Scale',
            status: 'later',
            releaseNote: 'Scaling enhancements follow after rollout is stable.',
            scopeIds: [],
            effort: { size: 'xl', customPoints: null },
            benefit: { size: 'xl' },
          },
        ],
      },
    ],
    showHiddenNodes: false,
  },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Load the fixture document into the builder and reload. */
const loadFixture = async (page) => {
  await page.evaluate((payload) => {
    localStorage.setItem('roadmap-skilltree.document.v1', JSON.stringify(payload))
  }, SINGLE_NODE_DOCUMENT)
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector(
    'foreignObject.skill-node-export-anchor[data-export-label="VeryClose Node"]',
    { state: 'attached', timeout: 20_000 },
  )
}

/** Open the export zoom menu if it's collapsed. */
const ensureExportZoomOpen = async (exportPage) => {
  const slider = exportPage.locator('#html-export-zoom-slider')
  if (!(await slider.isVisible())) {
    await exportPage.locator('#html-export-zoom-toggle').click()
  }
  await expect(slider).toBeVisible()
  return slider
}

/** Set the export slider to an exact percent value. */
const setExportZoom = async (exportPage, targetPercent) => {
  const slider = await ensureExportZoomOpen(exportPage)
  await slider.evaluate((el, value) => {
    el.value = String(value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }, targetPercent)
  // Brief settle
  await exportPage.waitForTimeout(120)
}

/** Zoom the export into very-close mode by clicking zoom-in until tabs appear. */
const zoomExportToVeryClose = async (exportPage) => {
  const anchor = exportPage.locator(
    'foreignObject.skill-node-export-anchor[data-export-label="VeryClose Node"]',
  ).first()

  for (let i = 0; i < 28; i++) {
    if (await anchor.locator('.skill-node-vc__tabs').count() > 0) return
    await ensureExportZoomOpen(exportPage)
    await exportPage.getByRole('button', { name: 'Zoom in' }).click()
    await exportPage.waitForTimeout(80)
  }

  throw new Error(
    'Export did not reach very-close mode. ' +
    'Diagnostics: ' + JSON.stringify(await anchor.evaluate((el) => ({
      contentClass: el.querySelector('.skill-node-button__content')?.className ?? '',
      wrapperClass: el.querySelector('.skill-node-foreign')?.className ?? '',
      tabCount: el.querySelectorAll('.skill-node-vc__tab').length,
    }))),
  )
}

/** Read the inline fontSize (in SVG px) of the first .skill-node-vc__body inside an anchor locator. */
const readBodyFontSize = async (anchorLocator) => {
  const raw = await anchorLocator.locator('.skill-node-vc__body').first().evaluate(
    (el) => el.style.fontSize,
  )
  // raw is e.g. "6.5px"
  const parsed = parseFloat(String(raw ?? ''))
  return Number.isFinite(parsed) ? parsed : null
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('very-close mode regression', () => {
  /**
   * Regression: multi-level nodes must show named level tabs in the HTML export
   * when the viewer is zoomed to very-close mode.
   */
  test('export: named level tabs appear for a multi-level node', async ({ page, browser }) => {
    await startFresh(page)
    await confirmAndReset(page)
    await loadFixture(page)

    const html = await exportHtml(page)
    const ctx = await browser.newContext()
    const exportPage = await ctx.newPage()

    try {
      await exportPage.setContent(html)
      await exportPage.waitForSelector('#html-export-tree-canvas svg', { timeout: 15_000 })
      await expect
        .poll(() => exportPage.evaluate(() => Boolean(window.__skilltreeExportViewerReady)), {
          timeout: 10_000,
        })
        .toBe(true)

      await zoomExportToVeryClose(exportPage)

      const anchor = exportPage.locator(
        'foreignObject.skill-node-export-anchor[data-export-label="VeryClose Node"]',
      ).first()

      await expect(anchor.locator('.skill-node-foreign--veryclose')).toBeVisible()
      await expect(anchor.locator('.skill-node-vc__tabs')).toBeVisible()

      // All three named tabs must be present (not the legacy "L1/L2/L3" fallback).
      await expect(anchor.locator('.skill-node-vc__tab').filter({ hasText: 'Foundation' })).toBeVisible()
      await expect(anchor.locator('.skill-node-vc__tab').filter({ hasText: 'Rollout' })).toBeVisible()
      await expect(anchor.locator('.skill-node-vc__tab').filter({ hasText: 'Scale' })).toBeVisible()
    } finally {
      await exportPage.close()
      await ctx.close()
    }
  })

  /**
   * Font-shrink: the very-close body font-size is set to `26 / zoomScale` px
   * (in SVG coordinate space), so zooming in further makes the SVG-pixel font
   * smaller while the on-screen container grows – revealing more text.
   *
   * Builder variant: React applies the inline style on every render.
   */
  test('builder: very-close body font-size shrinks as zoom increases', async ({ page }) => {
    await startFresh(page)
    await confirmAndReset(page)
    await loadFixture(page)

    const anchor = page.locator(
      'foreignObject.skill-node-export-anchor[data-export-label="VeryClose Node"]',
    ).first()

    // Ensure zoom menu is accessible.
    const showZoomMenu = page.getByRole('button', { name: 'Show zoom menu' })
    if (await showZoomMenu.count() > 0) await showZoomMenu.click()

    const zoomInBtn = page.getByRole('button', { name: 'Zoom in' })
    const zoomOutBtn = page.getByRole('button', { name: 'Zoom out' })

    // Zoom out to a low scale first, then step into very-close.
    for (let i = 0; i < 10; i++) {
      await zoomOutBtn.click()
      await page.waitForTimeout(40)
    }

    // Enter very-close mode (scale >= 4.0).
    for (let i = 0; i < 20; i++) {
      const mode = await anchor.getAttribute('data-label-mode')
      if (mode === 'very-close') break
      await zoomInBtn.click()
      await page.waitForTimeout(60)
    }

    await expect(anchor).toHaveAttribute('data-label-mode', 'very-close')
    await expect(anchor.locator('.skill-node-vc__body')).toBeVisible()

    // Read font-size at the lower very-close zoom level.
    const fontAtLow = await readBodyFontSize(anchor)
    expect(fontAtLow).not.toBeNull()

    // Zoom in three more steps (e.g. 4→5→6→7 zoom-step scale).
    for (let i = 0; i < 3; i++) {
      await zoomInBtn.click()
      await page.waitForTimeout(60)
    }

    // Must still be in very-close mode.
    await expect(anchor).toHaveAttribute('data-label-mode', 'very-close')
    await expect(anchor.locator('.skill-node-vc__body')).toBeVisible()

    const fontAtHigh = await readBodyFontSize(anchor)
    expect(fontAtHigh).not.toBeNull()

    // Font in SVG coordinates must be smaller at higher zoom
    // (container grows → more text visible on screen).
    expect(fontAtHigh).toBeLessThan(fontAtLow)
  })

  /**
   * Font-shrink: same behaviour verified in the HTML export viewer.
   * The export's applyLabelMode sets font-size inline after each zoom change.
   */
  test('export: very-close body font-size shrinks as zoom increases', async ({ page, browser }) => {
    await startFresh(page)
    await confirmAndReset(page)
    await loadFixture(page)

    const html = await exportHtml(page)
    const ctx = await browser.newContext()
    const exportPage = await ctx.newPage()

    try {
      await exportPage.setContent(html)
      await exportPage.waitForSelector('#html-export-tree-canvas svg', { timeout: 15_000 })
      await expect
        .poll(() => exportPage.evaluate(() => Boolean(window.__skilltreeExportViewerReady)), {
          timeout: 10_000,
        })
        .toBe(true)

      const anchor = exportPage.locator(
        'foreignObject.skill-node-export-anchor[data-export-label="VeryClose Node"]',
      ).first()

      // Step into very-close mode using the reliable zoom-in helper.
      await zoomExportToVeryClose(exportPage)

      await expect(anchor.locator('.skill-node-vc__tabs')).toBeVisible({ timeout: 5_000 })
      await expect(anchor.locator('.skill-node-vc__body')).toBeVisible()

      // Read font-size at the entry zoom level.
      const fontAtLow = await readBodyFontSize(anchor)
      expect(fontAtLow).not.toBeNull()

      // Zoom to 1000% (maximum, still very-close).
      await setExportZoom(exportPage, 1000)
      // Wait for applyLabelMode to re-run.
      await exportPage.waitForTimeout(200)

      await expect(anchor.locator('.skill-node-vc__tabs')).toBeVisible({ timeout: 5_000 })
      await expect(anchor.locator('.skill-node-vc__body')).toBeVisible()

      const fontAtHigh = await readBodyFontSize(anchor)
      expect(fontAtHigh).not.toBeNull()

      // At higher zoom the SVG-coordinate font-size must be smaller
      // (26 / zoomScale decreases as zoomScale increases).
      expect(fontAtHigh).toBeLessThan(fontAtLow)
    } finally {
      await exportPage.close()
      await ctx.close()
    }
  })
})
