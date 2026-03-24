export const resolveInspectorSelectedNode = (node, nodeIds) => {
  if (Array.isArray(nodeIds) && nodeIds.length > 1) return null
  return node
}
