import { test } from '@playwright/test'
import fs from 'node:fs'
import { resolve } from 'node:path'

const e2eExportDir = resolve(process.env.SKILLTREE_E2E_EXPORT_DIR ?? 'tests/results/e2e-exports')

test('dump model trace', async ({ page }) => {
  const exportedHtmlPath = resolve(e2eExportDir, 'skilltree-roundtrip-1774241374085.html')
  if (fs.existsSync(exportedHtmlPath)) {
    const exportedHtml = fs.readFileSync(exportedHtmlPath, 'utf-8')
    const jsonMatch = exportedHtml.match(/<script[^>]*id="skilltree-export-data"[^>]*>([\s\S]*?)<\/script>/i)
    if (jsonMatch && jsonMatch[1]) {
      const payload = jsonMatch[1].trim()
      await page.goto('/')
      await page.evaluate((p) => localStorage.setItem('roadmap-skilltree.document.v1', p), payload)
      await page.reload()
    } else {
      await page.goto('/')
    }
  } else {
    await page.goto('/')
  }

  await page.waitForSelector('foreignObject.skill-node-export-anchor', { timeout: 15_000 })

  // select COD node and set scope to Corrugated to trigger model traces
  const shortName = 'COD'
  const selector = `foreignObject.skill-node-export-anchor[data-short-name="${shortName}"] .skill-node-button`
  const node = page.locator(selector).first()
  await node.waitFor({ state: 'attached', timeout: 10_000 })
  await node.scrollIntoViewIfNeeded()
  await node.evaluate((el) => el.click())

  await page.waitForSelector('.skill-panel--inspector', { timeout: 10_000 })

  const scopeBlock = page.locator('.skill-panel__scope-block')
  const input = scopeBlock.getByPlaceholder('Scopes')
  await input.click()
  const opt = page.getByRole('option', { name: 'Corrugated', exact: true }).filter({ visible: true }).first()
  await opt.click({ force: true })

  // wait a short moment for app to persist state and traces
  await page.waitForTimeout(500)

  const modelTrace = await page.evaluate(() => localStorage.getItem('roadmap-skilltree.e2e.modelTrace'))

  await fs.promises.mkdir(e2eExportDir, { recursive: true })
  await fs.promises.writeFile(resolve(e2eExportDir, `model-trace-${Date.now()}.json`), JSON.stringify({ modelTrace }, null, 2), 'utf-8')
})
