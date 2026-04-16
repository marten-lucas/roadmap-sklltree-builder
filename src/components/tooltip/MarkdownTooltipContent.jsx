import { Text } from '@mantine/core'
import { renderScopeLabelsMarkup } from '../utils/scopeDisplay'
import { renderMarkdownToHtml } from '../utils/markdown'
import { EFFORT_SIZE_LABELS, BENEFIT_SIZE_LABELS, resolveStoryPoints } from '../utils/effortBenefit'
import { STATUS_STYLES } from '../config'
import { getExplicitLevelLabel, getLevelDisplayLabel } from '../utils/treeData'

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

const LevelTabBar = ({ levels, activeIndex, onTabChange }) => (
  <div className="skill-node-level-tab-bar">
    {levels.map((level, i) => {
      const statusKey = level.status ?? 'later'
      const dotColor = STATUS_STYLES[statusKey]?.ringBand ?? STATUS_STYLES.later.ringBand
      const levelLabel = getLevelDisplayLabel(level?.label, i)
      const levelName = getExplicitLevelLabel(level?.label)
      return (
        <button
          key={level.id ?? i}
          type="button"
          className={i === activeIndex ? 'skill-node-level-tab skill-node-level-tab--active' : 'skill-node-level-tab'}
          onClick={(e) => { e.stopPropagation(); onTabChange(i) }}
          title={levelLabel}
          aria-label={levelLabel}
        >
          <span className="skill-node-level-tab__dot" style={{ background: dotColor }} />
          <span className="skill-node-level-tab__badge">{`Level ${i + 1}`}</span>
          {levelName ? <span className="skill-node-level-tab__name">{levelName}</span> : null}
        </button>
      )
    })}
  </div>
)

export function MarkdownTooltipContent({ title, markdown, scopeLabels = [], effort, benefit, storyPointMap, levels, activeLevelIndex = 0, onTabChange }) {
  const multiLevel = Array.isArray(levels) && levels.length > 1
  const activeLevel = Array.isArray(levels) && levels.length > 0 ? (levels[activeLevelIndex] ?? levels[0]) : null
  const resolvedMarkdown = activeLevel ? activeLevel.releaseNote : markdown
  const resolvedScopeLabels = activeLevel ? (activeLevel.scopeLabels ?? []) : scopeLabels

  const noteHtml = renderMarkdownToHtml(resolvedMarkdown)
  const scopeHtml = renderScopeLabelsMarkup(resolvedScopeLabels)

  return (
    <div>
      {title && <Text className="skill-node-tooltip__title">{title}</Text>}
      {multiLevel && <LevelTabBar levels={levels} activeIndex={activeLevelIndex} onTabChange={onTabChange ?? (() => {})} />}
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