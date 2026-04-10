import { TREE_CONFIG, STATUS_STYLES } from '../config'
import { getDisplayStatusKey } from '../utils/nodeStatus'
import { SkillTreeNode } from '../nodes/SkillTreeNode'
import { MarkdownTooltipContent, Tooltip } from '../tooltip'

// ── Chevron helpers (Method 2: compound-path chevrons) ──────────────────────
const CHEVRON_SPACING = 7
// Half-opening angle of the V. 25° keeps arm tips within the line's half-width
// when arm length = line-width (verified: sin(25°) * lineW ≤ lineW/2 for all widths).
const CHEVRON_HALF_OPEN = 25 * (Math.PI / 180)
// Compute arm length so chevron tips stay strictly inside a line of `lineWidth`.
// Formula: armLen * sin(halfOpen) = lineWidth/2 * 0.88  (88% of half-width)
const chevronArm = (lineWidth) => (lineWidth * 0.44) / Math.sin(CHEVRON_HALF_OPEN)

/**
 * Sample a compound SVG path (M, L, A commands only) at ~`spacing` intervals.
 * Returns [{x, y, angle}] where `angle` is the tangent direction in radians.
 * Only handles M / L / A — the only commands produced by our edge-router.
 */
function sampleSvgPath(pathStr, spacing) {
  const samples = []
  const cmdRe = /([MLAZ])\s*([-\d. ,e+]*)/gi
  let cx = 0, cy = 0
  let match
  while ((match = cmdRe.exec(pathStr)) !== null) {
    const cmd = match[1].toUpperCase()
    const args = match[2].trim().length ? match[2].trim().split(/[\s,]+/).map(Number) : []
    if (cmd === 'M') {
      cx = args[0]; cy = args[1]
    } else if (cmd === 'L') {
      const tx = args[0], ty = args[1]
      const dx = tx - cx, dy = ty - cy
      const len = Math.sqrt(dx * dx + dy * dy)
      const tangent = Math.atan2(dy, dx)
      if (len > spacing * 0.5) {
        const n = Math.max(1, Math.floor(len / spacing))
        for (let i = 1; i <= n; i++) {
          const t = i / n
          if (t < 1) samples.push({ x: cx + dx * t, y: cy + dy * t, angle: tangent })
        }
      }
      cx = tx; cy = ty
    } else if (cmd === 'A') {
      // A rx ry rot large sweep ex ey  (our arcs always have phi=0, rx=ry)
      const r = args[0]
      const fa = Math.round(args[3])
      const fs = Math.round(args[4])
      const ex = args[5], ey = args[6]
      const x1p = (cx - ex) / 2
      const y1p = (cy - ey) / 2
      const sqSum = x1p * x1p + y1p * y1p
      if (sqSum < 1e-6) { cx = ex; cy = ey; continue }
      const sign = (fa !== fs) ? 1 : -1
      const sqFactor = Math.sqrt(Math.max(0, (r * r - sqSum) / sqSum))
      const arcCx = sign * sqFactor * y1p + (cx + ex) / 2
      const arcCy = sign * sqFactor * (-x1p) + (cy + ey) / 2
      let startAng = Math.atan2(cy - arcCy, cx - arcCx)
      let endAng = Math.atan2(ey - arcCy, ex - arcCx)
      let dAng = endAng - startAng
      if (fs === 1 && dAng < 0) dAng += 2 * Math.PI
      if (fs === 0 && dAng > 0) dAng -= 2 * Math.PI
      const arcLen = Math.abs(r * dAng)
      const n = Math.max(1, Math.floor(arcLen / spacing))
      for (let i = 1; i <= n; i++) {
        const t = i / n
        if (t < 1) {
          const ang = startAng + dAng * t
          const px = arcCx + r * Math.cos(ang)
          const py = arcCy + r * Math.sin(ang)
          // Tangent: perpendicular to radius in direction of travel
          const tangent = fs === 1 ? ang + Math.PI / 2 : ang - Math.PI / 2
          samples.push({ x: px, y: py, angle: tangent })
        }
      }
      cx = ex; cy = ey
    }
  }
  return samples
}

