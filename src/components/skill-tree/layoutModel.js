import { hierarchy } from 'd3-hierarchy'

export const buildLayoutModel = (data) => {
  const root = hierarchy(data)
  const explicitSegments = data.segments ?? []
  const allHierarchyNodes = root.descendants().filter((node) => node.depth > 0)
  const hasUnassignedNodes = allHierarchyNodes.some((node) => !node.data.segmentId)

  return {
    root,
    explicitSegments,
    allHierarchyNodes,
    hasUnassignedNodes,
  }
}