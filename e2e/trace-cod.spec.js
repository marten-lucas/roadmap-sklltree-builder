import { test } from '@playwright/test'
import fs from 'node:fs'

test('trace COD scope changes', async ({ page }) => {
  // preload a previously exported document that contains the full tree (so COD exists)
  const exportedHtml = fs.readFileSync('tmp/e2e-exports/skilltree-roundtrip-1774241374085.html', 'utf-8')
  const jsonMatch = exportedHtml.match(/<script[^>]*id="skilltree-export-data"[^>]*>([\s\S]*?)<\/script>/i)
  if (jsonMatch && jsonMatch[1]) {
    const payload = jsonMatch[1].trim()
    await page.goto('/')
    await page.evaluate((p) => localStorage.setItem('roadmap-skilltree.document.v1', p), payload)
    await page.reload()
  } else {
    await page.goto('/')
  }
  await page.waitForSelector('foreignObject.skill-node-export-anchor', { timeout: 15_000 })

  // dump available nodes (labels + short names) for diagnosis
  const nodes = await page.locator('foreignObject.skill-node-export-anchor').evaluateAll((els) =>
    els.map((el) => ({ label: el.getAttribute('data-export-label'), shortName: el.getAttribute('data-short-name') })),
  )
  await fs.promises.mkdir('tmp/e2e-exports', { recursive: true })
  await fs.promises.writeFile(`tmp/e2e-exports/node-list-${Date.now()}.json`, JSON.stringify(nodes, null, 2), 'utf-8')

  const shortName = 'COD'
  const selector = `foreignObject.skill-node-export-anchor[data-short-name="${shortName}"] .skill-node-button`
  const node = page.locator(selector).first()
  await node.waitFor({ state: 'attached', timeout: 10_000 })
  await node.scrollIntoViewIfNeeded()
  await node.evaluate((el) => el.click())

  await page.waitForSelector('.skill-panel--inspector', { timeout: 10_000 })

  // attempt to set the scope to Corrugated via the inspector MultiSelect
  const scopeBlock = page.locator('.skill-panel__scope-block')
  const input = scopeBlock.getByPlaceholder('Scopes')
  await input.click()
  const opt = page.getByRole('option', { name: 'Corrugated', exact: true }).filter({ visible: true }).first()
  await opt.click({ force: true })

  // wait a short moment for app to persist state
  await page.waitForTimeout(500)

  const result = await page.evaluate(() => ({
    document: localStorage.getItem('roadmap-skilltree.document.v1'),
    scopeTrace: localStorage.getItem('roadmap-skilltree.e2e.scopeTrace'),
  }))

  fs.mkdirSync('tmp/e2e-exports', { recursive: true })
  fs.writeFileSync(`tmp/e2e-exports/cod-trace-${Date.now()}.json`, JSON.stringify(result, null, 2), 'utf-8')
})
