import { MultiSelect } from '@mantine/core'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Tooltip } from '../tooltip'
import { STATUS_LABELS, STATUS_STYLES, normalizeStatusKey } from '../config'
import { BENEFIT_SIZE_LABELS, BENEFIT_SIZES, EFFORT_SIZE_LABELS, EFFORT_SIZES } from '../utils/effortBenefit'
import { commitReleaseNoteDraft } from '../utils/releaseNoteDraft'
import { getDisplayStatusKey, getLevelStatus } from '../utils/nodeStatus'
import { SCOPE_FILTER_ALL, scopeIdsMatchFilter } from '../utils/visibility'
import { getLevelDisplayLabel } from '../utils/treeData'

// ── Icons ─────────────────────────────────────────────────────────────────────

const EyeOffIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
)

const IconTree = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 3H3" /><path d="M9 3v18" /><path d="M9 9h12" /><path d="M9 15h8" />
  </svg>
)

const IconList = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <circle cx="3" cy="6" r="1" fill="currentColor" stroke="none" />
    <circle cx="3" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="3" cy="18" r="1" fill="currentColor" stroke="none" />
  </svg>
)

const IconLayers = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" />
    <polyline points="2 12 12 17 22 12" />
  </svg>
)

const IconColumns = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="5" height="16" rx="1.5" />
    <rect x="10" y="7" width="4" height="13" rx="1.5" />
    <rect x="16" y="10" width="5" height="10" rx="1.5" />
  </svg>
)

const IconBolt = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10" />
  </svg>
)

const IconStar = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
)

const IconStatus = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3" />
    <path d="M12 19v3" />
    <path d="M2 12h3" />
    <path d="M19 12h3" />
  </svg>
)

const IconScope = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20.59 13.41 11 3H4v7l9.59 9.59a2 2 0 0 0 2.82 0l4.18-4.18a2 2 0 0 0 0-2.82Z" />
    <path d="M7 7h.01" />
  </svg>
)

const IconChecklist = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 11l3 3L22 4" />
    <path d="M2 12l3 3" />
    <path d="M7 16l5-5" />
    <path d="M2 5h10" />
    <path d="M2 19h10" />
  </svg>
)

const IconMultiSelect = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="8" height="8" rx="1.5" />
    <path d="M13 7h8" />
    <path d="M13 12h8" />
    <path d="M3 16h18" />
    <path d="M3 21h10" />
  </svg>
)

// ── helpers ───────────────────────────────────────────────────────────────────

const ScopeChip = ({ label, color }) => (
  <span
    className="list-view-drawer__chip list-view-drawer__chip--scope"
    style={color ? { borderColor: color, color } : undefined}
  >
    {label}
  </span>
)

const OpenPointsToggle = ({ checked = false, label = '', onChange = () => {} }) => {
  if (!checked) {
    return null
  }

  return (
    <button
      type="button"
      className="list-view-drawer__open-points-toggle list-view-drawer__open-points-toggle--active"
      aria-pressed
      aria-label="Mark open point done"
      title="Click to mark done"
      onClick={(event) => {
        event.stopPropagation()
        onChange(false)
      }}
    >
      <span className="list-view-drawer__open-points-dot" aria-hidden="true" />
      <span>{String(label || '').trim() || 'Open point'}</span>
    </button>
  )
}

const getStatusBorderColor = (status) => {
  const key = status ?? 'later'
  return (STATUS_STYLES[key] ?? STATUS_STYLES.later).ringBand
}

const getNodeScopeIds = (node) => {
  const ids = new Set()
  for (const level of node.levels ?? []) {
    for (const id of level.scopeIds ?? []) ids.add(id)
  }
  return ids
}

const documentHasOpenPoints = (document) => {
  const walk = (nodes = []) => nodes.some((node) => (
    (node.levels ?? []).some((level) => Boolean(level?.hasOpenPoints))
    || walk(node.children ?? [])
  ))

  return walk(document?.children ?? [])
}

const withAlpha = (color, alpha) => {
  if (!color || typeof color !== 'string') return `rgba(148, 163, 184, ${alpha})`

  if (color.startsWith('#')) {
    const hex = color.slice(1)
    const normalized = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex
    if (/^[0-9a-fA-F]{6}$/.test(normalized)) {
      const r = parseInt(normalized.slice(0, 2), 16)
      const g = parseInt(normalized.slice(2, 4), 16)
      const b = parseInt(normalized.slice(4, 6), 16)
      return `rgba(${r}, ${g}, ${b}, ${alpha})`
    }
  }

  const rgbMatch = color.match(/^rgba?\(([^)]+)\)$/i)
  if (rgbMatch) {
    const [r = '148', g = '163', b = '184'] = rgbMatch[1].split(',').map((part) => part.trim())
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }

  return color
}

const getStatusTextColor = (statusKey, statusStyle) => {
  if (statusKey === 'done') return '#0f172a'
  if (statusKey === 'hidden' || statusKey === 'later' || statusKey === 'someday') return '#e2e8f0'
  return statusStyle?.textColor ?? '#ffffff'
}

const EFFORT_LABELS = { ...EFFORT_SIZE_LABELS }
const BENEFIT_LABELS = { ...BENEFIT_SIZE_LABELS }
const STATUS_RADIO_OPTIONS = [
  { value: 'done', label: 'Done' },
  { value: 'now', label: 'Now' },
  { value: 'next', label: 'Next' },
  { value: 'later', label: 'Later' },
  { value: 'someday', label: 'Someday' },
  { value: 'hidden', label: 'Hide' },
].map((option) => {
  const style = STATUS_STYLES[option.value] ?? STATUS_STYLES.later
  return {
    ...option,
    pillStyle: {
      '--status-band': style.ringBand,
      '--status-soft': withAlpha(style.ringBand, 0.18),
      '--status-border': withAlpha(style.ringBand, 0.55),
      '--status-text': getStatusTextColor(option.value, style),
    },
  }
})

// ── Metric slider ─────────────────────────────────────────────────────────────

