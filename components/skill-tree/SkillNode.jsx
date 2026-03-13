import { Card, CardBody } from '@heroui/react'
import { STATUS_STYLES } from './config'

export function SkillNode({ node, nodeSize }) {
  const statusStyles = STATUS_STYLES[node.status] ?? STATUS_STYLES.später

  return (
    <foreignObject
      x={node.x - nodeSize / 2}
      y={node.y - nodeSize / 2}
      width={nodeSize}
      height={nodeSize}
    >
      <div xmlns="http://www.w3.org/1999/xhtml" className="h-full w-full p-1">
        <Card
          isBlurred
          className={`h-full w-full rounded-full border border-slate-700/80 bg-slate-900/95 ring-1 ${statusStyles.ring} ${statusStyles.glow}`}
        >
          <CardBody className="flex h-full items-center justify-center p-2 text-center">
            <span className="max-w-[88px] text-[13px] font-semibold uppercase tracking-wide text-slate-100">
              {node.label}
            </span>
            <span className={`text-[10px] font-medium uppercase ${statusStyles.badge}`}>
              {node.status}
            </span>
          </CardBody>
        </Card>
      </div>
    </foreignObject>
  )
}
