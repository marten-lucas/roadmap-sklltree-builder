import { useMemo, useState } from 'react'
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch'
import { TREE_CONFIG } from './config'
import { initialData } from './data'
import { InspectorPanel } from './InspectorPanel'
import { calculateRadialSkillTree } from './layout'
import { SkillNode } from './SkillNode'
import {
  addChildNodeWithResult,
  addInitialRootNodeWithResult,
  addRootNodeNearWithResult,
  deleteNodeBranch,
  deleteNodeOnly,
  findNodeById,
  getNodeLevelInfo,
  updateNodeData as updateNodeDataInTree,
  updateNodeLevel,
  updateNodeSegment,
} from './treeData'

export function SkillTree() {
  const [roadmapData, setRoadmapData] = useState(initialData)
  const [selectedNodeId, setSelectedNodeId] = useState(null)
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

  const selectedLayoutNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  )

  const selectedControlGeometry = useMemo(() => {
    if (!selectedLayoutNode) {
      return null
    }

    const dx = selectedLayoutNode.x - canvas.origin.x
    const dy = selectedLayoutNode.y - canvas.origin.y
    const length = Math.hypot(dx, dy) || 1
    const radial = { x: dx / length, y: dy / length }
    const tangent = { x: -radial.y, y: radial.x }

    return {
      child: {
        x: selectedLayoutNode.x + radial.x * addControlOffset,
        y: selectedLayoutNode.y + radial.y * addControlOffset,
      },
      left: {
        x: selectedLayoutNode.x - tangent.x * addControlOffset,
        y: selectedLayoutNode.y - tangent.y * addControlOffset,
      },
      right: {
        x: selectedLayoutNode.x + tangent.x * addControlOffset,
        y: selectedLayoutNode.y + tangent.y * addControlOffset,
      },
    }
  }, [selectedLayoutNode, canvas.origin.x, canvas.origin.y, addControlOffset])

  const emptyStateAddControl = useMemo(() => {
    if (nodes.length > 0) {
      return null
    }

    return {
      x: canvas.origin.x,
      y: canvas.origin.y - canvas.maxRadius,
    }
  }, [nodes.length, canvas.origin.x, canvas.origin.y, canvas.maxRadius])

  const handleAddChild = (parentId) => {
    let createdNodeId = null

    setRoadmapData((previousData) => {
      const result = addChildNodeWithResult(previousData, parentId)
      createdNodeId = result.createdNodeId
      return result.tree
    })

    if (createdNodeId) {
      setSelectedNodeId(createdNodeId)
    }
  }

  const handleAddRootNear = (anchorRootId, side) => {
    let createdNodeId = null

    setRoadmapData((previousData) => {
      const result = addRootNodeNearWithResult(previousData, anchorRootId, side)
      createdNodeId = result.createdNodeId
      return result.tree
    })

    if (createdNodeId) {
      setSelectedNodeId(createdNodeId)
    }
  }

  const handleAddInitialRoot = () => {
    let createdNodeId = null

    setRoadmapData((previousData) => {
      const result = addInitialRootNodeWithResult(previousData)
      createdNodeId = result.createdNodeId
      return result.tree
    })

    if (createdNodeId) {
      setSelectedNodeId(createdNodeId)
    }
  }

  const handleSelectNode = (nodeId) => {
    setSelectedNodeId(nodeId)
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

  const handleDeleteNodeOnly = () => {
    if (!selectedNodeId) {
      return
    }

    setRoadmapData((previousData) => deleteNodeOnly(previousData, selectedNodeId))
    setSelectedNodeId(null)
  }

  const handleDeleteNodeBranch = () => {
    if (!selectedNodeId) {
      return
    }

    setRoadmapData((previousData) => deleteNodeBranch(previousData, selectedNodeId))
    setSelectedNodeId(null)
  }

  return (
    <main className="relative h-screen w-full overflow-hidden bg-slate-950 text-slate-100">
      <TransformWrapper
        minScale={0.2}
        maxScale={2.2}
        initialScale={0.7}
        wheel={{ step: 0.12 }}
        limitToBounds={false}
        centerOnInit
      >
        <TransformComponent
          wrapperClass="!h-screen !w-full"
          contentClass="!h-auto !w-auto overflow-visible"
        >
          <svg
            width={canvas.width}
            height={canvas.height}
            viewBox={`0 0 ${canvas.width} ${canvas.height}`}
            className="bg-[radial-gradient(circle_at_50%_60%,rgba(30,41,59,0.45),rgba(2,6,23,1)_55%)]"
            onClick={() => setSelectedNodeId(null)}
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
              />
            ))}

            {emptyStateAddControl && (
              <g
                transform={`translate(${emptyStateAddControl.x}, ${emptyStateAddControl.y})`}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  handleAddInitialRoot()
                }}
                className="cursor-pointer"
              >
                <circle r="22" className="fill-slate-900/95 stroke-cyan-300" strokeWidth="2.5" />
                <text
                  x="0"
                  y="1"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="select-none fill-cyan-200 text-[28px] font-semibold"
                >
                  +
                </text>
              </g>
            )}

            {selectedLayoutNode && selectedControlGeometry && (
              <g>
                <g
                  transform={`translate(${selectedControlGeometry.child.x}, ${selectedControlGeometry.child.y})`}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    handleAddChild(selectedLayoutNode.id)
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

                {selectedLayoutNode.depth === 1 && selectedLayoutNode.level === 1 && (
                  <g>
                    <g
                      transform={`translate(${selectedControlGeometry.left.x}, ${selectedControlGeometry.left.y})`}
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation()
                        handleAddRootNear(selectedLayoutNode.id, 'left')
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
                      transform={`translate(${selectedControlGeometry.right.x}, ${selectedControlGeometry.right.y})`}
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation()
                        handleAddRootNear(selectedLayoutNode.id, 'right')
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
        onDeleteNodeOnly={handleDeleteNodeOnly}
        onDeleteNodeBranch={handleDeleteNodeBranch}
      />
    </main>
  )
}
