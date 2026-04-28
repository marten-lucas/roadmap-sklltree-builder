/**
 * Layout Benchmark – Angular Efficiency vs. D3 Partition Baseline
 *
 * Compares our custom radial layout against a D3 partition baseline on three
 * dimensions that otherwise make "same spread" comparisons misleading:
 *
 *  1. ANGLE BUDGET   – D3 partition has no built-in cap. For a fair comparison
 *                       both algorithms are given the same maxAngleSpread (270°).
 *
 *  2. SEGMENT ORDER  – D3 partition follows tree structure only; it has no
 *                       concept of topic segments. Segment boundary crossings
 *                       (adjacent nodes in the angular order that belong to
 *                       different segments) are counted for both algorithms.
 *                       Our algorithm guarantees at most (segments−1) crossings
 *                       per depth ring because every segment is a contiguous wedge.
 *
 *  3. NODE SIZES     – D3 divides angle proportionally by leaf count, producing
 *                       arc-lengths that vary with tree structure. Our algorithm
 *                       guarantees every node a fixed arc-length of at least
 *                       nodeSize×minArcGapFactor pixels at its ring radius.
 *                       "D3 overlaps at 270°" counts how many D3 nodes would
 *                       receive less arc than that pixel budget at the shared
 *                       angle cap.
 *
 * Regression guard:
 *   SPREAD_BASELINES holds frozen ourSpread values. Any layout change that
 *   inflates ourSpread beyond baseline + REGRESSION_TOLERANCE_DEG fails CI.
 *   To recapture baselines after an intentional improvement, update the object.
 *
 * Report:
 *   After all tests complete, a Markdown report is written to
 *   tests/results/reports/layout-benchmark.md with the full comparison table
 *   and a methodological explanation of the three fairness dimensions.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, afterAll } from 'vitest'
import { hierarchy, partition } from 'd3-hierarchy'
import { solveSkillTreeLayout } from '../utils/layoutSolver'
import { TREE_CONFIG } from '../config'
import { readDocumentFromCsvText } from '../utils/csv'
import { createSimpleTree, createCrossSegmentTree, createDenseTree } from './testUtils'

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __dir = dirname(fileURLToPath(import.meta.url))
const DATASETS_DIR = resolve(__dir, '../../../tests/e2e/datasets')
const REPORT_DIR = resolve(__dir, '../../../tests/results/reports')
const REPORT_PATH = resolve(REPORT_DIR, 'layout-benchmark.md')

function loadCsv(filename) {
  return readFileSync(resolve(DATASETS_DIR, filename), 'utf8')
}

// ---------------------------------------------------------------------------
// Regression constants
// ---------------------------------------------------------------------------

const REGRESSION_TOLERANCE_DEG = 3

/** Frozen ourSpread° baselines – update after intentional algorithm improvements. */
const SPREAD_BASELINES = {
  simple: 73.3,
  crossSegment: 241.3,
  dense: 200.9,
  smallCsv: 48.3,
  mediumCsv: 186.8,
}

// ---------------------------------------------------------------------------
// Dataset registry
// ---------------------------------------------------------------------------

const DATASETS = [
  { key: 'simple', label: 'simple fixture', getTree: () => createSimpleTree() },
  { key: 'crossSegment', label: 'cross-segment fixture', getTree: () => createCrossSegmentTree() },
  { key: 'dense', label: 'dense fixture', getTree: () => createDenseTree() },
  {
    key: 'smallCsv',
    label: 'small CSV',
    getTree: () => readDocumentFromCsvText(loadCsv('small.csv')),
  },
  {
    key: 'mediumCsv',
    label: 'medium CSV',
    getTree: () => readDocumentFromCsvText(loadCsv('medium.csv')),
  },
]

// ---------------------------------------------------------------------------
// Our-layout metrics
// ---------------------------------------------------------------------------

/** Actual angular spread consumed by our layout (degrees). */
function computeOurSpread(layoutNodes) {
  if (layoutNodes.length === 0) return 0
  const angles = layoutNodes.map((n) => n.angle)
  return Math.max(...angles) - Math.min(...angles)
}

/**
 * Count segment boundary crossings in our layout (adjacent nodes in angular
 * order at the same depth that belong to different segments, summed over all
 * depth rings). Our algorithm should produce at most (numSegments − 1) per ring.
 */
