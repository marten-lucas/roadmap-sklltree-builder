import { ActionIcon, Alert, Badge, Button, Divider, Group, MultiSelect, NumberInput, Paper, SegmentedControl, Select, Slider, Stack, Tabs, Text, TextInput, Textarea } from '@mantine/core'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { IconPercentage20 } from '@tabler/icons-react'
import { normalizeStatusKey, STATUS_LABELS, SCOPE_COLORS } from '../config'
import { getLevelStatus } from '../utils/nodeStatus'
import { UNASSIGNED_SEGMENT_ID } from '../utils/layoutShared'
import { commitInspectorDrafts } from '../utils/inspectorCommit'
import { EFFORT_SIZE_LABELS, BENEFIT_SIZE_LABELS, EFFORT_SIZES, BENEFIT_SIZES } from '../utils/effortBenefit'
import { MarkdownField } from './MarkdownField'
import { Tooltip } from '../tooltip'

const TablerInfoCircleIcon = ({ size = 16 }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 9h.01" />
    <path d="M11 12h1v4h1" />
    <path d="M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0 -18" />
  </svg>
)

const TablerAdjustmentsIcon = ({ size = 16 }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4 6h16" />
    <path d="M7 12h10" />
    <path d="M10 18h4" />
  </svg>
)

const TablerCirclePlusIcon = ({ size = 18 }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 9v6" />
    <path d="M9 12h6" />
    <path d="M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0 -18" />
  </svg>
)

const TablerPercentIcon = ({ size = 16 }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M19 5L5 19" />
    <circle cx="6.5" cy="6.5" r="2.5" />
    <circle cx="17.5" cy="17.5" r="2.5" />
  </svg>
)

const STATUS_OPTIONS = [
  { value: 'done', label: STATUS_LABELS.done },
  { value: 'now', label: STATUS_LABELS.now },
  { value: 'next', label: STATUS_LABELS.next },
  { value: 'later', label: STATUS_LABELS.later },
  { value: 'hidden', label: STATUS_LABELS.hidden },
]

const dependencyScopeChipStyle = {
  borderRadius: 999,
  border: '1px solid rgba(148, 163, 184, 0.45)',
  padding: '1px 7px',
  fontSize: '0.68rem',
  lineHeight: 1.5,
  display: 'inline-flex',
  alignItems: 'center',
}

const MAX_SCOPE_CHIPS_PER_ENTRY = 4

const EFFORT_MARKS = EFFORT_SIZES.map((s, i) => ({ value: i, label: EFFORT_SIZE_LABELS[s] }))
const BENEFIT_MARKS = BENEFIT_SIZES.map((s, i) => ({ value: i, label: BENEFIT_SIZE_LABELS[s] }))

const DiscreteInspectorSlider = ({ sizes, labels, value, marks, onCommit }) => {
  const [draftIndex, setDraftIndex] = useState(Math.max(0, sizes.indexOf(value ?? sizes[0])))

  useEffect(() => {
    setDraftIndex(Math.max(0, sizes.indexOf(value ?? sizes[0])))
  }, [sizes, value])

  return (
    <Slider
      min={0}
      max={sizes.length - 1}
      step={1}
      value={draftIndex}
      onChange={setDraftIndex}
      onChangeEnd={(idx) => onCommit?.(sizes[idx])}
      marks={marks}
      label={(idx) => labels[sizes[idx]]}
      size="xs"
      mb={28}
      classNames={{ markLabel: 'mantine-dark-label' }}
    />
  )
}

