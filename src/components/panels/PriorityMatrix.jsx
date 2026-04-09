import { Text } from '@mantine/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import { STATUS_STYLES, STATUS_LABELS } from '../config'
import { EFFORT_SIZE_LABELS, BENEFIT_SIZE_LABELS, resolveStoryPoints } from '../utils/effortBenefit'
import { AXIS_SIZES, AXIS_COUNT, MATRIX_PADDING, NODE_RADIUS, computeMatrixLayout } from '../utils/matrixLayout'

const CELL_MIN_SIZE = 80

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
 * Filters nodes that have both a non-unclear effort and benefit.
 */
const filterPlottableNodes = (nodes) =>
  nodes.filter(
    (n) => n.effort?.size && n.effort.size !== 'unclear' && n.benefit?.size && n.benefit.size !== 'unclear',
  )

// computeMatrixLayout is imported from ../utils/matrixLayout

const NodeCircle = ({ entry, onHover, isHovered }) => {
  const { node, x, y } = entry
  const statusKey = node.status ?? 'later'
  const statusStyles = STATUS_STYLES[statusKey] ?? STATUS_STYLES.later
  const shortName = String(node.shortName ?? node.label ?? '').slice(0, 3).toUpperCase()

  return (
    <g
      style={{ cursor: 'pointer' }}
      onMouseEnter={() => onHover(entry)}
      onMouseLeave={() => onHover(null)}
    >
      {isHovered && (
        <circle
          cx={x}
          cy={y}
          r={NODE_RADIUS + 4}
          fill="none"
          stroke="#60a5fa"
          strokeWidth={2}
          opacity={0.7}
        />
      )}
      <circle
        cx={x}
        cy={y}
        r={NODE_RADIUS}
        fill={statusStyles.glowSegment ?? '#1e3a5f'}
        stroke={statusStyles.ringBand ?? '#3b82f6'}
        strokeWidth={isHovered ? 2.5 : 1.5}
      />
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
    </g>
  )
}

