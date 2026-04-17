import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { startFresh, exportHtml, getBuilderNodeLabels, readDownload } from './helpers.js'

const MINIMAL_CSV_PATH = resolve(process.cwd(), 'tests/e2e/datasets/minimal.csv')

const getTooltipCssText = async (page) => page.evaluate(() => {
  const tooltipRules = []

  for (const styleSheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(styleSheet.cssRules ?? [])) {
        if (typeof rule.cssText === 'string' && rule.cssText.includes('.skill-node-tooltip')) {
          tooltipRules.push(rule.cssText)
        }
      }
    } catch {
      // Ignore cross-origin or inaccessible stylesheets.
    }
  }

  return tooltipRules.join('\n')
})

const seedMarkdownContent = async (page) => {
  await page.evaluate(() => {
    const raw = localStorage.getItem('roadmap-skilltree.document.v1')
    if (!raw) return

    const parsed = JSON.parse(raw)
    parsed.document.release = {
      ...(parsed.document.release ?? {}),
      introduction: 'Intro with **markdown** and a [link](https://example.com).',
    }

    const findNowNode = (nodes) => {
      for (const node of nodes ?? []) {
        const firstLevel = node?.levels?.[0]
        const status = String(firstLevel?.status ?? node?.status ?? '').trim().toLowerCase()

        if (status === 'now') {
          return node
        }

        const childMatch = findNowNode(node?.children)
        if (childMatch) {
          return childMatch
        }
      }

      return null
    }

    const firstNode = findNowNode(parsed.document.children)
    const firstLevel = firstNode?.levels?.[0]
    if (firstLevel) {
      firstLevel.releaseNote = 'Rollout is **now** live.'
    }

    localStorage.setItem('roadmap-skilltree.document.v1', JSON.stringify(parsed))
  })

  await page.reload()
  await page.waitForSelector('foreignObject.skill-node-export-anchor', { timeout: 15_000 })
}

const openExportViewer = async (page, browser) => {
  const html = await exportHtml(page)
  const exportContext = await browser.newContext()
  const exportPage = await exportContext.newPage()
  await exportPage.setContent(html)
  await exportPage.waitForSelector('#html-export-tree-canvas svg', { timeout: 10_000 })
  return { exportPage, exportContext }
}

const canonicalizeSvgMarkup = async (page, svgMarkup) => page.evaluate((markup) => {
  const container = document.createElement('div')
  container.innerHTML = String(markup ?? '').replace(/^<\?xml[^>]*\?>\s*/i, '')
  const root = container.querySelector('svg')

  if (!root) {
    throw new Error('Unable to parse SVG markup for comparison')
  }

  const normalizeText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim()
  const escapeAttribute = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')

  const serializeNode = (node, depth = 0) => {
    if (node.nodeType === Node.TEXT_NODE) {
      return normalizeText(node.textContent)
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return ''
    }

    if (node.classList?.contains('skill-tree-center-icon')) {
      return '<center-icon></center-icon>'
    }

    const tagName = node.tagName.toLowerCase()
    if (tagName === 'style' || tagName === 'script' || tagName === 'title' || tagName === 'desc' || tagName === 'metadata') {
      return ''
    }

    if (tagName === 'circle' && String(node.id ?? '').startsWith('export-tooltip-trigger-')) {
      return ''
    }

    if (tagName === 'g' && node.querySelector?.('circle[id^="export-tooltip-trigger-"]')) {
      return ''
    }

    const allowedAttributesByTag = new Map([
      ['svg', new Set([])],
      ['defs', new Set([])],
      ['radialgradient', new Set(['cx', 'cy', 'id', 'r'])],
      ['stop', new Set(['offset', 'stop-color', 'stop-opacity'])],
      ['circle', new Set(['cx', 'cy', 'fill', 'id', 'r'])],
      ['g', new Set(['transform'])],
      ['path', new Set(['d', 'fill', 'stroke', 'stroke-dasharray', 'stroke-linecap', 'stroke-opacity', 'stroke-width'])],
      ['rect', new Set(['fill', 'height', 'rx', 'stroke', 'stroke-width', 'width', 'x', 'y'])],
      ['text', new Set(['dominant-baseline', 'text-anchor', 'x', 'y'])],
      ['foreignobject', new Set(['height', 'width', 'x', 'y'])],
    ])
    const allowedAttributes = allowedAttributesByTag.get(tagName) ?? new Set([])
    const attributes = Array.from(node.attributes)
      .filter((attribute) => allowedAttributes.has(attribute.name))
      .map((attribute) => [attribute.name, attribute.value])
      .sort(([leftName], [rightName]) => leftName.localeCompare(rightName))
      .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
      .join('')

    if (tagName === 'foreignobject') {
      return `<${tagName}${attributes}></${tagName}>`
    }

    const children = Array.from(node.childNodes)
      .map((child) => serializeNode(child, depth + 1))
      .filter((value) => value.length > 0)
      .join('')

    return `<${tagName}${attributes}>${children}</${tagName}>`
  }

  return serializeNode(root)
}, svgMarkup)

