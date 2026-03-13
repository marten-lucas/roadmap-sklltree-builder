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
