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

// Rough check: count links with similar segment patterns that could intersect
function countCrossSegmentLinks(layout) {
  const nodeById = new Map(layout.nodes.map(n => [n.id, n]))
  const crossLinks = layout.links.filter(link => {
    const src = nodeById.get(link.sourceId)
    const tgt = nodeById.get(link.targetId)
    if (!src || !tgt) return false
    return src.segmentId !== tgt.segmentId
  })
  return crossLinks.length
}

describe('link intersection debug', () => {
  it('shows link counts per prefix', () => {
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
    
    for (let rowN = 1; rowN <= Math.min(30, bfsRows.length); rowN++) {
      try {
        const doc = readDocumentFromCsvText(buildPrefix(rowN), { ignoreManualLevels: true })
        const result = solveSkillTreeLayout(doc, TREE_CONFIG)
        const crossLinks = countCrossSegmentLinks(result.layout)
        const totalLinks = result.layout.links.length
        if (crossLinks > 0 || totalLinks > 3) {
          console.log(`row ${rowN} (${bfsRows[rowN-1].shortName}): links=${totalLinks} cross=${crossLinks} nodes=${result.layout.nodes.length}`)
          console.log('  angles:', result.layout.nodes.map(n => `${n.id.slice(-4)}@${n.angle.toFixed(0)}`).join(' '))
        }
      } catch {}
    }
  })
})
