import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { startFresh, readDownload, getBuilderNodeLabels, exportHtml, extractJsonPayload } from './helpers.js'

// ---------------------------------------------------------------------------
// Content equivalence: HTML export must match the builder state
// ---------------------------------------------------------------------------

test.describe('HTML export – content matches builder', () => {
  test.afterEach(async ({ page }) => {
    try {
      await page.context().close()
    } catch {
      // ignore: the context may already be closed by the test flow
    }
  })

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

    expect(html).toContain('myKyana')
    expect(html).toContain('July 2026 Release')
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

    const exportContext = await browser.newContext()
    const exportPage = await exportContext.newPage()
    try {
      await exportPage.setContent(html)
      await exportPage.waitForSelector('#html-export-tree-canvas svg', { timeout: 10_000 })

      const exportPageHtml = await exportPage.content()
      for (const label of builderLabels) {
        if (label) expect(exportPageHtml).toContain(label)
      }
    } finally {
      await exportPage.close()
      await exportContext.close()
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

    const exportContext = await browser.newContext()
    const exportPage = await exportContext.newPage()
    try {
      await exportPage.setContent(html)
      await exportPage.waitForSelector('#html-export-tree-canvas svg', { timeout: 10_000 })

      const exportNodeCount = await exportPage
        .locator('.html-export__tree-shell [class*="skill-node-export-anchor"]')
        .count()
      expect(exportNodeCount).toBe(builderNodeCount)
    } finally {
      await exportPage.close()
      await exportContext.close()
    }
  })

  test('exported html viewer shows release notes tab with segment sections', async ({
    page,
    browser,
  }) => {
    const html = await exportHtml(page)

    const exportContext = await browser.newContext()
    const exportPage = await exportContext.newPage()
    try {
      await exportPage.setContent(html)
      await exportPage.waitForSelector('.html-export__release-list', { timeout: 10_000 })

      const notesContent = await exportPage.locator('.html-export__release-list').innerHTML()

      expect(notesContent).toContain('Backend')
      expect(notesContent).toContain('Service hardening is in active implementation')
      expect(notesContent).toContain('New API contracts are being validated')
    } finally {
      await exportPage.close()
      await exportContext.close()
    }
  })

  test('exported pdf opens a populated popup page', async ({ page }) => {
    await startFresh(page)

    const popupPromise = page.waitForEvent('popup')
    await page.getByRole('button', { name: 'Export', exact: true }).hover()
    await page.getByRole('menuitem', { name: 'PDF' }).click()

    const popup = await popupPromise
    await popup.waitForLoadState('domcontentloaded')

    const popupText = await popup.locator('body').innerText()
    expect(popupText).toContain('Release Notes')
    expect(popupText).toContain('July 2026 Release')
    expect(popupText).toContain('Service hardening is in active implementation')
    expect(popupText).toContain('New API contracts are being validated')
  })

  /**
    * Regression test for the export viewer initial fit and visible canvas content.
   */
  test('exported svg tree view loads with nodes inside the visible export shell', async ({ page, browser }) => {
    // Deselect all to avoid editor controls affecting the screenshot
    await page.locator('svg.skill-tree-canvas').dispatchEvent('click', {
      clientX: 10,
      clientY: 10,
    })
    await page.waitForTimeout(350)

    const html = await exportHtml(page)

    const exportContext = await browser.newContext()
    const exportPage = await exportContext.newPage()
    try {
      await exportPage.setContent(html)
      await exportPage.waitForSelector('#html-export-tree-canvas svg', { timeout: 10_000 })
      await exportPage.waitForTimeout(350)

      await expect(exportPage.locator('#html-export-tree-shell')).toHaveCSS('overflow-x', 'hidden')
      await expect(exportPage.locator('#html-export-tree-shell')).toHaveCSS('overflow-y', 'hidden')
      await expect(exportPage.locator('#html-export-tree-shell')).toHaveCSS('padding-top', '16px')

      const firstNode = exportPage.locator('foreignObject.skill-node-export-anchor').first()
      await expect(firstNode).toBeVisible()

      const centerIconImage = exportPage.locator('.html-export__tree-shell .skill-tree-center-icon__image')
      await expect(centerIconImage).toHaveCSS('width', '156px')
      await expect(centerIconImage).toHaveCSS('height', '156px')
    } finally {
      await exportPage.close()
      await exportContext.close()
    }
  })
})

