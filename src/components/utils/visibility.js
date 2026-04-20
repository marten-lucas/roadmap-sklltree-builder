export const SCOPE_FILTER_ALL = '__all__'

export const normalizeScopeFilterIds = (scopeFilter) => {
  if (Array.isArray(scopeFilter)) {
    return Array.from(new Set(scopeFilter.filter((scopeId) => typeof scopeId === 'string' && scopeId && scopeId !== SCOPE_FILTER_ALL && scopeId !== 'all')))
  }

  if (typeof scopeFilter === 'string' && scopeFilter && scopeFilter !== SCOPE_FILTER_ALL && scopeFilter !== 'all') {
    return [scopeFilter]
  }

  return []
}

export const isAllScopeFilter = (scopeFilter) => normalizeScopeFilterIds(scopeFilter).length === 0

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

const getSelectedScopeGroups = (selectedScopeIds, scopeOptions = []) => {
  const options = Array.isArray(scopeOptions) ? scopeOptions : []
  const groupScopeIdsByKey = new Map()

  options.forEach((scope) => {
    const scopeId = getScopeOptionId(scope)
    const groupKey = getScopeGroupKey(scope)

    if (!scopeId || !groupKey) {
      return
    }

    const existingGroupScopeIds = groupScopeIdsByKey.get(groupKey) ?? new Set()
    existingGroupScopeIds.add(scopeId)
    groupScopeIdsByKey.set(groupKey, existingGroupScopeIds)
  })

  const selectedGroups = new Map()

  selectedScopeIds.forEach((selectedScopeId) => {
    const selectedScope = options.find((scope) => getScopeOptionId(scope) === selectedScopeId)
    const groupKey = getScopeGroupKey(selectedScope ?? { id: selectedScopeId }) ?? `scope:${selectedScopeId}`
    const existingGroup = selectedGroups.get(groupKey) ?? {
      selectedIds: new Set(),
      groupScopeIds: new Set(groupScopeIdsByKey.get(groupKey) ?? [selectedScopeId]),
    }

    existingGroup.selectedIds.add(selectedScopeId)
    existingGroup.groupScopeIds.add(selectedScopeId)
    selectedGroups.set(groupKey, existingGroup)
  })

  return selectedGroups
}

export const scopeIdsMatchFilter = (scopeIds, scopeFilter, scopeOptions = []) => {
  const selectedScopeIds = normalizeScopeFilterIds(scopeFilter)

  if (selectedScopeIds.length === 0) {
    return true
  }

  const assignedScopeIds = Array.isArray(scopeIds) ? scopeIds.filter(Boolean) : []
  const selectedGroups = getSelectedScopeGroups(selectedScopeIds, scopeOptions)

  return [...selectedGroups.values()].every(({ selectedIds, groupScopeIds }) => {
    const hasAssignmentInSelectedGroup = assignedScopeIds.some((assignedId) => groupScopeIds.has(assignedId))

    if (!hasAssignmentInSelectedGroup) {
      return true
    }

    return assignedScopeIds.some((assignedId) => selectedIds.has(assignedId))
  })
}

export const nodeMatchesScopeFilter = (node, scopeFilter, scopeOptions = []) => {
  const levels = Array.isArray(node?.levels) ? node.levels : []

  if (isAllScopeFilter(scopeFilter) || levels.length === 0) {
    return true
  }

  return levels.some((level) => scopeIdsMatchFilter(level?.scopeIds ?? [], scopeFilter, scopeOptions))
}
