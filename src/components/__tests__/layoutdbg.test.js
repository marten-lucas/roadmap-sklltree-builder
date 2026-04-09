import { readFileSync } from 'node:fs'
import { describe, it } from 'vitest'
import { readDocumentFromCsvText } from '../src/components/utils/csv.js'
import { TREE_CONFIG } from '../src/components/config.js'
import { solveSkillTreeLayout } from '../src/components/utils/layoutSolver.js'

describe('debug', () => {
  it('shows angles', () => {
    const csv = readFileSync('tests/e2e/datasets/myKyana.csv', 'utf-8')
    const doc = readDocumentFromCsvText(csv, { processSegments: true, processManualLevels: true })
    const result = solveSkillTreeLayout(doc, TREE_CONFIG)
    const cx = result.origin.x, cy = result.origin.y
    const toAng = (x,y) => (Math.atan2(y-cy, x-cx) * 180 / Math.PI).toFixed(1)
    const toR = (x,y) => Math.sqrt((x-cx)**2 + (y-cy)**2).toFixed(0)
    for (const n of result.nodes.sort((a,b)=>(a.shortName??'').localeCompare(b.shortName??''))) {
      const seg = n.segmentId ?? 'none'
      console.log(`${(n.shortName??'?').padEnd(6)} l=${n.level} ang=${(toAng(n.x,n.y)).padStart(8)}° r=${toR(n.x,n.y).padStart(5)} seg=${seg}`)
    }
  })
})
