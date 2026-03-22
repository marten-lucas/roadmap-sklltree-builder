import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { expect, test } from '@playwright/test'
import {
  applyNodeIdentity,
  applyNodeSettings,
  clickChildAddForSelectedNode,
  clickInitialRootAddControl,
  clickInitialSegmentAddControl,
  clickRootAddNearSelected,
  clickSegmentAddNearSelected,
  confirmAndReset,
  ensureScopesExist,
  extractJsonPayload,
  getSelectedNodeId,
  parseSkillTreeCsvTemplate,
  persistTextFile,
  readDownload,
  selectSegmentByLabel,
  selectNodeById,
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

const normalizeUiShortName = (value, fallbackLabel = 'Skill') => {
  const compact = String(value ?? '')
    .slice(0, 3)
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()

  if (compact.length > 0) {
    return compact
  }

  const letters = String(fallbackLabel ?? '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, 3)

  return letters || 'NEW'
}

const collectActualNodeSnapshots = (document) => {
  const segmentsById = new Map((document.segments ?? []).map((segment) => [segment.id, segment.label]))
  const scopesById = new Map((document.scopes ?? []).map((scope) => [scope.id, scope.label]))
  const snapshots = []

  const visit = (nodes, parentNode = null) => {
    for (const node of nodes ?? []) {
      const status = String(node.levels?.[0]?.status ?? node.status ?? 'later').trim().toLowerCase()
      const primaryScopeId = Array.isArray(node.levels?.[0]?.scopeIds)
        ? node.levels[0].scopeIds[0] ?? null
        : null

      snapshots.push({
        shortName: String(node.shortName ?? '').trim(),
        label: node.label,
        level: Number(node.ebene),
        segment: segmentsById.get(node.segmentId ?? null) ?? null,
        scope: primaryScopeId ? scopesById.get(primaryScopeId) ?? null : null,
        parentLabel: parentNode?.label ?? null,
        status,
      })

      visit(node.children, node)
    }
  }

  visit(document.children ?? [])
  return snapshots
}

const collectExpectedNodeSnapshots = (rows, options = {}) => {
  const { ignoreManualLevels = false } = options
  const rowsByShortName = new Map(rows.map((row) => [row.shortName, row]))
  const computedLevels = new Map()

  const computeLevel = (row, stack = new Set()) => {
    if (!ignoreManualLevels) {
      return row.level
    }

    if (computedLevels.has(row.shortName)) {
      return computedLevels.get(row.shortName)
    }

    if (stack.has(row.shortName)) {
      return 1
    }

    stack.add(row.shortName)
    const parent = row.parentShortName ? rowsByShortName.get(row.parentShortName) : null
    const level = parent ? computeLevel(parent, stack) + 1 : 1
    stack.delete(row.shortName)
    computedLevels.set(row.shortName, level)
    return level
  }

  return rows.map((row) => ({
    shortName: normalizeUiShortName(row.shortName, row.label),
    label: row.label,
    level: computeLevel(row),
    segment: row.segment,
    scope: row.scope,
    parentLabel: row.parentLabel,
    status: row.status,
  }))
}

const toSnapshotKey = (snapshot) => JSON.stringify(snapshot)

const toComparableSnapshot = (snapshot) => ({
  shortName: snapshot.shortName,
  label: snapshot.label,
  level: snapshot.level,
  parentLabel: snapshot.parentLabel,
  status: snapshot.status,
})

test.describe('CSV template roundtrip via builder UI', () => {
  test('creates the tree from CSV, exports HTML, imports it again, and preserves structure + settings', async ({ page }) => {
    test.setTimeout(300_000)
    test.skip(!existsSync(csvTemplatePath), `CSV template not found: ${csvTemplatePath}`)

    const csvText = readFileSync(csvTemplatePath, 'utf-8')
    const template = parseSkillTreeCsvTemplate(csvText)
    const rowsByCsvShortName = new Map(template.rows.map((row) => [row.shortName, row]))
    const nodeIdByCsvShortName = new Map()

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
    nodeIdByCsvShortName.set(template.roots[0].shortName, await getSelectedNodeId(page))
    await setSelectValueByLabel(page, 'Segment', template.roots[0].segment)
    await ensureScopesExist(page, template.rows.map((row) => row.scope))

    const waitForNewSelectedNode = async (previousNodeId) => {
      await page.waitForFunction(
        (expectedPreviousNodeId) => {
          const inspector = document.querySelector('.skill-panel--inspector')
          return inspector && inspector.getAttribute('data-selected-node-id') !== expectedPreviousNodeId
        },
        previousNodeId,
        { timeout: 10_000 },
      )
      return getSelectedNodeId(page)
    }

    const createNodeFromSelected = async (previousNodeId, triggerCreate) => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await triggerCreate()
        try {
          return await waitForNewSelectedNode(previousNodeId)
        } catch (error) {
          if (attempt === 1) {
            throw error
          }
          await selectNodeById(page, previousNodeId)
        }
      }

      throw new Error(`Failed to create a new node from ${previousNodeId}`)
    }

    for (let index = 1; index < template.roots.length; index += 1) {
      const anchorRootNodeId = nodeIdByCsvShortName.get(template.roots[0].shortName)
      await selectNodeById(page, anchorRootNodeId)
      await createNodeFromSelected(anchorRootNodeId, () => clickRootAddNearSelected(page))
      await applyNodeIdentity(page, template.roots[index])
      nodeIdByCsvShortName.set(template.roots[index].shortName, await getSelectedNodeId(page))
    }

    for (const rootRow of template.roots) {
      if (!nodeIdByCsvShortName.has(rootRow.shortName)) {
        const anchorRootNodeId = nodeIdByCsvShortName.get(template.roots[0].shortName)
        await selectNodeById(page, anchorRootNodeId)
        await createNodeFromSelected(anchorRootNodeId, () => clickRootAddNearSelected(page))
        await applyNodeIdentity(page, rootRow)
        nodeIdByCsvShortName.set(rootRow.shortName, await getSelectedNodeId(page))
      }
    }

    for (const row of template.children) {
      const parentRow = rowsByCsvShortName.get(row.parentShortName)
      expect(parentRow, `Missing parent CSV row for ${row.shortName}`).toBeTruthy()

      const parentNodeId = nodeIdByCsvShortName.get(row.parentShortName)
      expect(parentNodeId, `Parent node was not created for ${row.shortName}`).toBeTruthy()

      await selectNodeById(page, parentNodeId)
      try {
        await createNodeFromSelected(parentNodeId, () => clickChildAddForSelectedNode(page))
      } catch (error) {
        throw new Error(
          `Failed to create child ${row.shortName} (${row.label}) under ${row.parentShortName} (${row.parentLabel}): ${error.message}`,
        )
      }
      await applyNodeIdentity(page, row)
      nodeIdByCsvShortName.set(row.shortName, await getSelectedNodeId(page))
    }

    const computedLevelByShortName = new Map()
    const computeLevelFromParent = (row, stack = new Set()) => {
      const shortName = row.shortName

      if (computedLevelByShortName.has(shortName)) {
        return computedLevelByShortName.get(shortName)
      }

      if (stack.has(shortName)) {
        return 1
      }

      stack.add(shortName)
      const parent = row.parentShortName
        ? rowsByCsvShortName.get(row.parentShortName)
        : null
      const level = parent ? computeLevelFromParent(parent, stack) + 1 : 1
      stack.delete(shortName)
      computedLevelByShortName.set(shortName, level)
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
      const nodeId = nodeIdByCsvShortName.get(row.shortName)
      expect(nodeId, `Node was not created for ${row.shortName}`).toBeTruthy()
      await selectNodeById(page, nodeId)
      await applyNodeSettings(page, row, { ignoreManualLevels })
    }

    for (const row of rowsForSettings) {
      const nodeId = nodeIdByCsvShortName.get(row.shortName)
      expect(nodeId, `Node was not created for ${row.shortName}`).toBeTruthy()
      await selectNodeById(page, nodeId)
      await trySetSelectValueByLabel(page, 'Segment', row.segment)
    }

    const actualCount = await page.locator('foreignObject.skill-node-export-anchor').count()
    const actualNodes = await page.locator('foreignObject.skill-node-export-anchor').evaluateAll((elements) => (
      elements.map((element) => ({
        nodeId: element.getAttribute('data-node-id'),
        label: element.getAttribute('data-export-label'),
        shortName: element.getAttribute('data-short-name'),
      }))
    ))
    const missingRows = actualCount === template.rows.length
      ? []
      : template.rows
        .filter((row) => !nodeIdByCsvShortName.has(row.shortName))
        .map((row) => ({
          shortName: row.shortName,
          label: row.label,
          parentShortName: row.parentShortName,
        }))

    if (missingRows.length > 0) {
      const debugInfo = {
        missingRows,
        actualNodes,
        expectedCount: template.rows.length,
        actualCount,
      }
      persistTextFile(
        resolve(exportOutputDir, 'missing-nodes-debug.json'),
        JSON.stringify(debugInfo, null, 2),
      )
    }

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export', exact: true }).click(),
    ])
    const exportedHtml = await readDownload(download)
    const persistedExportPath = persistHtmlExport(exportedHtml)
    const exportedPayload = extractJsonPayload(exportedHtml)
    const actualExportedSnapshots = collectActualNodeSnapshots(exportedPayload.document)

    expect(actualExportedSnapshots).toHaveLength(template.rows.length)

    expect(existsSync(persistedExportPath)).toBe(true)

    await confirmAndReset(page)
    await expect(page.locator('foreignObject.skill-node-export-anchor')).toHaveCount(0)

    await page.locator('input[type="file"][accept="text/html,.html"]').setInputFiles(persistedExportPath)
    await page.waitForSelector('foreignObject.skill-node-export-anchor', { timeout: 10_000 })

    const [importedDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export', exact: true }).click(),
    ])
    const importedHtml = await readDownload(importedDownload)
    const payload = extractJsonPayload(importedHtml)

    const expectedSnapshots = collectExpectedNodeSnapshots(template.rows, { ignoreManualLevels })
    const actualImportedSnapshots = collectActualNodeSnapshots(payload.document)

    expect(actualImportedSnapshots).toHaveLength(expectedSnapshots.length)

    const expectedCounts = new Map()
    for (const snapshot of expectedSnapshots) {
      const key = toSnapshotKey(toComparableSnapshot(snapshot))
      expectedCounts.set(key, (expectedCounts.get(key) ?? 0) + 1)
    }

    const unexpectedSnapshots = []
    for (const snapshot of actualImportedSnapshots) {
      const comparableSnapshot = toComparableSnapshot(snapshot)
      const key = toSnapshotKey(comparableSnapshot)
      const remaining = expectedCounts.get(key) ?? 0
      if (remaining === 0) {
        unexpectedSnapshots.push(comparableSnapshot)
        continue
      }
      expectedCounts.set(key, remaining - 1)
    }

    const missingSnapshots = []
    for (const [key, remaining] of expectedCounts.entries()) {
      for (let index = 0; index < remaining; index += 1) {
        missingSnapshots.push(JSON.parse(key))
      }
    }

    expect(unexpectedSnapshots).toEqual([])
    expect(missingSnapshots).toEqual([])

    expect(Array.isArray(template.warnings)).toBe(true)
  })
})