export function InspectorPanel({
  selectedNode,
  selectedNodeIds,
  roadmapData,
  currentLevel,
  selectedProgressLevelId,
  onClose,
  onLabelChange,
  onShortNameChange,
  onStatusChange,
  onReleaseNoteChange,
  onLevelLabelChange,
  onScopeIdsChange,
  scopeOptions,
  onCreateScope,
  onRenameScope,
  onDeleteScope,
  onSetScopeColor,
  onCreateSegment,
  onRenameSegment,
  onDeleteSegment,
  onSelectProgressLevel,
  onAddProgressLevel,
  onDeleteProgressLevel,
  onLevelChange,
  levelOptions,
  segmentOptions,
  parentOptions,
  selectedParentId,
  levelDependencyOptions,
  onLevelAdditionalDependenciesChange,
  incomingDependencyLabels,
  dependencyRequires = [],
  dependencyEnables = [],
  validationMessage,
  onParentChange,
  onSegmentChange,
  onDeleteNodeOnly,
  onDeleteNodeBranch,
  onFocusNode,
  onInspectorCommit,
  onEffortChange,
  onBenefitChange,
  selectedReleaseId = null,
}) {
  const [scopeManagerOpen, setScopeManagerOpen] = useState(false)
  const [scopeDraft, setScopeDraft] = useState('')
  const [scopeError, setScopeError] = useState(null)
  const [editingScopeId, setEditingScopeId] = useState(null)
  const [editingScopeLabel, setEditingScopeLabel] = useState('')
  const [colorPickerOpenId, setColorPickerOpenId] = useState(null)
  const [nameDraft, setNameDraft] = useState(selectedNode?.label ?? '')
  const [shortNameDraft, setShortNameDraft] = useState(selectedNode?.shortName ?? '')
  const [releaseNoteDraft, setReleaseNoteDraft] = useState(
    Array.isArray(selectedNode?.levels) && selectedNode.levels[0] ? (selectedNode.levels[0].releaseNote ?? '') : ''
  )
  const nameDraftRef = useRef(nameDraft)
  const shortNameDraftRef = useRef(shortNameDraft)
  const releaseNoteDraftRef = useRef(releaseNoteDraft)
  const committedNameRef = useRef(selectedNode?.label ?? '')
  const committedShortNameRef = useRef(selectedNode?.shortName ?? '')
  const committedReleaseNoteRef = useRef(
    Array.isArray(selectedNode?.levels) && selectedNode.levels[0] ? (selectedNode.levels[0].releaseNote ?? '') : ''
  )
  const [saveToast, setSaveToast] = useState({ visible: false, message: '' })
  const [segmentManagerOpen, setSegmentManagerOpen] = useState(false)
  const [segmentDraft, setSegmentDraft] = useState('')
  const [segmentError, setSegmentError] = useState(null)
  const [editingSegmentId, setEditingSegmentId] = useState(null)
  const [editingSegmentLabel, setEditingSegmentLabel] = useState('')
  const [levelLabelDrafts, setLevelLabelDrafts] = useState({})

  useEffect(() => {
    const nextName = selectedNode?.label ?? ''
    const nextShortName = selectedNode?.shortName ?? ''
    const nextReleaseNote = Array.isArray(selectedNode?.levels) && selectedNode.levels[0] ? (selectedNode.levels[0].releaseNote ?? '') : ''

    committedNameRef.current = nextName
    committedShortNameRef.current = nextShortName
    committedReleaseNoteRef.current = nextReleaseNote
    nameDraftRef.current = nextName
    shortNameDraftRef.current = nextShortName
    releaseNoteDraftRef.current = nextReleaseNote

    /* eslint-disable react-hooks/set-state-in-effect */
    setNameDraft(nextName)
    setShortNameDraft(nextShortName)
    setReleaseNoteDraft(nextReleaseNote)
    setLevelLabelDrafts(Object.fromEntries(
      (selectedNode?.levels ?? []).map((level, index) => [level.id, level.label ?? `Level ${index + 1}`]),
    ))
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [selectedNode])

  const commitCurrentDrafts = useCallback((showToast = false, commitSource = 'explicit') => {
    if (!selectedNode) {
      return { nameCommitted: false, shortNameCommitted: false, releaseNoteCommitted: false }
    }

    const commitResult = commitInspectorDrafts({
      nameDraft: nameDraftRef.current,
      currentName: committedNameRef.current,
      onNameChange: (nextName) => {
        committedNameRef.current = nextName
        onLabelChange?.(nextName)
      },
      shortNameDraft: shortNameDraftRef.current,
      currentShortName: committedShortNameRef.current,
      onShortNameChange: (nextShortName) => {
        committedShortNameRef.current = nextShortName
        onShortNameChange?.(nextShortName, selectedNode.id)
      },
      releaseNoteDraft: releaseNoteDraftRef.current,
      currentReleaseNote: committedReleaseNoteRef.current,
      onReleaseNoteChange: (nextReleaseNote) => {
        committedReleaseNoteRef.current = nextReleaseNote
        onReleaseNoteChange?.(nextReleaseNote)
      },
    })

    if (showToast && commitResult.nameCommitted) {
      setSaveToast({ visible: true, message: 'Name gespeichert' })
      setTimeout(() => setSaveToast({ visible: false, message: '' }), 1400)
      try {
        window.dispatchEvent(new CustomEvent('roadmap-skilltree.toast', { detail: { type: 'success', message: 'Name gespeichert' } }))
      } catch {
        // ignore
      }
    }

    if (showToast && commitResult.shortNameCommitted) {
      try {
        window.dispatchEvent(new CustomEvent('roadmap-skilltree.toast', { detail: { type: 'success', message: 'Shortname saved' } }))
      } catch {
        // ignore if window not available
      }

      try {
        const sanitized = String(shortNameDraftRef.current ?? '')
          .replace(/[^A-Za-z0-9]/g, '')
          .toUpperCase()
        if (sanitized && sanitized.length > 3) {
          window.dispatchEvent(new CustomEvent('roadmap-skilltree.toast', { detail: { type: 'warning', message: 'Shortname longer than 3 characters (warning only)' } }))
        }
      } catch {
        // ignore
      }
    }

    if (showToast && commitResult.releaseNoteCommitted) {
      setSaveToast({ visible: true, message: 'Release Note gespeichert' })
      setTimeout(() => setSaveToast({ visible: false, message: '' }), 1400)
      try {
        window.dispatchEvent(new CustomEvent('roadmap-skilltree.toast', { detail: { type: 'success', message: 'Release Note gespeichert' } }))
      } catch {
        // ignore
      }
    }

    onInspectorCommit?.(commitResult, commitSource)

    return commitResult
  }, [onInspectorCommit, onLabelChange, onReleaseNoteChange, onShortNameChange, selectedNode])

  useEffect(() => {
    return () => {
      commitCurrentDrafts(false, 'selection-change')
    }
  }, [commitCurrentDrafts])

  useEffect(() => {
    const handleCommitTextDrafts = () => {
      commitCurrentDrafts(true, 'shortcut')
    }

    window.addEventListener('roadmap-skilltree.commit-text-drafts', handleCommitTextDrafts)
    return () => window.removeEventListener('roadmap-skilltree.commit-text-drafts', handleCommitTextDrafts)
  }, [commitCurrentDrafts])

  const handleScopeIdsChange = useCallback((nextScopeIds) => {
    const levels = Array.isArray(selectedNode?.levels) ? selectedNode.levels : []
    const activeId = selectedProgressLevelId ?? (levels[0] && levels[0].id)
    const activeLevel = levels.find((l) => l.id === activeId) ?? levels[0] ?? null
    const prevScopeIds = Array.isArray(activeLevel?.scopeIds) ? activeLevel.scopeIds : []

    onScopeIdsChange?.(nextScopeIds)

    try {
      const traceKey = 'roadmap-skilltree.e2e.scopeTrace'
      const traceEnabled = localStorage.getItem('roadmap-skilltree.e2e.traceEnabled') === '1'
      if (traceEnabled) {
        const raw = localStorage.getItem(traceKey)
        const trace = raw ? JSON.parse(raw) : []
        // include a compact node snapshot so immediate E2E dumps capture
        // the node state at the moment of the scope assignment
        const nodeSnapshot = {
          id: selectedNode.id,
          label: selectedNode.label,
          shortName: selectedNode.shortName ?? null,
          segmentId: selectedNode.segmentId ?? null,
          parentId: selectedNode.parentId ?? null,
          levels: Array.isArray(selectedNode.levels)
            ? selectedNode.levels.map((l) => ({ id: l.id, scopeIds: Array.isArray(l.scopeIds) ? l.scopeIds : [] }))
            : [],
        }

        trace.push({
          ts: Date.now(),
          nodeId: selectedNode.id,
          shortName: selectedNode.shortName ?? null,
          prev: prevScopeIds,
          next: nextScopeIds,
          nodeSnapshot,
        })

        // Cap trace to avoid unbounded localStorage growth.
        const MAX_SCOPE_TRACE_ENTRIES = 200
        if (trace.length > MAX_SCOPE_TRACE_ENTRIES) {
          trace.splice(0, trace.length - MAX_SCOPE_TRACE_ENTRIES)
        }

        localStorage.setItem(traceKey, JSON.stringify(trace))
      }
    } catch {
      // ignore tracing errors during normal runtime
    }
  }, [onScopeIdsChange, selectedNode, selectedProgressLevelId])

  

  

  const renderMultiSelectInspector = () => {
    if (!(!selectedNode && Array.isArray(selectedNodeIds) && selectedNodeIds.length > 1)) {
      return null
    }

    const count = selectedNodeIds.length

    const allNodes = []
    const queue = [...(roadmapData?.children ?? [])]
    while (queue.length > 0) {
      const node = queue.shift()
      allNodes.push(node)
      queue.push(...(node.children ?? []))
    }

    const selectedNodes = selectedNodeIds.map((id) => allNodes.find((node) => node.id === id)).filter(Boolean)
    const segmentData = (roadmapData?.segments ?? []).map((segment) => ({ value: segment.id, label: segment.label }))
    const parentData = allNodes
      .filter((node) => !selectedNodeIds.includes(node.id))
      .map((node) => ({ value: node.id, label: node.shortName ? `${node.label} (${node.shortName})` : node.label }))
    const additionalDependencyData = allNodes
      .filter((node) => !selectedNodeIds.includes(node.id))
      .map((node) => ({ id: node.id, label: node.label, shortName: node.shortName }))

    const visibleNames = selectedNodes.slice(0, 3).map((node) => node.label).filter(Boolean).join(', ')
    const hasMore = selectedNodes.length > 3
    const headerNames = hasMore ? `${visibleNames} (...)` : visibleNames

    return (
      <Paper className="skill-panel skill-panel--inspector" radius={0} shadow="none">
        <div className="skill-panel__header">
          <div>
            <Text className="skill-panel__eyebrow">Inspector</Text>
            <Text className="skill-panel__title skill-panel__title--large">{`${count} selected${headerNames ? ' - ' + headerNames : ''}`}</Text>
          </div>
          <div className="skill-panel__header-actions">
            <ActionIcon variant="subtle" color="gray" onClick={() => { /* noop: parent closes */ }} aria-label="Close inspector">
              ✕
            </ActionIcon>
          </div>
        </div>
        <div className="skill-panel__body skill-panel__body--scrollable">
          <Stack gap="md">
            <div className="multi-inspector__selected-row" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6 }}>
              {selectedNodes.map((node) => (
                <Badge
                  key={node.id}
                  variant="filled"
                  radius="sm"
                  sx={{ cursor: onFocusNode ? 'pointer' : 'default', padding: '6px 10px', whiteSpace: 'nowrap' }}
                  onClick={() => onFocusNode?.(node.id)}
                >
                  {node.shortName ?? node.label}
                </Badge>
              ))}
            </div>

            <Select
              label="Segment (for all)"
              data={segmentData}
              onChange={(value) => value && onSegmentChange(value)}
              allowDeselect={false}
              classNames={{ input: 'mantine-dark-input', label: 'mantine-dark-label', dropdown: 'mantine-dark-dropdown', option: 'mantine-dark-option' }}
              comboboxProps={{ withinPortal: true, zIndex: 450 }}
            />

            <Select
              label="Parent (for all)"
              data={parentData}
              onChange={(value) => value && onParentChange(value)}
              allowDeselect={false}
              classNames={{ input: 'mantine-dark-input', label: 'mantine-dark-label', dropdown: 'mantine-dark-dropdown', option: 'mantine-dark-option' }}
              comboboxProps={{ withinPortal: true, zIndex: 450 }}
            />

            <Select
              label="Status (for all)"
              data={STATUS_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
              onChange={(value) => value && onStatusChange(value)}
              allowDeselect={false}
              classNames={{ input: 'mantine-dark-input', label: 'mantine-dark-label', dropdown: 'mantine-dark-dropdown', option: 'mantine-dark-option' }}
              comboboxProps={{ withinPortal: true, zIndex: 450 }}
            />

            <MultiSelect
              label="Scopes (for all)"
              data={(scopeOptions ?? []).map((scope) => ({ value: scope.value, label: scope.label }))}
              onChange={(values) => onScopeIdsChange(values)}
              searchable
              clearable
              classNames={{ input: 'mantine-dark-input', label: 'mantine-dark-label', dropdown: 'mantine-dark-dropdown', option: 'mantine-dark-option', pill: 'mantine-dark-pill' }}
              comboboxProps={{ withinPortal: true, zIndex: 450 }}
            />

            <Divider />

            <div className="skill-panel__danger-zone">
              <Text className="skill-panel__danger-title">Delete (for selected nodes)</Text>
              <Button variant="default" onClick={onDeleteNodeOnly}>Delete skill (for all)</Button>
              <Button color="red" variant="outline" onClick={onDeleteNodeBranch}>Delete branch (for all)</Button>
            </div>
          </Stack>
        </div>
      </Paper>
    )
  }

  const multiSelectInspector = renderMultiSelectInspector()

  const nodeLevels = selectedNode && Array.isArray(selectedNode.levels) && selectedNode.levels.length > 0
    ? selectedNode.levels.map((level, index) => ({
      id: level.id,
      label: level.label ?? `Level ${index + 1}`,
      status: getLevelStatus(level, selectedReleaseId),
      releaseNote: level.releaseNote ?? '',
      scopeIds: Array.isArray(level.scopeIds) ? level.scopeIds : [],
      additionalDependencyLevelIds: Array.isArray(level.additionalDependencyLevelIds) ? level.additionalDependencyLevelIds : [],
      effort: level.effort ?? null,
      benefit: level.benefit ?? null,
    }))
    : [{ id: 'level-1', label: 'Level 1', status: getLevelStatus({ statuses: {}, status: selectedNode?.status }, selectedReleaseId), releaseNote: '', scopeIds: [], additionalDependencyLevelIds: [] }]

  const activeProgressLevelId = selectedProgressLevelId ?? nodeLevels[0]?.id ?? 'level-1'
  const activeProgressLevel = nodeLevels.find((level) => level.id === activeProgressLevelId) ?? nodeLevels[0] ?? {
    id: activeProgressLevelId,
    label: 'Level 1',
    status: getLevelStatus({ statuses: {}, status: selectedNode?.status }, selectedReleaseId),
    releaseNote: '',
    scopeIds: [],
  }
  const scopeSelectData = (scopeOptions ?? []).map((scope) => ({
    value: scope.value,
    label: scope.label,
    color: scope.color ?? null,
  }))

  const handleCreateScope = () => {
    const result = onCreateScope?.(scopeDraft)

    if (!result?.ok) {
      setScopeError(result?.error ?? 'Scope could not be created.')
      return
    }

    setScopeError(null)
    setScopeDraft('')
  }

  const handleCreateSegment = () => {
    const result = onCreateSegment?.(segmentDraft)

    if (!result?.ok && result !== undefined) {
      setSegmentError(result?.error ?? 'Segment could not be created.')
      return
    }

    setSegmentError(null)
    setSegmentDraft('')
  }

  const handleStartRenameSegment = (segmentId, label) => {
    setSegmentError(null)
    setEditingSegmentId(segmentId)
    setEditingSegmentLabel(label)
  }

  const handleRenameSegment = () => {
    if (!editingSegmentId) {
      return
    }

    const result = onRenameSegment?.(editingSegmentId, editingSegmentLabel)
    if (!result?.ok && result !== undefined) {
      setSegmentError(result?.error ?? 'Segment could not be renamed.')
      return
    }

    setSegmentError(null)
    setEditingSegmentId(null)
    setEditingSegmentLabel('')
  }

  const handleDeleteSegment = (segmentId) => {
    const result = onDeleteSegment?.(segmentId)
    if (!result?.ok && result !== undefined) {
      setSegmentError(result?.error ?? 'Segment could not be deleted.')
      return
    }

    setSegmentError(null)
    if (editingSegmentId === segmentId) {
      setEditingSegmentId(null)
      setEditingSegmentLabel('')
    }
  }

  const handleStartRenameScope = (scopeId, label) => {
    setScopeError(null)
    setEditingScopeId(scopeId)
    setEditingScopeLabel(label)
    setColorPickerOpenId(null)
  }

  const handleRenameScope = () => {
    if (!editingScopeId) {
      return
    }

    const result = onRenameScope?.(editingScopeId, editingScopeLabel)
    if (!result?.ok) {
      setScopeError(result?.error ?? 'Scope could not be renamed.')
      return
    }

    setScopeError(null)
    setEditingScopeId(null)
    setEditingScopeLabel('')
  }

  const handleDeleteScope = (scopeId) => {
    const result = onDeleteScope?.(scopeId)
    if (!result?.ok) {
      setScopeError(result?.error ?? 'Scope could not be deleted.')
      return
    }

    setScopeError(null)
    if (editingScopeId === scopeId) {
      setEditingScopeId(null)
      setEditingScopeLabel('')
    }
    if (colorPickerOpenId === scopeId) {
      setColorPickerOpenId(null)
    }
  }

  const selectedSegmentKey = selectedNode?.segmentId ?? UNASSIGNED_SEGMENT_ID
  const blockedRingHint = levelOptions.find((option) => !option.isAllowed)?.reasons?.[0] ?? null

  // Collect all short names in the tree except the current node for duplicate check
  const otherShortNames = useMemo(() => {
    const names = new Set()
    const queue = [...(roadmapData?.children ?? [])]
    while (queue.length > 0) {
      const node = queue.shift()
      if (node.id !== selectedNode?.id) {
        const sn = String(node.shortName ?? '').trim().toLowerCase()
        if (sn) names.add(sn)
      }
      queue.push(...(node.children ?? []))
    }
    return names
  }, [roadmapData, selectedNode?.id])

  const shortNameDuplicateWarning = useMemo(() => {
    const draft = String(shortNameDraft ?? '').trim().toLowerCase()
    if (!draft) return null
    return otherShortNames.has(draft) ? 'This shortname is already used by another node.' : null
  }, [shortNameDraft, otherShortNames])
  const ringData = levelOptions.map((option) => ({
    value: String(option.value),
    label: `Ring ${option.value}`,
    disabled: !option.isAllowed,
  }))
  const segmentData = (segmentOptions ?? []).map((option) => ({
    value: option.id,
    label: option.label,
  }))
  const parentData = (parentOptions ?? []).map((option) => ({
    value: option.id,
    label: option.shortName ? `${option.label} (${option.shortName})` : option.label,
    disabled: !option.isAllowed,
  }))
  const selectedParentKey = selectedParentId ?? '__root__'

  const renderDependencyGroup = (title, entries) => (
    <Stack gap={6} style={{ flex: 1, minWidth: 0 }}>
      <Text size="sm" fw={600}>{`${title} (${entries.length})`}</Text>

      {entries.length > 0 ? (
        <>
          <Stack gap={4}>
            {entries.map((entry) => (
              <button
                key={`${title}-row-${entry.id}`}
                type="button"
                onClick={() => onFocusNode?.(entry.id)}
                style={{
                  textAlign: 'left',
                  background: 'rgba(15, 23, 42, 0.45)',
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                  borderRadius: 8,
                  padding: '8px 10px',
                  color: '#e2e8f0',
                  cursor: 'pointer',
                }}
              >
                <Text size="sm" fw={500}>
                  {entry.shortName ? `${entry.shortName} - ${entry.label}` : entry.label}
                </Text>
                {(entry.scopes ?? []).length > 0 && (
                  <Group gap={6} mt={6} wrap="wrap">
                    {entry.scopes.slice(0, MAX_SCOPE_CHIPS_PER_ENTRY).map((scope) => (
                      <span
                        key={`${entry.id}-scope-${scope.id}`}
                        style={scope.color
                          ? {
                              ...dependencyScopeChipStyle,
                              borderColor: scope.color,
                              color: scope.color,
                            }
                          : dependencyScopeChipStyle}
                      >
                        {scope.label}
                      </span>
                    ))}
                    {entry.scopes.length > MAX_SCOPE_CHIPS_PER_ENTRY && (
                      <span
                        style={dependencyScopeChipStyle}
                      >
                        +{entry.scopes.length - MAX_SCOPE_CHIPS_PER_ENTRY}
                      </span>
                    )}
                  </Group>
                )}
              </button>
            ))}
          </Stack>
        </>
      ) : (
        <Text size="sm" c="dimmed">No dependencies</Text>
      )}
    </Stack>
  )

  const [activeTab, setActiveTab] = useState('properties')

  useEffect(() => {
    setActiveTab('properties')
  }, [selectedNode?.id])

  const handleTabChange = useCallback((newValue) => {
    if (!newValue) return
    commitCurrentDrafts(false, 'tab-switch')
    setActiveTab(newValue)
    const levelForTab = nodeLevels.find((l) => l.id === newValue)
    if (levelForTab) {
      const nextReleaseNote = levelForTab.releaseNote ?? ''
      releaseNoteDraftRef.current = nextReleaseNote
      committedReleaseNoteRef.current = nextReleaseNote
      setReleaseNoteDraft(nextReleaseNote)
      onSelectProgressLevel?.(newValue)
    }
  }, [commitCurrentDrafts, nodeLevels, onSelectProgressLevel])

  if (!selectedNode) {
    return multiSelectInspector
  }

  return (
    <Paper
      className="skill-panel skill-panel--inspector"
      radius={0}
      shadow="none"
      data-selected-node-id={selectedNode.id}
    >
      {/* ── Header: node name in title ── */}
      <div className="skill-panel__header">
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text className="skill-panel__eyebrow">Inspector</Text>
          <Text className="skill-panel__title skill-panel__title--node">
            {selectedNode.shortName
              ? `${selectedNode.label} (${selectedNode.shortName})`
              : selectedNode.label}
          </Text>
        </div>
        <div className="skill-panel__header-actions">
          <ActionIcon variant="subtle" color="gray" onClick={() => { commitCurrentDrafts(false, 'explicit'); onClose?.() }} aria-label="Close inspector">
            ✕
          </ActionIcon>
        </div>
      </div>

      {/* ── Tab container ── */}
      <div className="skill-panel__tab-container">
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          classNames={{
            root: 'skill-panel__tabs-root',
            panel: 'skill-panel__tab-panel',
            list: 'skill-panel__tabs-list',
          }}
        >
          <Tabs.List>
            <Tabs.Tab value="properties">Properties</Tabs.Tab>

            {nodeLevels.map((level, index) => (
              <Tabs.Tab key={level.id} value={level.id}>{`Level ${index + 1}`}</Tabs.Tab>
            ))}

            <ActionIcon
              size="sm"
              variant="filled"
              color="cyan"
              onClick={onAddProgressLevel}
              aria-label="Add level"
              ml={4}
              style={{ alignSelf: 'center' }}
            >
              +
            </ActionIcon>
          </Tabs.List>

          {/* ── Eigenschaften Tab ── */}
          <Tabs.Panel value="properties">
            <div className="skill-panel__tab-scroll">
              <Stack gap="xl">

                {/* Gruppe 1: Bezeichnung */}
                <Stack gap="sm">
                  <Text size="xs" fw={600} tt="uppercase" c="dimmed" lts="0.1em">Bezeichnung</Text>
                  <Textarea
                    label="Name"
                    placeholder="Enter skill name …"
                    value={nameDraft}
                    onChange={(event) => {
                      const nextValue = event.currentTarget.value
                      nameDraftRef.current = nextValue
                      setNameDraft(nextValue)
                    }}
                    onBlur={() => commitCurrentDrafts(true, 'explicit')}
                    minRows={3}
                    maxRows={8}
                    autosize
                    classNames={{ input: 'mantine-dark-input', label: 'mantine-dark-label' }}
                  />
                  <TextInput
                    label="Shortname"
                    placeholder="e.g. API"
                    value={shortNameDraft}
                    onChange={(event) => {
                      const nextValue = event.currentTarget.value
                      shortNameDraftRef.current = nextValue
                      setShortNameDraft(nextValue)
                    }}
                    onBlur={() => commitCurrentDrafts(true, 'explicit')}
                    error={shortNameDuplicateWarning}
                    classNames={{ input: 'mantine-dark-input', label: 'mantine-dark-label' }}
                  />
                </Stack>

                {/* Gruppe 2: Einordnung */}
                <Stack gap="sm">
                  <Text size="xs" fw={600} tt="uppercase" c="dimmed" lts="0.1em">Einordnung</Text>

                  {parentOptions && parentOptions.length > 0 && (
                    <Select
                      label="Parent"
                      data={parentData}
                      value={selectedParentKey}
                      onChange={(value) => value && onParentChange(value)}
                      allowDeselect={false}
                      classNames={{
                        input: 'mantine-dark-input',
                        label: 'mantine-dark-label',
                        dropdown: 'mantine-dark-dropdown',
                        option: 'mantine-dark-option',
                      }}
                      comboboxProps={{ withinPortal: true, zIndex: 450 }}
                    />
                  )}

                  {segmentOptions && segmentOptions.length > 0 && (
                    <>
                      <Group gap="xs" align="center" wrap="nowrap">
                        <Select
                          label="Segment"
                          data={segmentData}
                          value={selectedSegmentKey}
                          onChange={(value) => value && onSegmentChange(value)}
                          allowDeselect={false}
                          flex={1}
                          classNames={{
                            input: 'mantine-dark-input',
                            label: 'mantine-dark-label',
                            description: 'mantine-dark-description',
                            dropdown: 'mantine-dark-dropdown',
                            option: 'mantine-dark-option',
                          }}
                          comboboxProps={{ withinPortal: true, zIndex: 450 }}
                        />
                        <Tooltip label="Manage segments">
                          <ActionIcon variant="light" color="gray" onClick={() => setSegmentManagerOpen((open) => !open)} aria-label="Manage segments">
                            <IconPercentage20 size={15} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>

                      <div className={`skill-panel__segment-accordion ${segmentManagerOpen ? 'skill-panel__segment-accordion--open' : ''}`}>
                        <Stack gap="sm">
                          <Group align="flex-end" wrap="nowrap">
                            <TextInput
                              label="Manage segments"
                              placeholder="New segment"
                              value={segmentDraft}
                              onChange={(event) => setSegmentDraft(event.currentTarget.value)}
                              style={{ flex: 1 }}
                              classNames={{ input: 'mantine-dark-input', label: 'mantine-dark-label' }}
                            />
                            <Tooltip label="Add segment">
                              <ActionIcon variant="light" color="cyan" size="lg" onClick={handleCreateSegment} aria-label="Add segment">
                                <TablerCirclePlusIcon size={20} />
                              </ActionIcon>
                            </Tooltip>
                          </Group>
                          <Divider />
                          <Stack gap={8}>
                            {(segmentData ?? []).length === 0 && <Text size="sm" c="dimmed">Noch keine Segmente vorhanden.</Text>}
                            {(segmentData ?? []).map((segment) => (
                              <Paper key={segment.value} withBorder radius="md" p="xs">
                                {editingSegmentId === segment.value ? (
                                  <Stack gap={8}>
                                    <TextInput value={editingSegmentLabel} onChange={(event) => setEditingSegmentLabel(event.currentTarget.value)} classNames={{ input: 'mantine-dark-input' }} />
                                    <Group justify="space-between">
                                      <Button size="xs" variant="light" onClick={() => { setEditingSegmentId(null); setEditingSegmentLabel('') }}>Cancel</Button>
                                      <Button size="xs" onClick={handleRenameSegment}>Save</Button>
                                    </Group>
                                  </Stack>
                                ) : (
                                  <Group justify="space-between" wrap="nowrap">
                                    <Text size="sm" truncate>{segment.label}</Text>
                                    <Group gap={6} wrap="nowrap">
                                      <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => handleStartRenameSegment(segment.value, segment.label)} aria-label="Rename segment">✎</ActionIcon>
                                      <ActionIcon size="sm" variant="subtle" color="red" onClick={() => handleDeleteSegment(segment.value)} aria-label="Delete segment">✕</ActionIcon>
                                    </Group>
                                  </Group>
                                )}
                              </Paper>
                            ))}
                            {segmentError && <Alert color="red" variant="light">{segmentError}</Alert>}
                          </Stack>
                        </Stack>
                      </div>
                    </>
                  )}

                  <Select
                    label="Ring"
                    data={ringData}
                    value={String(currentLevel)}
                    onChange={(value) => value && onLevelChange(parseInt(value, 10))}
                    allowDeselect={false}
                    description={blockedRingHint ?? undefined}
                    classNames={{
                      input: 'mantine-dark-input',
                      label: 'mantine-dark-label',
                      description: 'mantine-dark-description',
                      dropdown: 'mantine-dark-dropdown',
                      option: 'mantine-dark-option',
                    }}
                    comboboxProps={{ withinPortal: true, zIndex: 450 }}
                  />

                  <Paper
                    p="md"
                    radius="md"
                    withBorder
                    style={{
                      marginTop: 10,
                      background: 'linear-gradient(180deg, rgba(8, 47, 73, 0.24) 0%, rgba(15, 23, 42, 0.52) 100%)',
                      borderColor: 'rgba(56, 189, 248, 0.28)',
                    }}
                  >
                    <Stack gap="sm">
                      <Text size="xs" fw={700} tt="uppercase" c="cyan.2" lts="0.11em">Dependencies</Text>
                      <Group align="flex-start" grow>
                        {renderDependencyGroup('Requires', dependencyRequires)}
                        {renderDependencyGroup('Enables', dependencyEnables)}
                      </Group>
                    </Stack>
                  </Paper>
                </Stack>

              </Stack>
            </div>

            <div className="skill-panel__tab-bottom-bar">
              <Divider mb="sm" />
              <Group gap="sm" grow>
                <Button variant="default" onClick={onDeleteNodeOnly}>Delete skill</Button>
                <Button color="red" variant="outline" onClick={onDeleteNodeBranch}>Delete branch</Button>
              </Group>
            </div>
          </Tabs.Panel>

          {/* ── Level Tabs ── */}
          {nodeLevels.map((level) => (
            <Tabs.Panel key={level.id} value={level.id}>
              <div className="skill-panel__tab-scroll skill-panel__tab-scroll--level">
                <Stack gap="md" style={{ flexShrink: 0 }}>
                  <TextInput
                    label="Level Name"
                    placeholder="e.g. Foundation"
                    value={levelLabelDrafts[level.id] ?? level.label}
                    onChange={(event) => {
                      const nextValue = event.currentTarget.value
                      setLevelLabelDrafts((prev) => ({
                        ...prev,
                        [level.id]: nextValue,
                      }))
                    }}
                    onBlur={() => {
                      const nextValue = levelLabelDrafts[level.id] ?? level.label
                      onLevelLabelChange?.(nextValue, level.id)
                    }}
                    classNames={{ input: 'mantine-dark-input', label: 'mantine-dark-label' }}
                  />

                  <div>
                    <Text className="mantine-dark-label" size="sm" mb={6}>Status</Text>
                    <SegmentedControl
                      fullWidth
                      size="xs"
                      value={level.status}
                      onChange={(value) => value && onStatusChange(value)}
                      data={STATUS_OPTIONS}
                    />
                  </div>

                  <div>
                    <Text className="mantine-dark-label" size="sm" mb={6}>Effort</Text>
                    <DiscreteInspectorSlider
                      sizes={EFFORT_SIZES}
                      labels={EFFORT_SIZE_LABELS}
                      value={level.effort?.size ?? 'unclear'}
                      marks={EFFORT_MARKS}
                      onCommit={(size) => onEffortChange?.({ size, customPoints: level.effort?.customPoints ?? null })}
                    />
                    {level.effort?.size === 'custom' && (
                      <NumberInput
                        mt={6}
                        label="Story Points (Custom)"
                        placeholder="e.g. 7"
                        value={level.effort?.customPoints ?? ''}
                        onChange={(val) => onEffortChange?.({ size: 'custom', customPoints: val === '' ? null : Number(val) })}
                        min={0}
                        allowDecimal={false}
                        classNames={{ input: 'mantine-dark-input', label: 'mantine-dark-label' }}
                      />
                    )}
                  </div>

                  <div>
                    <Text className="mantine-dark-label" size="sm" mb={6}>Benefit</Text>
                    <DiscreteInspectorSlider
                      sizes={BENEFIT_SIZES}
                      labels={BENEFIT_SIZE_LABELS}
                      value={level.benefit?.size ?? 'unclear'}
                      marks={BENEFIT_MARKS}
                      onCommit={(size) => onBenefitChange?.({ size })}
                    />
                  </div>

                  <div className="skill-panel__scope-block">
                    <Group justify="space-between" align="center" mb={6}>
                      <Text className="mantine-dark-label" size="sm">Scope</Text>
                      <Tooltip label="Without assignment, the level applies to all product groups.">
                        <ActionIcon variant="subtle" color="gray" size="sm" aria-label="Scope hint">
                          <TablerInfoCircleIcon size={15} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>

                    <Group gap="xs" align="center" wrap="nowrap">
                      <MultiSelect
                        data={scopeSelectData}
                        value={level.scopeIds ?? []}
                        onChange={handleScopeIdsChange}
                        placeholder="Scopes"
                        searchable
                        clearable
                        flex={1}
                        classNames={{
                          input: 'mantine-dark-input',
                          dropdown: 'mantine-dark-dropdown',
                          option: 'mantine-dark-option',
                          pill: 'mantine-dark-pill',
                        }}
                        comboboxProps={{ withinPortal: true, zIndex: 450 }}
                      />
                      <Tooltip label="Manage scopes">
                        <ActionIcon variant="light" color="gray" onClick={() => setScopeManagerOpen((open) => !open)} aria-label="Manage scopes">
                          <TablerAdjustmentsIcon size={15} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>

                    <div className={`skill-panel__scope-accordion ${scopeManagerOpen ? 'skill-panel__scope-accordion--open' : ''}`}>
                      <Stack gap="sm">
                        <Group align="flex-end" wrap="nowrap">
                          <TextInput
                            label="Manage scopes"
                            placeholder="e.g. Series A"
                            value={scopeDraft}
                            onChange={(event) => setScopeDraft(event.currentTarget.value)}
                            style={{ flex: 1 }}
                            classNames={{ input: 'mantine-dark-input', label: 'mantine-dark-label' }}
                          />
                          <Tooltip label="Add scope">
                            <ActionIcon variant="light" color="cyan" size="lg" onClick={handleCreateScope} aria-label="Add scope">
                              <TablerCirclePlusIcon size={20} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                        <Divider />
                        <Stack gap={8}>
                          {scopeSelectData.length === 0 && <Text size="sm" c="dimmed">Noch keine Scopes vorhanden.</Text>}
                          {scopeSelectData.map((scope) => (
                            <Paper key={scope.value} withBorder radius="md" p="xs">
                              {editingScopeId === scope.value ? (
                                <Stack gap={8}>
                                  <TextInput value={editingScopeLabel} onChange={(event) => setEditingScopeLabel(event.currentTarget.value)} classNames={{ input: 'mantine-dark-input' }} />
                                  <Group justify="space-between">
                                    <Button size="xs" variant="light" onClick={() => { setEditingScopeId(null); setEditingScopeLabel('') }}>Cancel</Button>
                                    <Button size="xs" onClick={handleRenameScope}>Save</Button>
                                  </Group>
                                </Stack>
                              ) : (
                                <Stack gap={6}>
                                  <Group justify="space-between" wrap="nowrap">
                                    <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
                                      <button
                                        type="button"
                                        aria-label="Change color"
                                        onClick={() => setColorPickerOpenId((prev) => (prev === scope.value ? null : scope.value))}
                                        style={{
                                          width: 16,
                                          height: 16,
                                          borderRadius: '50%',
                                          background: scope.color ?? 'rgba(100,116,139,0.4)',
                                          border: '1.5px solid rgba(148,163,184,0.35)',
                                          cursor: 'pointer',
                                          padding: 0,
                                          flexShrink: 0,
                                        }}
                                      />
                                      <Text size="sm" truncate>{scope.label}</Text>
                                    </Group>
                                    <Group gap={6} wrap="nowrap">
                                      <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => handleStartRenameScope(scope.value, scope.label)} aria-label="Rename scope">✎</ActionIcon>
                                      <ActionIcon size="sm" variant="subtle" color="red" onClick={() => handleDeleteScope(scope.value)} aria-label="Delete scope">✕</ActionIcon>
                                    </Group>
                                  </Group>
                                  {colorPickerOpenId === scope.value && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '4px 0 2px' }}>
                                      {SCOPE_COLORS.map((color) => (
                                        <button
                                          key={color}
                                          type="button"
                                          aria-label={`Color ${color}`}
                                          onClick={() => { onSetScopeColor?.(scope.value, color); setColorPickerOpenId(null) }}
                                          style={{
                                            width: 18,
                                            height: 18,
                                            borderRadius: '50%',
                                            background: color,
                                            border: scope.color === color ? '2px solid #f8fafc' : '2px solid transparent',
                                            outline: scope.color === color ? '2px solid #06b6d4' : 'none',
                                            cursor: 'pointer',
                                            padding: 0,
                                            flexShrink: 0,
                                          }}
                                        />
                                      ))}
                                      {scope.color && (
                                        <button
                                          type="button"
                                          aria-label="Remove color"
                                          onClick={() => { onSetScopeColor?.(scope.value, null); setColorPickerOpenId(null) }}
                                          style={{
                                            width: 18,
                                            height: 18,
                                            borderRadius: '50%',
                                            background: 'transparent',
                                            border: '1.5px dashed rgba(148,163,184,0.5)',
                                            cursor: 'pointer',
                                            padding: 0,
                                            flexShrink: 0,
                                            fontSize: 9,
                                            color: '#94a3b8',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                          }}
                                        >✕</button>
                                      )}
                                    </div>
                                  )}
                                </Stack>
                              )}
                            </Paper>
                          ))}
                          {scopeError && <Alert color="red" variant="light">{scopeError}</Alert>}
                        </Stack>
                      </Stack>
                    </div>
                  </div>
                </Stack>

                {(() => {
                  const levelDepOpts = (levelDependencyOptions ?? {})[level.id] ?? []
                  if (levelDepOpts.length === 0) return null
                  return (
                    <MultiSelect
                      label="Additional Dependencies"
                      data={(() => {
                        const byGroup = new Map()
                        for (const o of levelDepOpts) {
                          const g = o.group ?? ''
                          if (!byGroup.has(g)) byGroup.set(g, [])
                          byGroup.get(g).push({ value: o.value, label: o.label })
                        }
                        return [...byGroup.entries()].map(([group, items]) => ({ group, items }))
                      })()}
                      value={level.additionalDependencyLevelIds}
                      onChange={(values) => onLevelAdditionalDependenciesChange?.(level.id, values)}
                      searchable
                      clearable
                      classNames={{
                        input: 'mantine-dark-input',
                        label: 'mantine-dark-label',
                        dropdown: 'mantine-dark-dropdown',
                        option: 'mantine-dark-option',
                        pill: 'mantine-dark-pill',
                      }}
                      comboboxProps={{ withinPortal: true, zIndex: 450 }}
                    />
                  )
                })()}

                <div className="skill-panel__release-note-fill">
                  <MarkdownField
                    fill
                    label="Release Note"
                    placeholder="Describe from the customer's perspective what was delivered or comes next in this level..."
                    value={activeTab === level.id ? releaseNoteDraft : (level.releaseNote ?? '')}
                    onChange={(nextValue) => {
                      releaseNoteDraftRef.current = nextValue
                      setReleaseNoteDraft(nextValue)
                    }}
                    onBlur={() => commitCurrentDrafts(true, 'explicit')}
                  />
                </div>
              </div>

              <div className="skill-panel__tab-bottom-bar">
                <Divider mb="sm" />
                <Button
                  color="red"
                  variant="outline"
                  fullWidth
                  disabled={nodeLevels.length <= 1}
                  onClick={() => {
                    onDeleteProgressLevel(level.id)
                    setActiveTab('properties')
                  }}
                >
                  Delete level
                </Button>
              </div>
            </Tabs.Panel>
          ))}
        </Tabs>
      </div>

      {saveToast.visible && (
        <Alert color="teal" variant="light" style={{ margin: '0 1.5rem 0.75rem' }}>
          {saveToast.message}
        </Alert>
      )}

      {validationMessage && (
        <Alert color="yellow" variant="light" style={{ margin: '0 1.5rem 0.75rem' }} className="skill-panel__alert">
          {validationMessage}
        </Alert>
      )}
    </Paper>
  )
}
