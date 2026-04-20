import { useState, useMemo, memo } from 'react'
import { TREE_CONFIG, STATUS_STYLES } from '../config'
import { getDisplayStatusKey } from '../utils/nodeStatus'
import { getConnectionStatusStyle, getConnectionZOrder } from '../utils/linkPresentation'
import { SkillTreeNode } from '../nodes/SkillTreeNode'
import { MarkdownTooltipContent, Tooltip } from '../tooltip'
import { renderMarkdownToHtml } from '../utils/markdown'
import { CENTER_ICON_HIT_PADDING } from '../utils/centerIconPresentation'
import { getPortalViewModel } from '../utils/portalPresentation'


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

const getPortalClassName = (portal, isSelected, isPeerHovered) => [
  'skill-tree-portal',
  portal.isInteractive ? 'skill-tree-portal--interactive' : '',
  isSelected ? 'skill-tree-portal--selected' : '',
  isPeerHovered ? 'skill-tree-portal--peer-hovered' : '',
].filter(Boolean).join(' ')

function CenterIconTooltipContent({ systemName, release, draftRelease }) {
  const hasRelease = Boolean(release)
  const displayRelease = draftRelease && draftRelease.id === release?.id
    ? { ...release, ...draftRelease }
    : release
  const introductionHtml = renderMarkdownToHtml(displayRelease?.introduction ?? '')

  return (
    <div>
      <div className="skill-node-tooltip__title">{systemName || 'Unbenanntes System'}</div>
      {hasRelease ? (
        <>
          <div className="skill-node-tooltip__note">
            <strong>Release:</strong> {displayRelease.name || 'Unbenannt'}
          </div>
          <div className="skill-node-tooltip__note">
            <strong>Motto:</strong> {displayRelease.motto || 'Keine Angabe'}
          </div>
          <div className="skill-node-tooltip__note">
            <strong>Datum:</strong> {displayRelease.date || 'Keine Angabe'}
          </div>
          <div className="skill-node-tooltip__note skill-node-tooltip__note--markdown">
            <strong>Introduction</strong>
            <div
              dangerouslySetInnerHTML={{
                __html: introductionHtml || '<p>Keine Introduction hinterlegt.</p>',
              }}
            />
          </div>
        </>
      ) : (
        <div className="skill-node-tooltip__note">Kein Release ausgewählt.</div>
      )}
    </div>
  )
}

