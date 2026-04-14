export const EFFORT_SIZES = ['unclear', 'xs', 's', 'm', 'l', 'xl', 'custom']
export const BENEFIT_SIZES = ['unclear', 'xs', 's', 'm', 'l', 'xl']

export const EFFORT_SIZE_LABELS = {
  unclear: 'Unclear',
  xs: 'XS',
  s: 'S',
  m: 'M',
  l: 'L',
  xl: 'XL',
  custom: 'Custom',
}

export const BENEFIT_SIZE_LABELS = {
  unclear: 'Unclear',
  xs: 'XS',
  s: 'S',
  m: 'M',
  l: 'L',
  xl: 'XL',
}

export const DEFAULT_STORY_POINT_MAP = { xs: 1, s: 3, m: 5, l: 8, xl: 13 }

export const createDefaultEffort = () => ({ size: 'unclear', customPoints: null })
export const createDefaultBenefit = () => ({ size: 'unclear' })

export const normalizeEffort = (raw) => {
  if (!raw || typeof raw !== 'object') return createDefaultEffort()
  const size = EFFORT_SIZES.includes(raw.size) ? raw.size : 'unclear'
  const rawCustom = raw.customPoints != null ? Number(raw.customPoints) : null
  const customPoints = size === 'custom' && Number.isFinite(rawCustom) && rawCustom >= 0 ? rawCustom : null
  return { size, customPoints }
}

export const normalizeBenefit = (raw) => {
  if (!raw || typeof raw !== 'object') return createDefaultBenefit()
  const size = BENEFIT_SIZES.includes(raw.size) ? raw.size : 'unclear'
  return { size }
}

export const normalizeStoryPointMap = (raw) => {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_STORY_POINT_MAP }
  const result = {}
  for (const key of ['xs', 's', 'm', 'l', 'xl']) {
    const val = Number(raw[key])
    result[key] = Number.isFinite(val) && val >= 0 ? val : DEFAULT_STORY_POINT_MAP[key]
  }
  return result
}

/**
 * Returns the effort of the "display level" (first level with a set effort),
 * with fallback to the node-root effort for backward compatibility.
 */
export const getNodeDisplayEffort = (node) => {
  const levels = Array.isArray(node?.levels) ? node.levels : []
  const withEffort = levels.find((l) => l.effort?.size && l.effort.size !== 'unclear')
  return withEffort?.effort ?? node?.effort ?? createDefaultEffort()
}

export const getNodeDisplayBenefit = (node) => {
  const levels = Array.isArray(node?.levels) ? node.levels : []
  const withBenefit = levels.find((l) => l.benefit?.size && l.benefit.size !== 'unclear')
  return withBenefit?.benefit ?? node?.benefit ?? createDefaultBenefit()
}

/**
 * Resolves the story point value for a node's effort.
 * Returns null for 'unclear' or invalid values.
 */
export const resolveStoryPoints = (node, storyPointMap) => {
  const effort = getNodeDisplayEffort(node)
  if (!effort || effort.size === 'unclear') return null
  if (effort.size === 'custom') {
    if (effort.customPoints == null) return null
    const pts = Number(effort.customPoints)
    return Number.isFinite(pts) && pts >= 0 ? pts : null
  }
  const map = normalizeStoryPointMap(storyPointMap)
  const val = map[effort.size]
  return val != null ? val : null
}

/**
 * Resolves story points directly from an effort object (without a full node).
 */
const resolveStoryPointsFromEffort = (effort, storyPointMap) => {
  if (!effort || effort.size === 'unclear') return null
  if (effort.size === 'custom') {
    if (effort.customPoints == null) return null
    const pts = Number(effort.customPoints)
    return Number.isFinite(pts) && pts >= 0 ? pts : null
  }
  const map = normalizeStoryPointMap(storyPointMap)
  const val = map[effort.size]
  return val != null ? val : null
}

/**
 * Returns true when a level has 'now' status for the given release.
 * Falls back to the legacy level.status field.
 */
const levelIsNow = (level, releaseId) => {
  if (releaseId && level?.statuses && typeof level.statuses === 'object') {
    const s = level.statuses[releaseId]
    if (s !== undefined) return s === 'now'
  }
  return (level?.status ?? 'later') === 'now'
}

/**
 * Computes total story points and budget status.
 * Accepts storyPointMap and budget (number|null) directly instead of a full document.
 * When releaseId is provided, only sums story points for levels with status 'now'
 * in that release (across all nodes).
 */
export const computeBudgetSummary = (allNodes, storyPointMapOrDocument, budgetOrUndefined, releaseId = null) => {
  // Support both old call: computeBudgetSummary(nodes, document)
  // and new call: computeBudgetSummary(nodes, storyPointMap, budget[, releaseId])
  let storyPointMap, budget
  if (budgetOrUndefined === undefined && storyPointMapOrDocument && typeof storyPointMapOrDocument === 'object' && ('children' in storyPointMapOrDocument || 'storyPointBudget' in storyPointMapOrDocument || 'releases' in storyPointMapOrDocument)) {
    // Legacy: second arg is the full document
    storyPointMap = normalizeStoryPointMap(storyPointMapOrDocument?.storyPointMap)
    budget = storyPointMapOrDocument?.storyPointBudget != null ? Number(storyPointMapOrDocument.storyPointBudget) : null
  } else {
    storyPointMap = normalizeStoryPointMap(storyPointMapOrDocument)
    budget = budgetOrUndefined != null ? Number(budgetOrUndefined) : null
  }

  let total = 0

  if (releaseId) {
    // Only count levels with status 'now' for this release
    for (const node of allNodes) {
      const levels = Array.isArray(node?.levels) ? node.levels : []
      for (const level of levels) {
        if (!levelIsNow(level, releaseId)) continue
        const pts = resolveStoryPointsFromEffort(level.effort, storyPointMap)
        if (pts != null) total += pts
      }
    }
  } else {
    for (const node of allNodes) {
      const pts = resolveStoryPoints(node, storyPointMap)
      if (pts != null) total += pts
    }
  }

  return {
    total,
    budget,
    isOverBudget: budget != null && total > budget,
  }
}
