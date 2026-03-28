import { TREE_CONFIG, normalizeStatusKey, STATUS_STYLES } from '../config'
import { SkillTreeNode } from '../nodes/SkillTreeNode'
import { MarkdownTooltipContent, Tooltip } from '../tooltip'

const getPortalClassName = (portal, isSelected) => [
  'skill-tree-portal',
  portal.isInteractive ? 'skill-tree-portal--interactive' : '',
  isSelected ? 'skill-tree-portal--selected' : '',
].filter(Boolean).join(' ')

const getPortalChevronPath = (type) => {
  // Open chevrons (< >) for a stronger directional portal identity.
  if (type === 'target') {
    return 'M 8 -9 L -7 0 L 8 9'
  }

  return 'M -8 -9 L 7 0 L -8 9'
}

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
  selectedLayoutNode,
  selectedControlGeometry,
  selectedSegmentLabel,
  selectedSegmentControlGeometry,
  emptyStateAddControl,
  emptySegmentAddControl,
  nodeSize = TREE_CONFIG.nodeSize,
  minimalNodeSize = 36,
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

        {filteredLinks.filter((link) => link.linkKind === 'ring').map((link) => {
          const segmentNode = link.targetId ? layoutNodesById.get(link.targetId) : null
          const nodeStatus = segmentNode ? normalizeStatusKey(segmentNode.status) : 'later'
          const statusStyle = STATUS_STYLES[nodeStatus] ?? STATUS_STYLES.later

          return (
            <path
              key={link.id}
              d={link.path}
              data-link-source-id={link.sourceId ?? ''}
              data-link-target-id={link.targetId ?? ''}
              stroke={statusStyle.linkStroke}
              strokeWidth="4"
              strokeOpacity={statusStyle.linkOpacity}
              strokeLinecap="round"
              fill="none"
            />
          )
        })}

        {filteredLinks.filter((link) => link.sourceDepth > 0 && link.linkKind !== 'ring').map((link) => {
          const childNode = link.targetId ? layoutNodesById.get(link.targetId) : null
          const nodeStatus = childNode ? normalizeStatusKey(childNode.status) : 'later'
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

        {renderedNodes.map((node) => {
          const visibilityMode = nodeVisibilityModeById.get(node.id) ?? 'full'
          const renderNodeSize = visibilityMode === 'minimal' ? minimalNodeSize : nodeSize

          return (
            <SkillTreeNode
              key={node.id}
              node={node}
              nodeSize={renderNodeSize}
              displayMode={visibilityMode}
              isSelected={node.id === selectedNodeId || selectedNodeIds.includes(node.id)}
              scopeOptions={scopeOptions}
              onSelect={onSelectNode}
            />
          )
        })}

        {visibleDependencyPortals.map((portal) => {
          const isPortalSelected = portal.key === selectedPortalKey
          const portalClassName = getPortalClassName(portal, isPortalSelected)
          const chevronPath = getPortalChevronPath(portal.type)
          const portalRotation = portal.rotation ?? 0
          const portalAngle = portal.angle ?? 0
          const portalLabelOffset = TREE_CONFIG.nodeSize * 0.15
          const portalLabelX = -Math.cos((portalAngle * Math.PI) / 180) * portalLabelOffset
          const portalLabelY = -Math.sin((portalAngle * Math.PI) / 180) * portalLabelOffset

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
                <g transform={`rotate(${portalRotation})`}>
                  <circle className="skill-tree-portal__hit" r="26" />
                  <circle className={`skill-tree-portal__halo skill-tree-portal__halo--${portal.type}`} r="17" />
                  <path className={`skill-tree-portal__chevron skill-tree-portal__chevron--${portal.type}`} d={chevronPath} />
                </g>
                <g transform={`translate(${portalLabelX} ${portalLabelY})`}>
                  <text
                    className="skill-tree-portal__label"
                    x="0"
                    y="0"
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    {portal.otherLabel}
                  </text>
                </g>
              </g>
            </Tooltip>
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
              Skill hinzufügen
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
              Segment hinzufügen
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
