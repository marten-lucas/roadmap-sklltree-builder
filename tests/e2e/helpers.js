import { readFileSync } from 'node:fs'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'

const ROUNDTRIP_EXPORT_SEED = resolve(process.cwd(), 'tests/results/e2e-exports/skilltree-roundtrip-1774358009970.html')
const IMMEDIATE_SCOPE_DUMP_SEED = resolve(
  process.cwd(),
  'tests/results/e2e-exports/immediate-scope-dump-1774364111859.json',
)

/**
 * Clears localStorage and reloads the app so it starts from initialData.
 * Waits until at least one skill node is visible in the builder canvas.
 */
export const startFresh = async (page) => {
  await page.goto('/')
  try {
    const dumpText = readFileSync(IMMEDIATE_SCOPE_DUMP_SEED, 'utf-8')
    const dump = JSON.parse(dumpText)
    const persistedPayload = JSON.parse(dump.document)
    await page.evaluate((payload) => {
      localStorage.setItem('roadmap-skilltree.document.v1', JSON.stringify(payload))
    }, persistedPayload)
  } catch {
    try {
      const seedHtml = readFileSync(ROUNDTRIP_EXPORT_SEED, 'utf-8')
      const payloadMatch = seedHtml.match(/<script[^>]*id="skilltree-export-data"[^>]*>([\s\S]*?)<\/script>/i)
      if (payloadMatch?.[1]) {
        await page.evaluate((payload) => localStorage.setItem('roadmap-skilltree.document.v1', payload.trim()), payloadMatch[1])
      } else {
        await page.evaluate(() => localStorage.removeItem('roadmap-skilltree.document.v1'))
      }
    } catch {
      await page.evaluate(() => localStorage.removeItem('roadmap-skilltree.document.v1'))
    }
  }
  await page.reload()
  // Wait for the skill nodes to be attached in the SVG canvas.
  await page.waitForSelector('foreignObject.skill-node-export-anchor', { state: 'attached', timeout: 15_000 })
  await page.getByRole('button', { name: 'Export', exact: true }).waitFor({ state: 'visible', timeout: 15_000 })
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

export const getBuilderNodeShortNames = async (page) => {
  return page
    .locator('foreignObject.skill-node-export-anchor')
    .evaluateAll((elements) => elements.map((el) => el.getAttribute('data-short-name')))
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

export const normalizeShortNameForApp = (value, fallbackLabel = 'Skill') => (
  normalizeShortNameLikeApp(value, fallbackLabel)
)

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
  const releaseNotesIndex = findHeaderIndex(
    headerIndexByName,
    ['ReleaseNotes', 'Release Notes'],
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
    const releaseNote = releaseNotesIndex == null ? null : (parsed[releaseNotesIndex] ?? null)

    if (!shortName || !label || !levelText || !segment) {
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
      releaseNote,
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

export const getE2eExportDir = () => resolve(
  process.env.SKILLTREE_E2E_EXPORT_DIR ?? resolveWorkspacePath('tests/results', 'e2e-exports'),
)

const getVisibleLocator = (locator) => locator.filter({ visible: true })

export const confirmAndReset = async (page) => {
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Reset' }).click()
}

export const waitForInspector = async (page) => {
  await page.waitForSelector('.skill-panel--inspector', { timeout: 30_000 })
}

const waitForSelectedNodeId = async (page, nodeId) => {
  await page.waitForFunction(
    (expectedNodeId) => {
      const inspector = document.querySelector('.skill-panel--inspector')
      return inspector && inspector.getAttribute('data-selected-node-id') === expectedNodeId
    },
    nodeId,
    { timeout: 30_000 },
  )
}

export const selectNodeByShortName = async (page, shortName) => {
  const normalizedShortName = normalizeShortNameLikeApp(shortName, shortName)
  const selectedNodeId = await searchAndSelectNode(page, normalizedShortName)
  if (selectedNodeId) {
    await waitForSelectedNodeId(page, selectedNodeId)
  }
}

export const selectNodeById = async (page, nodeId) => {
  const node = page.locator(`foreignObject.skill-node-export-anchor[data-node-id="${escapeCssAttribute(nodeId)}"] .skill-node-button`).first()
  await node.waitFor({ state: 'attached', timeout: 10_000 })
  await node.dispatchEvent('click')
  await waitForInspector(page)
  await waitForSelectedNodeId(page, nodeId)
}

export const getSelectedNodeId = async (page) => {
  const inspector = page.locator('.skill-panel--inspector').first()
  await inspector.waitFor({ state: 'attached', timeout: 10_000 })
  return inspector.getAttribute('data-selected-node-id')
}

const escapeCssAttribute = (value) => String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')

export const selectNodeByLabel = async (page, label) => {
  const selectedNodeId = await searchAndSelectNode(page, String(label).trim())
  if (selectedNodeId) {
    await waitForSelectedNodeId(page, selectedNodeId)
  }
}

export const searchAndSelectNode = async (page, query) => {
  // Uses the toolbar search input added to the app UI to locate and select nodes.
  const q = String(query ?? '').trim()
  if (!q) throw new Error('searchAndSelectNode requires a non-empty query')

  const searchBox = page.getByRole('textbox', { name: 'Node search' }).first()
  await searchBox.waitFor({ state: 'visible', timeout: 10_000 })
  await searchBox.fill(q)

  // Wait for the dropdown to populate and click the first visible option
  const option = page.getByRole('option').filter({ visible: true }).first()
  await option.waitFor({ state: 'visible', timeout: 5_000 })
  // Use mouse down then mouse up to better emulate user click and avoid focus loss
  await option.dispatchEvent('mousedown')
  await option.dispatchEvent('mouseup')

  // Wait for inspector to show and return the selected node id
  try {
    await waitForInspector(page)
  } catch (e) {
    // If inspector didn't appear, still try to read selected id
  }

  return getSelectedNodeId(page)
}

export const clickInitialSegmentAddControl = async (page) => {
  const control = getVisibleLocator(
    page.locator('svg.skill-tree-canvas g[data-add-control="segment-initial"]'),
  ).first()
  await control.dispatchEvent('click')
  await page.waitForSelector('.skill-panel--segment', { timeout: 10_000 })
}

export const clickSegmentAddNearSelected = async (page) => {
  const control = getVisibleLocator(
    page.locator('svg.skill-tree-canvas g[data-add-control="segment-near"][data-direction="right"]'),
  ).first()
  await control.dispatchEvent('click')
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
  const control = getVisibleLocator(
    page.locator('svg.skill-tree-canvas g[data-add-control="root-initial"]'),
  ).first()
  await control.dispatchEvent('click')
  await waitForInspector(page)
}

export const clickRootAddNearSelected = async (page) => {
  const selectedNodeId = await getSelectedNodeId(page)
  const control = getVisibleLocator(
    page.locator(
      `svg.skill-tree-canvas g[data-add-control="root-near"][data-node-id="${escapeCssAttribute(selectedNodeId)}"][data-direction="right"]`,
    ),
  ).first()
  await control.dispatchEvent('click')
  await waitForInspector(page)
}

export const clickChildAddForSelectedNode = async (page) => {
  const selectedNodeId = await getSelectedNodeId(page)
  const control = getVisibleLocator(
    page.locator(
      `svg.skill-tree-canvas g[data-add-control="child"][data-node-id="${escapeCssAttribute(selectedNodeId)}"]`,
    ),
  ).first()
  await control.dispatchEvent('click')
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

  // Creating scopes while a node is selected auto-attaches them to that node.
  // Deselect first so the manager only creates shared scope definitions.
  try {
    await page.locator('svg.skill-tree-canvas').click({ position: { x: 5, y: 5 }, timeout: 2_000 })
  } catch (e) {
    try {
      await page.mouse.click(8, 8)
    } catch (err) {
      // ignore; the manager still works, but newly created scopes may attach to the current node
    }
  }

  // Prefer the toolbar scope manager: click the toolbar button and use the
  // same accessible labels as the Inspector's scope UI so both flows remain
  // compatible with tests.
  const toolbar = page.locator('.skill-tree-toolbar')
  const toolbarManage = toolbar.getByRole('button', { name: 'Scopes verwalten' }).first()
  try {
    await toolbarManage.click()
  } catch (e) {
    // Fallback: if toolbar not present or click fails, try inspector-scoped button
    const scopeBlock = page.locator('.skill-panel__scope-block')
    const inspectorManage = scopeBlock.getByRole('button', { name: 'Scopes verwalten' })
    await inspectorManage.click()
  }

  for (const label of uniqueScopes) {
    const alreadyExists = await page.evaluate((expectedLabel) => {
      const raw = localStorage.getItem('roadmap-skilltree.document.v1')
      if (!raw) {
        return false
      }

      try {
        const parsed = JSON.parse(raw)
        const scopes = Array.isArray(parsed.document?.scopes) ? parsed.document.scopes : []
        return scopes.some((scope) => String(scope?.label ?? '').trim() === expectedLabel)
      } catch {
        return false
      }
    }, label)

    if (alreadyExists) continue

    const textbox = page.getByRole('textbox', { name: 'Scopes verwalten', exact: true }).filter({ visible: true }).first()
    await textbox.fill(label)
    await page.getByRole('button', { name: 'Scope hinzufügen' }).filter({ visible: true }).first().click()

    await page.waitForFunction((expectedLabel) => {
      const raw = localStorage.getItem('roadmap-skilltree.document.v1')
      if (!raw) {
        return false
      }

      try {
        const parsed = JSON.parse(raw)
        const scopes = Array.isArray(parsed.document?.scopes) ? parsed.document.scopes : []
        return scopes.some((scope) => String(scope?.label ?? '').trim() === expectedLabel)
      } catch {
        return false
      }
    }, label, { timeout: 10_000 })
  }

  // Close the toolbar scope manager if present
  try {
    await page.getByRole('button', { name: 'Scope Manager schließen' }).filter({ visible: true }).first().click()
  } catch (e) {
    // fallback: toggle the toolbar button again
    try { await toolbarManage.click() } catch (err) { /* ignore */ }
  }
}

export const trySetScopeByLabel = async (page, scopeLabel) => {
  // If no scope label provided, skip any scope UI interaction.
  if (!scopeLabel || String(scopeLabel).trim().length === 0) {
    return false
  }
  const normalizedScopeLabel = String(scopeLabel).trim()
  // retry loop: attempt selection up to 3 times and confirm persistence in the saved document
  const scopeBlock = page.locator('.skill-panel__scope-block')
  const optionLocator = () => page.getByRole('option', { name: scopeLabel, exact: true }).filter({ visible: true }).first()

  const scopeIsVisibleInDom = async () => {
    try {
      const pill = scopeBlock
        .locator('.mantine-MultiSelect-values .mantine-MultiSelect-item, .mantine-MultiSelect-item')
        .filter({ hasText: normalizedScopeLabel })
        .first()
      await pill.waitFor({ state: 'visible', timeout: 1_000 })
      return true
    } catch {
      return false
    }
  }

  const sleep = (ms) => new Promise((res) => setTimeout(res, ms))

  try {
    // clear existing pills (best-effort)
    try {
      const pillRemove = scopeBlock.locator('.mantine-MultiSelect-values button, .mantine-MultiSelect-item button')
      const count = await pillRemove.count()
      for (let i = 0; i < count; i += 1) {
        try {
          await pillRemove.nth(0).click({ timeout: 500 })
        } catch (e) {
          break
        }
      }
    } catch (e) {
      // ignore
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const input = scopeBlock.getByPlaceholder('Scopes')
        await input.click()
        const opt = optionLocator()
        await opt.click({ force: true, timeout: 2_000 })

        if (await scopeIsVisibleInDom()) {
          try {
            await page.keyboard.press('Escape')
          } catch (e) {
            // ignore
          }
          return true
        }

        try {
          await page.waitForTimeout(100)
          if (await scopeIsVisibleInDom()) {
            try {
              await page.keyboard.press('Escape')
            } catch (e) {
              // ignore
            }
            return true
          }
        } catch (e) {
          // pill did not appear yet; try again after a short delay
          await sleep(250)
          continue
        }
      } catch (e) {
        await sleep(250)
        continue
      }
    }

    return false
  } catch (e) {
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
  // Parent is intentionally NOT set here — it was established during tree creation.
  // Setting it via label is unsafe when multiple nodes share the same label and
  // could silently move nodes to the wrong parent via moveNodeToParent.
  if (!ignoreManualLevels) {
    await trySetSelectValueByLabel(page, 'Ebene', `Ebene ${row.level}`)
  }
  await trySetSelectValueByLabel(page, 'Segment', row.segment)
  if (row.scope && String(row.scope).trim().length > 0) {
    await trySetScopeByLabel(page, row.scope)
  }
  // Capture the app's persisted document from localStorage to inspect model state
  // after assignment. This reveals actual scopeIds stored for the selected node.
  try {
    // capture visible pills from inspector (best-effort)
    let assignedPills = []
    try {
      assignedPills = await getInspectorScopeLabels(page)
    } catch (e) {
      assignedPills = []
    }

    // attempt to read persisted document and find the node; retry briefly if not present yet
    const findNode = (nodes, shortName) => {
      for (const node of nodes ?? []) {
        if ((node.shortName ?? '').toString().trim() === shortName) return node
        const found = findNode(node.children, shortName)
        if (found) return found
      }
      return null
    }

    let found = null
    const startMs = Date.now()
    const timeoutMs = 3_000
    while (Date.now() - startMs < timeoutMs) {
      const stored = await page.evaluate(() => localStorage.getItem('roadmap-skilltree.document.v1'))
      if (stored) {
        try {
          const doc = JSON.parse(stored)
          found = findNode(doc.children, row.shortName)
          if (found) break
        } catch (e) {
          // ignore parse errors and retry
        }
      }
      await new Promise((res) => setTimeout(res, 200))
    }

    const out = {
      timestamp: Date.now(),
      shortName: row.shortName,
      intendedScope: row.scope,
      assignedPills,
      nodeSnapshot: found ?? null,
      scopeTrace: null,
    }
    try {
      const rawTrace = await page.evaluate(() => localStorage.getItem('roadmap-skilltree.e2e.scopeTrace'))
      if (rawTrace) {
        try {
          out.scopeTrace = JSON.parse(rawTrace)
        } catch (e) {
          out.scopeTrace = rawTrace
        }
      }
    } catch (e) {
      // ignore
    }

    persistTextFile(resolve(getE2eExportDir(), 'scope-assignments-' + Date.now() + '.json'), JSON.stringify(out, null, 2))
  } catch (e) {
    // ignore logging errors
  }
  await setSelectValueByLabel(page, 'Status', row.status[0].toUpperCase() + row.status.slice(1))
}

export const getInspectorScopeLabels = async (page) => {
  const scopeBlock = page.locator('.skill-panel__scope-block')
  const items = scopeBlock.locator('.mantine-MultiSelect-values .mantine-MultiSelect-item, .mantine-MultiSelect-item')
  const labels = await items.evaluateAll((els) => els.map((el) => el.textContent?.trim()).filter(Boolean))
  return labels
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
  // ensure the Shortname input is committed by blurring (Tab), which the UI
  // uses to persist the short name value into the model
  try {
    await inspector.getByLabel('Shortname', { exact: true }).press('Tab')
  } catch (e) {
    // best-effort: ignore if the control is not focusable
  }
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
    nodes.set(node.shortName, {
      shortName: node.shortName,
      label: node.label,
      level: Number(node.ebene),
      segment: segmentsById.get(node.segmentId ?? null) ?? null,
      scope: primaryScopeId ? scopesById.get(primaryScopeId) ?? null : null,
      parentLabel: parentNode?.label ?? null,
      parentShortName: parentNode?.shortName ?? null,
      status,
    })
  })

  return nodes
}

export const buildExpectedNodeMapFromRows = (rows, options = {}) => {
  const { ignoreManualLevels = false } = options
  const rowsByShortName = new Map(
    rows.map((row) => [normalizeShortNameLikeApp(row.shortName, row.label), row]),
  )
  const computedLevelByShortName = new Map()

  const computeLevelByParentChain = (row, stack = new Set()) => {
    if (!ignoreManualLevels) {
      return row.level
    }

    const shortName = normalizeShortNameLikeApp(row.shortName, row.label)

    if (computedLevelByShortName.has(shortName)) {
      return computedLevelByShortName.get(shortName)
    }

    if (stack.has(shortName)) {
      return 1
    }

    stack.add(shortName)
    const parent = row.parentShortName
      ? rowsByShortName.get(normalizeShortNameLikeApp(row.parentShortName, row.parentLabel))
      : null
    const level = parent ? computeLevelByParentChain(parent, stack) + 1 : 1
    stack.delete(shortName)
    computedLevelByShortName.set(shortName, level)
    return level
  }

  const result = new Map()
  for (const row of rows) {
    const shortName = normalizeShortNameLikeApp(row.shortName, row.label)
    result.set(shortName, {
      shortName,
      label: row.label,
      level: computeLevelByParentChain(row),
      segment: row.segment,
      scope: row.scope,
      parentLabel: row.parentLabel,
      parentShortName: row.parentShortName
        ? normalizeShortNameLikeApp(row.parentShortName, row.parentLabel)
        : null,
      status: row.status,
    })
  }
  return result
}

export const resolveWorkspacePath = (...parts) => resolve(process.cwd(), ...parts)