function computeOurSegmentCrossings(layoutNodes) {
  const byDepth = new Map()
  for (const n of layoutNodes) {
    if (!byDepth.has(n.depth)) byDepth.set(n.depth, [])
    byDepth.get(n.depth).push(n)
  }
  let total = 0
  for (const nodes of byDepth.values()) {
    const sorted = [...nodes].sort((a, b) => a.angle - b.angle)
    for (let i = 1; i < sorted.length; i++) {
      const segA = sorted[i - 1].segmentId ?? '__none__'
      const segB = sorted[i].segmentId ?? '__none__'
      if (segA !== segB) total += 1
    }
  }
  return total
}

// ---------------------------------------------------------------------------
// D3 partition metrics
// ---------------------------------------------------------------------------

/**
 * Run D3 partition with the SAME angular budget (maxAngleSpread) and the SAME
 * ring radii (taken from our layout output) as our algorithm, then measure:
 *
 *   overlapsAt270     – nodes whose proportional arc-length < nodeSize×gapFactor
 *   segmentCrossings  – adjacent-node pairs in angular order at each depth ring
 *                        that belong to different segments
 *   minRequiredSpread – minimum angle D3 would need for zero overlaps using the
 *                        actual layout radii (theoretical floor for fair comparison)
 *
 * Using the same radii means only the angular allocation strategy differs, not
 * the ring geometry.
 *
 * @param {object}   treeData    – { segments, children }
 * @param {object[]} layoutNodes – nodes from solveSkillTreeLayout (for radii)
 * @param {object}   config      – TREE_CONFIG
 */
function computeD3Analysis(treeData, layoutNodes, config) {
  const root = hierarchy(treeData, (d) => (d.children?.length > 0 ? d.children : null))
  root.count() // .value = leaf subtree count

  if (root.value === 0) {
    return { overlapsAt270: 0, segmentCrossings: 0, minRequiredSpreadDeg: 0, totalLeaves: 0, numSegments: 0, depthLevels: 0 }
  }

  // Radii: mirror our layout (min radius observed at each depth) so only
  // angular allocation differs between the two algorithms.
  const radiusByDepth = new Map()
  for (const n of layoutNodes) {
    const cur = radiusByDepth.get(n.depth)
    if (cur === undefined || n.radius < cur) radiusByDepth.set(n.depth, n.radius)
  }
  const maxDepth = root.height
  const maxRadius = radiusByDepth.get(maxDepth) ?? maxDepth * config.levelSpacing

  // Run D3 partition at maxAngleSpread
  const maxAngleRad = (config.maxAngleSpread * Math.PI) / 180
  const partitioned = partition().size([maxAngleRad, maxRadius])(root)

  const effectiveNodeSize = config.nodeSize * config.minArcGapFactor

  const d3Nodes = []
  partitioned.each((node) => {
    if (node.depth === 0) return
    const midRadius = radiusByDepth.get(node.depth) ?? node.depth * config.levelSpacing
    // Arc-length uses our actual ring radius (not the D3 partition y-coordinate)
    const arcLengthPx = (node.x1 - node.x0) * midRadius
    d3Nodes.push({
      id: node.data.id,
      segmentId: node.data.segmentId ?? null,
      depth: node.depth,
      midAngleDeg: ((node.x0 + node.x1) / 2) * (180 / Math.PI),
      arcSpanDeg: (node.x1 - node.x0) * (180 / Math.PI),
      arcLengthPx,
      hasOverlap: arcLengthPx < effectiveNodeSize,
    })
  })

  const overlapsAt270 = d3Nodes.filter((n) => n.hasOverlap).length

  // Segment boundary crossings in D3 angular order
  const byDepth = new Map()
  for (const n of d3Nodes) {
    if (!byDepth.has(n.depth)) byDepth.set(n.depth, [])
    byDepth.get(n.depth).push(n)
  }
  let segmentCrossings = 0
  for (const nodes of byDepth.values()) {
    const sorted = [...nodes].sort((a, b) => a.midAngleDeg - b.midAngleDeg)
    for (let i = 1; i < sorted.length; i++) {
      const segA = sorted[i - 1].segmentId ?? '__none__'
      const segB = sorted[i].segmentId ?? '__none__'
      if (segA !== segB) segmentCrossings += 1
    }
  }

  // Minimum spread needed for zero overlaps (theoretical floor)
  let minRequiredSpreadDeg = 0
  root.each((node) => {
    if (node.children?.length > 0) return // only leaf nodes are binding
    const radius = radiusByDepth.get(node.depth) ?? node.depth * config.levelSpacing
    if (radius <= 0) return
    const needed = (effectiveNodeSize * root.value * 180) / (Math.PI * radius)
    if (needed > minRequiredSpreadDeg) minRequiredSpreadDeg = needed
  })

  return {
    overlapsAt270,
    segmentCrossings,
    minRequiredSpreadDeg: Math.round(minRequiredSpreadDeg * 10) / 10,
    totalLeaves: root.value,
    numSegments: new Set(d3Nodes.map((n) => n.segmentId).filter(Boolean)).size,
    depthLevels: byDepth.size,
  }
}

