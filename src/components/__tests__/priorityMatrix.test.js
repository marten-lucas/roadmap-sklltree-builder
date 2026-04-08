import { describe, it, expect } from 'vitest'
import { computeMatrixLayout } from '../utils/matrixLayout'

const makeNode = (id, effortSize, benefitSize, status = 'later') => ({
  id,
  label: `Node ${id}`,
  shortName: id,
  status,
  effort: { size: effortSize, customPoints: null },
  benefit: { size: benefitSize },
  children: [],
})

describe('computeMatrixLayout', () => {
  it('places a single node in the correct cell center', () => {
    const nodes = [makeNode('a', 'xs', 'xs')]
    const cellSize = 100
    const result = computeMatrixLayout(nodes, cellSize)

    expect(result).toHaveLength(1)
    const { x, y, effortKey, benefitKey } = result[0]
    expect(effortKey).toBe('xs')
    expect(benefitKey).toBe('xs')

    // xs is col=0, xs benefit is row=0 (but inverted: AXIS_COUNT-1-0=4)
    const PADDING = 48
    const expectedCX = PADDING + 0 * cellSize + cellSize / 2
    const expectedCY = PADDING + 4 * cellSize + cellSize / 2
    expect(x).toBeCloseTo(expectedCX, 1)
    expect(y).toBeCloseTo(expectedCY, 1)
  })

  it('places xl effort + xl benefit at top-right (col=4, row=0 inverted)', () => {
    const nodes = [makeNode('b', 'xl', 'xl')]
    const cellSize = 100
    const result = computeMatrixLayout(nodes, cellSize)

    expect(result).toHaveLength(1)
    const { x, y } = result[0]

    const PADDING = 48
    const expectedCX = PADDING + 4 * cellSize + cellSize / 2
    const expectedCY = PADDING + 0 * cellSize + cellSize / 2
    expect(x).toBeCloseTo(expectedCX, 1)
    expect(y).toBeCloseTo(expectedCY, 1)
  })

  it('returns empty for nodes with unclear effort or benefit', () => {
    const nodes = [
      makeNode('a', 'unclear', 'xl'),
      makeNode('b', 'xs', 'unclear'),
      makeNode('c', 'unclear', 'unclear'),
    ]
    // computeMatrixLayout itself doesn't filter — the caller does via filterPlottableNodes
    // But unclear nodes won't match AXIS_SIZES so they produce no output
    const result = computeMatrixLayout(nodes, 100)
    expect(result).toHaveLength(0)
  })

  it('places multiple nodes in the same cell without overlapping', () => {
    const NODE_RADIUS = 18
    const NODE_COLLISION_MARGIN = 4
    const nodes = [
      makeNode('a', 'm', 'm'),
      makeNode('b', 'm', 'm'),
      makeNode('c', 'm', 'm'),
      makeNode('d', 'm', 'm'),
    ]
    const cellSize = 120
    const result = computeMatrixLayout(nodes, cellSize)

    expect(result).toHaveLength(4)

    // No two nodes should overlap: distance >= 2*NODE_RADIUS + NODE_COLLISION_MARGIN
    const minDist = NODE_RADIUS * 2 + NODE_COLLISION_MARGIN
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const dx = result[i].x - result[j].x
        const dy = result[i].y - result[j].y
        const dist = Math.sqrt(dx * dx + dy * dy)
        expect(dist).toBeGreaterThanOrEqual(minDist - 0.01)
      }
    }
  })

  it('handles all 25 cells with one node each', () => {
    const AXIS_SIZES = ['xs', 's', 'm', 'l', 'xl']
    const nodes = []
    let i = 0
    for (const ef of AXIS_SIZES) {
      for (const be of AXIS_SIZES) {
        nodes.push(makeNode(`n${i++}`, ef, be))
      }
    }
    const result = computeMatrixLayout(nodes, 80)
    expect(result).toHaveLength(25)

    // All cells should be different coordinates
    const coords = result.map((r) => `${Math.round(r.x)},${Math.round(r.y)}`)
    const unique = new Set(coords)
    expect(unique.size).toBe(25)
  })

  it('correctly assigns effortKey and benefitKey', () => {
    const nodes = [makeNode('n1', 'l', 's')]
    const result = computeMatrixLayout(nodes, 100)
    expect(result[0].effortKey).toBe('l')
    expect(result[0].benefitKey).toBe('s')
  })

  it('preserves node reference in result', () => {
    const node = makeNode('x', 'xl', 'm')
    const result = computeMatrixLayout([node], 80)
    expect(result[0].node).toBe(node)
  })
})
