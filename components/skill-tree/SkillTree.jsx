import { useMemo, useRef, useState } from 'react'
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch'
import { TREE_CONFIG } from './config'
import { initialData } from './data'
import { InspectorPanel } from './InspectorPanel'
import { calculateRadialSkillTree } from './layout'
import { SkillNode } from './SkillNode'
import {
  addChildNode,
  addRootNodeNear,
  findNodeById,
  getNodeLevelInfo,
  updateNodeData as updateNodeDataInTree,
  updateNodeLevel,
  updateNodeSegment,
} from './treeData'

export function SkillTree() {
  const [roadmapData, setRoadmapData] = useState(initialData)
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [hoveredNodeId, setHoveredNodeId] = useState(null)
  const hoverLeaveTimerRef = useRef(null)
  const centerSize = TREE_CONFIG.nodeSize * 2
  const addControlOffset = TREE_CONFIG.nodeSize * 0.82

  const { nodes, links, segments, canvas } = useMemo(
    () => calculateRadialSkillTree(roadmapData, TREE_CONFIG),
    [roadmapData],
  )

  const selectedNode = useMemo(
    () => findNodeById(roadmapData, selectedNodeId),
    [roadmapData, selectedNodeId],
  )

  const levelInfo = useMemo(() => {
    if (!selectedNodeId) return { nodeLevel: 1, minLevel: 1, maxLevel: 2 }
    const info = getNodeLevelInfo(roadmapData, selectedNodeId)
    return {
      nodeLevel: info.nodeLevel,
      minLevel: info.parentLevel + 1,
      maxLevel: info.maxLevel + 1, // Always allow +1 above highest current level
    }
  }, [roadmapData, selectedNodeId])

  const hoveredNode = useMemo(
    () => nodes.find((node) => node.id === hoveredNodeId) ?? null,
    [nodes, hoveredNodeId],
  )

  const hoveredControlGeometry = useMemo(() => {
    if (!hoveredNode) {
      return null
    }

    const dx = hoveredNode.x - canvas.origin.x
    const dy = hoveredNode.y - canvas.origin.y
    const length = Math.hypot(dx, dy) || 1
    const radial = { x: dx / length, y: dy / length }
    const tangent = { x: -radial.y, y: radial.x }

    return {
      child: {
        x: hoveredNode.x + radial.x * addControlOffset,
        y: hoveredNode.y + radial.y * addControlOffset,
      },
      left: {
        x: hoveredNode.x - tangent.x * addControlOffset,
        y: hoveredNode.y - tangent.y * addControlOffset,
      },
      right: {
        x: hoveredNode.x + tangent.x * addControlOffset,
        y: hoveredNode.y + tangent.y * addControlOffset,
      },
    }
  }, [hoveredNode, canvas.origin.x, canvas.origin.y, addControlOffset])

  const clearHoverLeaveTimer = () => {
    if (hoverLeaveTimerRef.current) {
      clearTimeout(hoverLeaveTimerRef.current)
      hoverLeaveTimerRef.current = null
    }
  }

  const handleNodeHoverStart = (nodeId) => {
    clearHoverLeaveTimer()

    if (nodeId !== selectedNodeId) {
      setHoveredNodeId(null)
      return
    }

    setHoveredNodeId(nodeId)
  }

  const handleNodeHoverEnd = () => {
    clearHoverLeaveTimer()
    hoverLeaveTimerRef.current = setTimeout(() => {
      setHoveredNodeId(null)
      hoverLeaveTimerRef.current = null
    }, 120)
  }

  const handleAddChild = (parentId) => {
    setRoadmapData((previousData) => addChildNode(previousData, parentId))
  }

  const handleAddRootNear = (anchorRootId, side) => {
    setRoadmapData((previousData) => addRootNodeNear(previousData, anchorRootId, side))
  }

  const handleSelectNode = (nodeId) => {
    setSelectedNodeId(nodeId)
    setHoveredNodeId(null)
  }

  const updateNodeData = (id, newLabel, newStatus) => {
    setRoadmapData((previousData) => updateNodeDataInTree(previousData, id, newLabel, newStatus))
  }

  const handleLabelChange = (newLabel) => {
    if (!selectedNodeId || !selectedNode) {
      return
    }

    updateNodeData(selectedNodeId, newLabel, selectedNode.status)
  }

  const handleStatusChange = (newStatus) => {
    if (!selectedNodeId || !selectedNode) {
      return
    }

    updateNodeData(selectedNodeId, selectedNode.label, newStatus)
  }

  const handleLevelChange = (newLevel) => {
    if (!selectedNodeId) {
      return
    }

    setRoadmapData((previousData) => updateNodeLevel(previousData, selectedNodeId, newLevel))
  }

  return (
    <main className="relative h-screen w-full overflow-hidden bg-slate-950 text-slate-100">
      <TransformWrapper
        minScale={0.2}
        maxScale={2.2}
        initialScale={0.7}
        wheel={{ step: 0.12 }}
        centerOnInit
      >
        <TransformComponent
          wrapperClass="!h-screen !w-full"
          contentClass="!h-auto !w-auto"
        >
          <svg
            width={canvas.width}
            height={canvas.height}
            viewBox={`0 0 ${canvas.width} ${canvas.height}`}
            className="bg-[radial-gradient(circle_at_50%_60%,rgba(30,41,59,0.45),rgba(2,6,23,1)_55%)]"
          >
            <defs>
              <radialGradient id="nodeHalo" cx="50%" cy="50%" r="60%">
                <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#020617" stopOpacity="0" />
              </radialGradient>
            </defs>

            <circle cx={canvas.origin.x} cy={canvas.origin.y} r={canvas.maxRadius + 160} fill="url(#nodeHalo)" />

            <image
              href="/Kyana_Visual_final.svg"
              x={canvas.origin.x - centerSize / 2}
              y={canvas.origin.y - centerSize / 2}
              width={centerSize}
              height={centerSize}
              preserveAspectRatio="xMidYMid meet"
              opacity="0.95"
            />

            <g>
              {segments.separators.map((separator) => (
                <path
                  key={separator.id}
                  d={separator.path}
                  className="fill-none"
                  stroke="#1e3a8a"
                  strokeOpacity="0.7"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              ))}
            </g>

            {segments.labels.map((segmentLabel) => (
              <text
                key={segmentLabel.id}
                x={segmentLabel.x}
                y={segmentLabel.y}
                textAnchor="middle"
                transform={`rotate(${segmentLabel.rotation} ${segmentLabel.x} ${segmentLabel.y})`}
                className="select-none fill-slate-400 text-[12px] font-semibold uppercase tracking-[0.18em]"
              >
                {segmentLabel.text}
              </text>
            ))}

            {links.filter((link) => link.sourceDepth > 0).map((link) => (
              <path
                key={link.id}
                d={link.path}
                className="fill-none stroke-slate-700"
                strokeWidth="4"
                strokeLinecap="round"
              />
            ))}

            {nodes.map((node) => (
              <SkillNode
                key={node.id}
                node={node}
                nodeSize={TREE_CONFIG.nodeSize}
                isSelected={node.id === selectedNodeId}
                onSelect={handleSelectNode}
                onHoverStart={node.id === selectedNodeId ? handleNodeHoverStart : undefined}
                onHoverEnd={node.id === selectedNodeId ? handleNodeHoverEnd : undefined}
              />
            ))}

            {hoveredNode && hoveredControlGeometry && (
              <g
                onMouseEnter={clearHoverLeaveTimer}
                onMouseLeave={handleNodeHoverEnd}
              >
                <g
                  transform={`translate(${hoveredControlGeometry.child.x}, ${hoveredControlGeometry.child.y})`}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    handleAddChild(hoveredNode.id)
                  }}
                  className="cursor-pointer"
                >
                  <circle r="18" className="fill-slate-900/95 stroke-cyan-300" strokeWidth="2.5" />
                  <text
                    x="0"
                    y="1"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="select-none fill-cyan-200 text-[24px] font-semibold"
                  >
                    +
                  </text>
                </g>

                {hoveredNode.depth === 1 && hoveredNode.level === 1 && (
                  <g>
                    <g
                      transform={`translate(${hoveredControlGeometry.left.x}, ${hoveredControlGeometry.left.y})`}
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation()
                        handleAddRootNear(hoveredNode.id, 'left')
                      }}
                      className="cursor-pointer"
                    >
                      <circle r="18" className="fill-slate-900/95 stroke-blue-300" strokeWidth="2.5" />
                      <text
                        x="0"
                        y="1"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="select-none fill-blue-200 text-[24px] font-semibold"
                      >
                        +
                      </text>
                    </g>

                    <g
                      transform={`translate(${hoveredControlGeometry.right.x}, ${hoveredControlGeometry.right.y})`}
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation()
                        handleAddRootNear(hoveredNode.id, 'right')
                      }}
                      className="cursor-pointer"
                    >
                      <circle r="18" className="fill-slate-900/95 stroke-blue-300" strokeWidth="2.5" />
                      <text
                        x="0"
                        y="1"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="select-none fill-blue-200 text-[24px] font-semibold"
                      >
                        +
                      </text>
                    </g>
                  </g>
                )}
              </g>
            )}
          </svg>
        </TransformComponent>
      </TransformWrapper>

      <InspectorPanel
        selectedNode={selectedNode}
        currentLevel={levelInfo.nodeLevel}
        onClose={() => {
          setSelectedNodeId(null)
          setHoveredNodeId(null)
        }}
        onLabelChange={handleLabelChange}
        onStatusChange={handleStatusChange}
        onLevelChange={handleLevelChange}
        minLevel={levelInfo.minLevel}
        maxLevel={levelInfo.maxLevel}
        segments={roadmapData.segments ?? []}
        onSegmentChange={(newSegmentId) => {
          setRoadmapData((prev) => updateNodeSegment(prev, selectedNodeId, newSegmentId))
        }}
      />
    </main>
  )
}
