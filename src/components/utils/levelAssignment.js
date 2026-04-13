import { getGroupedSegmentId } from './layoutShared'

const PROMOTION_BASE_OFFSET = 1

const PROMOTION_PROFILES = {
  stable: {
    distanceWeight: 1,
    distanceDiscountThreshold: Number.POSITIVE_INFINITY,
    distanceDiscount: 0,
    maxPromotionDelta: Number.POSITIVE_INFINITY,
  },
  balanced: {
    distanceWeight: 1,
    distanceDiscountThreshold: Number.POSITIVE_INFINITY,
    distanceDiscount: 0,
    maxPromotionDelta: 5,
  },
  aggressive: {
    distanceWeight: 0.8,
    distanceDiscountThreshold: 4,
    distanceDiscount: 1,
    maxPromotionDelta: 4,
  },
}

const resolvePromotionProfile = (config) => {
  const profileName = String(config?.promotionProfile ?? 'stable').toLowerCase()
  return PROMOTION_PROFILES[profileName] ?? PROMOTION_PROFILES.stable
}

export const buildAutoPromotedLevels = ({ root, segmentOrderIndexById, config }) => {
  const profile = resolvePromotionProfile(config)
  const promotedLevelById = new Map()
  const baseLevelById = new Map()
  const promotedByConflict = new Map()
  const edgePromotionDetails = []
  const hierarchyNodes = root.descendants().filter((node) => node.depth > 0)

  for (const node of hierarchyNodes) {
    const baseLevel = node.data.ebene !== undefined && node.data.ebene !== null ? node.data.ebene : node.depth
    baseLevelById.set(node.data.id, baseLevel)
    promotedLevelById.set(node.data.id, baseLevel)
  }

  const links = root.links().filter((link) => link.source.depth > 0)
  links.sort((left, right) => left.source.depth - right.source.depth)

  let changed = true
  let safety = 0

  while (changed && safety < 12) {
    changed = false
    safety += 1

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
      const numSegments = segmentOrderIndexById.size
      // Circular distance: e.g. in 4 segments, distance between 0 and 3 is 1 (3-4 = -1)
      const circularDistance = Math.min(segmentDistance, Math.abs(segmentDistance - numSegments))
      
      if (circularDistance <= 1) {
        continue
      }

      const sourceLevel = promotedLevelById.get(sourceId) ?? baseLevelById.get(sourceId) ?? link.source.depth
      const baseTargetLevel = baseLevelById.get(targetId) ?? link.target.depth
      const currentTargetLevel = promotedLevelById.get(targetId) ?? baseTargetLevel
      const rawDistancePenalty = Math.max(0, segmentDistance - 1)
      const weightedPenalty = Math.ceil(rawDistancePenalty * profile.distanceWeight)
      const discount = segmentDistance >= profile.distanceDiscountThreshold
        ? profile.distanceDiscount
        : 0
      const discountedPenalty = Math.max(0, weightedPenalty - discount)
      const requiredTargetLevel = sourceLevel + PROMOTION_BASE_OFFSET + discountedPenalty
      const cappedTargetLevel = Math.min(requiredTargetLevel, baseTargetLevel + profile.maxPromotionDelta)
      const nextTargetLevel = Math.max(baseTargetLevel, cappedTargetLevel)

      if (currentTargetLevel < nextTargetLevel) {
        promotedLevelById.set(targetId, nextTargetLevel)
        const detail = {
          sourceId,
          targetId,
          sourceSegmentId,
          targetSegmentId,
          sourceLevel,
          fromLevel: currentTargetLevel,
          toLevel: nextTargetLevel,
          segmentDistance,
          promotedBy: nextTargetLevel - currentTargetLevel,
        }
        edgePromotionDetails.push(detail)

        const existing = promotedByConflict.get(targetId) ?? {
          nodeId: targetId,
          promotedBy: 0,
          targetLevel: nextTargetLevel,
          reasons: [],
        }

        existing.promotedBy = Math.max(existing.promotedBy, nextTargetLevel - baseTargetLevel)
        existing.targetLevel = nextTargetLevel
        existing.reasons.push(detail)
        promotedByConflict.set(targetId, existing)
        changed = true
      }
    }
  }

  // Second pass: fix level inversions where a child has ebene ≤ parent ebene.
  // This can happen in manually-authored CSVs (e.g. SEA has Ebene=1 but parent
  // MM has Ebene=3, or PFD has Ebene=6 same as parent CFL). Such inversions
  // produce inward or horizontal edges – enforce child level > parent level.
  const allLinks = root.links().filter((link) => link.source.depth > 0)
  changed = true
  safety = 0
  while (changed && safety < 20) {
    changed = false
    safety += 1
    for (const link of allLinks) {
      const parentId = link.source.data.id
      const childId = link.target.data.id
      const parentLevel = promotedLevelById.get(parentId) ?? baseLevelById.get(parentId) ?? link.source.depth
      const currentChildLevel = promotedLevelById.get(childId) ?? baseLevelById.get(childId) ?? link.target.depth
      if (currentChildLevel <= parentLevel) {
        const nextChildLevel = parentLevel + 1
        promotedLevelById.set(childId, nextChildLevel)
        changed = true
      }
    }
  }

  return {
    promotedLevelById,
    promotedByConflict,
    edgePromotionDetails,
  }
}