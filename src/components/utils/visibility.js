export const SCOPE_FILTER_ALL = '__all__'

export const RELEASE_FILTER_OPTIONS = {
  all: 'all',
  now: 'now',
  next: 'next',
}

export const RELEASE_FILTER_LABELS = {
  all: 'All',
  now: 'Now',
  next: 'Next',
}

export const getReleaseVisibilityMode = (statusKey, releaseFilter) => {
  if (releaseFilter === RELEASE_FILTER_OPTIONS.now) {
    if (statusKey === 'now') {
      return 'full'
    }

    return 'minimal'
  }

  if (releaseFilter === RELEASE_FILTER_OPTIONS.next) {
    if (statusKey === 'now' || statusKey === 'next') {
      return 'full'
    }

    return 'minimal'
  }

  return 'full'
}

const getScopeOptionId = (scope) => {
  if (!scope || typeof scope !== 'object') {
    return null
  }

  if (typeof scope.id === 'string' && scope.id) {
    return scope.id
  }

  if (typeof scope.value === 'string' && scope.value) {
    return scope.value
  }

  return null
}

const getScopeGroupKey = (scope) => {
  const scopeId = getScopeOptionId(scope)
  if (!scopeId) {
    return null
  }

  const color = typeof scope?.color === 'string' ? scope.color.trim().toLowerCase() : ''
  return color ? `color:${color}` : `scope:${scopeId}`
}

const getSelectedGroupScopeIds = (selectedScopeId, scopeOptions = []) => {
  if (!selectedScopeId || selectedScopeId === SCOPE_FILTER_ALL || selectedScopeId === 'all') {
    return new Set()
  }

  const options = Array.isArray(scopeOptions) ? scopeOptions : []
  const selectedScope = options.find((scope) => getScopeOptionId(scope) === selectedScopeId)
  const groupKey = getScopeGroupKey(selectedScope ?? { id: selectedScopeId })
  const groupScopeIds = new Set([selectedScopeId])

  if (!groupKey) {
    return groupScopeIds
  }

  options.forEach((scope) => {
    const scopeId = getScopeOptionId(scope)
    if (scopeId && getScopeGroupKey(scope) === groupKey) {
      groupScopeIds.add(scopeId)
    }
  })

  return groupScopeIds
}

export const scopeIdsMatchFilter = (scopeIds, scopeId, scopeOptions = []) => {
  if (!scopeId || scopeId === SCOPE_FILTER_ALL || scopeId === 'all') {
    return true
  }

  const assignedScopeIds = Array.isArray(scopeIds) ? scopeIds.filter(Boolean) : []
  const selectedGroupScopeIds = getSelectedGroupScopeIds(scopeId, scopeOptions)
  const hasAssignmentInSelectedGroup = assignedScopeIds.some((assignedId) => selectedGroupScopeIds.has(assignedId))

  if (!hasAssignmentInSelectedGroup) {
    return true
  }

  return assignedScopeIds.includes(scopeId)
}

export const nodeMatchesScopeFilter = (node, scopeId, scopeOptions = []) => {
  const levels = Array.isArray(node?.levels) ? node.levels : []

  if (!scopeId || scopeId === SCOPE_FILTER_ALL || scopeId === 'all') {
    return true
  }

  if (levels.length === 0) {
    return true
  }

  return levels.some((level) => scopeIdsMatchFilter(level?.scopeIds ?? [], scopeId, scopeOptions))
}
