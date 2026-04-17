import { Buffer } from 'node:buffer'
import { expect, test } from '@playwright/test'
import { confirmAndReset, readDownload, startFresh } from './helpers.js'

const normalizeCsv = (csvText) => String(csvText ?? '').replace(/\r\n/g, '\n').trim()

const findNodeByShortName = (nodes, shortName) => {
  for (const node of nodes ?? []) {
    if (node.shortName === shortName) {
      return node
    }

    const childMatch = findNodeByShortName(node.children, shortName)
    if (childMatch) {
      return childMatch
    }
  }

  return null
}

test.describe('CSV toolbar flow', () => {
  test.beforeEach(async ({ page }) => {
    await startFresh(page)
  })

  test('exports and re-imports csv through the toolbar menus', async ({ page }) => {
    const pageErrors = []
    page.on('pageerror', (error) => {
      pageErrors.push(error)
    })

    await page.getByRole('button', { name: 'Export', exact: true }).hover()
    const [csvDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: 'CSV', exact: true }).click(),
    ])
    const csvText = await readDownload(csvDownload)
    expect(csvText).toContain('ShortName,Name,Scope,Ebene,Segment,Parent,AdditionalDependency,ProgressLevel,Status,ReleaseNotes')

    await confirmAndReset(page)
    await expect(page.locator('foreignObject.skill-node-export-anchor')).toHaveCount(0)

    await page.getByRole('button', { name: /HTML importieren|Import HTML/i }).first().hover()
    await expect(page.getByRole('menuitem', { name: 'CSV', exact: true })).toBeVisible()
    const importCsvText = [
      'ShortName,Name,Scope,Ebene,Segment,Parent,AdditionalDependency,ProgressLevel,Status,ReleaseNotes',
      'ROOT,Root Node,Alpha,9,Core,,,1,now,"# Root note"',
      'CHD,Child Node,Beta,7,Core,ROOT,,1,next,"Child note"',
    ].join('\n')

    await page.locator('input[type="file"][accept="text/csv,.csv"]').setInputFiles({
      name: 'skilltree-import.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(importCsvText, 'utf-8'),
    })

    const dialog = page.getByRole('dialog').filter({
      has: page.getByRole('heading', { name: /CSV Import Options|CSV-Import Optionen/i }),
    })
    await expect(dialog).toBeVisible()

    const segmentsCheckbox = dialog.getByRole('checkbox', { name: /Process segments|Segmente verarbeiten/i })
    await expect(segmentsCheckbox).toBeChecked()
    await segmentsCheckbox.click()
    await expect(segmentsCheckbox).not.toBeChecked()
    await segmentsCheckbox.click()
    await expect(segmentsCheckbox).toBeChecked()

    expect(pageErrors).toHaveLength(0)

    await page.evaluate(() => {
      const dialogRoot = document.querySelector('[role="dialog"]')
      const buttons = Array.from(dialogRoot?.querySelectorAll('button') ?? [])
      buttons.at(-1)?.click()
    })

    await expect(dialog).toBeHidden()

    await page.waitForTimeout(700)
    const persistedDocument = await page.evaluate(() => {
      const raw = localStorage.getItem('roadmap-skilltree.document.v1')
      if (!raw) {
        return null
      }

      return JSON.parse(raw).document
    })

    const rootNode = findNodeByShortName(persistedDocument?.children, 'ROOT')
    const childNode = findNodeByShortName(persistedDocument?.children, 'CHD')

    expect(rootNode?.shortName).toBe('ROOT')
    expect(childNode?.shortName).toBe('CHD')
    expect(rootNode?.label).toBe('Root Node')
    expect(childNode?.label).toBe('Child Node')

    expect(normalizeCsv(csvText)).toContain('ShortName,Name,Scope,Ebene,Segment,Parent,AdditionalDependency,ProgressLevel,Status,ReleaseNotes')
  })

  test('accepts all supported import formats from the direct import action', async ({ page }) => {
    const importCsvText = [
      'ShortName,Name,Scope,Ebene,Segment,Parent,AdditionalDependency,ProgressLevel,Status,ReleaseNotes',
      'ROOT,Root Node,Alpha,9,Core,,,1,now,"# Root note"',
    ].join('\n')

    const directImportButton = page.getByRole('button', { name: /HTML importieren|Import HTML/i }).first()
    await expect(directImportButton).toBeVisible()
    await directImportButton.click()

    const combinedImportInput = page.locator('input[type="file"][accept="text/html,.html,text/csv,.csv,application/json,.json"]')
    await expect(combinedImportInput).toHaveCount(1)

    await combinedImportInput.setInputFiles({
      name: 'skilltree-import.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(importCsvText, 'utf-8'),
    })

    const dialog = page.getByRole('dialog').filter({
      has: page.getByRole('heading', { name: /CSV Import Options|CSV-Import Optionen/i }),
    })
    await expect(dialog).toBeVisible()
  })
})
