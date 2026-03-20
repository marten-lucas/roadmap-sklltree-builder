import { useMemo, useState } from 'react'
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch'
import { TREE_CONFIG } from './config'
import { initialData } from './data'
import { InspectorPanel } from './InspectorPanel'
import { solveSkillTreeLayout } from './layoutSolver'
import { UNASSIGNED_SEGMENT_ID } from './layoutShared'
import { SegmentPanel } from './SegmentPanel'
import { SkillNode } from './SkillNode'
import {
  getLevelOptionsForNode,
  getSegmentOptionsForNode,
  validateNodeLevelChange,
  validateNodeSegmentChange,
} from './treeValidation'
import {
  addChildNodeWithResult,
  addInitialRootNodeWithResult,
  addInitialSegmentWithResult,
  addRootNodeNearWithResult,
  addSegmentNearWithResult,
  deleteSegment,
  deleteNodeBranch,
  deleteNodeOnly,
  findNodeById,
  getNodeLevelInfo,
  updateNodeData as updateNodeDataInTree,
  updateSegmentLabel,
} from './treeData'

export function SkillTree() {
  const [roadmapData, setRoadmapData] = useState(initialData)
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [selectedSegmentId, setSelectedSegmentId] = useState(null)
  const centerSize = TREE_CONFIG.nodeSize * 2
  const addControlOffset = TREE_CONFIG.nodeSize * 0.82

  const { layout, diagnostics } = useMemo(
    () => solveSkillTreeLayout(roadmapData, TREE_CONFIG),
    [roadmapData],
  )
  const { nodes, links, segments, canvas } = layout

  const selectedNode = useMemo(
    () => findNodeById(roadmapData, selectedNodeId),
    [roadmapData, selectedNodeId],
  )

  const selectedSegment = useMemo(
    () => (roadmapData.segments ?? []).find((segment) => segment.id === selectedSegmentId) ?? null,
    [roadmapData, selectedSegmentId],
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

  const selectedNodeLevelOptions = useMemo(
    () => (selectedNodeId ? getLevelOptionsForNode(roadmapData, selectedNodeId, TREE_CONFIG) : []),
    [roadmapData, selectedNodeId],
  )

  const selectedNodeSegmentOptions = useMemo(
    () => (selectedNodeId ? getSegmentOptionsForNode(roadmapData, selectedNodeId, TREE_CONFIG) : []),
    [roadmapData, selectedNodeId],
  )

  const selectedNodeValidationMessage = useMemo(() => {
    if (!selectedNodeId || diagnostics.isValid) {
      return null
    }

    const relevantIssue = diagnostics.issues.find((issue) => issue.nodeIds?.includes(selectedNodeId))

    return relevantIssue?.message ?? null
  }, [diagnostics, selectedNodeId])

  const selectedLayoutNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  )

  const selectedSegmentLabel = useMemo(
    () => segments.labels.find((segmentLabel) => segmentLabel.segmentId === selectedSegmentId) ?? null,
    [segments.labels, selectedSegmentId],
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

  const selectedSegmentControlGeometry = useMemo(() => {
    if (!selectedSegmentLabel) {
      return null
    }

    const baselineRadians = (selectedSegmentLabel.rotation * Math.PI) / 180
    const baseline = {
      x: Math.cos(baselineRadians),
      y: Math.sin(baselineRadians),
    }
    const labelWidth = Math.max(88, selectedSegmentLabel.text.length * 10)
    const controlOffset = labelWidth / 2 + 28

    return {
      left: {
        x: selectedSegmentLabel.x - baseline.x * controlOffset,
        y: selectedSegmentLabel.y - baseline.y * controlOffset,
      },
      right: {
        x: selectedSegmentLabel.x + baseline.x * controlOffset,
        y: selectedSegmentLabel.y + baseline.y * controlOffset,
      },
    }
  }, [selectedSegmentLabel])

  const emptyStateAddControl = useMemo(() => {
    if (nodes.length > 0) {
      return null
    }

    return {
      x: canvas.origin.x,
      y: canvas.origin.y - canvas.maxRadius,
    }
  }, [nodes.length, canvas.origin.x, canvas.origin.y, canvas.maxRadius])

  const emptySegmentAddControl = useMemo(() => {
    if ((roadmapData.segments ?? []).length > 0) {
      return null
    }

    const separatorInnerRadius = Math.max(TREE_CONFIG.nodeSize * 0.9, TREE_CONFIG.levelSpacing * 0.9)
    const segmentLabelRadius = Math.max(
      canvas.maxRadius + TREE_CONFIG.nodeSize * 0.95,
      separatorInnerRadius + TREE_CONFIG.nodeSize * 0.7,
    )

    return {
      x: canvas.origin.x,
      y: canvas.origin.y - segmentLabelRadius,
    }
  }, [roadmapData.segments, canvas.origin.x, canvas.origin.y, canvas.maxRadius])

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

  const handleAddSegmentNear = (anchorSegmentId, side) => {
    let createdSegmentId = null

    setRoadmapData((previousData) => {
      const result = addSegmentNearWithResult(previousData, anchorSegmentId, side)
      createdSegmentId = result.createdSegmentId
      return result.tree
    })

    if (createdSegmentId) {
      setSelectedNodeId(null)
      setSelectedSegmentId(createdSegmentId)
    }
  }

  const handleAddInitialSegment = () => {
    let createdSegmentId = null

    setRoadmapData((previousData) => {
      const result = addInitialSegmentWithResult(previousData)
      createdSegmentId = result.createdSegmentId
      return result.tree
    })

    if (createdSegmentId) {
      setSelectedNodeId(null)
      setSelectedSegmentId(createdSegmentId)
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
    setSelectedSegmentId(null)
  }

  const handleSelectSegment = (segmentId) => {
    setSelectedSegmentId(segmentId)
    setSelectedNodeId(null)
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

    setRoadmapData((previousData) => {
      const validation = validateNodeLevelChange(previousData, selectedNodeId, newLevel, TREE_CONFIG)
      return validation.isAllowed ? validation.tree : previousData
    })
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

  const handleSegmentLabelChange = (newLabel) => {
    if (!selectedSegmentId) {
      return
    }

    setRoadmapData((previousData) => updateSegmentLabel(previousData, selectedSegmentId, newLabel))
  }

  const handleDeleteSegment = () => {
    if (!selectedSegmentId) {
      return
    }

    setRoadmapData((previousData) => deleteSegment(previousData, selectedSegmentId))
    setSelectedSegmentId(null)
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
            onClick={() => {
              setSelectedNodeId(null)
              setSelectedSegmentId(null)
            }}
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

            {segments.labels.map((segmentLabel) => {
              const isSelected = segmentLabel.segmentId === selectedSegmentId
              const labelWidth = Math.max(88, segmentLabel.text.length * 10)

              return (
                <g
                  key={segmentLabel.id}
                  transform={`translate(${segmentLabel.x} ${segmentLabel.y}) rotate(${segmentLabel.rotation})`}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    handleSelectSegment(segmentLabel.segmentId)
                  }}
                  className="cursor-pointer"
                >
                  <rect
                    x={-(labelWidth / 2) - 10}
                    y={-12}
                    width={labelWidth + 20}
                    height={24}
                    rx={12}
                    className={isSelected ? 'fill-cyan-400/10 stroke-cyan-300/60' : 'fill-transparent stroke-transparent'}
                    strokeWidth="1.5"
                  />
                  <text
                    x="0"
                    y="1"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className={isSelected ? 'select-none fill-cyan-200 text-[12px] font-semibold uppercase tracking-[0.18em]' : 'select-none fill-slate-400 text-[12px] font-semibold uppercase tracking-[0.18em]'}
                  >
                    {segmentLabel.text}
                  </text>
                </g>
              )
            })}

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

            {emptySegmentAddControl && (
              <g
                transform={`translate(${emptySegmentAddControl.x}, ${emptySegmentAddControl.y})`}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  handleAddInitialSegment()
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
            )}

            {selectedSegmentLabel && selectedSegmentControlGeometry && (
              <g>
                <g
                  transform={`translate(${selectedSegmentControlGeometry.left.x}, ${selectedSegmentControlGeometry.left.y})`}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    handleAddSegmentNear(selectedSegmentLabel.segmentId, 'left')
                  }}
                  className="cursor-pointer"
                >
                  <circle r="16" className="fill-slate-900/95 stroke-cyan-300" strokeWidth="2.5" />
                  <text
                    x="0"
                    y="1"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="select-none fill-cyan-200 text-[22px] font-semibold"
                  >
                    +
                  </text>
                </g>

                <g
                  transform={`translate(${selectedSegmentControlGeometry.right.x}, ${selectedSegmentControlGeometry.right.y})`}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    handleAddSegmentNear(selectedSegmentLabel.segmentId, 'right')
                  }}
                  className="cursor-pointer"
                >
                  <circle r="16" className="fill-slate-900/95 stroke-cyan-300" strokeWidth="2.5" />
                  <text
                    x="0"
                    y="1"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="select-none fill-cyan-200 text-[22px] font-semibold"
                  >
                    +
                  </text>
                </g>
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
        levelOptions={selectedNodeLevelOptions}
        segmentOptions={selectedNodeSegmentOptions}
        validationMessage={selectedNodeValidationMessage}
        onSegmentChange={(nextSegmentKey) => {
          const nextSegmentId = nextSegmentKey === UNASSIGNED_SEGMENT_ID ? null : nextSegmentKey

          setRoadmapData((previousData) => {
            const validation = validateNodeSegmentChange(previousData, selectedNodeId, nextSegmentId, TREE_CONFIG)
            return validation.isAllowed ? validation.tree : previousData
          })
        }}
        onDeleteNodeOnly={handleDeleteNodeOnly}
        onDeleteNodeBranch={handleDeleteNodeBranch}
      />

      <SegmentPanel
        selectedSegment={selectedSegment}
        onClose={() => setSelectedSegmentId(null)}
        onLabelChange={handleSegmentLabelChange}
        onDelete={handleDeleteSegment}
      />
    </main>
  )
}
