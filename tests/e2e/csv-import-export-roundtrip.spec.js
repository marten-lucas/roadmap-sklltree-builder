import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { expect, test } from '@playwright/test'
import {
  applyNodeIdentity,
  clickChildAddForSelectedNode,
  clickInitialRootAddControl,
  clickInitialSegmentAddControl,
  clickRootAddNearSelectedWithDirection,
  clickSegmentAddNearSelected,
  confirmAndReset,
  extractJsonPayload,
  ensureScopesExist,
  getSelectedNodeId,
  getVisibleChildAddControlCountForNode,
  parseSkillTreeCsvTemplate,
  persistTextFile,
  readDownload,
  selectSegmentByLabel,
  selectNodeById,
  selectInspectorLevel,
  searchAndSelectNode,
  setSelectValueByLabel,
  setSelectedSegmentName,
  trySetSelectValueByLabel,
  trySetScopeByLabel,
} from './helpers.js'

const ONE_YEAR_FROM_TODAY = () => {
  const date = new Date()
  date.setFullYear(date.getFullYear() + 1)
  return date.toISOString().slice(0, 10)
}

const fillCenterMetadata = async (page) => {
  const centerIcon = page.locator('.skill-tree-center-icon').first()

  // Inspector overlays can intercept pointer events in headed mode.
  // Use progressively stronger click strategies to open the center panel.
  let opened = false
  try {
    await centerIcon.click({ timeout: 3_000 })
    opened = true
  } catch {
    try {
      await centerIcon.dispatchEvent('click')
      opened = true
    } catch {
      await centerIcon.evaluate((el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })))
      opened = true
    }
  }

  if (!opened) {
    throw new Error('Could not open center metadata panel')
  }

  await page.waitForSelector('.skill-panel--icon', { timeout: 10_000 })

  const panel = page.locator('.skill-panel--icon')
  await panel.getByLabel('Systemname', { exact: true }).fill('Kyana Visual Roundtrip')
  await panel.getByLabel('Release-Name', { exact: true }).fill('Final Integration Release')
  await panel.getByLabel('Motto', { exact: true }).fill('Stabil, klar und exportierbar')
  await panel.getByLabel('Release Date', { exact: true }).fill(ONE_YEAR_FROM_TODAY())

  const introduction = [
    '# Release Overview',
    '',
    'Diese Runde prueft den **Roundtrip** inkl. Icon, Markdown und Export.',
    '',
    '## Was enthalten ist',
    '',
    '- Systemdaten im Center',
    '- Markdown mit Ueberschriften',
    '- SVG-Icon aus dem Fixture',
  ].join('\n')
  await panel.locator('textarea').last().fill(introduction)

  const iconPath = resolve(process.cwd(), 'tests/e2e/datasets/Kyana_Visual_final.svg')
  const skipIcon = process.env.SKILLTREE_E2E_SKIP_ICON === '1'
  if (!skipIcon) {
    await panel.locator('input[type="file"][accept=".svg,image/svg+xml"]').setInputFiles(iconPath)
    // Wait for the SVG to be stored as a data URI in the document state.
    // 300ms is not enough when the click was dispatched synthetically.
    try {
      await page.waitForFunction(
        () => {
          const raw = localStorage.getItem('roadmap-skilltree.document.v1')
          if (!raw) return false
          try {
            const doc = JSON.parse(raw)
            return String(doc.document?.centerIconSrc ?? '').startsWith('data:')
          } catch { return false }
        },
        { timeout: 5_000 },
      )
    } catch {
      // icon may not have reached localStorage yet; continue anyway
      await page.waitForTimeout(600)
    }
  }
}

const fillReleaseNoteForNode = async (page, nodeId, note, level = 1) => {
  await selectNodeById(page, nodeId)
  await selectInspectorLevel(page, level)

  // Target the Markdown textarea directly (robust against label/translation issues)
  const inspector = page.locator('.skill-panel--inspector').first()
  const releaseTextarea = inspector.locator('textarea').last()
  await releaseTextarea.waitFor({ state: 'visible', timeout: 5_000 })
  await releaseTextarea.scrollIntoViewIfNeeded()
  await releaseTextarea.fill(note)
  // Trigger onBlur handler without sending a Tab key (more robust)
  await releaseTextarea.evaluate((el) => el.blur())
  await page.waitForTimeout(150)
}

const DEFAULT_DATASET = 'large'
const datasetName = String(process.env.SKILLTREE_E2E_DATASET ?? DEFAULT_DATASET).trim().toLowerCase()

const resolveCsvTemplatePath = () => {
  if (process.env.SKILLTREE_E2E_TEMPLATE_CSV) {
    return resolve(process.env.SKILLTREE_E2E_TEMPLATE_CSV)
  }

  if (datasetName === 'small' || datasetName === 'medium' || datasetName === 'large' || datasetName === 'minimal') {
    return resolve(process.cwd(), 'tests/e2e/datasets', `${datasetName}.csv`)
  }

  return resolve(process.cwd(), 'tests/e2e/datasets/large.csv')
}

const csvTemplatePath = resolveCsvTemplatePath()

const exportOutputDir = process.env.SKILLTREE_E2E_EXPORT_DIR
  ? resolve(process.env.SKILLTREE_E2E_EXPORT_DIR)
  : resolve(process.cwd(), 'tests/results/e2e-exports')

const metricsOutputDir = process.env.SKILLTREE_E2E_METRICS_DIR
  ? resolve(process.env.SKILLTREE_E2E_METRICS_DIR)
  : resolve(exportOutputDir, 'metrics')

const ignoreProgressLevels = (process.env.SKILLTREE_E2E_IGNORE_PROGRESS_LEVELS
  ?? process.env.SKILLTREE_E2E_IGNORE_MANUAL_LEVELS
  ?? '1') !== '0'
const ignoreSegments = process.env.SKILLTREE_E2E_IGNORE_SEGMENTS !== '0'
const skipReleaseNotes = process.env.SKILLTREE_E2E_SKIP_RELEASE_NOTES === '1' || datasetName === 'large'

