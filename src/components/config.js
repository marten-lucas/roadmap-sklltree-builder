const STATUS_ALIAS_MAP = {
  done: 'done',
  now: 'now',
  next: 'next',
  later: 'later',
  someday: 'someday',
  hidden: 'hidden',
  fertig: 'done',
  jetzt: 'now',
  spaeter: 'later',
  später: 'later',
  irgendwann: 'someday',
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
  someday: 'Someday',
  hidden: 'Hidden',
}

export const DEFAULT_STATUS_DESCRIPTIONS = {
  now: 'Current focus or in progress.',
  next: 'Planned for the next step.',
  done: 'Already completed.',
  later: 'Relevant, but scheduled later.',
  someday: 'A possible future idea, not committed yet.',
  hidden: 'Currently filtered or deprioritized.',
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
    linkStrokeWidth: '9',
    linkOpacity: '1',
  },
  now: {
    glow: '0 0 32px rgba(239, 68, 68, 0.75)',
    ring: '#dc2626',
    ringBand: '#ef4444',
    badge: '#ef4444',
    textColor: '#ffffff',
    glowSegment: 'rgba(239, 68, 68, 0.55)',
    linkStroke: '#dc2626',
    linkStrokeWidth: '9',
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
    linkStrokeWidth: '9',
    linkOpacity: '1',
  },
  later: {
    glow: '0 0 5px rgba(116, 132, 156, 0.06)',
    ring: 'rgba(116, 132, 156, 0.56)',
    ringBand: 'rgba(116, 132, 156, 0.56)',
    badge: '#5c697b',
    textColor: '#94a0af',
    glowSegment: 'rgba(116, 132, 156, 0.04)',
    linkStroke: '#74849c',
    linkStrokeWidth: '6',
    linkOpacity: '0.56',
    linkStrokeDasharray: 'none',
  },
  someday: {
    glow: '0 0 5px rgba(116, 132, 156, 0.05)',
    ring: 'rgba(116, 132, 156, 0.40)',
    ringBand: 'rgba(116, 132, 156, 0.40)',
    badge: '#5c697b',
    textColor: '#8d98a8',
    glowSegment: 'rgba(116, 132, 156, 0.035)',
    linkStroke: '#74849c',
    linkStrokeWidth: '5',
    linkOpacity: '0.40',
    linkStrokeDasharray: '2 10',
  },
  hidden: {
    glow: 'none',
    ring: '#1e2533',
    ringBand: '#2d3748',
    badge: '#374151',
    textColor: '#4b5563',
    glowSegment: 'transparent',
    linkStroke: '#374151',
    linkStrokeWidth: '9',
    linkOpacity: '1',
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
  farToMid: 1.0,
  midToClose: 1.5,
  closeToVeryClose: 4.0,
}

/**
 * 20 distinct colors available for scope assignment.
 * Ordered to cover the hue wheel with good visual separation.
 */
// Note: #f97316 (orange) and #14b8a6 (teal) are reserved for effort/benefit chips.
export const SCOPE_COLORS = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#d946ef', // fuchsia
  '#ec4899', // pink
  '#f43f5e', // rose
  '#ef4444', // red
  '#ea580c', // orange-600 (darker)
  '#d97706', // amber-600 (darker)
  '#ca8a04', // yellow-600
  '#65a30d', // lime-600
  '#16a34a', // green-600
  '#059669', // emerald-600
  '#0f766e', // teal-700 (darker)
  '#0891b2', // cyan-600
  '#0284c7', // sky-600
  '#2563eb', // blue-600
  '#7c3aed', // violet-600
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
  levelSpacing: 280,
  horizontalPadding: 600,
  topPadding: 600,
  bottomPadding: 600,
}

export const MINIMAL_NODE_SIZE = 48