// ---------------------------------------------------------------------------
// Full benchmark runner
// ---------------------------------------------------------------------------

function runFullBenchmark(label, key, treeData) {
  const result = solveSkillTreeLayout(treeData, TREE_CONFIG)
  const { nodes: layoutNodes } = result.layout

  const ourSpread = Math.round(computeOurSpread(layoutNodes) * 10) / 10
  const ourCrossings = computeOurSegmentCrossings(layoutNodes)
  const d3 = computeD3Analysis(treeData, layoutNodes, TREE_CONFIG)

  const ratio =
    d3.minRequiredSpreadDeg > 0
      ? Math.round((ourSpread / d3.minRequiredSpreadDeg) * 100) / 100
      : null

  return {
    label,
    key,
    nodeCount: layoutNodes.length,
    // Our algorithm
    ourSpread,
    ourCrossings,
    // D3 at same 270° budget
    d3MinSpread: d3.minRequiredSpreadDeg,
    d3OverlapsAt270: d3.overlapsAt270,
    d3SegmentCrossings: d3.segmentCrossings,
    // Derived
    overhead: Math.round((ourSpread - d3.minRequiredSpreadDeg) * 10) / 10,
    ratio,
    // Meta
    numSegments: d3.numSegments,
    depthLevels: d3.depthLevels,
    totalLeaves: d3.totalLeaves,
  }
}

// ---------------------------------------------------------------------------
// Markdown report writer
// ---------------------------------------------------------------------------

function renderTable(headers, rows) {
  const sep = headers.map(() => '---')
  const fmt = (row) => `| ${row.join(' | ')} |`
  return [fmt(headers), fmt(sep), ...rows.map(fmt)].join('\n')
}

