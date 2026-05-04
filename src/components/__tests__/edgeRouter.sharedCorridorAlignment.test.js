import { describe, expect, it } from 'vitest'
import { buildRoutedEdgeLinks } from '../utils/edgeRouter'

const createNode = ({ id, angle, radius, depth = 1, segmentId = 'seg-a' }) => ({
  id,
  x: Math.cos((angle * Math.PI) / 180) * radius,
  y: Math.sin((angle * Math.PI) / 180) * radius,
  angle,
  radius,
  depth,
  segmentId,
})

const parsePathTokens = (path) => String(path).trim().split(/\s+/)

const findSecondArcRadius = (path) => {
  const tokens = parsePathTokens(path)
  let arcCount = 0
  for (let i = 0; i < tokens.length; i += 1) {
    if (tokens[i] !== 'A') continue
    arcCount += 1
    if (arcCount === 2) {
      return Number(tokens[i + 1])
    }
    i += 7
  }
  return null
}

const findFirstArcRadius = (path) => {
  const tokens = parsePathTokens(path)
  for (let i = 0; i < tokens.length; i += 1) {
    if (tokens[i] !== 'A') continue
    return Number(tokens[i + 1])
  }
  return null
}

describe('edgeRouter shared corridor alignment', () => {
  it('uses one shared corridor radius per trunk group', () => {
    const parentId = 'parent'
    const edgeRouting = {
      trunkGroups: [
        {
          id: 'group-1',
          childIds: ['child-near', 'child-far'],
        },
      ],
      edgePlans: [
        {
          id: 'edge-near',
          parentId,
          childId: 'child-near',
          groupId: 'group-1',
          sourceLevel: 2,
          targetLevel: 4,
          sourceRadius: 100,
          targetRadius: 240,
          parentSegmentId: 'seg-a',
          childSegmentId: 'seg-b',
          parentSegmentIndex: 0,
          childSegmentIndex: 1,
          segmentDistance: 1,
          childAngle: 26,
          trunkAngle: 10,
          isPrimaryGroupChild: false,
          minGroupAngle: 5,
          maxGroupAngle: 26,
        },
        {
          id: 'edge-far',
          parentId,
          childId: 'child-far',
          groupId: 'group-1',
          sourceLevel: 2,
          targetLevel: 4,
          sourceRadius: 100,
          targetRadius: 240,
          parentSegmentId: 'seg-a',
          childSegmentId: 'seg-c',
          parentSegmentIndex: 0,
          childSegmentIndex: 3,
          segmentDistance: 3,
          childAngle: 5,
          trunkAngle: 10,
          isPrimaryGroupChild: false,
          minGroupAngle: 5,
          maxGroupAngle: 26,
        },
      ],
    }

    const nodesById = new Map([
      [parentId, createNode({ id: parentId, angle: 0, radius: 100, depth: 2, segmentId: 'seg-a' })],
      ['child-near', createNode({ id: 'child-near', angle: 26, radius: 240, depth: 4, segmentId: 'seg-b' })],
      ['child-far', createNode({ id: 'child-far', angle: 5, radius: 240, depth: 4, segmentId: 'seg-c' })],
    ])

    const links = buildRoutedEdgeLinks({
      edgeRouting,
      nodesById,
      origin: { x: 0, y: 0 },
      nodeSize: 48,
      getSegmentOrderIndex: (segmentId) => ({ 'seg-a': 0, 'seg-b': 1, 'seg-c': 3 }[segmentId] ?? 0),
    })

    const near = links.find((link) => link.targetId === 'child-near')
    const far = links.find((link) => link.targetId === 'child-far')

    expect(near).toBeTruthy()
    expect(far).toBeTruthy()

    // child-near (angle 26) is past the trunk (angle 10), so it gets full trunk routing: two arcs.
    // child-far (angle 5) is between parent (angle 0) and trunk (angle 10), so it routes directly:
    // one arc from parent angle to child angle — no double-back to trunk.
    const nearSecondArcRadius = findSecondArcRadius(near.path)
    const farFirstArcRadius = findFirstArcRadius(far.path)
    const farSecondArcRadius = findSecondArcRadius(far.path)

    expect(nearSecondArcRadius).not.toBeNull()
    expect(farFirstArcRadius).not.toBeNull()
    expect(farSecondArcRadius).toBeNull() // direct routing — only one arc
    expect(nearSecondArcRadius).toBeCloseTo(farFirstArcRadius, 6) // same corridor radius
  })
})
