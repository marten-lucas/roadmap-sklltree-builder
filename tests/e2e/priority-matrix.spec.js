import { test, expect } from '@playwright/test'
import { startFresh } from './helpers.js'

const upsertPlottableNode = async (page) => page.evaluate(() => {
  const raw = localStorage.getItem('roadmap-skilltree.document.v1')
  if (!raw) return false

  const parsed = JSON.parse(raw)
  const payloadIsWrapped = parsed && typeof parsed === 'object' && parsed.document && Array.isArray(parsed.document.children)
  const documentData = payloadIsWrapped ? parsed.document : parsed
  if (!documentData || !Array.isArray(documentData.children)) {
    return false
  }
  const queue = [...(documentData.children ?? [])]
  let updated = false

  while (queue.length > 0) {
    const node = queue.shift()
    if (!updated) {
      node.effort = { size: 'm', customPoints: null }
      node.benefit = { size: 'l' }
      updated = true
    }
    queue.push(...(node.children ?? []))
  }

  if (!updated) {
    return false
  }

  if (payloadIsWrapped) {
    localStorage.setItem('roadmap-skilltree.document.v1', JSON.stringify({ ...parsed, document: documentData }))
  } else {
    localStorage.setItem('roadmap-skilltree.document.v1', JSON.stringify(documentData))
  }
  return true
})

const readCanvasScale = async (page) => page.evaluate(() => {
  const selectors = [
    '.react-transform-component',
    '.react-transform-element',
    '.skill-tree-transform-content',
  ]

  const scales = selectors
    .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
    .map((element) => window.getComputedStyle(element).transform)
    .filter((transform) => transform && transform !== 'none')
    .map((transform) => {
      const matrix = new DOMMatrixReadOnly(transform)
      return Math.abs(matrix.a)
    })

  if (scales.length === 0) {
    return 1
  }

  return Number(Math.max(...scales).toFixed(3))
})

const readNodeDisplayMetrics = async (page, nodeId) => page.evaluate((targetNodeId) => {
  const raw = localStorage.getItem('roadmap-skilltree.document.v1')
  if (!raw) return null

  const parsed = JSON.parse(raw)
  const payloadIsWrapped = parsed && typeof parsed === 'object' && parsed.document && Array.isArray(parsed.document.children)
  const doc = payloadIsWrapped ? parsed.document : parsed
  if (!doc || !Array.isArray(doc.children)) return null

  const queue = [...doc.children]
  while (queue.length > 0) {
    const node = queue.shift()
    if (node.id === targetNodeId) {
      const levels = Array.isArray(node.levels) ? node.levels : []
      const effort = levels.find((level) => level?.effort?.size && level.effort.size !== 'unclear')?.effort ?? node.effort ?? { size: 'unclear' }
      const benefit = levels.find((level) => level?.benefit?.size && level.benefit.size !== 'unclear')?.benefit ?? node.benefit ?? { size: 'unclear' }
      return {
        effort: effort?.size ?? 'unclear',
        benefit: benefit?.size ?? 'unclear',
      }
    }
    queue.push(...(node.children ?? []))
  }

  return null
}, nodeId)

const addDenseMatrixNodes = async (page, count = 16) => page.evaluate((nodeCount) => {
  const raw = localStorage.getItem('roadmap-skilltree.document.v1')
  if (!raw) return false

  const parsed = JSON.parse(raw)
  const payloadIsWrapped = parsed && typeof parsed === 'object' && parsed.document && Array.isArray(parsed.document.children)
  const documentData = payloadIsWrapped ? parsed.document : parsed
  if (!documentData || !Array.isArray(documentData.children) || documentData.children.length === 0) {
    return false
  }

  const targetParent = documentData.children[0]
  const existingChildren = Array.isArray(targetParent.children) ? targetParent.children : []
  targetParent.children = existingChildren

  for (let i = 0; i < nodeCount; i += 1) {
    targetParent.children.push({
      id: `matrix-overflow-${i + 1}`,
      label: `Overflow ${String(i + 1).padStart(2, '0')}`,
      shortName: `O${String(i + 1).padStart(2, '0')}`,
      status: 'later',
      effort: { size: 'm', customPoints: null },
      benefit: { size: 'm' },
      children: [],
    })
  }

  if (payloadIsWrapped) {
    localStorage.setItem('roadmap-skilltree.document.v1', JSON.stringify({ ...parsed, document: documentData }))
  } else {
    localStorage.setItem('roadmap-skilltree.document.v1', JSON.stringify(documentData))
  }
  return true
}, count)

