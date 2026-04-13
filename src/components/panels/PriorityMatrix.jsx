import { Text } from '@mantine/core'
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { STATUS_STYLES, STATUS_LABELS, normalizeStatusKey } from '../config'
import { EFFORT_SIZE_LABELS, BENEFIT_SIZE_LABELS, resolveStoryPoints, getNodeDisplayEffort, getNodeDisplayBenefit } from '../utils/effortBenefit'
import { AXIS_SIZES, AXIS_COUNT, MATRIX_PADDING, NODE_RADIUS, computeMatrixLayout } from '../utils/matrixLayout'
import { getDisplayStatusKey } from '../utils/nodeStatus'
import { SCOPE_FILTER_ALL, nodeMatchesScopeFilter } from '../utils/visibility'

const MATRIX_BOTTOM_LABEL_SPACE = 44
const MATRIX_CELL_SIZE = 100
const MATRIX_CONTENT_WIDTH = MATRIX_PADDING * 2 + AXIS_COUNT * MATRIX_CELL_SIZE
const MATRIX_CONTENT_HEIGHT = MATRIX_PADDING + AXIS_COUNT * MATRIX_CELL_SIZE + MATRIX_BOTTOM_LABEL_SPACE
const MATRIX_DRAWER_DEFAULT_WIDTH = 'min(72vw, max(520px, calc(100vh - 10rem)))'
const MATRIX_FULL_NODE_LIMIT = 16
const MATRIX_COMPACT_NODE_LIMIT = 32

const getDefaultDrawerWidthPx = () => {
  if (typeof window === 'undefined') {
    return 520
  }

  const preferred = window.innerHeight - 160
  return Math.max(520, Math.min(window.innerWidth * 0.72, preferred))
}

/**
 * Collects all nodes (flat) from a document tree.
 */
const collectNodes = (document) => {
  const result = []
  const queue = [...(document?.children ?? [])]
  while (queue.length > 0) {
    const node = queue.shift()
    result.push(node)
    queue.push(...(node.children ?? []))
  }
  return result
}

/**
 * Filters nodes that can be mapped to effort/benefit axis buckets.
 */
const filterPlottableNodes = (nodes) =>
  nodes.filter(
    (n) => {
      const effort = getNodeDisplayEffort(n)
      const benefit = getNodeDisplayBenefit(n)
      return AXIS_SIZES.includes(effort?.size) && AXIS_SIZES.includes(benefit?.size)
    },
  )

const resolveMatrixStatusKey = (node, releaseId = null) => {
  const levels = Array.isArray(node?.levels) ? node.levels : []
  const statusKeys = new Set()

  if (node?.status != null) {
    statusKeys.add(normalizeStatusKey(node.status))
  }

  if (levels.length > 0) {
    statusKeys.add(getDisplayStatusKey(node, releaseId))
  }

  if (statusKeys.has('done')) return 'done'
  if (statusKeys.has('now')) return 'now'
  if (statusKeys.has('next')) return 'next'
  if (statusKeys.has('later')) return 'later'
  if (statusKeys.has('hidden')) return 'hidden'

  return 'later'
}

// computeMatrixLayout is imported from ../utils/matrixLayout

