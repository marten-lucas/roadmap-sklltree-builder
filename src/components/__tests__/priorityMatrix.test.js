import { describe, it, expect } from 'vitest'
import { AXIS_SIZES, AXIS_COUNT, computeMatrixLayout } from '../utils/matrixLayout'

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

    // xs is col=1 because unclear occupies col=0.
    // xs benefit is row=1 (inverted on Y-axis).
    const PADDING = 48
    const expectedCX = PADDING + 1 * cellSize + cellSize / 2
    const expectedCY = PADDING + (AXIS_COUNT - 1 - 1) * cellSize + cellSize / 2
    expect(x).toBeCloseTo(expectedCX, 1)
    expect(y).toBeCloseTo(expectedCY, 1)
  })

  it('places xl effort + xl benefit at top-right', () => {
    const nodes = [makeNode('b', 'xl', 'xl')]
    const cellSize = 100
    const result = computeMatrixLayout(nodes, cellSize)

    expect(result).toHaveLength(1)
    const { x, y } = result[0]

    const PADDING = 48
    const expectedCX = PADDING + 5 * cellSize + cellSize / 2
    const expectedCY = PADDING + 0 * cellSize + cellSize / 2
    expect(x).toBeCloseTo(expectedCX, 1)
    expect(y).toBeCloseTo(expectedCY, 1)
  })

  it('places nodes with unclear effort or benefit into the unclear row/column', () => {
    const nodes = [
      makeNode('a', 'unclear', 'xl'),
      makeNode('b', 'xs', 'unclear'),
      makeNode('c', 'unclear', 'unclear'),
    ]
    const result = computeMatrixLayout(nodes, 100)
    expect(result).toHaveLength(3)
    expect(result.map((entry) => entry.effortKey)).toEqual(expect.arrayContaining(['unclear', 'xs']))
    expect(result.map((entry) => entry.benefitKey)).toEqual(expect.arrayContaining(['xl', 'unclear']))
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

  it('handles all axis cells with one node each', () => {
    const nodes = []
    let i = 0
    for (const ef of AXIS_SIZES) {
      for (const be of AXIS_SIZES) {
        nodes.push(makeNode(`n${i++}`, ef, be))
      }
    }
    const result = computeMatrixLayout(nodes, 80)
    expect(result).toHaveLength(AXIS_COUNT * AXIS_COUNT)

    // All cells should be different coordinates
    const coords = result.map((r) => `${Math.round(r.x)},${Math.round(r.y)}`)
    const unique = new Set(coords)
    expect(unique.size).toBe(AXIS_COUNT * AXIS_COUNT)
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

  it('supports rectangular cells so the panel can use full width and height', () => {
    const node = makeNode('rect', 'l', 's')
    const result = computeMatrixLayout([node], { width: 120, height: 72 })

    expect(result).toHaveLength(1)
    expect(result[0].x).toBeCloseTo(48 + 4 * 120 + 60, 1)
    expect(result[0].y).toBeCloseTo(48 + 3 * 72 + 36, 1)
  })

  it('keeps dense same-cell nodes inside cell bounds', () => {
    const nodes = Array.from({ length: 60 }, (_, index) => makeNode(`dense-${index}`, 'unclear', 'unclear'))
    const cellSize = 80
    const result = computeMatrixLayout(nodes, cellSize)

    expect(result).toHaveLength(60)

    const cellLeft = 48
    const cellTop = 48 + (AXIS_COUNT - 1) * cellSize
    const cellRight = cellLeft + cellSize
    const cellBottom = cellTop + cellSize

    for (const entry of result) {
      const radius = entry.radius ?? 0
      expect(entry.x - radius).toBeGreaterThanOrEqual(cellLeft - 0.01)
      expect(entry.x + radius).toBeLessThanOrEqual(cellRight + 0.01)
      expect(entry.y - radius).toBeGreaterThanOrEqual(cellTop - 0.01)
      expect(entry.y + radius).toBeLessThanOrEqual(cellBottom + 0.01)
    }
  })
})
