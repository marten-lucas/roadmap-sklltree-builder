/**
 * junction-dots.spec.js
 *
 * Validates that junction dots (split-dot circles) in the skill-tree canvas
 * obey the circuit-diagram rule:
 *
 *   A T-junction dot must ONLY appear where 2+ visible connection lines
 *   physically converge at the same point.  A dot on a single line with no
 *   visual branch is incorrect.
 *
 * Root cause the test guards against:
 *   Each sibling link in a shared-trunk cluster computes its own `corridorRadius`
 *   based on `segmentDistance` to the parent.  Siblings with different
 *   segmentDistance values receive different `splitPoint` coordinates — meaning
 *   their paths do NOT actually share a visual trunk.  Before the fix the canvas
 *   rendered a dot for every individual splitPoint regardless of how many visible
 *   lines actually passed through it, producing dots floating in the middle of
 *   single unbroken lines.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { expect, test } from '@playwright/test'
import { importCsvViaToolbar } from './helpers.js'

const JUNCTION_DOTS_CSV = readFileSync(
  resolve(process.cwd(), 'tests/e2e/datasets/layout-regression/junction-dots-fanout.csv'),
  'utf-8',
)

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the (cx, cy, r) of every junction dot currently in the canvas, plus
 * the count of connection-line <path> elements whose rendered geometry passes
 * within `tolerance` pixels of the dot centre.
 */
const collectJunctionDotMetrics = (page, tolerance = 6) =>
  page.evaluate((tol) => {
    const dots = Array.from(
      document.querySelectorAll('svg.skill-tree-canvas [data-split-dot-key]'),
    ).map((el) => ({
      key: el.getAttribute('data-split-dot-key'),
      cx: Number(el.getAttribute('cx')),
      cy: Number(el.getAttribute('cy')),
      r: Number(el.getAttribute('r')),
    }))

    const paths = Array.from(
      document.querySelectorAll(
        'svg.skill-tree-canvas [data-link-source-id][data-link-target-id]',
      ),
    )

    return dots.map((dot) => {
      let passingCount = 0

      for (const pathEl of paths) {
        const totalLen = pathEl.getTotalLength()
        if (totalLen < 1) continue
        const steps = Math.max(30, Math.ceil(totalLen / 8))

        for (let i = 0; i <= steps; i++) {
          const pt = pathEl.getPointAtLength((i / steps) * totalLen)
          if (Math.hypot(pt.x - dot.cx, pt.y - dot.cy) < tol) {
            passingCount++
            break // one path counts once
          }
        }
      }

      return { ...dot, passingCount }
    })
  }, tolerance)

// ── tests ─────────────────────────────────────────────────────────────────────

test.describe('junction-dots placement', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('svg.skill-tree-canvas', { timeout: 10_000 })
  })

  test('every junction dot has 2+ connection lines passing through it', async ({
    page,
  }) => {
    await importCsvViaToolbar(page, JUNCTION_DOTS_CSV)
    await page.waitForTimeout(400)

    const metrics = await collectJunctionDotMetrics(page)

    // The rule: a dot with fewer than 2 passing lines is a false junction.
    for (const dot of metrics) {
      expect(
        dot.passingCount,
        `Junction dot "${dot.key}" at (${dot.cx.toFixed(0)}, ${dot.cy.toFixed(0)}) has only ${dot.passingCount} line(s) passing through it — expected ≥ 2 (circuit-diagram T-junction rule)`,
      ).toBeGreaterThanOrEqual(2)
    }
  })

  test('snapshot – junction dots visible on shared-trunk fanout', async ({
    page,
  }, testInfo) => {
    await importCsvViaToolbar(page, JUNCTION_DOTS_CSV)
    await page.waitForTimeout(400)

    const metrics = await collectJunctionDotMetrics(page)

    // Record the dot count and positions in the test attachment for human review.
    await testInfo.attach('junction-dot-metrics', {
      body: JSON.stringify(metrics, null, 2),
      contentType: 'application/json',
    })

    await testInfo.attach('canvas-screenshot', {
      body: await page.screenshot({ fullPage: false }),
      contentType: 'image/png',
    })
  })
})