const NodeCircle = ({ entry, onHover, onSelectNode, onDragStart, editMode, isHovered }) => {
  const { node, x, y } = entry
  const nodeRadius = entry.radius ?? NODE_RADIUS
  const statusKey = entry.statusKey ?? node.status ?? 'later'
  const statusStyles = STATUS_STYLES[statusKey] ?? STATUS_STYLES.later
  const shortName = String(node.shortName ?? node.label ?? '').slice(0, 3).toUpperCase()

  const handleMouseDown = (event) => {
    if (!editMode) return
    event.preventDefault()
    event.stopPropagation()
    onDragStart?.(entry, event)
  }

  const handleClick = () => {
    if (editMode) return
    onSelectNode?.(node.id)
  }

  return (
    <g
      data-node-id={node.id}
      style={{ cursor: editMode ? 'grab' : 'pointer' }}
      onMouseEnter={(event) => onHover(entry, event)}
      onMouseMove={(event) => onHover(entry, event)}
      onMouseLeave={() => onHover(null)}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
    >
      {isHovered && (
        <circle
          cx={x}
          cy={y}
          r={nodeRadius + 4}
          fill="none"
          stroke="#60a5fa"
          strokeWidth={2}
          opacity={0.7}
        />
      )}
      <circle
        className="priority-matrix__node"
        cx={x}
        cy={y}
        r={nodeRadius}
        fill={statusStyles.glowSegment ?? '#1e3a5f'}
        stroke={statusStyles.ringBand ?? '#3b82f6'}
        strokeWidth={isHovered ? 2.5 : 1.5}
      />
      {entry.showLabel !== false && (
        <text
          x={x}
          y={y + 1}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={statusStyles.textColor ?? '#e2e8f0'}
          fontSize={10}
          fontWeight={700}
          fontFamily="inherit"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {shortName}
        </text>
      )}
    </g>
  )
}

const HoverTooltip = ({ hovered, storyPointMap }) => {
  if (!hovered?.entry) return null

  const { entry, x, y } = hovered
  const { node } = entry
  const statusKey = entry.statusKey ?? node.status ?? 'later'
  const statusLabel = STATUS_LABELS[statusKey] ?? statusKey
  const effortLabel = EFFORT_SIZE_LABELS[getNodeDisplayEffort(node).size] ?? getNodeDisplayEffort(node).size ?? '–'
  const benefitLabel = BENEFIT_SIZE_LABELS[getNodeDisplayBenefit(node).size] ?? getNodeDisplayBenefit(node).size ?? '–'
  const sp = resolveStoryPoints(node, storyPointMap)

  // Tooltip positioned relative to SVG coordinate — will be overlaid via CSS translate
  return (
    <div
      className="priority-matrix__tooltip"
      style={{
        left: x + NODE_RADIUS + 8,
        top: y - 24,
        position: 'absolute',
        transform: 'none',
        pointerEvents: 'none',
      }}
    >
      <div className="priority-matrix__tooltip-title">{node.label}</div>
      <div className="priority-matrix__tooltip-row">⚡ Effort: {effortLabel}{sp != null ? ` (${sp} SP)` : ''}</div>
      <div className="priority-matrix__tooltip-row">★ Benefit: {benefitLabel}</div>
      <div className="priority-matrix__tooltip-row">Status: {statusLabel}</div>
    </div>
  )
}

const OverflowTooltip = ({ hoveredOverflow }) => {
  if (!hoveredOverflow) return null

  const { hiddenEntries, x, y } = hoveredOverflow
  const preview = hiddenEntries.slice(0, 6)
  const remaining = Math.max(0, hiddenEntries.length - preview.length)

  return (
    <div
      className="priority-matrix__tooltip"
      style={{
        left: x + 8,
        top: y + 8,
        position: 'absolute',
        transform: 'none',
        pointerEvents: 'none',
      }}
    >
      <div className="priority-matrix__tooltip-title">Hidden in this cell ({hiddenEntries.length})</div>
      {preview.map((entry) => (
        <div key={`hidden-${entry.node.id}`} className="priority-matrix__tooltip-row">
          - {entry.node.label}
        </div>
      ))}
      {remaining > 0 && (
        <div className="priority-matrix__tooltip-row">+{remaining} more</div>
      )}
    </div>
  )
}

/**
 * PriorityMatrix — an effort/benefit scatter chart of nodes by Effort (X) vs Benefit (Y).
 * Supports tooltips, node selection, and collision-free node placement.
 */
