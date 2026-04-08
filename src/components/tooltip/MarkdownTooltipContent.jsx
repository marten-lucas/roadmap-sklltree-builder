import { Text } from '@mantine/core'
import { renderScopeLabelsMarkup } from '../utils/scopeDisplay'
import { renderMarkdownToHtml } from '../utils/markdown'
import { EFFORT_SIZE_LABELS, BENEFIT_SIZE_LABELS, resolveStoryPoints } from '../utils/effortBenefit'

const EMPTY_NOTE = 'Keine Release Note hinterlegt.'

const EffortBenefitChips = ({ effort, benefit, storyPointMap }) => {
  const hasEffort = effort && effort.size !== 'unclear'
  const hasBenefit = benefit && benefit.size !== 'unclear'

  if (!hasEffort && !hasBenefit) return null

  const spValue = hasEffort ? resolveStoryPoints({ effort }, storyPointMap) : null

  return (
    <div className="skill-node-tooltip__chips" aria-label="Effort &amp; Benefit">
      {hasEffort && (
        <span className="skill-node-chip skill-node-chip--effort">
          ⚡ {EFFORT_SIZE_LABELS[effort.size] ?? effort.size}{spValue != null ? ` (${spValue} SP)` : ''}
        </span>
      )}
      {hasBenefit && (
        <span className="skill-node-chip skill-node-chip--benefit">
          ★ {BENEFIT_SIZE_LABELS[benefit.size] ?? benefit.size}
        </span>
      )}
    </div>
  )
}

export function MarkdownTooltipContent({ title, markdown, scopeLabels = [], effort, benefit, storyPointMap }) {
  const noteHtml = renderMarkdownToHtml(markdown)
  const scopeHtml = renderScopeLabelsMarkup(scopeLabels)

  return (
    <div>
      <Text className="skill-node-tooltip__title">{title}</Text>
      <EffortBenefitChips effort={effort} benefit={benefit} storyPointMap={storyPointMap} />
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