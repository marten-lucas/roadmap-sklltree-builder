import { useState, useRef, memo } from 'react'
import { Paper, Text } from '@mantine/core'
import { NODE_LABEL_ZOOM, STATUS_STYLES } from '../config'
import { getDisplayStatusKey, getLevelStatusKeys } from '../utils/nodeStatus'
import { MarkdownTooltipContent, Tooltip } from '../tooltip'
import { EFFORT_SIZE_LABELS, BENEFIT_SIZE_LABELS } from '../utils/effortBenefit'
import { renderMarkdownToHtml } from '../utils/markdown'
import { getNodeTooltipViewModel } from '../utils/nodePresentation'
import { getNodeLevelIndexFromPointer, isDoubleActivation } from '../utils/nodeInteraction'
import { IconBolt, IconStar } from '@tabler/icons-react'

const CHIP_ICON_STYLE = { display: 'block', flexShrink: 0 }
const EffortIcon = () => <IconBolt size="1em" style={CHIP_ICON_STYLE} aria-hidden="true" />
const BenefitIcon = () => <IconStar size="1em" style={CHIP_ICON_STYLE} aria-hidden="true" />

const pushConicSegmentRange = (gradientParts, color, start, end, { dashed = false } = {}) => {
  if (!dashed || color === 'transparent') {
    gradientParts.push(`${color} ${start}deg ${end}deg`)
    return
  }

  const span = end - start
  const dashSize = Math.max(3.2, Math.min(7, span * 0.22))
  const dashGap = Math.max(2.4, Math.min(6.5, span * 0.16))
  let cursor = start

  while (cursor < end - 0.15) {
    const dashEnd = Math.min(cursor + dashSize, end)
    gradientParts.push(`${color} ${cursor}deg ${dashEnd}deg`)

    if (dashEnd < end) {
      const gapEnd = Math.min(dashEnd + dashGap, end)
      gradientParts.push(`transparent ${dashEnd}deg ${gapEnd}deg`)
      cursor = gapEnd
    } else {
      cursor = end
    }
  }
}

