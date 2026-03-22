import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { expect, test } from '@playwright/test'
import {
  applyNodeIdentity,
  applyNodeSettings,
  buildActualNodeMapFromDocument,
  buildExpectedNodeMapFromRows,
  clickChildAddForSelectedNode,
  clickInitialRootAddControl,
  clickInitialSegmentAddControl,
  clickRootAddNearSelected,
  clickSegmentAddNearSelected,
  confirmAndReset,
  ensureScopesExist,
  extractJsonPayload,
  parseSkillTreeCsvTemplate,
  persistTextFile,
  readDownload,
  selectSegmentByLabel,
  selectNodeByLabel,
  getBuilderNodeLabels,
  setSelectValueByLabel,
  setSelectedSegmentName,
  trySetSelectValueByLabel,
} from './helpers.js'

const csvTemplatePath = process.env.SKILLTREE_E2E_TEMPLATE_CSV
  ? resolve(process.env.SKILLTREE_E2E_TEMPLATE_CSV)
  : resolve(process.cwd(), 'tmp/graph example.csv')

const exportOutputDir = process.env.SKILLTREE_E2E_EXPORT_DIR
  ? resolve(process.env.SKILLTREE_E2E_EXPORT_DIR)
  : resolve(process.cwd(), 'tmp/e2e-exports')

const ignoreManualLevels = process.env.SKILLTREE_E2E_IGNORE_MANUAL_LEVELS === '1'

const persistHtmlExport = (htmlText) => {
  const fileName = `skilltree-roundtrip-${Date.now()}.html`
  const exportPath = resolve(exportOutputDir, fileName)
  persistTextFile(exportPath, htmlText)
  return exportPath
}

