import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, it, expect } from 'vitest'
import { solveSkillTreeLayout } from './src/components/utils/layoutSolver.js'
import { TREE_CONFIG } from './src/components/config.js'
import { readDocumentFromCsvText } from './src/components/utils/csv.js'

describe('NAH-SA portal elimination', () => {
  it('checks if NAH is a portal to SA', () => {
    const csv = readFileSync(resolve('tests/e2e/datasets/myKyana.csv'), 'utf-8')
    const doc = readDocumentFromCsvText(csv, { ignoreSegments: false, ignoreManualLevels: true })
    const result = solveSkillTreeLayout(doc, TREE_CONFIG)
    
    const byShortName = new Map()
    for (const n of result.layout.nodes) {
      if (n.shortName) byShortName.set(n.shortName, n)
    }
    
    const nah = byShortName.get('NAH')
    const sa = byShortName.get('SA')
    
    if (!nah || !sa) throw new Error('Nodes not found')

    const portal = result.layout.crossingEdges.find(ce => 
      (ce.parentId === nah.id && ce.childId === sa.id) || (ce.parentId === sa.id && ce.childId === nah.id)
    )
    
    console.log(`RESULT: ${portal ? 'PORTAL' : 'DIRECT'}`)
    console.log(`NAH neighbor index in Kyana Assist: ${
      result.layout.nodes
        .filter(n => n.level === 1 && n.segmentId === nah.segmentId)
        .sort((a,b) => a.angle - b.angle)
        .findIndex(n => n.shortName === 'NAH')
    }`)
  })
})
