import { test, expect } from '@playwright/test'
import { confirmAndReset, exportHtml, startFresh } from './helpers.js'

const SINGLE_NODE_DOCUMENT = {
  schemaVersion: 3,
  document: {
    systemName: 'Zoom Validation System',
    segments: [
      { id: 'segment-core', label: 'Core' },
    ],
    scopes: [
      { id: 'scope-platform', label: 'Platform', color: '#3b82f6' },
      { id: 'scope-api', label: 'API', color: '#10b981' },
      { id: 'scope-ui', label: 'UI', color: '#f59e0b' },
    ],
    releases: [
      {
        id: 'release-1',
        name: 'Zoom Release',
        motto: 'Visual parity',
        introduction: '',
        voiceOfCustomer: '',
        fictionalCustomerName: '',
        date: '2026-07-01',
        storyPointBudget: null,
        statusBudgets: { now: null, next: null, later: null, someday: null, done: null, hidden: null },
        featureStatuses: { now: true, next: true, later: true, someday: true, done: true, hidden: false },
        notesMarkdown: '',
        notesChecked: {},
      },
    ],
    children: [
      {
        id: 'node-zoom',
        label: 'Zoom Node',
        shortName: 'ZMN',
        segmentId: 'segment-core',
        children: [],
        levels: [
          {
            id: 'level-1',
            label: 'Foundation',
            status: 'now',
            releaseNote: 'Foundation implementation is active.',
            scopeIds: ['scope-platform'],
            effort: { size: 'm', customPoints: null },
            benefit: { size: 'm' },
          },
          {
            id: 'level-2',
            label: 'Rollout',
            status: 'next',
            releaseNote: 'Rollout is prepared for the next increment.',
            scopeIds: ['scope-api'],
            effort: { size: 'l', customPoints: null },
            benefit: { size: 'l' },
          },
          {
            id: 'level-3',
            label: 'Scale',
            status: 'later',
            releaseNote: 'Scaling enhancements follow after rollout.',
            scopeIds: ['scope-ui'],
            effort: { size: 'xl', customPoints: null },
            benefit: { size: 'xl' },
          },
        ],
      },
    ],
    showHiddenNodes: false,
  },
}

const ZOOM_STAGES = [
  { key: 'far', target: 75 },
  { key: 'mid', target: 125 },
  { key: 'close', target: 200 },
  { key: 'very-close', target: 500 },
]

const MODE_ORDER = ['far', 'mid', 'close', 'very-close']

const parseZoomPercent = (text) => {
  const parsed = Number.parseInt(String(text ?? '').replace(/[^\d]/g, ''), 10)
  return Number.isFinite(parsed) ? parsed : NaN
}

const readBuilderZoom = async (page) => {
  const text = await page.locator('.skill-tree-toolbar__zoom-value').first().innerText()
  return parseZoomPercent(text)
}

const readExportZoom = async (exportPage) => {
  const value = await exportPage.locator('#html-export-zoom-slider').inputValue()
  const parsed = Number.parseInt(String(value ?? '').replace(/[^\d]/g, ''), 10)
  return Number.isFinite(parsed) ? parsed : NaN
}

const ensureExportZoomMenuOpen = async (exportPage) => {
  const slider = exportPage.locator('#html-export-zoom-slider')
  if (!(await slider.isVisible())) {
    await exportPage.locator('#html-export-zoom-toggle').click()
  }
  await expect(slider).toBeVisible()
  return slider
}

const setBuilderMode = async (page, targetMode) => {
  const anchor = page.locator('foreignObject.skill-node-export-anchor[data-export-label="Zoom Node"]').first()
  await expect(anchor).toBeVisible()
  const zoomInButton = page.getByRole('button', { name: 'Zoom in' })
  const zoomOutButton = page.getByRole('button', { name: 'Zoom out' })
  const targetIndex = MODE_ORDER.indexOf(targetMode)

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const currentMode = await anchor.getAttribute('data-label-mode')
    if (currentMode === targetMode) {
      return
    }

    const currentIndex = MODE_ORDER.indexOf(currentMode)
    if (currentIndex < targetIndex) {
      await zoomInButton.click()
    } else {
      await zoomOutButton.click()
    }
    await page.waitForTimeout(80)
  }

  const lastMode = await anchor.getAttribute('data-label-mode')
  throw new Error(`Builder mode did not reach ${targetMode}, current=${lastMode}`)
}

const setBuilderMidMode = async (page) => {
  const anchor = page.locator('foreignObject.skill-node-export-anchor[data-export-label="Zoom Node"]').first()
  await setBuilderMode(page, 'far')

  const box = await anchor.boundingBox()
  if (!box) {
    throw new Error('Builder node anchor has no bounding box for mid mode')
  }

  const centerX = box.x + box.width / 2
  const centerY = box.y + box.height / 2

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const currentMode = await anchor.getAttribute('data-label-mode')
    if (currentMode === 'mid') {
      return
    }

    await page.mouse.move(centerX, centerY)
    await page.mouse.wheel(0, currentMode === 'far' ? -110 : 80)
    await page.waitForTimeout(80)
  }

  const lastMode = await anchor.getAttribute('data-label-mode')
  throw new Error(`Builder mode did not reach mid, current=${lastMode}`)
}

