import { existsSync, readFileSync } from 'node:fs'
import { basename, extname, resolve } from 'node:path'
import process from 'node:process'
import { expect, test } from '@playwright/test'
import {
  collectCanvasGeometryMetrics,
  confirmAndReset,
  extractConnectionMetrics,
  extractJsonPayload,
  extractLayoutMetrics,
  getSelectedNodeId,
  getVisibleRootAddControlCountForNode,
  importCsvViaToolbar,
  parseSkillTreeCsvTemplate,
  persistTextFile,
  readDownload,
  selectNodeByShortName,
} from './helpers.js'

const defaultDatasetEntries = [
  { key: 'minimal', label: 'minimal', path: resolve(process.cwd(), 'tests/e2e/datasets/minimal.csv') },
  { key: 'small', label: 'small', path: resolve(process.cwd(), 'tests/e2e/datasets/small.csv') },
  { key: 'medium', label: 'medium', path: resolve(process.cwd(), 'tests/e2e/datasets/medium.csv') },
  { key: 'large', label: 'large', path: resolve(process.cwd(), 'tests/e2e/datasets/large.csv') },
  { key: 'root-promoted', label: 'root-promoted', path: resolve(process.cwd(), 'tests/e2e/datasets/layout-regression/root-promoted.csv') },
  { key: 'cross-segment-promotion-chain', label: 'cross-segment-promotion-chain', path: resolve(process.cwd(), 'tests/e2e/datasets/layout-regression/cross-segment-promotion-chain.csv') },
  { key: 'crisscross', label: 'crisscross', path: resolve(process.cwd(), 'tests/e2e/datasets/layout-regression/crisscross.csv') },
  { key: 'dense-segment-capacity', label: 'dense-segment-capacity', path: resolve(process.cwd(), 'tests/e2e/datasets/layout-regression/dense-segment-capacity.csv') },
  { key: 'long-segment-labels', label: 'long-segment-labels', path: resolve(process.cwd(), 'tests/e2e/datasets/layout-regression/long-segment-labels.csv') },
  { key: 'segment-boundary', label: 'segment-boundary', path: resolve(process.cwd(), 'tests/e2e/datasets/layout-regression/segment-boundary.csv') },
  { key: 'sparse-segments', label: 'sparse-segments', path: resolve(process.cwd(), 'tests/e2e/datasets/layout-regression/sparse-segments.csv') },
  { key: 'single-chain', label: 'single-chain', path: resolve(process.cwd(), 'tests/e2e/datasets/layout-regression/single-chain.csv') },
  { key: 'multi-level-ray', label: 'multi-level-ray', path: resolve(process.cwd(), 'tests/e2e/datasets/layout-regression/multi-level-ray.csv') },
  { key: 'direct-threshold', label: 'direct-threshold', path: resolve(process.cwd(), 'tests/e2e/datasets/layout-regression/direct-threshold.csv') },
  { key: 'routed-threshold', label: 'routed-threshold', path: resolve(process.cwd(), 'tests/e2e/datasets/layout-regression/routed-threshold.csv') },
  { key: 'routed-fanout', label: 'routed-fanout', path: resolve(process.cwd(), 'tests/e2e/datasets/layout-regression/routed-fanout.csv') },
  { key: 'subtree-shifted', label: 'subtree-shifted', path: resolve(process.cwd(), 'tests/e2e/datasets/layout-regression/subtree-shifted.csv') },
  { key: 'even-children', label: 'even-children', path: resolve(process.cwd(), 'tests/e2e/datasets/layout-regression/even-children.csv') },
  { key: 'odd-children', label: 'odd-children', path: resolve(process.cwd(), 'tests/e2e/datasets/layout-regression/odd-children.csv') },
]

if (process.env.SKILLTREE_LAYOUT_INCLUDE_HUGE === '1') {
  defaultDatasetEntries.push({
    key: 'huge',
    label: 'huge',
    path: resolve(process.cwd(), 'tests/e2e/datasets/huge.csv'),
  })
}

if (process.env.SKILLTREE_LAYOUT_INCLUDE_MYKYANA === '1') {
  defaultDatasetEntries.push({
    key: 'mykyana',
    label: 'myKyana',
    path: resolve(process.cwd(), 'tests/e2e/datasets/myKyana.csv'),
  })
}

const extraCsvPaths = String(process.env.SKILLTREE_LAYOUT_EXTRA_CSV ?? '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean)

for (const extraPath of extraCsvPaths) {
  defaultDatasetEntries.push({
    key: basename(extraPath, extname(extraPath)).toLowerCase(),
    label: basename(extraPath),
    path: resolve(extraPath),
  })
}

const datasetEntries = defaultDatasetEntries.filter((entry, index, all) => (
  existsSync(entry.path)
  && all.findIndex((candidate) => candidate.path === entry.path) === index
))

const exportDir = resolve(process.cwd(), 'tests/results/e2e-exports/layout-regression')
const reportDir = resolve(process.cwd(), 'tests/results/reports')
const reportEntries = []

const exportHtmlFromPage = async (page) => {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15_000 }),
    page.keyboard.press('Control+s'),
  ])

  return readDownload(download)
}

