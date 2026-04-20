import { describe, expect, it } from 'vitest'
import { getNodeLevelIndexFromPointer, getPortalCounterpartNodeIdFromData, isDoubleActivation } from '../utils/nodeInteraction'

describe('nodeInteraction helpers', () => {
  const createPointerEvent = ({ clientX, clientY, left = 100, top = 100, width = 120, height = 120 }) => ({
    clientX,
    clientY,
    currentTarget: {
      getBoundingClientRect: () => ({ left, top, width, height }),
    },
  })

  it('resolves a ring level index from pointer position', () => {
    const event = createPointerEvent({ clientX: 160, clientY: 110 })
    const index = getNodeLevelIndexFromPointer({
      event,
      nodeSize: 120,
      levelsLength: 4,
      innerRadiusRatio: 0.5,
    })

    expect(index).toBeTypeOf('number')
    expect(index).toBeGreaterThanOrEqual(0)
    expect(index).toBeLessThan(4)
  })

  it('returns null for inner clicks near the node center', () => {
    const event = createPointerEvent({ clientX: 160, clientY: 160 })
    const index = getNodeLevelIndexFromPointer({
      event,
      nodeSize: 120,
      levelsLength: 4,
      innerRadiusRatio: 0.74,
    })

    expect(index).toBeNull()
  })

  it('detects double activation within threshold', () => {
    expect(isDoubleActivation(1000, 1300)).toBe(true)
    expect(isDoubleActivation(1000, 1500)).toBe(false)
  })

  it('resolves the counterpart node id for portal metadata', () => {
    expect(getPortalCounterpartNodeIdFromData({ nodeId: 'a', sourceId: 'a', targetId: 'b', portalKey: 'dep:source' })).toBe('b')
    expect(getPortalCounterpartNodeIdFromData({ nodeId: 'b', sourceId: 'a', targetId: 'b', portalKey: 'dep:target' })).toBe('a')
    expect(getPortalCounterpartNodeIdFromData({ nodeId: 'x', sourceId: 'a', targetId: 'b', portalKey: 'dep:source' })).toBe('b')
  })
})
