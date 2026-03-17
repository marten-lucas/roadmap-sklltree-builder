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