/**
 * Build a compound SVG path string of V-shaped chevrons at each sample point.
 * Tip points in the tangent direction; reverseDir=true flips to point backward.
 */
function buildChevronPath(samples, armLen, halfOpen, reverseDir = false) {
  if (samples.length === 0) return ''
  const parts = []
  for (const { x, y, angle } of samples) {
    const dir = reverseDir ? angle + Math.PI : angle
    const a1 = dir + Math.PI + halfOpen
    const a2 = dir + Math.PI - halfOpen
    const ax1 = (x + armLen * Math.cos(a1)).toFixed(2)
    const ay1 = (y + armLen * Math.sin(a1)).toFixed(2)
    const ax2 = (x + armLen * Math.cos(a2)).toFixed(2)
    const ay2 = (y + armLen * Math.sin(a2)).toFixed(2)
    parts.push(`M${ax1},${ay1} L${x.toFixed(2)},${y.toFixed(2)} L${ax2},${ay2}`)
  }
  return parts.join(' ')
}
// ────────────────────────────────────────────────────────────────────────────

const getPortalClassName = (portal, isSelected) => [
  'skill-tree-portal',
  portal.isInteractive ? 'skill-tree-portal--interactive' : '',
  isSelected ? 'skill-tree-portal--selected' : '',
].filter(Boolean).join(' ')

