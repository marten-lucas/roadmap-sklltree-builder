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
 * Resolves the story point value for a node's effort.
 * Returns null for 'unclear' or invalid values.
 */
export const resolveStoryPoints = (node, storyPointMap) => {
  const effort = node?.effort
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
 * Computes total story points and budget status from all nodes in a document.
 */
export const computeBudgetSummary = (allNodes, document) => {
  const storyPointMap = normalizeStoryPointMap(document?.storyPointMap)
  const budget = document?.storyPointBudget != null ? Number(document.storyPointBudget) : null
  let total = 0

  for (const node of allNodes) {
    const pts = resolveStoryPoints(node, storyPointMap)
    if (pts != null) total += pts
  }

  return {
    total,
    budget,
    isOverBudget: budget != null && total > budget,
  }
}