const MetricSlider = ({ sizes, activeValue, onChange, kind, customPoints, onCustomChange, isSelected = false }) => {
  const labels = kind === 'value' ? BENEFIT_LABELS : EFFORT_LABELS
  const [draftValue, setDraftValue] = useState(activeValue)
  const [wheelArmed, setWheelArmed] = useState(false)
  const draftValueRef = useRef(activeValue)
  const lastNonCustomValueRef = useRef(activeValue === 'custom' ? 'unclear' : activeValue)
  const sliderRootRef = useRef(null)

  const getDisplayLabel = useCallback((value) => {
    if (value === 'unclear') return '?'
    if (value === 'custom') return 'C'
    return labels[value] ?? value
  }, [labels])

  useEffect(() => {
    setDraftValue(activeValue)
    draftValueRef.current = activeValue
    if (activeValue !== 'custom') lastNonCustomValueRef.current = activeValue
  }, [activeValue])

  useEffect(() => {
    if (!wheelArmed) return undefined

    const handleWindowPointerDown = (event) => {
      if (!sliderRootRef.current?.contains(event.target)) {
        setWheelArmed(false)
      }
    }

    const handleWindowKeyDown = (event) => {
      if (event.key === 'Escape') setWheelArmed(false)
    }

    window.addEventListener('pointerdown', handleWindowPointerDown, true)
    window.addEventListener('keydown', handleWindowKeyDown)

    return () => {
      window.removeEventListener('pointerdown', handleWindowPointerDown, true)
      window.removeEventListener('keydown', handleWindowKeyDown)
    }
  }, [wheelArmed])

  const commitDraft = useCallback((e) => {
    e?.stopPropagation?.()
    if (draftValueRef.current !== activeValue) onChange(draftValueRef.current)
  }, [activeValue, onChange])

  const handleWheel = useCallback((e) => {
    if (!wheelArmed) return
    e.preventDefault()
    e.stopPropagation()
    const currentIdx = Math.max(0, sizes.indexOf(draftValueRef.current))
    const deltaSign = e.deltaY > 0 ? 1 : -1
    const nextIdx = Math.max(0, Math.min(sizes.length - 1, currentIdx + deltaSign))
    const nextValue = sizes[nextIdx]
    draftValueRef.current = nextValue
    setDraftValue(nextValue)
    onChange(nextValue)
  }, [wheelArmed, sizes, onChange])

  const idx = Math.max(0, sizes.indexOf(draftValue))
  const showCustomInput = kind === 'effort' && draftValue === 'custom'
  const displayLabel = getDisplayLabel(draftValue)

  useEffect(() => {
    if (showCustomInput && wheelArmed) setWheelArmed(false)
  }, [showCustomInput, wheelArmed])

  return (
    <div
      ref={sliderRootRef}
      className={`list-view-drawer__metric-slider list-view-drawer__metric-slider--${kind}${isSelected ? ' list-view-drawer__metric-slider--selected' : ''}${wheelArmed ? ' list-view-drawer__metric-slider--wheel-armed' : ''}`}
      role="group"
      aria-label={kind}
      onWheel={handleWheel}
    >
      <span 
        className="list-view-drawer__slider-label"
        title="Click to activate wheel control"
        onClick={(e) => {
          e.stopPropagation()
          setWheelArmed(true)
        }}
      >
        {displayLabel}
      </span>
      {showCustomInput ? (
        <div className="list-view-drawer__metric-custom-editor">
          <label className="list-view-drawer__metric-custom-toggle" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={showCustomInput}
              aria-label="Custom effort"
              onChange={(e) => {
                e.stopPropagation()
                if (!e.currentTarget.checked) {
                  const restoreValue = lastNonCustomValueRef.current === 'custom' ? 'unclear' : lastNonCustomValueRef.current
                  draftValueRef.current = restoreValue
                  setDraftValue(restoreValue)
                  onChange(restoreValue)
                }
              }}
            />
            <span>Custom</span>
          </label>
          <input
            type="number"
            className="list-view-drawer__metric-custom-input"
            value={customPoints ?? ''}
            min={0}
            placeholder="pts"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              e.stopPropagation()
              onCustomChange?.(e.target.value === '' ? null : Number(e.target.value))
            }}
          />
        </div>
      ) : (
        <div className="list-view-drawer__slider-inner">
          <input
            type="range"
            min={0}
            max={sizes.length - 1}
            step={1}
            value={idx}
            className="list-view-drawer__slider-input"
            aria-valuetext={displayLabel}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onInput={(e) => {
              e.stopPropagation()
              const nextValue = sizes[Number(e.currentTarget.value)]
              if (nextValue !== 'custom') lastNonCustomValueRef.current = nextValue
              draftValueRef.current = nextValue
              setDraftValue(nextValue)
            }}
            onPointerUp={commitDraft}
            onKeyUp={(e) => {
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') commitDraft(e)
            }}
            onBlur={commitDraft}
          />
          <div
            className="list-view-drawer__slider-ticks"
            aria-hidden="true"
            onClick={(e) => {
              e.stopPropagation()
              setWheelArmed(true)
            }}
          >
            {sizes.map((size, tickIdx) => (
              <span
                key={size}
                className={`list-view-drawer__slider-tick${tickIdx <= idx ? ' list-view-drawer__slider-tick--active' : ''}`}
                title={getDisplayLabel(size)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Status group ──────────────────────────────────────────────────────────────

const StatusRadioGroup = ({ value, onChange, groupName, isSelected = false }) => (
  <div
    className={`list-view-drawer__status-group${isSelected ? ' list-view-drawer__status-group--selected' : ''}`}
    role="radiogroup"
    aria-label="Status"
    onClick={(e) => e.stopPropagation()}
  >
    {STATUS_RADIO_OPTIONS.map((option) => (
      <Tooltip key={option.value} label={option.label} withArrow position="top" openDelay={80}>
        <label
          className={`list-view-drawer__status-option${value === option.value ? ' list-view-drawer__status-option--active' : ''}`}
          aria-label={option.label}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="radio"
            name={groupName}
            value={option.value}
            checked={value === option.value}
            aria-label={option.label}
            onChange={(e) => {
              e.stopPropagation()
              if (e.currentTarget.checked) onChange(option.value)
            }}
          />
          <span
            className={`list-view-drawer__status-pill list-view-drawer__status-pill--${option.value}`}
            style={option.pillStyle}
            aria-hidden="true"
          />
        </label>
      </Tooltip>
    ))}
  </div>
)

const ScopeAssignGroup = ({ scopeOptions, selectedScopeIds = [], onChange, isSelected = false }) => {
  const scopeSelectData = scopeOptions.map((scope) => ({
    value: scope.id,
    label: scope.label,
    color: scope.color ?? null,
  }))

  const selectedLabels = selectedScopeIds
    .map((id) => scopeOptions.find((scope) => scope.id === id)?.label)
    .filter(Boolean)

  const scopeSummary = selectedLabels.length === 0
    ? 'Scopes'
    : selectedLabels.length === 1
      ? selectedLabels[0]
      : `${selectedLabels[0]} +${selectedLabels.length - 1}`

  return (
    <div
      className={`list-view-drawer__scope-group${isSelected ? ' list-view-drawer__scope-group--selected' : ''}`}
      aria-label="Scopes"
      onClick={(e) => e.stopPropagation()}
    >
      {scopeOptions.length === 0 ? (
        <span className="list-view-drawer__scope-empty">No scopes</span>
      ) : (
        <MultiSelect
          data={scopeSelectData}
          value={selectedScopeIds}
          onChange={(values) => onChange(values)}
          searchable
          clearable
          placeholder=""
          nothingFoundMessage="No scopes"
          className="list-view-drawer__scope-select"
          leftSection={(
            <span className={`list-view-drawer__scope-summary${selectedLabels.length === 0 ? ' list-view-drawer__scope-summary--empty' : ''}`} title={selectedLabels.join(', ')}>
              {scopeSummary}
            </span>
          )}
          leftSectionWidth={selectedLabels.length > 0 ? 120 : 58}
          leftSectionPointerEvents="none"
          checkIconPosition="right"
          classNames={{
            input: 'mantine-dark-input list-view-drawer__scope-select-input',
            dropdown: 'mantine-dark-dropdown',
            option: 'mantine-dark-option',
            pill: 'mantine-dark-pill list-view-drawer__scope-pill',
            pillsList: 'list-view-drawer__scope-pills-list',
            inputField: 'list-view-drawer__scope-input-field',
            section: 'list-view-drawer__scope-section',
          }}
          comboboxProps={{ withinPortal: true, zIndex: 450 }}
        />
      )}
    </div>
  )
}

const ReleaseNoteEditor = ({ value, onChange, isSelected = false }) => {
  const [draft, setDraft] = useState(value ?? '')

  useEffect(() => {
    setDraft(value ?? '')
  }, [value])

  const commitDraft = useCallback(() => {
    commitReleaseNoteDraft({
      draft,
      currentValue: value,
      onCommit: onChange,
    })
  }, [draft, onChange, value])

  return (
    <div
      className={`list-view-drawer__release-note-editor${isSelected ? ' list-view-drawer__release-note-editor--selected' : ''}`}
      onClick={(e) => e.stopPropagation()}
    >
      <textarea
        className="list-view-drawer__release-note-input"
        aria-label="Release Notes"
        value={draft}
        rows={2}
        placeholder="Add release note…"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitDraft}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Escape') {
            e.preventDefault()
            setDraft(value ?? '')
            e.currentTarget.blur()
          }
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            commitDraft()
            e.currentTarget.blur()
          }
        }}
      />
    </div>
  )
}

// ── LevelRow ──────────────────────────────────────────────────────────────────

const LevelRow = ({
  level,
  nodeId,
  selectedNodeId,
  selectedProgressLevelId,
  selectedLevelKeys = [],
  nodeLabel,
  levelIndex = 0,
  depth,
  scopeMap,
  selectedReleaseId,
  onSelectLevel,
  onToggleLevelSelection,
  showEstimateColumns,
  onSetEffort,
  onSetBenefit,
  onSetStatus,
  onSetScopeIds,
  onSetOpenPoints,
  onSetReleaseNote,
  showStatusColumn,
  showTasksColumn,
  showScopeColumn,
  showReleaseNotesColumn,
  listMode,
  selectionMode = false,
}) => {
  const statusKey = normalizeStatusKey(getLevelStatus(level, selectedReleaseId))
  const isHidden = statusKey === 'hidden'
  const borderColor = getStatusBorderColor(statusKey)
  const scopeEntries = (level.scopeIds ?? []).map((id) => scopeMap.get(id)).filter(Boolean)
  const allScopeOptions = [...scopeMap.values()].filter(Boolean)
  const benefitValue = level.benefit?.size ?? 'unclear'
  const effortValue = level.effort?.size ?? 'unclear'
  const levelSelectionKey = `${nodeId}::${level.id}`
  const isMultiSelected = selectedLevelKeys.includes(levelSelectionKey)
  const isSelected = isMultiSelected || (selectedNodeId === nodeId && selectedProgressLevelId === level.id)
  const levelLabel = getLevelDisplayLabel(level?.label, levelIndex)
  const hasOpenPoints = Boolean(level?.hasOpenPoints)
  const openPointsLabel = String(level?.openPointsLabel ?? '').trim()

  return (
    <li
      className="list-view-drawer__item list-view-drawer__item--level"
      style={{
        paddingLeft: listMode ? '0.5rem' : `${0.5 + depth * 1}rem`,
        opacity: isHidden ? 0.55 : undefined,
      }}
    >
      <div className="list-view-drawer__item-row" style={{ borderRight: `3px solid ${borderColor}` }}>
        {!listMode && (
          <span className="list-view-drawer__toggle list-view-drawer__toggle--leaf" aria-hidden="true" />
        )}
        {selectionMode && (
          <label className="list-view-drawer__level-select-toggle" onClick={(event) => event.stopPropagation()}>
            <input
              type="checkbox"
              checked={isMultiSelected}
              aria-label={`Select ${levelLabel}`}
              onChange={(event) => onToggleLevelSelection?.(event.currentTarget.checked, event)}
            />
          </label>
        )}
        <div
          className={`list-view-drawer__item-body list-view-drawer__item-body--level${isSelected ? ' list-view-drawer__item-body--selected' : ''}`}
          role="button"
          tabIndex={0}
          onClick={(event) => onSelectLevel(event)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectLevel(e) }}
        >
          <div className="list-view-drawer__item-mainline">
            <span className="list-view-drawer__item-label list-view-drawer__item-label--level">
              {isHidden && <EyeOffIcon />}
              {listMode && nodeLabel && (
                <span className="list-view-drawer__node-prefix">{nodeLabel}&nbsp;·&nbsp;</span>
              )}
              <span className="list-view-drawer__level-name">{levelLabel}</span>
              {isHidden && <span style={{ fontSize: '0.7em', color: '#6b7280', marginLeft: 2 }}>(hidden)</span>}
            </span>
            {!listMode && <OpenPointsToggle checked={hasOpenPoints} label={openPointsLabel} onChange={onSetOpenPoints} />}
            {scopeEntries.length > 0 && !(listMode && showScopeColumn) && (
              <span className="list-view-drawer__item-chips">
                {scopeEntries.map((scope) => (
                  <ScopeChip key={scope.id} label={scope.label} color={scope.color} />
                ))}
              </span>
            )}
          </div>
        </div>

        {listMode && showTasksColumn && (
          <div
            className={`list-view-drawer__tasks-group${isSelected ? ' list-view-drawer__tasks-group--selected' : ''}`}
            aria-label="Tasks"
            onClick={(e) => e.stopPropagation()}
          >
            <OpenPointsToggle checked={hasOpenPoints} label={openPointsLabel} onChange={onSetOpenPoints} />
          </div>
        )}

        {listMode && showStatusColumn && (
          <StatusRadioGroup
            value={statusKey}
            onChange={onSetStatus}
            groupName={`status-${nodeId}-${level.id}`}
            isSelected={isSelected}
          />
        )}

        {showEstimateColumns && (
          <>
            <MetricSlider
              sizes={EFFORT_SIZES}
              activeValue={effortValue}
              kind="effort"
              isSelected={isSelected}
              customPoints={level.effort?.customPoints ?? null}
              onCustomChange={(pts) => onSetEffort({ size: 'custom', customPoints: pts })}
              onChange={(size) => onSetEffort({ size, customPoints: size === 'custom' ? (level.effort?.customPoints ?? null) : null })}
            />
            <MetricSlider
              sizes={BENEFIT_SIZES}
              activeValue={benefitValue}
              kind="value"
              isSelected={isSelected}
              onChange={(size) => onSetBenefit({ size })}
            />
          </>
        )}

        {listMode && showScopeColumn && (
          <ScopeAssignGroup
            scopeOptions={allScopeOptions}
            selectedScopeIds={level.scopeIds ?? []}
            onChange={onSetScopeIds}
            isSelected={isSelected}
          />
        )}

        {listMode && showReleaseNotesColumn && (
          <ReleaseNoteEditor
            value={level.releaseNote ?? ''}
            onChange={onSetReleaseNote}
            isSelected={isSelected}
          />
        )}
      </div>
    </li>
  )
}

