import { Paper, Text } from '@mantine/core'
import { STATUS_STYLES } from './config'

export function SkillNode({ node, nodeSize, isSelected, onSelect }) {
  const statusStyles = STATUS_STYLES[node.status] ?? STATUS_STYLES.später

  return (
    <foreignObject
      x={node.x - nodeSize / 2}
      y={node.y - nodeSize / 2}
      width={nodeSize}
      height={nodeSize}
    >
      <div
        xmlns="http://www.w3.org/1999/xhtml"
        className="skill-node-foreign"
        onClick={(event) => event.stopPropagation()}
      >
        <Paper
          component="button"
          type="button"
          onClick={() => onSelect(node.id)}
          className="skill-node-button"
          radius="xl"
          withBorder
          style={{
            borderColor: isSelected ? '#67e8f9' : 'rgba(71, 85, 105, 0.8)',
            boxShadow: isSelected ? '0 0 28px rgba(34, 211, 238, 0.65)' : statusStyles.glow,
            outline: `1px solid ${statusStyles.ring}`,
          }}
        >
          <div className="skill-node-button__content">
            <Text className="skill-node-button__label">
              {node.label}
            </Text>
            <Text className="skill-node-button__status" style={{ color: statusStyles.badge }}>
              {node.status}
            </Text>
          </div>
        </Paper>
      </div>
    </foreignObject>
  )
}