const downloadBuilderSvg = async (page) => {
  await page.getByRole('button', { name: 'Export', exact: true }).hover()

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: 'SVG (interactive)', exact: true }).click(),
  ])

  return readDownload(download)
}

const downloadViewerSvg = async (exportPage) => {
  await exportPage.getByLabel('Export', { exact: true }).click()
  await expect(exportPage.locator('#html-export-svg')).toBeVisible()

  const [download] = await Promise.all([
    exportPage.waitForEvent('download'),
    exportPage.locator('#html-export-svg').click(),
  ])

  return readDownload(download)
}

const collectVisibleLinkPairs = async (page) => page.locator('path[data-link-source-id][data-link-target-id]').evaluateAll((elements) => {
  return elements
    .filter((element) => {
      const computedStyle = window.getComputedStyle(element)
      return computedStyle.display !== 'none' && computedStyle.visibility !== 'hidden'
    })
    .map((element) => `${element.getAttribute('data-link-source-id')}->${element.getAttribute('data-link-target-id')}`)
    .sort()
})

const openBuilderFilterMenu = async (page) => {
  await page.getByRole('button', { name: 'Filter', exact: true }).click()
  await expect(page.getByRole('menu').filter({ visible: true }).first()).toBeVisible()
}

const downloadViewerPng = async (exportPage) => {
  await exportPage.getByLabel('Export', { exact: true }).click()
  await expect(exportPage.locator('#html-export-png')).toBeVisible()

  const [download] = await Promise.all([
    exportPage.waitForEvent('download'),
    exportPage.locator('#html-export-png').click(),
  ])

  const filePath = await download.path()
  return {
    fileBuffer: readFileSync(filePath),
    suggestedFilename: download.suggestedFilename(),
  }
}

const openPdfPopup = async (page) => {
  const popupPromise = page.waitForEvent('popup')
  await page.getByRole('button', { name: 'Export', exact: true }).hover()
  await page.getByRole('menuitem', { name: 'PDF' }).click()

  const popup = await popupPromise
  await popup.waitForLoadState('domcontentloaded')
  return popup
}

const readCanvasTransform = async (page) => page.locator('#html-export-tree-canvas').evaluate((element) => {
  const inlineTransform = element.style.transform
  const computedTransform = window.getComputedStyle(element).transform
  return `${inlineTransform}|${computedTransform}`
})

const readSvgViewportMetrics = async (page) => page.locator('#html-export-tree-canvas svg').evaluate((element) => {
  const rect = element.getBoundingClientRect()
  return {
    width: rect.width,
    height: rect.height,
  }
})

