import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test, expect } from '@playwright/test'
import {
  clickInitialRootAddControl,
  clickInitialSegmentAddControl,
  confirmAndReset,
  getInspectorScopeLabels,
  parseSkillTreeCsvTemplate,
  selectNodeByShortName,
  setSelectValueByLabel,
  startFresh,
  trySetScopeByLabel,
} from './helpers.js'

const DOCUMENT_KEY = 'roadmap-skilltree.document.v1'

const findNode = (nodes, predicate) => {
  for (const node of nodes ?? []) {
    if (predicate(node)) {
      return node
    }

    const nested = findNode(node.children, predicate)
    if (nested) {
      return nested
    }
  }

  return null
}

const getPersistedDocument = async (page) => page.evaluate((key) => {
  const raw = localStorage.getItem(key)
  if (!raw) {
    return null
  }

  const parsed = JSON.parse(raw)
  return parsed.document ?? parsed
}, DOCUMENT_KEY)

const getNodeByShortName = (document, shortName) => (
  findNode(document?.children, (node) => String(node.shortName ?? '').trim() === shortName)
)

const getNodeByLabel = (document, label) => (
  findNode(document?.children, (node) => String(node.label ?? '').trim() === label)
)

const getNodeAnchor = (page, shortName) => (
  page.locator(`foreignObject.skill-node-export-anchor[data-short-name="${shortName}"]`).first()
)

const getNodeButton = (page, shortName) => (
  getNodeAnchor(page, shortName).locator('.skill-node-button').first()
)

const largeDatasetCsvPath = resolve(process.cwd(), 'tests/e2e/datasets/large.csv')
const largeDatasetTemplate = parseSkillTreeCsvTemplate(readFileSync(largeDatasetCsvPath, 'utf-8'))

const waitForPersistedNodeLabel = async (page, label) => {
  await page.waitForFunction(({ key, value }) => {
    const raw = localStorage.getItem(key)
    if (!raw) {
      return false
    }

    const parsed = JSON.parse(raw)
    const document = parsed.document ?? parsed
    const stack = [...(document.children ?? [])]

    while (stack.length > 0) {
      const node = stack.shift()
      if (String(node.label ?? '').trim() === value) {
        return true
      }

      stack.push(...(node.children ?? []))
    }

    return false
  }, { key: DOCUMENT_KEY, value: label })
}

const waitForPersistedNodeShortName = async (page, shortName) => {
  await page.waitForFunction(({ key, value }) => {
    const raw = localStorage.getItem(key)
    if (!raw) {
      return false
    }

    const parsed = JSON.parse(raw)
    const document = parsed.document ?? parsed
    const stack = [...(document.children ?? [])]

    while (stack.length > 0) {
      const node = stack.shift()
      if (String(node.shortName ?? '').trim() === value) {
        return true
      }

      stack.push(...(node.children ?? []))
    }

    return false
  }, { key: DOCUMENT_KEY, value: shortName })
}

const waitForPersistedSegmentLabel = async (page, label) => {
  await page.waitForFunction(({ key, value }) => {
    const raw = localStorage.getItem(key)
    if (!raw) {
      return false
    }

    const parsed = JSON.parse(raw)
    const document = parsed.document ?? parsed
    return Array.isArray(document.segments) && document.segments.some((segment) => String(segment.label ?? '').trim() === value)
  }, { key: DOCUMENT_KEY, value: label })
}

const waitForPersistedScopeLabel = async (page, label) => {
  await page.waitForFunction(({ key, value }) => {
    const raw = localStorage.getItem(key)
    if (!raw) {
      return false
    }

    const parsed = JSON.parse(raw)
    const document = parsed.document ?? parsed
    return Array.isArray(document.scopes) && document.scopes.some((scope) => String(scope.label ?? '').trim() === value)
  }, { key: DOCUMENT_KEY, value: label })
}

