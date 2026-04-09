/**
 * Diagnostic: trace pre/post-alignment angles for failing BFS row prefixes.
 * Run with: npx vitest run gapDiagnostic
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readDocumentFromCsvText } from '../utils/csv'
import { solveSkillTreeLayout } from '../utils/layoutSolver'
import { TREE_CONFIG } from '../config'

const normalizeAngle = (a) => { const n = a % 360; return n < 0 ? n + 360 : n }
function maxInteriorAngularGapDeg(angles) {
  const sorted = [...new Set(angles.map(normalizeAngle))].sort((a, b) => a - b)
  if (sorted.length < 2) return 0
  let max = 0
  for (let i = 1; i < sorted.length; i++) max = Math.max(max, sorted[i] - sorted[i - 1])
  return max
}

const parseLine = (line) => line.split(',').map(s => s.trim())
function buildBfsRows(rows) {
  const shortNameSet = new Set(rows.map(r => r.shortName))
  const result = []
  const visited = new Set()
  const queue = rows.filter(r => !r.parentShortName || !shortNameSet.has(r.parentShortName))
  queue.forEach(r => visited.add(r.shortName))
  while (queue.length > 0) {
    const cur = queue.shift()
    result.push(cur)
    for (const r of rows) {
      if (!visited.has(r.shortName) && r.parentShortName === cur.shortName) {
        visited.add(r.shortName); queue.push(r)
      }
    }
  }
  for (const r of rows) { if (!visited.has(r.shortName)) result.push(r) }
  return result
}
function escapeCsv(v) {
  const s = String(v ?? '')
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

describe('gap diagnostic', () => {
  it('shows angles for failing row prefixes', () => {
    const csvPath = join(process.cwd(), 'tests/e2e/datasets/myKyana.csv')
    const csvText = readFileSync(csvPath, 'utf-8')
    const rawLines = csvText.split('\n').filter(l => l.trim())
    const rawHeader = parseLine(rawLines[0])
    const idx = (name) => rawHeader.indexOf(name)
    const allRows = rawLines.slice(1).map(line => {
      const c = parseLine(line)
      return {
        shortName: c[idx('ShortName')] ?? '',
        label: c[idx('Name')] ?? '',
        scope: c[idx('Scope')] ?? '',
        level: c[idx('Ebene')] ?? '',
        segment: c[idx('Segment')] ?? '',
        parentShortName: c[idx('Parent')] ?? '',
        additionalDependencies: (c[idx('AdditionalDependency')] ?? '').split(',').map(s => s.trim()).filter(Boolean),
        progressLevel: c[idx('ProgressLevel')] ?? '1',
        status: c[idx('Status')] ?? '',
        releaseNote: c[idx('ReleaseNotes')] ?? '',
      }
    })
    const bfsRows = buildBfsRows(allRows)
    const HEADER = 'ShortName,Name,Scope,Ebene,Segment,Parent,AdditionalDependency,ProgressLevel,Status,ReleaseNotes'
    const buildPrefix = (n) => {
      const rows = bfsRows.slice(0, n).map(r =>
        [r.shortName, r.label, r.scope, r.level, r.segment, r.parentShortName,
          r.additionalDependencies.join(','), r.progressLevel, r.status, r.releaseNote]
          .map(escapeCsv).join(',')
      )
      return [HEADER, ...rows].join('\n')
    }

    const failures = []
    for (let rowN = 1; rowN <= bfsRows.length; rowN++) {
      const prefix = buildPrefix(rowN)
      let doc
      try { doc = readDocumentFromCsvText(prefix, { ignoreManualLevels: true }) } catch { continue }
      const result = solveSkillTreeLayout(doc, TREE_CONFIG)
      const angles = result.layout.nodes.map(n => n.angle)
      const gap = maxInteriorAngularGapDeg(angles)
      if (gap >= 120) failures.push({ rowN, shortName: bfsRows[rowN-1].shortName, gap })
    }

    console.log(`Rows with gap >= 120°: ${failures.length}`)
    failures.forEach(f => console.log(`  row ${f.rowN} (${f.shortName}): ${f.gap.toFixed(1)}°`))
    expect(failures).toHaveLength(0)
  })
})
