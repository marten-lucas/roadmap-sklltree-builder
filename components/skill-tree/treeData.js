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
  updateNodeById(treeData, id, () => ({
    label: newLabel,
    status: newStatus,
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

  return {
    ...treeData,
    children: nextChildren,
  }
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
  if (!currentNode) return tree

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

  return adjustDescendants(tree, 0, false)
}

const createNewNode = (level, segmentId = null) => ({
  id: crypto.randomUUID(),
  label: 'Neuer Skill',
  status: 'später',
  ebene: level,
  segmentId,
  children: [],
})

const createNewSegment = () => ({
  id: `segment-${crypto.randomUUID()}`,
  label: 'Neues Segment',
})

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
    return tree
  }

  return {
    ...tree,
    children: nextRoots,
  }
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
    return tree
  }

  return {
    ...tree,
    children: nextRoots,
  }
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
    tree: addToParent(tree),
    createdNodeId,
  }
}

export const addRootNodeNear = (tree, anchorRootId, side = 'right') => {
  return addRootNodeNearWithResult(tree, anchorRootId, side).tree
}

export const addInitialSegmentWithResult = (tree) => {
  const newSegment = createNewSegment()

  return {
    tree: {
      ...tree,
      segments: [...(tree.segments ?? []), newSegment],
    },
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
    tree: {
      ...tree,
      segments: nextSegments,
    },
    createdSegmentId: newSegment.id,
  }
}

export const addInitialRootNodeWithResult = (tree) => {
  const nextRoots = [...(tree.children ?? [])]
  const defaultSegmentId = tree.segments?.[0]?.id ?? null
  const newNode = createNewNode(1, defaultSegmentId)
  nextRoots.push(newNode)

  return {
    tree: {
      ...tree,
      children: nextRoots,
    },
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
    tree: {
      ...tree,
      children: nextRoots,
    },
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

  return {
    ...clearSegmentAssignments(tree),
    segments: (tree.segments ?? []).filter((segment) => segment.id !== segmentId),
  }
}
