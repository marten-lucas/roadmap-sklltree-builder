import { getGroupedSegmentId } from './layoutShared'

export const buildAutoPromotedLevels = ({ root, segmentOrderIndexById }) => {
  const promotedLevelById = new Map()
  const baseLevelById = new Map()
  const hierarchyNodes = root.descendants().filter((node) => node.depth > 0)

  for (const node of hierarchyNodes) {
    const baseLevel = node.data.ebene !== undefined && node.data.ebene !== null ? node.data.ebene : node.depth
    baseLevelById.set(node.data.id, baseLevel)
    promotedLevelById.set(node.data.id, baseLevel)
  }

  const links = root.links().filter((link) => link.source.depth > 0)
  links.sort((left, right) => left.source.depth - right.source.depth)

  for (const link of links) {
    const sourceId = link.source.data.id
    const targetId = link.target.data.id
    const sourceSegmentId = getGroupedSegmentId(link.source.data.segmentId ?? null)
    const targetSegmentId = getGroupedSegmentId(link.target.data.segmentId ?? null)
    const sourceSegmentOrder = segmentOrderIndexById.get(sourceSegmentId)
    const targetSegmentOrder = segmentOrderIndexById.get(targetSegmentId)

    if (sourceSegmentOrder === undefined || targetSegmentOrder === undefined) {
      continue
    }

    const segmentDistance = Math.abs(sourceSegmentOrder - targetSegmentOrder)
    if (segmentDistance <= 1) {
      continue
    }

    const sourceLevel = promotedLevelById.get(sourceId) ?? baseLevelById.get(sourceId) ?? link.source.depth
    const baseTargetLevel = baseLevelById.get(targetId) ?? link.target.depth
    const requiredTargetLevel = sourceLevel + 1 + (segmentDistance - 1)
    const nextTargetLevel = Math.max(baseTargetLevel, requiredTargetLevel)

    if ((promotedLevelById.get(targetId) ?? baseTargetLevel) < nextTargetLevel) {
      promotedLevelById.set(targetId, nextTargetLevel)
    }
  }

  return promotedLevelById
}