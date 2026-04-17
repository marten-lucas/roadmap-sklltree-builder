export const LEGEND_DENSITY_MODES = Object.freeze({
  full: 'full',
  compact: 'compact',
  noPortals: 'no-portals',
  iconsOnly: 'icons-only',
})

export const resolveLegendDensity = ({
  availableWidth = 0,
  fullWidth = 0,
  compactWidth = 0,
  portalLessWidth = 0,
  iconOnlyWidth = 0,
} = {}) => {
  const width = Number.isFinite(availableWidth) ? availableWidth : 0
  const normalizedFullWidth = Math.max(fullWidth, compactWidth, portalLessWidth, iconOnlyWidth, 0)
  const normalizedCompactWidth = Math.max(compactWidth, portalLessWidth, iconOnlyWidth, 0)
  const normalizedPortalLessWidth = Math.max(portalLessWidth, iconOnlyWidth, 0)

  if (width >= normalizedFullWidth) {
    return LEGEND_DENSITY_MODES.full
  }

  if (width >= normalizedCompactWidth) {
    return LEGEND_DENSITY_MODES.compact
  }

  if (width >= normalizedPortalLessWidth) {
    return LEGEND_DENSITY_MODES.noPortals
  }

  return LEGEND_DENSITY_MODES.iconsOnly
}
