import { MultiSelect } from '@mantine/core'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

// ── helpers ───────────────────────────────────────────────────────────────────

const ScopeChip = ({ label, color }) => (
  <span
    className="list-view-drawer__chip list-view-drawer__chip--scope"
    style={color ? { borderColor: color, color } : undefined}
  >
    {label}
  </span>
)

const OpenPointsToggle = ({ checked = false, onChange = () => {} }) => (
  <button
    type="button"
    className={`list-view-drawer__open-points-toggle${checked ? ' list-view-drawer__open-points-toggle--active' : ''}`}
    aria-pressed={checked}
    aria-label={checked ? 'Clear open points' : 'Mark open points'}
    title={checked ? 'Click to mark done' : 'Click to flag open points'}
    onClick={(event) => {
      event.stopPropagation()
      onChange(!checked)
    }}
  >
    <span className="list-view-drawer__open-points-dot" aria-hidden="true" />
    <span>{checked ? 'Open points' : 'Done'}</span>
  </button>
)

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

const DEFAULT_COLUMN_ORDER = ['value', 'effort', 'status', 'scopes', 'notes']
const COLUMN_LABELS = {
  value: 'Value',
  effort: 'Effort',
  status: 'Status',
  scopes: 'Scopes',
  notes: 'Release Notes',
}
const DEFAULT_COLUMN_WIDTHS = {
  value: 148,
  effort: 188,
  status: 372,
  scopes: 220,
  notes: 320,
}
const MIN_COLUMN_WIDTHS = {
  value: 120,
  effort: 150,
  status: 280,
  scopes: 160,
  notes: 260,
}

const clampColumnWidth = (key, width) => {
  const minWidth = MIN_COLUMN_WIDTHS[key] ?? 120
  const maxWidth = key === 'notes' ? 760 : 520
  return Math.max(minWidth, Math.min(maxWidth, Number(width) || minWidth))
}

// ── Metric slider ─────────────────────────────────────────────────────────────

