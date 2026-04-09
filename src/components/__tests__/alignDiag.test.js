import { describe, it } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { readDocumentFromCsvText } from '../utils/csv'
import { solveSkillTreeLayout } from '../utils/layoutSolver'
import { TREE_CONFIG } from '../config'

const csv = readFileSync(join(process.cwd(), 'tests/e2e/datasets/myKyana.csv'), 'utf8')
const lines = csv.split('\n').filter(Boolean)
const header = lines[0]

describe('alignment diagnostic', () => {
  it('logs alignment values for key rows', () => {
    const out = []
    globalThis.__alignLog = (msg) => out.push(msg)
    for (const n of [11, 12, 13, 14, 15]) {
      const prefix = [header, ...lines.slice(1, n + 1)].join('\n')
      let doc
      try { doc = readDocumentFromCsvText(prefix, { ignoreManualLevels: true }) } catch { continue }
      out.push(`=== ROW ${n} ===`)
      solveSkillTreeLayout(doc, TREE_CONFIG)
    }
    delete globalThis.__alignLog
    writeFileSync('/tmp/align_out.txt', out.join('\n'))
  })
})
