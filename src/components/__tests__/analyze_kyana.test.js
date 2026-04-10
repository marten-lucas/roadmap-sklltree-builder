import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, it } from 'vitest'
import { solveSkillTreeLayout } from './src/components/utils/layoutSolver.js'
import { TREE_CONFIG } from './src/components/config.js'
import { readDocumentFromCsvText } from './src/components/utils/csv.js'

describe('kyana analysis', () => {
  it('prints node positions and paths for key nodes', () => {
    const csv = readFileSync(resolve('tests/e2e/datasets/myKyana.csv'), 'utf-8')
    const doc = readDocumentFromCsvText(csv, { ignoreSegments: false, ignoreManualLevels: true })
    const result = solveSkillTreeLayout(doc, TREE_CONFIG)
    
    // Build shortName→id map from the layout nodes (shortName is in label/shortName field)
    const byShortName = new Map()
    for (const n of result.layout.nodes) {
      if (n.shortName) byShortName.set(n.shortName, n)
    }
    
    const byId = new Map(result.layout.nodes.map(n => [n.id, n]))
    const keyShortNames = ['CLG','PLC','CCL','CLT','PLT','CRJ','R4P','RJD','LKE']
    const keyIds = new Set(keyShortNames.map(s => byShortName.get(s)?.id).filter(Boolean))
    
    console.log('\n--- NODE POSITIONS ---')
    for (const sn of keyShortNames) {
      const n = byShortName.get(sn)
      if (n) console.log(`  ${sn}: angle=${n.angle.toFixed(2)}° radius=${n.radius.toFixed(1)} x=${n.x.toFixed(1)} y=${n.y.toFixed(1)} level=${n.level}`)
    }
    
    const keyParentIds = new Set(
      ['CLG','CLT','PLT','CRJ'].map(s => byShortName.get(s)?.id).filter(Boolean)
    )
    
    console.log('\n--- PATHS FOR KEY EDGES ---')
    for (const link of result.layout.links) {
      if (keyParentIds.has(link.sourceId) || keyIds.has(link.targetId)) {
        const src = byId.get(link.sourceId)?.shortName ?? link.sourceId.slice(0,8)
        const tgt = byId.get(link.targetId)?.shortName ?? link.targetId.slice(0,8)
        const cmds = link.path.replace(/[^MAL]/g,'')
        console.log(`  ${src}→${tgt} [${link.linkKind}] ${cmds}`)
        console.log(`    ${link.path}`)
      }
    }
    
    console.log('\n--- EDGE ROUTING GROUPS ---')
    for (const g of result.meta.edgeRouting.trunkGroups) {
      if (keyParentIds.has(g.parentId)) {
        const parentSn = byId.get(g.parentId)?.shortName ?? g.parentId.slice(0,8)
        const childSns = g.childIds.map(cid => byId.get(cid)?.shortName ?? cid.slice(0,8))
        console.log(`  trunk: ${parentSn}→L${g.targetLevel} trunkAngle=${g.trunkAngle.toFixed(2)}° children=[${childSns.join(',')}]`)
      }
    }
    
    // Check shared trunk convergence points
    const edgePaths = result.layout.links.filter(l => l.linkKind !== 'ring')
    const trunkShared = new Map()
    for (const l of edgePaths) {
      const lMatch = l.path.match(/L ([\d.]+) ([\d.]+)/)
      if (lMatch) {
        const key = `${parseFloat(lMatch[1]).toFixed(1)},${parseFloat(lMatch[2]).toFixed(1)}`
        if (!trunkShared.has(key)) trunkShared.set(key, [])
        const src = byId.get(l.sourceId)?.shortName ?? l.sourceId.slice(0,8)
        const tgt = byId.get(l.targetId)?.shortName ?? l.targetId.slice(0,8)
        trunkShared.get(key).push(`${src}→${tgt}`)
      }
    }
    console.log('\n--- SHARED FORK POINTS (same first L command) ---')
    for (const [pt, edges] of trunkShared) {
      if (edges.length > 1) console.log(`  @ (${pt}): ${edges.join(', ')}`)
    }

    console.log('\n--- CROSSING EDGES (converted to portals) ---')
    if (result.layout.crossingEdges.length === 0) {
      console.log('  (none)')
    }
    for (const ce of result.layout.crossingEdges) {
      const p = byId.get(ce.parentId)?.shortName ?? ce.parentId.slice(0, 8)
      const c = byId.get(ce.childId)?.shortName ?? ce.childId.slice(0, 8)
      console.log(`  PORTAL: ${p} → ${c}  (id=${ce.id})`)
    }

    console.log('\n--- PHASE 2 PROMOTIONS ---')
    if (result.meta.crossingPromotionDetails.length === 0) {
      console.log('  (none)')
    }
    for (const d of result.meta.crossingPromotionDetails) {
      const p = byId.get(d.parentId)?.shortName ?? d.parentId.slice(0, 8)
      const c = byId.get(d.childId)?.shortName ?? d.childId.slice(0, 8)
      console.log(`  PROMOTE: ${p} → ${c}  (gap=${d.gap}, ${d.fromLevel} → ${d.toLevel})`)
    }

    console.log('\n--- PHASE 3 COMPACTIONS ---')
    if (result.meta.compactionDetails.length === 0) {
      console.log('  (none)')
    }
    for (const d of result.meta.compactionDetails) {
      const n = byId.get(d.nodeId)?.shortName ?? d.nodeId.slice(0, 8)
      const p = byId.get(d.parentId)?.shortName ?? d.parentId.slice(0, 8)
      console.log(`  COMPACT: ${n} (parent=${p})  (${d.fromLevel} → ${d.toLevel})`)
    }

    console.log('\n--- PHASE 4 RE-DEMOTIONS ---')
    if ((result.meta.reDemotionDetails ?? []).length === 0) {
      console.log('  (none)')
    }
    for (const d of result.meta.reDemotionDetails ?? []) {
      const n = byId.get(d.nodeId)?.shortName ?? d.nodeId.slice(0, 8)
      const p = byId.get(d.parentId)?.shortName ?? d.parentId.slice(0, 8)
      console.log(`  DEMOTE: ${n} (parent=${p})  (${d.fromLevel} → ${d.toLevel})`)
    }

    // Debug: show PPK, PPD, CCK positions
    console.log('\n--- PPK CHAIN ---')
    for (const sn of ['PPD', 'PPK', 'CCK']) {
      const n = byShortName.get(sn)
      if (n) console.log(`  ${sn}: level=${n.level} radius=${n.radius.toFixed(0)} angle=${n.angle.toFixed(1)}°`)
    }

    // Angular gap analysis
    console.log('\n--- ANGULAR GAPS (> 10°) ---')
    const sortedByAngle = [...result.layout.nodes].sort((a, b) => a.angle - b.angle)
    const minAngle = sortedByAngle[0]?.angle ?? 0
    const maxAngle = sortedByAngle[sortedByAngle.length - 1]?.angle ?? 0
    console.log(`  Total spread: ${minAngle.toFixed(1)}° → ${maxAngle.toFixed(1)}° = ${(maxAngle - minAngle).toFixed(1)}°`)
    for (let i = 1; i < sortedByAngle.length; i++) {
      const gap = sortedByAngle[i].angle - sortedByAngle[i - 1].angle
      if (gap > 10) {
        const left = sortedByAngle[i - 1]
        const right = sortedByAngle[i]
        console.log(`  GAP ${gap.toFixed(1)}°: ${left.shortName ?? left.id.slice(0,6)} (${left.angle.toFixed(1)}°) → ${right.shortName ?? right.id.slice(0,6)} (${right.angle.toFixed(1)}°)`)
      }
    }
  })
})
