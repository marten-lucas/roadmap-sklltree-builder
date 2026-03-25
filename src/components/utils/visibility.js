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

export const nodeMatchesScopeFilter = (node, scopeId) => {
  const levels = Array.isArray(node?.levels) ? node.levels : []

  if (!scopeId || scopeId === SCOPE_FILTER_ALL) {
    return true
  }

  const hasAnyScopeAssignments = levels.some((level) => Array.isArray(level?.scopeIds) && level.scopeIds.length > 0)

  if (!hasAnyScopeAssignments) {
    return true
  }

  return levels.some((level) => Array.isArray(level?.scopeIds) && level.scopeIds.includes(scopeId))
}
