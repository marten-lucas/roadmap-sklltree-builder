const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

const normalizeScopeId = (value) => String(value ?? '').trim()

const normalizeScopeLabel = (value) => String(value ?? '').trim()

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

export const renderScopeLabelsMarkup = (scopeLabels) => {
  const labels = Array.isArray(scopeLabels)
    ? scopeLabels.map((label) => normalizeScopeLabel(label)).filter(Boolean)
    : []

  if (labels.length === 0) {
    return ''
  }

  return labels
    .map((label) => `<span class="skill-node-tooltip__scope">${escapeHtml(label)}</span>`)
    .join('')
}
