import { mkdir, copyFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test, expect } from '@playwright/test'
import { startFresh, readDownload, extractJsonPayload } from './helpers.js'

const STATUS_UI_LABEL = {
  done: 'Done',
  now: 'Now',
  next: 'Next',
  later: 'Later',
}

const node = (label, status, children = []) => ({
  label,
  name: label,
  shortName: label,
  status,
  children,
})

// Template analysis (from confidential figma export):
// - Parent links always point to the previous level.
// - Long, radial-breaking relations are modeled as additional dependencies (portal links).
const TEMPLATE_ROOTS = [
  node('SA1', 'next', [
    node('SEA', 'later', [
      node('MM', 'later', [
        node('CC', 'now'),
      ]),
    ]),
    node('SA', 'later', [
      node('NAH', 'next', [
        node('IVP', 'next'),
      ]),
    ]),
  ]),
  node('COK', 'next', [
    node('COD', 'next', [
      node('RAD', 'done'),
    ]),
    node('CCL', 'now'),
    node('PPK', 'done', [
      node('PPD', 'done', [
        node('FLD', 'now'),
      ]),
    ]),
  ]),
  node('LKE', 'next', [
    node('R4P', 'next', [
      node('JFS', 'later'),
    ]),
    node('PDB', 'now', [
      node('PLT', 'done', [
        node('CLT', 'done'),
      ]),
    ]),
  ]),
  node('CRA', 'next', [
    node('CCP', 'next'),
    node('TNC', 'done', [
      node('LAN', 'done', [
        node('LCT', 'done'),
      ]),
    ]),
    node('RCA', 'done', [
      node('CCC', 'later'),
    ]),
    node('CCA', 'later'),
  ]),
  node('MFR', 'later'),
]

const TEMPLATE_DEPENDENCIES = {
  CCL: ['PLT'],
  NAH: ['COK'],
  R4P: ['SA1'],
  TNC: ['FLD'],
  CCP: ['RCA'],
}

const normalizeStatus = (value) => {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'done' || normalized === 'now' || normalized === 'next' || normalized === 'later') {
    return normalized
  }
  return 'later'
}

const flattenBlueprint = (roots, dependenciesByLabel) => {
  const entries = []

  const visit = (entry, parentLabel = null) => {
    entries.push({
      label: entry.label,
      name: entry.name,
      shortName: entry.shortName,
      status: normalizeStatus(entry.status),
      parentLabel,
      dependencies: [...(dependenciesByLabel[entry.label] ?? [])].sort(),
    })

    for (const child of entry.children ?? []) {
      visit(child, entry.label)
    }
  }

  for (const root of roots) {
    visit(root, null)
  }

  return entries.sort((left, right) => left.label.localeCompare(right.label))
}

const flattenDocument = (document) => {
  const idToLabel = new Map()
  const queue = [...(document.children ?? [])]

  while (queue.length > 0) {
    const current = queue.shift()
    idToLabel.set(current.id, current.label)
    queue.push(...(current.children ?? []))
  }

  const entries = []

  const visit = (entry, parentLabel = null) => {
    const levels = Array.isArray(entry.levels) ? entry.levels : []
    const primaryLevel = levels[0]
    const status = normalizeStatus(primaryLevel?.status ?? entry.status)
    const dependencies = Array.isArray(entry.additionalDependencyIds)
      ? entry.additionalDependencyIds
        .map((id) => idToLabel.get(id))
        .filter(Boolean)
        .sort()
      : []

    entries.push({
      label: entry.label,
      name: entry.label,
      shortName: String(entry.shortName ?? '').trim(),
      status,
      parentLabel,
      dependencies,
    })

    for (const child of entry.children ?? []) {
      visit(child, entry.label)
    }
  }

  for (const root of document.children ?? []) {
    visit(root, null)
  }

  return entries.sort((left, right) => left.label.localeCompare(right.label))
}

const clickResetWithConfirm = async (page) => {
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Reset' }).click()
}

const selectNode = async (page, label) => {
  const locator = page.locator(`foreignObject.skill-node-export-anchor[data-export-label="${label}"] .skill-node-button`).first()
  await expect(locator).toBeVisible()
  await locator.click()
  await expect(page.locator('.skill-panel--inspector')).toBeVisible()
}

const clickSelectedNodeControl = async (page, index) => {
  const controls = page
    .locator('svg.skill-tree-canvas > g.skill-tree-export-exclude')
    .last()
    .locator(':scope > g.skill-tree-clickable')

  await expect(controls.nth(index)).toBeVisible()
  await controls.nth(index).click()
}

const setStatus = async (page, statusKey) => {
  const desired = STATUS_UI_LABEL[normalizeStatus(statusKey)]
  const statusInput = page.locator('.skill-panel--inspector').getByLabel('Status')
  await statusInput.click()
  await page.getByRole('option', { name: desired, exact: true }).click()
}

