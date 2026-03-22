import { readFileSync } from 'node:fs'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'

/**
 * Clears localStorage and reloads the app so it starts from initialData.
 * Waits until at least one skill node is visible in the builder canvas.
 */
export const startFresh = async (page) => {
  await page.goto('/')
  // Clear any previously saved state so the app loads with initialData from data.js
  await page.evaluate(() => localStorage.removeItem('roadmap-skilltree.document.v1'))
  await page.reload()
  // Wait for the skill nodes to be rendered in the SVG canvas
  await page.waitForSelector('foreignObject.skill-node-export-anchor', { timeout: 15_000 })
}

/**
 * Reads a Playwright download event to a string.
 * Uses the temporary file path that Playwright persists the download to.
 */
export const readDownload = async (download) => {
  const filePath = await download.path()
  return readFileSync(filePath, 'utf-8')
}

/**
 * Returns the data-export-label attributes of all rendered skill nodes in the builder canvas.
 */
export const getBuilderNodeLabels = async (page) => {
  return page
    .locator('foreignObject.skill-node-export-anchor')
    .evaluateAll((elements) => elements.map((el) => el.getAttribute('data-export-label')))
}

/**
 * Triggers an HTML export via Ctrl+S and returns the downloaded file text.
 */
export const exportHtml = async (page) => {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.keyboard.press('Control+s'),
  ])
  return readDownload(download)
}

/**
 * Extracts the embedded JSON payload from an exported HTML string.
 * Returns parsed payload object or throws if not found.
 */
export const extractJsonPayload = (htmlText) => {
  const jsonMatch = htmlText.match(
    /<script[^>]*id="skilltree-export-data"[^>]*>([\s\S]*?)<\/script>/i,
  )
  if (!jsonMatch) throw new Error('No embedded JSON payload found in HTML')
  return JSON.parse(jsonMatch[1].trim())
}

const parseCsvLine = (line) => {
  const values = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]

    if (char === '"') {
      const nextChar = line[i + 1]
      if (inQuotes && nextChar === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      values.push(current)
      current = ''
      continue
    }

    current += char
  }

  values.push(current)
  return values.map((value) => value.trim())
}

const normalizeStatus = (status) => {
  const normalized = String(status ?? '').trim().toLowerCase()
  if (normalized === 'done' || normalized === 'now' || normalized === 'next' || normalized === 'later') {
    return normalized
  }

  throw new Error(`Unsupported status in CSV: ${status}`)
}

const normalizeParent = (parent) => {
  const value = String(parent ?? '').trim()
  if (!value || value === '-') {
    return null
  }
  return value
}

