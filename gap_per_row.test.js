import { describe, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readDocumentFromCsvText } from './src/components/utils/csv'
import { solveSkillTreeLayout } from './src/components/utils/layoutSolver'
import { TREE_CONFIG } from './src/components/config'

const parseLine = (line) => line.split(',').map(s => s.trim())
function buildBfsRows(rows) {
  const shortNameSet = new Set(rows.map(r => r.shortName))
  const result = []; const visited = new Set()
  const queue = rows.filter(r => !r.parentShortName || !shortNameSet.has(r.parentShortName))
  queue.forEach(r => visited.add(r.shortName))
  while (queue.length > 0) {
    const cur = queue.shift(); result.push(cur)
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
  const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function normalizeAngle(a) { const n = a % 360; return n < 0 ? n + 360 : n }
function maxGap(angles) {
  const sorted = [...new Set(angles.map(normalizeAngle))].sort((a, b) => a - b)
  if (sorted.length <= 1) return 0
  let max = 0
  for (let i = 1; i < sorted.length; i++) max = Math.max(max, sorted[i] - sorted[i-1])
  return max
}

describe('gap per row', () => {
  it('shows gap for rows 1-20', () => {
    const csvPath = join(process.cwd(), 'tests/e2e/datasets/myKyana.csv')
    const csvText = readFileSync(csvPath, 'utf-8')
    const rawLines = csvText.split('\n').filter(l => l.trim())
    const rawHeader = parseLine(rawLines[0])
    const idx = (name) => rawHeader.indexOf(name)
    const allRows = rawLines.slice(1).map(line => {
      const c = parseLine(line)
      return {
        shortName: c[idx('ShortName')] ?? '', label: c[idx('Name')] ?? '',
        scope: c[idx('Scope')] ?? '', level: c[idx('Ebene')] ?? '',
        segment: c[idx('Segment')] ?? '', parentShortName: c[idx('Parent')] ?? '',
        additionalDependencies: (c[idx('AdditionalDependency')] ?? '').split(',').map(s => s.trim()).filter(Boolean),
        progressLevel: '1', status: c[idx('Status')] ?? '', releaseNote: '',
      }
    })
    const bfsRows = buildBfsRows(allRows)
    const HEADER = 'ShortName,Name,Scope,Ebene,Segment,Parent,AdditionalDependency,ProgressLevel,Status,ReleaseNotes'
    const buildPrefix = (n) => {
      const rows = bfsRows.slice(0, n).map(r =>
        [r.shortName, r.label, r.scope, r.level, r.segment, r.parentShortName,
          r.additionalDependencies.join(','), r.progressLevel, r.status, r.releaseNote].map(escapeCsv).join(',')
      )
      return [HEADER, ...rows].join('\n')
    }
    for (let rowN = 1; rowN <= 20; rowN++) {
      try {
        const doc = readDocumentFromCsvText(buildPrefix(rowN), { ignoreManualLevels: true })
        const result = solveSkillTreeLayout(doc, TREE_CONFIG)
        const angles = result.layout.nodes.map(n => n.angle)
        const g = maxGap(angles)
        const boundaryNode = result.layout.nodes.find(n => n.angle < -210 || n.angle > 35)
        const r1 = result.layout.nodes[0]?.radius
        console.log(`row ${rowN} (${bfsRows[rowN-1].shortName}): gap=${g.toFixed(1)} r1=${r1?.toFixed(0)} ${g >= 120 ? '*** FAIL ***' : ''}`)
      } catch {}
    }
  })
})