function writeMarkdownReport(results) {
  const dateStr = new Date().toISOString().split('T')[0]
  const cfg = TREE_CONFIG
  const effectiveNodeSizePx = Math.round(cfg.nodeSize * cfg.minArcGapFactor * 10) / 10

  const summaryTable = renderTable(
    ['Dataset', 'Nodes', 'Our spread°', 'D3 min°', 'Overhead°', 'Ratio', 'D3 overlaps @270°', 'Seg crossings (ours/D3)'],
    results.map((r) => [
      r.label, String(r.nodeCount),
      `${r.ourSpread}°`, `${r.d3MinSpread}°`, `${r.overhead}°`,
      String(r.ratio ?? '—'),
      String(r.d3OverlapsAt270),
      `${r.ourCrossings} / ${r.d3SegmentCrossings}`,
    ]),
  )

  const baselineTable = renderTable(
    ['Key', 'Baseline spread', 'Tolerance'],
    Object.entries(SPREAD_BASELINES).map(([k, v]) => [k, `${v}°`, `±${REGRESSION_TOLERANCE_DEG}°`]),
  )

  const md = `# Layout Benchmark Report

_Generated: ${dateStr} — config: maxAngleSpread=${cfg.maxAngleSpread}°, nodeSize=${cfg.nodeSize}px, minArcGapFactor=${cfg.minArcGapFactor}, levelSpacing=${cfg.levelSpacing}px_

## Summary

${summaryTable}

## Methodology & Fairness of the Comparison

### Q1 — Is D3 also limited to 270°?

**No.** D3 \`partition()\` uses whatever angular range you provide via \`.size([angle, radius])\`.
By default it would consume the full \`2π\` (360°). For this benchmark both algorithms receive
the **same budget: ${cfg.maxAngleSpread}°** (\`maxAngleSpread\`).

The column **"D3 overlaps @270°"** answers the follow-up: if D3 is forced into that same
budget, how many nodes receive an arc-length smaller than
\`nodeSize × minArcGapFactor\` (= ${effectiveNodeSizePx} px)?
A non-zero count means D3 cannot place those nodes without visual overlap at this budget.

The column **"D3 min°"** is the theoretical minimum angle D3 would need to give every node
at least ${effectiveNodeSizePx} px of arc. When this value exceeds
${cfg.maxAngleSpread}°, D3 cannot fit the dataset within our budget at all. Our algorithm
handles such cases by expanding ring radii and using capacity-aware packing.

### Q2 — Does D3 respect segments (partitions)?

**No.** D3 partition follows **tree parent-child structure only** and has no knowledge of
the \`segmentId\` property. Nodes from the same segment may end up scattered across the
angular space whenever the tree topology crosses segment boundaries.

The column **"Seg crossings (ours/D3)"** counts how many adjacent-node pairs in the
angular ordering of each depth ring belong to **different segments** (summed across all rings):

- **Our algorithm** guarantees at most **(segments − 1) crossings per ring** because every
  segment is a contiguous wedge. The only boundaries are between neighbouring wedge blocks.
- **D3** can produce **far more crossings** whenever a parent's children belong to multiple
  segments — all those children land inside the parent's angular slot regardless of their
  own \`segmentId\`.

A higher D3 crossing count means more topic-mixing per ring, reducing roadmap readability.

### Q3 — Are node sizes comparable?

**The allocation strategies are fundamentally different:**

| Property | Our algorithm | D3 partition |
| --- | --- | --- |
| Arc-length per node | Fixed minimum: \`nodeSize × minArcGapFactor\` (${effectiveNodeSizePx} px) | Proportional to subtree leaf count |
| Small subtrees | Guaranteed same size as large ones | Squeezed to a tiny arc |
| Large subtrees | Limited by ring capacity | Potentially very wide arc |
| Ring radius | Expanded if nodes don't fit at \`levelSpacing\` | Fixed by \`.size()\` |

Because D3 does not enforce a pixel-floor, leaf nodes in lopsided trees receive
arbitrarily small arcs. Our algorithm prevents this through capacity packing — if a ring
cannot fit all nodes at the required pixel size, the ring radius is increased iteratively.

The **Ratio** (\`ourSpread / d3MinSpread\`) expresses how much more angle our algorithm
consumes over the geometric floor. Values close to 1.0 indicate near-optimal arc use.
Values above 1.0 reflect deliberate overhead: separator gaps, the \`minAngleSpread\` floor
(${cfg.minAngleSpread}°), minimum segment-label widths, and cross-segment separation margins.

## Dataset Details

${results.map((r) => `### ${r.label}

- **Nodes**: ${r.nodeCount} (${r.totalLeaves} leaves, ${r.depthLevels} depth level(s), ${r.numSegments} segment(s))
- **Our spread**: ${r.ourSpread}° | **D3 min spread**: ${r.d3MinSpread}° | **Overhead**: ${r.overhead}° | **Ratio**: ${r.ratio ?? '—'}
- **D3 overlaps at ${cfg.maxAngleSpread}°**: ${r.d3OverlapsAt270} node(s)
- **Segment crossings** — ours: ${r.ourCrossings}, D3: ${r.d3SegmentCrossings}
`).join('\n')}

## Regression Baselines

The following baselines are frozen in \`SPREAD_BASELINES\` inside \`layoutBenchmark.test.js\`.
A layout change that increases a dataset's spread by more than ${REGRESSION_TOLERANCE_DEG}° fails CI.
Update these values intentionally after verified algorithm improvements.

${baselineTable}
`

  mkdirSync(REPORT_DIR, { recursive: true })
  writeFileSync(REPORT_PATH, md, 'utf8')
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('layoutBenchmark', () => {
  describe('summary – benchmark table', () => {
    it('prints benchmark table for all datasets', () => {
      const results = DATASETS.map(({ key, label, getTree }) =>
        runFullBenchmark(label, key, getTree()),
      )
      console.table(
        results.map((r) => ({
          dataset: r.label,
          nodes: r.nodeCount,
          'ourSpread°': r.ourSpread,
          'd3Min°': r.d3MinSpread,
          'overhead°': r.overhead,
          ratio: r.ratio,
          'd3Overlaps@270°': r.d3OverlapsAt270,
          'segCross(ours/d3)': `${r.ourCrossings}/${r.d3SegmentCrossings}`,
        })),
      )
      expect(results.length).toBe(DATASETS.length)
    })
  })

  describe('regression guard – our spread must not exceed baseline', () => {
    it.each(DATASETS.map(({ key, label, getTree }) => [label, key, getTree]))(
      `%s spread ≤ baseline + ${REGRESSION_TOLERANCE_DEG}°`,
      (_, key, getTree) => {
        const { ourSpread } = runFullBenchmark(key, key, getTree())
        expect(ourSpread).toBeLessThanOrEqual(SPREAD_BASELINES[key] + REGRESSION_TOLERANCE_DEG)
      },
    )
  })

  describe('D3 comparison – fairness checks', () => {
    it.each(DATASETS.map(({ key, label, getTree }) => [label, key, getTree]))(
      '%s: D3 min spread is non-negative',
      (_, key, getTree) => {
        const { d3MinSpread, nodeCount } = runFullBenchmark(key, key, getTree())
        if (nodeCount === 0) return
        expect(d3MinSpread).toBeGreaterThanOrEqual(0)
      },
    )

    it.each(DATASETS.map(({ key, label, getTree }) => [label, key, getTree]))(
      '%s: efficiency ratio < 10 (no extreme angular waste)',
      (_, key, getTree) => {
        const { ratio, nodeCount } = runFullBenchmark(key, key, getTree())
        if (nodeCount === 0) return
        expect(ratio).toBeLessThan(10)
      },
    )

    it.each(DATASETS.map(({ key, label, getTree }) => [label, key, getTree]))(
      '%s: our segment crossings ≤ D3 crossings (we never do worse on ordering)',
      (_, key, getTree) => {
        const { ourCrossings, d3SegmentCrossings, numSegments, nodeCount } = runFullBenchmark(
          key, key, getTree(),
        )
        if (nodeCount <= 1 || numSegments <= 1) return
        expect(ourCrossings).toBeLessThanOrEqual(d3SegmentCrossings)
      },
    )
  })

  describe('individual fixture checks', () => {
    it('simple fixture: ourSpread matches baseline within tolerance', () => {
      const { ourSpread } = runFullBenchmark('simple', 'simple', createSimpleTree())
      expect(ourSpread).toBeLessThanOrEqual(SPREAD_BASELINES.simple + REGRESSION_TOLERANCE_DEG)
      expect(ourSpread).toBeGreaterThanOrEqual(SPREAD_BASELINES.simple - REGRESSION_TOLERANCE_DEG)
    })

    it('dense fixture: ourSpread is within [minAngleSpread, maxAngleSpread + tolerance]', () => {
      const { ourSpread } = runFullBenchmark('dense', 'dense', createDenseTree())
      expect(ourSpread).toBeGreaterThanOrEqual(TREE_CONFIG.minAngleSpread)
      expect(ourSpread).toBeLessThanOrEqual(TREE_CONFIG.maxAngleSpread + REGRESSION_TOLERANCE_DEG)
    })

    it('simple fixture: our segment crossings ≤ (segments−1) × depthLevels', () => {
      const { ourCrossings, numSegments, depthLevels } = runFullBenchmark(
        'simple', 'simple', createSimpleTree(),
      )
      expect(ourCrossings).toBeLessThanOrEqual(Math.max(0, numSegments - 1) * depthLevels)
    })
  })

  // -------------------------------------------------------------------------
  // Report generation – runs once after all tests, writes markdown file
  // -------------------------------------------------------------------------

  afterAll(() => {
    const results = DATASETS.map(({ key, label, getTree }) =>
      runFullBenchmark(label, key, getTree()),
    )
    writeMarkdownReport(results)
  })
})
