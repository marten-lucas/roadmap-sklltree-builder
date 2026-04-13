import { getNodeDisplayEffort, getNodeDisplayBenefit } from './effortBenefit'

export const AXIS_SIZES = ['unclear', 'xs', 's', 'm', 'l', 'xl']
export const AXIS_COUNT = AXIS_SIZES.length
export const MATRIX_PADDING = 48
export const NODE_RADIUS = 18
export const NODE_COLLISION_MARGIN = 4

const resolveCellMetrics = (cellSize) => {
  if (typeof cellSize === 'number') {
    return { width: cellSize, height: cellSize }
  }

  return {
    width: Number(cellSize?.width ?? cellSize?.cellWidth ?? 0),
    height: Number(cellSize?.height ?? cellSize?.cellHeight ?? 0),
  }
}

/**
 * Computes node positions in the effort/benefit grid, resolving collisions in each cell
 * by placing nodes in a small grid pattern within the cell.
 */
export const computeMatrixLayout = (nodes, cellSize) => {
  const cellMetrics = resolveCellMetrics(cellSize)
  const cellNodes = {}
  for (const size of AXIS_SIZES) {
    cellNodes[size] = {}
    for (const bSize of AXIS_SIZES) {
      cellNodes[size][bSize] = []
    }
  }

  for (const node of nodes) {
    const ef = getNodeDisplayEffort(node).size
    const be = getNodeDisplayBenefit(node).size
    if (ef && be && AXIS_SIZES.includes(ef) && AXIS_SIZES.includes(be)) {
      cellNodes[ef][be].push(node)
    }
  }

  const positioned = []

  for (const [effortKey, benefitMap] of Object.entries(cellNodes)) {
    const col = AXIS_SIZES.indexOf(effortKey)
    for (const [benefitKey, nodesInCell] of Object.entries(benefitMap)) {
      if (nodesInCell.length === 0) continue

      const row = AXIS_SIZES.indexOf(benefitKey)
      // row 0 = highest benefit (xl) at top — invert y
      const invertedRow = AXIS_COUNT - 1 - row
      const cellLeft = MATRIX_PADDING + col * cellMetrics.width
      const cellTop = MATRIX_PADDING + invertedRow * cellMetrics.height

      const cellCenterX = MATRIX_PADDING + col * cellMetrics.width + cellMetrics.width / 2
      const cellCenterY = MATRIX_PADDING + invertedRow * cellMetrics.height + cellMetrics.height / 2

      // Compute a density-aware grid and node size so circles stay inside the cell.
      const aspect = Math.max(0.1, cellMetrics.width / Math.max(cellMetrics.height, 1))
      const cols = nodesInCell.length === 1
        ? 1
        : Math.max(1, Math.ceil(Math.sqrt(nodesInCell.length * aspect)))
      const rows = Math.ceil(nodesInCell.length / cols)
      const slotW = cellMetrics.width / cols
      const slotH = cellMetrics.height / rows
      const slotDiameter = Math.min(slotW, slotH)
      const spacing = Math.min(NODE_COLLISION_MARGIN, Math.max(1, slotDiameter * 0.2))
      const radius = Math.min(NODE_RADIUS, Math.max(2, (slotDiameter - spacing) / 2))
      const effectiveDiameter = radius * 2 + spacing
      const totalW = cols * effectiveDiameter
      const totalH = rows * effectiveDiameter

      nodesInCell.forEach((node, i) => {
        const col_ = i % cols
        const row_ = Math.floor(i / cols)
        const rawX = cellCenterX - totalW / 2 + col_ * effectiveDiameter + effectiveDiameter / 2
        const rawY = cellCenterY - totalH / 2 + row_ * effectiveDiameter + effectiveDiameter / 2
        const x = Math.max(cellLeft + radius, Math.min(cellLeft + cellMetrics.width - radius, rawX))
        const y = Math.max(cellTop + radius, Math.min(cellTop + cellMetrics.height - radius, rawY))
        positioned.push({ node, x, y, radius, effortKey, benefitKey })
      })
    }
  }

  return positioned
}
