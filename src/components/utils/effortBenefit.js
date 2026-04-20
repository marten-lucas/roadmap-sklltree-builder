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

import { normalizeStatusKey } from '../config'

export const DEFAULT_STORY_POINT_MAP = { xs: 1, s: 3, m: 5, l: 8, xl: 13 }
export const STATUS_BUDGET_KEYS = ['done', 'now', 'next', 'later', 'someday']

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

export const createDefaultStatusBudgets = () => ({
  done: null,
  now: null,
  next: null,
  later: null,
  someday: null,
})

export const createDefaultFeatureStatuses = () => ({
  done: false,
  now: true,
  next: true,
  later: false,
  someday: false,
})

export const normalizeFeatureStatuses = (raw) => {
  const next = createDefaultFeatureStatuses()

  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const key of STATUS_BUDGET_KEYS) {
      if (raw[key] != null) {
        next[key] = Boolean(raw[key])
      }
    }
  }

  return next
}

export const normalizeStatusBudgets = (raw, legacyBudget = null) => {
  const next = createDefaultStatusBudgets()

  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const key of STATUS_BUDGET_KEYS) {
      const value = raw[key]
      if (value == null || value === '') {
        next[key] = null
        continue
      }

      const normalized = Number(value)
      next[key] = Number.isFinite(normalized) && normalized >= 0 ? normalized : null
    }
  }

  const fallbackBudget = legacyBudget == null || legacyBudget === '' ? null : Number(legacyBudget)
  if (next.now == null && Number.isFinite(fallbackBudget) && fallbackBudget >= 0) {
    next.now = fallbackBudget
  }

  return next
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
 * Returns the normalized status for a level in the given release.
 * Falls back to the legacy level.status field.
 */
const getLevelStatus = (level, releaseId) => {
  if (releaseId && level?.statuses && typeof level.statuses === 'object') {
    const releaseStatus = level.statuses[releaseId]
    if (releaseStatus !== undefined) {
      return normalizeStatusKey(releaseStatus)
    }
  }

  return normalizeStatusKey(level?.status ?? 'later')
}

const levelHasStatus = (level, statusKey, releaseId) => getLevelStatus(level, releaseId) === normalizeStatusKey(statusKey)

export const computeStatusBudgetSummaries = (allNodes, storyPointMapOrDocument, statusBudgetsOrUndefined = null, releaseId = null) => {
  let storyPointMap
  let statusBudgets

  if (
    statusBudgetsOrUndefined === null
    && storyPointMapOrDocument
    && typeof storyPointMapOrDocument === 'object'
    && ('children' in storyPointMapOrDocument || 'releases' in storyPointMapOrDocument)
  ) {
    storyPointMap = normalizeStoryPointMap(storyPointMapOrDocument?.storyPointMap)
    const activeRelease = releaseId
      ? (storyPointMapOrDocument.releases ?? []).find((release) => release?.id === releaseId) ?? null
      : null
    statusBudgets = normalizeStatusBudgets(activeRelease?.statusBudgets, activeRelease?.storyPointBudget ?? storyPointMapOrDocument?.storyPointBudget ?? null)
  } else {
    storyPointMap = normalizeStoryPointMap(storyPointMapOrDocument)
    statusBudgets = normalizeStatusBudgets(statusBudgetsOrUndefined)
  }

  const summaries = Object.fromEntries(
    STATUS_BUDGET_KEYS.map((statusKey) => [statusKey, {
      status: statusKey,
      total: 0,
      budget: statusBudgets[statusKey],
      isOverBudget: false,
      utilization: null,
    }]),
  )

  for (const node of allNodes) {
    const levels = Array.isArray(node?.levels) ? node.levels : []
    for (const level of levels) {
      const statusKey = getLevelStatus(level, releaseId)
      if (!Object.hasOwn(summaries, statusKey)) {
        continue
      }

      const pts = resolveStoryPointsFromEffort(level.effort, storyPointMap)
      if (pts != null) {
        summaries[statusKey].total += pts
      }
    }
  }

  for (const statusKey of STATUS_BUDGET_KEYS) {
    const entry = summaries[statusKey]
    entry.isOverBudget = entry.budget != null && entry.total > entry.budget
    entry.utilization = entry.budget != null
      ? entry.budget === 0
        ? (entry.total > 0 ? 100 : 0)
        : Math.round((entry.total / entry.budget) * 100)
      : null
  }

  return summaries
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
    for (const node of allNodes) {
      const levels = Array.isArray(node?.levels) ? node.levels : []
      for (const level of levels) {
        if (!levelHasStatus(level, 'now', releaseId)) continue
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