const setExportZoom = async (exportPage, targetPercent) => {
  const slider = await ensureExportZoomMenuOpen(exportPage)

  await slider.evaluate((element, value) => {
    element.value = String(value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
  }, targetPercent)

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const current = await readExportZoom(exportPage)
    if (Number.isFinite(current) && Math.abs(current - targetPercent) <= 1) {
      return
    }
    await exportPage.waitForTimeout(60)
  }

  const last = await readExportZoom(exportPage)
  throw new Error(`Export zoom did not reach ${targetPercent}%, current=${last}%`)
}

const setExportMidZoom = async (exportPage) => {
  const anchor = exportPage.locator('foreignObject.skill-node-export-anchor[data-export-label="Zoom Node"]').first()
  await expect(anchor).toBeVisible()
  await setExportZoom(exportPage, 100)

  const box = await anchor.boundingBox()
  if (!box) {
    throw new Error('Export node anchor has no bounding box for mid zoom')
  }

  const centerX = box.x + box.width / 2
  const centerY = box.y + box.height / 2

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const current = await readExportZoom(exportPage)
    if (current > 105 && current < 150) {
      return
    }

    await exportPage.mouse.move(centerX, centerY)
    await exportPage.mouse.wheel(0, current <= 105 ? -90 : 80)
    await exportPage.waitForTimeout(80)
  }

  const last = await readExportZoom(exportPage)
  throw new Error(`Export zoom did not reach mid range, current=${last}%`)
}

const setExportVeryCloseMode = async (exportPage) => {
  const anchor = exportPage.locator('foreignObject.skill-node-export-anchor[data-export-label="Zoom Node"]').first()
  await expect(anchor).toBeVisible()

  for (let attempt = 0; attempt < 24; attempt += 1) {
    if (await anchor.locator('.skill-node-vc__tabs').count() > 0) {
      return
    }

    await ensureExportZoomMenuOpen(exportPage)
    await exportPage.getByRole('button', { name: 'Zoom in' }).click()
    await exportPage.waitForTimeout(90)
  }

  const last = await readExportZoom(exportPage)
  const diagnostics = await anchor.evaluate((element) => {
    const levelsAttr = String(element.getAttribute('data-export-levels') ?? '')
    let parsedLevelsCount = -1
    try {
      const parsed = JSON.parse(levelsAttr)
      parsedLevelsCount = Array.isArray(parsed) ? parsed.length : -2
    } catch {
      parsedLevelsCount = -3
    }

    return {
      className: element.className,
      wrapperClass: element.querySelector('.skill-node-foreign')?.className ?? '',
      contentClass: element.querySelector('.skill-node-button__content')?.className ?? '',
      isMinimal: element.classList.contains('html-export__node--minimal'),
      levelsAttrLength: levelsAttr.length,
      levelsAttrPreview: levelsAttr.slice(0, 200),
      parsedLevelsCount,
      tabsCount: element.querySelectorAll('.skill-node-vc__tab').length,
      contentPreview: String(element.querySelector('.skill-node-button__content')?.innerHTML ?? '').slice(0, 240),
    }
  })
  throw new Error(`Export did not enter very-close mode via zoom-in steps, zoom=${last}%, diagnostics=${JSON.stringify(diagnostics)}`)
}

const assertNodeStageInBuilder = async (page, stageKey) => {
  const anchor = page.locator('foreignObject.skill-node-export-anchor[data-export-label="Zoom Node"]').first()
  await expect(anchor).toBeVisible()
  await expect(anchor).toHaveAttribute('data-label-mode', stageKey)

  if (stageKey === 'far') {
    await expect(anchor.locator('.skill-node-foreign--veryclose')).toHaveCount(0)
    return
  }

  if (stageKey === 'mid' || stageKey === 'close') {
    await expect(anchor.locator('.skill-node-foreign--veryclose')).toHaveCount(0)
    return
  }

  await expect(anchor.locator('.skill-node-foreign--veryclose')).toBeVisible()
  await expect(anchor.locator('.skill-node-vc__tabs')).toBeVisible()
  await expect(anchor.locator('.skill-node-vc__tab').filter({ hasText: 'Foundation' })).toBeVisible()
  await expect(anchor.locator('.skill-node-vc__tab').filter({ hasText: 'Rollout' })).toBeVisible()
  await expect(anchor.locator('.skill-node-vc__tab').filter({ hasText: 'Scale' })).toBeVisible()
}

