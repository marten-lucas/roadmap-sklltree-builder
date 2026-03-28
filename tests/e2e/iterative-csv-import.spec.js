import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { TREE_CONFIG } from '../../src/components/config.js'
import { readDocumentFromCsvText } from '../../src/components/utils/csv.js'
import { solveSkillTreeLayout } from '../../src/components/utils/layoutSolver.js'
import {
  collectCanvasWarningMetrics,
  confirmAndReset,
  exportHtml,
  extractConnectionMetrics,
  extractLayoutMetrics,
  importCsvViaToolbar,
} from './helpers.js'

const fixturePath = resolve(process.cwd(), 'tests/e2e/datasets/layout-regression/single-chain.csv')
const fixtureCsvText = readFileSync(fixturePath, 'utf-8')

const parseCsvLine = (line) => {
  const values = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]

    if (char === '"') {
      const nextChar = line[index + 1]
      if (inQuotes && nextChar === '"') {
        current += '"'
        index += 1
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

const splitCsvRecords = (csvText) => {
  const records = []
  let current = ''
  let inQuotes = false
  const text = String(csvText ?? '').replace(/^\uFEFF/, '')

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const nextChar = text[index + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"'
        index += 1
        continue
      }

      inQuotes = !inQuotes
      current += char
      continue
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        index += 1
      }

      if (current.trim().length > 0) {
        records.push(current)
      }
      current = ''
      continue
    }

    current += char
  }

  if (current.trim().length > 0) {
    records.push(current)
  }

  return records
}

const [fixtureHeader, ...fixtureRecordLines] = splitCsvRecords(fixtureCsvText)
const fixtureHeaders = parseCsvLine(fixtureHeader)
const headerIndexByName = new Map(fixtureHeaders.map((name, index) => [name, index]))

const readCell = (cells, headerName) => cells[headerIndexByName.get(headerName)] ?? ''

const fixtureRows = fixtureRecordLines.map((recordLine) => {
  const cells = parseCsvLine(recordLine)
  return {
    shortName: readCell(cells, 'ShortName'),
    label: readCell(cells, 'Name'),
    scope: readCell(cells, 'Scope'),
    level: Number.parseInt(readCell(cells, 'Ebene'), 10),
    segment: readCell(cells, 'Segment'),
    parentShortName: (() => {
      const value = readCell(cells, 'Parent')
      return value.length > 0 ? value : ''
    })(),
    additionalDependencies: (() => {
      const value = readCell(cells, 'AdditionalDependency')
      return value.length > 0 ? value.split(',').map((entry) => entry.trim()).filter(Boolean) : []
    })(),
    progressLevel: Number.parseInt(readCell(cells, 'ProgressLevel') || '1', 10),
    status: readCell(cells, 'Status'),
    releaseNote: readCell(cells, 'ReleaseNotes'),
  }
})

const escapeCsvCell = (value) => {
  const text = String(value ?? '')
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }

  return text
}

const normalizeAngleDeg = (angle) => {
  const normalized = angle % 360
  return normalized < 0 ? normalized + 360 : normalized
}

const minimalAngleDeltaDeg = (leftAngle, rightAngle) => {
  const delta = Math.abs(normalizeAngleDeg(leftAngle) - normalizeAngleDeg(rightAngle))
  return Math.min(delta, 360 - delta)
}

const maxInteriorAngularGapDeg = (angles) => {
  const normalizedAngles = [...new Set(angles.map(normalizeAngleDeg))].sort((left, right) => left - right)
  if (normalizedAngles.length < 2) {
    return 0
  }

  let maxGap = 0
  for (let index = 1; index < normalizedAngles.length; index += 1) {
    maxGap = Math.max(maxGap, normalizedAngles[index] - normalizedAngles[index - 1])
  }

  return maxGap
}

