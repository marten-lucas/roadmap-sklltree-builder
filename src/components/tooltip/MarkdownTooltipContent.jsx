import { Text } from '@mantine/core'
import { renderScopeLabelsMarkup } from '../utils/scopeDisplay'
import { renderMarkdownToHtml } from '../utils/markdown'

const EMPTY_NOTE = 'Keine Release Note hinterlegt.'

export function MarkdownTooltipContent({ title, markdown, scopeLabels = [] }) {
  const noteHtml = renderMarkdownToHtml(markdown)
  const scopeHtml = renderScopeLabelsMarkup(scopeLabels)

  return (
    <div>
      <Text className="skill-node-tooltip__title">{title}</Text>
      <div
        className="skill-node-tooltip__note skill-node-tooltip__note--markdown"
        dangerouslySetInnerHTML={{ __html: noteHtml || `<p>${EMPTY_NOTE}</p>` }}
      />
      {scopeHtml && (
        <div
          className="skill-node-tooltip__scopes"
          aria-label="Scopes"
          dangerouslySetInnerHTML={{ __html: scopeHtml }}
        />
      )}
    </div>
  )
}

export default MarkdownTooltipContent