const assertNodeStageInExport = async (exportPage, stageKey) => {
  const anchor = exportPage.locator('foreignObject.skill-node-export-anchor[data-export-label="Zoom Node"]').first()
  await expect(anchor).toBeVisible()

  if (stageKey === 'far') {
    await expect(anchor.locator('.skill-node-button__label')).toHaveCount(0)
    await expect(anchor.locator('.skill-node-foreign--veryclose')).toHaveCount(0)
    return
  }

  if (stageKey === 'mid' || stageKey === 'close') {
    await expect(anchor.locator('.skill-node-button__label')).toBeVisible()
    await expect(anchor.locator('.skill-node-foreign--veryclose')).toHaveCount(0)
    return
  }

  await expect(anchor.locator('.skill-node-foreign--veryclose')).toBeVisible()

  const tabsCount = await anchor.locator('.skill-node-vc__tabs').count()
  if (tabsCount === 0) {
    const details = await anchor.evaluate((element) => {
      const levelsAttr = String(element.getAttribute('data-export-levels') ?? '')
      let parsedLevelsCount = -1
      try {
        const parsed = JSON.parse(levelsAttr)
        parsedLevelsCount = Array.isArray(parsed) ? parsed.length : -2
      } catch {
        parsedLevelsCount = -3
      }

      return {
        levelsAttrLength: levelsAttr.length,
        levelsAttrPreview: levelsAttr.slice(0, 240),
        parsedLevelsCount,
        contentPreview: String(element.querySelector('.skill-node-button__content')?.innerHTML ?? '').slice(0, 240),
      }
    })
    throw new Error(`Export very-close tabs missing: ${JSON.stringify(details)}`)
  }

  await expect(anchor.locator('.skill-node-vc__tabs')).toBeVisible()
  await expect(anchor.locator('.skill-node-vc__tab').filter({ hasText: 'Foundation' })).toBeVisible()
  await expect(anchor.locator('.skill-node-vc__tab').filter({ hasText: 'Rollout' })).toBeVisible()
  await expect(anchor.locator('.skill-node-vc__tab').filter({ hasText: 'Scale' })).toBeVisible()
}

const attachNodeScreenshot = async (locator, testInfo, name) => {
  const image = await locator.screenshot()
  await testInfo.attach(name, { body: image, contentType: 'image/png' })
}

test.describe('Builder/export zoom stages for node and levels', () => {
  test('covers all zoom stages visually and verifies very-close in export', async ({ page, browser }, testInfo) => {
    await startFresh(page)

    // 1) reset
    await confirmAndReset(page)

    // 2) add one node with multiple levels and all relevant level fields
    await page.evaluate((payload) => {
      localStorage.setItem('roadmap-skilltree.document.v1', JSON.stringify(payload))
    }, SINGLE_NODE_DOCUMENT)
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('foreignObject.skill-node-export-anchor[data-export-label="Zoom Node"]', { state: 'attached', timeout: 20_000 })

    // Fit should use node bounds only, so a single-node canvas should not be tiny after fit.
    await page.getByRole('button', { name: 'Fit to screen' }).click()
    await page.waitForTimeout(120)
    expect(await readBuilderZoom(page)).toBeGreaterThanOrEqual(80)

    // 3) visually verify all zoom stages in builder
    const showZoomMenu = page.getByRole('button', { name: 'Show zoom menu' })
    if (await showZoomMenu.count() > 0) {
      await showZoomMenu.click()
    }

    const builderAnchor = page.locator('foreignObject.skill-node-export-anchor[data-export-label="Zoom Node"]').first()
    for (const stage of ZOOM_STAGES) {
      if (stage.key === 'mid') {
        await setBuilderMidMode(page)
      } else {
        await setBuilderMode(page, stage.key)
      }
      await assertNodeStageInBuilder(page, stage.key)
      await attachNodeScreenshot(builderAnchor, testInfo, `builder-${stage.key}.png`)
    }

    // 4) generate and open html export
    const html = await exportHtml(page)
    const exportContext = await browser.newContext()
    const exportPage = await exportContext.newPage()

    try {
      await exportPage.setContent(html)
      await exportPage.waitForSelector('#html-export-tree-canvas svg', { timeout: 15_000 })
      await expect.poll(async () => exportPage.evaluate(() => Boolean(window.__skilltreeExportViewerReady)), { timeout: 10_000 }).toBe(true)

      await exportPage.getByRole('button', { name: 'Fit to screen' }).click()
      await exportPage.waitForTimeout(120)

      const exportAnchor = exportPage.locator('foreignObject.skill-node-export-anchor[data-export-label="Zoom Node"]').first()

      // 5) visually verify all zoom stages in export
      await exportPage.locator('#html-export-zoom-toggle').click()
      for (const stage of ZOOM_STAGES) {
        if (stage.key === 'mid') {
          await setExportMidZoom(exportPage)
        } else if (stage.key === 'very-close') {
          await setExportVeryCloseMode(exportPage)
        } else {
          await setExportZoom(exportPage, stage.target)
        }
        await assertNodeStageInExport(exportPage, stage.key)
        await attachNodeScreenshot(exportAnchor, testInfo, `export-${stage.key}.png`)
      }
    } finally {
      await exportPage.close()
      await exportContext.close()
    }
  })
})
