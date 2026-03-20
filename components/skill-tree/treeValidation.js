import { TREE_CONFIG } from './config'
import { UNASSIGNED_SEGMENT_ID } from './layoutShared'
import { solveSkillTreeLayout } from './layoutSolver'
import { findNodeById, getNodeLevelInfo, updateNodeLevel, updateNodeSegment } from './treeData'

const DEFAULT_INVALID_REASON = 'Die Aenderung erzeugt einen ungueltigen Layout-Zustand.'

const toReasonList = (issues) => {
  const messages = issues.map((issue) => issue.message).filter(Boolean)
  return [...new Set(messages.length > 0 ? messages : [DEFAULT_INVALID_REASON])]
}

export const validateSkillTree = (tree, config = TREE_CONFIG) => {
  return solveSkillTreeLayout(tree, config)
}

const getNodeSubtreeIds = (tree, targetId) => {
  if (!targetId) {
    return new Set()
  }

  const queue = [...(tree.children ?? [])]
  let targetNode = null

  while (queue.length > 0) {
    const node = queue.shift()
    if (node.id === targetId) {
      targetNode = node
      break
    }

    queue.push(...(node.children ?? []))
  }

  if (!targetNode) {
    return new Set([targetId])
  }

  const subtreeIds = new Set()
  const subtreeQueue = [targetNode]

  while (subtreeQueue.length > 0) {
    const node = subtreeQueue.shift()
    subtreeIds.add(node.id)
    subtreeQueue.push(...(node.children ?? []))
  }

  return subtreeIds
}

const issueToKey = (issue) => {
  const nodePart = [...(issue.nodeIds ?? [])].sort().join(',')
  const segmentPart = issue.segmentId ?? ''
  return `${issue.type}|${segmentPart}|${nodePart}|${issue.message ?? ''}`
}

const filterRelevantIssues = (issues, impactedNodeIds) => {
  return issues.filter((issue) => {
    if (!issue.nodeIds || issue.nodeIds.length === 0) {
      return true
    }

    return issue.nodeIds.some((nodeId) => impactedNodeIds.has(nodeId))
  })
}

const buildChangeAssessment = ({ baseline, candidate, impactedNodeIds }) => {
  const baselineRelevant = filterRelevantIssues(baseline.diagnostics.issues, impactedNodeIds)
  const candidateRelevant = filterRelevantIssues(candidate.diagnostics.issues, impactedNodeIds)
  const baselineKeys = new Set(baselineRelevant.map(issueToKey))
  const introducedIssues = candidateRelevant.filter((issue) => !baselineKeys.has(issueToKey(issue)))
  const isFeasible = candidate.meta?.feasibility?.isFeasible !== false

  return {
    isAllowed: introducedIssues.length === 0 && isFeasible,
    introducedIssues,
    baselineRelevant,
    candidateRelevant,
    isFeasible,
  }
}

const getImpactedNodeIdsForSegmentChange = (tree, targetId) => {
  if (!targetId) {
    return new Set()
  }

  const queue = [...(tree.children ?? [])]
  const parentByNodeId = new Map()
  let targetNode = null

  while (queue.length > 0) {
    const node = queue.shift()
    if (node.id === targetId) {
      targetNode = node
      break
    }

    for (const child of node.children ?? []) {
      parentByNodeId.set(child.id, node.id)
      queue.push(child)
    }
  }

  if (!targetNode) {
    return new Set([targetId])
  }

  const impacted = new Set([targetId])
  let currentId = targetId

  while (parentByNodeId.has(currentId)) {
    const parentId = parentByNodeId.get(currentId)
    impacted.add(parentId)
    currentId = parentId
  }

  const subtreeIds = getNodeSubtreeIds(tree, targetId)
  subtreeIds.forEach((id) => impacted.add(id))

  return impacted
}

