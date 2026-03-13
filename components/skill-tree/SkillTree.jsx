import { useMemo } from 'react'
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch'
import { TREE_CONFIG } from './config'
import { initialData } from './data'
import { calculateRadialSkillTree } from './layout'
import { SkillNode } from './SkillNode'

export function SkillTree() {
  const { nodes, links } = useMemo(() => calculateRadialSkillTree(initialData, TREE_CONFIG), [])

  return (
    <main className="h-screen w-full overflow-hidden bg-slate-950 text-slate-100">
      <TransformWrapper
        minScale={0.45}
        maxScale={2.2}
        initialScale={0.7}
        wheel={{ step: 0.12 }}
        centerOnInit
      >
        <TransformComponent
          wrapperClass="!h-screen !w-full"
          contentClass="!h-full !w-full"
        >
          <svg
            width={TREE_CONFIG.svgWidth}
            height={TREE_CONFIG.svgHeight}
            viewBox={`0 0 ${TREE_CONFIG.svgWidth} ${TREE_CONFIG.svgHeight}`}
            className="bg-[radial-gradient(circle_at_50%_60%,rgba(30,41,59,0.45),rgba(2,6,23,1)_55%)]"
          >
            <defs>
              <radialGradient id="nodeHalo" cx="50%" cy="50%" r="60%">
                <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#020617" stopOpacity="0" />
              </radialGradient>
            </defs>

            <circle cx={TREE_CONFIG.origin.x} cy={TREE_CONFIG.origin.y} r="530" fill="url(#nodeHalo)" />

            {links.map((link) => (
              <path
                key={link.id}
                d={link.path}
                className="fill-none stroke-slate-700"
                strokeWidth="4"
                strokeLinecap="round"
              />
            ))}

            {nodes.map((node) => (
              <SkillNode key={node.id} node={node} nodeSize={TREE_CONFIG.nodeSize} />
            ))}
          </svg>
        </TransformComponent>
      </TransformWrapper>
    </main>
  )
}
