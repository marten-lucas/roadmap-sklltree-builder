import { useMemo, useState } from 'react'
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch'
import { TREE_CONFIG } from './config'
import { initialData } from './data'
import { InspectorPanel } from './InspectorPanel'
import { calculateRadialSkillTree } from './layout'
import { SkillNode } from './SkillNode'
import { findNodeById, updateNodeData as updateNodeDataInTree, getNodeLevelInfo, updateNodeLevel } from './treeData'

export function SkillTree() {
  const [roadmapData, setRoadmapData] = useState(initialData)
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const centerSize = TREE_CONFIG.nodeSize * 2

  const { nodes, links, canvas } = useMemo(
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
                onSelect={setSelectedNodeId}
              />
            ))}
          </svg>
        </TransformComponent>
      </TransformWrapper>

      <InspectorPanel
        selectedNode={selectedNode}
        currentLevel={levelInfo.nodeLevel}
        onClose={() => setSelectedNodeId(null)}
        onLabelChange={handleLabelChange}
        onStatusChange={handleStatusChange}
        onLevelChange={handleLevelChange}
        minLevel={levelInfo.minLevel}
        maxLevel={levelInfo.maxLevel}
      />
    </main>
  )
}
