import { getNodeDisplayEffort, getNodeDisplayBenefit } from './effortBenefit'

export const AXIS_SIZES = ['xs', 's', 'm', 'l', 'xl']
export const AXIS_COUNT = AXIS_SIZES.length // 5
export const MATRIX_PADDING = 48
export const NODE_RADIUS = 18
export const NODE_COLLISION_MARGIN = 4

/**
 * Computes node positions in 5x5 grid, resolving collisions in each cell
 * by placing nodes in a small grid pattern within the cell.
 */
export const computeMatrixLayout = (nodes, cellSize) => {
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

      const cellCenterX = MATRIX_PADDING + col * cellSize + cellSize / 2
      const cellCenterY = MATRIX_PADDING + invertedRow * cellSize + cellSize / 2

      // Lay out nodes in a spiral / grid within the cell to avoid overlap
      const slotDiameter = NODE_RADIUS * 2 + NODE_COLLISION_MARGIN

      // Compute grid dimensions for this cell
      const cols = Math.ceil(Math.sqrt(nodesInCell.length))
      const rows = Math.ceil(nodesInCell.length / cols)
      const totalW = cols * slotDiameter
      const totalH = rows * slotDiameter

      nodesInCell.forEach((node, i) => {
        const col_ = i % cols
        const row_ = Math.floor(i / cols)
        const x = cellCenterX - totalW / 2 + col_ * slotDiameter + slotDiameter / 2
        const y = cellCenterY - totalH / 2 + row_ * slotDiameter + slotDiameter / 2
        positioned.push({ node, x, y, effortKey, benefitKey })
      })
    }
  }

  return positioned
}
