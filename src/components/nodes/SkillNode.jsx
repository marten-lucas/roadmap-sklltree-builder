import { useState } from 'react'
import { Paper, Text } from '@mantine/core'
import { STATUS_STYLES } from '../config'
import { getDisplayStatusKey, getLevelStatusKeys } from '../utils/nodeStatus'
import { resolveScopeEntries } from '../utils/scopeDisplay'
import { MarkdownTooltipContent, Tooltip } from '../tooltip'
import { EFFORT_SIZE_LABELS, BENEFIT_SIZE_LABELS } from '../utils/effortBenefit'


const getShortName = (node) => {
  const explicitShortName = String(node?.shortName ?? '').trim().toLowerCase().slice(0, 3)
  if (explicitShortName) {
    return explicitShortName
  }

  const letters = String(node?.label ?? '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toLowerCase()
    .slice(0, 3)

  return letters || 'skl'
}

const getTooltipLevel = (node) => {
  const levels = Array.isArray(node?.levels) ? node.levels : []
  const levelStatusKeys = getLevelStatusKeys(node)
  const preferredStatus = getDisplayStatusKey(node)
  const preferredLevel = levels.find((level, index) => levelStatusKeys[index] === preferredStatus && String(level?.releaseNote ?? '').trim())

  if (preferredLevel) {
    return preferredLevel
  }

  return levels.find((level) => String(level?.releaseNote ?? '').trim()) ?? null
}

const getTooltipReleaseNote = (node) => {
  const tooltipLevel = getTooltipLevel(node)
  const releaseNote = String(tooltipLevel?.releaseNote ?? '').trim()

  return releaseNote || 'Keine Release Note hinterlegt.'
}

const buildSegmentConicStyle = (statusKeys, colorGetter) => {
  const segmentCount = Math.max(1, statusKeys.length)
  const slice = 360 / segmentCount
  const gapDegrees = segmentCount > 1 ? Math.min(3.2, slice * 0.16) : 0
  const gradientParts = []

  for (let index = 0; index < segmentCount; index += 1) {
    const key = statusKeys[index] ?? 'later'
    const color = colorGetter(key)
    const start = index * slice
    const end = (index + 1) * slice

    if (gapDegrees > 0) {
      const colorStart = start + gapDegrees / 2
      const colorEnd = end - gapDegrees / 2
      gradientParts.push(`transparent ${start}deg ${colorStart}deg`)
      gradientParts.push(`${color} ${colorStart}deg ${colorEnd}deg`)
      gradientParts.push(`transparent ${colorEnd}deg ${end}deg`)
    } else {
      gradientParts.push(`${color} ${start}deg ${end}deg`)
    }
  }

  return {
    background: `conic-gradient(${gradientParts.join(', ')})`,
  }
}

export function SkillNode({ node, nodeSize, isSelected, onSelect, onSelectLevel, displayMode = 'full', labelMode = 'far', zoomScale = 1, scopeOptions = [], storyPointMap }) {
  const [hoveredLevelIndex, setHoveredLevelIndex] = useState(null)
  const isMinimal = displayMode === 'minimal'
  const isVeryClose = !isMinimal && labelMode === 'very-close'
  const glowPadding = isMinimal ? 8 : isVeryClose ? 36 : 18
  const renderSize = nodeSize + glowPadding * 2
  const showChips = !isMinimal && (labelMode === 'close' || labelMode === 'very-close')
  const fwWidth = renderSize
  const fwHeight = renderSize
  const fwY = node.y - nodeSize / 2 - glowPadding
  const statusKey = getDisplayStatusKey(node)
  const statusStyles = STATUS_STYLES[statusKey] ?? STATUS_STYLES.later
  const shortName = getShortName(node)
  const tooltipLevel = getTooltipLevel(node)
  const tooltipReleaseNote = getTooltipReleaseNote(node)
  const tooltipScopeLabels = resolveScopeEntries(tooltipLevel?.scopeIds, scopeOptions)
  const levels = Array.isArray(node?.levels) ? node.levels : []
  const activeTooltipReleaseNote = hoveredLevelIndex !== null
    ? (String(levels[hoveredLevelIndex]?.releaseNote ?? '').trim() || 'Keine Release Note hinterlegt.')
    : tooltipReleaseNote
  const activeTooltipScopeLabels = hoveredLevelIndex !== null
    ? resolveScopeEntries(levels[hoveredLevelIndex]?.scopeIds, scopeOptions)
    : tooltipScopeLabels
  const activeTooltipTitle = hoveredLevelIndex !== null && levels.length > 1
    ? `${node.label} – L${hoveredLevelIndex + 1}`
    : node.label
  const levelStatusKeys = getLevelStatusKeys(node)
  const levelRingStyle = buildSegmentConicStyle(
    levelStatusKeys,
    (key) => STATUS_STYLES[key]?.ringBand ?? STATUS_STYLES.later.ringBand,
  )
  const exportLevelEntries = Array.isArray(node?.levels)
    ? node.levels.map((level, index) => ({
      id: level?.id ?? `level-${index + 1}`,
      label: String(level?.label ?? `Level ${index + 1}`),
      status: String(level?.status ?? 'later').trim().toLowerCase(),
      statusLabel: STATUS_STYLES[String(level?.status ?? 'later').trim().toLowerCase()]?.label ?? String(level?.status ?? 'Later'),
      releaseNote: String(level?.releaseNote ?? ''),
      scopeLabels: resolveScopeEntries(level?.scopeIds, scopeOptions),
    }))
    : []
  const levelGlowStyle = buildSegmentConicStyle(
    levelStatusKeys,
    (key) => STATUS_STYLES[key]?.glowSegment ?? 'transparent',
  )
  const nowLevelGlowStyle = buildSegmentConicStyle(
    levelStatusKeys,
    (key) => (key === 'now' ? STATUS_STYLES.now.glowSegment : 'transparent'),
  )
  const nodeBackground = isVeryClose
    ? 'transparent'
    : isSelected
      ? statusKey === 'done'
        ? 'radial-gradient(circle at 32% 28%, rgb(100, 118, 140), rgb(45, 62, 85) 58%, rgb(15, 22, 40) 100%)'
        : 'radial-gradient(circle at 35% 30%, rgb(28, 88, 195), rgb(14, 28, 84) 56%, rgb(2, 6, 26) 100%)'
      : statusKey === 'done'
        ? 'radial-gradient(circle at 32% 28%, rgb(83, 96, 117), rgb(29, 40, 60) 58%, rgb(10, 16, 31) 100%)'
        : 'radial-gradient(circle at 32% 28%, rgb(21, 45, 94), rgb(15, 23, 42) 58%, rgb(2, 6, 23) 100%)'

  const handleRingMouseMove = (event) => {
    if (levels.length <= 1) return
    const rect = event.currentTarget.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dx = event.clientX - cx
    const dy = event.clientY - cy
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist >= (nodeSize / 2) * 0.5) {
      const angle = (Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360) % 360
      const index = Math.min(Math.floor(angle / (360 / levels.length)), levels.length - 1)
      setHoveredLevelIndex(prev => prev === index ? prev : index)
    } else {
      setHoveredLevelIndex(null)
    }
  }

  const handleRingMouseLeave = () => setHoveredLevelIndex(null)

  const handleNodeClick = (event) => {
    onSelect(node.id, event)
    if (onSelectLevel && levels.length > 0) {
      const rect = event.currentTarget.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const dx = event.clientX - cx
      const dy = event.clientY - cy
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist >= (nodeSize / 2) * 0.74) {
        const angle = (Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360) % 360
        const index = Math.min(Math.floor(angle / (360 / levels.length)), levels.length - 1)
        const levelId = levels[index]?.id
        if (levelId) onSelectLevel(levelId)
      }
    }
  }


  const showLabel = !isMinimal && (labelMode === 'mid' || labelMode === 'close' || labelMode === 'very-close')
  const fwX = node.x - fwWidth / 2

  return (
    <foreignObject
      x={fwX}
      y={fwY}
      width={fwWidth}
      height={fwHeight}
      className="skill-node-export-anchor"
      data-node-id={node.id}
      data-export-label={node.label}
      data-short-name={shortName}
      data-label-mode={labelMode}
      data-selected={isSelected ? 'true' : 'false'}
      data-export-note={tooltipReleaseNote}
      data-export-levels={JSON.stringify(exportLevelEntries)}
      data-export-effort={node.effort?.size && node.effort.size !== 'unclear' ? `${EFFORT_SIZE_LABELS[node.effort.size] ?? node.effort.size}` : ''}
      data-export-benefit={node.benefit?.size && node.benefit.size !== 'unclear' ? `${BENEFIT_SIZE_LABELS[node.benefit.size] ?? node.benefit.size}` : ''}
    >
      <div
        xmlns="http://www.w3.org/1999/xhtml"
        className={isVeryClose ? 'skill-node-foreign skill-node-foreign--veryclose' : 'skill-node-foreign'}
        style={{ padding: `${glowPadding}px` }}
        onClick={(event) => event.stopPropagation()}
      >
        {!isMinimal && <div className="skill-node-glow-layer" style={levelGlowStyle} />}
        {!isMinimal && <div className="skill-node-glow-layer" style={{ ...nowLevelGlowStyle, filter: isVeryClose ? undefined : 'blur(24px)' }} />}
        <Tooltip
          disabled={labelMode === 'close' || labelMode === 'very-close'}
          multiline
          openDelay={80}
          closeDelay={40}
          transitionProps={{ transition: 'fade', duration: 120 }}
          classNames={{ tooltip: 'skill-node-tooltip', arrow: 'skill-node-tooltip__arrow' }}
          label={<MarkdownTooltipContent title={activeTooltipTitle} markdown={activeTooltipReleaseNote} scopeLabels={activeTooltipScopeLabels} effort={node.effort} benefit={node.benefit} storyPointMap={storyPointMap} />}
        >
          <Paper
            component="button"
            type="button"
            onClick={handleNodeClick}
            onMouseMove={handleRingMouseMove}
            onMouseLeave={handleRingMouseLeave}
            className={isMinimal ? 'skill-node-button skill-node-button--minimal' : 'skill-node-button'}
            radius={isVeryClose ? 'sm' : 'xl'}
            withBorder={false}
            style={{
              background: nodeBackground,
              width: `${nodeSize}px`,
              height: `${nodeSize}px`,
              '--node-ring-color': statusStyles.ring,
            }}
          >
            {!isMinimal && <div className="skill-node-level-ring" style={levelRingStyle} />}
            {isVeryClose ? (
              <div className="skill-node-button__content skill-node-button__content--veryclose">
                <p className="skill-node-vc__headline">{node.label}</p>
                {String(tooltipLevel?.releaseNote ?? '').trim() && (
                  <p
                    className="skill-node-vc__body"
                    style={{ fontSize: `${26 / zoomScale}px` }}
                  >{String(tooltipLevel.releaseNote).trim()}</p>
                )}
                {showChips && (tooltipScopeLabels.length > 0 || node.effort?.size || node.benefit?.size) && (
                  <div className="skill-node-inner-chips skill-node-vc__chips" style={{ fontSize: `${26 / zoomScale}px` }}>
                    {tooltipScopeLabels.slice(0, 4).map((s, i) => (
                      <span
                        key={i}
                        className="skill-node-inner-chip skill-node-inner-chip--scope"
                        style={{ background: (s.color ?? '#fbbf24') + '22', borderColor: (s.color ?? '#fbbf24') + '99', color: s.color ?? '#fbbf24' }}
                        title={s.label}
                      >{s.label}</span>
                    ))}
                    {node.effort?.size && node.effort.size !== 'unclear' && (
                      <span className="skill-node-inner-chip skill-node-inner-chip--effort" title={EFFORT_SIZE_LABELS[node.effort.size] ?? node.effort.size} />
                    )}
                    {node.benefit?.size && node.benefit.size !== 'unclear' && (
                      <span className="skill-node-inner-chip skill-node-inner-chip--benefit" title={BENEFIT_SIZE_LABELS[node.benefit.size] ?? node.benefit.size} />
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className={showLabel ? 'skill-node-button__content skill-node-button__content--labeled' : 'skill-node-button__content'}>
                {showLabel && (
                  <p
                    className="skill-node-button__label"
                    style={{ color: '#f8fafc' }}
                  >
                    {node.label}
                  </p>
                )}
                {!isMinimal && (
                  <Text
                    className="skill-node-button__shortname"
                    style={{ color: statusStyles.textColor, fontWeight: statusKey === 'now' ? 900 : 800 }}
                  >
                    {shortName}
                  </Text>
                )}
                {showChips && (tooltipScopeLabels.length > 0 || node.effort?.size || node.benefit?.size) && (
                  <div className="skill-node-inner-chips">
                    {tooltipScopeLabels.slice(0, 4).map((s, i) => (
                      <span
                        key={i}
                        className="skill-node-inner-chip skill-node-inner-chip--scope"
                        style={{ background: (s.color ?? '#fbbf24') + '22', borderColor: (s.color ?? '#fbbf24') + '99', color: s.color ?? '#fbbf24' }}
                        title={s.label}
                      >{s.label}</span>
                    ))}
                    {node.effort?.size && node.effort.size !== 'unclear' && (
                      <span className="skill-node-inner-chip skill-node-inner-chip--effort" title={EFFORT_SIZE_LABELS[node.effort.size] ?? node.effort.size} />
                    )}
                    {node.benefit?.size && node.benefit.size !== 'unclear' && (
                      <span className="skill-node-inner-chip skill-node-inner-chip--benefit" title={BENEFIT_SIZE_LABELS[node.benefit.size] ?? node.benefit.size} />
                    )}
                  </div>
                )}
              </div>
            )}
          </Paper>
        </Tooltip>
      </div>
    </foreignObject>
  )
}