export const validateNodeSegmentChange = (tree, nodeId, segmentId, config = TREE_CONFIG) => {
  if (!nodeId || !findNodeById(tree, nodeId)) {
    return {
      ...validateSkillTree(tree, config),
      tree,
      isAllowed: false,
      introducedIssues: [
        {
          type: 'invalid-node',
          severity: 'error',
          nodeIds: nodeId ? [nodeId] : [],
          message: DEFAULT_INVALID_REASON,
        },
      ],
    }
  }

  const baseline = validateSkillTree(tree, config)
  const nextTree = updateNodeSegment(tree, nodeId, segmentId)
  const candidate = validateSkillTree(nextTree, config)
  const impactedNodeIds = getImpactedNodeIdsForSegmentChange(tree, nodeId)
  const assessment = buildChangeAssessment({
    baseline,
    candidate,
    impactedNodeIds,
  })

  return {
    ...candidate,
    tree: nextTree,
    isAllowed: assessment.isAllowed,
    introducedIssues: assessment.introducedIssues,
  }
}

export const validateNodeLevelChange = (tree, nodeId, level, config = TREE_CONFIG) => {
  const node = findNodeById(tree, nodeId)
  if (!node) {
    return {
      ...validateSkillTree(tree, config),
      tree,
      isAllowed: false,
      introducedIssues: [
        {
          type: 'invalid-node',
          severity: 'error',
          nodeIds: nodeId ? [nodeId] : [],
          message: DEFAULT_INVALID_REASON,
        },
      ],
    }
  }

  const levelInfo = getNodeLevelInfo(tree, nodeId)
  if (level <= levelInfo.parentLevel) {
    return {
      ...validateSkillTree(tree, config),
      tree,
      isAllowed: false,
      introducedIssues: [
        {
          type: 'invalid-level',
          severity: 'error',
          nodeIds: [nodeId],
          message: 'Eine Node muss auf einer hoeheren Ebene als ihr Parent liegen.',
        },
      ],
    }
  }

  const baseline = validateSkillTree(tree, config)
  const nextTree = updateNodeLevel(tree, nodeId, level)
  const candidate = validateSkillTree(nextTree, config)
  const impactedNodeIds = getNodeSubtreeIds(tree, nodeId)
  const assessment = buildChangeAssessment({
    baseline,
    candidate,
    impactedNodeIds,
  })

  return {
    ...candidate,
    tree: nextTree,
    isAllowed: assessment.isAllowed,
    introducedIssues: assessment.introducedIssues,
  }
}

export const getSegmentOptionsForNode = (tree, nodeId, config = TREE_CONFIG) => {
  const explicitSegments = tree.segments ?? []
  const currentNodeSegmentId =
    nodeId == null
      ? null
      : (() => {
          const queue = [...(tree.children ?? [])]

          while (queue.length > 0) {
            const node = queue.shift()
            if (node.id === nodeId) {
              return node.segmentId ?? null
            }

            queue.push(...(node.children ?? []))
          }

          return null
        })()

  const candidates = [
    ...explicitSegments.map((segment) => ({
      id: segment.id,
      label: segment.label,
    })),
    {
      id: UNASSIGNED_SEGMENT_ID,
      label: 'Ohne Segment',
    },
  ]

  return candidates.map((candidate) => {
    const candidateSegmentId = candidate.id === UNASSIGNED_SEGMENT_ID ? null : candidate.id
    const validation = validateNodeSegmentChange(tree, nodeId, candidateSegmentId, config)
    const isCurrent = currentNodeSegmentId === candidateSegmentId
    const isAllowed = validation.isAllowed || isCurrent

    return {
      id: candidate.id,
      label: candidate.label,
      isAllowed,
      isCurrent,
      reasons: isAllowed ? [] : toReasonList(validation.introducedIssues),
    }
  })
}

export const getLevelOptionsForNode = (tree, nodeId, config = TREE_CONFIG) => {
  if (!nodeId) {
    return []
  }

  const levelInfo = getNodeLevelInfo(tree, nodeId)
  const currentLevel = levelInfo.nodeLevel
  const options = []

  for (let level = levelInfo.parentLevel + 1; level <= levelInfo.maxLevel + 1; level += 1) {
    const validation = validateNodeLevelChange(tree, nodeId, level, config)
    const isCurrent = level === currentLevel
    const isAllowed = validation.isAllowed || isCurrent

    options.push({
      value: level,
      isAllowed,
      isCurrent,
      reasons: isAllowed ? [] : toReasonList(validation.introducedIssues),
    })
  }

  return options
}