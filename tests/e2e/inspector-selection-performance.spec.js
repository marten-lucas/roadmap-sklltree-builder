import { test, expect } from '@playwright/test'
import { resolve } from 'node:path'
import { startFresh } from './helpers.js'

const MYKYANA_JSON_PATH = resolve(process.cwd(), 'tests/e2e/datasets/myKyana_2026-04-27_06-09.json')
const INSPECTOR_OPEN_BUDGET_MS = 1500

test.describe('Inspector selection performance', () => {
  test.use({ viewport: { width: 1600, height: 1000 } })

  test('opens inspector within 1.5s after selecting a node on myKyana JSON import', async ({ page }) => {
    await startFresh(page)

    await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(MYKYANA_JSON_PATH)

    const firstNodeButton = page.locator('foreignObject.skill-node-export-anchor .skill-node-button').first()
    await expect(firstNodeButton).toBeVisible({ timeout: 20_000 })

    // Wait for post-import fit/layout timers to settle before measuring selection latency.
    await page.waitForTimeout(700)

    const inspector = page.locator('.skill-panel--inspector')
    await expect(inspector).toBeHidden({ timeout: 5_000 })

    await page.evaluate((budgetMs) => {
      const isButton = (target) => target instanceof Element && Boolean(target.closest('.skill-node-button'))

      window.__inspectorPerfPromise = new Promise((resolve) => {
        let clickDetected = false
        let done = false

        const finish = (payload) => {
          if (done) return
          done = true
          document.removeEventListener('click', onClickCapture, true)
          clearTimeout(clickWaitTimeoutId)
          if (observer) observer.disconnect()
          if (pollId) clearInterval(pollId)
          if (resultTimeoutId) clearTimeout(resultTimeoutId)
          resolve(payload)
        }

        const checkNow = () => {
          const elapsedMs = performance.now() - start
          const inspectorElement = document.querySelector('.skill-panel--inspector')
          if (inspectorElement) {
            finish({ ok: true, elapsedMs })
          }
        }

        let observer = null
        let pollId = null
        let resultTimeoutId = null
        let start = 0

        const onClickCapture = (event) => {
          if (clickDetected || !isButton(event.target)) {
            return
          }

          clickDetected = true
          start = performance.now()

          observer = new MutationObserver(checkNow)
          observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style', 'class', 'data-selected-node-id'],
          })

          pollId = setInterval(checkNow, 8)
          resultTimeoutId = setTimeout(() => {
            const elapsedMs = performance.now() - start
            finish({ ok: false, elapsedMs, reason: 'timeout' })
          }, budgetMs)

          checkNow()
        }

        document.addEventListener('click', onClickCapture, true)

        const clickWaitTimeoutId = setTimeout(() => {
          if (!clickDetected) {
            finish({ ok: false, elapsedMs: Number.POSITIVE_INFINITY, reason: 'click-not-detected' })
          }
        }, budgetMs + 1000)
      })
    }, INSPECTOR_OPEN_BUDGET_MS)

    await firstNodeButton.click({ force: true })

    const result = await page.evaluate(() => window.__inspectorPerfPromise)

    expect(result.ok, `Inspector open timed out in ${Math.round(result.elapsedMs)}ms (${result.reason ?? 'unknown'})`).toBe(true)
    expect(result.elapsedMs).toBeLessThanOrEqual(INSPECTOR_OPEN_BUDGET_MS)
  })
})