const HoverTooltip = ({ entry, storyPointMap }) => {
  if (!entry) return null

  const { node, x, y } = entry
  const statusKey = node.status ?? 'later'
  const statusLabel = STATUS_LABELS[statusKey] ?? statusKey
  const effortLabel = EFFORT_SIZE_LABELS[node.effort?.size] ?? node.effort?.size ?? '–'
  const benefitLabel = BENEFIT_SIZE_LABELS[node.benefit?.size] ?? node.benefit?.size ?? '–'
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

/**
 * PriorityMatrix — a 5x5 scatter chart of nodes by Effort (X) vs Benefit (Y).
 * Supports zoom/pan, tooltips, and collision-free node placement.
 */
export function PriorityMatrix({ opened, onClose, document }) {
  const svgRef = useRef(null)
  const containerRef = useRef(null)
  const drawerRef = useRef(null)
  const [drawerWidth, setDrawerWidth] = useState(null)
  const [containerSize, setContainerSize] = useState({ width: 600, height: 520 })
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 })
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef(null)
  const [hoveredEntry, setHoveredEntry] = useState(null)

  const handleResizeStart = useCallback((e) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = drawerRef.current?.offsetWidth ?? window.innerWidth * 0.5
    const onMove = (moveEvt) => {
      const newWidth = Math.max(320, Math.min(window.innerWidth * 0.9, startWidth + (moveEvt.clientX - startX)))
      setDrawerWidth(newWidth)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  // ResizeObserver for responsiveness
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        })
      }
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // Keep a ref so wheel/pan callbacks always see the latest containerSize
  const containerSizeRef = useRef(containerSize)
  useEffect(() => { containerSizeRef.current = containerSize }, [containerSize])

  const computeFitTransform = useCallback((cSize) => {
    const cs = Math.max(
      CELL_MIN_SIZE,
      Math.min(
        (cSize.width - MATRIX_PADDING * 2) / AXIS_COUNT,
        (cSize.height - MATRIX_PADDING * 2) / AXIS_COUNT,
      ),
    )
    // Center the content (grid + labels) inside the SVG viewport
    const contentW = MATRIX_PADDING * 2 + AXIS_COUNT * cs
    const contentH = MATRIX_PADDING + AXIS_COUNT * cs + 44
    return {
      x: Math.max(0, (cSize.width - contentW) / 2),
      y: Math.max(0, (cSize.height - contentH) / 2),
      scale: 1,
    }
  }, [])

  // Refit whenever the container is resized or the drawer is opened/closed
  useEffect(() => {
    if (!opened || containerSize.width <= 0) return
    setTransform(computeFitTransform(containerSize))
    setHoveredEntry(null)
  }, [opened, containerSize, computeFitTransform])

  const cellSize = Math.max(
    CELL_MIN_SIZE,
    Math.min(
      (containerSize.width - MATRIX_PADDING * 2) / AXIS_COUNT,
      (containerSize.height - MATRIX_PADDING * 2) / AXIS_COUNT,
    ),
  )

  const allNodes = collectNodes(document)
  const plottable = filterPlottableNodes(allNodes)
  const positioned = computeMatrixLayout(plottable, cellSize)

  const storyPointMap = document?.storyPointMap

  // --- Zoom & Pan handlers ---
  // Clamp a transform so the diagram can't be panned completely off-screen
  const clampXY = (x, y, scale, cSize) => {
    const cs = Math.max(CELL_MIN_SIZE, Math.min(
      (cSize.width - MATRIX_PADDING * 2) / AXIS_COUNT,
      (cSize.height - MATRIX_PADDING * 2) / AXIS_COUNT,
    ))
    const contentW = (MATRIX_PADDING * 2 + AXIS_COUNT * cs) * scale
    const contentH = (MATRIX_PADDING + AXIS_COUNT * cs + 44) * scale
    const MARGIN = 80
    return {
      x: Math.max(MARGIN - contentW, Math.min(cSize.width - MARGIN, x)),
      y: Math.max(MARGIN - contentH, Math.min(cSize.height - MARGIN, y)),
    }
  }

  const handleWheel = useCallback((e) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setTransform((prev) => {
      const newScale = Math.max(0.4, Math.min(4, prev.scale * delta))
      const rect = svgRef.current?.getBoundingClientRect() ?? { left: 0, top: 0 }
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const rawX = mx - (mx - prev.x) * (newScale / prev.scale)
      const rawY = my - (my - prev.y) * (newScale / prev.scale)
      const clamped = clampXY(rawX, rawY, newScale, containerSizeRef.current)
      return { ...clamped, scale: newScale }
    })
  }, [])

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  const handleMouseDown = (e) => {
    if (e.button !== 0) return
    setIsPanning(true)
    panStartRef.current = { x: e.clientX - transform.x, y: e.clientY - transform.y }
  }

  // Fix: capture panStartRef value locally to avoid stale-closure crash when
  // panStartRef is nulled by handleMouseUp between the isPanning check and the access.
  const handleMouseMove = useCallback((e) => {
    const start = panStartRef.current
    if (!start) return
    setTransform((prev) => {
      const rawX = e.clientX - start.x
      const rawY = e.clientY - start.y
      const clamped = clampXY(rawX, rawY, prev.scale, containerSizeRef.current)
      return { ...prev, ...clamped }
    })
  }, [])

  const handleMouseUp = () => {
    setIsPanning(false)
    panStartRef.current = null
  }

  const handleResetZoom = () => setTransform(computeFitTransform(containerSize))

  if (!opened) return null

  return (
    <div
      ref={drawerRef}
      className="priority-matrix-drawer"
      style={{ width: drawerWidth != null ? `${drawerWidth}px` : '50vw' }}
    >
      <div className="priority-matrix-drawer__header">
        <span className="priority-matrix-drawer__title">Effort vs Benefit – Priorisierungs-Matrix</span>
        <button
          className="priority-matrix-drawer__close"
          onClick={onClose}
          aria-label="Schließen"
        >
          ×
        </button>
      </div>
      <div
        className="priority-matrix-drawer__content"
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Reset zoom button */}
        <button
          onClick={handleResetZoom}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 10,
            background: 'rgba(30,58,138,0.85)',
            border: '1px solid #3b82f6',
            color: '#93c5fd',
            borderRadius: 6,
            padding: '3px 10px',
            fontSize: 12,
            cursor: 'pointer',
          }}
          aria-label="Zoom zurücksetzen"
        >
          ⟳ Reset
        </button>

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
          <HoverTooltip entry={hoveredEntry} storyPointMap={storyPointMap} />
        )}

        {/* SVG */}
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          style={{ display: 'block', position: 'absolute', inset: 0, cursor: isPanning ? 'grabbing' : 'grab', userSelect: 'none' }}
          onMouseDown={handleMouseDown}
        >
          <g transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>
            {/* Grid cells */}
            {AXIS_SIZES.map((efKey, col) =>
              AXIS_SIZES.map((beKey, row) => {
                const invertedRow = AXIS_COUNT - 1 - row
                const cx = MATRIX_PADDING + col * cellSize
                const cy = MATRIX_PADDING + invertedRow * cellSize
                const isEvenCell = (col + invertedRow) % 2 === 0
                return (
                  <rect
                    key={`${efKey}-${beKey}`}
                    x={cx}
                    y={cy}
                    width={cellSize}
                    height={cellSize}
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
                x={MATRIX_PADDING + col * cellSize + cellSize / 2}
                y={MATRIX_PADDING + AXIS_COUNT * cellSize + 18}
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
              x={MATRIX_PADDING + (AXIS_COUNT * cellSize) / 2}
              y={MATRIX_PADDING + AXIS_COUNT * cellSize + 36}
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
                  y={MATRIX_PADDING + invertedRow * cellSize + cellSize / 2 + 1}
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
              y={MATRIX_PADDING + (AXIS_COUNT * cellSize) / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#64748b"
              fontSize={11}
              fontFamily="inherit"
              transform={`rotate(-90, ${MATRIX_PADDING - 36}, ${MATRIX_PADDING + (AXIS_COUNT * cellSize) / 2})`}
            >
              ★ Benefit ↑
            </text>

            {/* Node circles */}
            {positioned.map((entry) => (
              <NodeCircle
                key={entry.node.id}
                entry={entry}
                onHover={setHoveredEntry}
                isHovered={hoveredEntry?.node.id === entry.node.id}
              />
            ))}

            {/* Empty state */}
            {positioned.length === 0 && (
              <text
                x={MATRIX_PADDING + (AXIS_COUNT * cellSize) / 2}
                y={MATRIX_PADDING + (AXIS_COUNT * cellSize) / 2}
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