export function PriorityMatrix({ opened, onClose, document, onSelectNode, onMoveNode, selectedReleaseId = null }) {
  const containerRef = useRef(null)
  const svgRef = useRef(null)
  const drawerRef = useRef(null)
  const [drawerWidth, setDrawerWidth] = useState(null)
  const [hoveredEntry, setHoveredEntry] = useState(null)
  const [hoveredOverflow, setHoveredOverflow] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [dragState, setDragState] = useState(null)
  const [scopeFilter, setScopeFilter] = useState(SCOPE_FILTER_ALL)
  const [statusFilter, setStatusFilter] = useState('all')

  const handleResizeStart = useCallback((e) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = drawerRef.current?.offsetWidth ?? getDefaultDrawerWidthPx()
    const onMove = (moveEvt) => {
      const newWidth = Math.max(400, Math.min(window.innerWidth * 0.9, startWidth + (moveEvt.clientX - startX)))
      setDrawerWidth(newWidth)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  useLayoutEffect(() => {
    if (!opened) return
    setHoveredEntry(null)
    setHoveredOverflow(null)
  }, [opened])

  const allNodes = collectNodes(document)
  const scopeOptions = document?.scopes ?? []
  const filteredNodes = useMemo(
    () => allNodes.filter((node) => {
      if (!nodeMatchesScopeFilter(node, scopeFilter)) {
        return false
      }

      if (statusFilter === 'all') {
        return true
      }

      return resolveMatrixStatusKey(node, selectedReleaseId) === statusFilter
    }),
    [allNodes, scopeFilter, selectedReleaseId, statusFilter],
  )
  const plottable = filterPlottableNodes(filteredNodes)
  const { visibleEntries, overflowChips } = useMemo(() => {
    const byCell = new Map()
    for (const node of plottable) {
      const effortKey = getNodeDisplayEffort(node).size
      const benefitKey = getNodeDisplayBenefit(node).size
      const cellKey = `${effortKey}:${benefitKey}`
      const cellNodes = byCell.get(cellKey) ?? []
      cellNodes.push(node)
      byCell.set(cellKey, cellNodes)
    }

    const visibleNodes = []
    for (const nodesInCell of byCell.values()) {
      visibleNodes.push(...nodesInCell.slice(0, MATRIX_COMPACT_NODE_LIMIT))
    }

    const positionedVisible = computeMatrixLayout(visibleNodes, MATRIX_CELL_SIZE)
    const positionedByCell = new Map()
    for (const entry of positionedVisible) {
      const cellKey = `${entry.effortKey}:${entry.benefitKey}`
      const cellEntries = positionedByCell.get(cellKey) ?? []
      cellEntries.push(entry)
      positionedByCell.set(cellKey, cellEntries)
    }

    const visible = []
    const chips = []

    for (const [cellKey, nodesInCell] of byCell.entries()) {
      const visibleInCell = (positionedByCell.get(cellKey) ?? []).map((entry) => ({
        ...entry,
        statusKey: resolveMatrixStatusKey(entry.node, selectedReleaseId),
        showLabel: nodesInCell.length <= MATRIX_FULL_NODE_LIMIT,
      }))
      visible.push(...visibleInCell)

      if (nodesInCell.length > MATRIX_COMPACT_NODE_LIMIT) {
        const hiddenEntries = nodesInCell.slice(MATRIX_COMPACT_NODE_LIMIT).map((node) => ({ node }))
        const ref = visibleInCell[0]
        if (!ref) {
          continue
        }
        const col = AXIS_SIZES.indexOf(ref.effortKey)
        const row = AXIS_SIZES.indexOf(ref.benefitKey)
        const invertedRow = AXIS_COUNT - 1 - row
        chips.push({
          key: cellKey,
          hiddenEntries,
          count: hiddenEntries.length,
          x: MATRIX_PADDING + col * MATRIX_CELL_SIZE + MATRIX_CELL_SIZE / 2,
          y: MATRIX_PADDING + invertedRow * MATRIX_CELL_SIZE + MATRIX_CELL_SIZE - 12,
        })
      }
    }

    return {
      visibleEntries: visible,
      overflowChips: chips,
    }
  }, [plottable, selectedReleaseId])

  const storyPointMap = document?.storyPointMap

  const handleHover = useCallback((entry, event = null) => {
    if (dragState) {
      return
    }

    if (!entry || !event || !containerRef.current) {
      setHoveredEntry(null)
      return
    }

    setHoveredOverflow(null)
    const rect = containerRef.current.getBoundingClientRect()
    setHoveredEntry({
      entry,
      x: event.clientX - rect.left + 12,
      y: event.clientY - rect.top - 16,
    })
  }, [dragState])

  const handleOverflowHover = useCallback((chip, event = null) => {
    if (dragState) {
      return
    }

    if (!chip || !event || !containerRef.current) {
      setHoveredOverflow(null)
      return
    }

    setHoveredEntry(null)
    const rect = containerRef.current.getBoundingClientRect()
    setHoveredOverflow({
      hiddenEntries: chip.hiddenEntries,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    })
  }, [dragState])

  const pickCellAtPoint = useCallback((event) => {
    const svg = svgRef.current
    if (!svg || typeof svg.createSVGPoint !== 'function') {
      return null
    }

    const matrix = svg.getScreenCTM()
    if (!matrix) return null
    const pt = svg.createSVGPoint()
    pt.x = event.clientX
    pt.y = event.clientY
    const local = pt.matrixTransform(matrix.inverse())

    const relX = local.x - MATRIX_PADDING
    const relY = local.y - MATRIX_PADDING
    if (relX < 0 || relY < 0) return null

    const col = Math.floor(relX / MATRIX_CELL_SIZE)
    const invertedRow = Math.floor(relY / MATRIX_CELL_SIZE)
    if (col < 0 || col >= AXIS_COUNT || invertedRow < 0 || invertedRow >= AXIS_COUNT) {
      return null
    }

    const row = AXIS_COUNT - 1 - invertedRow
    const effortKey = AXIS_SIZES[col]
    const benefitKey = AXIS_SIZES[row]
    return {
      col,
      row,
      invertedRow,
      effortKey,
      benefitKey,
    }
  }, [])

  const handleNodeDragStart = useCallback((entry, event) => {
    if (!editMode) return
    const targetCell = pickCellAtPoint(event) ?? {
      col: AXIS_SIZES.indexOf(entry.effortKey),
      row: AXIS_SIZES.indexOf(entry.benefitKey),
      invertedRow: AXIS_COUNT - 1 - AXIS_SIZES.indexOf(entry.benefitKey),
      effortKey: entry.effortKey,
      benefitKey: entry.benefitKey,
    }
    setHoveredEntry(null)
    setHoveredOverflow(null)
    setDragState({
      nodeId: entry.node.id,
      sourceEffortKey: entry.effortKey,
      sourceBenefitKey: entry.benefitKey,
      targetCell,
    })
  }, [editMode, pickCellAtPoint])

  const handleSvgMouseMove = useCallback((event) => {
    if (!dragState) return
    const targetCell = pickCellAtPoint(event)
    if (!targetCell) return
    setDragState((prev) => (prev ? { ...prev, targetCell } : prev))
  }, [dragState, pickCellAtPoint])

  const handleSvgMouseUp = useCallback(() => {
    if (!dragState) return
    const { targetCell, nodeId, sourceEffortKey, sourceBenefitKey } = dragState
    if (targetCell && (targetCell.effortKey !== sourceEffortKey || targetCell.benefitKey !== sourceBenefitKey)) {
      onMoveNode?.(nodeId, targetCell.effortKey, targetCell.benefitKey)
    }
    setDragState(null)
  }, [dragState, onMoveNode])

  const handleSvgMouseLeave = useCallback(() => {
    if (dragState) {
      setDragState(null)
    }
    setHoveredEntry(null)
    setHoveredOverflow(null)
  }, [dragState])

  if (!opened) return null

  return (
    <div
      ref={drawerRef}
      className="priority-matrix-drawer"
      style={{ width: drawerWidth != null ? `${drawerWidth}px` : MATRIX_DRAWER_DEFAULT_WIDTH }}
    >
      <div className="priority-matrix-drawer__header">
        <span className="priority-matrix-drawer__title">Effort vs Benefit – Priority Matrix</span>
        <button
          className="priority-matrix-drawer__close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
      </div>
      <div className="priority-matrix-drawer__toolbar">
        <div className="priority-matrix__filters">
          <select
            className="priority-matrix__filter-select"
            value={scopeFilter}
            onChange={(event) => setScopeFilter(event.target.value)}
            aria-label="Filter matrix by scope"
          >
            <option value={SCOPE_FILTER_ALL}>All Scopes</option>
            {scopeOptions.map((scope) => (
              <option key={scope.id} value={scope.id}>{scope.label}</option>
            ))}
          </select>
          <select
            className="priority-matrix__filter-select"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="Filter matrix by status"
          >
            <option value="all">All Statuses</option>
            {Object.entries(STATUS_LABELS)
              .filter(([statusKey]) => statusKey !== 'hidden')
              .map(([statusKey, label]) => (
                <option key={statusKey} value={statusKey}>{label}</option>
              ))}
          </select>
        </div>
        <button
          type="button"
          className="priority-matrix__edit-button"
          onClick={() => setEditMode((v) => !v)}
          aria-pressed={editMode}
          aria-label="Toggle matrix edit mode"
        >
          ✎ Edit
        </button>
      </div>
      <div
        className="priority-matrix-drawer__content"
        ref={containerRef}
      >
        {/* Legend */}
        <div style={{ position: 'absolute', bottom: 8, right: 8, zIndex: 10, display: 'flex', gap: 10 }}>
          {['done', 'now', 'next', 'later'].map((s) => {
            const style = STATUS_STYLES[s] ?? STATUS_STYLES.later
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: style.glowSegment, border: `1.5px solid ${style.ringBand}` }} />
                <Text size="xs" c="dimmed">{STATUS_LABELS[s] ?? s}</Text>
              </div>
            )
          })}
        </div>

        {/* Tooltip overlay */}
        {hoveredEntry && (
          <HoverTooltip hovered={hoveredEntry} storyPointMap={storyPointMap} />
        )}
        {hoveredOverflow && (
          <OverflowTooltip hoveredOverflow={hoveredOverflow} />
        )}

        {/* SVG */}
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox={`0 0 ${MATRIX_CONTENT_WIDTH} ${MATRIX_CONTENT_HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ display: 'block', position: 'absolute', inset: 0, userSelect: 'none' }}
          onMouseMove={handleSvgMouseMove}
          onMouseUp={handleSvgMouseUp}
          onMouseLeave={handleSvgMouseLeave}
        >
          <g>
            {/* Grid cells */}
            {AXIS_SIZES.map((efKey, col) =>
              AXIS_SIZES.map((beKey, row) => {
                const invertedRow = AXIS_COUNT - 1 - row
                const cx = MATRIX_PADDING + col * MATRIX_CELL_SIZE
                const cy = MATRIX_PADDING + invertedRow * MATRIX_CELL_SIZE
                const isEvenCell = (col + invertedRow) % 2 === 0
                return (
                  <rect
                    key={`${efKey}-${beKey}`}
                    x={cx}
                    y={cy}
                    width={MATRIX_CELL_SIZE}
                    height={MATRIX_CELL_SIZE}
                    fill={isEvenCell ? 'rgba(30,41,59,0.7)' : 'rgba(15,23,42,0.7)'}
                    stroke="rgba(71,85,105,0.5)"
                    strokeWidth={0.5}
                  />
                )
              }),
            )}

            {/* X-axis labels (Effort) */}
            {AXIS_SIZES.map((key, col) => (
              <text
                key={`x-${key}`}
                x={MATRIX_PADDING + col * MATRIX_CELL_SIZE + MATRIX_CELL_SIZE / 2}
                y={MATRIX_PADDING + AXIS_COUNT * MATRIX_CELL_SIZE + 18}
                textAnchor="middle"
                fill="#94a3b8"
                fontSize={12}
                fontWeight={600}
                fontFamily="inherit"
              >
                {EFFORT_SIZE_LABELS[key] ?? key.toUpperCase()}
              </text>
            ))}

            {/* X-axis title */}
            <text
              x={MATRIX_PADDING + (AXIS_COUNT * MATRIX_CELL_SIZE) / 2}
              y={MATRIX_PADDING + AXIS_COUNT * MATRIX_CELL_SIZE + 36}
              textAnchor="middle"
              fill="#64748b"
              fontSize={11}
              fontFamily="inherit"
            >
              ⚡ Effort →
            </text>

            {/* Y-axis labels (Benefit, inverted: xl at top) */}
            {AXIS_SIZES.map((key, row) => {
              const invertedRow = AXIS_COUNT - 1 - row
              return (
                <text
                  key={`y-${key}`}
                  x={MATRIX_PADDING - 8}
                  y={MATRIX_PADDING + invertedRow * MATRIX_CELL_SIZE + MATRIX_CELL_SIZE / 2 + 1}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fill="#94a3b8"
                  fontSize={12}
                  fontWeight={600}
                  fontFamily="inherit"
                >
                  {BENEFIT_SIZE_LABELS[key] ?? key.toUpperCase()}
                </text>
              )
            })}

            {/* Y-axis title */}
            <text
              x={MATRIX_PADDING - 36}
              y={MATRIX_PADDING + (AXIS_COUNT * MATRIX_CELL_SIZE) / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#64748b"
              fontSize={11}
              fontFamily="inherit"
              transform={`rotate(-90, ${MATRIX_PADDING - 36}, ${MATRIX_PADDING + (AXIS_COUNT * MATRIX_CELL_SIZE) / 2})`}
            >
              ★ Benefit →
            </text>

            {dragState?.targetCell && (
              <rect
                x={MATRIX_PADDING + dragState.targetCell.col * MATRIX_CELL_SIZE}
                y={MATRIX_PADDING + dragState.targetCell.invertedRow * MATRIX_CELL_SIZE}
                width={MATRIX_CELL_SIZE}
                height={MATRIX_CELL_SIZE}
                fill="rgba(59,130,246,0.16)"
                stroke="rgba(96,165,250,0.9)"
                strokeWidth={2}
              />
            )}

            {/* Node circles */}
            {visibleEntries.map((entry) => (
              <NodeCircle
                key={entry.node.id}
                entry={entry}
                onHover={handleHover}
                onSelectNode={onSelectNode}
                onDragStart={handleNodeDragStart}
                editMode={editMode}
                isHovered={hoveredEntry?.entry?.node.id === entry.node.id}
              />
            ))}

            {overflowChips.map((chip) => (
              <g
                key={`overflow-${chip.key}`}
                className="priority-matrix__overflow-chip"
                onMouseEnter={(event) => handleOverflowHover(chip, event)}
                onMouseMove={(event) => handleOverflowHover(chip, event)}
                onMouseLeave={() => handleOverflowHover(null)}
              >
                <rect
                  x={chip.x - 16}
                  y={chip.y - 9}
                  width={32}
                  height={18}
                  rx={9}
                  fill="rgba(15,23,42,0.95)"
                  stroke="rgba(148,163,184,0.85)"
                  strokeWidth={1}
                />
                <text
                  x={chip.x}
                  y={chip.y + 0.5}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#bfdbfe"
                  fontSize={10}
                  fontWeight={700}
                  fontFamily="inherit"
                >
                  +{chip.count}
                </text>
              </g>
            ))}

            {/* Empty state */}
            {visibleEntries.length === 0 && (
              <text
                x={MATRIX_PADDING + (AXIS_COUNT * MATRIX_CELL_SIZE) / 2}
                y={MATRIX_PADDING + (AXIS_COUNT * MATRIX_CELL_SIZE) / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#475569"
                fontSize={14}
                fontFamily="inherit"
              >
                Keine Nodes mit Effort &amp; Benefit gesetzt
              </text>
            )}
          </g>
        </svg>
      </div>
      <div
        className="priority-matrix-drawer__resize-handle"
        onMouseDown={handleResizeStart}
      >
        <div className="priority-matrix-drawer__resize-grip" />
      </div>
    </div>
  )
}

export default PriorityMatrix
