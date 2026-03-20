import { Paper, Text } from '@mantine/core'
import { STATUS_STYLES } from './config'

export function SkillNode({ node, nodeSize, isSelected, onSelect }) {
  const statusStyles = STATUS_STYLES[node.status] ?? STATUS_STYLES.später
  const selectedStyles = isSelected
    ? 'border-cyan-200/90 ring-2 ring-cyan-300 shadow-[0_0_28px_#22d3ee]'
    : ''

  return (
    <foreignObject
      x={node.x - nodeSize / 2}
      y={node.y - nodeSize / 2}
      width={nodeSize}
      height={nodeSize}
    >
      <div
        xmlns="http://www.w3.org/1999/xhtml"
        className="h-full w-full p-1"
        onClick={(event) => event.stopPropagation()}
      >
        <Paper
          component="button"
          type="button"
          onClick={() => onSelect(node.id)}
          className={`h-full w-full rounded-full border border-slate-700/80 bg-slate-900/95 ring-1 transition-all ${statusStyles.ring} ${statusStyles.glow} ${selectedStyles}`}
        >
          <div className="flex h-full items-center justify-center p-2 text-center">
            <Text className="max-w-[88px] text-[13px] font-semibold uppercase tracking-wide text-slate-100">
              {node.label}
            </Text>
            <Text className={`text-[10px] font-medium uppercase ${statusStyles.badge}`}>
              {node.status}
            </Text>
          </div>
        </Paper>
      </div>
    </foreignObject>
  )
}