const buildPrefixCsv = (rowCount) => {
  const header = 'ShortName,Name,Scope,Ebene,Segment,Parent,AdditionalDependency,ProgressLevel,Status,ReleaseNotes'
  const rows = fixtureRows.slice(0, rowCount).map((row) => [
    escapeCsvCell(row.shortName),
    escapeCsvCell(row.label),
    escapeCsvCell(row.scope ?? ''),
    escapeCsvCell(row.level),
    escapeCsvCell(row.segment),
    escapeCsvCell(row.parentShortName ?? ''),
    escapeCsvCell((row.additionalDependencies ?? []).join(',')),
    escapeCsvCell(row.progressLevel ?? 1),
    escapeCsvCell(row.status),
    escapeCsvCell(row.releaseNote ?? ''),
  ].join(','))

  return [header, ...rows].join('\n')
}

const flattenTree = (nodes, visitor) => {
  for (const node of nodes ?? []) {
    visitor(node)
    flattenTree(node.children, visitor)
  }
}

const getChildrenByNodeId = (document) => {
  const childrenByNodeId = new Map()
  flattenTree(document.children, (node) => {
    childrenByNodeId.set(node.id, (node.children ?? []).map((child) => child.id))
  })
  return childrenByNodeId
}

const fitToScreenIfAvailable = async (page) => {
  try {
    await page.getByRole('button', { name: 'Fit to screen' }).click({ timeout: 1_500 })
    await page.waitForTimeout(220)
  } catch {
    // The control is optional in some responsive states.
  }
}

const assertIterativeLayoutInvariants = ({ document, layoutResult, exportedHtml, warningMetrics }) => {
  expect(layoutResult.meta.feasibility.isFeasible).toBe(true)

  const directOrRingOnly = layoutResult.layout.links.every((link) => link.linkKind === 'direct' || link.linkKind === 'ring')
  expect(directOrRingOnly).toBe(true)

  const pathStrings = layoutResult.layout.links.map((link) => link.path)
  expect(new Set(pathStrings).size).toBe(pathStrings.length)

  const nodeAngles = layoutResult.layout.nodes.map((node) => node.angle)
  expect(maxInteriorAngularGapDeg(nodeAngles)).toBeLessThan(120)

  const nodeById = new Map(layoutResult.layout.nodes.map((node) => [node.id, node]))
  const childrenByNodeId = getChildrenByNodeId(document)

  for (const [nodeId, childIds] of childrenByNodeId.entries()) {
    if (childIds.length !== 1) {
      continue
    }

    const parentNode = nodeById.get(nodeId)
    const childNode = nodeById.get(childIds[0])
    expect(parentNode).toBeDefined()
    expect(childNode).toBeDefined()
    expect(minimalAngleDeltaDeg(parentNode.angle, childNode.angle)).toBeLessThanOrEqual(120)
  }

  expect(warningMetrics.linkNodeOverlapCount).toBeLessThanOrEqual(5)
  expect(warningMetrics.linkLinkIntersectionCount).toBeLessThanOrEqual(3)

  const exportLayoutMetrics = extractLayoutMetrics(exportedHtml)
  const exportConnectionMetrics = extractConnectionMetrics(exportedHtml)
  expect(exportLayoutMetrics.nodeCount).toBe(layoutResult.layout.nodes.length)
  expect(exportConnectionMetrics.linkCount).toBe(layoutResult.layout.links.length)
  expect(exportConnectionMetrics.routedCount).toBeLessThanOrEqual(3)
}

test.describe('Iterative CSV Import', () => {
  test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 })

  test('imports each CSV prefix without breaking layout invariants', async ({ page }) => {
    test.setTimeout(180_000)

    await page.goto('/')
    await confirmAndReset(page)
    await expect(page.locator('foreignObject.skill-node-export-anchor')).toHaveCount(0)

    for (let rowCount = 1; rowCount <= fixtureRows.length; rowCount += 1) {
      const prefixCsv = buildPrefixCsv(rowCount)
      const document = readDocumentFromCsvText(prefixCsv)
      const layoutResult = solveSkillTreeLayout(document, TREE_CONFIG)

      await confirmAndReset(page)
      await expect(page.locator('foreignObject.skill-node-export-anchor')).toHaveCount(0)
      await importCsvViaToolbar(page, prefixCsv)
      await fitToScreenIfAvailable(page)

      const exportedHtml = await exportHtml(page)
      const warningMetrics = await collectCanvasWarningMetrics(page)

      assertIterativeLayoutInvariants({
        document,
        layoutResult,
        exportedHtml,
        warningMetrics,
      })
    }
  })
})