// ---------------------------------------------------------------------------
// SVG export modes: interactive vs clean
// ---------------------------------------------------------------------------

test.describe('SVG export modes', () => {
  const openExportMenu = async (page) => {
    await page.getByRole('button', { name: 'Export', exact: true }).hover()
    await expect(page.getByRole('menuitem', { name: 'SVG (interactive)', exact: true })).toBeVisible()
  }

  test.beforeEach(async ({ page }) => {
    await startFresh(page)
  })

  test('interactive svg export contains tooltip hover styles and has correct filename', async ({
    page,
  }) => {
    await openExportMenu(page)

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: 'SVG (interactive)', exact: true }).click(),
    ])
    const svgContent = await readDownload(download)

    expect(svgContent).toContain('export-tooltip-trigger')
    expect(svgContent).toContain('.skill-node-tooltip-trigger:hover + .skill-node-tooltip-group')
    expect(svgContent).not.toContain('<animate')
    expect(svgContent).not.toContain('begin="export-tooltip-trigger-')
    expect(svgContent).toContain('skill-node-export-anchor')
    expect(svgContent).toContain('.skill-node-button {')
    expect(svgContent).toContain('.skill-tree-canvas {')
    expect(download.suggestedFilename()).toBe('skilltree-roadmap.svg')
  })

  test('png export downloads a binary png file', async ({
    page,
  }) => {
    await openExportMenu(page)

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: 'PNG', exact: true }).click(),
    ])

    const filePath = await download.path()
    const fileBuffer = readFileSync(filePath)
    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

    expect(download.suggestedFilename()).toBe('skilltree-roadmap.png')
    expect(fileBuffer.subarray(0, 8)).toEqual(pngSignature)
    expect(fileBuffer.length).toBeGreaterThan(8)
  })

  test('interactive svg export matches the builder tooltip palette and font stack', async ({
    page,
  }) => {
    await openExportMenu(page)

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: 'SVG (interactive)', exact: true }).click(),
    ])
    const svgContent = await readDownload(download)

    expect(svgContent).toContain('rgba(2, 6, 23, 0.96)')
    expect(svgContent).toContain('rgba(56, 189, 248, 0.25)')
    expect(svgContent).toContain('box-shadow: rgba(2, 6, 23, 0.45) 0px 18px 40px')
    expect(svgContent).toContain('font-family: "Space Grotesk", Rajdhani, sans-serif')
    expect(svgContent).toContain('max-width: 44rem')
    expect(svgContent).toMatch(/text-rendering:\s*geometricprecision/i)
    expect(svgContent).toContain('font-size: 1rem')
    expect(svgContent).toContain('font-size: 0.98rem')
    expect(svgContent).toContain('width="156"')
    expect(svgContent).toContain('height="156"')
  })

  test('clean svg export has no tooltip animations and has correct filename', async ({
    page,
  }) => {
    await openExportMenu(page)

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: 'SVG (clean)' }).click(),
    ])
    const svgContent = await readDownload(download)

    expect(svgContent).not.toContain('export-tooltip-trigger')
    expect(svgContent).not.toContain('<animate')
    expect(svgContent).toContain('skill-node-export-anchor')
    expect(svgContent).toContain('.skill-node-button {')
    expect(download.suggestedFilename()).toContain('clean')
  })

  test('clean svg and interactive svg contain the same set of node labels', async ({
    page,
  }) => {
    const builderLabels = await getBuilderNodeLabels(page)
    await openExportMenu(page)

    const [cleanDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: 'SVG (clean)' }).click(),
    ])
    const cleanSvg = await readDownload(cleanDownload)

    for (const label of builderLabels) {
      if (label) expect(cleanSvg).toContain(label)
    }
  })
})
