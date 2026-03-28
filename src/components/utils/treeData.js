import { normalizeStatusKey } from '../config'
import { generateUUID } from './uuid'

const DEFAULT_NODE_LABEL = 'Neuer Skill'
const DEFAULT_NODE_STATUS = 'later'
const E2E_TRACE_ENABLED_KEY = 'roadmap-skilltree.e2e.traceEnabled'
const E2E_MODEL_TRACE_KEY = 'roadmap-skilltree.e2e.modelTrace'
const E2E_MODEL_TRACE_LAST_KEY = 'roadmap-skilltree.e2e.modelTraceLast'
const MAX_MODEL_TRACE_ENTRIES = 200
const MAX_MODEL_TRACE_BYTES = 256 * 1024

const isModelTraceEnabled = () => {
  if (typeof window === 'undefined' || !window?.localStorage) {
    return false
  }

  try {
    return window.localStorage.getItem(E2E_TRACE_ENABLED_KEY) === '1'
  } catch {
    return false
  }
}

const toNodeLevel = (levelLike, fallbackLabel = 'Level 1') => ({
  id: levelLike?.id ?? generateUUID(),
  label: levelLike?.label ?? fallbackLabel,
  status: normalizeStatusKey(levelLike?.status ?? DEFAULT_NODE_STATUS),
  releaseNote: levelLike?.releaseNote ?? '',
  scopeIds: uniqueStringArray(levelLike?.scopeIds),
})

const shortNameFromLabel = (label) => {
  const text = String(label ?? '').trim()
  const words = text.split(/\s+/).filter(Boolean)

  if (words.length > 1) {
    return words.slice(0, 3).map((word) => word[0]).join('').toUpperCase().padEnd(3, 'X').slice(0, 3)
  }

  const compact = text.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  if (compact.length >= 3) {
    return compact.slice(0, 3)
  }

  return compact.padEnd(3, 'X').slice(0, 3) || 'NEW'
}