const configureSelectedNode = async (page, entry) => {
  const panel = page.locator('.skill-panel--inspector')
  await expect(panel).toBeVisible()

  await panel.getByLabel('Name').fill(entry.name)
  await panel.getByLabel('Shortname').fill(entry.shortName)
  await setStatus(page, entry.status)

  await expect(panel.locator('.skill-panel__selected-value')).toHaveText(entry.name)
}

const addInitialRoot = async (page, entry) => {
  const addRootControl = page.locator('svg.skill-tree-canvas circle.skill-tree-add-circle[r="22"]')
  await expect(addRootControl).toBeVisible()
  await addRootControl.click()
  await configureSelectedNode(page, entry)
}

const addRootNear = async (page, anchorLabel, entry) => {
  await selectNode(page, anchorLabel)
  await clickSelectedNodeControl(page, 2)
  await configureSelectedNode(page, entry)
}

const addChild = async (page, parentLabel, entry) => {
  await selectNode(page, parentLabel)
  await clickSelectedNodeControl(page, 0)
  await configureSelectedNode(page, entry)
}

const buildBranch = async (page, parentEntry) => {
  for (const child of parentEntry.children ?? []) {
    await addChild(page, parentEntry.label, child)
    await buildBranch(page, child)
  }
}

const applyAdditionalDependencies = async (page, dependenciesBySourceLabel) => {
  const sourceLabels = Object.keys(dependenciesBySourceLabel)

  for (const sourceLabel of sourceLabels) {
    const targetLabels = dependenciesBySourceLabel[sourceLabel] ?? []
    await selectNode(page, sourceLabel)

    const input = page.locator('.skill-panel--inspector').getByLabel('Additional Dependencies')
    await expect(input).toBeVisible()

    for (const targetLabel of targetLabels) {
      await input.click()
      await input.fill(targetLabel)
      await page.getByRole('option', { name: new RegExp(targetLabel, 'i') }).first().click()
    }

    await page.keyboard.press('Escape')
  }
}

const exportHtmlAndKeepFile = async (page) => {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.keyboard.press('Control+s'),
  ])

  const html = await readDownload(download)
  const tempDownloadPath = await download.path()

  if (!tempDownloadPath) {
    throw new Error('Playwright did not provide a download path for exported HTML.')
  }

  const exportDir = path.join(tmpdir(), 'roadmap-skilltree-private-exports')
  await mkdir(exportDir, { recursive: true })

  const savedPath = path.join(exportDir, `kyana-template-${Date.now()}.html`)
  await copyFile(tempDownloadPath, savedPath)

  return { html, savedPath }
}

const importHtmlFromFile = async (page, filePath) => {
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByLabel('HTML importieren').click(),
  ])

  await fileChooser.setFiles(filePath)
}

test.describe('Kyana template user flow', () => {
  test('builds template-like tree, exports, resets, imports, and verifies exact structure/settings', async ({ page }, testInfo) => {
    test.setTimeout(240_000)

    await startFresh(page)
    await clickResetWithConfirm(page)
    await expect(page.locator('foreignObject.skill-node-export-anchor')).toHaveCount(0)

    await addInitialRoot(page, TEMPLATE_ROOTS[0])

    for (let index = 1; index < TEMPLATE_ROOTS.length; index += 1) {
      await addRootNear(page, TEMPLATE_ROOTS[index - 1].label, TEMPLATE_ROOTS[index])
    }

    for (const root of TEMPLATE_ROOTS) {
      await buildBranch(page, root)
    }

    await applyAdditionalDependencies(page, TEMPLATE_DEPENDENCIES)

    const { html: exportedHtml, savedPath } = await exportHtmlAndKeepFile(page)
    const preResetPayload = extractJsonPayload(exportedHtml)

    await testInfo.attach('private-export-location', {
      body: Buffer.from(savedPath, 'utf-8'),
      contentType: 'text/plain',
    })

    await clickResetWithConfirm(page)
    await expect(page.locator('foreignObject.skill-node-export-anchor')).toHaveCount(0)

    await importHtmlFromFile(page, savedPath)
    await expect(page.locator('foreignObject.skill-node-export-anchor')).toHaveCount(
      flattenBlueprint(TEMPLATE_ROOTS, TEMPLATE_DEPENDENCIES).length,
    )

    const { html: importedHtml } = await exportHtmlAndKeepFile(page)
    const importedPayload = extractJsonPayload(importedHtml)

    const expectedSnapshot = flattenBlueprint(TEMPLATE_ROOTS, TEMPLATE_DEPENDENCIES)
    const snapshotBeforeImport = flattenDocument(preResetPayload.document)
    const snapshotAfterImport = flattenDocument(importedPayload.document)

    expect(snapshotBeforeImport).toEqual(expectedSnapshot)
    expect(snapshotAfterImport).toEqual(expectedSnapshot)
  })
})
