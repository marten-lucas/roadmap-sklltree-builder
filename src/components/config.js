const STATUS_ALIAS_MAP = {
  done: 'done',
  now: 'now',
  next: 'next',
  later: 'later',
  fertig: 'done',
  jetzt: 'now',
  spaeter: 'later',
  später: 'later',
}

export const normalizeStatusKey = (status) => {
  if (!status) {
    return 'later'
  }

  const normalized = String(status).trim().toLowerCase()
  return STATUS_ALIAS_MAP[normalized] ?? 'later'
}

export const STATUS_LABELS = {
  done: 'Done',
  now: 'Now',
  next: 'Next',
  later: 'Later',
}

export const STATUS_STYLES = {
  done: {
    glow: 'none',
    ring: '#8f9bab',
    ringBand: '#9eabbb',
    badge: '#9eabbb',
    textColor: '#5a6576',
    glowSegment: 'transparent',
    linkStroke: '#94a3b8',
    linkStrokeWidth: '2.5',
    linkOpacity: '0.35',
  },
  now: {
    glow: '0 0 32px rgba(239, 68, 68, 0.75)',
    ring: '#dc2626',
    ringBand: '#ef4444',
    badge: '#ef4444',
    textColor: '#ffffff',
    glowSegment: 'rgba(239, 68, 68, 0.55)',
    linkStroke: '#dc2626',
    linkStrokeWidth: '4.5',
    linkOpacity: '1',
  },
  next: {
    glow: '0 0 16px rgba(6, 182, 212, 0.35)',
    ring: '#0891b2',
    ringBand: '#06b6d4',
    badge: '#06b6d4',
    textColor: '#ffffff',
    glowSegment: 'rgba(6, 182, 212, 0.28)',
    linkStroke: '#06b6d4',
    linkStrokeWidth: '3',
    linkOpacity: '0.65',
  },
  later: {
    glow: 'none',
    ring: '#3f4b5c',
    ringBand: '#4f5f75',
    badge: '#4f5f75',
    textColor: '#4f5f75',
    glowSegment: 'transparent',
    linkStroke: '#94a3b8',
    linkStrokeWidth: '2',
    linkOpacity: '0.4',
  },
}

/**
 * Zoom thresholds for responsive node label display.
 * Adjust these values to change when the label mode switches.
 *
 *   scale < farToMid  → 'far'   (short name only)
 *   farToMid ≤ scale < midToClose → 'mid'   (full name + short name)
 *   scale ≥ midToClose → 'close' (full name + short name + release note card)
 */
export const NODE_LABEL_ZOOM = {
  farToMid: 0.7,
  midToClose: 1.0,
  closeToVeryClose: 2.0,
}

/**
 * 20 distinct colors available for scope assignment.
 * Ordered to cover the hue wheel with good visual separation.
 */
export const SCOPE_COLORS = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#d946ef', // fuchsia
  '#ec4899', // pink
  '#f43f5e', // rose
  '#ef4444', // red
  '#f97316', // orange
  '#f59e0b', // amber
  '#eab308', // yellow
  '#84cc16', // lime
  '#22c55e', // green
  '#10b981', // emerald
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#0ea5e9', // sky
  '#3b82f6', // blue
  '#6d28d9', // dark violet
  '#be185d', // dark pink
  '#92400e', // dark amber
  '#475569', // slate
]

/**
 * Returns '#ffffff' or '#0f172a' depending on the brightness of the given
 * hex color, so that text placed on top of it remains readable.
 */
export const getScopeContrastColor = (hexColor) => {
  if (!hexColor || typeof hexColor !== 'string') return '#ffffff'
  const hex = hexColor.replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return '#ffffff'
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.55 ? '#0f172a' : '#ffffff'
}

export const TREE_CONFIG = {
  minAngleSpread: 140,
  maxAngleSpread: 270,
  nodeSize: 120,
  minArcGapFactor: 1.08,
  promotionProfile: 'balanced',
  routingProfile: 'strict',
  separatorHomogeneityProfile: 'balanced',
  levelSpacing: 180,
  horizontalPadding: 600,
  topPadding: 600,
  bottomPadding: 600,
}
