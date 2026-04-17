import { describe, expect, it } from 'vitest'
import { LEGEND_DENSITY_MODES, resolveLegendDensity } from '../utils/legendDensity'

describe('resolveLegendDensity', () => {
  const widths = {
    fullWidth: 980,
    compactWidth: 760,
    portalLessWidth: 560,
    iconOnlyWidth: 260,
  }

  it('keeps the full legend when enough width is available', () => {
    expect(resolveLegendDensity({ availableWidth: 1000, ...widths })).toBe(LEGEND_DENSITY_MODES.full)
  })

  it('drops the secondary text first when space gets tight', () => {
    expect(resolveLegendDensity({ availableWidth: 800, ...widths })).toBe(LEGEND_DENSITY_MODES.compact)
  })

  it('removes portal items before hiding the main status labels', () => {
    expect(resolveLegendDensity({ availableWidth: 600, ...widths })).toBe(LEGEND_DENSITY_MODES.noPortals)
  })

  it('falls back to symbols only when very little space remains', () => {
    expect(resolveLegendDensity({ availableWidth: 240, ...widths })).toBe(LEGEND_DENSITY_MODES.iconsOnly)
  })
})