const buildDatasetAssertions = ({ datasetKey, connectionMetrics, exportLayout, expectedEdgeCount }) => {
  expect(exportLayout.nodeCount).toBeGreaterThan(0)
  expect(exportLayout.usedAngleDeg).toBeGreaterThan(0)
  expect(exportLayout.centerRadius).toBeGreaterThan(0)
  expect(connectionMetrics.linkCount).toBeGreaterThanOrEqual(expectedEdgeCount)

  if (datasetKey === 'minimal') {
    expect(connectionMetrics.directCount).toBeGreaterThan(0)
    expect(connectionMetrics.routedCount).toBeGreaterThan(0)
  }

  if (datasetKey === 'crisscross') {
    expect(connectionMetrics.routedCount).toBeGreaterThanOrEqual(2)
  }

  if (datasetKey === 'cross-segment-promotion-chain') {
    expect(exportLayout.centerRadius).toBeGreaterThanOrEqual(1200)
  }

  if (datasetKey === 'dense-segment-capacity') {
    expect(exportLayout.centerRadius).toBeGreaterThan(360)
  }

  if (datasetKey === 'segment-boundary') {
    expect(connectionMetrics.routedCount).toBeGreaterThan(0)
  }

  if (datasetKey === 'sparse-segments') {
    expect(exportLayout.usedAngleDeg).toBeGreaterThan(180)
  }

  if (datasetKey === 'single-chain') {
    expect(connectionMetrics.directCount).toBeGreaterThan(0)
    expect(exportLayout.usedAngleDeg).toBeLessThan(180)
  }

  if (datasetKey === 'multi-level-ray') {
    expect(connectionMetrics.directCount).toBeGreaterThan(0)
  }

  if (datasetKey === 'direct-threshold') {
    expect(connectionMetrics.directCount).toBeGreaterThan(0)
  }

  if (datasetKey === 'routed-threshold') {
    expect(connectionMetrics.routedCount).toBeGreaterThan(0)
  }

  if (datasetKey === 'routed-fanout') {
    expect(connectionMetrics.routedCount).toBeGreaterThanOrEqual(3)
  }

  if (datasetKey === 'subtree-shifted') {
    expect(connectionMetrics.routedCount).toBeGreaterThan(0)
  }

  if (datasetKey === 'even-children' || datasetKey === 'odd-children') {
    expect(connectionMetrics.linkCount).toBe(expectedEdgeCount)
  }
}

test.describe('CSV import/export layout regression metrics', () => {
  test.afterAll(async () => {
    if (reportEntries.length === 0) {
      return
    }

    const reportPath = resolve(reportDir, `layout-regression-report-${Date.now()}.json`)
    persistTextFile(reportPath, JSON.stringify({
      generatedAt: new Date().toISOString(),
      datasetCount: reportEntries.length,
      datasets: reportEntries,
    }, null, 2))
  })

  for (const dataset of datasetEntries) {
    test(`imports ${dataset.label} csv and exports html with layout metrics`, async ({ page }) => {
      test.setTimeout(dataset.key === 'large' || dataset.key === 'huge' ? 300_000 : 120_000)

      const pageErrors = []
      page.on('pageerror', (error) => {
        pageErrors.push(error.message)
      })

      const csvText = readFileSync(dataset.path, 'utf-8')
      const template = parseSkillTreeCsvTemplate(csvText)
      const startedAt = Date.now()

      await page.goto('/')
      await confirmAndReset(page)
      await expect(page.locator('foreignObject.skill-node-export-anchor')).toHaveCount(0)

      const importStartedAt = Date.now()
      await importCsvViaToolbar(page, csvText)
      const renderDurationMs = Date.now() - importStartedAt

      const renderedNodeCount = await page.locator('foreignObject.skill-node-export-anchor').count()
      expect(renderedNodeCount).toBe(template.rows.length)

      if (dataset.key === 'root-promoted') {
        await selectNodeByShortName(page, 'RTP')
        const selectedNodeId = await getSelectedNodeId(page)
        const rootAddControlCount = await getVisibleRootAddControlCountForNode(page, selectedNodeId)
        expect(rootAddControlCount).toBeGreaterThan(0)
      }

      const liveCanvasMetrics = await collectCanvasGeometryMetrics(page)

      const exportStartedAt = Date.now()
      const exportedHtml = await exportHtmlFromPage(page)
      const exportDurationMs = Date.now() - exportStartedAt
      const exportPath = resolve(exportDir, `${dataset.key}-${Date.now()}.html`)
      persistTextFile(exportPath, exportedHtml)

      const payload = extractJsonPayload(exportedHtml)
      const exportLayout = extractLayoutMetrics(exportedHtml)
      const connectionMetrics = extractConnectionMetrics(exportedHtml)

      expect(payload.document.children?.length ?? 0).toBeGreaterThan(0)
      expect(pageErrors).toEqual([])
      expect(exportLayout.nodeCount).toBe(template.rows.length)

      buildDatasetAssertions({
        datasetKey: dataset.key,
        connectionMetrics,
        exportLayout,
        expectedEdgeCount: template.children.length,
      })

      reportEntries.push({
        dataset: dataset.label,
        datasetKey: dataset.key,
        datasetPath: dataset.path,
        renderDurationMs,
        exportDurationMs,
        totalDurationMs: Date.now() - startedAt,
        document: {
          expectedNodeCount: template.rows.length,
          expectedEdgeCount: template.children.length,
          segmentCount: template.segments.length,
          rootCount: template.roots.length,
        },
        rendered: {
          nodeCount: renderedNodeCount,
        },
        canvas: liveCanvasMetrics,
        exportLayout,
        connections: connectionMetrics,
        exportPath,
      })
    })
  }
})