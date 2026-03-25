import { Text } from '@mantine/core'
import { renderMarkdownToHtml } from '../utils/markdown'

const EMPTY_NOTE = 'Keine Release Note hinterlegt.'

export function MarkdownTooltipContent({ title, markdown }) {
  const noteHtml = renderMarkdownToHtml(markdown)

  return (
    <div>
      <Text className="skill-node-tooltip__title">{title}</Text>
      <div
        className="skill-node-tooltip__note skill-node-tooltip__note--markdown"
        dangerouslySetInnerHTML={{ __html: noteHtml || `<p>${EMPTY_NOTE}</p>` }}
      />
    </div>
  )
}

export default MarkdownTooltipContent