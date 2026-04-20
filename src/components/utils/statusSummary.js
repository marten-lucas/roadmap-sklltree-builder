import { STATUS_LABELS, normalizeStatusKey } from '../config'
import { getNodeDisplayBenefit } from './effortBenefit'
import { getDisplayStatusKey } from './nodeStatus'
import { buildLevelIdToNodeIdMap } from './treeData'

export const STATUS_SUMMARY_GROUP_ORDER = ['now', 'next', 'later', 'someday', 'done']
export const STATUS_SUMMARY_SORT_OPTIONS = [
  { value: 'manual', label: 'Manual delivery order' },
  { value: 'status', label: 'Status' },
  { value: 'value', label: 'Value' },
  { value: 'name', label: 'Name' },
  { value: 'topological', label: 'Topological' },
]

export const DEFAULT_STATUS_SUMMARY_SETTINGS = {
  sortMode: 'manual',
  manualOrderByStatus: {},
}

const BENEFIT_RANK = {
  unclear: 0,
  xs: 1,
  s: 2,
  m: 3,
  l: 4,
  xl: 5,
}

const SORT_MODE_SET = new Set(STATUS_SUMMARY_SORT_OPTIONS.map((option) => option.value))

const collectAllNodes = (document) => {
  const result = []
  const queue = [...(document?.children ?? [])]

  while (queue.length > 0) {
    const node = queue.shift()
    if (!node) {
      continue
    }

    result.push(node)
    queue.push(...(node.children ?? []))
  }

  return result
}

const uniqueNodeIds = (value) => {
  if (!Array.isArray(value)) {
    return []
  }

  const seen = new Set()
  const result = []

  for (const entry of value) {
    if (typeof entry !== 'string' || !entry || seen.has(entry)) {
      continue
    }

    seen.add(entry)
    result.push(entry)
  }

  return result
}

export const normalizeStatusSummarySettings = (value) => {
  const raw = value && typeof value === 'object' ? value : {}
  const sortMode = SORT_MODE_SET.has(raw.sortMode) ? raw.sortMode : DEFAULT_STATUS_SUMMARY_SETTINGS.sortMode
  const manualOrderByStatus = {}

  for (const statusKey of STATUS_SUMMARY_GROUP_ORDER) {
    const ids = uniqueNodeIds(raw.manualOrderByStatus?.[statusKey])
    if (ids.length > 0) {
      manualOrderByStatus[statusKey] = ids
    }
  }

  return {
    sortMode,
    manualOrderByStatus,
  }
}

export const getNodeStatusKeyForSummary = (node, selectedReleaseId = null) => {
  return normalizeStatusKey(getDisplayStatusKey(node, selectedReleaseId) ?? node?.status ?? 'later')
}

const compareText = (left, right) => {
  return String(left ?? '').localeCompare(String(right ?? ''), undefined, {
    sensitivity: 'base',
    numeric: true,
  })
}

const getNodeName = (node) => String(node?.label ?? node?.shortName ?? '').trim()

const getNodeBenefitRank = (node) => {
  const size = getNodeDisplayBenefit(node)?.size ?? 'unclear'
  return BENEFIT_RANK[size] ?? 0
}

