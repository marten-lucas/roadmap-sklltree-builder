const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

const normalizeScopeId = (value) => String(value ?? '').trim()

const normalizeScopeLabel = (value) => String(value ?? '').trim()

const sanitizeScopeColor = (color) => {
  if (!color || typeof color !== 'string') return null
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : null
}

const getScopeGroupLabel = (scope) => {
  const explicitGroupLabel = String(scope?.groupLabel ?? '').trim()
  if (explicitGroupLabel) {
    return explicitGroupLabel
  }

  const color = sanitizeScopeColor(scope?.color)
  return color ? color.toUpperCase() : 'Uncolored'
}

export const buildGroupedScopeSelectData = (scopes) => {
  const groups = []
  const groupByLabel = new Map()

  for (const scope of Array.isArray(scopes) ? scopes : []) {
    const value = normalizeScopeId(scope?.value ?? scope?.id)
    const label = normalizeScopeLabel(scope?.label)
    if (!value || !label) {
      continue
    }

    const group = getScopeGroupLabel(scope)
    if (!groupByLabel.has(group)) {
      const nextGroup = { group, items: [] }
      groupByLabel.set(group, nextGroup)
      groups.push(nextGroup)
    }

    groupByLabel.get(group).items.push({
      value,
      label,
      color: sanitizeScopeColor(scope?.color),
    })
  }

  return groups
}

export const resolveScopeLabels = (scopeIds, scopes) => {
  const scopeLabelById = new Map()

  for (const scope of Array.isArray(scopes) ? scopes : []) {
    const scopeId = normalizeScopeId(scope?.id ?? scope?.value)
    const scopeLabel = normalizeScopeLabel(scope?.label)

    if (!scopeId || !scopeLabel || scopeLabelById.has(scopeId)) {
      continue
    }

    scopeLabelById.set(scopeId, scopeLabel)
  }

  const resolvedLabels = []
  const seenLabels = new Set()

  for (const scopeId of Array.isArray(scopeIds) ? scopeIds : []) {
    const normalizedScopeId = normalizeScopeId(scopeId)
    if (!normalizedScopeId) {
      continue
    }

    const scopeLabel = scopeLabelById.get(normalizedScopeId)
    if (!scopeLabel || seenLabels.has(scopeLabel)) {
      continue
    }

    seenLabels.add(scopeLabel)
    resolvedLabels.push(scopeLabel)
  }

  return resolvedLabels
}

/**
 * Like resolveScopeLabels but returns `{ label, color }` objects.
 * The `color` field is `null` when no color is assigned to the scope.
 */
export const resolveScopeEntries = (scopeIds, scopes) => {
  const scopeById = new Map()

  for (const scope of Array.isArray(scopes) ? scopes : []) {
    const id = normalizeScopeId(scope?.id ?? scope?.value)
    const label = normalizeScopeLabel(scope?.label)

    if (!id || !label || scopeById.has(id)) {
      continue
    }

    scopeById.set(id, { label, color: sanitizeScopeColor(scope?.color) })
  }

  const entries = []
  const seenLabels = new Set()

  for (const scopeId of Array.isArray(scopeIds) ? scopeIds : []) {
    const id = normalizeScopeId(scopeId)
    if (!id) continue

    const entry = scopeById.get(id)
    if (!entry || seenLabels.has(entry.label)) continue

    seenLabels.add(entry.label)
    entries.push(entry)
  }

  return entries
}

/**
 * Renders scope labels/entries as HTML badge spans.
 * Accepts either `string[]` (labels only) or `{ label, color }[]` (entries).
 * When an entry has a color, it is applied as an inline background style.
 */
export const renderScopeLabelsMarkup = (scopeLabelsOrEntries) => {
  const items = Array.isArray(scopeLabelsOrEntries) ? scopeLabelsOrEntries : []

  if (items.length === 0) {
    return ''
  }

  return items
    .map((item) => {
      const label = typeof item === 'string' ? item : item?.label
      const color = typeof item === 'object' && item !== null ? sanitizeScopeColor(item?.color) : null
      const normalizedLabel = normalizeScopeLabel(label)
      if (!normalizedLabel) return ''

      const style = color
        ? ` style="border-color:${color};color:${color}"`
        : ''
      return `<span class="skill-node-tooltip__scope"${style}>${escapeHtml(normalizedLabel)}</span>`
    })
    .filter(Boolean)
    .join('')
}
