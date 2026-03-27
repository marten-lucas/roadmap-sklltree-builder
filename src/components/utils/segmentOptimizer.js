import { UNASSIGNED_SEGMENT_ID, getGroupedSegmentId } from './layoutShared'

const getPairWeightKey = (leftSegmentId, rightSegmentId) =>
  leftSegmentId < rightSegmentId
    ? `${leftSegmentId}::${rightSegmentId}`
    : `${rightSegmentId}::${leftSegmentId}`

const getPairWeight = (pairWeights, leftSegmentId, rightSegmentId) => {
  if (leftSegmentId === rightSegmentId) {
    return 0
  }

  return pairWeights.get(getPairWeightKey(leftSegmentId, rightSegmentId)) ?? 0
}

export const buildOptimizedSegmentIdOrder = ({ root, explicitSegments, includeUnassigned }) => {
  const explicitOrderById = new Map(explicitSegments.map((segment, index) => [segment.id, index]))
  const segmentIds = includeUnassigned
    ? [...explicitSegments.map((segment) => segment.id), UNASSIGNED_SEGMENT_ID]
    : explicitSegments.map((segment) => segment.id)

  if (segmentIds.length <= 2) {
    return segmentIds
  }

  const pairWeights = new Map()
  const totalWeightBySegmentId = new Map(segmentIds.map((segmentId) => [segmentId, 0]))
  const links = root.links().filter((link) => link.source.depth > 0)

  for (const link of links) {
    const sourceSegmentId = getGroupedSegmentId(link.source.data.segmentId ?? null)
    const targetSegmentId = getGroupedSegmentId(link.target.data.segmentId ?? null)

    if (!totalWeightBySegmentId.has(sourceSegmentId) || !totalWeightBySegmentId.has(targetSegmentId)) {
      continue
    }

    if (sourceSegmentId === targetSegmentId) {
      totalWeightBySegmentId.set(sourceSegmentId, (totalWeightBySegmentId.get(sourceSegmentId) ?? 0) + 0.4)
      continue
    }

    const key = getPairWeightKey(sourceSegmentId, targetSegmentId)
    const nextWeight = (pairWeights.get(key) ?? 0) + 1
    pairWeights.set(key, nextWeight)
    totalWeightBySegmentId.set(sourceSegmentId, (totalWeightBySegmentId.get(sourceSegmentId) ?? 0) + 1)
    totalWeightBySegmentId.set(targetSegmentId, (totalWeightBySegmentId.get(targetSegmentId) ?? 0) + 1)
  }

  const remaining = new Set(segmentIds)
  const order = []
  const pickByExplicitOrder = (ids) => {
    return [...ids].sort((leftId, rightId) => {
      const leftOrder = explicitOrderById.get(leftId) ?? Number.MAX_SAFE_INTEGER
      const rightOrder = explicitOrderById.get(rightId) ?? Number.MAX_SAFE_INTEGER
      return leftOrder - rightOrder
    })[0]
  }

  const seed = [...remaining].sort((leftId, rightId) => {
    const leftWeight = totalWeightBySegmentId.get(leftId) ?? 0
    const rightWeight = totalWeightBySegmentId.get(rightId) ?? 0

    if (Math.abs(rightWeight - leftWeight) > 1e-6) {
      return rightWeight - leftWeight
    }

    const leftOrder = explicitOrderById.get(leftId) ?? Number.MAX_SAFE_INTEGER
    const rightOrder = explicitOrderById.get(rightId) ?? Number.MAX_SAFE_INTEGER
    return leftOrder - rightOrder
  })[0]

  order.push(seed)
  remaining.delete(seed)

  while (remaining.size > 0) {
    const leftEdgeId = order[0]
    const rightEdgeId = order[order.length - 1]

    const rankedCandidates = [...remaining].map((candidateId) => {
      const leftGain = getPairWeight(pairWeights, candidateId, leftEdgeId)
      const rightGain = getPairWeight(pairWeights, candidateId, rightEdgeId)
      const bestGain = Math.max(leftGain, rightGain)
      const preferredSide = leftGain > rightGain ? 'left' : rightGain > leftGain ? 'right' : 'auto'

      return {
        candidateId,
        bestGain,
        leftGain,
        rightGain,
        preferredSide,
      }
    })

    rankedCandidates.sort((left, right) => {
      if (Math.abs(right.bestGain - left.bestGain) > 1e-6) {
        return right.bestGain - left.bestGain
      }

      const leftOrder = explicitOrderById.get(left.candidateId) ?? Number.MAX_SAFE_INTEGER
      const rightOrder = explicitOrderById.get(right.candidateId) ?? Number.MAX_SAFE_INTEGER
      return leftOrder - rightOrder
    })

    const winner = rankedCandidates[0] ?? { candidateId: pickByExplicitOrder(remaining), preferredSide: 'auto' }
    const winnerId = winner.candidateId
    const appendToLeft =
      winner.preferredSide === 'left'
        ? true
        : winner.preferredSide === 'right'
          ? false
          : (explicitOrderById.get(winnerId) ?? Number.MAX_SAFE_INTEGER) <
            (explicitOrderById.get(rightEdgeId) ?? Number.MAX_SAFE_INTEGER)

    if (appendToLeft) {
      order.unshift(winnerId)
    } else {
      order.push(winnerId)
    }

    remaining.delete(winnerId)
  }

  const scoreOrder = (ids) => {
    let score = 0
    for (let index = 0; index < ids.length; index += 1) {
      for (let inner = index + 1; inner < ids.length; inner += 1) {
        const pairScore = getPairWeight(pairWeights, ids[index], ids[inner])
        const distance = inner - index
        score += pairScore / Math.max(1, distance)
      }
    }

    return score
  }

  let best = [...order]
  let bestScore = scoreOrder(best)
  let improved = true
  let safety = 0

  while (improved && safety < 24) {
    improved = false
    safety += 1

    // Phase C: first optimize with adjacent swaps for quick local smoothing.
    for (let index = 0; index < best.length - 1; index += 1) {
      const candidate = [...best]
      const left = candidate[index]
      candidate[index] = candidate[index + 1]
      candidate[index + 1] = left
      const candidateScore = scoreOrder(candidate)

      if (candidateScore > bestScore + 1e-6) {
        best = candidate
        bestScore = candidateScore
        improved = true
      }
    }

    // Then run single-item relocation moves to escape local swap optima.
    for (let from = 0; from < best.length; from += 1) {
      for (let to = 0; to < best.length; to += 1) {
        if (from === to) {
          continue
        }

        const candidate = [...best]
        const [moved] = candidate.splice(from, 1)
        candidate.splice(to, 0, moved)
        const candidateScore = scoreOrder(candidate)

        if (candidateScore > bestScore + 1e-6) {
          best = candidate
          bestScore = candidateScore
          improved = true
        }
      }
    }
  }

  return best
}