const configureMatrixFilterFixtures = async (page) => page.evaluate(() => {
  const raw = localStorage.getItem('roadmap-skilltree.document.v1')
  if (!raw) return false

  const parsed = JSON.parse(raw)
  const payloadIsWrapped = parsed && typeof parsed === 'object' && parsed.document && Array.isArray(parsed.document.children)
  const documentData = payloadIsWrapped ? parsed.document : parsed
  if (!documentData || !Array.isArray(documentData.children) || documentData.children.length === 0) {
    return false
  }

  documentData.scopes = [
    { id: 'scope-core', label: 'Core', color: '#3b82f6' },
    { id: 'scope-api', label: 'API', color: '#10b981' },
    { id: 'scope-ui', label: 'UI', color: '#f59e0b' },
  ]

  const releaseIds = Array.isArray(documentData.releases) ? documentData.releases.map((release) => release.id).filter(Boolean) : []
  const queue = [...documentData.children]
  const candidates = []

  while (queue.length > 0 && candidates.length < 2) {
    const node = queue.shift()
    if (!node || !node.id) {
      continue
    }
    candidates.push(node)
    queue.push(...(Array.isArray(node.children) ? node.children : []))
  }

  if (candidates.length < 2) {
    return false
  }

  const makeStatuses = (status) => Object.fromEntries(releaseIds.map((releaseId) => [releaseId, status]))
  const applyFixture = (node, label, shortName, status, scopeId) => {
    node.label = label
    node.shortName = shortName
    node.status = status
    node.effort = { size: 'm', customPoints: null }
    node.benefit = { size: 'm' }
    node.levels = [
      {
        id: `${node.id}-matrix-filter-level`,
        label: 'Level 1',
        statuses: makeStatuses(status),
        status,
        releaseNote: '',
        scopeIds: [scopeId],
        additionalDependencyLevelIds: [],
        effort: { size: 'm', customPoints: null },
        benefit: { size: 'm' },
      },
    ]
  }

  applyFixture(candidates[0], 'Matrix API Now', 'API', 'now', 'scope-api')
  applyFixture(candidates[1], 'Matrix UI Later', 'UI', 'later', 'scope-ui')

  if (payloadIsWrapped) {
    localStorage.setItem('roadmap-skilltree.document.v1', JSON.stringify({ ...parsed, document: documentData }))
  } else {
    localStorage.setItem('roadmap-skilltree.document.v1', JSON.stringify(documentData))
  }
  return {
    apiNodeId: candidates[0].id,
    uiNodeId: candidates[1].id,
  }
})

const toScreenPoint = async (page, x, y) => page.locator('.priority-matrix-drawer__content svg').evaluate((svg, coords) => {
  const matrix = svg.getScreenCTM()
  if (!matrix) return null
  const point = svg.createSVGPoint()
  point.x = coords.x
  point.y = coords.y
  const transformed = point.matrixTransform(matrix)
  return {
    x: transformed.x,
    y: transformed.y,
  }
}, { x, y })

