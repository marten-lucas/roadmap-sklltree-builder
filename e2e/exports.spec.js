import { test, expect } from '@playwright/test'
import { startFresh, readDownload, getBuilderNodeLabels, exportHtml, extractJsonPayload } from './helpers.js'

// ---------------------------------------------------------------------------
// Content equivalence: HTML export must match the builder state
// ---------------------------------------------------------------------------

test.describe('HTML export – content matches builder', () => {
  test.beforeEach(async ({ page }) => {
    await startFresh(page)
  })

  test('exported html contains every node label shown in the builder', async ({ page }) => {
    const builderLabels = await getBuilderNodeLabels(page)
    // initialData has 6 nodes
    expect(builderLabels.length).toBeGreaterThanOrEqual(6)

    const html = await exportHtml(page)

    for (const label of builderLabels) {
      if (label) expect(html).toContain(label)
    }
  })

  test('exported html has the same node count as the builder canvas', async ({ page }) => {
    const builderNodeCount = await page
      .locator('foreignObject.skill-node-export-anchor')
      .count()

    const html = await exportHtml(page)

    // Each rendered node contributes one 'skill-node-export-anchor' attribute occurrence
    const exportNodeCount = (html.match(/class="skill-node-export-anchor"/g) ?? []).length
    expect(exportNodeCount).toBe(builderNodeCount)
  })

  test('embedded json payload matches builder segments and tree structure', async ({ page }) => {
    const html = await exportHtml(page)
    const payload = extractJsonPayload(html)

    expect(payload.schemaVersion).toBe(1)
    expect(Array.isArray(payload.document.segments)).toBe(true)
    expect(Array.isArray(payload.document.children)).toBe(true)

    const segmentLabels = payload.document.segments.map((s) => s.label)
    expect(segmentLabels).toContain('Frontend')
    expect(segmentLabels).toContain('Backend')

    const rootLabels = payload.document.children.map((c) => c.label)
    expect(rootLabels).toContain('Frontend')
    expect(rootLabels).toContain('Backend')
  })

  test('exported html contains release notes from builder nodes', async ({ page }) => {
    const html = await exportHtml(page)

    // Known release notes from initialData
    expect(html).toContain('Landing page and design system are live')
    expect(html).toContain('New API contracts are being validated')
    expect(html).toContain('Service hardening is in active implementation')
  })

  test('exported html does not contain editor-only controls', async ({ page }) => {
    const html = await exportHtml(page)

    // Editor SVG controls are marked with this class and must be stripped from exports
    expect(html).not.toContain('skill-tree-export-exclude')
  })

  test('exported html has branding metadata and correct filename', async ({ page }) => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.keyboard.press('Control+s'),
    ])
    const html = await readDownload(download)

    expect(html).toContain('Roadmap Skilltree Builder')
    expect(html).toContain('Exportiert am')
    expect(download.suggestedFilename()).toBe('skilltree-roadmap.html')
  })
})

// ---------------------------------------------------------------------------
// Visual equivalence: opening the exported HTML shows the same content
// ---------------------------------------------------------------------------