export function SkillTreeCanvas({
  canvasRef,
  canvas,
  centerIconSource,
  centerIconSize,
  filteredSegmentSeparators,
  filteredSegmentLabels,
  filteredLinks,
  layoutNodesById,
  renderedNodes,
  nodeVisibilityModeById,
  selectedNodeId,
  selectedNodeIds,
  selectedSegmentId,
  selectedPortalKey,
  visibleDependencyPortals,
  visibleDependencyLines = [],
  depSummaryByNodeId = new Map(),
  selectedLayoutNode,
  selectedControlGeometry,
  selectedSegmentLabel,
  selectedSegmentControlGeometry,
  emptyStateAddControl,
  emptySegmentAddControl,
  nodeSize = TREE_CONFIG.nodeSize,
  minimalNodeSize = 36,
  labelMode = 'far',
  currentZoomScale = 1,
  scopeOptions = [],
  onCanvasClick,
  onCanvasDoubleClick,
  onOpenCenterIconPanel,
  onSelectSegment,
  onSelectPortal,
  onAddInitialRoot,
  onAddInitialSegment,
  onAddRootNear,
  onAddSegmentNear,
  onAddChild,
  onSelectNode,
  onZoomToNode,
  storyPointMap,
  releaseId = null,
}) {
  return (
    <svg
      ref={canvasRef}
      width={canvas.width}
      height={canvas.height}
      viewBox={`0 0 ${canvas.width} ${canvas.height}`}
      className="skill-tree-canvas"
      onClick={onCanvasClick}
      onDoubleClick={onCanvasDoubleClick}
    >
      <defs>
        <radialGradient id="nodeHalo" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#020617" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx={canvas.origin.x} cy={canvas.origin.y} r={canvas.maxRadius + 160} fill="url(#nodeHalo)" />

      <g className="skill-tree-canvas__content">
        <g
          className="skill-tree-center-icon skill-tree-clickable"
          transform={`translate(${canvas.origin.x}, ${canvas.origin.y})`}
          data-center-icon-size={centerIconSize}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={onOpenCenterIconPanel}
        >
          <foreignObject
            key={centerIconSource}
            x={-centerIconSize / 2}
            y={-centerIconSize / 2}
            width={centerIconSize}
            height={centerIconSize}
            className="skill-tree-center-icon__foreign"
          >
            <img
              src={centerIconSource}
              alt="Center Icon"
              className="skill-tree-center-icon__image"
            />
          </foreignObject>
          <circle r={centerIconSize / 2 + 8} className="skill-tree-center-icon__hit-area" />
        </g>

        <g>
          {filteredSegmentSeparators.map((separator) => (
            <path
              key={separator.id}
              d={separator.path}
              data-segment-left={separator.leftSegmentId ?? ''}
              data-segment-right={separator.rightSegmentId ?? ''}
              fill="none"
              stroke="#1e3a8a"
              strokeOpacity="0.7"
              strokeWidth="2"
              strokeLinecap="round"
            />
          ))}
        </g>

        {filteredSegmentLabels.filter((segmentLabel) => segmentLabel.text).map((segmentLabel) => {
          const isSelected = segmentLabel.segmentId === selectedSegmentId
          
          // Wrap text with max line width
          const maxLineWidth = 15 // characters per line
          const words = String(segmentLabel.text).split(' ')
          const lines = []
          let currentLine = ''
          
          for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word
            if (testLine.length <= maxLineWidth) {
              currentLine = testLine
            } else {
              if (currentLine) lines.push(currentLine)
              currentLine = word
            }
          }
          if (currentLine) lines.push(currentLine)
          
          const labelWidth = Math.max(88, Math.max(...lines.map(l => l.length * 10)))
          const labelHeight = 24 + (lines.length - 1) * 16

          return (
            <g
              key={segmentLabel.id}
              data-segment-id={segmentLabel.segmentId}
              transform={`translate(${segmentLabel.x} ${segmentLabel.y}) rotate(${segmentLabel.rotation})`}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                onSelectSegment(segmentLabel.segmentId)
              }}
              className="skill-tree-clickable"
            >
              <rect
                x={-(labelWidth / 2) - 10}
                y={-(labelHeight / 2)}
                width={labelWidth + 20}
                height={labelHeight}
                rx={12}
                fill={isSelected ? 'rgba(34, 211, 238, 0.12)' : 'transparent'}
                stroke={isSelected ? 'rgba(103, 232, 249, 0.6)' : 'transparent'}
                strokeWidth="1.5"
              />
              <text
                x="0"
                y={-(lines.length - 1) * 8}
                textAnchor="middle"
                dominantBaseline="middle"
                className={isSelected ? 'skill-tree-segment-label skill-tree-segment-label--selected' : 'skill-tree-segment-label'}
              >
                {lines.map((line, i) => (
                  <tspan key={i} x="0" dy={i === 0 ? 0 : 16}>
                    {line}
                  </tspan>
                ))}
              </text>
            </g>
          )
        })}

        {filteredLinks.filter((link) => link.linkKind === 'ring').map((link) => (
          <path
            key={link.id}
            d={link.path}
            data-link-source-id={link.sourceId ?? ''}
            data-link-target-id={link.targetId ?? ''}
            stroke="#1e3a8a"
            strokeWidth="2"
            strokeOpacity="0.7"
            strokeLinecap="round"
            fill="none"
          />
        ))}

        {filteredLinks.filter((link) => link.sourceDepth > 0 && link.linkKind !== 'ring').map((link) => {
          const childNode = link.targetId ? layoutNodesById.get(link.targetId) : null
          const nodeStatus = childNode ? getDisplayStatusKey(childNode, releaseId) : 'later'
          const statusStyle = STATUS_STYLES[nodeStatus] ?? STATUS_STYLES.later

          return (
            <path
              key={link.id}
              d={link.path}
              data-link-source-id={link.sourceId ?? ''}
              data-link-target-id={link.targetId ?? ''}
              stroke={statusStyle.linkStroke}
              strokeWidth={statusStyle.linkStrokeWidth}
              strokeOpacity={statusStyle.linkOpacity}
              strokeDasharray={statusStyle.linkStrokeDasharray || 'none'}
              strokeLinecap="round"
              fill="none"
            />
          )
        })}

        {/* ── Connection line direction chevrons — only at close/very-close, only later+next ── */}
        {(labelMode === 'close' || labelMode === 'very-close') &&
          filteredLinks
            .filter((link) => link.sourceDepth > 0 && link.linkKind !== 'ring')
            .map((link) => {
              const childNode = link.targetId ? layoutNodesById.get(link.targetId) : null
              const nodeStatus = childNode ? getDisplayStatusKey(childNode, releaseId) : 'later'
              const statusStyle = STATUS_STYLES[nodeStatus] ?? STATUS_STYLES.later
              const lineWidth = parseFloat(statusStyle.linkStrokeWidth)
              const samples = sampleSvgPath(link.path, CHEVRON_SPACING)
              const chevronD = buildChevronPath(samples, chevronArm(lineWidth), CHEVRON_HALF_OPEN, false)
              if (!chevronD) return null
              return (
                <path
                  key={`lchv-${link.id}`}
                  d={chevronD}
                  stroke={statusStyle.linkStroke}
                  strokeWidth="1.2"
                  strokeOpacity={Math.min(1, parseFloat(statusStyle.linkOpacity) * 1.4)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  style={{ pointerEvents: 'none' }}
                />
              )
            })
        }

        {/* ── Dependency portals (spokes) — rendered before nodes so spokes sit behind circles/rectangles ── */}
        {visibleDependencyPortals.map((portal) => {
          const isPortalSelected = portal.key === selectedPortalKey
          const portalClassName = getPortalClassName(portal, isPortalSelected)
          const isSource = portal.type === 'source'
          const dotIdx = portal.otherLabel ? portal.otherLabel.indexOf('\u00B7') : -1
          const labelName = dotIdx >= 0 ? portal.otherLabel.slice(0, dotIdx) : (portal.otherLabel ?? '')
          const labelLevel = dotIdx >= 0 ? portal.otherLabel.slice(dotIdx + 1) : null

          // Spoke: line from node boundary point to portal tip
          const nodeData = layoutNodesById.get(portal.nodeId)
          const nodeX = nodeData?.x ?? portal.x
          const nodeY = nodeData?.y ?? portal.y
          const angleRad = (portal.angle ?? 0) * Math.PI / 180
          // For rounded-rect nodes (very-close) use rectangular boundary so corners don't clip
          const halfSize = nodeSize / 2
          const boundaryRadius = labelMode === 'very-close'
            ? halfSize / Math.max(Math.abs(Math.cos(angleRad)), Math.abs(Math.sin(angleRad)))
            : halfSize
          // Coords relative to portal center (translate group origin = portal.x/y)
          const bxLocal = (nodeX + Math.cos(angleRad) * boundaryRadius) - portal.x
          const byLocal = (nodeY + Math.sin(angleRad) * boundaryRadius) - portal.y
          // Extend spoke tip by the same amount the rect boundary exceeds the circle boundary
          // → zero at cardinal angles, max at 45° corners; no extension for circle nodes
          const spokeLen = Math.sqrt(bxLocal * bxLocal + byLocal * byLocal)
          const ext = (labelMode === 'very-close' && !portal.isMinimal)
            ? halfSize * (1 / Math.max(Math.abs(Math.cos(angleRad)), Math.abs(Math.sin(angleRad))) - 1)
            : 0
          const extTipX = spokeLen > 0 ? (-bxLocal / spokeLen) * ext : 0
          const extTipY = spokeLen > 0 ? (-byLocal / spokeLen) * ext : 0
          // Midpoint + rotation for label along the spoke
          const mx = (bxLocal + extTipX) / 2
          const my = (byLocal + extTipY) / 2
          const lineAngleDeg = Math.atan2(byLocal, bxLocal) * 180 / Math.PI
          const readAngleDeg = (lineAngleDeg > 90 || lineAngleDeg < -90) ? lineAngleDeg + 180 : lineAngleDeg

          // Method 2: compound-path chevrons computed directly from spoke endpoints.
          const spokeDx = extTipX - bxLocal
          const spokeDy = extTipY - byLocal
          const spokeDist = Math.sqrt(spokeDx * spokeDx + spokeDy * spokeDy)
          const spokeLinePath = `M${bxLocal.toFixed(2)},${byLocal.toFixed(2)} L${extTipX.toFixed(2)},${extTipY.toFixed(2)}`
          const spokeTangent = spokeDist > 0 ? Math.atan2(spokeDy, spokeDx) : 0
          const spokeSamples = []
          if (spokeDist > CHEVRON_SPACING * 0.5) {
            const n = Math.floor(spokeDist / CHEVRON_SPACING)
            for (let ci = 1; ci <= n; ci++) {
              const t = (ci * CHEVRON_SPACING) / spokeDist
              if (t < 1) spokeSamples.push({ x: bxLocal + spokeDx * t, y: byLocal + spokeDy * t, angle: spokeTangent })
            }
          }
          const spokeChevronD = buildChevronPath(spokeSamples, chevronArm(3), CHEVRON_HALF_OPEN, portal.type === 'target')

          return (
            <Tooltip
              key={portal.key}
              withArrow
              multiline
              openDelay={80}
              closeDelay={40}
              transitionProps={{ transition: 'fade', duration: 120 }}
              classNames={{ tooltip: 'skill-node-tooltip', arrow: 'skill-node-tooltip__arrow' }}
              label={<MarkdownTooltipContent title={portal.otherLabel} markdown={portal.tooltip} />}
            >
              <g
                className={portalClassName}
                data-portal-node-id={portal.nodeId}
                data-portal-source-id={portal.sourceId}
                data-portal-target-id={portal.targetId}
                transform={`translate(${portal.x} ${portal.y})`}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  if (portal.isInteractive) {
                    onSelectPortal(portal)
                  }
                }}
              >
                {/* base spoke line */}
                <path
                  d={spokeLinePath}
                  className={`skill-tree-portal__spoke skill-tree-portal__spoke--${portal.type}`}
                />
                {/* directional chevrons overlay (Method 2: compound path) */}
                {spokeChevronD && (
                  <path
                    d={spokeChevronD}
                    className={`skill-tree-portal__chevrons skill-tree-portal__chevrons--${portal.type}`}
                  />
                )}
                {/* ring icon at spoke tip */}
                <circle
                  className={`skill-tree-portal__ring skill-tree-portal__ring--${portal.type}`}
                  r={portal.isMinimal ? 6 : 14}
                  cx={extTipX}
                  cy={extTipY}
                />
                {/* invisible hit area (larger than ring for easy clicking) */}
                <circle className="skill-tree-portal__hit" r="18" cx={extTipX} cy={extTipY} />
                {/* label inside the circle at spoke tip */}
                {!portal.isMinimal && (
                  <text
                    className="skill-tree-portal__label"
                    x={extTipX}
                    y={extTipY}
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    {labelName}
                  </text>
                )}
              </g>
            </Tooltip>
          )
        })}

        {renderedNodes.map((node) => {
          const visibilityMode = nodeVisibilityModeById.get(node.id) ?? 'full'
          const renderNodeSize = visibilityMode === 'minimal' ? minimalNodeSize : nodeSize

          return (
            <SkillTreeNode
              key={node.id}
              node={node}
              nodeSize={renderNodeSize}
              displayMode={visibilityMode}
              labelMode={visibilityMode === 'minimal' ? 'far' : labelMode}
              zoomScale={currentZoomScale}
              isSelected={node.id === selectedNodeId || selectedNodeIds.includes(node.id)}
              scopeOptions={scopeOptions}
              onSelect={onSelectNode}
              onZoomToNode={onZoomToNode}
              storyPointMap={storyPointMap}
              releaseId={releaseId}
              canvasOriginX={canvas.origin.x}
              nodeDeps={depSummaryByNodeId.get(node.id) ?? null}
            />
          )
        })}

        {emptyStateAddControl && (
          <g
            className="skill-tree-clickable skill-tree-export-exclude"
            data-add-control="root-initial"
            transform={`translate(${emptyStateAddControl.x}, ${emptyStateAddControl.y})`}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              onAddInitialRoot()
            }}
          >
            <circle r="22" className="skill-tree-add-circle" strokeWidth="2.5" />
            <text
              x="0"
              y="1"
              textAnchor="middle"
              dominantBaseline="middle"
              className="skill-tree-add-text skill-tree-add-text--large"
            >
              +
            </text>
            <text
              x="0"
              y="42"
              textAnchor="middle"
              dominantBaseline="middle"
              className="skill-tree-empty-state-label"
            >
              Add skill
            </text>
          </g>
        )}

        {emptySegmentAddControl && (
          <g
            className="skill-tree-clickable skill-tree-export-exclude"
            data-add-control="segment-initial"
            transform={`translate(${emptySegmentAddControl.x}, ${emptySegmentAddControl.y})`}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              onAddInitialSegment()
            }}
          >
            <circle r="18" className="skill-tree-add-circle skill-tree-add-circle--segment" strokeWidth="2.5" />
            <text
              x="0"
              y="1"
              textAnchor="middle"
              dominantBaseline="middle"
              className="skill-tree-add-text skill-tree-add-text--secondary"
            >
              +
            </text>
            <text
              x="0"
              y="36"
              textAnchor="middle"
              dominantBaseline="middle"
              className="skill-tree-empty-state-label"
            >
              Add segment
            </text>
          </g>
        )}

        {selectedSegmentLabel && selectedSegmentControlGeometry && (
          <g className="skill-tree-export-exclude">
            <g
              data-add-control="segment-near"
              data-segment-id={selectedSegmentLabel.segmentId}
              data-direction="left"
              transform={`translate(${selectedSegmentControlGeometry.left.x}, ${selectedSegmentControlGeometry.left.y})`}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                onAddSegmentNear(selectedSegmentLabel.segmentId, 'left')
              }}
              className="skill-tree-clickable"
            >
              <circle r="16" className="skill-tree-add-circle skill-tree-add-circle--segment" strokeWidth="2.5" />
              <text
                x="0"
                y="1"
                textAnchor="middle"
                dominantBaseline="middle"
                className="skill-tree-add-text skill-tree-add-text--secondary"
              >
                +
              </text>
            </g>

            <g
              data-add-control="segment-near"
              data-segment-id={selectedSegmentLabel.segmentId}
              data-direction="right"
              transform={`translate(${selectedSegmentControlGeometry.right.x}, ${selectedSegmentControlGeometry.right.y})`}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                onAddSegmentNear(selectedSegmentLabel.segmentId, 'right')
              }}
              className="skill-tree-clickable"
            >
              <circle r="16" className="skill-tree-add-circle skill-tree-add-circle--segment" strokeWidth="2.5" />
              <text
                x="0"
                y="1"
                textAnchor="middle"
                dominantBaseline="middle"
                className="skill-tree-add-text skill-tree-add-text--secondary"
              >
                +
              </text>
            </g>
          </g>
        )}

          {selectedLayoutNode && selectedControlGeometry && (
            <g className="skill-tree-export-exclude">
              <g
                data-add-control="child"
                data-root-id={selectedLayoutNode.id}
                transform={`translate(${selectedControlGeometry.child.x}, ${selectedControlGeometry.child.y})`}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  onAddChild(selectedLayoutNode.id)
                }}
                className="skill-tree-clickable"
              >
                <circle r="18" className="skill-tree-add-circle" strokeWidth="2.5" />
                <text
                  x="0"
                  y="1"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="skill-tree-add-text"
                >
                  +
                </text>
              </g>

              {selectedLayoutNode.depth === 1 && (
                <g>
                  <g
                    data-add-control="root-near"
                    data-node-id={selectedLayoutNode.id}
                    data-direction="left"
                    transform={`translate(${selectedControlGeometry.left.x}, ${selectedControlGeometry.left.y})`}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation()
                      onAddRootNear(selectedLayoutNode.id, 'left')
                    }}
                    className="skill-tree-clickable"
                  >
                    <circle r="18" className="skill-tree-add-circle skill-tree-add-circle--secondary" strokeWidth="2.5" />
                    <text
                      x="0"
                      y="1"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="skill-tree-add-text skill-tree-add-text--secondary"
                    >
                      +
                    </text>
                  </g>

                  <g
                    data-add-control="root-near"
                    data-node-id={selectedLayoutNode.id}
                    data-direction="right"
                    transform={`translate(${selectedControlGeometry.right.x}, ${selectedControlGeometry.right.y})`}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation()
                      onAddRootNear(selectedLayoutNode.id, 'right')
                    }}
                    className="skill-tree-clickable"
                  >
                    <circle r="18" className="skill-tree-add-circle skill-tree-add-circle--secondary" strokeWidth="2.5" />
                    <text
                      x="0"
                      y="1"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="skill-tree-add-text skill-tree-add-text--secondary"
                    >
                      +
                    </text>
                  </g>
                </g>
              )}
            </g>
          )}
      </g>

    </svg>
  )
}

export default SkillTreeCanvas
