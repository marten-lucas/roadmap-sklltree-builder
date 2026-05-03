import { STATUS_STYLES, normalizeStatusKey } from '../config'

export const STATUS_STYLE_KEYS = ['done', 'now', 'next', 'later', 'someday', 'hidden']
export const TEXT_COLOR_MODES = Object.freeze({
  auto: 'auto',
  manual: 'manual',
})

export const LINE_STYLE_PRESETS = Object.freeze({
  solid: { label: 'Solid', dasharray: 'none' },
  dashed: { label: 'Dashed', dasharray: '8 8' },
  dotted: { label: 'Dotted', dasharray: '2 8' },
  dashdot: { label: 'Dash-dot', dasharray: '10 6 2 6' },
})

const LINE_STYLE_PRESET_KEYS = Object.keys(LINE_STYLE_PRESETS)

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

const toValidHexColor = (value, fallback) => {
  if (typeof value !== 'string') {
    return fallback
  }

  const normalized = value.trim()
  if (!HEX_COLOR_PATTERN.test(normalized)) {
    return fallback
  }

  if (normalized.length === 4) {
    const [hash, r, g, b] = normalized
    return `${hash}${r}${r}${g}${g}${b}${b}`
  }

  return normalized.toLowerCase()
}

const normalizeLineStylePreset = (value, fallback = 'solid') => {
  const key = String(value ?? '').trim().toLowerCase()
  return LINE_STYLE_PRESET_KEYS.includes(key) ? key : fallback
}

const inferLineStylePresetFromDasharray = (dasharray) => {
  const normalized = String(dasharray ?? 'none').trim().toLowerCase()
  if (!normalized || normalized === 'none') {
    return 'solid'
  }

  const exactMatch = LINE_STYLE_PRESET_KEYS.find((key) => LINE_STYLE_PRESETS[key].dasharray === normalized)
  if (exactMatch) {
    return exactMatch
  }

  return normalized.includes('2') && normalized.includes('8') ? 'dotted' : 'dashed'
}

export const getAutoContrastTextColor = (hexColor) => {
  const valid = toValidHexColor(hexColor, null)
  if (!valid) {
    return '#f8fafc'
  }

  const r = Number.parseInt(valid.slice(1, 3), 16)
  const g = Number.parseInt(valid.slice(3, 5), 16)
  const b = Number.parseInt(valid.slice(5, 7), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.62 ? '#0f172a' : '#f8fafc'
}

export const normalizeStatusStyleOverrides = (value) => {
  const overrides = (value && typeof value === 'object') ? value : {}
  const normalized = {}

  STATUS_STYLE_KEYS.forEach((statusKey) => {
    const baseStyle = STATUS_STYLES[statusKey] ?? STATUS_STYLES.later
    const raw = overrides[statusKey]
    const next = (raw && typeof raw === 'object') ? raw : {}

    const ringColor = toValidHexColor(next.ringColor, baseStyle.ringBand ?? baseStyle.ring)
    const lineColor = toValidHexColor(next.lineColor, baseStyle.linkStroke)
    const lineStyle = normalizeLineStylePreset(next.lineStyle, inferLineStylePresetFromDasharray(baseStyle.linkStrokeDasharray))
    const textColorMode = next.textColorMode === TEXT_COLOR_MODES.manual
      ? TEXT_COLOR_MODES.manual
      : TEXT_COLOR_MODES.auto
    const textColor = toValidHexColor(next.textColor, getAutoContrastTextColor(ringColor))

    normalized[statusKey] = {
      ringColor,
      lineColor,
      lineStyle,
      textColorMode,
      textColor,
    }
  })

  return normalized
}

export const resolveStatusStyles = (statusStylesOverride) => {
  const normalizedOverrides = normalizeStatusStyleOverrides(statusStylesOverride)
  const resolved = {}

  STATUS_STYLE_KEYS.forEach((statusKey) => {
    const baseStyle = STATUS_STYLES[statusKey] ?? STATUS_STYLES.later
    const override = normalizedOverrides[statusKey]
    const textColor = override.textColorMode === TEXT_COLOR_MODES.manual
      ? override.textColor
      : getAutoContrastTextColor(override.ringColor)

    resolved[statusKey] = {
      ...baseStyle,
      ring: override.ringColor,
      ringBand: override.ringColor,
      badge: override.ringColor,
      textColor,
      linkStroke: override.lineColor,
      linkStrokeDasharray: LINE_STYLE_PRESETS[override.lineStyle].dasharray,
    }
  })

  return resolved
}

export const getStatusStyle = (statusStyles, statusKey) => {
  const normalizedKey = normalizeStatusKey(statusKey)
  const source = statusStyles && typeof statusStyles === 'object' ? statusStyles : STATUS_STYLES
  return source[normalizedKey] ?? source.later ?? STATUS_STYLES.later
}
