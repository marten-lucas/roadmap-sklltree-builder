import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { basename, extname, resolve } from 'node:path'
import process from 'node:process'
import { expect, test } from '@playwright/test'
import {
  buildLayoutVariantCsv,
  collectCanvasWarningMetrics,
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

const BASELINE_SCHEMA_VERSION = 2
const BASELINE_PROFILE = 'layout-regression'
const runStamp = Date.now()

const formatRunFolderName = (timestamp) => {
  const date = new Date(timestamp)
  const year = String(date.getFullYear())
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}-${hours}${minutes}`
}

const runFolderName = formatRunFolderName(runStamp)

const baseDatasetEntries = [
  { key: 'minimal', label: 'minimal', path: resolve(process.cwd(), 'tests/e2e/datasets/minimal.csv') },
  { key: 'small', label: 'small', path: resolve(process.cwd(), 'tests/e2e/datasets/small.csv') },
  { key: 'medium', label: 'medium', path: resolve(process.cwd(), 'tests/e2e/datasets/medium.csv') },
  { key: 'large', label: 'large', path: resolve(process.cwd(), 'tests/e2e/datasets/large.csv') },
  { key: 'root-promoted', label: 'root-promoted', path: resolve(process.cwd(), 'tests/e2e/datasets/layout-regression/root-promoted.csv') },
  { key: 'cross-segment-promotion-chain', label: 'cross-segment-promotion-chain', path: resolve(process.cwd(), 'tests/e2e/datasets/layout-regression/cross-segment-promotion-chain.csv') },
  { key: 'crisscross', label: 'crisscross', path: resolve(process.cwd(), 'tests/e2e/datasets/layout-regression/crisscross.csv') },
  { key: 'dense-segment-capacity', label: 'dense-segment-capacity', path: resolve(process.cwd(), 'tests/e2e/datasets/layout-regression/dense-segment-capacity.csv') },
  { key: 'dense-root-capacity', label: 'dense-root-capacity', path: resolve(process.cwd(), 'tests/e2e/datasets/layout-regression/dense-root-capacity.csv') },
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
  baseDatasetEntries.push({
    key: 'huge',
    label: 'huge',
    path: resolve(process.cwd(), 'tests/e2e/datasets/huge.csv'),
  })
}

if (process.env.SKILLTREE_LAYOUT_INCLUDE_MYKYANA === '1') {
  baseDatasetEntries.push({
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
  baseDatasetEntries.push({
    key: basename(extraPath, extname(extraPath)).toLowerCase(),
    label: basename(extraPath),
    path: resolve(extraPath),
  })
}

const layoutVariants = [
  {
    key: 'full',
    label: 'full',
    ignoreManualLevels: false,
    ignoreSegments: false,
  },
  {
    key: 'no-segments',
    label: 'no segments',
    ignoreManualLevels: false,
    ignoreSegments: true,
  },
  {
    key: 'no-manual-levels',
    label: 'no manual levels',
    ignoreManualLevels: true,
    ignoreSegments: false,
  },
  {
    key: 'no-manual-levels-no-segments',
    label: 'no manual levels, no segments',
    ignoreManualLevels: true,
    ignoreSegments: true,
  },
]

const baseEntries = baseDatasetEntries.filter((entry, index, all) => (
  existsSync(entry.path)
  && all.findIndex((candidate) => candidate.path === entry.path) === index
))

const datasetEntries = baseEntries.flatMap((entry) => layoutVariants.map((variant) => ({
  ...entry,
  baseKey: entry.key,
  baseLabel: entry.label,
  variant,
  key: `${entry.key}__${variant.key}`,
  label: `${entry.label} [${variant.label}]`,
})))

const exportDir = resolve(process.cwd(), 'tests/results/e2e-exports/layout-regression', runFolderName)
const reportDir = resolve(process.cwd(), 'tests/results/reports')
const screenshotDir = resolve(process.cwd(), 'tests/results/screenshots/layout-regression', runFolderName)
const reportEntries = []
const screenshotEntries = []

const ensureArtifactDirs = () => {
  mkdirSync(exportDir, { recursive: true })
  mkdirSync(reportDir, { recursive: true })
  mkdirSync(screenshotDir, { recursive: true })
}

const normalizeFilenamePart = (value) => String(value ?? '').replace(/[^a-z0-9-]+/gi, '_').toLowerCase()

const fitToScreenIfAvailable = async (page) => {
  try {
    await page.getByRole('button', { name: 'Fit to screen' }).click({ timeout: 1_500 })
    await page.waitForTimeout(220)
  } catch {
    // Keep baseline resilient if the control is not rendered in a specific state.
  }
}

const collapseToolbarIfExpanded = async (page) => {
  try {
    const collapseButton = page.getByRole('button', { name: 'Menü einklappen' }).first()
    if (await collapseButton.isVisible({ timeout: 800 })) {
      await collapseButton.click({ timeout: 1_200 })
      await page.waitForTimeout(180)
    }
  } catch {
    // Non-blocking for environments/locales where the toolbar control differs.
  }
}

const prepareBuilderScreenshotView = async (page) => {
  await collapseToolbarIfExpanded(page)
  await fitToScreenIfAvailable(page)
}

const captureBuilderScreenshot = async (page, datasetKey) => {
  const [baseKey, variantKey = 'full'] = String(datasetKey).split('__')
  const path = resolve(
    screenshotDir,
    `${normalizeFilenamePart(variantKey)}__${normalizeFilenamePart(baseKey)}-builder.png`,
  )
  await page.screenshot({ path, fullPage: true })
  return path
}

const exportHtmlFromPage = async (page) => {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15_000 }),
    page.keyboard.press('Control+s'),
  ])

  return readDownload(download)
}

const buildDatasetAssertions = ({
  datasetBaseKey,
  variantKey,
  connectionMetrics,
  exportLayout,
  expectedEdgeCount,
  warningMetrics,
}) => {
  expect(exportLayout.nodeCount).toBeGreaterThan(0)
  expect(exportLayout.usedAngleDeg).toBeGreaterThanOrEqual(0)
  expect(exportLayout.centerRadius).toBeGreaterThan(0)
  expect(connectionMetrics.linkCount).toBeGreaterThanOrEqual(expectedEdgeCount)

  if (datasetBaseKey === 'minimal') {
    expect(connectionMetrics.directCount).toBeGreaterThan(0)
    expect(connectionMetrics.routedCount).toBeGreaterThan(0)
  }

  if (datasetBaseKey === 'crisscross') {
    expect(connectionMetrics.routedCount).toBeGreaterThanOrEqual(2)
    if (variantKey === 'full') {
      expect(
        warningMetrics.linkLinkIntersectionCount + warningMetrics.linkNodeOverlapCount,
      ).toBeGreaterThan(0)
    }
  }

  if (datasetBaseKey === 'cross-segment-promotion-chain') {
    expect(exportLayout.centerRadius).toBeGreaterThanOrEqual(1200)
  }

  if (datasetBaseKey === 'dense-segment-capacity' || datasetBaseKey === 'dense-root-capacity') {
    expect(exportLayout.centerRadius).toBeGreaterThan(360)
  }

  if (datasetBaseKey === 'segment-boundary') {
    expect(connectionMetrics.routedCount).toBeGreaterThan(0)
  }

  if (datasetBaseKey === 'sparse-segments') {
    expect(exportLayout.usedAngleDeg).toBeGreaterThan(180)
  }

  if (datasetBaseKey === 'single-chain') {
    expect(connectionMetrics.directCount).toBeGreaterThan(0)
    expect(exportLayout.usedAngleDeg).toBeLessThan(180)
  }

  if (datasetBaseKey === 'multi-level-ray') {
    expect(connectionMetrics.directCount).toBeGreaterThan(0)
  }

  if (datasetBaseKey === 'direct-threshold') {
    expect(connectionMetrics.directCount).toBeGreaterThan(0)
  }

  if (datasetBaseKey === 'routed-threshold') {
    expect(connectionMetrics.routedCount).toBeGreaterThan(0)
  }

  if (datasetBaseKey === 'routed-fanout') {
    expect(connectionMetrics.routedCount).toBeGreaterThanOrEqual(3)
  }

  if (datasetBaseKey === 'subtree-shifted') {
    expect(connectionMetrics.routedCount).toBeGreaterThan(0)
  }

  if (datasetBaseKey === 'even-children' || datasetBaseKey === 'odd-children') {
    expect(connectionMetrics.linkCount).toBe(expectedEdgeCount)
  }
}

test.describe('CSV import/export layout regression metrics', () => {
  test.afterAll(async () => {
    if (reportEntries.length === 0) {
      return
    }

    ensureArtifactDirs()

    const reportPath = resolve(reportDir, `layout-regression-report-${runStamp}.json`)
    persistTextFile(reportPath, JSON.stringify({
      schemaVersion: BASELINE_SCHEMA_VERSION,
      profile: BASELINE_PROFILE,
      runStamp,
      runFolderName,
      generatedAt: new Date().toISOString(),
      datasetMatrix: datasetEntries.map((dataset) => ({
        key: dataset.key,
        label: dataset.label,
        baseKey: dataset.baseKey,
        variantKey: dataset.variant.key,
        path: dataset.path,
      })),
      datasetCount: reportEntries.length,
      datasets: reportEntries,
    }, null, 2))

    const screenshotIndexPath = resolve(reportDir, `layout-regression-screenshot-index-${runStamp}.json`)
    persistTextFile(screenshotIndexPath, JSON.stringify({
      schemaVersion: BASELINE_SCHEMA_VERSION,
      profile: BASELINE_PROFILE,
      runStamp,
      runFolderName,
      generatedAt: new Date().toISOString(),
      screenshotDir,
      datasetCount: screenshotEntries.length,
      datasets: screenshotEntries,
    }, null, 2))
  })

  for (const dataset of datasetEntries) {
    test(`imports ${dataset.label} csv and exports html with layout metrics`, async ({ page }) => {
      test.setTimeout(dataset.key === 'large' || dataset.key === 'huge' ? 300_000 : 120_000)

      const pageErrors = []
      page.on('pageerror', (error) => {
        pageErrors.push(error.message)
      })

      const originalCsvText = readFileSync(dataset.path, 'utf-8')
      const csvText = buildLayoutVariantCsv(originalCsvText, dataset.variant)
      const template = parseSkillTreeCsvTemplate(csvText)
      const startedAt = Date.now()

      ensureArtifactDirs()

      await page.goto('/')
      await confirmAndReset(page)
      await expect(page.locator('foreignObject.skill-node-export-anchor')).toHaveCount(0)

      const importStartedAt = Date.now()
      await importCsvViaToolbar(page, csvText)
      const renderDurationMs = Date.now() - importStartedAt

      const renderedNodeCount = await page.locator('foreignObject.skill-node-export-anchor').count()
      expect(renderedNodeCount).toBe(template.rows.length)

      if (dataset.baseKey === 'root-promoted' && dataset.variant.key === 'full') {
        await selectNodeByShortName(page, 'RTP')
        const selectedNodeId = await getSelectedNodeId(page)
        const rootAddControlCount = await getVisibleRootAddControlCountForNode(page, selectedNodeId)
        expect(rootAddControlCount).toBeGreaterThan(0)
      }

      await prepareBuilderScreenshotView(page)
      const liveCanvasMetrics = await collectCanvasGeometryMetrics(page)
      const warningMetrics = await collectCanvasWarningMetrics(page)
      const builderScreenshotPath = await captureBuilderScreenshot(page, dataset.key)

      const exportStartedAt = Date.now()
      const exportedHtml = await exportHtmlFromPage(page)
      const exportDurationMs = Date.now() - exportStartedAt
      const exportPath = resolve(exportDir, `${dataset.key}-${runStamp}.html`)
      persistTextFile(exportPath, exportedHtml)

      const payload = extractJsonPayload(exportedHtml)
      const exportLayout = extractLayoutMetrics(exportedHtml)
      const connectionMetrics = extractConnectionMetrics(exportedHtml)

      expect(payload.document.children?.length ?? 0).toBeGreaterThan(0)
      expect(pageErrors).toEqual([])
      expect(exportLayout.nodeCount).toBe(template.rows.length)

      buildDatasetAssertions({
        datasetBaseKey: dataset.baseKey,
        variantKey: dataset.variant.key,
        connectionMetrics,
        exportLayout,
        expectedEdgeCount: template.children.length,
        warningMetrics,
      })

      reportEntries.push({
        dataset: dataset.label,
        datasetKey: dataset.key,
        datasetBaseKey: dataset.baseKey,
        variantKey: dataset.variant.key,
        variantLabel: dataset.variant.label,
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
        warnings: warningMetrics,
        assessment: {
          hasWarnings: Object.values(warningMetrics).some((value) => Number(value) > 0),
          isSolved: !Object.values(warningMetrics).some((value) => Number(value) > 0),
        },
        exportLayout,
        connections: connectionMetrics,
        exportPath,
        screenshots: {
          builder: builderScreenshotPath,
        },
      })

      screenshotEntries.push({
        datasetKey: dataset.key,
        datasetBaseKey: dataset.baseKey,
        variantKey: dataset.variant.key,
        datasetLabel: dataset.label,
        builderScreenshotPath,
      })
    })
  }
})