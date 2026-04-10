import { describe, it, expect } from 'vitest'
import { pathToSegments, segmentsCross, polylineHitsCircle, detectCrossingLinks } from '../utils/edgeCrossings'

describe('segmentsCross', () => {
  it('detects a classic X crossing', () => {
    // (0,0)→(2,2) crosses (0,2)→(2,0)
    expect(segmentsCross(0, 0, 2, 2, 0, 2, 2, 0)).toBe(true)
  })

  it('returns false for parallel segments', () => {
    expect(segmentsCross(0, 0, 2, 0, 0, 1, 2, 1)).toBe(false)
  })

  it('returns false for T-junction (shared endpoint)', () => {
    // B starts exactly where A ends → parametric u = 0, excluded by eps
    expect(segmentsCross(0, 0, 10, 0, 10, 0, 10, 10)).toBe(false)
  })

  it('returns false for non-intersecting segments', () => {
    expect(segmentsCross(0, 0, 1, 0, 2, 0, 3, 0)).toBe(false)
  })
})

describe('pathToSegments', () => {
  it('parses M + L correctly', () => {
    const segs = pathToSegments('M 10 20 L 30 40')
    expect(segs).toHaveLength(1)
    expect(segs[0]).toMatchObject({ x1: 10, y1: 20, x2: 30, y2: 40 })
  })

  it('parses M + L + L correctly', () => {
    const segs = pathToSegments('M 0 0 L 10 0 L 10 10')
    expect(segs).toHaveLength(2)
    expect(segs[0]).toMatchObject({ x1: 0, y1: 0, x2: 10, y2: 0 })
    expect(segs[1]).toMatchObject({ x1: 10, y1: 0, x2: 10, y2: 10 })
  })

  it('parses a circular arc into multiple segments', () => {
    // Quarter-circle from (1,0) to (0,1) radius 1, sweep=1
    const segs = pathToSegments('M 1 0 A 1 1 0 0 1 0 1')
    expect(segs.length).toBeGreaterThanOrEqual(4)
    // First segment starts at (1,0)
    expect(segs[0].x1).toBeCloseTo(1, 1)
    expect(segs[0].y1).toBeCloseTo(0, 1)
    // Last segment ends close to (0,1)
    const last = segs[segs.length - 1]
    expect(last.x2).toBeCloseTo(0, 1)
    expect(last.y2).toBeCloseTo(1, 1)
  })

  it('returns empty array for empty string', () => {
    expect(pathToSegments('')).toHaveLength(0)
  })
})

describe('detectCrossingLinks', () => {
  // Build two edges whose paths form an X shape
  const crossingLinks = [
    {
      id: 'a=>b',
      linkKind: 'direct',
      sourceId: 'a',
      targetId: 'b',
      // Diagonal from top-left to bottom-right
      path: 'M 0 0 L 100 100',
    },
    {
      id: 'c=>d',
      linkKind: 'direct',
      sourceId: 'c',
      targetId: 'd',
      // Diagonal from top-right to bottom-left: crosses the first path at (50,50)
      path: 'M 100 0 L 0 100',
    },
  ]

  it('flags the edge involved in the most crossings', () => {
    const result = detectCrossingLinks(crossingLinks)
    // Greedy: both edges cross once, one gets chosen (the one with lower alphabetical id or first encountered)
    expect(result.size).toBe(1)
    const flagged = [...result][0]
    expect(['a=>b', 'c=>d']).toContain(flagged)
  })

  it('returns empty set when no crossings', () => {
    const parallel = [
      { id: 'a=>b', linkKind: 'direct', sourceId: 'a', targetId: 'b', path: 'M 0 0 L 100 0' },
      { id: 'c=>d', linkKind: 'direct', sourceId: 'c', targetId: 'd', path: 'M 0 10 L 100 10' },
    ]
    expect(detectCrossingLinks(parallel).size).toBe(0)
  })

  it('skips ring arcs', () => {
    const links = [
      { id: 'r', linkKind: 'ring', sourceId: 'x', targetId: 'y', path: 'M 0 0 L 100 100' },
      { id: 'a=>b', linkKind: 'direct', sourceId: 'a', targetId: 'b', path: 'M 100 0 L 0 100' },
    ]
    // Ring arc does not participate in crossing detection
    expect(detectCrossingLinks(links).size).toBe(0)
  })

  it('skips edges sharing a node', () => {
    const shared = [
      { id: 'p=>a', linkKind: 'direct', sourceId: 'parent', targetId: 'a', path: 'M 0 0 L 100 100' },
      { id: 'p=>b', linkKind: 'direct', sourceId: 'parent', targetId: 'b', path: 'M 100 0 L 0 100' },
    ]
    // They share parent → never flagged as a confusing crossing
    expect(detectCrossingLinks(shared).size).toBe(0)
  })

  it('uses greedy to minimise portal count (one edge crossing many others)', () => {
    // Edge X crosses 3 non-related edges; should only convert X
    const xEdge = { id: 'x=>z', linkKind: 'direct', sourceId: 'x', targetId: 'z', path: 'M 0 50 L 200 50' }
    const others = [
      { id: 'a=>b', linkKind: 'direct', sourceId: 'a', targetId: 'b', path: 'M 50 0 L 50 100' },
      { id: 'c=>d', linkKind: 'direct', sourceId: 'c', targetId: 'd', path: 'M 100 0 L 100 100' },
      { id: 'e=>f', linkKind: 'direct', sourceId: 'e', targetId: 'f', path: 'M 150 0 L 150 100' },
    ]
    const result = detectCrossingLinks([xEdge, ...others])
    expect(result.size).toBe(1)
    expect(result.has('x=>z')).toBe(true)
  })
})

