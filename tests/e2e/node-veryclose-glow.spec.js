import { test, expect } from '@playwright/test'
import { startFresh, importCsvViaToolbar, confirmAndReset } from './helpers.js'

// Minimal CSV: one root node with status "next" (cyan glow) so the ring/glow color is vivid
const MINIMAL_CSV = [
  'ShortName,Name,Scope,Ebene,Segment,Parent,AdditionalDependency,ProgressLevel,Status,ReleaseNotes',
  'ROOT,Root Node,,1,Core,,,1,next,""',
  'CHILD,Child Node,,2,Core,ROOT,,1,next,""',
].join('\n')

test.describe('very-close node glow visual regression', () => {
  test.use({ viewport: { width: 900, height: 700 } })

  test('rectangle node has rounded-rect glow matching the ring color', async ({ page }) => {
    // Start fresh with default data, then reset to blank and import our minimal CSV
    await startFresh(page)
    await confirmAndReset(page)

    // Import CSV
    await importCsvViaToolbar(page, MINIMAL_CSV)

    // Find the CHILD node anchor
    const anchor = page.locator('foreignObject.skill-node-export-anchor[data-export-label="Child Node"]')
    await expect(anchor).toBeAttached({ timeout: 10_000 })

    // Get node centre in viewport coords before zooming
    const nodeBBoxBefore = await anchor.boundingBox()
    expect(nodeBBoxBefore).toBeTruthy()
    const cx = nodeBBoxBefore.x + nodeBBoxBefore.width / 2
    const cy = nodeBBoxBefore.y + nodeBBoxBefore.height / 2

    // Zoom in via wheel events toward the node centre.
    // Custom handler: step = 0.003 * sqrt(scale), ratio = exp(step * 100).
    // From ~0.75x initial scale, ~5 ticks reach scale >= 2.0 (very-close threshold).
    // Use 10 ticks to reliably reach scale >= 4x.
    await page.mouse.move(cx, cy)
    for (let i = 0; i < 10; i++) {
      await page.mouse.wheel(0, -100)
      await page.waitForTimeout(60)
    }

    // Wait for React onTransformed → labelMode update → very-close class
    const nodeDiv = page.locator('.skill-node-foreign--veryclose').first()
    await expect(nodeDiv).toBeVisible({ timeout: 5_000 })

    // Verify the level-ring is visible and extends outside the button (inset: -5px)
    const levelRingInset = await nodeDiv.locator('.skill-node-level-ring').evaluate((el) => {
      const s = window.getComputedStyle(el)
      return { top: s.top, display: s.display }
    })
    expect(levelRingInset.display).not.toBe('none')

    // Screenshot of the node area for visual regression (capture glow halo too)
    const nodeBBoxAfter = await anchor.boundingBox()
    const PAD = 60
    const clip = {
      x: Math.max(0, nodeBBoxAfter.x - PAD),
      y: Math.max(0, nodeBBoxAfter.y - PAD),
      width: nodeBBoxAfter.width + PAD * 2,
      height: nodeBBoxAfter.height + PAD * 2,
    }

    await expect(page).toHaveScreenshot('node-veryclose-glow.png', {
      clip,
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    })
  })
})
