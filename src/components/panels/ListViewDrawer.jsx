import { ActionIcon, Modal, MultiSelect, Select, Text } from '@mantine/core'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { STATUS_LABELS, STATUS_STYLES, normalizeStatusKey } from '../config'
import { BENEFIT_SIZE_LABELS, BENEFIT_SIZES, EFFORT_SIZE_LABELS, EFFORT_SIZES } from '../utils/effortBenefit'
import { commitReleaseNoteDraft } from '../utils/releaseNoteDraft'
import { convertRichTextHtmlToMarkdown, insertMarkdownText } from '../utils/markdown'
import { getDisplayStatusKey, getLevelStatus } from '../utils/nodeStatus'
import { SCOPE_FILTER_ALL, scopeIdsMatchFilter } from '../utils/visibility'
import { getLevelDisplayLabel } from '../utils/treeData'
import { UNASSIGNED_SEGMENT_ID } from '../utils/layoutShared'

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

const IconExpand = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 3H3v5" />
    <path d="M3 3l7 7" />
    <path d="M16 3h5v5" />
    <path d="M21 3l-7 7" />
    <path d="M8 21H3v-5" />
    <path d="M3 21l7-7" />
    <path d="M16 21h5v-5" />
    <path d="M21 21l-7-7" />
  </svg>
)

const IconCompress = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 3h6v6" />
    <path d="M21 3l-7 7" />
    <path d="M9 21H3v-6" />
    <path d="M3 21l7-7" />
    <path d="M21 15v6h-6" />
    <path d="M21 21l-7-7" />
    <path d="M3 9V3h6" />
    <path d="M3 3l7 7" />
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

const DEFAULT_COLUMN_ORDER = ['value', 'effort', 'status', 'scopes', 'segments', 'notes']
const COLUMN_LABELS = {
  value: 'Value',
  effort: 'Effort',
  status: 'Status',
  scopes: 'Scopes',
  segments: 'Segments',
  notes: 'Release Notes',
}
const DEFAULT_COLUMN_WIDTHS = {
  value: 148,
  effort: 188,
  status: 372,
  scopes: 220,
  segments: 220,
  notes: 320,
}
const MIN_COLUMN_WIDTHS = {
  value: 120,
  effort: 150,
  status: 280,
  scopes: 160,
  segments: 170,
  notes: 260,
}
const SORT_FIELD_LABELS = {
  name: 'Name',
  value: 'Value',
  effort: 'Effort',
  status: 'Status',
  scopes: 'Scopes',
  segments: 'Segments',
  notes: 'Release Notes',
}
const SORT_FIELD_OPTIONS = Object.entries(SORT_FIELD_LABELS).map(([value, label]) => ({ value, label }))
const DEFAULT_SORT_SELECTION = {
  field: 'name',
  direction: 'roadmap',
}
const LABEL_COLUMN_MIN_WIDTH = 260
const LABEL_COLUMN_MAX_WIDTH = 680
const SELECTION_COLUMN_WIDTH = 32

const getLongestLineLength = (value) => {
  return String(value ?? '')
    .split(/\r?\n/)
    .reduce((maxLength, line) => Math.max(maxLength, line.trim().length), 0)
}

const estimateTextWidth = (value, { charWidth = 7, padding = 0 } = {}) => {
  return Math.ceil(getLongestLineLength(value) * charWidth + padding)
}

const clampLabelColumnWidth = (width) => {
  return Math.max(LABEL_COLUMN_MIN_WIDTH, Math.min(LABEL_COLUMN_MAX_WIDTH, Number(width) || LABEL_COLUMN_MIN_WIDTH))
}

const getScopeSummaryLabel = (scopeIds = [], scopeMap = new Map()) => {
  const labels = scopeIds
    .map((id) => scopeMap.get(id)?.label)
    .filter(Boolean)

  if (labels.length === 0) return 'Scopes'
  if (labels.length === 1) return labels[0]
  return `${labels[0]} +${labels.length - 1}`
}