// ── TreeNode ──────────────────────────────────────────────────────────────────

const TreeNode = ({
  node,
  depth,
  scopeMap,
  collapsedIds,
  onToggle,
  onSelectNode,
  onSelectLevel,
  showLevels,
  showEstimateColumns,
  selectedReleaseId,
  matchesLevelFilters,
  onSetLevelEffort,
  onSetLevelBenefit,
  onSetLevelStatus,
  onSetLevelScopeIds,
  onSetLevelOpenPoints,
  onSetLevelReleaseNote,
  selectedNodeId,
  selectedProgressLevelId,
  selectedLevelKeys,
  selectionMode = false,
  showTasksColumn = false,
}) => {
  const hasChildren = (node.children ?? []).length > 0
  const levels = node.levels ?? []
  const filteredLevels = showLevels ? levels.filter(matchesLevelFilters) : []
  const hasLevels = showLevels && filteredLevels.length > 0
  const isCollapsed = collapsedIds.has(node.id)
  const borderColor = getStatusBorderColor(getDisplayStatusKey(node, selectedReleaseId))
  const hasExpandable = hasChildren || hasLevels
  const isExpanded = !isCollapsed
  const isNodeSelected = selectedNodeId === node.id && !selectedProgressLevelId
  const isNodeFullyHidden = levels.length > 0
    ? levels.every((l) => normalizeStatusKey(getLevelStatus(l, selectedReleaseId)) === 'hidden')
    : normalizeStatusKey(getDisplayStatusKey(node, selectedReleaseId)) === 'hidden'

  const scopeIds = getNodeScopeIds(node)
  const scopeEntries = [...scopeIds].map((id) => scopeMap.get(id)).filter(Boolean)
  const nodeHasOpenPoints = levels.some((level) => Boolean(level?.hasOpenPoints))
  const nodeOpenPointsLabel = String(levels.find((level) => level?.hasOpenPoints)?.openPointsLabel ?? '').trim() || 'Open point'

  return (
    <>
      <li
        className="list-view-drawer__item"
        style={{ paddingLeft: `${0.5 + depth * 1}rem`, opacity: isNodeFullyHidden ? 0.55 : undefined }}
      >
        <div className="list-view-drawer__item-row" style={{ borderRight: `3px solid ${borderColor}` }}>
          <button
            className={`list-view-drawer__toggle${hasExpandable ? '' : ' list-view-drawer__toggle--leaf'}`}
            onClick={(e) => { e.stopPropagation(); if (hasExpandable) onToggle(node.id) }}
            aria-label={isCollapsed ? 'Expand' : 'Collapse'}
            tabIndex={hasExpandable ? 0 : -1}
            aria-hidden={!hasExpandable}
          >
            {hasExpandable ? (isCollapsed ? '▶' : '▼') : ''}
          </button>
          <div
            className={`list-view-drawer__item-body${isNodeSelected ? ' list-view-drawer__item-body--selected' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => onSelectNode(node.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectNode(node.id) }}
          >
            <div className="list-view-drawer__item-mainline">
              <span className="list-view-drawer__item-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {isNodeFullyHidden && <EyeOffIcon />}
                {node.label || node.shortName || '\u2013'}
                {nodeHasOpenPoints && <span className="list-view-drawer__node-open-dot" aria-label={nodeOpenPointsLabel} title={nodeOpenPointsLabel} />}
                {isNodeFullyHidden && <span style={{ fontSize: '0.7em', color: '#6b7280', marginLeft: 2 }}>(hidden)</span>}
              </span>
              {scopeEntries.length > 0 && !showLevels && (
                <span className="list-view-drawer__item-chips">
                  {scopeEntries.map((scope) => (
                    <ScopeChip key={scope.id} label={scope.label} color={scope.color} />
                  ))}
                </span>
              )}
            </div>
          </div>
        </div>
      </li>

      {isExpanded && hasLevels && filteredLevels.map((level) => (
        <LevelRow
          key={level.id}
          level={level}
          levelIndex={(node.levels ?? []).findIndex((entry) => entry.id === level.id)}
          nodeId={node.id}
          selectedNodeId={selectedNodeId}
          selectedProgressLevelId={selectedProgressLevelId}
          depth={depth + 2}
          scopeMap={scopeMap}
          selectedReleaseId={selectedReleaseId}
          selectedLevelKeys={selectedLevelKeys}
          onSelectLevel={(event) => onSelectLevel(node.id, level.id, selectionMode
            ? { event, multiSelect: true, openInspector: false }
            : { event })}
          onToggleLevelSelection={(checked, event) => onSelectLevel(node.id, level.id, { event, multiSelect: true, openInspector: false })}
          showEstimateColumns={showEstimateColumns}
          onSetEffort={(effort) => onSetLevelEffort(node.id, level.id, effort)}
          onSetBenefit={(benefit) => onSetLevelBenefit(node.id, level.id, benefit)}
          onSetStatus={(status) => onSetLevelStatus(node.id, level.id, status)}
          onSetScopeIds={(scopeIds) => onSetLevelScopeIds(node.id, level.id, scopeIds)}
          onSetOpenPoints={(hasOpenPoints) => onSetLevelOpenPoints(node.id, level.id, hasOpenPoints)}
          onSetReleaseNote={(releaseNote) => onSetLevelReleaseNote(node.id, level.id, releaseNote)}
          showStatusColumn={false}
          showTasksColumn={false}
          showScopeColumn={false}
          showReleaseNotesColumn={false}
          listMode={false}
          selectionMode={selectionMode}
        />
      ))}

      {isExpanded && hasChildren && (node.children ?? []).map((child) => (
        <TreeNode
          key={child.id}
          node={child}
          depth={depth + 1}
          scopeMap={scopeMap}
          collapsedIds={collapsedIds}
          onToggle={onToggle}
          onSelectNode={onSelectNode}
          onSelectLevel={onSelectLevel}
          showLevels={showLevels}
          showEstimateColumns={showEstimateColumns}
          selectedReleaseId={selectedReleaseId}
          matchesLevelFilters={matchesLevelFilters}
          onSetLevelEffort={onSetLevelEffort}
          onSetLevelBenefit={onSetLevelBenefit}
          onSetLevelStatus={onSetLevelStatus}
          onSetLevelScopeIds={onSetLevelScopeIds}
          onSetLevelOpenPoints={onSetLevelOpenPoints}
          onSetLevelReleaseNote={onSetLevelReleaseNote}
          selectedNodeId={selectedNodeId}
          selectedProgressLevelId={selectedProgressLevelId}
          selectedLevelKeys={selectedLevelKeys}
          selectionMode={selectionMode}
          showTasksColumn={showTasksColumn}
        />
      ))}
    </>
  )
}

// ── flat collection helpers ───────────────────────────────────────────────────

const collectFlatLevels = (nodes, matchesLevelFilters) => {
  const result = []
  const walk = (nodeList) => {
    for (const node of nodeList) {
      for (const [levelIndex, level] of (node.levels ?? []).entries()) {
        if (!matchesLevelFilters(level, node)) {
          continue
        }
        result.push({ node, level, levelIndex })
      }
      walk(node.children ?? [])
    }
  }
  walk(nodes)
  return result
}

const collectFlatNodes = (nodes, matchesNodeFilters) => {
  const result = []
  const walk = (nodeList) => {
    for (const node of nodeList) {
      if (matchesNodeFilters(node)) result.push(node)
      walk(node.children ?? [])
    }
  }
  walk(nodes)
  return result
}

// ── main component ────────────────────────────────────────────────────────────

export function ListViewDrawer({
  opened,
  onClose,
  document,
  onSelectNode,
  onSelectLevel,
  onSetLevelEffort = () => {},
  onSetLevelBenefit = () => {},
  onSetLevelStatus = () => {},
  onSetLevelScopeIds = () => {},
  onSetLevelOpenPoints = () => {},
  onApplyOpenPointsTag = () => {},
  onSetLevelReleaseNote = () => {},
  selectedReleaseId = null,
  selectedNodeId = null,
  selectedProgressLevelId = null,
  selectedLevelKeys = [],
  onSelectAllVisibleLevels = () => {},
  onClearLevelSelection = () => {},
  embedded = false,
  onWidthChange = null,
}) {
  const drawerRef = useRef(null)
  const columnsMenuRef = useRef(null)
  const tagMenuRef = useRef(null)
  const pendingTagFrameRef = useRef(null)
  const previousOpenPointsCountRef = useRef(documentHasOpenPoints(document) ? 1 : 0)

  // ── state (all declared before any callback that might reference them) ──────
  const [drawerWidth, setDrawerWidth] = useState(null) // null = use CSS default
  const [collapsedIds, setCollapsedIds] = useState(new Set())
  const [showLevels, setShowLevels] = useState(true)
  const [showEstimateColumns, setShowEstimateColumns] = useState(false)
  const [showStatusColumn, setShowStatusColumn] = useState(true)
  const [showTasksColumn, setShowTasksColumn] = useState(() => documentHasOpenPoints(document))
  const [showScopeColumn, setShowScopeColumn] = useState(true)
  const [showReleaseNotesColumn, setShowReleaseNotesColumn] = useState(false)
  const [showColumnsMenu, setShowColumnsMenu] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [scopeFilter, setScopeFilter] = useState(SCOPE_FILTER_ALL)
  const [openPointsFilter, setOpenPointsFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [openInspectorOnSelect, setOpenInspectorOnSelect] = useState(false)
  const [viewMode, setViewMode] = useState('list') // 'tree' | 'list'
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false)
  const [showTagMenu, setShowTagMenu] = useState(false)
  const [tagDraft, setTagDraft] = useState('')

  const columnMinWidth = useMemo(() => {
    const showListColumns = viewMode === 'list' && showLevels
    return Math.min(2200, Math.max(
      420,
      420
        + (showEstimateColumns ? 340 : 0)
        + (showListColumns && showStatusColumn ? 124 : 0)
        + (showListColumns && showTasksColumn ? 190 : 0)
        + (showListColumns && showScopeColumn ? 280 : 0)
        + (showListColumns && showReleaseNotesColumn ? 320 : 0),
    ))
  }, [showEstimateColumns, showLevels, showReleaseNotesColumn, showScopeColumn, showStatusColumn, showTasksColumn, viewMode])

  const handleResizePointerDown = useCallback((e) => {
    e.preventDefault()
    const startX = e.clientX
    const minWidth = columnMinWidth
    // Use live DOM width; fall back to 420 if element not yet measured
    const startWidth = drawerRef.current?.getBoundingClientRect().width ?? 420
    const onMove = (mv) => {
      const newWidth = Math.max(minWidth, Math.min(2200, startWidth + (mv.clientX - startX)))
      setDrawerWidth(newWidth)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [columnMinWidth])

  useEffect(() => {
    if (!showLevels) {
      if (showEstimateColumns) setShowEstimateColumns(false)
      if (showTasksColumn) setShowTasksColumn(false)
      if (isMultiSelectMode) setIsMultiSelectMode(false)
    }
  }, [isMultiSelectMode, showEstimateColumns, showLevels, showTasksColumn])

  useEffect(() => {
    if (drawerWidth !== null && drawerWidth < columnMinWidth) {
      setDrawerWidth(columnMinWidth)
    }
  }, [columnMinWidth, drawerWidth])

  useEffect(() => {
    if (!showColumnsMenu && !showTagMenu) return undefined

    const handlePointerDown = (event) => {
      if (!columnsMenuRef.current?.contains(event.target)) {
        setShowColumnsMenu(false)
      }
      if (!tagMenuRef.current?.contains(event.target)) {
        setShowTagMenu(false)
      }
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setShowColumnsMenu(false)
        setShowTagMenu(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown, true)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [showColumnsMenu, showTagMenu])

  useEffect(() => {
    if (embedded && typeof onWidthChange === 'function') {
      onWidthChange(columnMinWidth)
    }
  }, [columnMinWidth, embedded, onWidthChange])

  useEffect(() => () => {
    if (pendingTagFrameRef.current && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(pendingTagFrameRef.current)
    }
  }, [])

  useEffect(() => {
    if (!isMultiSelectMode) {
      setShowTagMenu(false)
    }
  }, [isMultiSelectMode])

  const handleToggle = useCallback((nodeId) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })
  }, [])

  const applyTagToSelection = useCallback((value) => {
    const nextTag = String(value ?? '').trim()
    if (!nextTag) {
      return
    }

    const selectedKeysSnapshot = [...selectedLevelKeys]
    setTagDraft('')
    setShowTagMenu(false)

    const runApply = () => onApplyOpenPointsTag(nextTag, selectedKeysSnapshot)

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      if (pendingTagFrameRef.current) {
        window.cancelAnimationFrame(pendingTagFrameRef.current)
      }
      pendingTagFrameRef.current = window.requestAnimationFrame(() => {
        pendingTagFrameRef.current = null
        runApply()
      })
      return
    }

    runApply()
  }, [onApplyOpenPointsTag, selectedLevelKeys])

  const allRootNodes = document?.children ?? []
  const scopeMap = new Map((document?.scopes ?? []).map((s) => [s.id, s]))
  const scopeFilterOptions = document?.scopes ?? []
  const availableOpenPointsTags = useMemo(() => {
    const tags = new Set()
    const walk = (nodes) => {
      for (const node of nodes) {
        for (const level of node.levels ?? []) {
          const label = String(level?.openPointsLabel ?? '').trim()
          if (label) {
            tags.add(label)
          }
        }
        walk(node.children ?? [])
      }
    }
    walk(allRootNodes)
    return Array.from(tags)
  }, [allRootNodes])

  const normalizedSearchQuery = searchQuery.trim().toLowerCase()

  const matchesScopeFilter = useCallback((scopeIds = []) => {
    return scopeIdsMatchFilter(scopeIds, scopeFilter, scopeFilterOptions)
  }, [scopeFilter, scopeFilterOptions])

  const matchesSearchFilter = useCallback((parts = []) => {
    if (!normalizedSearchQuery) return true
    return parts.some((part) => String(part ?? '').toLowerCase().includes(normalizedSearchQuery))
  }, [normalizedSearchQuery])

  const matchesOpenPointsFilter = useCallback((level) => {
    const hasOpenPoints = Boolean(level?.hasOpenPoints)
    if (openPointsFilter === 'open') return hasOpenPoints
    if (openPointsFilter === 'clear') return !hasOpenPoints
    return true
  }, [openPointsFilter])

  const matchesBaseLevelFilters = useCallback((level, node = null) => {
    const statusKey = normalizeStatusKey(getLevelStatus(level, selectedReleaseId))
    if (statusFilter !== 'all' && statusKey !== statusFilter) return false
    if (!matchesScopeFilter(level.scopeIds ?? [])) return false

    const scopeLabels = (level.scopeIds ?? []).map((id) => scopeMap.get(id)?.label).filter(Boolean)
    const levelIndex = (node?.levels ?? []).findIndex((entry) => entry?.id === level?.id)

    return matchesSearchFilter([
      level.label,
      getLevelDisplayLabel(level?.label, levelIndex >= 0 ? levelIndex : 0),
      node?.label,
      node?.shortName,
      ...scopeLabels,
    ])
  }, [matchesScopeFilter, matchesSearchFilter, scopeMap, selectedReleaseId, statusFilter])

  const matchesLevelFilters = useCallback((level, node = null) => {
    if (!matchesBaseLevelFilters(level, node)) {
      return false
    }

    return matchesOpenPointsFilter(level)
  }, [matchesBaseLevelFilters, matchesOpenPointsFilter])

  const matchesNodeFilters = useCallback((node) => {
    const levels = node.levels ?? []
    if (levels.length > 0) return levels.some((level) => matchesLevelFilters(level, node))
    if (openPointsFilter === 'open') return false
    const statusKey = normalizeStatusKey(getDisplayStatusKey(node, selectedReleaseId))
    if (statusFilter !== 'all' && statusKey !== statusFilter) return false
    if (!matchesScopeFilter([...getNodeScopeIds(node)])) return false

    const scopeLabels = [...getNodeScopeIds(node)].map((id) => scopeMap.get(id)?.label).filter(Boolean)
    return matchesSearchFilter([node.label, node.shortName, ...scopeLabels])
  }, [matchesLevelFilters, matchesScopeFilter, matchesSearchFilter, openPointsFilter, scopeMap, selectedReleaseId, statusFilter])

  const filteredRootNodes = useMemo(() => {
    const filterTree = (nodes) => {
      const next = []
      for (const node of nodes) {
        const filteredChildren = filterTree(node.children ?? [])
        const includeSelf = matchesNodeFilters(node)
        if (includeSelf || filteredChildren.length > 0) {
          next.push({ ...node, children: filteredChildren })
        }
      }
      return next
    }
    return filterTree(allRootNodes)
  }, [allRootNodes, matchesNodeFilters])

  const levelEntriesForCounter = useMemo(
    () => collectFlatLevels(allRootNodes, matchesBaseLevelFilters),
    [allRootNodes, matchesBaseLevelFilters],
  )

  const flatLevelEntries = useMemo(
    () => (viewMode === 'list' && showLevels ? collectFlatLevels(allRootNodes, matchesLevelFilters) : []),
    [viewMode, showLevels, allRootNodes, matchesLevelFilters],
  )

  const flatNodes = useMemo(
    () => (viewMode === 'list' && !showLevels ? collectFlatNodes(allRootNodes, matchesNodeFilters) : []),
    [viewMode, showLevels, allRootNodes, matchesNodeFilters],
  )

  const visibleLevelEntries = useMemo(
    () => (showLevels
      ? (viewMode === 'list' ? flatLevelEntries : collectFlatLevels(filteredRootNodes, (level, node) => matchesLevelFilters(level, node)))
      : []),
    [filteredRootNodes, flatLevelEntries, matchesLevelFilters, showLevels, viewMode],
  )

  if (!opened) return null

  const isEmpty = allRootNodes.length === 0
  const isListMode = viewMode === 'list'
  const openPointsCount = levelEntriesForCounter.filter(({ level }) => Boolean(level?.hasOpenPoints)).length
  const openPointsTotalCount = levelEntriesForCounter.length

  useEffect(() => {
    if (openPointsCount > previousOpenPointsCountRef.current) {
      setShowTasksColumn(true)
    }
    previousOpenPointsCountRef.current = openPointsCount
  }, [openPointsCount])
  const isFilteredEmpty = !isEmpty && (
    isListMode
      ? (showLevels ? flatLevelEntries.length === 0 : flatNodes.length === 0)
      : filteredRootNodes.length === 0
  )
  const effectiveDrawerWidth = drawerWidth ?? columnMinWidth
  const drawerStyle = embedded ? { width: '100%' } : { width: `${effectiveDrawerWidth}px` }
  const canTagSelectedLevels = showLevels && selectedLevelKeys.length > 0

  return (
    <div
      ref={drawerRef}
      className={`list-view-drawer${effectiveDrawerWidth > 420 ? ' list-view-drawer--wide' : ''}${embedded ? ' list-view-drawer--embedded' : ''}`}
      style={drawerStyle}
    >
      {!embedded && (
        <div
          className="list-view-drawer__resize-handle"
          role="separator"
          aria-label="Resize list view"
          onPointerDown={handleResizePointerDown}
        />
      )}
      <div className="list-view-drawer__header">
        <div className="list-view-drawer__header-top">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0, flexWrap: 'wrap' }}>
            <span className="list-view-drawer__title">Node List</span>
            {showLevels && (
              <span className="list-view-drawer__counter" aria-label="Open points counter">
                {`Open points ${openPointsCount}/${openPointsTotalCount}`}
              </span>
            )}
            {showLevels && (
              <span className="list-view-drawer__counter" aria-label="Selected levels counter" style={{ borderColor: 'rgba(59, 130, 246, 0.35)', background: 'rgba(30, 64, 175, 0.18)', color: '#93c5fd' }}>
                {`Selected ${selectedLevelKeys.length}`}
              </span>
            )}
          </div>
          <button className="list-view-drawer__close" onClick={onClose} aria-label="Close list view">x</button>
        </div>

        <div className="list-view-drawer__header-controls">
          {/* Tree / List mode */}
          <div className="list-view-drawer__toggle-group" role="group" aria-label="View mode">
            <button
              type="button"
              className={`list-view-drawer__icon-toggle${viewMode === 'tree' ? ' list-view-drawer__icon-toggle--active' : ''}`}
              onClick={() => setViewMode('tree')}
              aria-label="Tree view"
              title="Tree view"
            >
              <IconTree />
            </button>
            <button
              type="button"
              className={`list-view-drawer__icon-toggle${viewMode === 'list' ? ' list-view-drawer__icon-toggle--active' : ''}`}
              onClick={() => setViewMode('list')}
              aria-label="List view"
              title="List view"
            >
              <IconList />
            </button>
          </div>

          {/* Levels icon toggle */}
          <button
            type="button"
            className={`list-view-drawer__icon-toggle${showLevels ? ' list-view-drawer__icon-toggle--active' : ''}`}
            onClick={() => setShowLevels((v) => !v)}
            aria-label={showLevels ? 'Hide levels' : 'Show levels'}
            title="Levels"
          >
            <IconLayers />
          </button>

          {showLevels && (
            <div className="list-view-drawer__columns-menu-wrap" ref={columnsMenuRef}>
              <button
                type="button"
                className={`list-view-drawer__icon-toggle${showColumnsMenu ? ' list-view-drawer__icon-toggle--active' : ''}`}
                onClick={() => setShowColumnsMenu((open) => !open)}
                aria-label="Columns"
                aria-haspopup="menu"
                aria-expanded={showColumnsMenu}
                title="Columns"
              >
                <IconColumns />
              </button>

              {showColumnsMenu && (
                <div className="list-view-drawer__columns-menu" role="menu" aria-label="Columns">
                  {viewMode === 'list' && (
                    <>
                      <label className="list-view-drawer__columns-option">
                        <input
                          type="checkbox"
                          checked={showTasksColumn}
                          onChange={(e) => setShowTasksColumn(e.target.checked)}
                        />
                        <span className="list-view-drawer__columns-option-icon"><IconChecklist /></span>
                        <span>Tasks</span>
                      </label>

                      <label className="list-view-drawer__columns-option">
                        <input
                          type="checkbox"
                          checked={showStatusColumn}
                          onChange={(e) => setShowStatusColumn(e.target.checked)}
                        />
                        <span className="list-view-drawer__columns-option-icon"><IconStatus /></span>
                        <span>Status</span>
                      </label>
                    </>
                  )}

                  <label className="list-view-drawer__columns-option">
                    <input
                      type="checkbox"
                      checked={showEstimateColumns}
                      onChange={(e) => setShowEstimateColumns(e.target.checked)}
                    />
                    <span className="list-view-drawer__columns-option-icon"><IconBolt /><IconStar /></span>
                    <span>Effort / Value</span>
                  </label>

                  {viewMode === 'list' && (
                    <>
                      <label className="list-view-drawer__columns-option">
                        <input
                          type="checkbox"
                          checked={showScopeColumn}
                          onChange={(e) => setShowScopeColumn(e.target.checked)}
                        />
                        <span className="list-view-drawer__columns-option-icon"><IconScope /></span>
                        <span>Scopes</span>
                      </label>

                      <label className="list-view-drawer__columns-option">
                        <input
                          type="checkbox"
                          checked={showReleaseNotesColumn}
                          onChange={(e) => setShowReleaseNotesColumn(e.target.checked)}
                        />
                        <span className="list-view-drawer__columns-option-icon">📝</span>
                        <span>Release Notes</span>
                      </label>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <span className="list-view-drawer__header-sep" aria-hidden="true" />

          <select
            className="list-view-drawer__filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="all">All Statuses</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>

          <select
            className="list-view-drawer__filter-select"
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value)}
            aria-label="Filter by scope"
          >
            <option value={SCOPE_FILTER_ALL}>All Scopes</option>
            {scopeFilterOptions.map((scope) => (
              <option key={scope.id} value={scope.id}>{scope.label}</option>
            ))}
          </select>

          <select
            className="list-view-drawer__filter-select"
            value={openPointsFilter}
            onChange={(e) => setOpenPointsFilter(e.target.value)}
            aria-label="Filter by open points"
          >
            <option value="all">All Flags</option>
            <option value="open">Open points</option>
            <option value="clear">Without tag</option>
          </select>

          {showLevels && (
            <>
              <button
                type="button"
                className={`list-view-drawer__icon-toggle${isMultiSelectMode ? ' list-view-drawer__icon-toggle--active' : ''}`}
                onClick={() => setIsMultiSelectMode((prev) => !prev)}
                aria-label="Multi-select levels"
                title="Multi-select levels"
              >
                <IconMultiSelect />
              </button>

              <div className="list-view-drawer__columns-menu-wrap" ref={tagMenuRef}>
                <button
                  type="button"
                  className={`list-view-drawer__icon-toggle${showTagMenu ? ' list-view-drawer__icon-toggle--active' : ''}`}
                  onClick={() => {
                    if (!canTagSelectedLevels) {
                      return
                    }
                    setShowTagMenu((open) => !open)
                  }}
                  aria-label="Tag selected levels"
                  title={canTagSelectedLevels ? 'Tag selected levels' : 'Select levels first'}
                  disabled={!canTagSelectedLevels}
                >
                  <IconChecklist />
                </button>

                {showTagMenu && (
                  <div className="list-view-drawer__columns-menu" role="menu" aria-label="Tag selected levels">
                    <div className="list-view-drawer__tag-section-title">Existing tags</div>
                    {availableOpenPointsTags.length > 0 ? availableOpenPointsTags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        className="list-view-drawer__columns-option list-view-drawer__columns-option--button"
                        onClick={() => applyTagToSelection(tag)}
                      >
                        <span className="list-view-drawer__open-points-dot" aria-hidden="true" />
                        <span>{tag}</span>
                      </button>
                    )) : (
                      <div className="list-view-drawer__tag-empty">No tags yet</div>
                    )}

                    <div className="list-view-drawer__tag-section-title">New tag</div>
                    <div className="list-view-drawer__tag-input-row">
                      <input
                        type="text"
                        className="list-view-drawer__search-input"
                        value={tagDraft}
                        onChange={(event) => setTagDraft(event.currentTarget.value)}
                        placeholder="Add tag"
                        aria-label="Add new tag"
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            applyTagToSelection(tagDraft)
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="list-view-drawer__mini-action"
                        onClick={() => applyTagToSelection(tagDraft)}
                        disabled={!String(tagDraft ?? '').trim()}
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="list-view-drawer__search-row">
          <input
            type="text"
            className="list-view-drawer__search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search visible list…"
            aria-label="Search list"
          />
          <button
            type="button"
            className="list-view-drawer__mini-action"
            onClick={() => onSelectAllVisibleLevels(visibleLevelEntries.map(({ node, level }) => ({ nodeId: node.id, levelId: level.id })))}
            disabled={!showLevels || !isMultiSelectMode || visibleLevelEntries.length === 0}
          >
            All
          </button>
          <button
            type="button"
            className="list-view-drawer__mini-action"
            onClick={onClearLevelSelection}
            disabled={!isMultiSelectMode || selectedLevelKeys.length === 0}
          >
            Clear
          </button>
          <label className="list-view-drawer__inspector-toggle">
            <input
              type="checkbox"
              checked={openInspectorOnSelect}
              onChange={(e) => setOpenInspectorOnSelect(e.target.checked)}
            />
            <span>Inspector</span>
          </label>
        </div>
      </div>

      <div className="list-view-drawer__content">
        {showLevels && (showEstimateColumns || (isListMode && (showStatusColumn || showTasksColumn || showScopeColumn || showReleaseNotesColumn))) && (
          <div className="list-view-drawer__metrics-header" aria-hidden="true">
            <span className="list-view-drawer__metrics-header-spacer" />
            {isListMode && showTasksColumn && <span className="list-view-drawer__metrics-header-col list-view-drawer__metrics-header-col--tasks">Tasks</span>}
            {isListMode && showStatusColumn && <span className="list-view-drawer__metrics-header-col list-view-drawer__metrics-header-col--status">Status</span>}
            {showEstimateColumns && <span className="list-view-drawer__metrics-header-col list-view-drawer__metrics-header-col--effort">Effort</span>}
            {showEstimateColumns && <span className="list-view-drawer__metrics-header-col list-view-drawer__metrics-header-col--value">Value</span>}
            {isListMode && showScopeColumn && <span className="list-view-drawer__metrics-header-col list-view-drawer__metrics-header-col--scopes">Scopes</span>}
            {isListMode && showReleaseNotesColumn && <span className="list-view-drawer__metrics-header-col list-view-drawer__metrics-header-col--notes">Release Notes</span>}
          </div>
        )}

        {isEmpty ? (
          <div className="list-view-drawer__empty">No nodes yet.</div>
        ) : isFilteredEmpty ? (
          <div className="list-view-drawer__empty">No nodes match the selected filters.</div>
        ) : isListMode && showLevels ? (
          /* flat level list */
          <ul className="list-view-drawer__list">
            {flatLevelEntries.map(({ node, level, levelIndex }) => (
              <LevelRow
                key={`${node.id}::${level.id}`}
                level={level}
                levelIndex={levelIndex}
                nodeId={node.id}
                selectedNodeId={selectedNodeId}
                selectedProgressLevelId={selectedProgressLevelId}
                nodeLabel={node.label || node.shortName}
                depth={0}
                scopeMap={scopeMap}
                selectedReleaseId={selectedReleaseId}
                selectedLevelKeys={selectedLevelKeys}
                onSelectLevel={(event) => onSelectLevel(node.id, level.id, isMultiSelectMode
                  ? { openInspector: false, event, multiSelect: true }
                  : { openInspector: openInspectorOnSelect, event })}
                onToggleLevelSelection={(checked, event) => onSelectLevel(node.id, level.id, { openInspector: false, event, multiSelect: true })}
                showEstimateColumns={showEstimateColumns}
                onSetEffort={(effort) => onSetLevelEffort(node.id, level.id, effort)}
                onSetBenefit={(benefit) => onSetLevelBenefit(node.id, level.id, benefit)}
                onSetStatus={(status) => onSetLevelStatus(node.id, level.id, status)}
                onSetScopeIds={(scopeIds) => onSetLevelScopeIds(node.id, level.id, scopeIds)}
                onSetOpenPoints={(hasOpenPoints) => onSetLevelOpenPoints(node.id, level.id, hasOpenPoints)}
                onSetReleaseNote={(releaseNote) => onSetLevelReleaseNote(node.id, level.id, releaseNote)}
                showStatusColumn={showStatusColumn}
                showTasksColumn={showTasksColumn}
                showScopeColumn={showScopeColumn}
                showReleaseNotesColumn={showReleaseNotesColumn}
                listMode
                selectionMode={isMultiSelectMode}
              />
            ))}
          </ul>
        ) : isListMode ? (
          /* flat node list */
          <ul className="list-view-drawer__list">
            {flatNodes.map((node) => {
              const borderColor = getStatusBorderColor(getDisplayStatusKey(node, selectedReleaseId))
              const scopeIds = getNodeScopeIds(node)
              const scopeEntries = [...scopeIds].map((id) => scopeMap.get(id)).filter(Boolean)
              const nodeHasOpenPoints = (node.levels ?? []).some((level) => Boolean(level?.hasOpenPoints))
              const nodeOpenPointsLabel = String((node.levels ?? []).find((level) => level?.hasOpenPoints)?.openPointsLabel ?? '').trim() || 'Open point'
              return (
                <li key={node.id} className="list-view-drawer__item" style={{ paddingLeft: '0.5rem' }}>
                  <div className="list-view-drawer__item-row" style={{ borderRight: `3px solid ${borderColor}` }}>
                    <div
                      className={`list-view-drawer__item-body${selectedNodeId === node.id && !selectedProgressLevelId ? ' list-view-drawer__item-body--selected' : ''}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelectNode(node.id, { openInspector: openInspectorOnSelect })}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectNode(node.id, { openInspector: openInspectorOnSelect }) }}
                    >
                      <div className="list-view-drawer__item-mainline">
                        <span className="list-view-drawer__item-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          {node.label || node.shortName || '\u2013'}
                          {nodeHasOpenPoints && <span className="list-view-drawer__node-open-dot" aria-label={nodeOpenPointsLabel} title={nodeOpenPointsLabel} />}
                        </span>
                        {scopeEntries.length > 0 && (
                          <span className="list-view-drawer__item-chips">
                            {scopeEntries.map((scope) => (
                              <ScopeChip key={scope.id} label={scope.label} color={scope.color} />
                            ))}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          /* tree view */
          <ul className="list-view-drawer__list">
            {filteredRootNodes.map((node) => (
              <TreeNode
                key={node.id}
                node={node}
                depth={0}
                scopeMap={scopeMap}
                collapsedIds={collapsedIds}
                onToggle={handleToggle}
                onSelectNode={(nodeId, options) => onSelectNode(nodeId, options ?? { openInspector: openInspectorOnSelect })}
                onSelectLevel={(nodeId, levelId, options) => onSelectLevel(nodeId, levelId, options ?? { openInspector: openInspectorOnSelect })}
                selectedLevelKeys={selectedLevelKeys}
                selectionMode={isMultiSelectMode}
                showLevels={showLevels}
                showEstimateColumns={showEstimateColumns}
                selectedReleaseId={selectedReleaseId}
                matchesLevelFilters={matchesLevelFilters}
                onSetLevelEffort={onSetLevelEffort}
                onSetLevelBenefit={onSetLevelBenefit}
                onSetLevelStatus={onSetLevelStatus}
                onSetLevelScopeIds={onSetLevelScopeIds}
                onSetLevelOpenPoints={onSetLevelOpenPoints}
                selectedNodeId={selectedNodeId}
                selectedProgressLevelId={selectedProgressLevelId}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