const buildSegmentConicStyle = (statusKeys, colorGetter, options = {}) => {
  const { dashedStatuses = new Set() } = options
  const segmentCount = Math.max(1, statusKeys.length)
  const slice = 360 / segmentCount
  const gapDegrees = segmentCount > 1 ? Math.min(3.2, slice * 0.16) : 0
  const gradientParts = []

  for (let index = 0; index < segmentCount; index += 1) {
    const key = statusKeys[index] ?? 'later'
    const color = colorGetter(key)
    const start = index * slice
    const end = (index + 1) * slice
    const isDashed = dashedStatuses.has(key)

    if (gapDegrees > 0) {
      const colorStart = start + gapDegrees / 2
      const colorEnd = end - gapDegrees / 2
      gradientParts.push(`transparent ${start}deg ${colorStart}deg`)
      pushConicSegmentRange(gradientParts, color, colorStart, colorEnd, { dashed: isDashed })
      gradientParts.push(`transparent ${colorEnd}deg ${end}deg`)
    } else {
      pushConicSegmentRange(gradientParts, color, start, end, { dashed: isDashed })
    }
  }

  return {
    background: `conic-gradient(${gradientParts.join(', ')})`,
  }
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const _SkillNode = ({ node, nodeSize, isSelected, isPortalPeerHovered = false, onSelect, onSelectLevel, onZoomToNode, displayMode = 'full', labelMode = 'far', zoomScale = 1, scopeOptions = [], storyPointMap, releaseId = null, statusStyles = STATUS_STYLES }) => {
  const [hoveredLevelIndex, setHoveredLevelIndex] = useState(null)
  const lastRightClickRef = useRef(0)
  const isMinimal = displayMode === 'minimal'
  const isVeryClose = !isMinimal && labelMode === 'very-close'
  const farZoomProgress = clamp(
    (NODE_LABEL_ZOOM.closeToVeryClose - zoomScale) / (NODE_LABEL_ZOOM.closeToVeryClose - NODE_LABEL_ZOOM.farToMid),
    0,
    1,
  )
  const levels = Array.isArray(node?.levels) ? node.levels : []
  const {
    shortName,
    tooltipReleaseNote,
    tooltipScopeLabels,
    tooltipEffort,
    tooltipBenefit,
    activeTooltipReleaseNote,
    activeTooltipScopeLabels,
    activeTooltipEffort,
    activeTooltipBenefit,
    activeTooltipTitle,
    exportLevelEntries,
    initialVeryCloseIndex,
  } = getNodeTooltipViewModel({
    node,
    scopeOptions,
    releaseId,
    hoveredLevelIndex,
  })
  const [vcActiveLevel, setVcActiveLevel] = useState(initialVeryCloseIndex)
  const glowPadding = isMinimal ? 8 : isVeryClose ? 36 : Math.round(18 + farZoomProgress * 10)
  const renderSize = nodeSize + glowPadding * 2
  const showChips = !isMinimal && (labelMode === 'mid' || labelMode === 'close' || labelMode === 'very-close')
  const fwWidth = renderSize
  const fwHeight = renderSize
  const fwY = node.y - nodeSize / 2 - glowPadding
  const statusKey = getDisplayStatusKey(node, releaseId)
  const isGhost = displayMode === 'ghost'
  const statusStyleMap = statusStyles && typeof statusStyles === 'object' ? statusStyles : STATUS_STYLES
  const statusStylesResolved = statusStyleMap[statusKey] ?? statusStyleMap.later ?? STATUS_STYLES.later
  const labelTextColor = statusKey === 'later' || statusKey === 'someday'
    ? statusStylesResolved.textColor
    : '#f8fafc'
  const levelStatusKeys = getLevelStatusKeys(node, releaseId)
  const hasOpenPoints = levels.some((level) => Boolean(level?.hasOpenPoints))
  const openPointsTitle = String(levels.find((level) => level?.hasOpenPoints)?.openPointsLabel ?? '').trim() || 'Open point'
  const levelRingStyle = buildSegmentConicStyle(
    levelStatusKeys,
    (key) => statusStyleMap[key]?.ringBand ?? statusStyleMap.later?.ringBand ?? STATUS_STYLES.later.ringBand,
    { dashedStatuses: new Set(['someday']) },
  )
  const levelGlowStyle = buildSegmentConicStyle(
    levelStatusKeys,
    (key) => statusStyleMap[key]?.glowSegment ?? 'transparent',
  )
  const nowLevelGlowStyle = buildSegmentConicStyle(
    levelStatusKeys,
    (key) => (key === 'now' ? (statusStyleMap.now?.glowSegment ?? STATUS_STYLES.now.glowSegment) : 'transparent'),
  )
  const zoomGlowProgress = clamp(
    (zoomScale - NODE_LABEL_ZOOM.farToMid) / ((NODE_LABEL_ZOOM.closeToVeryClose + 1) - NODE_LABEL_ZOOM.farToMid),
    0,
    1,
  )
  const primaryGlowInset = isVeryClose ? glowPadding : Math.max(6, glowPadding - (10 + farZoomProgress * 5))
  const secondaryGlowInset = isVeryClose ? glowPadding : Math.max(4, glowPadding - (12 + farZoomProgress * 7))
  const primaryGlowStyle = {
    ...levelGlowStyle,
    inset: `${primaryGlowInset}px`,
    opacity: isVeryClose
      ? (0.72 + zoomGlowProgress * 0.24).toFixed(2)
      : (0.52 + zoomGlowProgress * 0.20).toFixed(2),
    filter: `blur(${(isVeryClose ? 10 + zoomGlowProgress * 6 : 10 + zoomGlowProgress * 4).toFixed(2)}px)`,
  }
  const secondaryGlowStyle = {
    ...nowLevelGlowStyle,
    inset: `${secondaryGlowInset}px`,
    opacity: isVeryClose
      ? (0.50 + zoomGlowProgress * 0.25).toFixed(2)
      : (0.36 + zoomGlowProgress * 0.18).toFixed(2),
    filter: `blur(${(isVeryClose ? 14 + zoomGlowProgress * 10 : 24 + zoomGlowProgress * 6).toFixed(2)}px)`,
  }
  const isLowPriorityStatus = statusKey === 'later' || statusKey === 'someday'
  const nodeBackground = isVeryClose
    ? 'transparent'
    : isLowPriorityStatus
      ? 'linear-gradient(180deg, rgb(7, 14, 30) 0%, rgb(2, 6, 23) 100%)'
      : isSelected
        ? statusKey === 'done'
          ? 'radial-gradient(circle at 32% 28%, rgb(100, 118, 140), rgb(45, 62, 85) 58%, rgb(15, 22, 40) 100%)'
          : 'radial-gradient(circle at 35% 30%, rgb(28, 88, 195), rgb(14, 28, 84) 56%, rgb(2, 6, 26) 100%)'
        : statusKey === 'done'
          ? 'radial-gradient(circle at 32% 28%, rgb(83, 96, 117), rgb(29, 40, 60) 58%, rgb(10, 16, 31) 100%)'
          : 'radial-gradient(circle at 32% 28%, rgb(21, 45, 94), rgb(15, 23, 42) 58%, rgb(2, 6, 23) 100%)'

  const handleRingMouseMove = (event) => {
    const index = getNodeLevelIndexFromPointer({
      event,
      nodeSize,
      levelsLength: levels.length,
      innerRadiusRatio: 0.5,
    })

    if (index === null) {
      setHoveredLevelIndex(null)
      return
    }

    setHoveredLevelIndex(prev => prev === index ? prev : index)
  }

  const handleRingMouseLeave = () => setHoveredLevelIndex(null)

  const handleContextMenu = (event) => {
    event.preventDefault()
    event.stopPropagation()
    const now = Date.now()
    if (isDoubleActivation(lastRightClickRef.current, now)) {
      lastRightClickRef.current = 0
      onZoomToNode?.(node.x, node.y)
    } else {
      lastRightClickRef.current = now
    }
  }

  const handleBodyClick = (event) => {
    event.preventDefault()
    event.stopPropagation()
    onSelect(node.id, event)
  }

  const handleForeignClick = (event) => {
    event.stopPropagation()

    const targetButton = event.currentTarget ?? null
    const hitTestLevelCount = Math.max(levels.length, 1)
    const index = getNodeLevelIndexFromPointer({
      event: {
        currentTarget: targetButton,
        clientX: event.clientX,
        clientY: event.clientY,
      },
      nodeSize,
      levelsLength: hitTestLevelCount,
      innerRadiusRatio: isMinimal ? 0.5 : (isVeryClose ? 0.55 : 0.5),
    })

    if (index === null || !onSelectLevel) {
      onSelect(node.id, event)
      return
    }

    const levelId = levels[index]?.id ?? 'level-1'
    onSelect(node.id, event)
    onSelectLevel(node.id, levelId)
  }


  const showShortName = !isMinimal || labelMode === 'mid' || labelMode === 'close' || labelMode === 'very-close'
  const showLabel = isMinimal
    ? labelMode === 'very-close'
    : (labelMode === 'mid' || labelMode === 'close' || labelMode === 'very-close')
  const minimalShortNameStyle = isMinimal
    ? {
        fontSize: showLabel ? '0.56rem' : '0.72rem',
        letterSpacing: showLabel ? '0.08em' : '0.06em',
      }
    : null
  const minimalLabelStyle = isMinimal
    ? {
        fontSize: '3px',
        lineHeight: 1,
        maxWidth: '82%',
      }
    : null
  const fwX = node.x - fwWidth / 2
  const peerPulseStrength = clamp(0.95 + (1 / Math.max(zoomScale, 0.32) - 1) * 1.25, 0.95, 2.8)
  const peerPulseScale = (1.02 + peerPulseStrength * 0.03).toFixed(3)
  const peerPulseFar = (14 + peerPulseStrength * 10).toFixed(1)
  const peerPulseNear = (26 + peerPulseStrength * 14).toFixed(1)
  const peerPulseSlowdown = (0.96 + (2.8 - peerPulseStrength) * 0.08).toFixed(2)
  const nodeButtonClassName = [
    'skill-node-button',
    `skill-node-button--status-${statusKey}`,
    isMinimal ? 'skill-node-button--minimal' : '',
    isPortalPeerHovered ? 'skill-node-button--portal-peer-hovered' : '',
  ].filter(Boolean).join(' ')

  return (
    <foreignObject
      x={fwX}
      y={fwY}
      width={fwWidth}
      height={fwHeight}
      className="skill-node-export-anchor"
      data-node-id={node.id}
      data-export-status={statusKey}
      data-export-label={node.label}
      data-short-name={shortName}
      data-label-mode={labelMode}
      data-selected={isSelected ? 'true' : 'false'}
      data-export-note={tooltipReleaseNote}
      data-export-levels={JSON.stringify(exportLevelEntries)}
      data-export-effort={tooltipEffort?.size && tooltipEffort.size !== 'unclear' ? `${EFFORT_SIZE_LABELS[tooltipEffort.size] ?? tooltipEffort.size}` : ''}
      data-export-benefit={tooltipBenefit?.size && tooltipBenefit.size !== 'unclear' ? `${BENEFIT_SIZE_LABELS[tooltipBenefit.size] ?? tooltipBenefit.size}` : ''}
    >
      <div
        xmlns="http://www.w3.org/1999/xhtml"
        className={isVeryClose ? 'skill-node-foreign skill-node-foreign--veryclose' : 'skill-node-foreign'}
        style={{ padding: `${glowPadding}px` }}
      >
        {!isMinimal && <div className="skill-node-glow-layer" style={primaryGlowStyle} />}
        {!isMinimal && <div className="skill-node-glow-layer" style={secondaryGlowStyle} />}
        <Tooltip
          disabled={labelMode === 'close' || labelMode === 'very-close'}
          multiline
          openDelay={80}
          closeDelay={40}
          transitionProps={{ transition: 'fade', duration: 120 }}
          classNames={{ tooltip: 'skill-node-tooltip', arrow: 'skill-node-tooltip__arrow' }}
          label={<MarkdownTooltipContent title={activeTooltipTitle} markdown={activeTooltipReleaseNote} scopeLabels={activeTooltipScopeLabels} effort={activeTooltipEffort} benefit={activeTooltipBenefit} storyPointMap={storyPointMap} statusStyles={statusStyleMap} />}
        >
          <Paper
            component="button"
            type="button"
            onClick={isVeryClose ? handleForeignClick : undefined}
            onMouseMove={handleRingMouseMove}
            onMouseLeave={handleRingMouseLeave}
            onContextMenu={handleContextMenu}
            className={nodeButtonClassName}
            radius={isVeryClose ? 'sm' : 'xl'}
            withBorder={false}
            style={{
              background: nodeBackground,
              width: `${nodeSize}px`,
              height: `${nodeSize}px`,
              '--node-ring-color': statusStylesResolved.ring,
              '--portal-peer-pulse-scale': peerPulseScale,
              '--portal-peer-pulse-far': `${peerPulseFar}px`,
              '--portal-peer-pulse-near': `${peerPulseNear}px`,
              '--portal-peer-pulse-alpha-idle': (0.5 + peerPulseStrength * 0.16).toFixed(2),
              '--portal-peer-pulse-alpha-active': (0.74 + peerPulseStrength * 0.14).toFixed(2),
              '--portal-peer-pulse-duration': `${peerPulseSlowdown}s`,
            }}
            >
              {!isMinimal && <div className="skill-node-level-ring" style={levelRingStyle} />}
              {hasOpenPoints && <div className="skill-node-button__open-point-indicator" aria-label={openPointsTitle} title={openPointsTitle} />}
              {!isVeryClose && <div className="skill-node-click-hit skill-node-click-hit--ring" onMouseDown={handleForeignClick} onClick={(event) => event.stopPropagation()} />}
              {!isVeryClose && <div className="skill-node-click-hit skill-node-click-hit--body" onMouseDown={handleBodyClick} onClick={(event) => event.stopPropagation()} />}
              {isVeryClose ? (
                <div className="skill-node-button__content skill-node-button__content--veryclose">
                  <p className="skill-node-vc__headline">{node.label}</p>
                  {levels.length > 1 && (
                    <div className="skill-node-vc__tabs">
                      {levels.map((_, i) => {
                        const lsKey = levelStatusKeys[i] ?? 'later'
                        const lsStyle = statusStyleMap[lsKey] ?? statusStyleMap.later ?? STATUS_STYLES.later
                        const levelLabel = exportLevelEntries[i]?.label ?? `L${i + 1}`
                        return (
                          <div
                            key={i}
                            role="button"
                            tabIndex={0}
                            className={`skill-node-vc__tab${vcActiveLevel === i ? ' skill-node-vc__tab--active' : ''}`}
                            style={{ '--tab-color': lsStyle.ringBand }}
                            onClick={(e) => { e.stopPropagation(); setVcActiveLevel(i) }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                e.stopPropagation()
                                setVcActiveLevel(i)
                              }
                            }}
                          >
                            {levelLabel}
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {(() => {
                    const activeNote = String(levels[vcActiveLevel]?.releaseNote ?? '').trim()
                    const noteHtml = renderMarkdownToHtml(activeNote)
                    return activeNote ? (
                      <div
                        className="skill-node-vc__body skill-node-vc__body--markdown"
                        style={{ fontSize: `${26 / zoomScale}px` }}
                        dangerouslySetInnerHTML={{ __html: noteHtml }}
                      />
                    ) : null
                  })()}
                  {showChips && (() => {
                    const activeEntry = exportLevelEntries[vcActiveLevel] ?? null
                    const vcScopeLabels = activeEntry?.scopeLabels ?? []
                    const vcEffort = activeEntry?.effort ?? node.effort
                    const vcBenefit = activeEntry?.benefit ?? node.benefit
                    const hasChips = vcScopeLabels.length > 0 || (vcEffort?.size && vcEffort.size !== 'unclear') || (vcBenefit?.size && vcBenefit.size !== 'unclear')
                    return hasChips ? (
                      <div className="skill-node-inner-chips skill-node-vc__chips" style={{ fontSize: `${26 / zoomScale}px`, '--chip-bw': `${0.5 / zoomScale}px`, '--chip-pad-v': `${0.5 / zoomScale}px`, '--chip-pad-h': `${2.5 / zoomScale}px`, '--chip-gap': `${2 / zoomScale}px`, '--chip-radius': `${8 / zoomScale}px` }}>
                        {vcScopeLabels.slice(0, 4).map((s, i) => (
                          <span
                            key={i}
                            className="skill-node-inner-chip skill-node-inner-chip--scope"
                            style={{ background: (s.color ?? '#fbbf24') + '22', borderColor: (s.color ?? '#fbbf24') + '99', color: s.color ?? '#fbbf24' }}
                            title={s.label}
                          >{s.label}</span>
                        ))}
                        {vcEffort?.size && vcEffort.size !== 'unclear' && (
                          <span className="skill-node-inner-chip skill-node-inner-chip--effort" title={EFFORT_SIZE_LABELS[vcEffort.size] ?? vcEffort.size}><EffortIcon />{EFFORT_SIZE_LABELS[vcEffort.size] ?? vcEffort.size}</span>
                        )}
                        {vcBenefit?.size && vcBenefit.size !== 'unclear' && (
                          <span className="skill-node-inner-chip skill-node-inner-chip--benefit" title={BENEFIT_SIZE_LABELS[vcBenefit.size] ?? vcBenefit.size}><BenefitIcon />{BENEFIT_SIZE_LABELS[vcBenefit.size] ?? vcBenefit.size}</span>
                        )}
                      </div>
                    ) : null
                  })()}
                </div>
              ) : (
                <div className={showLabel ? 'skill-node-button__content skill-node-button__content--labeled' : 'skill-node-button__content'}>
                  {showLabel && (
                    <p
                      className="skill-node-button__label"
                      style={{ color: labelTextColor, ...minimalLabelStyle }}
                    >
                      {node.label}
                    </p>
                  )}
                  {showShortName && (
                    <Text
                      className="skill-node-button__shortname"
                      style={{
                        color: statusStylesResolved.textColor,
                        fontWeight: statusKey === 'now' ? 900 : statusKey === 'next' ? 820 : 700,
                        ...minimalShortNameStyle,
                      }}
                    >
                      {shortName}
                    </Text>
                  )}
                  {showChips && (tooltipScopeLabels.length > 0 || tooltipEffort?.size || tooltipBenefit?.size) && (
                    <div className="skill-node-inner-chips" style={{ '--chip-bw': `${0.5 / zoomScale}px`, '--chip-pad-v': `${0.5 / zoomScale}px`, '--chip-pad-h': `${2.5 / zoomScale}px`, '--chip-gap': `${2 / zoomScale}px`, '--chip-radius': `${8 / zoomScale}px` }}>
                      {tooltipScopeLabels.slice(0, 4).map((s, i) => (
                        <span
                          key={i}
                          className="skill-node-inner-chip skill-node-inner-chip--scope"
                          style={{ background: (s.color ?? '#fbbf24') + '22', borderColor: (s.color ?? '#fbbf24') + '99', color: s.color ?? '#fbbf24' }}
                          title={s.label}
                        >{s.label}</span>
                      ))}
                      {tooltipEffort?.size && tooltipEffort.size !== 'unclear' && (
                        <span className="skill-node-inner-chip skill-node-inner-chip--effort" title={EFFORT_SIZE_LABELS[tooltipEffort.size] ?? tooltipEffort.size}><EffortIcon />{EFFORT_SIZE_LABELS[tooltipEffort.size] ?? tooltipEffort.size}</span>
                      )}
                      {tooltipBenefit?.size && tooltipBenefit.size !== 'unclear' && (
                        <span className="skill-node-inner-chip skill-node-inner-chip--benefit" title={BENEFIT_SIZE_LABELS[tooltipBenefit.size] ?? tooltipBenefit.size}><BenefitIcon />{BENEFIT_SIZE_LABELS[tooltipBenefit.size] ?? tooltipBenefit.size}</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </Paper>
            </Tooltip>
            {isGhost && (
              <div
                aria-hidden="true"
                className="skill-node-ghost-overlay"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              </div>
            )}
          </div>
        </foreignObject>
      )
    }

    // Memoize to prevent re-renders during zoom/pan operations
    export const SkillNode = memo(_SkillNode, (prevProps, nextProps) => {
      // Only re-render if essential props changed (data/selection), not layout/zoom state
      return (
        prevProps.node === nextProps.node &&
        prevProps.nodeSize === nextProps.nodeSize &&
        prevProps.isSelected === nextProps.isSelected &&
        prevProps.isPortalPeerHovered === nextProps.isPortalPeerHovered &&
        prevProps.displayMode === nextProps.displayMode &&
        prevProps.labelMode === nextProps.labelMode &&
        prevProps.zoomScale === nextProps.zoomScale &&
        prevProps.releaseId === nextProps.releaseId &&
        prevProps.nodeDeps === nextProps.nodeDeps &&
        prevProps.storyPointMap === nextProps.storyPointMap
      )
    })