const sanitizeShortName = (value, fallbackLabel = DEFAULT_NODE_LABEL) => {
  const compact = String(value ?? '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()

  if (compact.length > 0) {
    return compact
  }

  return shortNameFromLabel(fallbackLabel)
}

const uniqueStringArray = (value) => {
  if (!Array.isArray(value)) {
    return []
  }

  const seen = new Set()
  const result = []

  for (const entry of value) {
    if (typeof entry !== 'string' || entry.length === 0 || seen.has(entry)) {
      continue
    }

    seen.add(entry)
    result.push(entry)
  }

  return result
}

const normalizeScopeNameKey = (value) => String(value ?? '').trim().toLocaleLowerCase()

const normalizeScopeEntries = (value) => {
  if (!Array.isArray(value)) {
    return []
  }

  const usedIds = new Set()
  const usedNameKeys = new Set()
  const scopes = []

  for (const entry of value) {
    const id = typeof entry?.id === 'string' ? entry.id : ''
    const rawLabel = typeof entry?.label === 'string' ? entry.label : ''
    const label = String(rawLabel).trim()
    const labelKey = normalizeScopeNameKey(label)

    if (id.length === 0 || labelKey.length === 0 || usedIds.has(id) || usedNameKeys.has(labelKey)) {
      continue
    }

    usedIds.add(id)
    usedNameKeys.add(labelKey)
    scopes.push({ id, label })
  }

  return scopes
}

const normalizeScopeAssignments = (tree) => {
  if (!tree || typeof tree !== 'object') {
    return tree
  }

  const scopes = normalizeScopeEntries(tree.scopes)
  const allowedScopeIds = new Set(scopes.map((scope) => scope.id))

  const sanitizeLevelScopeIds = (level) => uniqueStringArray(level?.scopeIds)
    .filter((scopeId) => allowedScopeIds.has(scopeId))

  const sanitizeNode = (node) => {
    const normalizedLevels = Array.isArray(node.levels)
      ? node.levels.map((entry) => ({
          ...entry,
          scopeIds: sanitizeLevelScopeIds(entry),
        }))
      : node.levels

    return {
      ...node,
      levels: normalizedLevels,
      children: (node.children ?? []).map(sanitizeNode),
    }
  }

  const canonical = {
    ...tree,
    scopes,
    children: (tree.children ?? []).map(sanitizeNode),
  }

  try {
    const collect = (node, out = []) => {
      const firstLevel = Array.isArray(node.levels) && node.levels[0] ? node.levels[0].scopeIds ?? [] : []
      out.push({ nodeId: node.id, scopeIds: Array.from(firstLevel) })
      for (const child of node.children ?? []) collect(child, out)
      return out
    }

    const snapshot = (canonical.children ?? []).flatMap((c) => collect(c, []))
    appendModelTrace({ ts: Date.now(), fn: 'normalizeScopeAssignments', snapshot })
  } catch (e) {
    // ignore tracing errors
  }

  return canonical
}

const appendModelTrace = (entry) => {
  try {
    if (!isModelTraceEnabled()) {
      return
    }

    if (typeof window === 'undefined' || !window?.localStorage) return
    const raw = window.localStorage.getItem(E2E_MODEL_TRACE_KEY) || '[]'
    const arr = JSON.parse(raw)
    arr.push(entry)
    // Keep trace bounded by both entries and serialized byte size.
    if (arr.length > MAX_MODEL_TRACE_ENTRIES) {
      arr.splice(0, arr.length - MAX_MODEL_TRACE_ENTRIES)
    }

    let serialized = JSON.stringify(arr)
    while (serialized.length > MAX_MODEL_TRACE_BYTES && arr.length > 1) {
      arr.shift()
      serialized = JSON.stringify(arr)
    }

    window.localStorage.setItem(E2E_MODEL_TRACE_KEY, serialized)
    // also persist the latest entry under a dedicated key so E2E helpers
    // can quickly fetch the most recent model change and to reduce the
    // chance of empty/partial modelTrace reads
    try {
      window.localStorage.setItem(E2E_MODEL_TRACE_LAST_KEY, JSON.stringify(entry))
    } catch (e) {
      // ignore secondary write failures
    }
  } catch (e) {
    // ignore
  }
}

const validateScopeLabel = (treeData, label, excludedScopeId = null) => {
  const nextLabel = String(label ?? '')
  const key = normalizeScopeNameKey(nextLabel)

  if (key.length === 0) {
    return {
      ok: false,
      error: 'Scope-Name darf nicht leer sein.',
    }
  }

  const duplicate = (treeData.scopes ?? []).find((scope) => {
    if (scope.id === excludedScopeId) {
      return false
    }

    return normalizeScopeNameKey(scope.label) === key
  })

  if (duplicate) {
    return {
      ok: false,
      error: 'Scope-Name existiert bereits.',
    }
  }

  return {
    ok: true,
    label: nextLabel,
  }
}

const collectNodeIds = (tree) => {
  const ids = new Set()
  const queue = [...(tree?.children ?? [])]

  while (queue.length > 0) {
    const current = queue.shift()
    ids.add(current.id)
    queue.push(...(current.children ?? []))
  }

  return ids
}

const buildParentByNodeId = (tree) => {
  const parentByNodeId = new Map()
  const queue = [...(tree?.children ?? []).map((child) => ({ node: child, parentId: null }))]

  while (queue.length > 0) {
    const current = queue.shift()
    parentByNodeId.set(current.node.id, current.parentId)

    for (const child of current.node.children ?? []) {
      queue.push({ node: child, parentId: current.node.id })
    }
  }

  return parentByNodeId
}

const buildDescendantsByNodeId = (tree) => {
  const descendantsByNodeId = new Map()

  const visit = (node) => {
    const descendants = new Set()

    for (const child of node.children ?? []) {
      descendants.add(child.id)
      const childDescendants = visit(child)
      childDescendants.forEach((id) => descendants.add(id))
    }

    descendantsByNodeId.set(node.id, descendants)
    return descendants
  }

  for (const root of tree?.children ?? []) {
    visit(root)
  }

  return descendantsByNodeId
}

const buildAncestorsByNodeId = (parentByNodeId) => {
  const ancestorsByNodeId = new Map()

  const getAncestors = (nodeId) => {
    if (ancestorsByNodeId.has(nodeId)) {
      return ancestorsByNodeId.get(nodeId)
    }

    const ancestors = new Set()
    let currentId = parentByNodeId.get(nodeId) ?? null

    while (currentId) {
      ancestors.add(currentId)
      currentId = parentByNodeId.get(currentId) ?? null
    }

    ancestorsByNodeId.set(nodeId, ancestors)
    return ancestors
  }

  for (const nodeId of parentByNodeId.keys()) {
    getAncestors(nodeId)
  }

  return ancestorsByNodeId
}

const buildAdditionalDependencyGraphByNodeId = (tree) => {
  const nodeIds = collectNodeIds(tree)
  const outgoingByNodeId = new Map([...nodeIds].map((id) => [id, []]))
  const queue = [...(tree?.children ?? [])]

  while (queue.length > 0) {
    const current = queue.shift()
    const outgoingIds = uniqueStringArray(current.additionalDependencyIds).filter((targetId) => nodeIds.has(targetId))
    outgoingByNodeId.set(current.id, outgoingIds)
    queue.push(...(current.children ?? []))
  }

  return outgoingByNodeId
}

const hasReachableAdditionalDependencyPath = (outgoingByNodeId, startId, targetId) => {
  if (!startId || !targetId) {
    return false
  }

  const queue = [startId]
  const visited = new Set([startId])

  while (queue.length > 0) {
    const currentId = queue.shift()
    if (currentId === targetId) {
      return true
    }

    for (const nextId of outgoingByNodeId.get(currentId) ?? []) {
      if (visited.has(nextId)) {
        continue
      }

      visited.add(nextId)
      queue.push(nextId)
    }
  }

  return false
}

export const wouldCreateAdditionalDependencyCycle = (tree, sourceNodeId, targetNodeId) => {
  if (!tree || !sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId) {
    return false
  }

  const outgoingByNodeId = buildAdditionalDependencyGraphByNodeId(tree)
  if (!outgoingByNodeId.has(sourceNodeId) || !outgoingByNodeId.has(targetNodeId)) {
    return false
  }

  return hasReachableAdditionalDependencyPath(outgoingByNodeId, targetNodeId, sourceNodeId)
}

export const findAdditionalDependencyCycles = (tree) => {
  const outgoingByNodeId = buildAdditionalDependencyGraphByNodeId(tree)
  const stateByNodeId = new Map()
  const activePath = []
  const cycles = []
  const cycleKeys = new Set()

  const visit = (nodeId) => {
    stateByNodeId.set(nodeId, 'visiting')
    activePath.push(nodeId)

    for (const nextId of outgoingByNodeId.get(nodeId) ?? []) {
      const nextState = stateByNodeId.get(nextId)

      if (nextState === 'visiting') {
        const cycleStartIndex = activePath.indexOf(nextId)
        const cycle = cycleStartIndex >= 0
          ? [...activePath.slice(cycleStartIndex), nextId]
          : [...activePath, nextId]
        const cycleKey = cycle.join('>')

        if (!cycleKeys.has(cycleKey)) {
          cycleKeys.add(cycleKey)
          cycles.push(cycle)
        }
        continue
      }

      if (nextState !== 'visited') {
        visit(nextId)
      }
    }

    activePath.pop()
    stateByNodeId.set(nodeId, 'visited')
  }

  for (const nodeId of outgoingByNodeId.keys()) {
    if (stateByNodeId.get(nodeId) !== 'visited') {
      visit(nodeId)
    }
  }

  return cycles
}

const normalizeAdditionalDependencies = (tree) => {
  if (!tree) {
    return tree
  }

  const nodeIds = collectNodeIds(tree)
  const parentByNodeId = buildParentByNodeId(tree)
  const descendantsByNodeId = buildDescendantsByNodeId(tree)
  const ancestorsByNodeId = buildAncestorsByNodeId(parentByNodeId)
  const outgoingByNodeId = buildAdditionalDependencyGraphByNodeId(tree)
  const incomingByTargetId = new Map([...nodeIds].map((id) => [id, []]))

  const normalizeNode = (node) => {
    const ownId = node.id
    const descendants = descendantsByNodeId.get(ownId) ?? new Set()
    const ancestors = ancestorsByNodeId.get(ownId) ?? new Set()
    const parentId = parentByNodeId.get(ownId) ?? null
    const siblingIds = new Set()

    if (parentId) {
      const parentNode = findNodeById(tree, parentId)
      for (const sibling of parentNode?.children ?? []) {
        if (sibling.id !== ownId) {
          siblingIds.add(sibling.id)
        }
      }
    }

    const normalizedOutgoing = uniqueStringArray(node.additionalDependencyIds).filter((targetId) => {
      if (!nodeIds.has(targetId) || targetId === ownId) {
        return false
      }

      if (ancestors.has(targetId) || descendants.has(targetId) || siblingIds.has(targetId)) {
        return false
      }

      if (hasReachableAdditionalDependencyPath(outgoingByNodeId, targetId, ownId)) {
        return false
      }

      return true
    })

    for (const targetId of normalizedOutgoing) {
      incomingByTargetId.get(targetId)?.push(ownId)
    }

    return {
      ...node,
      additionalDependencyIds: normalizedOutgoing,
      additionalDependentIds: [],
      children: (node.children ?? []).map(normalizeNode),
    }
  }

  const normalizedRoots = (tree.children ?? []).map(normalizeNode)

  const applyIncoming = (node) => ({
    ...node,
    additionalDependentIds: uniqueStringArray(incomingByTargetId.get(node.id) ?? []),
    children: (node.children ?? []).map(applyIncoming),
  })

  return {
    ...tree,
    children: normalizedRoots.map(applyIncoming),
  }
}

const withNormalizedDependencies = (tree) => normalizeScopeAssignments(normalizeAdditionalDependencies(tree))

export const ensureNodeLevels = (node) => {
  if (Array.isArray(node?.levels) && node.levels.length > 0) {
    return node.levels.map((entry, index) => toNodeLevel(entry, `Level ${index + 1}`))
  }

  return [
    toNodeLevel(
      {
        id: generateUUID(),
        label: 'Level 1',
        status: node?.status,
        releaseNote: node?.releaseNote,
      },
      'Level 1',
    ),
  ]
}

export const findNodeById = (node, targetId) => {
  if (!node) {
    return null
  }

  if (node.id === targetId) {
    return node
  }

  for (const child of node.children ?? []) {
    const found = findNodeById(child, targetId)

    if (found) {
      return found
    }
  }

  return null
}

export const findParentNodeId = (tree, targetId) => {
  if (!tree || !targetId) {
    return null
  }

  const queue = [...(tree.children ?? []).map((child) => ({ node: child, parentId: null }))]

  while (queue.length > 0) {
    const current = queue.shift()

    if (current.node.id === targetId) {
      return current.parentId
    }

    for (const child of current.node.children ?? []) {
      queue.push({ node: child, parentId: current.node.id })
    }
  }

  return null
}

const updateNodeById = (node, targetId, updater) => {
  const nextChildren = (node.children ?? []).map((child) => updateNodeById(child, targetId, updater))
  const hasChildrenChange = nextChildren.some((child, index) => child !== (node.children ?? [])[index])

  if (node.id === targetId) {
    return {
      ...node,
      ...updater(node),
      children: nextChildren,
    }
  }

  if (hasChildrenChange) {
    return {
      ...node,
      children: nextChildren,
    }
  }

  return node
}

export const updateNodeData = (treeData, id, newLabel, newStatus) =>
  withNormalizedDependencies(updateNodeById(treeData, id, (node) => {
    const levels = ensureNodeLevels(node)
    const nextStatus = newStatus ?? levels[0]?.status ?? DEFAULT_NODE_STATUS

    return {
      label: newLabel,
      shortName: sanitizeShortName(node.shortName, newLabel),
      status: nextStatus,
      levels: [
        {
          ...levels[0],
          status: nextStatus,
        },
        ...levels.slice(1),
      ],
    }
  }))

export const updateNodeShortName = (treeData, id, shortName) =>
  withNormalizedDependencies(updateNodeById(treeData, id, (node) => ({
    shortName: sanitizeShortName(shortName, node.label),
  })))

export const getNodeAdditionalDependencies = (treeData, id) => {
  const node = findNodeById(treeData, id)
  if (!node) {
    return {
      outgoingIds: [],
      incomingIds: [],
    }
  }

  return {
    outgoingIds: uniqueStringArray(node.additionalDependencyIds),
    incomingIds: uniqueStringArray(node.additionalDependentIds),
  }
}

export const setNodeAdditionalDependencies = (treeData, sourceNodeId, nextTargetIds) => {
  if (!sourceNodeId || !findNodeById(treeData, sourceNodeId)) {
    return treeData
  }

  const nextTree = updateNodeById(treeData, sourceNodeId, () => ({
    additionalDependencyIds: uniqueStringArray(nextTargetIds).filter((targetId) => !wouldCreateAdditionalDependencyCycle(treeData, sourceNodeId, targetId)),
  }))

  return withNormalizedDependencies(nextTree)
}

export const updateNodeProgressLevel = (treeData, id, levelId, updates) => {
  try {
    const node = findNodeById(treeData, id)
    const incoming = node ? (Array.isArray(node.levels) ? (node.levels.find((l) => l.id === levelId)?.scopeIds ?? []) : []) : []
    appendModelTrace({ ts: Date.now(), fn: 'updateNodeProgressLevel.before', nodeId: id, levelId, incoming: Array.from(incoming), updates })
  } catch (e) {
    // ignore
  }

  const nextTree = withNormalizedDependencies(updateNodeById(treeData, id, (node) => {
    const levels = ensureNodeLevels(node)
    const nextLevels = levels.map((level) => {
      if (level.id !== levelId) {
        return level
      }

      return {
        ...level,
        ...updates,
        status: updates?.status ?? level.status,
        releaseNote: updates?.releaseNote ?? level.releaseNote ?? '',
        scopeIds: updates?.scopeIds !== undefined
          ? uniqueStringArray(updates.scopeIds)
          : uniqueStringArray(level.scopeIds),
      }
    })

    return {
      levels: nextLevels,
      status: nextLevels[0]?.status ?? DEFAULT_NODE_STATUS,
    }
  }))

  try {
    const afterNode = findNodeById(nextTree, id)
    const resulting = afterNode ? (Array.isArray(afterNode.levels) ? (afterNode.levels.find((l) => l.id === levelId)?.scopeIds ?? []) : []) : []
    appendModelTrace({ ts: Date.now(), fn: 'updateNodeProgressLevel.after', nodeId: id, levelId, resulting: Array.from(resulting) })
  } catch (e) {
    // ignore
  }

  return nextTree
}

export const addNodeProgressLevel = (treeData, id, newLevelId) =>
  withNormalizedDependencies(updateNodeById(treeData, id, (node) => {
    const levels = ensureNodeLevels(node)
    const nextIndex = levels.length + 1
    const nextLevel = toNodeLevel(
        {
        id: newLevelId ?? generateUUID(),
        label: `Level ${nextIndex}`,
        status: DEFAULT_NODE_STATUS,
        releaseNote: '',
        scopeIds: [],
      },
      `Level ${nextIndex}`,
    )

    return {
      levels: [...levels, nextLevel],
    }
  }))

export const removeNodeProgressLevel = (treeData, id, levelId) =>
  withNormalizedDependencies(updateNodeById(treeData, id, (node) => {
    const levels = ensureNodeLevels(node)
    if (levels.length <= 1) {
      return {
        levels,
      }
    }

    const nextLevels = levels
      .filter((level) => level.id !== levelId)
      .map((level, index) => ({
        ...level,
        label: `Level ${index + 1}`,
      }))

    if (nextLevels.length === 0) {
      return {
        levels,
      }
    }

    return {
      levels: nextLevels,
      status: nextLevels[0].status,
    }
  }))

export const updateNodeSegment = (treeData, id, newSegmentId) => {
  const nextChildren = (treeData.children ?? []).map((child) =>
    updateNodeById(child, id, () => ({
      segmentId: newSegmentId,
    })),
  )
  const changed = nextChildren.some(
    (child, index) => child !== (treeData.children ?? [])[index],
  )

  if (!changed) {
    return treeData
  }

  return withNormalizedDependencies({
    ...treeData,
    children: nextChildren,
  })
}

export const updateSegmentLabel = (treeData, segmentId, newLabel) => ({
  ...treeData,
  segments: (treeData.segments ?? []).map((segment) =>
    segment.id === segmentId
      ? {
          ...segment,
          label: newLabel,
        }
      : segment,
  ),
})

/**
 * Gets the maximum level (ebene) in the entire tree.
 */
export const getMaxLevelInTree = (node, depth = 0) => {
  const currentLevel = node.ebene !== undefined && node.ebene !== null ? node.ebene : depth
  let max = currentLevel

  for (const child of node.children ?? []) {
    max = Math.max(max, getMaxLevelInTree(child, depth + 1))
  }

  return max
}

/**
 * Gets the level (ebene) of a node and its parent.
 * Returns { nodeLevel, parentLevel, maxLevel }
 */
export const getNodeLevelInfo = (tree, nodeId) => {
  let nodeLevel = null
  let parentLevel = null
  const maxLevel = Math.max(1, getMaxLevelInTree(tree, 0))

  const findNode = (node, depth = 1, parentLvl = 0) => {
    if (node.id === nodeId) {
      nodeLevel = node.ebene !== undefined && node.ebene !== null ? node.ebene : depth
      parentLevel = parentLvl
      return true
    }

    const currentLevel = node.ebene !== undefined && node.ebene !== null ? node.ebene : depth
    for (const child of node.children ?? []) {
      if (findNode(child, depth + 1, currentLevel)) return true
    }
    return false
  }

  for (const child of tree.children ?? []) {
    if (findNode(child, 1, 0)) break
  }

  return { nodeLevel: nodeLevel || 1, parentLevel: parentLevel || 0, maxLevel }
}

/**
 * Updates a node's level (ebene) and adjusts all descendants proportionally.
 * This ensures children maintain their relative depth when parent level changes.
 */
export const updateNodeLevel = (tree, nodeId, newLevel) => {
  const currentNode = findNodeById(tree, nodeId)
  if (!currentNode) return withNormalizedDependencies(tree)

  const { nodeLevel: oldLevel } = getNodeLevelInfo(tree, nodeId)
  const levelDiff = newLevel - oldLevel

  const getEffectiveLevel = (node, depth) =>
    node.ebene !== undefined && node.ebene !== null ? node.ebene : depth

  const adjustDescendants = (node, depth = 0, isDescendantOfTarget = false) => {
    const updated = { ...node }
    const isTarget = node.id === nodeId
    const currentLevel = getEffectiveLevel(node, depth)

    if (isTarget) {
      updated.ebene = newLevel
    } else if (isDescendantOfTarget && levelDiff !== 0) {
      updated.ebene = currentLevel + levelDiff
    }

    if (node.children && node.children.length > 0) {
      updated.children = node.children.map((child) =>
        adjustDescendants(child, depth + 1, isDescendantOfTarget || isTarget),
      )
    }

    return updated
  }

  return withNormalizedDependencies(adjustDescendants(tree, 0, false))
}

const createNewNode = (level, segmentId = null) => ({
  id: generateUUID(),
  label: DEFAULT_NODE_LABEL,
  shortName: shortNameFromLabel(DEFAULT_NODE_LABEL),
  status: DEFAULT_NODE_STATUS,
  levels: [
    {
      id: generateUUID(),
      label: 'Level 1',
      status: DEFAULT_NODE_STATUS,
      releaseNote: '',
      scopeIds: [],
    },
  ],
  ebene: level,
  segmentId,
  additionalDependencyIds: [],
  additionalDependentIds: [],
  children: [],
})

const createNewSegment = () => ({
  id: `segment-${generateUUID()}`,
  label: 'Neues Segment',
})

const createNewScope = (label) => ({
  id: `scope-${generateUUID()}`,
  label: String(label ?? '').trim(),
})

export const addScopeWithResult = (treeData, label) => {
  const validation = validateScopeLabel(treeData, label)
  if (!validation.ok) {
    return {
      ok: false,
      error: validation.error,
      tree: treeData,
      scope: null,
    }
  }

  const scope = createNewScope(validation.label)
  const nextTree = withNormalizedDependencies({
    ...treeData,
    scopes: [...(treeData.scopes ?? []), scope],
  })

  return {
    ok: true,
    error: null,
    tree: nextTree,
    scope,
  }
}

export const renameScopeWithResult = (treeData, scopeId, nextLabel) => {
  const existingScope = (treeData.scopes ?? []).find((scope) => scope.id === scopeId)
  if (!existingScope) {
    return {
      ok: false,
      error: 'Scope wurde nicht gefunden.',
      tree: treeData,
    }
  }

  const validation = validateScopeLabel(treeData, nextLabel, scopeId)
  if (!validation.ok) {
    return {
      ok: false,
      error: validation.error,
      tree: treeData,
    }
  }

  const nextTree = withNormalizedDependencies({
    ...treeData,
    scopes: (treeData.scopes ?? []).map((scope) =>
      scope.id === scopeId
        ? {
            ...scope,
            label: validation.label,
          }
        : scope,
    ),
  })

  return {
    ok: true,
    error: null,
    tree: nextTree,
  }
}

export const deleteScopeWithResult = (treeData, scopeId) => {
  const exists = (treeData.scopes ?? []).some((scope) => scope.id === scopeId)
  if (!exists) {
    return {
      ok: false,
      error: 'Scope wurde nicht gefunden.',
      tree: treeData,
    }
  }

  const nextTree = withNormalizedDependencies({
    ...treeData,
    scopes: (treeData.scopes ?? []).filter((scope) => scope.id !== scopeId),
  })

  return {
    ok: true,
    error: null,
    tree: nextTree,
  }
}

const promoteSubtreeLevels = (node, levelDiff) => {
  const nextNode = { ...node }

  if (nextNode.ebene !== undefined && nextNode.ebene !== null) {
    nextNode.ebene = Math.max(1, nextNode.ebene + levelDiff)
  }

  if (node.children?.length) {
    nextNode.children = node.children.map((child) => promoteSubtreeLevels(child, levelDiff))
  }

  return nextNode
}

export const deleteNodeBranch = (tree, nodeId) => {
  const removeFromChildren = (children) => {
    let changed = false
    const nextChildren = []

    for (const child of children ?? []) {
      if (child.id === nodeId) {
        changed = true
        continue
      }

      const result = removeNode(child)
      nextChildren.push(result.node)
      changed ||= result.changed
    }

    return { children: nextChildren, changed }
  }

  const removeNode = (node) => {
    const { children: nextChildren, changed } = removeFromChildren(node.children ?? [])

    if (!changed) {
      return { node, changed: false }
    }

    return {
      node: {
        ...node,
        children: nextChildren,
      },
      changed: true,
    }
  }

  const { children: nextRoots, changed } = removeFromChildren(tree.children ?? [])

  if (!changed) {
    return withNormalizedDependencies(tree)
  }

  return withNormalizedDependencies({
    ...tree,
    children: nextRoots,
  })
}

export const deleteNodeOnly = (tree, nodeId) => {
  const replaceInChildren = (children) => {
    let changed = false
    const nextChildren = []

    for (const child of children ?? []) {
      if (child.id === nodeId) {
        changed = true
        const promotedChildren = (child.children ?? []).map((grandChild) => promoteSubtreeLevels(grandChild, -1))
        nextChildren.push(...promotedChildren)
        continue
      }

      const result = replaceNode(child)
      nextChildren.push(result.node)
      changed ||= result.changed
    }

    return { children: nextChildren, changed }
  }

  const replaceNode = (node) => {
    const { children: nextChildren, changed } = replaceInChildren(node.children ?? [])

    if (!changed) {
      return { node, changed: false }
    }

    return {
      node: {
        ...node,
        children: nextChildren,
      },
      changed: true,
    }
  }

  const { children: nextRoots, changed } = replaceInChildren(tree.children ?? [])

  if (!changed) {
    return withNormalizedDependencies(tree)
  }

  return withNormalizedDependencies({
    ...tree,
    children: nextRoots,
  })
}

export const addChildNode = (tree, parentId) => {
  return addChildNodeWithResult(tree, parentId).tree
}

export const addChildNodeWithResult = (tree, parentId) => {
  const { nodeLevel: parentLevel } = getNodeLevelInfo(tree, parentId)
  let createdNodeId = null

  const addToParent = (node) => {
    if (node.id === parentId) {
      const existingChildren = node.children ?? []
      const insertIndex = Math.floor(existingChildren.length / 2)
      const nextChildren = [...existingChildren]
      const newNode = createNewNode(parentLevel + 1, node.segmentId ?? null)
      createdNodeId = newNode.id
      nextChildren.splice(insertIndex, 0, newNode)

      return {
        ...node,
        children: nextChildren,
      }
    }

    const nextChildren = (node.children ?? []).map(addToParent)
    const changed = nextChildren.some((child, index) => child !== (node.children ?? [])[index])

    if (!changed) {
      return node
    }

    return {
      ...node,
      children: nextChildren,
    }
  }

  return {
    tree: withNormalizedDependencies(addToParent(tree)),
    createdNodeId,
  }
}

export const addRootNodeNear = (tree, anchorRootId, side = 'right') => {
  return addRootNodeNearWithResult(tree, anchorRootId, side).tree
}

export const addInitialSegmentWithResult = (tree) => {
  const newSegment = createNewSegment()

  return {
    tree: withNormalizedDependencies({
      ...tree,
      segments: [...(tree.segments ?? []), newSegment],
    }),
    createdSegmentId: newSegment.id,
  }
}

export const addSegmentNearWithResult = (tree, anchorSegmentId, side = 'right') => {
  const existingSegments = tree.segments ?? []
  const anchorIndex = existingSegments.findIndex((segment) => segment.id === anchorSegmentId)

  if (anchorIndex < 0) {
    return {
      tree,
      createdSegmentId: null,
    }
  }

  const newSegment = createNewSegment()
  const insertIndex = side === 'left' ? anchorIndex : anchorIndex + 1
  const nextSegments = [...existingSegments]
  nextSegments.splice(insertIndex, 0, newSegment)

  return {
    tree: withNormalizedDependencies({
      ...tree,
      segments: nextSegments,
    }),
    createdSegmentId: newSegment.id,
  }
}

export const addInitialRootNodeWithResult = (tree) => {
  const nextRoots = [...(tree.children ?? [])]
  const defaultSegmentId = tree.segments?.[0]?.id ?? null
  const newNode = createNewNode(1, defaultSegmentId)
  nextRoots.push(newNode)

  return {
    tree: withNormalizedDependencies({
      ...tree,
      children: nextRoots,
    }),
    createdNodeId: newNode.id,
  }
}

export const addRootNodeNearWithResult = (tree, anchorRootId, side = 'right') => {
  const roots = tree.children ?? []
  const anchorIndex = roots.findIndex((node) => node.id === anchorRootId)

  if (anchorIndex < 0) {
    return {
      tree,
      createdNodeId: null,
    }
  }

  const anchorSegmentId = roots[anchorIndex].segmentId ?? null
  const insertIndex = side === 'left' ? anchorIndex : anchorIndex + 1
  const nextRoots = [...roots]
  const newNode = createNewNode(1, anchorSegmentId)
  nextRoots.splice(insertIndex, 0, newNode)

  return {
    tree: withNormalizedDependencies({
      ...tree,
      children: nextRoots,
    }),
    createdNodeId: newNode.id,
  }
}

export const deleteSegment = (tree, segmentId) => {
  const clearSegmentAssignments = (node) => {
    const nextNode = {
      ...node,
      segmentId: node.segmentId === segmentId ? null : node.segmentId ?? null,
    }

    if (node.children?.length) {
      nextNode.children = node.children.map(clearSegmentAssignments)
    }

    return nextNode
  }

  return withNormalizedDependencies({
    ...clearSegmentAssignments(tree),
    segments: (tree.segments ?? []).filter((segment) => segment.id !== segmentId),
  })
}

const adjustMovedSubtreeLevels = (node, levelDiff, isRoot = true) => {
  const nextNode = { ...node }

  if (isRoot) {
    const currentRootLevel = nextNode.ebene ?? 1
    nextNode.ebene = Math.max(1, currentRootLevel + levelDiff)
  } else if (nextNode.ebene !== undefined && nextNode.ebene !== null) {
    nextNode.ebene = Math.max(1, nextNode.ebene + levelDiff)
  }

  if (node.children?.length) {
    nextNode.children = node.children.map((child) => adjustMovedSubtreeLevels(child, levelDiff, false))
  }

  return nextNode
}

const subtreeContainsId = (node, targetId) => {
  if (!node) {
    return false
  }

  const queue = [node]
  while (queue.length > 0) {
    const current = queue.shift()

    if (current.id === targetId) {
      return true
    }

    queue.push(...(current.children ?? []))
  }

  return false
}

const removeNodeById = (children, targetId) => {
  let extractedNode = null
  let changed = false
  const nextChildren = []

  for (const child of children ?? []) {
    if (child.id === targetId) {
      extractedNode = child
      changed = true
      continue
    }

    const removal = removeNodeById(child.children ?? [], targetId)

    if (removal.extractedNode) {
      extractedNode = removal.extractedNode
      changed = true
      nextChildren.push({
        ...child,
        children: removal.children,
      })
      continue
    }

    nextChildren.push(child)
    changed ||= removal.changed
  }

  return {
    children: changed ? nextChildren : children,
    extractedNode,
    changed,
  }
}

const insertNodeUnderParent = (children, parentId, nodeToInsert) => {
  let changed = false
  const nextChildren = (children ?? []).map((child) => {
    if (child.id === parentId) {
      changed = true
      return {
        ...child,
        children: [...(child.children ?? []), nodeToInsert],
      }
    }

    const nextNestedChildren = insertNodeUnderParent(child.children ?? [], parentId, nodeToInsert)
    if (nextNestedChildren !== (child.children ?? [])) {
      changed = true
      return {
        ...child,
        children: nextNestedChildren,
      }
    }

    return child
  })

  return changed ? nextChildren : children
}

export const moveNodeToParent = (tree, nodeId, parentId) => {
  if (!tree || !nodeId || nodeId === parentId) {
    return withNormalizedDependencies(tree)
  }

  const currentNode = findNodeById(tree, nodeId)
  if (!currentNode) {
    return withNormalizedDependencies(tree)
  }

  if (parentId && subtreeContainsId(currentNode, parentId)) {
    return withNormalizedDependencies(tree)
  }

  const { children: treeWithoutNodeChildren, extractedNode } = removeNodeById(tree.children ?? [], nodeId)

  if (!extractedNode) {
    return withNormalizedDependencies(tree)
  }

  const treeWithoutNode = {
    ...tree,
    children: treeWithoutNodeChildren,
  }

  let targetLevel = 1
  if (parentId) {
    const parent = findNodeById(treeWithoutNode, parentId)
    if (!parent) {
      return withNormalizedDependencies(tree)
    }

    const parentLevelInfo = getNodeLevelInfo(treeWithoutNode, parentId)
    targetLevel = parentLevelInfo.nodeLevel + 1
  }

  const currentLevelInfo = getNodeLevelInfo(tree, nodeId)
  const levelDiff = targetLevel - currentLevelInfo.nodeLevel
  const movedNode = adjustMovedSubtreeLevels(extractedNode, levelDiff, true)

  if (!parentId) {
    return withNormalizedDependencies({
      ...treeWithoutNode,
      children: [...(treeWithoutNode.children ?? []), movedNode],
    })
  }

  const nextChildren = insertNodeUnderParent(treeWithoutNode.children ?? [], parentId, movedNode)
  if (nextChildren === (treeWithoutNode.children ?? [])) {
    return withNormalizedDependencies(tree)
  }

  return withNormalizedDependencies({
    ...treeWithoutNode,
    children: nextChildren,
  })
}