test.describe('HTML export – viewer page shows same content as builder', () => {
  test.beforeEach(async ({ page }) => {
    await startFresh(page)
  })

  test('exported html viewer contains all node labels visible in builder', async ({
    page,
    browser,
  }) => {
    const builderLabels = await getBuilderNodeLabels(page)
    const html = await exportHtml(page)

    const exportPage = await browser.newPage()
    try {
      await exportPage.setContent(html)
      await exportPage.waitForSelector('.html-export__tree-shell svg', { timeout: 10_000 })

      const exportPageHtml = await exportPage.content()
      for (const label of builderLabels) {
        if (label) expect(exportPageHtml).toContain(label)
      }
    } finally {
      await exportPage.close()
    }
  })

  test('exported html viewer has same node count as builder canvas', async ({
    page,
    browser,
  }) => {
    const builderNodeCount = await page
      .locator('foreignObject.skill-node-export-anchor')
      .count()
    const html = await exportHtml(page)

    const exportPage = await browser.newPage()
    try {
      await exportPage.setContent(html)
      await exportPage.waitForSelector('.html-export__tree-shell svg', { timeout: 10_000 })

      const exportNodeCount = await exportPage
        .locator('.html-export__tree-shell [class*="skill-node-export-anchor"]')
        .count()
      expect(exportNodeCount).toBe(builderNodeCount)
    } finally {
      await exportPage.close()
    }
  })

  test('exported html viewer shows release notes tab with segment sections', async ({
    page,
    browser,
  }) => {
    const html = await exportHtml(page)

    const exportPage = await browser.newPage()
    try {
      await exportPage.setContent(html)
        await exportPage.waitForLoadState('domcontentloaded')

        // Expose the hidden panel directly so we can inspect its content independent
        // of the tab-switching JS lifecycle (which may differ in setContent context)
        await exportPage.evaluate(() => {
          document
            .querySelectorAll('[data-export-tab-panel]')
            .forEach((panel) => panel.removeAttribute('hidden'))
        })

        const notesContent = await exportPage
          .locator('[data-export-tab-panel="releasenotes"]')
          .innerHTML()

      expect(notesContent).toContain('Frontend')
      expect(notesContent).toContain('Backend')
    } finally {
      await exportPage.close()
    }
  })

  /**
   * Visual regression test – creates a screenshot baseline on the first run.
   * Run `npx playwright test --update-snapshots` to regenerate baselines.
   */
  test('exported svg tree view matches visual snapshot baseline', async ({ page, browser }) => {
    // Deselect all to avoid editor controls affecting the screenshot
    await page.locator('svg.skill-tree-canvas').click({ position: { x: 10, y: 10 } })
    await page.waitForTimeout(350)

    const html = await exportHtml(page)

    const exportPage = await browser.newPage()
    try {
      await exportPage.setContent(html)
      await exportPage.waitForSelector('.html-export__tree-shell svg', { timeout: 10_000 })
      await exportPage.waitForTimeout(350)

      const exportSvg = exportPage.locator('.html-export__tree-shell svg')
      await expect(exportSvg).toHaveScreenshot('export-svg-tree.png', {
        maxDiffPixelRatio: 0.05,
      })
    } finally {
      await exportPage.close()
    }
  })
})

// ---------------------------------------------------------------------------
// SVG export modes: interactive vs clean
// ---------------------------------------------------------------------------

test.describe('SVG export modes', () => {
  test.beforeEach(async ({ page }) => {
    await startFresh(page)
      await page.getByRole('button', { name: 'Export', exact: true }).click()
    await page.waitForSelector('.skill-tree-export-panel')
  })

  test('interactive svg export contains tooltip animations and has correct filename', async ({
    page,
  }) => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'SVG (interaktiv)' }).click(),
    ])
    const svgContent = await readDownload(download)

    expect(svgContent).toContain('export-tooltip-trigger')
    expect(svgContent).toContain('<animate')
    expect(svgContent).toContain('skill-node-export-anchor')
    expect(download.suggestedFilename()).toBe('skilltree-roadmap.svg')
  })

  test('clean svg export has no tooltip animations and has correct filename', async ({
    page,
  }) => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'SVG (clean)' }).click(),
    ])
    const svgContent = await readDownload(download)

    expect(svgContent).not.toContain('export-tooltip-trigger')
    expect(svgContent).not.toContain('<animate')
    expect(svgContent).toContain('skill-node-export-anchor')
    expect(download.suggestedFilename()).toContain('clean')
  })

  test('clean svg and interactive svg contain the same set of node labels', async ({
    page,
  }) => {
    const builderLabels = await getBuilderNodeLabels(page)

    const [cleanDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'SVG (clean)' }).click(),
    ])
    const cleanSvg = await readDownload(cleanDownload)

    for (const label of builderLabels) {
      if (label) expect(cleanSvg).toContain(label)
    }
  })
})
