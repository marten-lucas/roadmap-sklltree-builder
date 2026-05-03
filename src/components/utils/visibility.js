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

export const STATUS_FILTER_ORDER = ['done', 'now', 'next', 'later', 'someday']

const STATUS_FILTER_SET = new Set(STATUS_FILTER_ORDER)

export const STATUS_VISIBILITY_MODES = {
  visible: 'visible',
  minimized: 'minimized',
  hidden: 'hidden',
}

const STATUS_VISIBILITY_MODE_SET = new Set(Object.values(STATUS_VISIBILITY_MODES))

const normalizeStatusVisibilityMode = (mode) => {
  const normalized = String(mode ?? '').trim().toLowerCase()
  return STATUS_VISIBILITY_MODE_SET.has(normalized)
    ? normalized
    : STATUS_VISIBILITY_MODES.visible
}

export const buildDefaultStatusFilterModeMap = () => (
  Object.fromEntries(STATUS_FILTER_ORDER.map((statusKey) => [statusKey, STATUS_VISIBILITY_MODES.visible]))
)

export const normalizeStatusFilterModeMap = (statusFilter) => {
  const fallback = buildDefaultStatusFilterModeMap()

  if (statusFilter && typeof statusFilter === 'object' && !Array.isArray(statusFilter)) {
    const next = { ...fallback }
    for (const statusKey of STATUS_FILTER_ORDER) {
      if (Object.hasOwn(statusFilter, statusKey)) {
        next[statusKey] = normalizeStatusVisibilityMode(statusFilter[statusKey])
      }
    }
    return next
  }

  const selectedStatusKeys = normalizeStatusFilterKeys(statusFilter)
  if (selectedStatusKeys.length === 0) {
    return fallback
  }

  const selectedCutoff = Math.max(
    ...selectedStatusKeys
      .map((statusKey) => STATUS_FILTER_ORDER.indexOf(statusKey))
      .filter((index) => index >= 0),
  )

  if (!Number.isFinite(selectedCutoff)) {
    return fallback
  }

  const next = { ...fallback }
  for (const statusKey of STATUS_FILTER_ORDER) {
    const statusIndex = STATUS_FILTER_ORDER.indexOf(statusKey)
    next[statusKey] = statusIndex <= selectedCutoff
      ? STATUS_VISIBILITY_MODES.visible
      : STATUS_VISIBILITY_MODES.minimized
  }

  return next
}

export const hasActiveStatusFilterModes = (statusModeByKey) => {
  const normalized = normalizeStatusFilterModeMap(statusModeByKey)
  return STATUS_FILTER_ORDER.some((statusKey) => normalized[statusKey] !== STATUS_VISIBILITY_MODES.visible)
}

export const normalizeStatusFilterKeys = (statusFilter) => {
  if (statusFilter && typeof statusFilter === 'object' && !Array.isArray(statusFilter)) {
    const normalizedStatusModeByKey = normalizeStatusFilterModeMap(statusFilter)
    if (!hasActiveStatusFilterModes(normalizedStatusModeByKey)) {
      return []
    }

    return STATUS_FILTER_ORDER.filter(
      (statusKey) => normalizedStatusModeByKey[statusKey] === STATUS_VISIBILITY_MODES.visible,
    )
  }

  if (Array.isArray(statusFilter)) {
    return STATUS_FILTER_ORDER.filter((statusKey) => statusFilter.includes(statusKey))
  }

  const normalized = String(statusFilter ?? '').trim().toLowerCase()
  if (!normalized || normalized === RELEASE_FILTER_OPTIONS.all) {
    return []
  }

  if (normalized === RELEASE_FILTER_OPTIONS.now) {
    return ['now']
  }

  if (normalized === RELEASE_FILTER_OPTIONS.next) {
    return ['next']
  }

  if (STATUS_FILTER_SET.has(normalized)) {
    return [normalized]
  }

  return []
}

export const getReleaseVisibilityModeForStatuses = (statusKeys, releaseFilter) => {
  const normalizedStatusSet = new Set(
    (Array.isArray(statusKeys) ? statusKeys : [statusKeys])
      .map((statusKey) => String(statusKey ?? '').trim().toLowerCase())
      .filter(Boolean),
  )

  if (normalizedStatusSet.size === 0) {
    return 'full'
  }

  const statusModeByKey = normalizeStatusFilterModeMap(releaseFilter)

  let hasVisibleStatus = false
  let hasMinimizedStatus = false

  for (const statusKey of normalizedStatusSet) {
    const visibilityMode = statusModeByKey[statusKey] ?? STATUS_VISIBILITY_MODES.visible

    if (visibilityMode === STATUS_VISIBILITY_MODES.visible) {
      hasVisibleStatus = true
      break
    }

    if (visibilityMode === STATUS_VISIBILITY_MODES.minimized) {
      hasMinimizedStatus = true
    }
  }

  if (hasVisibleStatus) {
    return 'full'
  }

  if (hasMinimizedStatus) {
    return 'minimal'
  }

  // Unknown statuses default to visible behavior so legacy/custom values do not vanish.
  const hasUnknownStatus = [...normalizedStatusSet].some((statusKey) => !STATUS_FILTER_SET.has(statusKey))
  if (hasUnknownStatus) {
    return 'full'
  }

  return 'hidden'
}

export const getReleaseVisibilityMode = (statusKey, releaseFilter) => {
  return getReleaseVisibilityModeForStatuses([statusKey], releaseFilter)
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
