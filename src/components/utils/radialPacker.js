export const computeWeightedSegmentSlots = ({
  segmentIds,
  statsById,
  radius,
  totalSpread,
  centerAngle,
  getMinimumWidth,
  getWeight,
}) => {
  if (segmentIds.length === 0) {
    return []
  }

  const domainStart = centerAngle - totalSpread / 2
  const rawMinWidths = segmentIds.map((segmentId) => getMinimumWidth(segmentId, radius, statsById.get(segmentId)))
  const minWidthSum = rawMinWidths.reduce((sum, width) => sum + width, 0)
  const minWidthScale = minWidthSum > totalSpread && minWidthSum > 0 ? totalSpread / minWidthSum : 1
  const minWidths = rawMinWidths.map((width) => width * minWidthScale)
  const scaledMinWidthSum = minWidths.reduce((sum, width) => sum + width, 0)
  const weights = segmentIds.map((segmentId) => getWeight(segmentId, statsById.get(segmentId)))
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0) || 1
  const remaining = Math.max(0, totalSpread - scaledMinWidthSum)

  let cursor = domainStart
  return segmentIds.map((segmentId, index) => {
    const width = minWidths[index] + (remaining * weights[index]) / weightSum
    const min = cursor
    const max = cursor + width
    cursor = max

    return {
      id: segmentId,
      min,
      max,
      center: (min + max) / 2,
      width,
    }
  })
}