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
    glowSegment: 'rgba(239, 68, 68, 0.85)',
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

export const TREE_CONFIG = {
  minAngleSpread: 140,
  maxAngleSpread: 270,
  nodeSize: 120,
  minArcGapFactor: 1.08,
  levelSpacing: 180,
  horizontalPadding: 260,
  topPadding: 260,
  bottomPadding: 320,
}