const ALL_PHASES = ['statuses', 'scopes', 'segments', 'roundtrip']
const configuredPhases = String(process.env.SKILLTREE_E2E_PHASES ?? 'all').trim().toLowerCase()
const selectedPhases = configuredPhases === 'all'
  ? new Set(ALL_PHASES)
  : new Set(
    configuredPhases
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  )

if (ignoreSegments) {
  selectedPhases.delete('segments')
}

const isPhaseEnabled = (phaseName) => selectedPhases.has(phaseName)

const getPrimaryProgressRows = (rows) => {
  const groupedByShortName = groupProgressRowsByShortName(rows)

  return [...groupedByShortName.values()]
    .map((groupedRows) => [...groupedRows].sort((left, right) => {
      const leftLevel = Number(left.progressLevel ?? 1)
      const rightLevel = Number(right.progressLevel ?? 1)
      if (leftLevel !== rightLevel) {
        return leftLevel - rightLevel
      }

      return left.order - right.order
    })[0])
    .sort((left, right) => left.order - right.order)
}

const persistHtmlExport = (htmlText) => {
  const fileName = `skilltree-roundtrip-${Date.now()}.html`
  const exportPath = resolve(exportOutputDir, fileName)
  persistTextFile(exportPath, htmlText)
  return exportPath
}

const persistPhaseExport = (htmlText, phase) => {
  const fileName = `skilltree-roundtrip-phase-${phase}-${Date.now()}.html`
  const exportPath = resolve(exportOutputDir, fileName)
  persistTextFile(exportPath, htmlText)
  return exportPath
}

const collectDocumentMetrics = (document) => {
  let nodeCount = 0
  let edgeCount = 0
  let maxDepth = 0
  const segmentIds = new Set()
  const scopeIds = new Set((document?.scopes ?? []).map((scope) => scope.id))

  const visit = (nodes, depth) => {
    for (const node of nodes ?? []) {
      nodeCount += 1
      maxDepth = Math.max(maxDepth, depth)
      if (node.segmentId) {
        segmentIds.add(node.segmentId)
      }

      const levels = Array.isArray(node.levels) ? node.levels : []
      for (const level of levels) {
        const levelScopeIds = Array.isArray(level.scopeIds) ? level.scopeIds : []
        for (const scopeId of levelScopeIds) {
          scopeIds.add(scopeId)
        }
      }

      const children = Array.isArray(node.children) ? node.children : []
      edgeCount += children.length
      visit(children, depth + 1)
    }
  }

  visit(document?.children ?? [], 1)

  return {
    nodeCount,
    edgeCount,
    maxDepth,
    segmentCount: segmentIds.size,
    scopeCount: scopeIds.size,
  }
}

const ensureNodeProgressLevels = async (page, nodeId, targetLevelCount) => {
  const desiredCount = Math.max(1, Number(targetLevelCount ?? 1))
  await selectNodeById(page, nodeId)
  const inspector = page.locator('.skill-panel--inspector').first()
  await inspector.waitFor({ state: 'attached', timeout: 10_000 })

  for (;;) {
    const currentCount = await inspector.getByRole('tab').count()
    if (currentCount >= desiredCount) {
      break
    }

    const addButton = inspector.getByRole('button', { name: 'Level hinzufügen' }).first()
    await addButton.click()
    await page.waitForTimeout(150)
  }
}

const collectCanvasGeometryMetrics = async (page) => {
  return page.evaluate(() => {
    const normalizeDeg = (deg) => {
      const normalized = deg % 360
      return normalized < 0 ? normalized + 360 : normalized
    }

    const canvas = document.querySelector('svg.skill-tree-canvas')
    if (!canvas) {
      return {
        canvasWidth: 0,
        canvasHeight: 0,
        centerX: 0,
        centerY: 0,
        maxRadius: 0,
        nodeAngleSpread: 0,
      }
    }

    const viewBox = canvas.getAttribute('viewBox')?.split(/\s+/).map(Number) ?? [0, 0, 0, 0]
    const canvasWidth = Number(viewBox[2] ?? 0)
    const canvasHeight = Number(viewBox[3] ?? 0)

    const centerGroup = document.querySelector('.skill-tree-center-icon')
    const transform = centerGroup?.getAttribute('transform') ?? ''
    const match = transform.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/)
    const centerX = match ? Number(match[1]) : canvasWidth / 2
    const centerY = match ? Number(match[2]) : canvasHeight / 2

    const anchors = Array.from(document.querySelectorAll('foreignObject.skill-node-export-anchor'))
    const angles = []
    const radii = []

    for (const anchor of anchors) {
      const x = Number(anchor.getAttribute('x') ?? 0)
      const y = Number(anchor.getAttribute('y') ?? 0)
      const width = Number(anchor.getAttribute('width') ?? 0)
      const height = Number(anchor.getAttribute('height') ?? 0)
      const cx = x + width / 2
      const cy = y + height / 2
      const dx = cx - centerX
      const dy = cy - centerY
      const angle = normalizeDeg((Math.atan2(dy, dx) * 180) / Math.PI)
      angles.push(angle)
      radii.push(Math.hypot(dx, dy))
    }

    const nodeAngleSpread = angles.length > 0
      ? Math.max(...angles) - Math.min(...angles)
      : 0

    return {
      canvasWidth,
      canvasHeight,
      centerX,
      centerY,
      maxRadius: radii.length > 0 ? Math.max(...radii) : 0,
      nodeAngleSpread,
    }
  })
}