test.describe('PriorityMatrix panel', () => {
  test.use({ viewport: { width: 1600, height: 900 } })

  test.beforeEach(async ({ page }) => {
    await startFresh(page)

    const updated = await upsertPlottableNode(page)
    expect(updated).toBe(true)

    await page.reload()
    await page.waitForSelector('foreignObject.skill-node-export-anchor', { state: 'attached', timeout: 15_000 })
    await page.getByRole('button', { name: 'Export', exact: true }).waitFor({ state: 'visible', timeout: 15_000 })
  })

  test('uses a larger default width, fills the matrix height, keeps controls aligned, disables reset, and focuses node at 400%', async ({ page }) => {
    await page.getByRole('button', { name: 'Priority Matrix', exact: true }).click()

    const drawer = page.locator('.priority-matrix-drawer')
    const content = page.locator('.priority-matrix-drawer__content')
    const scopeFilter = page.getByRole('combobox', { name: 'Filter matrix by scope' })
    const statusFilter = page.getByRole('combobox', { name: 'Filter matrix by status' })
    const editButton = page.getByRole('button', { name: 'Toggle matrix edit mode', exact: true })

    await expect(drawer).toBeVisible()
    await expect(content.locator('svg')).toBeVisible()
    await expect(scopeFilter).toBeVisible()
    await expect(statusFilter).toBeVisible()
    await expect(editButton).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reset zoom', exact: true })).toHaveCount(0)
    await expect(content.locator('svg text').filter({ hasText: 'Benefit →' }).first()).toBeVisible()

    const drawerBox = await drawer.boundingBox()
    expect(drawerBox).toBeTruthy()
    expect(drawerBox.width).toBeGreaterThan(700)
    expect(drawerBox.width).toBeLessThan(780)

    const svg = content.locator('svg')
    const svgHeightRatio = await svg.evaluate((element) => {
      const svgBox = element.getBoundingClientRect()
      const contentBox = element.parentElement?.getBoundingClientRect()
      if (!contentBox) return 0
      return svgBox.height / contentBox.height
    })
    expect(svgHeightRatio).toBeGreaterThan(0.97)

    const filterBox = await scopeFilter.boundingBox()
    const editBox = await editButton.boundingBox()
    expect(filterBox).toBeTruthy()
    expect(editBox).toBeTruthy()
    expect(Math.abs(filterBox.y - editBox.y)).toBeLessThan(4)

    const firstGridCell = content.locator('svg rect').first()
    await expect(firstGridCell).toBeVisible()
    const cellRatio = await firstGridCell.evaluate((element) => {
      const box = element.getBoundingClientRect()
      return box.width / box.height
    })
    expect(cellRatio).toBeGreaterThan(0.98)
    expect(cellRatio).toBeLessThan(1.02)

    const firstMatrixNode = content.locator('.priority-matrix__node').first()
    await expect(firstMatrixNode).toBeVisible()

    const matrixNodeId = await content.locator('g[data-node-id]').first().getAttribute('data-node-id')
    expect(matrixNodeId).toBeTruthy()

    await firstMatrixNode.click()

    const selectedCanvasNode = page.locator(`foreignObject.skill-node-export-anchor[data-node-id="${matrixNodeId}"]`)
    await expect(selectedCanvasNode).toHaveAttribute('data-selected', 'true')
    await expect(page.locator('.skill-panel--inspector')).toHaveCount(0)

    const selectedCenter = await selectedCanvasNode.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return {
        x: rect.left + rect.width / 2,
      }
    })
    expect(selectedCenter.x).toBeGreaterThan(900)

    await expect
      .poll(async () => readCanvasScale(page))
      .toBeGreaterThan(3.95)

    const scale = await readCanvasScale(page)
    expect(scale).toBeLessThan(4.05)

    await expect(content).toHaveScreenshot('priority-matrix-content.png', {
      maxDiffPixelRatio: 0.04,
    })
  })

  test('keeps labels visible up to 16 nodes in a single cell', async ({ page }) => {
    const injected = await addDenseMatrixNodes(page, 16)
    expect(injected).toBe(true)

    await page.reload()
    await page.waitForSelector('foreignObject.skill-node-export-anchor', { state: 'attached', timeout: 15_000 })

    await page.getByRole('button', { name: 'Priority Matrix', exact: true }).click()

    const content = page.locator('.priority-matrix-drawer__content')
    await expect(content.locator('g[data-node-id="matrix-overflow-1"] .priority-matrix__node')).toBeVisible()
    await expect(content.locator('g[data-node-id="matrix-overflow-1"] text')).toHaveCount(1)
    await expect(content.locator('.priority-matrix__overflow-chip')).toHaveCount(0)
  })

  test('supports edit mode drag to reassign effort and benefit', async ({ page }) => {
    await page.getByRole('button', { name: 'Priority Matrix', exact: true }).click()

    const content = page.locator('.priority-matrix-drawer__content')
    const matrixNodeGroup = content.locator('g[data-node-id]').first()
    const nodeId = await matrixNodeGroup.getAttribute('data-node-id')
    expect(nodeId).toBeTruthy()

    await page.getByRole('button', { name: 'Toggle matrix edit mode', exact: true }).click()

    const sourcePoint = await matrixNodeGroup.evaluate((group) => {
      const circle = group.querySelector('circle.priority-matrix__node')
      return {
        x: Number(circle?.getAttribute('cx') ?? 0),
        y: Number(circle?.getAttribute('cy') ?? 0),
      }
    })

    const start = await toScreenPoint(page, sourcePoint.x, sourcePoint.y)
    const target = await toScreenPoint(page, 48 + 5 * 100 + 50, 48 + 0 * 100 + 50)
    expect(start).toBeTruthy()
    expect(target).toBeTruthy()

    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(target.x, target.y)
    await page.mouse.up()

    await expect
      .poll(async () => readNodeDisplayMetrics(page, nodeId))
      .toMatchObject({ effort: 'xl', benefit: 'xl' })
  })

  test('switches to compact nodes without labels between 17 and 32 nodes in a cell', async ({ page }) => {
    const injected = await addDenseMatrixNodes(page, 18)
    expect(injected).toBe(true)

    await page.reload()
    await page.waitForSelector('foreignObject.skill-node-export-anchor', { state: 'attached', timeout: 15_000 })

    await page.getByRole('button', { name: 'Priority Matrix', exact: true }).click()

    const content = page.locator('.priority-matrix-drawer__content')
    await expect(content.locator('.priority-matrix__overflow-chip')).toHaveCount(0)
    await expect(content.locator('g[data-node-id="matrix-overflow-1"] .priority-matrix__node')).toBeVisible()
    await expect(content.locator('g[data-node-id="matrix-overflow-1"] text')).toHaveCount(0)
    await expect(content.locator('g[data-node-id^="matrix-overflow-"]')).toHaveCount(18)
  })

  test('shows a +x overflow chip and hidden node list on hover above 32 nodes in a cell', async ({ page }) => {
    const injected = await addDenseMatrixNodes(page, 40)
    expect(injected).toBe(true)

    await page.reload()
    await page.waitForSelector('foreignObject.skill-node-export-anchor', { state: 'attached', timeout: 15_000 })

    await page.getByRole('button', { name: 'Priority Matrix', exact: true }).click()

    const content = page.locator('.priority-matrix-drawer__content')
    const overflowChip = content.locator('.priority-matrix__overflow-chip').first()
    await expect(overflowChip).toBeVisible()
    await expect(overflowChip.locator('text')).toHaveText('+8')
    await expect(content.locator('g[data-node-id^="matrix-overflow-"]')).toHaveCount(32)

    await overflowChip.hover()
    await expect(content.locator('.priority-matrix__tooltip-title').filter({ hasText: 'Hidden in this cell (8)' })).toBeVisible()
    await expect(content.locator('.priority-matrix__tooltip-row').filter({ hasText: 'Overflow' }).first()).toBeVisible()
  })

  test('filters the matrix by scope and status', async ({ page }) => {
    const configured = await configureMatrixFilterFixtures(page)
    expect(configured).toBeTruthy()
    const { apiNodeId, uiNodeId } = configured

    await page.reload()
    await page.waitForSelector('foreignObject.skill-node-export-anchor', { state: 'attached', timeout: 15_000 })

    await page.getByRole('button', { name: 'Priority Matrix', exact: true }).click()

    const content = page.locator('.priority-matrix-drawer__content')
    const scopeFilter = page.getByRole('combobox', { name: 'Filter matrix by scope' })
    const statusFilter = page.getByRole('combobox', { name: 'Filter matrix by status' })

    await expect(scopeFilter).toBeVisible()
    await expect(statusFilter).toBeVisible()

    await scopeFilter.selectOption('scope-api')
    await expect(content.locator(`g[data-node-id="${apiNodeId}"]`)).toBeVisible()
    await expect(content.locator(`g[data-node-id="${uiNodeId}"]`)).toHaveCount(0)

    await scopeFilter.selectOption('scope-ui')
    await expect(content.locator(`g[data-node-id="${apiNodeId}"]`)).toHaveCount(0)
    await expect(content.locator(`g[data-node-id="${uiNodeId}"]`)).toBeVisible()

    await statusFilter.selectOption('later')
    await scopeFilter.selectOption({ label: 'All Scopes' })
    await expect(content.locator(`g[data-node-id="${uiNodeId}"]`)).toBeVisible()
  })
})