test.describe('CSV template roundtrip via builder UI', () => {
  test('creates the tree from CSV, exports HTML, imports it again, and preserves structure + settings', async ({ page }) => {
    test.setTimeout(300_000)
    test.skip(!existsSync(csvTemplatePath), `CSV template not found: ${csvTemplatePath}`)

    const csvText = readFileSync(csvTemplatePath, 'utf-8')
    const template = parseSkillTreeCsvTemplate(csvText)

    await page.goto('/')
    await confirmAndReset(page)
    await expect(page.locator('foreignObject.skill-node-export-anchor')).toHaveCount(0)

    expect(template.segments.length).toBeGreaterThan(0)
    await clickInitialSegmentAddControl(page)
    await setSelectedSegmentName(page, template.segments[0])

    for (const segmentName of template.segments.slice(1)) {
      await clickSegmentAddNearSelected(page)
      await setSelectedSegmentName(page, segmentName)
    }

    // Reconcile segment creation in case one insertion was missed.
    for (const segmentName of template.segments) {
      const existingSegmentCount = await page
        .locator('.skill-tree-segment-label', { hasText: segmentName })
        .count()

      if (existingSegmentCount === 0) {
        await selectSegmentByLabel(page, template.segments[0])
        await clickSegmentAddNearSelected(page)
        await setSelectedSegmentName(page, segmentName)
      }
    }

    expect(template.roots.length).toBeGreaterThan(0)
    await clickInitialRootAddControl(page)
    await applyNodeIdentity(page, template.roots[0])
    await setSelectValueByLabel(page, 'Segment', template.roots[0].segment)
    await ensureScopesExist(page, template.rows.map((row) => row.scope))

    const ensureNodeExistsByLabel = async (label) => {
      const existingCount = await page
        .locator(`foreignObject.skill-node-export-anchor[data-export-label="${label}"]`)
        .count()

      if (existingCount > 0) {
        return
      }

      const row = template.rows.find((entry) => entry.label === label)
      expect(row, `Missing CSV row for ${label}`).toBeTruthy()

      await selectNodeByLabel(page, template.roots[0].label)
      await clickRootAddNearSelected(page)
      await applyNodeIdentity(page, row)
    }

    for (let index = 1; index < template.roots.length; index += 1) {
      await selectNodeByLabel(page, template.roots[0].label)
      await clickRootAddNearSelected(page)
      await applyNodeIdentity(page, template.roots[index])
    }

    // Reconcile root creation in case one insertion was missed due dynamic layout updates.
    for (const rootRow of template.roots) {
      const existingCount = await page
        .locator(`foreignObject.skill-node-export-anchor[data-export-label="${rootRow.label}"]`)
        .count()

      if (existingCount === 0) {
        await selectNodeByLabel(page, template.roots[0].label)
        await clickRootAddNearSelected(page)
        await applyNodeIdentity(page, rootRow)
      }
    }

    for (const row of template.children) {
      await ensureNodeExistsByLabel(row.parentLabel)
      await selectNodeByLabel(page, row.parentLabel)
      await clickChildAddForSelectedNode(page)
      await applyNodeIdentity(page, row)
    }

    // Set all node settings sequentially after structure creation.
    const rowsByLabel = new Map(template.rows.map((row) => [row.label, row]))
    const computedLevelByLabel = new Map()
    const computeLevelFromParent = (row, stack = new Set()) => {
      if (computedLevelByLabel.has(row.label)) {
        return computedLevelByLabel.get(row.label)
      }

      if (stack.has(row.label)) {
        return 1
      }

      stack.add(row.label)
      const parent = row.parentLabel ? rowsByLabel.get(row.parentLabel) : null
      const level = parent ? computeLevelFromParent(parent, stack) + 1 : 1
      stack.delete(row.label)
      computedLevelByLabel.set(row.label, level)
      return level
    }

    const rowsForSettings = [...template.rows].sort((left, right) => {
      const leftLevel = ignoreManualLevels ? computeLevelFromParent(left) : left.level
      const rightLevel = ignoreManualLevels ? computeLevelFromParent(right) : right.level
      if (leftLevel !== rightLevel) {
        return leftLevel - rightLevel
      }
      return left.order - right.order
    })

    for (const row of rowsForSettings) {
      await ensureNodeExistsByLabel(row.label)
      await selectNodeByLabel(page, row.label)
      await applyNodeSettings(page, row, { ignoreManualLevels })
    }

    // Final segment alignment pass once hierarchy and levels are fully settled.
    for (const row of rowsForSettings) {
      await selectNodeByLabel(page, row.label)
      await trySetSelectValueByLabel(page, 'Segment', row.segment)
    }

    const expectedLabels = template.rows.map((row) => row.label)
    const actualLabels = (await getBuilderNodeLabels(page)).filter(Boolean)
    const actualLabelSet = new Set(actualLabels)
    const missingLabels = expectedLabels.filter((label) => !actualLabelSet.has(label))

    if (missingLabels.length > 0) {
      console.log('[csv-roundtrip] Missing node labels before export:', missingLabels)
      console.log('[csv-roundtrip] Builder currently has labels:', actualLabels)
      console.log('[csv-roundtrip] Expected node count:', expectedLabels.length)
      console.log('[csv-roundtrip] Actual node count:', actualLabels.length)
    }

    await expect(page.locator('foreignObject.skill-node-export-anchor')).toHaveCount(template.rows.length)

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export', exact: true }).click(),
    ])
    const exportedHtml = await readDownload(download)
    const persistedExportPath = persistHtmlExport(exportedHtml)

    expect(existsSync(persistedExportPath)).toBe(true)

    await confirmAndReset(page)
    await expect(page.locator('foreignObject.skill-node-export-anchor')).toHaveCount(0)

    await page.locator('input[type="file"][accept="text/html,.html"]').setInputFiles(persistedExportPath)
    await expect(page.locator('foreignObject.skill-node-export-anchor')).toHaveCount(template.rows.length)

    const [importedDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export', exact: true }).click(),
    ])
    const importedHtml = await readDownload(importedDownload)
    const payload = extractJsonPayload(importedHtml)

    const expectedNodesByShortName = buildExpectedNodeMapFromRows(template.rows, {
      ignoreManualLevels,
    })
    const actualNodesByShortName = buildActualNodeMapFromDocument(payload.document)

    expect(actualNodesByShortName.size).toBe(expectedNodesByShortName.size)

    for (const [label, expectedNode] of expectedNodesByShortName.entries()) {
      const actualNode = actualNodesByShortName.get(label)
      expect(actualNode, `Missing node after import: ${label}`).toBeTruthy()

      expect(actualNode.shortName, `Shortname mismatch for ${label}`).toBe(expectedNode.shortName)
      expect(actualNode.label, `Label mismatch for ${label}`).toBe(expectedNode.label)
      if (!ignoreManualLevels) {
        expect(actualNode.level, `Level mismatch for ${label}`).toBe(expectedNode.level)
      }
      expect(actualNode.segment, `Segment mismatch for ${label}`).toBe(expectedNode.segment)
      expect(actualNode.scope, `Scope mismatch for ${label}`).toBe(expectedNode.scope)
      expect(actualNode.parentLabel, `Parent mismatch for ${label}`).toBe(expectedNode.parentLabel)
      expect(actualNode.status, `Status mismatch for ${label}`).toBe(expectedNode.status)
    }

    // The parser may downgrade dangling parents to roots in non-strict mode.
    expect(Array.isArray(template.warnings)).toBe(true)
  })
})
