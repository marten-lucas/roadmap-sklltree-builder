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

describe('row13 compare', () => {
  it('shows row 13 layout at baseline', () => {
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
        progressLevel: c[idx('ProgressLevel')] ?? '1', status: c[idx('Status')] ?? '',
        releaseNote: c[idx('ReleaseNotes')] ?? '',
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
    
    for (const rowN of [12, 13, 14, 15]) {
      const doc = readDocumentFromCsvText(buildPrefix(rowN), { ignoreManualLevels: true })
      const result = solveSkillTreeLayout(doc, TREE_CONFIG)
      const angleStr = result.layout.nodes.map(n => `${bfsRows.find(r => n.id.includes(r.shortName) || true) ? n.id.slice(-4) : '?'}@${n.angle.toFixed(0)}`).join(' ')
      console.log(`MYCHANGES row ${rowN}: ${angleStr}`)
    }
  })
})
