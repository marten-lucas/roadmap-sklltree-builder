import { resolve } from 'node:path'
import process from 'node:process'
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { startFresh, exportHtml } from './helpers.js'

const KYANA_ICON_PATH = resolve(process.cwd(), 'tests/e2e/datasets/Kyana_Visual_final.svg')

test.describe('HTML export center icon SVG parity', () => {
  test('keeps imported Kyana SVG icon scaled to center hit area in export viewer', async ({ page, browser }) => {
    await startFresh(page)

    const iconSvgText = readFileSync(KYANA_ICON_PATH, 'utf-8')
    const iconDataUrl = `data:image/svg+xml;base64,${Buffer.from(iconSvgText, 'utf-8').toString('base64')}`

    await page.evaluate((nextIconDataUrl) => {
      const raw = localStorage.getItem('roadmap-skilltree.document.v1')
      if (!raw) {
        throw new Error('No persisted roadmap document found in localStorage')
      }

      const parsed = JSON.parse(raw)
      parsed.document = {
        ...(parsed.document ?? {}),
        centerIconSrc: nextIconDataUrl,
      }

      localStorage.setItem('roadmap-skilltree.document.v1', JSON.stringify(parsed))
    }, iconDataUrl)

    await page.reload()
    await page.waitForSelector('svg.skill-tree-canvas', { timeout: 10_000 })

    await expect.poll(async () => {
      return page.evaluate(() => {
        const raw = localStorage.getItem('roadmap-skilltree.document.v1')
        if (!raw) return false

        try {
          const parsed = JSON.parse(raw)
          return String(parsed?.document?.centerIconSrc ?? '').startsWith('data:image/svg+xml')
        } catch {
          return false
        }
      })
    }, { timeout: 10_000 }).toBe(true)

    const html = await exportHtml(page)
    expect(html).toContain('class="skill-tree-center-icon__image"')

    const exportContext = await browser.newContext()
    const exportPage = await exportContext.newPage()

    try {
      await exportPage.setContent(html)
      await exportPage.waitForSelector('#html-export-tree-canvas svg', { timeout: 10_000 })

      const boxes = await exportPage.evaluate(() => {
        const centerImage = document.querySelector('#html-export-tree-canvas .skill-tree-center-icon__image')
        const hitArea = document.querySelector('#html-export-tree-canvas .skill-tree-center-icon__hit-area')
        if (!centerImage || !hitArea) {
          return null
        }

        const imageBox = centerImage.getBoundingClientRect()
        const hitBox = hitArea.getBoundingClientRect()

        return {
          imageWidth: imageBox.width,
          imageHeight: imageBox.height,
          hitWidth: hitBox.width,
          hitHeight: hitBox.height,
        }
      })

      expect(boxes).toBeTruthy()

      const imageWidth = boxes?.imageWidth ?? 0
      const imageHeight = boxes?.imageHeight ?? 0
      const hitWidth = boxes?.hitWidth ?? 1
      const hitHeight = boxes?.hitHeight ?? 1

      expect(imageWidth).toBeGreaterThan(hitWidth * 0.35)
      expect(imageHeight).toBeGreaterThan(hitHeight * 0.35)
      expect(imageWidth).toBeLessThan(hitWidth * 1.2)
      expect(imageHeight).toBeLessThan(hitHeight * 1.2)
    } finally {
      await exportPage.close()
      await exportContext.close()
    }
  })
})