const MetricSlider = ({ sizes, activeValue, onChange, kind, customPoints, onCustomChange, isSelected = false, width = null }) => {
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
      style={width ? { width: `${width}px` } : undefined}
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

const StatusRadioGroup = ({ value, onChange, groupName, isSelected = false, width = null }) => (
  <div
    className={`list-view-drawer__status-group${isSelected ? ' list-view-drawer__status-group--selected' : ''}`}
    style={width ? { width: `${width}px` } : undefined}
    role="radiogroup"
    aria-label="Status"
    onClick={(e) => e.stopPropagation()}
  >
    {STATUS_RADIO_OPTIONS.map((option) => (
      <label
        key={option.value}
        className={`list-view-drawer__status-option${value === option.value ? ' list-view-drawer__status-option--active' : ''}`}
        title={option.label}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="radio"
          name={groupName}
          value={option.value}
          checked={value === option.value}
          onChange={(e) => {
            e.stopPropagation()
            if (e.currentTarget.checked) onChange(option.value)
          }}
        />
        <span
          className={`list-view-drawer__status-pill list-view-drawer__status-pill--${option.value}`}
          style={option.pillStyle}
        >
          {option.label}
        </span>
      </label>
    ))}
  </div>
)

const ScopeAssignGroup = ({ scopeOptions, selectedScopeIds = [], onChange, isSelected = false, width = null }) => {
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
      style={width ? { width: `${width}px` } : undefined}
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

const ReleaseNoteEditor = ({ value, onChange, isSelected = false, width = null }) => {
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
      style={width ? { width: `${width}px` } : undefined}
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
  nodeLabel,
  levelIndex = 0,
  depth,
  scopeMap,
  selectedReleaseId,
  onSelectLevel,
  showEstimateColumns,
  onSetEffort,
  onSetBenefit,
  onSetStatus,
  onSetScopeIds,
  onSetOpenPoints,
  onSetReleaseNote,
  showStatusColumn,
  showScopeColumn,
  showReleaseNotesColumn,
  visibleListColumns = [],
  resolvedColumnWidths = {},
  listMode,
}) => {
  const statusKey = normalizeStatusKey(getLevelStatus(level, selectedReleaseId))
  const isHidden = statusKey === 'hidden'
  const borderColor = getStatusBorderColor(statusKey)
  const scopeEntries = (level.scopeIds ?? []).map((id) => scopeMap.get(id)).filter(Boolean)
  const allScopeOptions = [...scopeMap.values()].filter(Boolean)
  const benefitValue = level.benefit?.size ?? 'unclear'
  const effortValue = level.effort?.size ?? 'unclear'
  const isSelected = selectedNodeId === nodeId && selectedProgressLevelId === level.id
  const levelLabel = getLevelDisplayLabel(level?.label, levelIndex)
  const hasOpenPoints = Boolean(level?.hasOpenPoints)

  const renderListColumn = (columnKey) => {
    const width = resolvedColumnWidths[columnKey] ?? null

    switch (columnKey) {
      case 'value':
        return (
          <MetricSlider
            key="value"
            sizes={BENEFIT_SIZES}
            activeValue={benefitValue}
            kind="value"
            width={width}
            isSelected={isSelected}
            onChange={(size) => onSetBenefit({ size })}
          />
        )
      case 'effort':
        return (
          <MetricSlider
            key="effort"
            sizes={EFFORT_SIZES}
            activeValue={effortValue}
            kind="effort"
            width={width}
            isSelected={isSelected}
            customPoints={level.effort?.customPoints ?? null}
            onCustomChange={(pts) => onSetEffort({ size: 'custom', customPoints: pts })}
            onChange={(size) => onSetEffort({ size, customPoints: size === 'custom' ? (level.effort?.customPoints ?? null) : null })}
          />
        )
      case 'status':
        return (
          <StatusRadioGroup
            key="status"
            value={statusKey}
            width={width}
            onChange={onSetStatus}
            groupName={`status-${nodeId}-${level.id}`}
            isSelected={isSelected}
          />
        )
      case 'scopes':
        return (
          <ScopeAssignGroup
            key="scopes"
            scopeOptions={allScopeOptions}
            selectedScopeIds={level.scopeIds ?? []}
            width={width}
            onChange={onSetScopeIds}
            isSelected={isSelected}
          />
        )
      case 'notes':
        return (
          <ReleaseNoteEditor
            key="notes"
            value={level.releaseNote ?? ''}
            width={width}
            onChange={onSetReleaseNote}
            isSelected={isSelected}
          />
        )
      default:
        return null
    }
  }

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
        <div
          className={`list-view-drawer__item-body list-view-drawer__item-body--level${isSelected ? ' list-view-drawer__item-body--selected' : ''}`}
          role="button"
          tabIndex={0}
          onClick={onSelectLevel}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectLevel() }}
        >
          <div className="list-view-drawer__item-mainline">
            <span
              className="list-view-drawer__item-label list-view-drawer__item-label--level"
              onClick={(event) => {
                event.stopPropagation()
                onSelectLevel()
              }}
            >
              {isHidden && <EyeOffIcon />}
              {listMode && nodeLabel && (
                <span className="list-view-drawer__node-prefix">{nodeLabel}&nbsp;·&nbsp;</span>
              )}
              <span className="list-view-drawer__level-name">{levelLabel}</span>
              {isHidden && <span style={{ fontSize: '0.7em', color: '#6b7280', marginLeft: 2 }}>(hidden)</span>}
            </span>
            <OpenPointsToggle checked={hasOpenPoints} onChange={onSetOpenPoints} />
            {scopeEntries.length > 0 && !(listMode && showScopeColumn) && (
              <span className="list-view-drawer__item-chips">
                {scopeEntries.map((scope) => (
                  <ScopeChip key={scope.id} label={scope.label} color={scope.color} />
                ))}
              </span>
            )}
          </div>
        </div>

        {listMode ? visibleListColumns.map((columnKey) => renderListColumn(columnKey)) : (
          <>
            {showEstimateColumns && (
              <>
                <MetricSlider
                  sizes={BENEFIT_SIZES}
                  activeValue={benefitValue}
                  kind="value"
                  isSelected={isSelected}
                  onChange={(size) => onSetBenefit({ size })}
                />
                <MetricSlider
                  sizes={EFFORT_SIZES}
                  activeValue={effortValue}
                  kind="effort"
                  isSelected={isSelected}
                  customPoints={level.effort?.customPoints ?? null}
                  onCustomChange={(pts) => onSetEffort({ size: 'custom', customPoints: pts })}
                  onChange={(size) => onSetEffort({ size, customPoints: size === 'custom' ? (level.effort?.customPoints ?? null) : null })}
                />
              </>
            )}

            {showStatusColumn && (
              <StatusRadioGroup
                value={statusKey}
                onChange={onSetStatus}
                groupName={`status-${nodeId}-${level.id}`}
                isSelected={isSelected}
              />
            )}

            {showScopeColumn && (
              <ScopeAssignGroup
                scopeOptions={allScopeOptions}
                selectedScopeIds={level.scopeIds ?? []}
                onChange={onSetScopeIds}
                isSelected={isSelected}
              />
            )}

            {showReleaseNotesColumn && (
              <ReleaseNoteEditor
                value={level.releaseNote ?? ''}
                onChange={onSetReleaseNote}
                isSelected={isSelected}
              />
            )}
          </>
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
          onSelectLevel={() => onSelectLevel(node.id, level.id)}
          showEstimateColumns={showEstimateColumns}
          onSetEffort={(effort) => onSetLevelEffort(node.id, level.id, effort)}
          onSetBenefit={(benefit) => onSetLevelBenefit(node.id, level.id, benefit)}
          onSetStatus={(status) => onSetLevelStatus(node.id, level.id, status)}
          onSetScopeIds={(scopeIds) => onSetLevelScopeIds(node.id, level.id, scopeIds)}
          onSetOpenPoints={(hasOpenPoints) => onSetLevelOpenPoints(node.id, level.id, hasOpenPoints)}
          onSetReleaseNote={(releaseNote) => onSetLevelReleaseNote(node.id, level.id, releaseNote)}
          showStatusColumn={false}
          showScopeColumn={false}
          showReleaseNotesColumn={false}
          listMode={false}
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
  onSetLevelReleaseNote = () => {},
  selectedReleaseId = null,
  selectedNodeId = null,
  selectedProgressLevelId = null,
  embedded = false,
  onWidthChange = null,
}) {
  const drawerRef = useRef(null)
  const columnsMenuRef = useRef(null)
  const previousOpenInspectorOnSelectRef = useRef(false)

  // ── state (all declared before any callback that might reference them) ──────
  const [drawerWidth, setDrawerWidth] = useState(null) // null = use CSS default
  const [collapsedIds, setCollapsedIds] = useState(new Set())
  const [showLevels, setShowLevels] = useState(true)
  const [showEstimateColumns, setShowEstimateColumns] = useState(false)
  const [showStatusColumn, setShowStatusColumn] = useState(true)
  const [showScopeColumn, setShowScopeColumn] = useState(true)
  const [showReleaseNotesColumn, setShowReleaseNotesColumn] = useState(false)
  const [showColumnsMenu, setShowColumnsMenu] = useState(false)
  const [columnOrder, setColumnOrder] = useState(DEFAULT_COLUMN_ORDER)
  const [columnWidths, setColumnWidths] = useState({})
  const [draggingColumnKey, setDraggingColumnKey] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [scopeFilter, setScopeFilter] = useState(SCOPE_FILTER_ALL)
  const [openPointsFilter, setOpenPointsFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [openInspectorOnSelect, setOpenInspectorOnSelect] = useState(false)
  const [viewMode, setViewMode] = useState('list') // 'tree' | 'list'

  const isListMode = viewMode === 'list'

  const autoColumnWidths = useMemo(() => {
    const scopeOptions = document?.scopes ?? []
    const longestScopeLabel = scopeOptions.reduce((maxLength, scope) => {
      return Math.max(maxLength, String(scope?.label ?? '').trim().length)
    }, 6)

    const statusWidth = 26 + STATUS_RADIO_OPTIONS.reduce((sum, option) => {
      return sum + Math.max(42, option.label.length * 6 + 18)
    }, 0)

    return {
      ...DEFAULT_COLUMN_WIDTHS,
      status: clampColumnWidth('status', statusWidth),
      scopes: clampColumnWidth('scopes', 120 + Math.min(140, longestScopeLabel * 7)),
      notes: DEFAULT_COLUMN_WIDTHS.notes,
    }
  }, [document])

  const resolvedColumnWidths = useMemo(() => {
    return DEFAULT_COLUMN_ORDER.reduce((acc, key) => {
      acc[key] = clampColumnWidth(key, columnWidths[key] ?? autoColumnWidths[key] ?? DEFAULT_COLUMN_WIDTHS[key])
      return acc
    }, {})
  }, [autoColumnWidths, columnWidths])

  const visibleListColumns = useMemo(() => {
    if (!(isListMode && showLevels)) {
      return []
    }

    return columnOrder.filter((key) => {
      if (key === 'value' || key === 'effort') return showEstimateColumns
      if (key === 'status') return showStatusColumn
      if (key === 'scopes') return showScopeColumn
      if (key === 'notes') return showReleaseNotesColumn
      return false
    })
  }, [columnOrder, isListMode, showEstimateColumns, showLevels, showReleaseNotesColumn, showScopeColumn, showStatusColumn])

  const columnMinWidth = useMemo(() => {
    const extraWidth = visibleListColumns.reduce((sum, key) => sum + (resolvedColumnWidths[key] ?? 0), 0)
    return Math.min(1760, Math.max(420, 420 + extraWidth))
  }, [resolvedColumnWidths, visibleListColumns])

  const handleResizePointerDown = useCallback((e) => {
    e.preventDefault()
    const startX = e.clientX
    const minWidth = columnMinWidth
    // Use live DOM width; fall back to 420 if element not yet measured
    const startWidth = drawerRef.current?.getBoundingClientRect().width ?? 420
    const onMove = (mv) => {
      const newWidth = Math.max(minWidth, Math.min(1760, startWidth + (mv.clientX - startX)))
      setDrawerWidth(newWidth)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [columnMinWidth])

  const moveColumn = useCallback((sourceKey, targetKey) => {
    if (!sourceKey || !targetKey || sourceKey === targetKey) {
      return
    }

    setColumnOrder((prev) => {
      const next = [...prev]
      const fromIndex = next.indexOf(sourceKey)
      const toIndex = next.indexOf(targetKey)

      if (fromIndex === -1 || toIndex === -1) {
        return prev
      }

      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return next
    })
  }, [])

  const handleColumnResizePointerDown = useCallback((event, columnKey) => {
    event.preventDefault()
    event.stopPropagation()

    const startX = event.clientX
    const startWidth = resolvedColumnWidths[columnKey] ?? DEFAULT_COLUMN_WIDTHS[columnKey] ?? 160

    const onMove = (mv) => {
      setColumnWidths((prev) => ({
        ...prev,
        [columnKey]: clampColumnWidth(columnKey, startWidth + (mv.clientX - startX)),
      }))
    }

    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [resolvedColumnWidths])

  const handleResetColumnWidth = useCallback((columnKey) => {
    setColumnWidths((prev) => {
      if (!(columnKey in prev)) {
        return prev
      }

      const next = { ...prev }
      delete next[columnKey]
      return next
    })
  }, [])

  useEffect(() => {
    if (!showLevels && showEstimateColumns) setShowEstimateColumns(false)
  }, [showEstimateColumns, showLevels])

  useEffect(() => {
    if (drawerWidth !== null && drawerWidth < columnMinWidth) {
      setDrawerWidth(columnMinWidth)
    }
  }, [columnMinWidth, drawerWidth])

  useEffect(() => {
    const wasEnabled = previousOpenInspectorOnSelectRef.current
    previousOpenInspectorOnSelectRef.current = openInspectorOnSelect

    if (!openInspectorOnSelect || wasEnabled || !selectedNodeId) {
      return
    }

    if (selectedProgressLevelId) {
      onSelectLevel(selectedNodeId, selectedProgressLevelId, { openInspector: true })
      return
    }

    onSelectNode(selectedNodeId, { openInspector: true })
  }, [onSelectLevel, onSelectNode, openInspectorOnSelect, selectedNodeId, selectedProgressLevelId])

  useEffect(() => {
    if (!showColumnsMenu) return undefined

    const handlePointerDown = (event) => {
      if (!columnsMenuRef.current?.contains(event.target)) {
        setShowColumnsMenu(false)
      }
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setShowColumnsMenu(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown, true)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [showColumnsMenu])

  useEffect(() => {
    if (embedded && typeof onWidthChange === 'function') {
      onWidthChange(columnMinWidth)
    }
  }, [columnMinWidth, embedded, onWidthChange])

  const handleToggle = useCallback((nodeId) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })
  }, [])

  const allRootNodes = useMemo(() => document?.children ?? [], [document])
  const scopeFilterOptions = useMemo(() => document?.scopes ?? [], [document])
  const scopeMap = useMemo(() => new Map(scopeFilterOptions.map((s) => [s.id, s])), [scopeFilterOptions])

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

  if (!opened) return null

  const isEmpty = allRootNodes.length === 0
  const openPointsCount = levelEntriesForCounter.filter(({ level }) => Boolean(level?.hasOpenPoints)).length
  const openPointsTotalCount = levelEntriesForCounter.length
  const isFilteredEmpty = !isEmpty && (
    isListMode
      ? (showLevels ? flatLevelEntries.length === 0 : flatNodes.length === 0)
      : filteredRootNodes.length === 0
  )
  const effectiveDrawerWidth = drawerWidth ?? columnMinWidth
  const drawerStyle = embedded ? { width: '100%' } : { width: `${effectiveDrawerWidth}px` }

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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
            <span className="list-view-drawer__title">Node List</span>
            {showLevels && (
              <span className="list-view-drawer__counter" aria-label="Open points counter">
                {`Open points ${openPointsCount}/${openPointsTotalCount}`}
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
                          checked={showStatusColumn}
                          onChange={(e) => setShowStatusColumn(e.target.checked)}
                        />
                        <span className="list-view-drawer__columns-option-icon"><IconStatus /></span>
                        <span>Status</span>
                      </label>

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
            <option value="clear">Done only</option>
          </select>
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
        {showLevels && visibleListColumns.length > 0 && (
          <div className="list-view-drawer__metrics-header" aria-label="Visible columns">
            <span className="list-view-drawer__metrics-header-spacer" />
            {visibleListColumns.map((columnKey) => (
              <span
                key={columnKey}
                className={`list-view-drawer__metrics-header-col list-view-drawer__metrics-header-col--${columnKey}${draggingColumnKey === columnKey ? ' list-view-drawer__metrics-header-col--dragging' : ''}`}
                style={{ width: `${resolvedColumnWidths[columnKey]}px` }}
                draggable
                title={`Drag to reorder ${COLUMN_LABELS[columnKey]}`}
                onDragStart={(event) => {
                  setDraggingColumnKey(columnKey)
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData('text/plain', columnKey)
                }}
                onDragOver={(event) => {
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  const sourceKey = event.dataTransfer.getData('text/plain') || draggingColumnKey
                  moveColumn(sourceKey, columnKey)
                  setDraggingColumnKey(null)
                }}
                onDragEnd={() => setDraggingColumnKey(null)}
              >
                <span className="list-view-drawer__metrics-header-label">{COLUMN_LABELS[columnKey]}</span>
                <button
                  type="button"
                  className="list-view-drawer__metrics-header-resizer"
                  aria-label={`Resize ${COLUMN_LABELS[columnKey]} column`}
                  title={`Drag to resize ${COLUMN_LABELS[columnKey]} column. Double-click to reset.`}
                  onPointerDown={(event) => handleColumnResizePointerDown(event, columnKey)}
                  onDoubleClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    handleResetColumnWidth(columnKey)
                  }}
                />
              </span>
            ))}
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
                onSelectLevel={() => onSelectLevel(node.id, level.id, { openInspector: openInspectorOnSelect })}
                showEstimateColumns={showEstimateColumns}
                onSetEffort={(effort) => onSetLevelEffort(node.id, level.id, effort)}
                onSetBenefit={(benefit) => onSetLevelBenefit(node.id, level.id, benefit)}
                onSetStatus={(status) => onSetLevelStatus(node.id, level.id, status)}
                onSetScopeIds={(scopeIds) => onSetLevelScopeIds(node.id, level.id, scopeIds)}
                onSetOpenPoints={(hasOpenPoints) => onSetLevelOpenPoints(node.id, level.id, hasOpenPoints)}
                onSetReleaseNote={(releaseNote) => onSetLevelReleaseNote(node.id, level.id, releaseNote)}
                showStatusColumn={showStatusColumn}
                showScopeColumn={showScopeColumn}
                showReleaseNotesColumn={showReleaseNotesColumn}
                visibleListColumns={visibleListColumns}
                resolvedColumnWidths={resolvedColumnWidths}
                listMode
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
                        <span className="list-view-drawer__item-label">{node.label || node.shortName || '\u2013'}</span>
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