const buildTopologicalRankByNodeId = (document) => {
  const allNodes = collectAllNodes(document)
  const nodeIndexById = new Map(allNodes.map((node, index) => [node.id, index]))
  const levelIdToNodeId = buildLevelIdToNodeIdMap(document)
  const prerequisiteIdsByNodeId = new Map(allNodes.map((node) => [node.id, new Set()]))
  const dependentIdsByNodeId = new Map(allNodes.map((node) => [node.id, new Set()]))

  for (const node of allNodes) {
    for (const level of node.levels ?? []) {
      for (const targetLevelId of (level.additionalDependencyLevelIds ?? [])) {
        const dependencyNodeId = levelIdToNodeId.get(targetLevelId)
        if (!dependencyNodeId || dependencyNodeId === node.id) {
          continue
        }

        prerequisiteIdsByNodeId.get(node.id)?.add(dependencyNodeId)
        dependentIdsByNodeId.get(dependencyNodeId)?.add(node.id)
      }
    }
  }

  const remainingPrereqCount = new Map(
    allNodes.map((node) => [node.id, prerequisiteIdsByNodeId.get(node.id)?.size ?? 0]),
  )

  const queue = allNodes
    .filter((node) => (remainingPrereqCount.get(node.id) ?? 0) === 0)
    .sort((left, right) => (nodeIndexById.get(left.id) ?? 0) - (nodeIndexById.get(right.id) ?? 0))

  const rankByNodeId = new Map()

  while (queue.length > 0) {
    const node = queue.shift()
    if (!node || rankByNodeId.has(node.id)) {
      continue
    }

    rankByNodeId.set(node.id, rankByNodeId.size)

    for (const dependentId of dependentIdsByNodeId.get(node.id) ?? []) {
      const nextCount = Math.max(0, (remainingPrereqCount.get(dependentId) ?? 0) - 1)
      remainingPrereqCount.set(dependentId, nextCount)
      if (nextCount === 0) {
        const dependentNode = allNodes.find((entry) => entry.id === dependentId)
        if (dependentNode) {
          queue.push(dependentNode)
          queue.sort((left, right) => (nodeIndexById.get(left.id) ?? 0) - (nodeIndexById.get(right.id) ?? 0))
        }
      }
    }
  }

  for (const node of allNodes) {
    if (!rankByNodeId.has(node.id)) {
      rankByNodeId.set(node.id, rankByNodeId.size)
    }
  }

  return rankByNodeId
}

const getManualOrderedNodeIds = (nodes, document, statusKey) => {
  const settings = normalizeStatusSummarySettings(document?.statusSummary)
  const configuredIds = settings.manualOrderByStatus?.[statusKey] ?? []
  const allowedNodeIds = new Set(nodes.map((node) => node.id))
  const presentConfiguredIds = configuredIds.filter((nodeId) => allowedNodeIds.has(nodeId))
  const remainingNodeIds = nodes
    .map((node) => node.id)
    .filter((nodeId) => !presentConfiguredIds.includes(nodeId))

  return [...presentConfiguredIds, ...remainingNodeIds]
}

export const sortNodesForStatusSummary = (nodes = [], document, {
  sortMode = DEFAULT_STATUS_SUMMARY_SETTINGS.sortMode,
  statusKey = null,
  selectedReleaseId = null,
  topologicalRankByNodeId = null,
} = {}) => {
  const rawNodes = Array.isArray(nodes) ? [...nodes] : []
  const manualOrder = getManualOrderedNodeIds(rawNodes, document, statusKey)
  const manualRankByNodeId = new Map(manualOrder.map((nodeId, index) => [nodeId, index]))
  const topologyRank = topologicalRankByNodeId ?? buildTopologicalRankByNodeId(document)

  const compareManual = (left, right) => {
    return (manualRankByNodeId.get(left.id) ?? Number.MAX_SAFE_INTEGER)
      - (manualRankByNodeId.get(right.id) ?? Number.MAX_SAFE_INTEGER)
  }

  const compareStatus = (left, right) => {
    const leftStatusIndex = STATUS_SUMMARY_GROUP_ORDER.indexOf(getNodeStatusKeyForSummary(left, selectedReleaseId))
    const rightStatusIndex = STATUS_SUMMARY_GROUP_ORDER.indexOf(getNodeStatusKeyForSummary(right, selectedReleaseId))

    if (leftStatusIndex !== rightStatusIndex) {
      return leftStatusIndex - rightStatusIndex
    }

    return compareManual(left, right)
  }

  const compareValue = (left, right) => {
    const rankDelta = getNodeBenefitRank(right) - getNodeBenefitRank(left)
    if (rankDelta !== 0) {
      return rankDelta
    }

    const nameDelta = compareText(getNodeName(left), getNodeName(right))
    if (nameDelta !== 0) {
      return nameDelta
    }

    return compareManual(left, right)
  }

  const compareName = (left, right) => {
    const nameDelta = compareText(getNodeName(left), getNodeName(right))
    if (nameDelta !== 0) {
      return nameDelta
    }

    return compareManual(left, right)
  }

  const compareTopological = (left, right) => {
    const topologyDelta = (topologyRank.get(left.id) ?? Number.MAX_SAFE_INTEGER)
      - (topologyRank.get(right.id) ?? Number.MAX_SAFE_INTEGER)

    if (topologyDelta !== 0) {
      return topologyDelta
    }

    return compareManual(left, right)
  }

  if (sortMode === 'status') {
    return rawNodes.sort(compareStatus)
  }

  if (sortMode === 'value') {
    return rawNodes.sort(compareValue)
  }

  if (sortMode === 'name') {
    return rawNodes.sort(compareName)
  }

  if (sortMode === 'topological') {
    return rawNodes.sort(compareTopological)
  }

  return rawNodes.sort(compareManual)
}

