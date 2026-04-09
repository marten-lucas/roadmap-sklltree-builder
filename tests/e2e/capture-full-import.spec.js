import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from '@playwright/test'
import { startFresh, importCsvViaToolbar } from './helpers.js'

const CSV_PATH = resolve(process.cwd(), 'tests/e2e/datasets/myKyana.csv')
const OUT = resolve(process.cwd(), 'tests/results/screenshots')

test('capture full import v2: after level-inversion fix', async ({ page }) => {
  mkdirSync(OUT, { recursive: true })
  await startFresh(page)
  const csv = readFileSync(CSV_PATH, 'utf-8')
  await importCsvViaToolbar(page, csv, { processSegments: true, processManualLevels: false })
  await page.waitForTimeout(800)
  // Fit to screen so the full tree is visible
  const fitButton = page.getByRole('button', { name: 'Fit to screen' }).first()
  if (await fitButton.isVisible()) {
    await fitButton.click()
    await page.waitForTimeout(400)
  }
  await page.screenshot({ path: resolve(OUT, 'layout-full-import-v2.png'), fullPage: false })
  const svgMarkup = await page.evaluate(() => {
    const canvas = document.querySelector('svg.skill-tree-canvas')
    return canvas ? canvas.outerHTML : ''
  })
  writeFileSync(resolve(OUT, 'layout-full-import-v2.svg'), svgMarkup)
  console.log('Saved to', OUT)
})
