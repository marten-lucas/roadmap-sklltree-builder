import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from '@playwright/test'
import { startFresh, importCsvViaToolbar } from './helpers.js'

const CSV_PATH = resolve(process.cwd(), 'tests/e2e/datasets/myKyana.csv')
const OUT = resolve(process.cwd(), 'tests/results/screenshots')

test('capture full import: segments=true, manualLevels=true', async ({ page }) => {
  mkdirSync(OUT, { recursive: true })
  await startFresh(page)
  const csv = readFileSync(CSV_PATH, 'utf-8')
  await importCsvViaToolbar(page, csv, { processSegments: true, processManualLevels: true })
  await page.waitForTimeout(800)
  await page.screenshot({ path: resolve(OUT, 'layout-full-import.png'), fullPage: false })

  const svgMarkup = await page.evaluate(() => {
    const canvas = document.querySelector('svg.skill-tree-canvas')
    return canvas ? canvas.outerHTML : ''
  })
  writeFileSync(resolve(OUT, 'layout-full-import.svg'), svgMarkup)
  console.log('Saved to', OUT)
})
