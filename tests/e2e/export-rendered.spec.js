import { test, expect } from '@playwright/test'
import { startFresh, exportHtml, getBuilderNodeLabels } from './helpers.js'

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

      const canvas = exportPage.locator('#html-export-tree-canvas')
      await expect.poll(async () => canvas.evaluate((element) => element.style.transform)).not.toBe('translate(0px, 0px) scale(1)')
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

      expect(exportedTooltipCss).toContain(builderTooltipCss)
    } finally {
      await exportPage.close()
      await exportContext.close()
    }
  })

  test('export viewer pan zoom and filter controls respond to input', async ({ page, browser }) => {
    const { exportPage, exportContext } = await openExportViewer(page, browser)
    try {
      const shell = exportPage.locator('#html-export-tree-shell')
      await expect(shell).toHaveCSS('cursor', 'grab')

      const transformBefore = await exportPage.locator('#html-export-tree-canvas').evaluate((element) => element.style.transform)

      await exportPage.locator('#html-export-zoom-toggle').click()
      await expect(exportPage.locator('#html-export-zoom-slider')).toBeVisible()

      await exportPage.locator('#html-export-zoom-in').click()
      const transformAfterZoomIn = await exportPage.locator('#html-export-tree-canvas').evaluate((element) => element.style.transform)
      expect(transformAfterZoomIn).not.toBe(transformBefore)

      await exportPage.locator('#html-export-zoom-out').click()
      const transformAfterZoomOut = await exportPage.locator('#html-export-tree-canvas').evaluate((element) => element.style.transform)
      expect(transformAfterZoomOut).not.toBe(transformAfterZoomIn)

      await exportPage.locator('#html-export-zoom-slider').evaluate((element) => {
        element.value = '150'
        element.dispatchEvent(new Event('input', { bubbles: true }))
        element.dispatchEvent(new Event('change', { bubbles: true }))
      })

      await expect(exportPage.locator('#html-export-zoom-value')).toHaveText('150%')

      await exportPage.locator('#html-export-fit').click()
      const transformAfterFit = await exportPage.locator('#html-export-tree-canvas').evaluate((element) => element.style.transform)
      expect(transformAfterFit).not.toBe('translate(0px, 0px) scale(1)')

      await exportPage.keyboard.press('Control+0')
      const transformAfterHotkeyFit = await exportPage.locator('#html-export-tree-canvas').evaluate((element) => element.style.transform)
      expect(transformAfterHotkeyFit).toBeTruthy()

      await exportPage.keyboard.down(' ')
      const shellBox = await shell.boundingBox()
      expect(shellBox).toBeTruthy()
      await exportPage.mouse.move(shellBox.x + 40, shellBox.y + 40)
      await exportPage.mouse.down()
      await exportPage.mouse.move(shellBox.x + 90, shellBox.y + 75)
      await exportPage.mouse.up()
      await exportPage.keyboard.up(' ')

      const transformAfterSpacePan = await exportPage.locator('#html-export-tree-canvas').evaluate((element) => element.style.transform)
      expect(transformAfterSpacePan).not.toBe(transformAfterHotkeyFit)

      await exportPage.mouse.dblclick(shellBox.x + 20, shellBox.y + 20)
      const transformAfterDoubleClickFit = await exportPage.locator('#html-export-tree-canvas').evaluate((element) => element.style.transform)
      expect(transformAfterDoubleClickFit).toBeTruthy()

      await exportPage.locator('.html-export__menu-button').last().click()
      await expect(exportPage.locator('.html-export__menu-panel--filters')).toBeVisible()
      await exportPage.locator('#html-export-filter-release').selectOption('now')
      const transformAfter = await exportPage.locator('#html-export-tree-canvas').evaluate((element) => element.style.transform)

      await expect(exportPage.locator('#html-export-filter-release')).toHaveValue('now')
      expect(transformAfter).toBe(transformBefore)
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