const getSegmentSummaryLabel = (segmentId = null, segmentMap = new Map()) => {
  if (!segmentId || segmentId === UNASSIGNED_SEGMENT_ID) {
    return 'Ohne Segment'
  }
  return segmentMap.get(segmentId)?.label ?? 'Ohne Segment'
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

const SegmentAssignGroup = ({ segmentOptions = [], selectedSegmentId = null, onChange, isSelected = false, width = null }) => {
  const selectData = [
    ...segmentOptions.map((segment) => ({
      value: segment.id,
      label: segment.label,
    })),
    { value: UNASSIGNED_SEGMENT_ID, label: 'Ohne Segment' },
  ]

  const currentValue = selectedSegmentId ?? UNASSIGNED_SEGMENT_ID
  const summary = selectData.find((entry) => entry.value === currentValue)?.label ?? 'Ohne Segment'

  return (
    <div
      className={`list-view-drawer__scope-group list-view-drawer__segment-group${isSelected ? ' list-view-drawer__scope-group--selected' : ''}`}
      style={width ? { width: `${width}px` } : undefined}
      aria-label="Segments"
      onClick={(e) => e.stopPropagation()}
    >
      <Select
        data={selectData}
        value={currentValue}
        onChange={(value) => onChange(value ?? UNASSIGNED_SEGMENT_ID)}
        clearable
        placeholder=""
        nothingFoundMessage="No segments"
        className="list-view-drawer__segment-select"
        leftSection={(
          <span className={`list-view-drawer__scope-summary${currentValue === UNASSIGNED_SEGMENT_ID ? ' list-view-drawer__scope-summary--empty' : ''}`} title={summary}>
            {summary}
          </span>
        )}
        leftSectionWidth={summary.length > 18 ? 132 : 92}
        leftSectionPointerEvents="none"
        checkIconPosition="right"
        classNames={{
          input: 'mantine-dark-input list-view-drawer__scope-select-input',
          dropdown: 'mantine-dark-dropdown',
          option: 'mantine-dark-option',
          section: 'list-view-drawer__scope-section',
        }}
        comboboxProps={{ withinPortal: true, zIndex: 450 }}
      />
    </div>
  )
}

const ReleaseNoteEditor = ({ value, onChange, isSelected = false, width = null }) => {
  const [draft, setDraft] = useState(value ?? '')
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false)

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

  const closeFullscreenEditor = useCallback(() => {
    commitDraft()
    setIsFullscreenOpen(false)
  }, [commitDraft])

  const handleInlineKeyDown = useCallback((e) => {
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
  }, [commitDraft, value])

  const handleFullscreenKeyDown = useCallback((e) => {
    e.stopPropagation()
    if (e.key === 'Escape') {
      e.preventDefault()
      closeFullscreenEditor()
    }
  }, [closeFullscreenEditor])

  const handlePaste = useCallback((event) => {
    const html = event.clipboardData?.getData('text/html') ?? ''
    if (!html) {
      return
    }

    const markdown = convertRichTextHtmlToMarkdown(html)
    if (!markdown) {
      return
    }

    event.preventDefault()

    const result = insertMarkdownText(
      event.currentTarget.value,
      event.currentTarget.selectionStart,
      event.currentTarget.selectionEnd,
      markdown,
    )

    setDraft(result.value)

    window.requestAnimationFrame(() => {
      event.currentTarget.focus()
      event.currentTarget.setSelectionRange(result.selectionStart, result.selectionEnd)
    })
  }, [])

  return (
    <>
      <div
        className={`list-view-drawer__release-note-editor${isSelected ? ' list-view-drawer__release-note-editor--selected' : ''}`}
        style={{ ...(width ? { width: `${width}px` } : {}), position: 'relative' }}
        onClick={(e) => e.stopPropagation()}
      >
        <ActionIcon
          size="sm"
          variant="subtle"
          color="gray"
          aria-label="Open large markdown editor"
          title="Open large markdown editor"
          style={{ position: 'absolute', top: 6, right: 8, zIndex: 1 }}
          onClick={(e) => {
            e.stopPropagation()
            setIsFullscreenOpen(true)
          }}
        >
          <IconExpand />
        </ActionIcon>

        <textarea
          className="list-view-drawer__release-note-input"
          aria-label="Release Notes"
          value={draft}
          rows={2}
          placeholder="Add release note…"
          style={{ paddingRight: '2rem' }}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          onPaste={handlePaste}
          onKeyDown={handleInlineKeyDown}
        />
      </div>

      <Modal
        opened={isFullscreenOpen}
        onClose={closeFullscreenEditor}
        centered
        size="60vw"
        withCloseButton={false}
        padding="md"
        styles={{
          content: {
            background: '#0f172a',
            width: '60vw',
            maxWidth: '60vw',
          },
          body: { height: '60vh', display: 'flex', flexDirection: 'column', padding: '16px' },
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <div>
              <Text fw={700} style={{ color: '#e2e8f0' }}>Release Notes</Text>
              <Text size="sm" c="dimmed">Markdown editor</Text>
            </div>
            <ActionIcon
              size="sm"
              variant="light"
              color="gray"
              aria-label="Close large markdown editor"
              onClick={closeFullscreenEditor}
            >
              <IconCompress />
            </ActionIcon>
          </div>

          <textarea
            className="list-view-drawer__release-note-input"
            aria-label="Release Notes fullscreen"
            value={draft}
            rows={20}
            placeholder="Add release note…"
            style={{
              flex: 1,
              minHeight: 0,
              height: '100%',
              resize: 'none',
              padding: '0.9rem 1rem',
              fontSize: '0.95rem',
              lineHeight: 1.6,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            }}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDraft}
            onPaste={handlePaste}
            onKeyDown={handleFullscreenKeyDown}
          />
        </div>
      </Modal>
    </>
  )
}

// ── LevelRow ──────────────────────────────────────────────────────────────────

const LevelRow = ({
  level,
  nodeId,
  selectedNodeId,
  selectedNodeIds = [],
  selectedLevelKeys = [],
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
  const isSelected = isMultiSelected || (selectedNodeId === nodeId && selectedProgressLevelId === level.id) || selectedNodeIds.includes(nodeId)
  const shouldApplyToSelection = selectionMode && isMultiSelected && selectedLevelKeys.length > 1
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
            onChange={(size) => onSetBenefit({ size }, { applyToSelection: shouldApplyToSelection })}
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
            onCustomChange={(pts) => onSetEffort({ size: 'custom', customPoints: pts }, { applyToSelection: shouldApplyToSelection })}
            onChange={(size) => onSetEffort({ size, customPoints: size === 'custom' ? (level.effort?.customPoints ?? null) : null }, { applyToSelection: shouldApplyToSelection })}
          />
        )
      case 'status':
        return (
          <StatusRadioGroup
            key="status"
            value={statusKey}
            width={width}
            onChange={(status) => onSetStatus(status, { applyToSelection: shouldApplyToSelection })}
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
            onChange={(scopeIds) => onSetScopeIds(scopeIds, { applyToSelection: shouldApplyToSelection })}
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
        {selectionMode && (
          <label
            className="list-view-drawer__level-select-toggle"
            onClick={(event) => {
              event.stopPropagation()
              onSelectLevel()
            }}
          >
            <input
              type="checkbox"
              checked={isMultiSelected}
              readOnly
              aria-label={`Select ${levelLabel}`}
            />
          </label>
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
            <OpenPointsToggle checked={hasOpenPoints} onChange={(value) => onSetOpenPoints(value, { applyToSelection: shouldApplyToSelection })} />
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

const getMetricSortText = (metric = {}, labels = {}) => {
  const size = metric?.size ?? 'unclear'
  if (size === 'custom') {
    return metric?.customPoints != null ? `${metric.customPoints} pts` : 'Custom'
  }
  return labels[size] ?? String(size ?? '')
}

const getScopeSortText = (scopeIds = [], scopeMap = new Map()) => {
  return [...scopeIds]
    .map((id) => scopeMap.get(id)?.label)
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base', numeric: true }))
    .join(', ')
}

const getSegmentSortText = (segmentId = null, segmentMap = new Map()) => {
  return getSegmentSummaryLabel(segmentId, segmentMap)
}

const compareSortText = (left, right) => {
  return String(left ?? '').localeCompare(String(right ?? ''), undefined, {
    sensitivity: 'base',
    numeric: true,
  })
}

const getLevelSortText = ({ node, level, levelIndex }, field, scopeMap, selectedReleaseId = null, segmentMap = new Map()) => {
  switch (field) {
    case 'value':
      return getMetricSortText(level?.benefit, BENEFIT_LABELS)
    case 'effort':
      return getMetricSortText(level?.effort, EFFORT_LABELS)
    case 'status': {
      const statusKey = normalizeStatusKey(getLevelStatus(level, selectedReleaseId))
      return STATUS_LABELS[statusKey] ?? statusKey
    }
    case 'scopes':
      return getScopeSortText(level?.scopeIds ?? [], scopeMap)
    case 'segments':
      return getSegmentSortText(node?.segmentId ?? null, segmentMap)
    case 'notes':
      return level?.releaseNote ?? ''
    case 'roadmap':
      return ''
    case 'name':
    default:
      return `${node?.label || node?.shortName || ''} ${getLevelDisplayLabel(level?.label, levelIndex ?? 0)}`.trim()
  }
}

const getNodeSortText = (node, field, scopeMap, selectedReleaseId = null, segmentMap = new Map()) => {
  switch (field) {
    case 'status': {
      const statusKey = normalizeStatusKey(getDisplayStatusKey(node, selectedReleaseId))
      return STATUS_LABELS[statusKey] ?? statusKey
    }
    case 'scopes':
      return getScopeSortText(getNodeScopeIds(node), scopeMap)
    case 'segments':
      return getSegmentSortText(node?.segmentId ?? null, segmentMap)
    case 'roadmap':
      return ''
    case 'name':
    default:
      return node?.label || node?.shortName || ''
  }
}

export const sortFlatLevelEntries = (entries = [], selection = {}) => {
  const {
    field = DEFAULT_SORT_SELECTION.field,
    direction = DEFAULT_SORT_SELECTION.direction,
    scopeMap = new Map(),
    segmentMap = new Map(),
    selectedReleaseId = null,
  } = selection

  if (field === 'roadmap' || direction === 'roadmap') {
    return [...entries]
  }

  const directionFactor = direction === 'desc' ? -1 : 1

  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => {
      const valueCompare = compareSortText(
        getLevelSortText(left.entry, field, scopeMap, selectedReleaseId, segmentMap),
        getLevelSortText(right.entry, field, scopeMap, selectedReleaseId, segmentMap),
      )

      if (valueCompare !== 0) {
        return valueCompare * directionFactor
      }

      return left.index - right.index
    })
    .map(({ entry }) => entry)
}

export const sortFlatNodesBySelection = (nodes = [], selection = {}) => {
  const {
    field = DEFAULT_SORT_SELECTION.field,
    direction = DEFAULT_SORT_SELECTION.direction,
    scopeMap = new Map(),
    segmentMap = new Map(),
    selectedReleaseId = null,
  } = selection

  if (field === 'roadmap' || direction === 'roadmap') {
    return [...nodes]
  }

  const directionFactor = direction === 'desc' ? -1 : 1

  return nodes
    .map((node, index) => ({ node, index }))
    .sort((left, right) => {
      const valueCompare = compareSortText(
        getNodeSortText(left.node, field, scopeMap, selectedReleaseId, segmentMap),
        getNodeSortText(right.node, field, scopeMap, selectedReleaseId, segmentMap),
      )

      if (valueCompare !== 0) {
        return valueCompare * directionFactor
      }

      return left.index - right.index
    })
    .map(({ node }) => node)
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
  onSetNodeSegment = () => {},
  selectedReleaseId = null,
  selectedNodeId = null,
  selectedNodeIds = [],
  selectedLevelKeys = [],
  selectionMode: selectionModeProp = false,
  selectedProgressLevelId = null,
  initialShowLevels = true,
  embedded = false,
  onClearLevelSelection = () => {},
  onWidthChange = null,
}) {
  const drawerRef = useRef(null)
  const columnsMenuRef = useRef(null)
  const sortMenuRef = useRef(null)
  const previousOpenInspectorOnSelectRef = useRef(false)

  // ── state (all declared before any callback that might reference them) ──────
  const [drawerWidth, setDrawerWidth] = useState(null) // null = use CSS default
  const [collapsedIds, setCollapsedIds] = useState(new Set())
  const [showLevels, setShowLevels] = useState(initialShowLevels)
  const [showEstimateColumns, setShowEstimateColumns] = useState(false)
  const [showStatusColumn, setShowStatusColumn] = useState(true)
  const [showScopeColumn, setShowScopeColumn] = useState(true)
  const [showSegmentColumn, setShowSegmentColumn] = useState(true)
  const [showReleaseNotesColumn, setShowReleaseNotesColumn] = useState(false)
  const [showColumnsMenu, setShowColumnsMenu] = useState(false)
  const [showSortMenu, setShowSortMenu] = useState(false)
  const [columnOrder, setColumnOrder] = useState(DEFAULT_COLUMN_ORDER)
  const [columnWidths, setColumnWidths] = useState({})
  const [draggingColumnKey, setDraggingColumnKey] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [scopeFilter, setScopeFilter] = useState(SCOPE_FILTER_ALL)
  const [openPointsFilter, setOpenPointsFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortSelection, setSortSelection] = useState(DEFAULT_SORT_SELECTION)
  const [openInspectorOnSelect, setOpenInspectorOnSelect] = useState(false)
  const [selectionMode, setSelectionMode] = useState(selectionModeProp)
  const [viewMode, setViewMode] = useState('list') // 'tree' | 'list'

  const isListMode = viewMode === 'list'
  const selectedLevelCount = selectedLevelKeys.length

  const { autoColumnWidths, autoLabelColumnWidth } = useMemo(() => {
    const allRootNodesForSizing = document?.children ?? []
    const levelEntriesForSizing = collectFlatLevels(allRootNodesForSizing, () => true)
    const nodeEntriesForSizing = collectFlatNodes(allRootNodesForSizing, () => true)
    const localScopeMap = new Map((document?.scopes ?? []).map((scope) => [scope.id, scope]))
    const localSegmentMap = new Map((document?.segments ?? []).map((segment) => [segment.id, segment]))

    const labelWidth = clampLabelColumnWidth(Math.max(
      estimateTextWidth('Name', { charWidth: 7.2, padding: 42 }),
      ...levelEntriesForSizing.map(({ node, level, levelIndex }) => estimateTextWidth(
        `${node?.label || node?.shortName || ''} · ${getLevelDisplayLabel(level?.label, levelIndex ?? 0)}`.trim(),
        { charWidth: 7.1, padding: 132 },
      )),
      ...nodeEntriesForSizing.map((node) => estimateTextWidth(node?.label || node?.shortName || '', { charWidth: 7.1, padding: 42 })),
    ))

    const longestScopeWidth = Math.max(
      estimateTextWidth(COLUMN_LABELS.scopes, { charWidth: 7.2, padding: 44 }),
      ...levelEntriesForSizing.map(({ level }) => estimateTextWidth(getScopeSummaryLabel(level?.scopeIds ?? [], localScopeMap), { charWidth: 6.7, padding: 96 })),
      ...Array.from(localScopeMap.values()).map((scope) => estimateTextWidth(scope?.label ?? '', { charWidth: 6.7, padding: 96 })),
    )

    const longestSegmentWidth = Math.max(
      estimateTextWidth(COLUMN_LABELS.segments, { charWidth: 7.2, padding: 44 }),
      ...nodeEntriesForSizing.map((node) => estimateTextWidth(getSegmentSummaryLabel(node?.segmentId ?? null, localSegmentMap), { charWidth: 6.7, padding: 92 })),
      ...Array.from(localSegmentMap.values()).map((segment) => estimateTextWidth(segment?.label ?? '', { charWidth: 6.7, padding: 92 })),
    )

    const longestNoteWidth = Math.max(
      DEFAULT_COLUMN_WIDTHS.notes,
      estimateTextWidth(COLUMN_LABELS.notes, { charWidth: 7.2, padding: 48 }),
      ...levelEntriesForSizing.map(({ level }) => estimateTextWidth(level?.releaseNote ?? '', { charWidth: 6.4, padding: 58 })),
    )

    const hasCustomEffort = levelEntriesForSizing.some(({ level }) => level?.effort?.size === 'custom')
    const statusWidth = 26 + STATUS_RADIO_OPTIONS.reduce((sum, option) => {
      return sum + Math.max(42, option.label.length * 6 + 18)
    }, 0)

    return {
      autoLabelColumnWidth: labelWidth,
      autoColumnWidths: {
        ...DEFAULT_COLUMN_WIDTHS,
        value: clampColumnWidth('value', Math.max(DEFAULT_COLUMN_WIDTHS.value, estimateTextWidth(COLUMN_LABELS.value, { charWidth: 7.2, padding: 92 }))),
        effort: clampColumnWidth('effort', Math.max(DEFAULT_COLUMN_WIDTHS.effort, hasCustomEffort ? 232 : 0, estimateTextWidth(COLUMN_LABELS.effort, { charWidth: 7.2, padding: 112 }))),
        status: clampColumnWidth('status', statusWidth),
        scopes: clampColumnWidth('scopes', Math.max(DEFAULT_COLUMN_WIDTHS.scopes, longestScopeWidth)),
        segments: clampColumnWidth('segments', Math.max(DEFAULT_COLUMN_WIDTHS.segments, longestSegmentWidth)),
        notes: clampColumnWidth('notes', longestNoteWidth),
      },
    }
  }, [document])

  const resolvedLabelColumnWidth = useMemo(
    () => clampLabelColumnWidth(autoLabelColumnWidth),
    [autoLabelColumnWidth],
  )

  const resolvedColumnWidths = useMemo(() => {
    return DEFAULT_COLUMN_ORDER.reduce((acc, key) => {
      acc[key] = clampColumnWidth(key, columnWidths[key] ?? autoColumnWidths[key] ?? DEFAULT_COLUMN_WIDTHS[key])
      return acc
    }, {})
  }, [autoColumnWidths, columnWidths])

  const visibleListColumns = useMemo(() => {
    if (!isListMode) {
      return []
    }

    return columnOrder.filter((key) => {
      if (showLevels) {
        if (key === 'value' || key === 'effort') return showEstimateColumns
        if (key === 'status') return showStatusColumn
        if (key === 'scopes') return showScopeColumn
        if (key === 'notes') return showReleaseNotesColumn
        return false
      }

      if (key === 'segments') return showSegmentColumn
      return false
    })
  }, [columnOrder, isListMode, showEstimateColumns, showLevels, showReleaseNotesColumn, showScopeColumn, showSegmentColumn, showStatusColumn])

  const columnMinWidth = useMemo(() => {
    const visibleColumnWidth = visibleListColumns.reduce((sum, key) => sum + (resolvedColumnWidths[key] ?? 0), 0)
    const selectionOffset = selectionMode ? SELECTION_COLUMN_WIDTH : 0
    const chromeWidth = 88
    return Math.min(1760, Math.max(420, resolvedLabelColumnWidth + visibleColumnWidth + selectionOffset + chromeWidth))
  }, [resolvedColumnWidths, resolvedLabelColumnWidth, selectionMode, visibleListColumns])

  const sortFieldOptions = SORT_FIELD_OPTIONS

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

  const handleResetDrawerWidth = useCallback((event) => {
    event?.preventDefault?.()
    event?.stopPropagation?.()
    setDrawerWidth(null)
  }, [])

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

  const ensureSortFieldVisible = useCallback((field) => {
    if (field === 'value' || field === 'effort') {
      setShowLevels(true)
      setShowEstimateColumns(true)
      return
    }

    if (field === 'status') {
      setShowLevels(true)
      setShowStatusColumn(true)
      return
    }

    if (field === 'scopes') {
      setShowLevels(true)
      setShowScopeColumn(true)
      return
    }

    if (field === 'notes') {
      setShowLevels(true)
      setShowReleaseNotesColumn(true)
    }
  }, [])

  const handleSortFieldSelection = useCallback((field) => {
    const nextDirection = sortSelection.direction === 'roadmap' ? 'asc' : sortSelection.direction
    ensureSortFieldVisible(field)
    setSortSelection({ field, direction: nextDirection })
    setShowSortMenu(false)
  }, [ensureSortFieldVisible, sortSelection.direction])

  const handleSortDirectionClick = useCallback((direction) => {
    setShowColumnsMenu(false)

    if (direction === 'roadmap') {
      setSortSelection((current) => ({ ...current, direction: 'roadmap' }))
      setShowSortMenu(false)
      return
    }

    ensureSortFieldVisible(sortSelection.field)
    setSortSelection((current) => ({
      field: current.field || DEFAULT_SORT_SELECTION.field,
      direction,
    }))
    setShowSortMenu((open) => (sortSelection.direction === direction ? !open : true))
  }, [ensureSortFieldVisible, sortSelection.direction, sortSelection.field])

  useEffect(() => {
    if (!showLevels && showEstimateColumns) setShowEstimateColumns(false)
  }, [showEstimateColumns, showLevels])

  useEffect(() => {
    setSelectionMode(selectionModeProp)
  }, [selectionModeProp])

  useEffect(() => {
    if ((viewMode !== 'list' || !showLevels) && selectionMode) {
      setSelectionMode(false)
      onClearLevelSelection()
    }
  }, [onClearLevelSelection, selectionMode, showLevels, viewMode])

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
    if (!showColumnsMenu && !showSortMenu) return undefined

    const handlePointerDown = (event) => {
      if (showColumnsMenu && !columnsMenuRef.current?.contains(event.target)) {
        setShowColumnsMenu(false)
      }
      if (showSortMenu && !sortMenuRef.current?.contains(event.target)) {
        setShowSortMenu(false)
      }
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setShowColumnsMenu(false)
        setShowSortMenu(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown, true)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [showColumnsMenu, showSortMenu])

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
  const segmentOptions = useMemo(() => document?.segments ?? [], [document])
  const segmentMap = useMemo(() => new Map(segmentOptions.map((segment) => [segment.id, segment])), [segmentOptions])

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

  const sortedFlatLevelEntries = useMemo(
    () => sortFlatLevelEntries(flatLevelEntries, { ...sortSelection, scopeMap, segmentMap, selectedReleaseId }),
    [flatLevelEntries, scopeMap, segmentMap, selectedReleaseId, sortSelection],
  )

  const sortedFlatNodes = useMemo(
    () => sortFlatNodesBySelection(flatNodes, { ...sortSelection, scopeMap, segmentMap, selectedReleaseId }),
    [flatNodes, scopeMap, segmentMap, selectedReleaseId, sortSelection],
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
  const sharedColumnStyle = {
    '--listview-label-col-width': `${resolvedLabelColumnWidth}px`,
    '--listview-value-col-width': `${resolvedColumnWidths.value}px`,
    '--listview-effort-col-width': `${resolvedColumnWidths.effort}px`,
    '--listview-status-col-width': `${resolvedColumnWidths.status}px`,
    '--listview-scopes-col-width': `${resolvedColumnWidths.scopes}px`,
    '--listview-segments-col-width': `${resolvedColumnWidths.segments}px`,
    '--listview-notes-col-width': `${resolvedColumnWidths.notes}px`,
  }
  const drawerStyle = embedded ? { width: '100%', ...sharedColumnStyle } : { width: `${effectiveDrawerWidth}px`, ...sharedColumnStyle }

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
          title="Drag to resize list view. Double-click to reset to autosize."
          onPointerDown={handleResizePointerDown}
          onDoubleClick={handleResetDrawerWidth}
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
            {selectionMode && selectedLevelCount > 0 && (
              <span className="list-view-drawer__counter list-view-drawer__counter--active" aria-label="Selected items counter">
                {`Selected ${selectedLevelCount}`}
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

          {isListMode && showLevels && (
            <button
              type="button"
              className={`list-view-drawer__icon-toggle${selectionMode ? ' list-view-drawer__icon-toggle--active' : ''}`}
              onClick={() => {
                setSelectionMode((current) => {
                  const next = !current
                  if (!next) onClearLevelSelection()
                  return next
                })
              }}
              aria-label="Multi-select"
              title="Multi-select"
            >
              <span aria-hidden="true">Multi-select</span>
            </button>
          )}

          {(showLevels || isListMode) && (
            <div className="list-view-drawer__columns-menu-wrap" ref={columnsMenuRef}>
              <button
                type="button"
                className={`list-view-drawer__icon-toggle${showColumnsMenu ? ' list-view-drawer__icon-toggle--active' : ''}`}
                onClick={() => {
                  setShowSortMenu(false)
                  setShowColumnsMenu((open) => !open)
                }}
                aria-label="Columns"
                aria-haspopup="menu"
                aria-expanded={showColumnsMenu}
                title="Columns"
              >
                <IconColumns />
              </button>

              {showColumnsMenu && (
                <div className="list-view-drawer__columns-menu" role="menu" aria-label="Columns">
                  {showLevels && (
                    <label className="list-view-drawer__columns-option">
                      <input
                        type="checkbox"
                        checked={showEstimateColumns}
                        onChange={(e) => setShowEstimateColumns(e.target.checked)}
                      />
                      <span className="list-view-drawer__columns-option-icon"><IconBolt /><IconStar /></span>
                      <span>Effort / Value</span>
                    </label>
                  )}

                  {viewMode === 'list' && showLevels && (
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

                  {viewMode === 'list' && !showLevels && (
                    <label className="list-view-drawer__columns-option">
                      <input
                        type="checkbox"
                        checked={showSegmentColumn}
                        onChange={(e) => setShowSegmentColumn(e.target.checked)}
                      />
                      <span className="list-view-drawer__columns-option-icon"><IconLayers /></span>
                      <span>Segments</span>
                    </label>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="list-view-drawer__columns-menu-wrap list-view-drawer__sort-controls" ref={sortMenuRef}>
            <button
              type="button"
              className={`list-view-drawer__sort-chip${sortSelection.direction === 'roadmap' ? ' list-view-drawer__sort-chip--active' : ''}`}
              onClick={() => handleSortDirectionClick('roadmap')}
              aria-label="Roadmap order"
              title="Keep the original roadmap order"
            >
              Roadmap order
            </button>
            <button
              type="button"
              className={`list-view-drawer__sort-chip${sortSelection.direction === 'asc' ? ' list-view-drawer__sort-chip--active' : ''}`}
              onClick={() => handleSortDirectionClick('asc')}
              aria-label="A → Z"
              aria-haspopup="menu"
              aria-expanded={showSortMenu && sortSelection.direction === 'asc'}
              title={`Sort ascending by ${SORT_FIELD_LABELS[sortSelection.field] ?? 'Name'}`}
            >
              A → Z
            </button>
            <button
              type="button"
              className={`list-view-drawer__sort-chip${sortSelection.direction === 'desc' ? ' list-view-drawer__sort-chip--active' : ''}`}
              onClick={() => handleSortDirectionClick('desc')}
              aria-label="Z → A"
              aria-haspopup="menu"
              aria-expanded={showSortMenu && sortSelection.direction === 'desc'}
              title={`Sort descending by ${SORT_FIELD_LABELS[sortSelection.field] ?? 'Name'}`}
            >
              Z → A
            </button>

            {showSortMenu && (
              <div className="list-view-drawer__columns-menu list-view-drawer__sort-menu" role="menu" aria-label="Sort columns">
                <span className="list-view-drawer__sort-summary">Choose column · hidden columns will be shown</span>
                {sortFieldOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={sortSelection.field === option.value}
                    className={`list-view-drawer__sort-option${sortSelection.field === option.value ? ' list-view-drawer__sort-option--active' : ''}`}
                    onClick={() => handleSortFieldSelection(option.value)}
                  >
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

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
          {selectionMode && (
            <button
              type="button"
              className="list-view-drawer__mini-action"
              onClick={onClearLevelSelection}
              disabled={selectedLevelCount === 0}
            >
              Clear
            </button>
          )}
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
        <div className="list-view-drawer__table">
          {isListMode && visibleListColumns.length > 0 && (
            <div className="list-view-drawer__metrics-header" aria-label="Visible columns">
              {selectionMode && <span className="list-view-drawer__metrics-header-select-spacer" aria-hidden="true" />}
              <span className="list-view-drawer__metrics-header-spacer">Name</span>
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
                    title={`Drag to resize ${COLUMN_LABELS[columnKey]} column. Double-click to reset to autosize.`}
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
            {sortedFlatLevelEntries.map(({ node, level, levelIndex }) => (
              <LevelRow
                key={`${node.id}::${level.id}`}
                level={level}
                levelIndex={levelIndex}
                nodeId={node.id}
                selectedNodeId={selectedNodeId}
                selectedNodeIds={selectedNodeIds}
                selectedLevelKeys={selectedLevelKeys}
                selectedProgressLevelId={selectedProgressLevelId}
                nodeLabel={node.label || node.shortName}
                depth={0}
                scopeMap={scopeMap}
                selectedReleaseId={selectedReleaseId}
                onSelectLevel={() => onSelectLevel(node.id, level.id, selectionMode ? { multiSelect: true } : { openInspector: openInspectorOnSelect })}
                showEstimateColumns={showEstimateColumns}
                onSetEffort={(effort, options) => onSetLevelEffort(node.id, level.id, effort, options)}
                onSetBenefit={(benefit, options) => onSetLevelBenefit(node.id, level.id, benefit, options)}
                onSetStatus={(status, options) => onSetLevelStatus(node.id, level.id, status, options)}
                onSetScopeIds={(scopeIds, options) => onSetLevelScopeIds(node.id, level.id, scopeIds, options)}
                onSetOpenPoints={(hasOpenPoints, options) => onSetLevelOpenPoints(node.id, level.id, hasOpenPoints, options)}
                onSetReleaseNote={(releaseNote) => onSetLevelReleaseNote(node.id, level.id, releaseNote)}
                showStatusColumn={showStatusColumn}
                showScopeColumn={showScopeColumn}
                showReleaseNotesColumn={showReleaseNotesColumn}
                visibleListColumns={visibleListColumns}
                resolvedColumnWidths={resolvedColumnWidths}
                listMode
                selectionMode={selectionMode}
              />
            ))}
          </ul>
        ) : isListMode ? (
          /* flat node list */
          <ul className="list-view-drawer__list">
            {sortedFlatNodes.map((node) => {
              const borderColor = getStatusBorderColor(getDisplayStatusKey(node, selectedReleaseId))
              const scopeIds = getNodeScopeIds(node)
              const scopeEntries = [...scopeIds].map((id) => scopeMap.get(id)).filter(Boolean)
              const isNodeSelected = selectedNodeId === node.id && !selectedProgressLevelId
              return (
                <li key={node.id} className="list-view-drawer__item" style={{ paddingLeft: '0.5rem' }}>
                  <div className="list-view-drawer__item-row" style={{ borderRight: `3px solid ${borderColor}` }}>
                    <div
                      className={`list-view-drawer__item-body${isNodeSelected ? ' list-view-drawer__item-body--selected' : ''}`}
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
                    {visibleListColumns.map((columnKey) => {
                      const width = resolvedColumnWidths[columnKey] ?? null
                      if (columnKey === 'segments') {
                        return (
                          <SegmentAssignGroup
                            key={`${node.id}-segments`}
                            segmentOptions={segmentOptions}
                            selectedSegmentId={node.segmentId ?? null}
                            onChange={(nextSegmentKey) => onSetNodeSegment(node.id, nextSegmentKey)}
                            isSelected={isNodeSelected}
                            width={width}
                          />
                        )
                      }
                      return null
                    })}
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
    </div>
  )
}