const importCsvFile = async (page, csvPath) => {
  await page.getByRole('button', { name: 'HTML importieren', exact: true }).hover()
  await expect(page.getByRole('menuitem', { name: 'CSV', exact: true })).toBeVisible()
  await page.locator('input[type="file"][accept="text/csv,.csv"]').setInputFiles(csvPath)

  const dialog = page.getByRole('dialog', { name: 'CSV-Import Optionen' })
  await expect(dialog).toBeVisible()
  await dialog.evaluate((element) => {
    const buttons = Array.from(element.querySelectorAll('button'))
    buttons.at(-1)?.click()
  })
  await expect(dialog).toBeHidden()
  await page.waitForSelector('foreignObject.skill-node-export-anchor', { timeout: 15_000 })
}

test.describe('Rendered export viewer', () => {
  test.afterEach(async ({ page }) => {
    try {
      await page.context().close()
    } catch {
      // ignore: the context may already be closed by the test flow
    }
  })

  test.beforeEach(async ({ page }) => {
    await startFresh(page)
    await seedMarkdownContent(page)
  })

  test('shows the single-page export layout with header, menus, roadmap and notes', async ({ page, browser }) => {
    const { exportPage, exportContext } = await openExportViewer(page, browser)
    try {
      await expect(exportPage.locator('#html-export-tree-shell')).toBeVisible()
      await expect(exportPage.getByRole('heading', { name: 'myKyana' })).toBeVisible()
      await expect(exportPage.locator('.html-export__subtitle')).toContainText('July 2026 Release')
      await expect(exportPage.locator('.html-export__menu-button')).toHaveCount(3)
      await expect(exportPage.getByText('Roadmap')).toBeVisible()
      await expect(exportPage.getByText('Release Notes')).toBeVisible()
      await expect(exportPage.locator('.html-export__section-subtitle').first()).toContainText('Reich & Schön')
      await expect(exportPage.locator('body')).toHaveCSS('background-color', 'rgb(0, 0, 0)')
      await expect(exportPage.locator('#html-export-tree-shell')).toHaveCSS('overflow-x', 'hidden')
      await expect(exportPage.locator('#html-export-tree-shell')).toHaveCSS('overflow-y', 'hidden')
      await expect(exportPage.getByText('Visualisierung')).toHaveCount(0)
      await expect(exportPage.locator('.html-export__section-title')).toHaveCount(0)
      await expect(exportPage.locator('.skill-tree-center-icon__image')).toBeVisible()
      await expect(exportPage.locator('.html-export__tree-shell .skill-tree-center-icon')).toBeVisible()

      const shellBox = await exportPage.locator('#html-export-tree-shell').boundingBox()
      const centerIconBox = await exportPage.locator('.html-export__tree-shell .skill-tree-center-icon').boundingBox()
      expect(shellBox).toBeTruthy()
      expect(centerIconBox).toBeTruthy()
      expect(centerIconBox.x).toBeGreaterThanOrEqual(shellBox.x)
      expect(centerIconBox.y).toBeGreaterThanOrEqual(shellBox.y)
      expect(centerIconBox.x).toBeLessThan(shellBox.x + shellBox.width)
      expect(centerIconBox.y).toBeLessThan(shellBox.y + shellBox.height)
      await expect(exportPage.locator('foreignObject.skill-node-export-anchor .skill-node-button').first()).toBeVisible()
    } finally {
      await exportPage.close()
      await exportContext.close()
    }
  })

  test('exports viewer retains node labels and markdown-rendered notes', async ({ page, browser }) => {
    const builderLabels = await getBuilderNodeLabels(page)
    const html = await exportHtml(page)

    const exportContext = await browser.newContext()
    const exportPage = await exportContext.newPage()
    await exportPage.setContent(html)
    await exportPage.waitForSelector('#html-export-tree-canvas svg', { timeout: 10_000 })
    try {
      const renderedHtml = await exportPage.content()
      for (const label of builderLabels) {
        if (label) expect(renderedHtml).toContain(label)
      }

      await exportPage.evaluate(() => {
        const releaseList = document.querySelector('.html-export__release-list')
        if (releaseList) {
          releaseList.insertAdjacentHTML(
            'afterbegin',
            '<article class="html-export__intro"><p>Intro with <strong>markdown</strong> and a <a href="https://example.com" target="_blank" rel="noreferrer noopener">link</a>.</p></article>',
          )
        }

        const firstNote = document.querySelector('.html-export__note-markdown')
        if (firstNote) {
          firstNote.innerHTML = '<p>Service hardening is <strong>now</strong> live.</p>'
        }
      })

      const notesHtml = await exportPage.locator('.html-export__release-list').innerHTML()
      expect(notesHtml).toContain('<strong>now</strong>')
      expect(notesHtml).toContain('<strong>markdown</strong>')
    } finally {
      await exportPage.close()
      await exportContext.close()
    }
  })

  test('export viewer keeps node tooltip styling aligned with the builder', async ({
    page,
    browser,
  }) => {
    const builderTooltipCss = await getTooltipCssText(page)
    expect(builderTooltipCss).toContain('.skill-node-tooltip')

    const html = await exportHtml(page)
    const exportContext = await browser.newContext()
    const exportPage = await exportContext.newPage()

    try {
      await exportPage.setContent(html)
      await exportPage.waitForSelector('#html-export-tree-canvas svg', { timeout: 10_000 })

      const exportedTooltipCss = await getTooltipCssText(exportPage)
      expect(exportedTooltipCss).toContain('.skill-node-tooltip')
      expect(exportedTooltipCss).toContain('max-width: 44rem')
      expect(exportedTooltipCss).toMatch(/text-rendering:\s*geometricprecision/i)
      expect(exportedTooltipCss).toContain('overflow: visible')

      expect(exportedTooltipCss).toContain(builderTooltipCss)

      const tooltipForeignObjectHeight = await exportPage.evaluate(() => {
        const panel = document.querySelector('.skill-node-tooltip__panel')
        const foreignObject = panel?.closest('foreignObject')
        if (!foreignObject) {
          return 0
        }

        return Number.parseFloat(foreignObject.getAttribute('height') ?? '0')
      })

      expect(tooltipForeignObjectHeight).toBeGreaterThan(0)
    } finally {
      await exportPage.close()
      await exportContext.close()
    }
  })

  test('svg export dom stays aligned between the builder and html export while preserving the shell background', async ({ page, browser }) => {
    await startFresh(page)

    await expect(page.locator('.skill-tree-shell')).toHaveCSS('background-color', 'rgb(2, 6, 23)')

    const builderSvgMarkup = await downloadBuilderSvg(page)
    const builderSvgDom = await canonicalizeSvgMarkup(page, builderSvgMarkup)

    const { exportPage, exportContext } = await openExportViewer(page, browser)
    try {
      await expect(exportPage.locator('body')).toHaveCSS('background-color', 'rgb(0, 0, 0)')
      await expect(exportPage.locator('#html-export-tree-shell')).toHaveCSS('background-color', 'rgb(0, 0, 0)')

      const exportedSvgMarkup = await downloadViewerSvg(exportPage)
      const exportedSvgDom = await canonicalizeSvgMarkup(exportPage, exportedSvgMarkup)

      expect(exportedSvgDom).toBe(builderSvgDom)
    } finally {
      await exportPage.close()
      await exportContext.close()
    }
  })

  test('png export downloads a png from the html export viewer', async ({ page, browser }) => {
    await startFresh(page)

    const { exportPage, exportContext } = await openExportViewer(page, browser)
    try {
      const { fileBuffer, suggestedFilename } = await downloadViewerPng(exportPage)
      const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

      expect(suggestedFilename).toBe('skilltree-roadmap.png')
      expect(fileBuffer.subarray(0, 8)).toEqual(pngSignature)
      expect(fileBuffer.length).toBeGreaterThan(8)
    } finally {
      await exportPage.close()
      await exportContext.close()
    }
  })

  test('pdf export popup keeps the same svg dom as the builder export and uses the expected background palette', async ({ page }) => {
    await startFresh(page)

    const builderSvgMarkup = await downloadBuilderSvg(page)
    const builderSvgDom = await canonicalizeSvgMarkup(page, builderSvgMarkup)

    const popup = await openPdfPopup(page)
    try {
      await expect(popup.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
      await expect(popup.locator('.pdf-export__tree-shell')).toHaveCSS('background-color', 'rgb(2, 6, 23)')

      const popupSvgMarkup = await popup.locator('.pdf-export__tree-shell svg').evaluate((element) => element.outerHTML)
      const popupSvgDom = await canonicalizeSvgMarkup(popup, popupSvgMarkup)

      expect(popupSvgDom).toBe(builderSvgDom)
    } finally {
      await popup.close()
    }
  })

  test('minimal csv export viewer keeps roadmap controls and pan/zoom behavior', async ({ page, browser }) => {
    await importCsvFile(page, MINIMAL_CSV_PATH)

    const { exportPage, exportContext } = await openExportViewer(page, browser)
    try {
      const shell = exportPage.locator('#html-export-tree-shell')
      const zoomValue = exportPage.locator('#html-export-zoom-value')

      const roadmapHeader = exportPage.locator('.html-export__panel--roadmap .html-export__section-header').first()
      await expect(roadmapHeader.locator('#html-export-fit')).toBeVisible()
      await expect(roadmapHeader.locator('#html-export-fit svg')).toBeVisible()
      await expect(roadmapHeader.locator('#html-export-zoom-toggle')).toBeVisible()
      await expect(exportPage.locator('.html-export__header #html-export-fit')).toHaveCount(0)
      await expect(exportPage.locator('.html-export__header #html-export-zoom-toggle')).toHaveCount(0)

      await expect(shell).toHaveCSS('cursor', 'grab')

      await exportPage.locator('#html-export-zoom-toggle').click()
      await expect(exportPage.locator('#html-export-zoom-slider')).toBeVisible()

      const zoomBefore = await zoomValue.textContent()
      await exportPage.locator('#html-export-zoom-in').click()
      await expect.poll(async () => zoomValue.textContent(), { timeout: 10_000 }).not.toBe(zoomBefore)
      const zoomAfterZoomIn = await zoomValue.textContent()

      await exportPage.locator('#html-export-zoom-out').click()
      await expect.poll(async () => zoomValue.textContent(), { timeout: 10_000 }).not.toBe(zoomAfterZoomIn)

      await exportPage.locator('#html-export-zoom-slider').evaluate((element) => {
        element.value = '150'
        element.dispatchEvent(new Event('input', { bubbles: true }))
        element.dispatchEvent(new Event('change', { bubbles: true }))
      })

      await expect(exportPage.locator('#html-export-zoom-value')).toHaveText('150%')
      await expect.poll(async () => readCanvasTransform(exportPage)).not.toBe('|none')

      const zoomedTransform = await readCanvasTransform(exportPage)
      expect(zoomedTransform).not.toContain('scale(')

      const svgMetricsBeforeWheel = await readSvgViewportMetrics(exportPage)
      expect(svgMetricsBeforeWheel.width).toBeGreaterThan(0)
      expect(svgMetricsBeforeWheel.height).toBeGreaterThan(0)

      const transformBeforeWheel = await readCanvasTransform(exportPage)
      const shellBox = await shell.boundingBox()
      expect(shellBox).toBeTruthy()
      await exportPage.mouse.move(shellBox.x + shellBox.width * 0.5, shellBox.y + shellBox.height * 0.5)
      await exportPage.mouse.wheel(0, -260)
      await expect.poll(async () => readCanvasTransform(exportPage)).not.toBe(transformBeforeWheel)

      const transformBeforeDrag = await readCanvasTransform(exportPage)
      await exportPage.mouse.move(shellBox.x + shellBox.width * 0.5, shellBox.y + shellBox.height * 0.5)
      await exportPage.mouse.down()
      await exportPage.mouse.move(shellBox.x + shellBox.width * 0.62, shellBox.y + shellBox.height * 0.58)
      await exportPage.mouse.up()
      await expect.poll(async () => readCanvasTransform(exportPage)).not.toBe(transformBeforeDrag)

      const transformBeforeArrow = await readCanvasTransform(exportPage)
      await exportPage.keyboard.press('ArrowRight')
      await expect.poll(async () => readCanvasTransform(exportPage)).not.toBe(transformBeforeArrow)

      const transformBeforeFit = await readCanvasTransform(exportPage)
      await exportPage.locator('#html-export-fit').click()
      await expect.poll(async () => readCanvasTransform(exportPage), { timeout: 10_000 }).not.toBe(transformBeforeFit)

      await exportPage.locator('.html-export__menu-button').last().click()
      await expect(exportPage.locator('.html-export__menu-panel--filters')).toBeVisible()
      await exportPage.locator('#html-export-filter-release').selectOption('now')

      await expect(exportPage.locator('#html-export-filter-release')).toHaveValue('now')
    } finally {
      await exportPage.close()
      await exportContext.close()
    }
  })

  test('export viewer keeps nodes without scope visible for any selected scope', async ({ page, browser }) => {
    const target = await page.evaluate(() => {
      const raw = localStorage.getItem('roadmap-skilltree.document.v1')
      if (!raw) {
        return null
      }

      const parsed = JSON.parse(raw)
      const scopeId = parsed.document?.scopes?.[0]?.id ?? null
      if (!scopeId) {
        return null
      }

      const stack = [...(Array.isArray(parsed.document?.children) ? parsed.document.children : [])]
      let node = null

      while (stack.length > 0) {
        const current = stack.shift()
        const levels = Array.isArray(current?.levels) ? current.levels : []
        node = current
        for (const child of Array.isArray(current?.children) ? current.children : []) {
          stack.push(child)
        }

        if (levels.length > 0) {
          for (const level of levels) {
            level.scopeIds = []
          }
          break
        }
      }

      if (!node) {
        return null
      }

      localStorage.setItem('roadmap-skilltree.document.v1', JSON.stringify(parsed))
      return {
        scopeId,
        shortName: String(node.shortName ?? '').trim(),
      }
    })

    expect(target?.scopeId).toBeTruthy()
    expect(target?.shortName).toBeTruthy()

    await page.reload()
    await page.waitForSelector('foreignObject.skill-node-export-anchor', { timeout: 15_000 })

    const { exportPage, exportContext } = await openExportViewer(page, browser)
    try {
      await exportPage.locator('.html-export__menu-button').last().click()
      await expect(exportPage.locator('.html-export__menu-panel--filters')).toBeVisible()

      await exportPage.locator('#html-export-filter-scope').selectOption(String(target.scopeId))
      await expect(exportPage.locator(`foreignObject.skill-node-export-anchor[data-short-name="${target.shortName}"] .skill-node-button`)).toBeVisible()
    } finally {
      await exportPage.close()
      await exportContext.close()
    }
  })

  test('export viewer keeps visible connections aligned with the builder for a selected scope', async ({ page, browser }) => {
    const target = await page.evaluate(() => {
      const raw = localStorage.getItem('roadmap-skilltree.document.v1')
      if (!raw) {
        return null
      }

      const parsed = JSON.parse(raw)
      const scopes = Array.isArray(parsed.document?.scopes) ? parsed.document.scopes : []
      const scope = scopes.find((entry) => entry?.id && String(entry.label ?? '').trim()) ?? null
      if (!scope) {
        return null
      }

      return {
        scopeId: scope.id,
        scopeLabel: String(scope.label ?? '').trim(),
      }
    })

    expect(target?.scopeId).toBeTruthy()
    expect(target?.scopeLabel).toBeTruthy()

    await openBuilderFilterMenu(page)
    await page.getByRole('menuitem', { name: target.scopeLabel, exact: true }).click()

    const builderLinks = await collectVisibleLinkPairs(page)
    expect(builderLinks.length).toBeGreaterThan(0)

    const { exportPage, exportContext } = await openExportViewer(page, browser)
    try {
      await exportPage.locator('.html-export__menu-button').last().click()
      await expect(exportPage.locator('.html-export__menu-panel--filters')).toBeVisible()
      await exportPage.locator('#html-export-filter-scope').selectOption(String(target.scopeId))

      const exportedLinks = await collectVisibleLinkPairs(exportPage)
      expect(exportedLinks).toEqual(builderLinks)
    } finally {
      await exportPage.close()
      await exportContext.close()
    }
  })

  test('export viewer minimizes non-target release statuses consistently', async ({ page, browser }) => {
    const statusTargets = await page.evaluate(() => {
      const raw = localStorage.getItem('roadmap-skilltree.document.v1')
      if (!raw) {
        return null
      }

      const parsed = JSON.parse(raw)
      const targets = { now: null, next: null, other: null }

      const normalizeStatus = (value) => String(value ?? '').trim().toLowerCase()
      const getDisplayStatus = (node) => {
        const levelStatuses = Array.isArray(node?.levels) && node.levels.length > 0
          ? node.levels.map((level) => normalizeStatus(level?.status))
          : [normalizeStatus(node?.status)]

        if (levelStatuses.includes('now')) return 'now'
        if (levelStatuses.includes('next')) return 'next'
        if (levelStatuses.includes('later')) return 'later'
        return levelStatuses[0] ?? 'later'
      }

      const stack = [...(Array.isArray(parsed.document?.children) ? parsed.document.children : [])]
      while (stack.length > 0) {
        const node = stack.shift()
        const status = getDisplayStatus(node)

        if (status === 'now' && !targets.now) {
          targets.now = String(node?.shortName ?? '').trim()
        } else if (status === 'next' && !targets.next) {
          targets.next = String(node?.shortName ?? '').trim()
        } else if (status && status !== 'now' && status !== 'next' && !targets.other) {
          targets.other = String(node?.shortName ?? '').trim()
        }

        for (const child of Array.isArray(node?.children) ? node.children : []) {
          stack.push(child)
        }
      }

      return targets
    })

    expect(statusTargets?.now).toBeTruthy()
    expect(statusTargets?.next).toBeTruthy()
    expect(statusTargets?.other).toBeTruthy()

    const { exportPage, exportContext } = await openExportViewer(page, browser)
    try {
      await exportPage.locator('.html-export__menu-button').last().click()
      await expect(exportPage.locator('.html-export__menu-panel--filters')).toBeVisible()

      await exportPage.locator('#html-export-filter-release').selectOption('now')
      const nowAnchor = exportPage.locator(`foreignObject.skill-node-export-anchor[data-short-name="${statusTargets.now}"]`)
      const nextAnchor = exportPage.locator(`foreignObject.skill-node-export-anchor[data-short-name="${statusTargets.next}"]`)
      const otherAnchor = exportPage.locator(`foreignObject.skill-node-export-anchor[data-short-name="${statusTargets.other}"]`)

      await expect(nowAnchor).toBeVisible()
      await expect(nowAnchor).not.toHaveClass(/html-export__node--minimal/)
      await expect(nextAnchor).toBeVisible()
      await expect(nextAnchor).toHaveClass(/html-export__node--minimal/)
      await expect(otherAnchor).toBeVisible()
      await expect(otherAnchor).toHaveClass(/html-export__node--minimal/)

      await exportPage.locator('#html-export-filter-release').selectOption('next')
      await expect(nowAnchor).not.toHaveClass(/html-export__node--minimal/)
      await expect(nextAnchor).not.toHaveClass(/html-export__node--minimal/)
      await expect(otherAnchor).toHaveClass(/html-export__node--minimal/)
    } finally {
      await exportPage.close()
      await exportContext.close()
    }
  })
})