const normalizeShortNameLikeApp = (value, fallbackLabel = 'Skill') => {
  const compact = String(value ?? '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, 3)

  if (compact.length > 0) {
    return compact
  }

  const letters = String(fallbackLabel ?? '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, 3)

  return letters || 'NEW'
}

const csvSortKey = (row) => `${String(row.level).padStart(4, '0')}-${String(row.order).padStart(4, '0')}`

const findHeaderIndex = (headerIndexByName, aliases, isRequired = true) => {
  for (const alias of aliases) {
    if (headerIndexByName.has(alias)) {
      return headerIndexByName.get(alias)
    }
  }

  if (!isRequired) {
    return null
  }

  throw new Error(`CSV missing header. Expected one of: ${aliases.join(', ')}`)
}

const parseAdditionalDependencies = (value) => {
  const raw = String(value ?? '').trim()
  if (!raw) {
    return []
  }

  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export const parseSkillTreeCsvTemplate = (csvText, options = {}) => {
  const { strictParentValidation = false } = options
  const lines = String(csvText)
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)

  if (lines.length < 2) {
    throw new Error('CSV is empty or missing data rows.')
  }

  const headers = parseCsvLine(lines[0])
  const headerIndexByName = new Map(headers.map((name, index) => [name, index]))
  const shortNameIndex = findHeaderIndex(headerIndexByName, ['Node Short Name', 'ShortName'])
  const labelIndex = findHeaderIndex(headerIndexByName, ['Node Name', 'Name'])
  const levelIndex = findHeaderIndex(headerIndexByName, ['Ebene', 'Level'])
  const segmentIndex = findHeaderIndex(headerIndexByName, ['Segment'])
  const scopeIndex = findHeaderIndex(headerIndexByName, ['Scope'])
  const parentIndex = findHeaderIndex(headerIndexByName, ['Parent'])
  const statusIndex = findHeaderIndex(headerIndexByName, ['Status'])
  const additionalDependenciesIndex = findHeaderIndex(
    headerIndexByName,
    ['AdditionalDependency', 'Additional Dependency'],
    false,
  )

  const rows = []
  for (let i = 1; i < lines.length; i += 1) {
    const parsed = parseCsvLine(lines[i])
    const hasCollapsedAdditionalDependency =
      additionalDependenciesIndex != null
      && statusIndex >= parsed.length
      && additionalDependenciesIndex < parsed.length

    const shortName = parsed[shortNameIndex]?.trim()
    const label = parsed[labelIndex]?.trim()
    const levelText = parsed[levelIndex]?.trim()
    const segment = parsed[segmentIndex]?.trim()
    const scope = parsed[scopeIndex]?.trim()
    const parentShortName = normalizeParent(parsed[parentIndex])
    const statusValue = hasCollapsedAdditionalDependency
      ? parsed[additionalDependenciesIndex]
      : parsed[statusIndex]
    const status = normalizeStatus(statusValue)
    const additionalDependencies = additionalDependenciesIndex == null
      ? []
      : parseAdditionalDependencies(
        hasCollapsedAdditionalDependency ? '' : parsed[additionalDependenciesIndex],
      )

    if (!shortName || !label || !levelText || !segment || !scope) {
      throw new Error(`CSV row ${i + 1} is incomplete.`)
    }

    const level = Number.parseInt(levelText, 10)
    if (!Number.isInteger(level) || level < 1) {
      throw new Error(`CSV row ${i + 1} has invalid Ebene: ${levelText}`)
    }

    rows.push({
      shortName,
      label,
      level,
      segment,
      scope,
      parentShortName,
      parentLabel: null,
      additionalDependencies,
      status,
      order: i,
    })
  }

  const byShortName = new Map()
  for (const row of rows) {
    if (byShortName.has(row.shortName)) {
      throw new Error(`Duplicate Node Short Name in CSV: ${row.shortName}`)
    }
    byShortName.set(row.shortName, row)
  }

  const warnings = []
  for (const row of rows) {
    if (row.parentShortName && !byShortName.has(row.parentShortName)) {
      if (strictParentValidation) {
        throw new Error(
          `CSV row for ${row.shortName} references unknown parent ${row.parentShortName}.`,
        )
      }

      warnings.push(
        `Node ${row.shortName} references missing parent ${row.parentShortName}; treating as root for UI simulation.`,
      )
      row.parentShortName = null
      row.parentLabel = null
      continue
    }

    row.parentLabel = row.parentShortName ? byShortName.get(row.parentShortName).label : null
  }

  const segments = []
  const segmentSet = new Set()
  for (const row of rows) {
    if (!segmentSet.has(row.segment)) {
      segmentSet.add(row.segment)
      segments.push(row.segment)
    }
  }

  const roots = rows
    .filter((row) => row.parentShortName === null)
    .sort((left, right) => csvSortKey(left).localeCompare(csvSortKey(right)))

  const children = rows
    .filter((row) => row.parentShortName !== null)
    .sort((left, right) => csvSortKey(left).localeCompare(csvSortKey(right)))

  const childrenByParent = new Map()
  for (const row of children) {
    const current = childrenByParent.get(row.parentShortName) ?? []
    current.push(row)
    childrenByParent.set(row.parentShortName, current)
  }

  return {
    rows,
    segments,
    roots,
    children,
    childrenByParent,
    warnings,
  }
}

export const ensureDirForFile = (filePath) => {
  mkdirSync(dirname(filePath), { recursive: true })
}

export const persistTextFile = (filePath, text) => {
  ensureDirForFile(filePath)
  writeFileSync(filePath, text, 'utf-8')
  return filePath
}

const getVisibleLocator = (locator) => locator.filter({ visible: true })

export const confirmAndReset = async (page) => {
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Reset' }).click()
}

export const waitForInspector = async (page) => {
  await page.waitForSelector('.skill-panel--inspector', { timeout: 10_000 })
}

export const selectNodeByShortName = async (page, shortName) => {
  const node = page.locator('.skill-node-button__shortname', { hasText: shortName }).first()
  await node.waitFor({ state: 'attached', timeout: 10_000 })
  await node.dispatchEvent('click')
  await waitForInspector(page)
}

const escapeCssAttribute = (value) => String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')

export const selectNodeByLabel = async (page, label) => {
  const selector = `foreignObject.skill-node-export-anchor[data-export-label="${escapeCssAttribute(label)}"] .skill-node-button`
  const node = page.locator(selector).first()
  await node.waitFor({ state: 'attached', timeout: 10_000 })
  await node.dispatchEvent('click')
  await waitForInspector(page)
}

export const clickInitialSegmentAddControl = async (page) => {
  const circle = getVisibleLocator(
    page.locator('svg.skill-tree-canvas g.skill-tree-export-exclude circle.skill-tree-add-circle[r="18"]'),
  ).first()
  await circle.click({ force: true })
  await page.waitForSelector('.skill-panel--segment', { timeout: 10_000 })
}

export const clickSegmentAddNearSelected = async (page) => {
  const control = getVisibleLocator(
    page.locator('svg.skill-tree-canvas g.skill-tree-export-exclude circle.skill-tree-add-circle[r="16"]'),
  ).last()
  await control.click({ force: true })
  await page.waitForSelector('.skill-panel--segment', { timeout: 10_000 })
}

export const setSelectedSegmentName = async (page, name) => {
  const panel = page.locator('.skill-panel--segment')
  const field = panel.getByLabel('Name', { exact: true })
  await field.fill(name)
}

export const selectSegmentByLabel = async (page, label) => {
  const segment = page.locator('.skill-tree-segment-label', { hasText: label }).first()
  await segment.waitFor({ state: 'attached', timeout: 10_000 })
  await segment.dispatchEvent('click')
  await page.waitForSelector('.skill-panel--segment', { timeout: 10_000 })
}

export const clickInitialRootAddControl = async (page) => {
  const circle = getVisibleLocator(
    page.locator('svg.skill-tree-canvas g.skill-tree-export-exclude circle.skill-tree-add-circle[r="22"]'),
  ).first()
  await circle.click({ force: true })
  await waitForInspector(page)
}

export const clickRootAddNearSelected = async (page) => {
  const control = getVisibleLocator(
    page.locator('svg.skill-tree-canvas g.skill-tree-export-exclude circle.skill-tree-add-circle--secondary[r="18"]'),
  ).last()
  await control.click({ force: true })
  await waitForInspector(page)
}

export const clickChildAddForSelectedNode = async (page) => {
  const control = getVisibleLocator(
    page.locator('svg.skill-tree-canvas g.skill-tree-export-exclude circle.skill-tree-add-circle[r="18"]:not(.skill-tree-add-circle--secondary)'),
  ).first()
  await control.click({ force: true })
  await waitForInspector(page)
}

export const setSelectValueByLabel = async (page, label, option) => {
  const inspector = page.locator('.skill-panel--inspector')
  const field = inspector.getByLabel(label, { exact: true })
  await field.click()
  await page
    .getByRole('option', { name: option, exact: true })
    .filter({ visible: true })
    .first()
    .click({ force: true, timeout: 5_000 })
}

export const ensureScopesExist = async (page, scopeLabels) => {
  const uniqueScopes = [...new Set(scopeLabels.map((entry) => String(entry ?? '').trim()).filter(Boolean))]
  if (uniqueScopes.length === 0) {
    return
  }

  const scopeBlock = page.locator('.skill-panel__scope-block')
  await scopeBlock.getByRole('button', { name: 'Scopes verwalten' }).click()

  for (const label of uniqueScopes) {
    const alreadyExists = await scopeBlock.locator('text=' + label).count()
    if (alreadyExists > 0) {
      continue
    }

    await scopeBlock.getByRole('textbox', { name: 'Scopes verwalten', exact: true }).fill(label)
    await scopeBlock.getByRole('button', { name: 'Scope hinzufügen' }).click()
  }
}

export const trySetScopeByLabel = async (page, scopeLabel) => {
  try {
    const scopeBlock = page.locator('.skill-panel__scope-block')
    const input = scopeBlock.getByPlaceholder('Scopes')
    await input.click()
    await page
      .getByRole('option', { name: scopeLabel, exact: true })
      .filter({ visible: true })
      .first()
      .click({ force: true, timeout: 3_000 })
    return true
  } catch {
    return false
  }
}

export const trySetSelectValueByLabel = async (page, label, option) => {
  try {
    await setSelectValueByLabel(page, label, option)
    return true
  } catch {
    return false
  }
}

export const applyNodeSettings = async (page, row, options = {}) => {
  const { ignoreManualLevels = false } = options
  await waitForInspector(page)
  const inspector = page.locator('.skill-panel--inspector')
  await inspector.getByLabel('Name', { exact: true }).fill(row.label)
  await inspector.getByLabel('Shortname', { exact: true }).fill(row.shortName)
  await page.locator(`foreignObject.skill-node-export-anchor[data-export-label="${escapeCssAttribute(row.label)}"]`).first().waitFor({
    state: 'attached',
    timeout: 10_000,
  })
  await trySetSelectValueByLabel(page, 'Parent', row.parentLabel ?? 'Kein Parent (Root)')
  if (!ignoreManualLevels) {
    await trySetSelectValueByLabel(page, 'Ebene', `Ebene ${row.level}`)
  }
  await trySetSelectValueByLabel(page, 'Segment', row.segment)
  await trySetScopeByLabel(page, row.scope)
  await setSelectValueByLabel(page, 'Status', row.status[0].toUpperCase() + row.status.slice(1))
}

export const applyNodeIdentity = async (page, row) => {
  await waitForInspector(page)
  const inspector = page.locator('.skill-panel--inspector')
  await inspector.getByLabel('Name', { exact: true }).fill(row.label)
  await inspector.getByLabel('Shortname', { exact: true }).fill(row.shortName)
  await page.locator(`foreignObject.skill-node-export-anchor[data-export-label="${escapeCssAttribute(row.label)}"]`).first().waitFor({
    state: 'attached',
    timeout: 10_000,
  })
}

const walkNodes = (document, visitor, parentNode = null) => {
  const nodes = Array.isArray(document?.children) ? document.children : []
  for (const node of nodes) {
    visitor(node, parentNode)
    if (Array.isArray(node.children) && node.children.length > 0) {
      walkNodes({ children: node.children }, visitor, node)
    }
  }
}

export const buildActualNodeMapFromDocument = (document) => {
  const segmentsById = new Map((document.segments ?? []).map((segment) => [segment.id, segment.label]))
  const scopesById = new Map((document.scopes ?? []).map((scope) => [scope.id, scope.label]))
  const nodes = new Map()

  walkNodes(document, (node, parentNode) => {
    const status = String(node.levels?.[0]?.status ?? node.status ?? 'later').trim().toLowerCase()
    const primaryScopeId = Array.isArray(node.levels?.[0]?.scopeIds)
      ? node.levels[0].scopeIds[0] ?? null
      : null
    nodes.set(node.label, {
      shortName: node.shortName,
      label: node.label,
      level: Number(node.ebene),
      segment: segmentsById.get(node.segmentId ?? null) ?? null,
      scope: primaryScopeId ? scopesById.get(primaryScopeId) ?? null : null,
      parentLabel: parentNode?.label ?? null,
      status,
    })
  })

  return nodes
}

export const buildExpectedNodeMapFromRows = (rows, options = {}) => {
  const { ignoreManualLevels = false } = options
  const rowsByLabel = new Map(rows.map((row) => [row.label, row]))
  const computedLevelByLabel = new Map()

  const computeLevelByParentChain = (row, stack = new Set()) => {
    if (!ignoreManualLevels) {
      return row.level
    }

    if (computedLevelByLabel.has(row.label)) {
      return computedLevelByLabel.get(row.label)
    }

    if (stack.has(row.label)) {
      return 1
    }

    stack.add(row.label)
    const parent = row.parentLabel ? rowsByLabel.get(row.parentLabel) : null
    const level = parent ? computeLevelByParentChain(parent, stack) + 1 : 1
    stack.delete(row.label)
    computedLevelByLabel.set(row.label, level)
    return level
  }

  const result = new Map()
  for (const row of rows) {
    result.set(row.label, {
      shortName: normalizeShortNameLikeApp(row.shortName, row.label),
      label: row.label,
      level: computeLevelByParentChain(row),
      segment: row.segment,
      scope: row.scope,
      parentLabel: row.parentLabel,
      status: row.status,
    })
  }
  return result
}

export const resolveWorkspacePath = (...parts) => resolve(process.cwd(), ...parts)