const chooseAllowedSegmentOption = async (page) => {
  const options = page.getByRole('option').filter({ visible: true })
  const visibleOptions = await options.evaluateAll((elements) => elements.map((element) => ({
    text: String(element.textContent ?? '').replace(/^\s*●\s*/, '').trim(),
    disabled: element.getAttribute('aria-disabled') === 'true'
      || element.hasAttribute('data-combobox-disabled')
      || element.hasAttribute('data-disabled'),
  })).filter((entry) => entry.text.length > 0))

  const chosen = visibleOptions.find((entry) => entry.text !== 'Ohne Segment' && !entry.disabled)
  if (!chosen) {
    throw new Error('No assignable segment option was available in the dropdown.')
  }

  await page.getByRole('option', { name: chosen.text, exact: true }).filter({ visible: true }).first().click({ force: true })
  return chosen.text
}

const blurActiveElement = async (page) => {
  await page.evaluate(() => {
    const activeElement = document.activeElement
    if (activeElement instanceof HTMLElement) {
      activeElement.blur()
    }
  })
}

const waitForPersistedDependency = async (page, sourceShortName, targetShortName) => {
  await page.waitForFunction(({ key, source, target }) => {
    const raw = localStorage.getItem(key)
    if (!raw) {
      return false
    }

    const parsed = JSON.parse(raw)
    const document = parsed.document ?? parsed
    const stack = [...(document.children ?? [])]
    let sourceNode = null
    let targetNode = null

    while (stack.length > 0) {
      const node = stack.shift()
      if (String(node.shortName ?? '').trim() === source) {
        sourceNode = node
      }

      if (String(node.shortName ?? '').trim() === target) {
        targetNode = node
      }

      stack.push(...(node.children ?? []))
    }

    return Boolean(
      sourceNode
      && targetNode
      && Array.isArray(sourceNode.additionalDependencyIds)
      && sourceNode.additionalDependencyIds.includes(targetNode.id),
    )
  }, { key: DOCUMENT_KEY, source: sourceShortName, target: targetShortName })
}

const openToolbarMenuIfNeeded = async (page) => {
  const toggle = page.locator('.skill-tree-toolbar [aria-label="Menü aufklappen"]').first()
  if (await toggle.count()) {
    await toggle.click()
  }
}

const openFilterMenu = async (page) => {
  await page.getByRole('button', { name: 'Filter' }).click()
}

const createToolbarSegment = async (page, label) => {
  await openToolbarMenuIfNeeded(page)
  await page.locator('.skill-tree-toolbar [aria-label="Segmente verwalten"]').first().click()
  await page.waitForSelector('.skill-panel--segments', { timeout: 10_000 })
  const panel = page.locator('.skill-panel--segments')
  await panel.getByRole('textbox', { name: 'Segmente verwalten', exact: true }).fill(label)
  await panel.getByRole('button', { name: 'Segment hinzufügen' }).click()
  await waitForPersistedSegmentLabel(page, label)
}

const createToolbarScope = async (page, label) => {
  await openToolbarMenuIfNeeded(page)
  await page.locator('.skill-tree-toolbar [aria-label="Scopes verwalten"]').first().click()
  await page.waitForSelector('.skill-panel--scopes', { timeout: 10_000 })
  const panel = page.locator('.skill-panel--scopes')
  await panel.getByRole('textbox', { name: 'Scopes verwalten', exact: true }).fill(label)
  await panel.getByRole('button', { name: 'Scope hinzufügen' }).click()
  await waitForPersistedScopeLabel(page, label)
}