export const buildStatusSummaryGroups = (document, {
  sortMode = null,
  selectedReleaseId = null,
} = {}) => {
  const settings = normalizeStatusSummarySettings(document?.statusSummary)
  const resolvedSortMode = SORT_MODE_SET.has(sortMode) ? sortMode : settings.sortMode
  const allNodes = collectAllNodes(document)
  const groupedNodes = new Map(STATUS_SUMMARY_GROUP_ORDER.map((statusKey) => [statusKey, []]))

  for (const node of allNodes) {
    const statusKey = getNodeStatusKeyForSummary(node, selectedReleaseId)
    if (!groupedNodes.has(statusKey)) {
      continue
    }

    groupedNodes.get(statusKey).push(node)
  }

  const topologicalRankByNodeId = resolvedSortMode === 'topological'
    ? buildTopologicalRankByNodeId(document)
    : null

  return STATUS_SUMMARY_GROUP_ORDER.map((statusKey) => ({
    statusKey,
    label: STATUS_LABELS[statusKey] ?? statusKey,
    nodes: sortNodesForStatusSummary(groupedNodes.get(statusKey) ?? [], document, {
      sortMode: resolvedSortMode,
      statusKey,
      selectedReleaseId,
      topologicalRankByNodeId,
    }),
  }))
}

export const updateStatusSummarySortMode = (document, sortMode) => {
  const settings = normalizeStatusSummarySettings(document?.statusSummary)
  const nextSortMode = SORT_MODE_SET.has(sortMode) ? sortMode : DEFAULT_STATUS_SUMMARY_SETTINGS.sortMode

  return {
    ...document,
    statusSummary: {
      ...settings,
      sortMode: nextSortMode,
    },
  }
}

export const updateManualOrderForStatus = (document, statusKey, orderedNodeIds = []) => {
  const settings = normalizeStatusSummarySettings(document?.statusSummary)

  return {
    ...document,
    statusSummary: {
      ...settings,
      manualOrderByStatus: {
        ...settings.manualOrderByStatus,
        [statusKey]: uniqueNodeIds(orderedNodeIds),
      },
    },
  }
}

export const reorderStatusSummaryNode = (document, statusKey, sourceNodeId, targetNodeId = null) => {
  if (!document || !sourceNodeId || !statusKey) {
    return document
  }

  const group = buildStatusSummaryGroups(document, {
    sortMode: 'manual',
  }).find((entry) => entry.statusKey === statusKey)

  if (!group) {
    return document
  }

  const orderedNodeIds = group.nodes.map((node) => node.id)
  const sourceIndex = orderedNodeIds.indexOf(sourceNodeId)
  if (sourceIndex === -1) {
    return document
  }

  const [movedNodeId] = orderedNodeIds.splice(sourceIndex, 1)

  if (!targetNodeId) {
    orderedNodeIds.push(movedNodeId)
    return updateManualOrderForStatus(document, statusKey, orderedNodeIds)
  }

  const targetIndex = orderedNodeIds.indexOf(targetNodeId)
  if (targetIndex === -1) {
    orderedNodeIds.push(movedNodeId)
  } else {
    orderedNodeIds.splice(targetIndex, 0, movedNodeId)
  }

  return updateManualOrderForStatus(document, statusKey, orderedNodeIds)
}

export const getStatusSummarySortLabel = (sortMode) => {
  return STATUS_SUMMARY_SORT_OPTIONS.find((option) => option.value === sortMode)?.label ?? 'Manual delivery order'
}

export const getOrderedNodeRankMap = (document, options = {}) => {
  const groups = buildStatusSummaryGroups(document, options)
  const rankByNodeId = new Map()
  let index = 0

  for (const group of groups) {
    for (const node of group.nodes) {
      rankByNodeId.set(node.id, index)
      index += 1
    }
  }

  return rankByNodeId
}