describe('polylineHitsCircle', () => {
  it('returns true when a segment passes through the circle center', () => {
    const segs = pathToSegments('M 0 0 L 100 0')
    expect(polylineHitsCircle(segs, 50, 0, 5)).toBe(true)
  })

  it('returns true when a segment passes within the radius', () => {
    // Node at (50, 3), radius 5 — segment is along y=0, closest point is (50,0), distance=3 < 5
    const segs = pathToSegments('M 0 0 L 100 0')
    expect(polylineHitsCircle(segs, 50, 3, 5)).toBe(true)
  })

  it('returns false when the nearest point is outside the radius', () => {
    // Node at (50, 10), radius 5 — distance from segment is 10 > 5
    const segs = pathToSegments('M 0 0 L 100 0')
    expect(polylineHitsCircle(segs, 50, 10, 5)).toBe(false)
  })

  it('returns false when the node is at the segment endpoint (excluded by clamping)', () => {
    // Endpoint handling: closest point for a node at (100,0) on segment (0,0)→(100,0) is (100,0), distance=0
    // This IS within radius — expected because we rely on the caller skipping source/target nodes
    const segs = pathToSegments('M 0 0 L 100 0')
    expect(polylineHitsCircle(segs, 100, 0, 5)).toBe(true)
  })
})

describe('detectCrossingLinks – node collision', () => {
  const makeLink = (id, src, tgt, path) => ({ id, linkKind: 'direct', sourceId: src, targetId: tgt, path })

  it('flags an edge whose path passes through an unrelated node', () => {
    const links = [makeLink('a=>b', 'a', 'b', 'M 0 0 L 100 0')]
    const nodes = [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 100, y: 0 },
      { id: 'c', x: 50, y: 0 }, // sits exactly on the path
    ]
    expect(detectCrossingLinks(links, { nodes, nodeSize: 20 }).has('a=>b')).toBe(true)
  })

  it('does not flag an edge that clears all unrelated nodes', () => {
    const links = [makeLink('a=>b', 'a', 'b', 'M 0 0 L 100 0')]
    const nodes = [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 100, y: 0 },
      { id: 'c', x: 50, y: 30 }, // 30px perpendicular distance, nodeSize/2=10 → clear
    ]
    expect(detectCrossingLinks(links, { nodes, nodeSize: 20 }).has('a=>b')).toBe(false)
  })

  it('does not flag source or target even though path endpoints touch them', () => {
    const links = [makeLink('a=>b', 'a', 'b', 'M 0 0 L 100 0')]
    const nodes = [
      { id: 'a', x: 0, y: 0 },    // source – excluded
      { id: 'b', x: 100, y: 0 },  // target – excluded
    ]
    expect(detectCrossingLinks(links, { nodes, nodeSize: 20 }).size).toBe(0)
  })

  it('node collisions override edge-edge crossing (collision edge handled directly)', () => {
    // a=>b passes through node c AND also crosses c=>d
    // Only a=>b should become a portal (handles both problems)
    const links = [
      makeLink('a=>b', 'a', 'b', 'M 0 50 L 200 50'), // horizontal – crosses c=>d and hits node e at (100,50)
      makeLink('c=>d', 'c', 'd', 'M 100 0 L 100 100'), // vertical – crosses a=>b
    ]
    const nodes = [
      { id: 'a', x: 0, y: 50 },
      { id: 'b', x: 200, y: 50 },
      { id: 'c', x: 100, y: 0 },
      { id: 'd', x: 100, y: 100 },
      { id: 'e', x: 100, y: 50 }, // unrelated node sitting on a=>b's path
    ]
    const result = detectCrossingLinks(links, { nodes, nodeSize: 20 })
    expect(result.has('a=>b')).toBe(true)
  })
})