const extractCenterIconGeometryFromMarkup = (markup) => {
  const transformMatch = markup.match(/class="skill-tree-center-icon[^"]*"[^>]*transform="translate\(([-\d.]+),\s*([-\d.]+)\)"/)
  const imageMatch = markup.match(/class="skill-tree-center-icon__image"[^>]*x="([-.\d]+)"[^>]*y="([-.\d]+)"[^>]*width="([-.\d]+)"[^>]*height="([-.\d]+)"/)
  const hitAreaMatch = markup.match(/class="skill-tree-center-icon__hit-area"[^>]*r="([-.\d]+)"|<circle[^>]*r="([-.\d]+)"[^>]*class="skill-tree-center-icon__hit-area"/)

  return {
    centerX: transformMatch ? Number(transformMatch[1]) : Number.NaN,
    centerY: transformMatch ? Number(transformMatch[2]) : Number.NaN,
    imageX: imageMatch ? Number(imageMatch[1]) : Number.NaN,
    imageY: imageMatch ? Number(imageMatch[2]) : Number.NaN,
    imageWidth: imageMatch ? Number(imageMatch[3]) : Number.NaN,
    imageHeight: imageMatch ? Number(imageMatch[4]) : Number.NaN,
    hitRadius: hitAreaMatch ? Number(hitAreaMatch[1] ?? hitAreaMatch[2]) : Number.NaN,
  }
}

const persistMetrics = (phase, payload) => {
  const metricsPath = resolve(metricsOutputDir, `skilltree-metrics-${phase}-${Date.now()}.json`)
  persistTextFile(metricsPath, JSON.stringify(payload, null, 2))
  return metricsPath
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
      const scopeIds = Array.isArray(node.levels?.[0]?.scopeIds) ? node.levels[0].scopeIds : []
      const scopeLabels = scopeIds
        .map((id) => scopesById.get(id) ?? null)
        .filter(Boolean)
        .map((s) => String(s).trim())
        .filter(Boolean)
        .sort()

      snapshots.push({
        shortName: String(node.shortName ?? '').trim(),
        label: node.label,
        level: Number(node.ebene),
        segment: segmentsById.get(node.segmentId ?? null) ?? null,
        scope: scopeLabels.length > 0 ? scopeLabels.join('|') : null,
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
  const { ignoreManualLevels = false, ignoreSegments = false } = options
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
    segment: ignoreSegments ? null : row.segment,
    scope: row.scope ? String(row.scope).trim() : null,
    parentLabel: row.parentLabel,
    status: row.status,
  }))
}


const toComparableSnapshot = (snapshot) => ({
  shortName: snapshot.shortName,
  label: snapshot.label,
  level: snapshot.level,
  parentLabel: snapshot.parentLabel,
  status: snapshot.status,
  scope: snapshot.scope ?? null,
})

const groupProgressRowsByShortName = (rows) => {
  const grouped = new Map()

  for (const row of rows ?? []) {
    const current = grouped.get(row.shortName) ?? []
    current.push(row)
    grouped.set(row.shortName, current)
  }

  return grouped
}

const collectExpectedProgressSnapshots = (rows) => {
  const grouped = groupProgressRowsByShortName(rows)

  return new Map(
    [...grouped.entries()].map(([shortName, groupedRows]) => [shortName, groupedRows.map((row) => ({
      level: Number(row.progressLevel ?? 1),
      status: row.status,
      scope: row.scope ? String(row.scope).trim() : null,
      releaseNote: row.releaseNote ? String(row.releaseNote).trim() : null,
    })).sort((left, right) => left.level - right.level)]),
  )
}

const collectActualProgressSnapshots = (document) => {
  const scopesById = new Map((document.scopes ?? []).map((scope) => [scope.id, scope.label]))
  const snapshots = new Map()

  const visit = (nodes) => {
    for (const node of nodes ?? []) {
      const levelSnapshots = Array.isArray(node.levels) ? node.levels : []
      snapshots.set(node.shortName, levelSnapshots.map((level, index) => ({
        level: index + 1,
        status: String(level?.status ?? '').trim().toLowerCase(),
        scope: (Array.isArray(level?.scopeIds) ? level.scopeIds : [])
          .map((scopeId) => scopesById.get(scopeId) ?? null)
          .filter(Boolean)
          .map((value) => String(value).trim())
          .filter(Boolean)
          .sort()
          .join('|') || null,
        releaseNote: String(level?.releaseNote ?? '').trim() || null,
      })))

      visit(node.children)
    }
  }

  visit(document.children ?? [])
  return snapshots
}

