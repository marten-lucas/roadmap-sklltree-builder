import { describe, expect, it } from 'vitest'
import { STATUS_STYLES } from '../config'
import { TEMPORAL_LINK_LAYER_ORDER, getTemporalLinkPriority } from '../utils/linkPresentation'

describe('linkPresentation temporal hierarchy', () => {
  it('stacks links from done at the bottom to now at the top', () => {
    expect(TEMPORAL_LINK_LAYER_ORDER.done).toBeLessThan(TEMPORAL_LINK_LAYER_ORDER.someday)
    expect(TEMPORAL_LINK_LAYER_ORDER.someday).toBeLessThan(TEMPORAL_LINK_LAYER_ORDER.later)
    expect(TEMPORAL_LINK_LAYER_ORDER.later).toBeLessThan(TEMPORAL_LINK_LAYER_ORDER.next)
    expect(TEMPORAL_LINK_LAYER_ORDER.next).toBeLessThan(TEMPORAL_LINK_LAYER_ORDER.now)

    expect(getTemporalLinkPriority('done')).toBe(0)
    expect(getTemporalLinkPriority('now')).toBe(4)
  })

  it('uses transparent link opacities so overlapped multiline links remain visible', () => {
    const doneOpacity = Number.parseFloat(STATUS_STYLES.done.linkOpacity)
    const somedayOpacity = Number.parseFloat(STATUS_STYLES.someday.linkOpacity)
    const laterOpacity = Number.parseFloat(STATUS_STYLES.later.linkOpacity)
    const nextOpacity = Number.parseFloat(STATUS_STYLES.next.linkOpacity)
    const nowOpacity = Number.parseFloat(STATUS_STYLES.now.linkOpacity)

    expect(doneOpacity).toBeGreaterThan(0)
    expect(doneOpacity).toBeLessThan(somedayOpacity)
    expect(somedayOpacity).toBeLessThan(laterOpacity)
    expect(laterOpacity).toBeLessThan(nextOpacity)
    expect(nextOpacity).toBeLessThan(nowOpacity)
    expect(nowOpacity).toBeLessThan(1)
  })
})