export function SkillTreeCanvas({
  canvasRef,
  canvas,
  centerIconSource,
  centerIconSize,
  systemName = '',
  activeRelease = null,
  draftRelease = null,
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
  // eslint-disable-next-line no-unused-vars
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
  const [hoveredPortalKey, setHoveredPortalKey] = useState(null)
  const hoveredPortal = hoveredPortalKey
    ? visibleDependencyPortals.find((portal) => portal.key === hoveredPortalKey) ?? null
    : null

  const getLinkStatusStyle = (link) => getConnectionStatusStyle(link, layoutNodesById, releaseId)

  const splitDots = useMemo(() => {

    return Array.from(
      filteredLinks.reduce((acc, link) => {
        if (link.sourceDepth <= 0 || link.linkKind === 'ring' || !link.splitPoint) return acc
        const statusStyle = getLinkStatusStyle(link)
        const key = `${link.splitPoint.x.toFixed(2)}|${link.splitPoint.y.toFixed(2)}`
        if (!acc.has(key)) {
          acc.set(key, {
            key,
            x: link.splitPoint.x,
            y: link.splitPoint.y,
            fill: statusStyle.linkStroke,
          })
        }
        return acc
      }, new Map()).values(),
    )
  }, [filteredLinks, layoutNodesById, releaseId])
  const hoveredPeerNodeId = hoveredPortal
    ? (hoveredPortal.type === 'source' ? hoveredPortal.targetId : hoveredPortal.sourceId)
    : null
  const setPortalHover = (portalKey) => {
    setHoveredPortalKey((prev) => (prev === portalKey ? prev : portalKey))
  }
  const clearPortalHover = (portalKey) => {
    setHoveredPortalKey((prev) => (prev === portalKey ? null : prev))
  }
  // Dynamic fade radius based on occupied rings (+buffer), rendered across full canvas
  // so the transition reaches black without a hard circle edge.
  const backgroundRadius = canvas.maxRadius + TREE_CONFIG.levelSpacing * 2

  return (
    <svg
      ref={canvasRef}
      width={canvas.width}
      height={canvas.height}
      viewBox={`0 0 ${canvas.width} ${canvas.height}`}
      className="skill-tree-canvas"
      onClick={onCanvasClick}
      onDoubleClick={onCanvasDoubleClick}
      onPointerLeave={() => setHoveredPortalKey(null)}
    >
      <defs>
        <radialGradient
          id="nodeHalo"
          gradientUnits="userSpaceOnUse"
          colorInterpolation="linearRGB"
          cx={canvas.origin.x}
          cy={canvas.origin.y}
          r={backgroundRadius}
        >
          <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.22" />
          <stop offset="80%" stopColor="#60a5fa" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#60a5fa" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect x="0" y="0" width={canvas.width} height={canvas.height} fill="url(#nodeHalo)" />

      <g className="skill-tree-canvas__content">
        <Tooltip
          withArrow
          multiline
          position="left"
          offset={14}
          openDelay={80}
          closeDelay={40}
          transitionProps={{ transition: 'fade', duration: 120 }}
          classNames={{ tooltip: 'skill-node-tooltip', arrow: 'skill-node-tooltip__arrow' }}
          label={<CenterIconTooltipContent systemName={systemName} release={activeRelease} draftRelease={draftRelease} />}
        >
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
            <circle r={centerIconSize / 2 + CENTER_ICON_HIT_PADDING} className="skill-tree-center-icon__hit-area" />
          </g>
        </Tooltip>

        <g>
          {filteredSegmentSeparators.map((separator) => (
            <path
              key={separator.id}
              d={separator.path}
              data-segment-left={separator.leftSegmentId ?? ''}
              data-segment-right={separator.rightSegmentId ?? ''}
              fill="none"
              stroke="#000000"
              strokeOpacity="1"
              strokeWidth="9"
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
            stroke="#000000"
            strokeWidth="9"
            strokeOpacity="1"
            strokeLinecap="round"
            fill="none"
          />
        ))}

        {[...filteredLinks.filter((link) => link.sourceDepth > 0 && link.linkKind !== 'ring')]
          .sort((a, b) => getConnectionZOrder(a, layoutNodesById, releaseId) - getConnectionZOrder(b, layoutNodesById, releaseId))
          .map((link) => {
          const statusStyle = getLinkStatusStyle(link)

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
          [...filteredLinks.filter((link) => link.sourceDepth > 0 && link.linkKind !== 'ring')]
            .sort((a, b) => getConnectionZOrder(a, layoutNodesById, releaseId) - getConnectionZOrder(b, layoutNodesById, releaseId))
            .map((link) => {
              const statusStyle = getLinkStatusStyle(link)
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

        {splitDots.map((dot) => (
          <circle
            key={`split-dot-${dot.key}`}
            cx={dot.x}
            cy={dot.y}
            r={9}
            fill={dot.fill}
            fillOpacity={1}
            style={{ pointerEvents: 'none' }}
          />
        ))}

        {/* ── Dependency portals (spokes) — rendered before nodes so spokes sit behind circles/rectangles ── */}
        {visibleDependencyPortals.map((portal) => {
          const isPortalSelected = portal.key === selectedPortalKey
          const portalBaseKey = portal.key.replace(/:(?:source|target)$/, '')
          const hoveredBaseKey = hoveredPortalKey ? hoveredPortalKey.replace(/:(?:source|target)$/, '') : null
          const isPeerHovered = !isPortalSelected && hoveredBaseKey === portalBaseKey && hoveredPortalKey !== portal.key
          const portalClassName = getPortalClassName(portal, isPortalSelected, isPeerHovered)
          const portalView = getPortalViewModel({
            portal,
            nodeX: layoutNodesById.get(portal.nodeId)?.x ?? portal.x,
            nodeY: layoutNodesById.get(portal.nodeId)?.y ?? portal.y,
            nodeSize,
            minimalNodeSize,
            labelMode,
            currentZoomScale,
          })
          const portalHoverHandlers = {
            onPointerEnter: () => setPortalHover(portal.key),
            onPointerMove: () => setPortalHover(portal.key),
          }

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
                data-portal-key={portal.key}
                data-portal-node-id={portal.nodeId}
                data-portal-source-id={portal.sourceId}
                data-portal-target-id={portal.targetId}
                data-portal-type={portal.type}
                data-portal-angle={portal.angle}
                data-portal-orbit-ratio={portalView.orbitRatio}
                data-portal-label={portal.otherLabel ?? ''}
                transform={portalView.groupTransform}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  if (portal.isInteractive) {
                    onSelectPortal(portal)
                  }
                }}
                {...portalHoverHandlers}
                onPointerLeave={() => clearPortalHover(portal.key)}
              >
                {/* wide, invisible spoke hit-path for forgiving hover */}
                <path
                  d={portalView.spokeLinePath}
                  className="skill-tree-portal__hoverline"
                  style={{
                    strokeWidth: portalView.portalHoverStrokeWidth,
                    display: portalView.showSpoke ? '' : 'none',
                  }}
                  {...portalHoverHandlers}
                />
                {/* base spoke line */}
                <path
                  d={portalView.spokeLinePath}
                  className={`skill-tree-portal__spoke skill-tree-portal__spoke--${portal.type}`}
                  style={{ display: portalView.showSpoke ? '' : 'none' }}
                  {...portalHoverHandlers}
                />
                {/* directional chevrons overlay (Method 2: compound path) */}
                <path
                  d={portalView.spokeChevronD}
                  className={`skill-tree-portal__chevrons skill-tree-portal__chevrons--${portal.type}`}
                  style={{ display: portalView.showSpoke && portalView.spokeChevronD ? '' : 'none' }}
                />
                {/* socket/plug icon at spoke tip:
                     source = requires (Buchse, inward-facing)
                     target = enables (Stecker, outward-facing) */}
                <path
                  className={`skill-tree-portal__ring skill-tree-portal__ring--${portal.type}`}
                  d={portalView.ringPath}
                  transform={portalView.ringTransform}
                  {...portalHoverHandlers}
                />
                {/* invisible hit area (larger than ring for easy clicking) */}
                <ellipse
                  className="skill-tree-portal__hit"
                  rx={portalView.portalHitWidth}
                  ry={portalView.portalHitHeight}
                  cx={portalView.hitCx}
                  cy={portalView.hitCy}
                  {...portalHoverHandlers}
                />
                {/* label inside the portal symbol at spoke tip */}
                <text
                  className="skill-tree-portal__label"
                  x={portalView.hitCx}
                  y={portalView.hitCy}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  style={{ display: portalView.showLabel ? '' : 'none' }}
                  {...portalHoverHandlers}
                >
                  {portalView.labelName}
                </text>
              </g>
            </Tooltip>
          )
        })}

        {renderedNodes.map((node) => {
          const visibilityMode = nodeVisibilityModeById.get(node.id) ?? 'full'
          const renderNodeSize = visibilityMode === 'minimal' ? minimalNodeSize : nodeSize
          const isNodeSelected = node.id === selectedNodeId || selectedNodeIds.includes(node.id)

          return (
            <SkillTreeNode
              key={node.id}
              node={node}
              nodeSize={renderNodeSize}
              displayMode={visibilityMode}
              labelMode={labelMode}
              zoomScale={currentZoomScale}
              isSelected={isNodeSelected}
              isPortalPeerHovered={hoveredPeerNodeId === node.id}
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

// Memoize canvas to prevent unnecessary re-renders during zoom/pan
export default memo(SkillTreeCanvas)