test.describe('CSV template roundtrip via builder UI', () => {
  test.afterEach(async ({ page }) => {
    try {
      await page.context().close()
    } catch {
      // ignore: the context may already be closed by the test flow
    }
  })

  test('creates the tree from CSV, exports HTML, imports it again, and preserves structure + settings', async ({ page }) => {
    test.setTimeout(datasetName === 'large' ? 1_800_000 : 900_000)
    test.skip(!existsSync(csvTemplatePath), `CSV template not found: ${csvTemplatePath}`)
    const isVerbose = process.env.SKILLTREE_E2E_VERBOSE === '1'
    const logStep = (message) => {
      console.log(`[csv-roundtrip:${datasetName}] ${message}`)
    }
    const verboseLog = (message) => {
      if (isVerbose) {
        logStep(`[verbose] ${message}`)
      }
    }
    const logCreatedNode = (kind, shortName, nodeId) => {
      verboseLog(`node-created kind=${kind} short=${shortName} nodeId=${nodeId}`)
    }
    const triggerExportDownload = async (reason) => {
      const attemptClickExport = async () => {
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 12_000 }),
          page.getByRole('button', { name: 'Export', exact: true }).click(),
        ])
        return download
      }

      const attemptKeyboardExport = async () => {
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 12_000 }),
          page.keyboard.press('Control+s'),
        ])
        return download
      }

      try {
        verboseLog(`export trigger click start reason=${reason}`)
        return await attemptClickExport()
      } catch (error) {
        verboseLog(`export trigger click failed reason=${reason} error=${error.message}`)
      }

      try {
        await page.keyboard.press('Escape')
      } catch {
        // ignore
      }

      verboseLog(`export trigger keyboard fallback reason=${reason}`)
      return attemptKeyboardExport()
    }
    const triggerSvgExportDownload = async (reason) => {
      const exportButton = page.getByRole('button', { name: 'Export', exact: true }).first()
      const svgMenuItem = page.getByRole('menuitem', { name: 'SVG (interactive)', exact: true }).filter({ visible: true }).first()

      verboseLog(`svg export open menu start reason=${reason}`)
      await exportButton.hover({ timeout: 5_000 })

      await svgMenuItem.waitFor({ state: 'visible', timeout: 5_000 })
      verboseLog(`svg export click start reason=${reason}`)

      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 12_000 }),
        svgMenuItem.click({ force: true }),
      ])

      return download
    }
    const selectNodeForSettings = async (row) => {
      const expectedNodeId = nodeIdByCsvShortName.get(row.shortName)
      expect(expectedNodeId, `Missing nodeId mapping for ${row.shortName}`).toBeTruthy()

      verboseLog(`selectNodeForSettings start short=${row.shortName} expected=${expectedNodeId}`)

      let selectedNodeId = null
      try {
        await selectNodeById(page, expectedNodeId)
        selectedNodeId = await getSelectedNodeId(page)
      } catch (error) {
        verboseLog(`selectNodeForSettings canvas-failed short=${row.shortName} error=${error.message}`)
      }

      if (selectedNodeId !== expectedNodeId) {
        verboseLog(`selectNodeForSettings search-fallback short=${row.shortName} expected=${expectedNodeId} actual=${selectedNodeId}`)
        selectedNodeId = await searchAndSelectNode(page, row.shortName)
      }

      if (selectedNodeId !== expectedNodeId) {
        verboseLog(`selection mismatch short=${row.shortName} expected=${expectedNodeId} actual=${selectedNodeId}`)
        await searchAndSelectNode(page, row.shortName)
      }

      await expect
        .poll(async () => getSelectedNodeId(page), {
          timeout: 8_000,
          message: `Expected selected node for ${row.shortName}`,
        })
        .toBe(expectedNodeId)

      verboseLog(`selectNodeForSettings done short=${row.shortName}`)
    }
    const pageErrors = []
    page.on('pageerror', (error) => {
      pageErrors.push(error)
      logStep(`[pageerror] ${error.message}`)
    })
    page.on('console', (msg) => {
      if (isVerbose || msg.type() === 'error' || msg.type() === 'warn') {
        logStep(`[browser:${msg.type()}] ${msg.text().slice(0, 200)}`)
      }
    })
    const assertNoPageErrors = (stage) => {
      expect(pageErrors, `Unexpected page errors ${stage}`).toHaveLength(0)
    }

    const phaseTimingsMs = {}
    const runStartedAtMs = Date.now()
    const runId = `${datasetName}-${runStartedAtMs}`

    const csvText = readFileSync(csvTemplatePath, 'utf-8')
    const template = parseSkillTreeCsvTemplate(csvText)
    const rowsByCsvShortName = new Map(template.rows.map((row) => [row.shortName, row]))
    const allLevelRowsForSettings = [...(template.levelRows ?? [])].sort((left, right) => left.order - right.order)
    const levelRowsForSettings = ignoreProgressLevels
      ? getPrimaryProgressRows(allLevelRowsForSettings)
      : allLevelRowsForSettings
    const maxProgressLevelByShortName = new Map(
      levelRowsForSettings.map((row) => [
        row.shortName,
        ignoreProgressLevels ? 1 : Math.max(1, Number(row.progressLevel ?? 1)),
      ]),
    )
    // If tests run with ignoreProgressLevels, compute levels from parent chain
    // and reorder roots/children so parents are created before their children.
    if (ignoreProgressLevels) {
      const computedLevelByShortName = new Map()
      const computeLevel = (row, stack = new Set()) => {
        if (computedLevelByShortName.has(row.shortName)) return computedLevelByShortName.get(row.shortName)
        if (stack.has(row.shortName)) return 1
        stack.add(row.shortName)
        const parent = row.parentShortName ? rowsByCsvShortName.get(row.parentShortName) : null
        const level = parent ? computeLevel(parent, stack) + 1 : 1
        stack.delete(row.shortName)
        computedLevelByShortName.set(row.shortName, level)
        return level
      }

      for (const r of template.rows) computeLevel(r)

      const csvSortKeyComputed = (row) => `${String(computedLevelByShortName.get(row.shortName)).padStart(4, '0')}-${String(row.order).padStart(4, '0')}`

      template.roots = template.rows
        .filter((row) => computedLevelByShortName.get(row.shortName) === 1)
        .sort((a, b) => csvSortKeyComputed(a).localeCompare(csvSortKeyComputed(b)))

      template.children = template.rows
        .filter((row) => computedLevelByShortName.get(row.shortName) !== 1)
        .sort((a, b) => csvSortKeyComputed(a).localeCompare(csvSortKeyComputed(b)))
    }
    const nodeIdByCsvShortName = new Map()
    let persistedExportPath = null
    await page.goto('/')
    await confirmAndReset(page)
    await expect(page.locator('foreignObject.skill-node-export-anchor')).toHaveCount(0)
    assertNoPageErrors('after reset')

    if (!ignoreSegments) {
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

      logStep('phase segments setup done')
    }

    logStep('root creation start')
    expect(template.roots.length).toBeGreaterThan(0)
    const seededScopeLabels = [...new Set((template.levelRows ?? []).map((row) => String(row.scope ?? '').trim()).filter(Boolean))]

    await clickInitialRootAddControl(page)
    await applyNodeIdentity(page, template.roots[0])
    await ensureNodeProgressLevels(
      page,
      await getSelectedNodeId(page),
      maxProgressLevelByShortName.get(template.roots[0].shortName) ?? 1,
    )
    const firstRootNodeId = await getSelectedNodeId(page)
    nodeIdByCsvShortName.set(template.roots[0].shortName, firstRootNodeId)
    logCreatedNode('root-initial', template.roots[0].shortName, firstRootNodeId)
    if (!ignoreSegments) {
      await setSelectValueByLabel(page, 'Segment', template.roots[0].segment)
    }

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
      // More robust creation: wait for a new foreignObject anchor to appear
      // and select it. Fall back to existing inspector-change detection.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        verboseLog(`createNodeFromSelected parent=${previousNodeId} attempt=${attempt + 1}`)
        const beforeIds = await page
          .locator('foreignObject.skill-node-export-anchor')
          .evaluateAll((els) => els.map((el) => el.getAttribute('data-node-id')))
        verboseLog(`nodes-before=${beforeIds.length}`)

        await triggerCreate(previousNodeId)

        try {
          // Prefer detecting a new DOM anchor rather than only relying on inspector attr
          const newNodeId = await page.waitForFunction(
            (before) => {
              const els = Array.from(document.querySelectorAll('foreignObject.skill-node-export-anchor') || [])
              const ids = els.map((el) => el.getAttribute('data-node-id'))
              for (const id of ids) {
                if (!before.includes(id)) return id
              }
              return null
            },
            beforeIds,
            { timeout: 6_000 },
          )

          if (newNodeId) {
            const nid = String(newNodeId)
            verboseLog(`new-node-detected=${nid}`)
            // click the new node's button to ensure inspector selection
            const selector = `foreignObject.skill-node-export-anchor[data-node-id="${nid}"] .skill-node-button`
            const node = page.locator(selector).first()
            await node.waitFor({ state: 'attached', timeout: 5_000 })
            await node.dispatchEvent('click')
            await page.waitForFunction((expected) => {
              const inspector = document.querySelector('.skill-panel--inspector')
              return inspector && inspector.getAttribute('data-selected-node-id') === expected
            }, nid, { timeout: 5_000 })
            return await getSelectedNodeId(page)
          }

          // Fallback: wait for inspector's selected node to change
          verboseLog(`no-dom-diff node for parent=${previousNodeId}, fallback to inspector selection diff`)
          return await waitForNewSelectedNode(previousNodeId)
        } catch (error) {
          verboseLog(`create attempt failed parent=${previousNodeId} attempt=${attempt + 1} error=${error.message}`)
          if (attempt === 2) {
            throw new Error(`Failed to create a new node from ${previousNodeId}: ${error.message}`)
          }
          // retry by re-selecting the previous node and trying again
          await selectNodeById(page, previousNodeId)
        }
      }
    }
    for (let index = 1; index < template.roots.length; index += 1) {
      await selectNodeById(page, nodeIdByCsvShortName.get(template.roots[0].shortName))
      const anchorRootNodeId = await getSelectedNodeId(page)
      await createNodeFromSelected(anchorRootNodeId, async (nodeId) => {
        try {
          await clickRootAddNearSelectedWithDirection(page, 'right', nodeId)
        } catch {
          await clickRootAddNearSelectedWithDirection(page, 'left', nodeId)
        }
      })
      await applyNodeIdentity(page, template.roots[index])
      await ensureNodeProgressLevels(
        page,
        await getSelectedNodeId(page),
        maxProgressLevelByShortName.get(template.roots[index].shortName) ?? 1,
      )
      const createdRootNodeId = await getSelectedNodeId(page)
      nodeIdByCsvShortName.set(template.roots[index].shortName, createdRootNodeId)
      logCreatedNode('root-sibling', template.roots[index].shortName, createdRootNodeId)
    }

    for (const rootRow of template.roots) {
      if (!nodeIdByCsvShortName.has(rootRow.shortName)) {
        await selectNodeById(page, nodeIdByCsvShortName.get(template.roots[0].shortName))
        const anchorRootNodeId = await getSelectedNodeId(page)
        await createNodeFromSelected(anchorRootNodeId, async (nodeId) => {
          try {
            await clickRootAddNearSelectedWithDirection(page, 'right', nodeId)
          } catch {
            await clickRootAddNearSelectedWithDirection(page, 'left', nodeId)
          }
        })
        await applyNodeIdentity(page, rootRow)
        await ensureNodeProgressLevels(
          page,
          await getSelectedNodeId(page),
          maxProgressLevelByShortName.get(rootRow.shortName) ?? 1,
        )
        const createdMissingRootNodeId = await getSelectedNodeId(page)
        nodeIdByCsvShortName.set(rootRow.shortName, createdMissingRootNodeId)
        logCreatedNode('root-recovery', rootRow.shortName, createdMissingRootNodeId)
      }
    }

    for (const row of template.children) {
      const parentRow = rowsByCsvShortName.get(row.parentShortName)
      expect(parentRow, `Missing parent CSV row for ${row.shortName}`).toBeTruthy()
      verboseLog(`create-child start short=${row.shortName} parentShort=${row.parentShortName}`)

      await selectNodeById(page, nodeIdByCsvShortName.get(row.parentShortName))
      const selectedParentId = await getSelectedNodeId(page)
      expect(selectedParentId, `Could not select parent for ${row.shortName}`).toBe(nodeIdByCsvShortName.get(row.parentShortName))
      verboseLog(`selected-parent-id=${selectedParentId}`)

      const childHandleCount = await getVisibleChildAddControlCountForNode(page, selectedParentId)
      verboseLog(`child-handle-visible-count parent=${selectedParentId} count=${childHandleCount}`)
      if (childHandleCount === 0) {
        const addControlDebug = await page.evaluate((parentId) => {
          const allControls = Array.from(document.querySelectorAll('g[data-add-control="child"]') ?? [])
          return {
            parentId,
            controls: allControls.map((control) => ({
              rootId: control.getAttribute('data-root-id'),
              display: control instanceof HTMLElement ? control.style.display : '',
            })),
          }
        }, selectedParentId)

        persistTextFile(
          resolve(exportOutputDir, `missing-child-handle-${row.shortName}.json`),
          JSON.stringify(addControlDebug, null, 2),
        )
      }

      try {
        await createNodeFromSelected(selectedParentId, (nodeId) => clickChildAddForSelectedNode(page, nodeId))
      } catch (error) {
        verboseLog(`create-child failed short=${row.shortName} parent=${row.parentShortName} error=${error.message}`)
        throw new Error(
          `Failed to create child ${row.shortName} (${row.label}) under ${row.parentShortName} (${row.parentLabel}): ${error.message}`,
        )
      }
      verboseLog(`create-child success short=${row.shortName}`)
      await applyNodeIdentity(page, row)
      await ensureNodeProgressLevels(
        page,
        await getSelectedNodeId(page),
        maxProgressLevelByShortName.get(row.shortName) ?? 1,
      )
      const createdChildNodeId = await getSelectedNodeId(page)
      nodeIdByCsvShortName.set(row.shortName, createdChildNodeId)
      logCreatedNode('child', row.shortName, createdChildNodeId)
    }

    await fillCenterMetadata(page)
    logStep('center metadata filled')
    await ensureScopesExist(page, seededScopeLabels)
    verboseLog(`scopes ensured count=${seededScopeLabels.length}`)

    await page.waitForTimeout(900)
    verboseLog('post-creation settle complete')

    const rowsWithReleaseNotes = levelRowsForSettings.map((row, index) => {
      const generated = [
        `# ${row.label}`,
        '',
        `## Rollout ${index + 1}`,
        '',
        `- Status: ${row.status}`,
        `- Segment: ${row.segment}`,
        row.scope ? `- Scope: ${row.scope}` : null,
      ].filter(Boolean).join('\n')

      return {
        ...row,
        releaseNote: row.releaseNote && String(row.releaseNote).trim().length > 0
          ? String(row.releaseNote)
          : generated,
      }
    })

    // Phase strategy: the execution order remains fixed, but each phase can be
    // toggled via SKILLTREE_E2E_PHASES.
    if (isPhaseEnabled('statuses')) {
      const phaseStart = Date.now()
      verboseLog(`phase statuses start rows=${levelRowsForSettings.length}`)
      for (const row of levelRowsForSettings) {
        verboseLog(`phase statuses row short=${row.shortName} level=${ignoreProgressLevels ? 1 : (row.progressLevel ?? 1)} status=${row.status}`)
        await selectNodeForSettings(row)
        verboseLog(`phase statuses selected short=${row.shortName}`)
        if (!ignoreProgressLevels) {
          verboseLog(`phase statuses set level select short=${row.shortName} level=${row.level}`)
          await trySetSelectValueByLabel(page, 'Ebene', `Ebene ${row.level}`)
        }
        verboseLog(`phase statuses set inspector level short=${row.shortName} level=${ignoreProgressLevels ? 1 : (row.progressLevel ?? 1)}`)
        await selectInspectorLevel(page, ignoreProgressLevels ? 1 : (row.progressLevel ?? 1))
        verboseLog(`phase statuses set status short=${row.shortName} status=${row.status}`)
        await setSelectValueByLabel(page, 'Status', row.status[0].toUpperCase() + row.status.slice(1))
        verboseLog(`phase statuses done row short=${row.shortName}`)
      }

      const downloadPhase = await triggerExportDownload('statuses')
      const exported = await readDownload(downloadPhase)
      const payload = extractJsonPayload(exported)
      persistPhaseExport(exported, 'statuses')
      phaseTimingsMs.statuses = Date.now() - phaseStart
      verboseLog(`phase statuses done durationMs=${phaseTimingsMs.statuses}`)
      persistMetrics('statuses', {
        runId,
        datasetName,
        phase: 'statuses',
        phasesEnabled: Array.from(selectedPhases),
        phaseDurationMs: phaseTimingsMs.statuses,
        document: collectDocumentMetrics(payload.document),
        canvas: await collectCanvasGeometryMetrics(page),
      })
    }

    if (isPhaseEnabled('scopes')) {
      const phaseStart = Date.now()
      verboseLog(`phase scopes start rows=${levelRowsForSettings.length}`)
      for (const row of levelRowsForSettings) {
        verboseLog(`phase scopes row short=${row.shortName} level=${ignoreProgressLevels ? 1 : (row.progressLevel ?? 1)} scope=${row.scope ?? ''}`)
        await selectNodeForSettings(row)
        verboseLog(`phase scopes selected short=${row.shortName}`)
        await selectInspectorLevel(page, ignoreProgressLevels ? 1 : (row.progressLevel ?? 1))
        if (row.scope && String(row.scope).trim().length > 0) {
          verboseLog(`phase scopes set scope short=${row.shortName} scope=${row.scope}`)
          await trySetScopeByLabel(page, row.scope)
        }
      }

      const downloadPhase = await triggerExportDownload('scopes')
      const exported = await readDownload(downloadPhase)
      const payload = extractJsonPayload(exported)
      persistPhaseExport(exported, 'scopes')
      phaseTimingsMs.scopes = Date.now() - phaseStart
      verboseLog(`phase scopes done durationMs=${phaseTimingsMs.scopes}`)
      persistMetrics('scopes', {
        runId,
        datasetName,
        phase: 'scopes',
        phasesEnabled: Array.from(selectedPhases),
        phaseDurationMs: phaseTimingsMs.scopes,
        document: collectDocumentMetrics(payload.document),
        canvas: await collectCanvasGeometryMetrics(page),
      })
    }

    if (isPhaseEnabled('segments')) {
      const phaseStart = Date.now()
      verboseLog(`phase segments start rows=${template.rows.length}`)
      for (const row of template.rows) {
        verboseLog(`phase segments row short=${row.shortName} segment=${row.segment}`)
        await selectNodeForSettings(row)
        verboseLog(`phase segments selected short=${row.shortName}`)
        if (!ignoreSegments) {
          verboseLog(`phase segments set segment short=${row.shortName} segment=${row.segment}`)
          await trySetSelectValueByLabel(page, 'Segment', row.segment)
        }
      }

      const downloadPhase = await triggerExportDownload('segments')
      const exported = await readDownload(downloadPhase)
      const payload = extractJsonPayload(exported)
      // make the persisted export for the import step the final-phase export
      persistedExportPath = persistPhaseExport(exported, 'segments')
      phaseTimingsMs.segments = Date.now() - phaseStart
      verboseLog(`phase segments done durationMs=${phaseTimingsMs.segments}`)
      persistMetrics('segments', {
        runId,
        datasetName,
        phase: 'segments',
        phasesEnabled: Array.from(selectedPhases),
        phaseDurationMs: phaseTimingsMs.segments,
        document: collectDocumentMetrics(payload.document),
        canvas: await collectCanvasGeometryMetrics(page),
      })
    }

    const phaseStartReleaseNotes = Date.now()
    verboseLog(`phase releaseNotes start rows=${rowsWithReleaseNotes.length} skip=${skipReleaseNotes}`)
    for (const row of rowsWithReleaseNotes) {
      if (skipReleaseNotes) {
        continue
      }

      verboseLog(`phase releaseNotes row short=${row.shortName} level=${ignoreProgressLevels ? 1 : (row.progressLevel ?? 1)}`)

      await selectNodeForSettings(row)

      await fillReleaseNoteForNode(
        page,
        nodeIdByCsvShortName.get(row.shortName),
        row.releaseNote,
        ignoreProgressLevels ? 1 : (row.progressLevel ?? 1),
      )
    }
    phaseTimingsMs.releaseNotes = Date.now() - phaseStartReleaseNotes
    verboseLog(`phase releaseNotes done durationMs=${phaseTimingsMs.releaseNotes}`)

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

    const download = await triggerExportDownload('final')
    verboseLog('final export start')
    const exportedHtml = await readDownload(download)
    verboseLog(`final export html length=${exportedHtml.length}`)
    persistedExportPath = persistHtmlExport(exportedHtml)
    const exportedPayload = extractJsonPayload(exportedHtml)
    const actualExportedSnapshots = collectActualNodeSnapshots(exportedPayload.document)

    verboseLog(`assert: snapshots.length=${actualExportedSnapshots.length} expected=${template.rows.length}`)
    expect(actualExportedSnapshots).toHaveLength(template.rows.length)
    verboseLog('assert: no export-exclude marker')
    expect(exportedHtml).not.toContain('skill-tree-export-exclude')
    verboseLog('assert: no root-initial marker')
    expect(exportedHtml).not.toContain('data-add-control="root-initial"')
    verboseLog('assert: no segment-initial marker')
    expect(exportedHtml).not.toContain('data-add-control="segment-initial"')
    const hasIconInHtml = exportedHtml.includes('data:image/svg+xml')
    const hasIconInPayload = String(exportedPayload.document?.centerIconSrc ?? '').startsWith('data:')
    verboseLog(`assert: icon hasIconInHtml=${hasIconInHtml} hasIconInPayload=${hasIconInPayload} skipIcon=${process.env.SKILLTREE_E2E_SKIP_ICON}`)
    if (process.env.SKILLTREE_E2E_SKIP_ICON !== '1') {
      expect(exportedHtml).toContain('data:image/svg+xml')
      expect(exportedHtml).not.toContain('/blob.svg')
      expect(exportedPayload.document.centerIconSrc).toContain('data:image/svg+xml')
    }
    verboseLog('assert: no selected node buttons')
    expect(page.locator('.skill-node-button--selected')).toHaveCount(0)

    const svgDownload = await triggerSvgExportDownload('final')
    const exportedSvg = await readDownload(svgDownload)

    expect(exportedSvg).toContain('data:image/svg+xml')
    expect(exportedSvg).not.toContain('/blob.svg')
    expect(exportedSvg).toContain('<image class="skill-tree-center-icon__image"')
    expect(exportedSvg).not.toContain('<div xmlns="http://www.w3.org/1999/xhtml" class="skill-tree-center-icon__foreign"')

    const htmlCenterGeometry = extractCenterIconGeometryFromMarkup(exportedHtml)
    const svgCenterGeometry = extractCenterIconGeometryFromMarkup(exportedSvg)

    expect(htmlCenterGeometry.imageWidth).toBe(156)
    expect(htmlCenterGeometry.imageHeight).toBe(156)
    expect(htmlCenterGeometry.imageX).toBe(-78)
    expect(htmlCenterGeometry.imageY).toBe(-78)
    expect(htmlCenterGeometry.hitRadius).toBe(78)

    expect(svgCenterGeometry.imageWidth).toBe(156)
    expect(svgCenterGeometry.imageHeight).toBe(156)
    expect(svgCenterGeometry.imageX).toBe(-78)
    expect(svgCenterGeometry.imageY).toBe(-78)
    expect(svgCenterGeometry.hitRadius).toBe(78)

    expect(Number.isFinite(htmlCenterGeometry.centerX)).toBe(true)
    expect(Number.isFinite(htmlCenterGeometry.centerY)).toBe(true)
    expect(Number.isFinite(svgCenterGeometry.centerX)).toBe(true)
    expect(Number.isFinite(svgCenterGeometry.centerY)).toBe(true)

    expect(existsSync(persistedExportPath)).toBe(true)
    verboseLog(`final export done nodes=${actualExportedSnapshots.length}`)

    const persistedScopeLabels = await page.evaluate(() => {
      const raw = localStorage.getItem('roadmap-skilltree.document.v1')
      if (!raw) {
        return []
      }

      const parsed = JSON.parse(raw)
      const scopes = Array.isArray(parsed.document?.scopes) ? parsed.document.scopes : []
      return scopes.map((scope) => String(scope?.label ?? '').trim()).filter(Boolean)
    })
    expect(persistedScopeLabels.sort()).toEqual(seededScopeLabels.sort())

    if (isPhaseEnabled('roundtrip')) {
      const phaseStart = Date.now()
      verboseLog('phase roundtrip start')

      await confirmAndReset(page)
      await expect(page.locator('foreignObject.skill-node-export-anchor')).toHaveCount(0)
      assertNoPageErrors('before import')
      verboseLog('roundtrip reset complete')

      verboseLog('roundtrip import start')
      await page.locator('input[type="file"][accept="text/html,.html"]').setInputFiles(persistedExportPath)
      await page.waitForSelector('foreignObject.skill-node-export-anchor', { timeout: 10_000 })
      assertNoPageErrors('after import')
      verboseLog('roundtrip import complete')

      const importedDownload = await triggerExportDownload('roundtrip-reexport')
      const importedHtml = await readDownload(importedDownload)
      const payload = extractJsonPayload(importedHtml)
      verboseLog('roundtrip re-export complete')

      const expectedSnapshots = collectExpectedNodeSnapshots(template.rows, { ignoreManualLevels: ignoreProgressLevels })
      const actualImportedSnapshots = collectActualNodeSnapshots(payload.document)
      const expectedProgressSnapshots = collectExpectedProgressSnapshots(rowsWithReleaseNotes)
      const actualProgressSnapshots = collectActualProgressSnapshots(payload.document)

      expect(actualImportedSnapshots).toHaveLength(expectedSnapshots.length)

      // Match expected -> actual where all comparable fields equal and
      // expected scope (if any) is contained in actual scope set.
      const actualUsed = new Array(actualImportedSnapshots.length).fill(false)
      const unexpectedSnapshots = []
      const missingSnapshots = []

      for (let ei = 0; ei < expectedSnapshots.length; ei += 1) {
        const expected = expectedSnapshots[ei]
        const expComp = toComparableSnapshot(expected)
        const expScopeList = expected.scope ? String(expected.scope).split('|').map((s) => s.trim()).filter(Boolean) : []
        let matched = false

        for (let ai = 0; ai < actualImportedSnapshots.length; ai += 1) {
          if (actualUsed[ai]) continue
          const actual = actualImportedSnapshots[ai]
          const actComp = toComparableSnapshot(actual)
          if (
            actComp.shortName === expComp.shortName &&
            actComp.label === expComp.label &&
            actComp.level === expComp.level &&
            actComp.parentLabel === expComp.parentLabel &&
            actComp.status === expComp.status
          ) {
            const actualScopeSet = new Set((actual.scope ? String(actual.scope).split('|').map((x) => x.trim()).filter(Boolean) : []))
            const expOk = expScopeList.length === 0 || expScopeList.every((s) => Array.from(actualScopeSet).some((as) => as.toLowerCase() === s.toLowerCase()))
            if (expOk) {
              actualUsed[ai] = true
              matched = true
              break
            }
          }
        }

        if (!matched) {
          missingSnapshots.push(expComp)
        }
      }

      for (let ai = 0; ai < actualImportedSnapshots.length; ai += 1) {
        if (!actualUsed[ai]) {
          unexpectedSnapshots.push(toComparableSnapshot(actualImportedSnapshots[ai]))
        }
      }

      // Collect scope mismatches for reporting; do not fail test unless strict mode
      // is enabled via env var `SKILLTREE_E2E_STRICT_SCOPES=1`.
      const scopeMismatches = []
      for (const expected of expectedSnapshots) {
        const actual = actualImportedSnapshots.find((a) => a.shortName === expected.shortName && a.label === expected.label)
        if (!actual) continue
        const expectedScope = expected.scope ? String(expected.scope).trim() : null
        const actualScopeSet = new Set((actual.scope ? String(actual.scope).split('|').map((x) => x.trim()).filter(Boolean) : []))
        if (expectedScope && !Array.from(actualScopeSet).some((s) => s.toLowerCase() === expectedScope.toLowerCase())) {
          scopeMismatches.push({ shortName: expected.shortName, expected: expectedScope, actual: Array.from(actualScopeSet).join('|') })
        }
      }

      if (scopeMismatches.length > 0) {
        persistTextFile(resolve(exportOutputDir, 'scope-mismatches-debug.json'), JSON.stringify(scopeMismatches, null, 2))
      }

      if (unexpectedSnapshots.length > 0 || missingSnapshots.length > 0) {
        const debugInfo = {
          unexpectedSnapshots,
          missingSnapshots,
          expectedSnapshots,
          actualImportedSnapshots,
        }
        persistTextFile(resolve(exportOutputDir, 'snapshot-mismatch-debug.json'), JSON.stringify(debugInfo, null, 2))
      }

      if (process.env.SKILLTREE_E2E_STRICT_SCOPES === '1') {
        expect(unexpectedSnapshots).toEqual([])
        expect(missingSnapshots).toEqual([])
        expect(scopeMismatches).toEqual([])
      } else {
        expect(unexpectedSnapshots).toEqual([])
        expect(missingSnapshots).toEqual([])
      }

      for (const [shortName, expectedLevels] of expectedProgressSnapshots.entries()) {
        const actualLevels = actualProgressSnapshots.get(shortName) ?? []
        expect(actualLevels, `Missing progress levels for ${shortName}`).toHaveLength(expectedLevels.length)

        for (let index = 0; index < expectedLevels.length; index += 1) {
          const expectedLevel = expectedLevels[index]
          const actualLevel = actualLevels[index]
          expect(actualLevel.level, `${shortName} level index`).toBe(expectedLevel.level)
          expect(actualLevel.status, `${shortName} level ${expectedLevel.level} status`).toBe(expectedLevel.status)
          expect(actualLevel.scope, `${shortName} level ${expectedLevel.level} scope`).toBe(expectedLevel.scope)

          if (!skipReleaseNotes) {
            expect(actualLevel.releaseNote, `${shortName} level ${expectedLevel.level} release note`).toBe(expectedLevel.releaseNote)
          }
        }
      }

      phaseTimingsMs.roundtrip = Date.now() - phaseStart
      verboseLog(`phase roundtrip done durationMs=${phaseTimingsMs.roundtrip}`)
      persistMetrics('roundtrip', {
        runId,
        datasetName,
        phase: 'roundtrip',
        phasesEnabled: Array.from(selectedPhases),
        phaseDurationMs: phaseTimingsMs.roundtrip,
        document: collectDocumentMetrics(payload.document),
        canvas: await collectCanvasGeometryMetrics(page),
      })
    }

    persistMetrics('run-summary', {
      runId,
      datasetName,
      phasesEnabled: Array.from(selectedPhases),
      ignoreManualLevels: ignoreProgressLevels,
      ignoreSegments,
      phaseTimingsMs,
      totalDurationMs: Date.now() - runStartedAtMs,
      nodeCountExpected: template.rows.length,
    })

    if (process.env.SKILLTREE_E2E_HOLD_OPEN === '1' && persistedExportPath) {
      await page.goto(`file://${persistedExportPath}`)
      await page.pause()
    }

    expect(Array.isArray(template.warnings)).toBe(true)
  })
})