test.describe('Phase 3 regressions', () => {
  test.beforeEach(async ({ page }) => {
    await startFresh(page)
  })

  test('creates a root node and persists name, shortname, and status changes', async ({ page }) => {
    await confirmAndReset(page)
    await expect(page.locator('foreignObject.skill-node-export-anchor')).toHaveCount(0)

    await clickInitialRootAddControl(page)

    const inspector = page.locator('.skill-panel--inspector')
    await inspector.waitFor({ state: 'visible', timeout: 10_000 })

    const selectedNodeId = await inspector.getAttribute('data-selected-node-id')
    expect(selectedNodeId).toBeTruthy()

    await inspector.getByLabel('Name', { exact: true }).fill('Regression Root')
    await inspector.getByLabel('Shortname', { exact: true }).fill('RGR')
    await inspector.getByLabel('Shortname', { exact: true }).press('Tab')
    await setSelectValueByLabel(page, 'Status', 'Now')
    await blurActiveElement(page)

    await waitForPersistedNodeLabel(page, 'Regression Root')

    const document = await getPersistedDocument(page)
    const node = getNodeByLabel(document, 'Regression Root')

    expect(node).toBeTruthy()
    expect(node.id).toBe(selectedNodeId)
    expect(node.shortName).toBe('RGR')
    expect(node.status).toBe('now')
    await expect(getNodeButton(page, 'RGR')).toBeVisible()
  })

  test('adds a level, stores different level statuses, and renders the level ring', async ({ page }) => {
    await selectNodeByShortName(page, 'FND')

    const inspector = page.locator('.skill-panel--inspector')
    await inspector.waitFor({ state: 'visible', timeout: 10_000 })

    await inspector.getByRole('button', { name: 'Level hinzufügen' }).click()
    await page.getByRole('tab', { name: 'L1' }).click()
    await setSelectValueByLabel(page, 'Status', 'Done')
    await page.getByRole('tab', { name: 'L2' }).click()
    await setSelectValueByLabel(page, 'Status', 'Next')
    await blurActiveElement(page)

    await waitForPersistedNodeShortName(page, 'FND')

    const document = await getPersistedDocument(page)
    const node = getNodeByShortName(document, 'FND')

    expect(node.levels).toHaveLength(2)
    expect(node.levels.map((level) => level.status)).toEqual(expect.arrayContaining(['done', 'next']))
    await expect(getNodeAnchor(page, 'FND').locator('.skill-node-level-ring')).toHaveCount(1)
    await expect(getNodeAnchor(page, 'FND').locator('.skill-node-level-glow')).toHaveCount(2)

    const ringStyle = await getNodeAnchor(page, 'FND').locator('.skill-node-level-ring').getAttribute('style')
    expect(ringStyle).toContain('conic-gradient')
  })

  test('creates a segment on the empty canvas after reset', async ({ page }) => {
    await confirmAndReset(page)
    await expect(page.locator('foreignObject.skill-node-export-anchor')).toHaveCount(0)

    await clickInitialSegmentAddControl(page)
    const panel = page.locator('.skill-panel--segment')
    await panel.getByRole('textbox', { name: 'Name', exact: true }).fill('Canvas Segment')
    await panel.getByRole('button', { name: 'Segment hinzufügen' }).click()
    await waitForPersistedSegmentLabel(page, 'Canvas Segment')

    const document = await getPersistedDocument(page)
    expect(document.segments.map((segment) => segment.label)).toContain('Canvas Segment')
  })

  test('creates a segment from the toolbar manager', async ({ page }) => {
    const label = 'Toolbar Segment'

    await createToolbarSegment(page, label)

    const document = await getPersistedDocument(page)
    expect(document.segments.map((segment) => segment.label)).toContain(label)
  })

  test('creates a scope from the toolbar manager and exposes it in the inspector', async ({ page }) => {
    const label = 'Toolbar Scope'

    await createToolbarScope(page, label)
    await selectNodeByShortName(page, 'API')

    const inspector = page.locator('.skill-panel--inspector')
    await inspector.waitFor({ state: 'visible', timeout: 10_000 })
    const scopeInput = inspector.locator('.skill-panel__scope-block').getByPlaceholder('Scopes')
    await scopeInput.click()
    await expect(page.getByRole('option', { name: label, exact: true }).filter({ visible: true })).toBeVisible()

    const document = await getPersistedDocument(page)
    expect(document.scopes.map((scope) => scope.label)).toContain(label)
  })

  test('assigns a node to another segment through the inspector', async ({ page }) => {
    const label = 'Assignable Segment'

    await createToolbarSegment(page, label)
    await selectNodeByShortName(page, 'API')

    const inspector = page.locator('.skill-panel--inspector')
    await inspector.waitFor({ state: 'visible', timeout: 10_000 })
    const segmentSelect = inspector.getByLabel('Segment', { exact: true })
    await segmentSelect.click()
    await chooseAllowedSegmentOption(page)

    const document = await getPersistedDocument(page)
    const node = getNodeByShortName(document, 'API')
    const currentSegment = document.segments.find((segment) => segment.id === node.segmentId)

    expect(node.segmentId).toBeTruthy()
    expect(currentSegment).toBeTruthy()
  })

  test('creates a segment from the inspector panel', async ({ page }) => {
    const label = 'Inspector Segment'

    await selectNodeByShortName(page, 'BCK')
    const inspector = page.locator('.skill-panel--inspector')
    await inspector.waitFor({ state: 'visible', timeout: 10_000 })
    await inspector.locator('[aria-label="Segmente verwalten"]').click()
    await inspector.getByRole('textbox', { name: 'Segmente verwalten', exact: true }).fill(label)
    await inspector.getByRole('button', { name: 'Segment hinzufügen' }).click()
    await waitForPersistedSegmentLabel(page, label)

    const document = await getPersistedDocument(page)
    expect(document.segments.map((segment) => segment.label)).toContain(label)
    await expect(page.locator('.skill-panel--inspector').getByText(label, { exact: true })).toBeVisible()
  })

  test('creates and assigns a scope through the inspector panel', async ({ page }) => {
    const label = 'Inspector Scope'

    await selectNodeByShortName(page, 'API')
    const inspector = page.locator('.skill-panel--inspector')
    await inspector.waitFor({ state: 'visible', timeout: 10_000 })
    await inspector.locator('[aria-label="Scopes verwalten"]').click()
    await inspector.getByRole('button', { name: 'Scope hinzufügen' }).click()

    await waitForPersistedScopeLabel(page, label)

    const document = await getPersistedDocument(page)
    const scope = document.scopes.find((entry) => entry.label === label)
    const node = getNodeByShortName(document, 'API')

    expect(scope).toBeTruthy()
    expect(node.levels[0].scopeIds).toContain(scope.id)

    const inspectorScopeLabels = await getInspectorScopeLabels(page)
    expect(inspectorScopeLabels).toContain(label)
  })

  test('filters the canvas by scope', async ({ page }) => {
    const label = 'Filter Scope'

    await selectNodeByShortName(page, 'API')
    const inspector = page.locator('.skill-panel--inspector')
    await inspector.waitFor({ state: 'visible', timeout: 10_000 })
    await inspector.locator('[aria-label="Scopes verwalten"]').click()
    await inspector.getByRole('textbox', { name: 'Scopes verwalten', exact: true }).fill(label)
    await inspector.getByRole('button', { name: 'Scope hinzufügen' }).click()
    await waitForPersistedScopeLabel(page, label)

    await openFilterMenu(page)
    await page.getByRole('menuitem', { name: label, exact: true }).click()

    await expect(page.locator('foreignObject.skill-node-export-anchor')).toHaveCount(1)
    await expect(getNodeAnchor(page, 'API')).toBeVisible()

    const visibleShortNames = await page
      .locator('foreignObject.skill-node-export-anchor')
      .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-short-name')))

    expect(visibleShortNames).toEqual(['API'])
  })

  test('filters the canvas by release status', async ({ page }) => {
    await openFilterMenu(page)
    await page.getByRole('menuitem', { name: 'Now', exact: true }).click()

    await expect(getNodeAnchor(page, 'FND')).toBeVisible()
    await expect(getNodeAnchor(page, 'BCK')).toBeVisible()
    await expect(getNodeAnchor(page, 'DBM')).toBeVisible()

    await expect(getNodeButton(page, 'FND')).toHaveClass(/skill-node-button--minimal/)
    await expect(getNodeButton(page, 'BCK')).not.toHaveClass(/skill-node-button--minimal/)
    await expect(getNodeButton(page, 'DBM')).toHaveClass(/skill-node-button--minimal/)

    await openFilterMenu(page)
    await page.getByRole('menuitem', { name: 'Next', exact: true }).click()

    await expect(getNodeAnchor(page, 'FND')).toBeVisible()
    await expect(getNodeAnchor(page, 'BCK')).toBeVisible()
    await expect(getNodeAnchor(page, 'DBM')).toBeVisible()
    await expect(getNodeButton(page, 'FND')).toHaveClass(/skill-node-button--minimal/)
    await expect(getNodeButton(page, 'BCK')).not.toHaveClass(/skill-node-button--minimal/)
    await expect(getNodeButton(page, 'DBM')).toHaveClass(/skill-node-button--minimal/)
  })

  test('renders additional dependency portals after assigning a dependency', async ({ page }) => {
    await selectNodeByShortName(page, 'API')
    const inspector = page.locator('.skill-panel--inspector')
    await inspector.waitFor({ state: 'visible', timeout: 10_000 })

    const dependencyInput = inspector.getByLabel('Additional Dependencies', { exact: true })
    await dependencyInput.click()
    await page.getByRole('option', { name: 'Frontend (FND)', exact: true }).click({ force: true })

    await expect(inspector.getByText('Frontend (FND)', { exact: true })).toBeVisible()
    await waitForPersistedDependency(page, 'API', 'FND')

    const document = await getPersistedDocument(page)
    const sourceNode = getNodeByShortName(document, 'API')
    const targetNode = getNodeByShortName(document, 'FND')

    expect(sourceNode.additionalDependencyIds).toContain(targetNode.id)
    await expect(page.locator(`.skill-tree-portal[data-portal-source-id="${sourceNode.id}"][data-portal-target-id="${targetNode.id}"]`)).toHaveCount(2)
  })

  test('zooms and pans the canvas around rendered nodes', async ({ page }) => {
    const canvas = page.locator('svg.skill-tree-canvas')
    const node = getNodeAnchor(page, 'FND')
    const before = await node.boundingBox()

    expect(before).toBeTruthy()

    const canvasBox = await canvas.boundingBox()
    expect(canvasBox).toBeTruthy()

    await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2)
    await page.mouse.wheel(0, -1200)
    await page.waitForTimeout(250)

    const afterZoom = await node.boundingBox()
    expect(afterZoom.width).toBeGreaterThan(before.width)

    await page.mouse.move(canvasBox.x + 80, canvasBox.y + 80)
    await page.mouse.down()
    await page.mouse.move(canvasBox.x + 220, canvasBox.y + 150, { steps: 12 })
    await page.mouse.up()
    await page.waitForTimeout(250)

    const afterPan = await node.boundingBox()
    expect(afterPan.x).not.toBe(before.x)
    expect(afterPan.y).not.toBe(before.y)
  })

  test('imports the large dataset and keeps the center icon aligned with the radial center', async ({ page }) => {
    const pageErrors = []
    page.on('pageerror', (error) => {
      pageErrors.push(error)
    })

    await confirmAndReset(page)
    await expect(page.locator('foreignObject.skill-node-export-anchor')).toHaveCount(0)

    await page.getByRole('button', { name: 'HTML importieren', exact: true }).hover()
    await expect(page.getByRole('menuitem', { name: 'CSV', exact: true })).toBeVisible()

    await page.locator('input[type="file"][accept="text/csv,.csv"]').setInputFiles(largeDatasetCsvPath)

    const dialog = page.getByRole('dialog', { name: 'CSV-Import Optionen' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Importieren' }).click()
    await expect(dialog).toBeHidden()

    await expect(page.locator('foreignObject.skill-node-export-anchor')).toHaveCount(largeDatasetTemplate.rows.length, { timeout: 120_000 })

    const geometry = await page.evaluate(() => {
      const halo = document.querySelector('circle[fill="url(#nodeHalo)"]')
      const centerForeign = document.querySelector('.skill-tree-center-icon__foreign')

      if (!halo || !centerForeign) {
        return null
      }

      const haloRect = halo.getBoundingClientRect()
      const centerRect = centerForeign.getBoundingClientRect()

      return {
        haloCenterX: haloRect.x + haloRect.width / 2,
        haloCenterY: haloRect.y + haloRect.height / 2,
        iconCenterX: centerRect.x + centerRect.width / 2,
        iconCenterY: centerRect.y + centerRect.height / 2,
      }
    })

    expect(geometry).toBeTruthy()
    expect(Math.abs(geometry.iconCenterX - geometry.haloCenterX)).toBeLessThan(1)
    expect(Math.abs(geometry.iconCenterY - geometry.haloCenterY)).toBeLessThan(1)
    expect(pageErrors).toHaveLength(0)
  })
})