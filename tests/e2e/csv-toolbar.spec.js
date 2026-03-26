import { Buffer } from 'node:buffer'
import { expect, test } from '@playwright/test'
import { confirmAndReset, readDownload, startFresh } from './helpers.js'

const normalizeCsv = (csvText) => String(csvText ?? '').replace(/\r\n/g, '\n').trim()

test.describe('CSV toolbar flow', () => {
  test.beforeEach(async ({ page }) => {
    await startFresh(page)
  })

  test('exports and re-imports csv through the toolbar menus', async ({ page }) => {
    await page.getByRole('button', { name: 'Export', exact: true }).hover()
    const [csvDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: 'CSV', exact: true }).click(),
    ])
    const csvText = await readDownload(csvDownload)
    expect(csvText).toContain('ShortName,Name,Scope,Ebene,Segment,Parent,AdditionalDependency,ProgressLevel,Status,ReleaseNotes')

    await confirmAndReset(page)
    await expect(page.locator('foreignObject.skill-node-export-anchor')).toHaveCount(0)

    await page.getByRole('button', { name: 'HTML importieren', exact: true }).hover()
    await expect(page.getByRole('menuitem', { name: 'CSV', exact: true })).toBeVisible()
    const importCsvText = [
      'ShortName,Name,Scope,Ebene,Segment,Parent,AdditionalDependency,ProgressLevel,Status,ReleaseNotes',
      'ROOT,Root Node,Alpha,1,Core,,,1,now,"# Root note"',
      'CHD,Child Node,Beta,2,Core,ROOT,,1,next,"Child note"',
    ].join('\n')

    await page.locator('input[type="file"][accept="text/csv,.csv"]').setInputFiles({
      name: 'skilltree-import.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(importCsvText, 'utf-8'),
    })

    await expect(page.locator('foreignObject.skill-node-export-anchor')).toHaveCount(2)

    expect(normalizeCsv(csvText)).toContain('ShortName,Name,Scope,Ebene,Segment,Parent,AdditionalDependency,ProgressLevel,Status,ReleaseNotes')
  })
})
