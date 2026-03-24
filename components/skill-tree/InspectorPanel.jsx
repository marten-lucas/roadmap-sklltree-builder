import { ActionIcon, Alert, Badge, Button, Divider, Group, MultiSelect, Paper, Select, Stack, Tabs, Text, TextInput, Textarea, Tooltip } from '@mantine/core'
import { useState, useEffect } from 'react'
import { normalizeStatusKey, STATUS_LABELS } from './config'
import { UNASSIGNED_SEGMENT_ID } from './layoutShared'

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

const STATUS_OPTIONS = [
  { value: 'done', label: STATUS_LABELS.done },
  { value: 'now', label: STATUS_LABELS.now },
  { value: 'next', label: STATUS_LABELS.next },
  { value: 'later', label: STATUS_LABELS.later },
]

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
  onScopeIdsChange,
  scopeOptions,
  onCreateScope,
  onRenameScope,
  onDeleteScope,
  onSelectProgressLevel,
  onAddProgressLevel,
  onDeleteProgressLevel,
  onLevelChange,
  levelOptions,
  segmentOptions,
  parentOptions,
  selectedParentId,
  additionalDependencyOptions,
  selectedAdditionalDependencyIds,
  incomingDependencyLabels,
  validationMessage,
  onParentChange,
  onAdditionalDependenciesChange,
  onSegmentChange,
  onDeleteNodeOnly,
  onDeleteNodeBranch,
  onFocusNode,
}) {
  const [scopeManagerOpen, setScopeManagerOpen] = useState(false)
  const [scopeDraft, setScopeDraft] = useState('')
  const [scopeError, setScopeError] = useState(null)
  const [editingScopeId, setEditingScopeId] = useState(null)
  const [editingScopeLabel, setEditingScopeLabel] = useState('')
  const [nameDraft, setNameDraft] = useState(selectedNode?.label ?? '')
  const [shortNameDraft, setShortNameDraft] = useState(selectedNode?.shortName ?? '')
  const [releaseNoteDraft, setReleaseNoteDraft] = useState(
    Array.isArray(selectedNode?.levels) && selectedNode.levels[0] ? (selectedNode.levels[0].releaseNote ?? '') : ''
  )
  const [saveToast, setSaveToast] = useState({ visible: false, message: '' })

  useEffect(() => {
    setNameDraft(selectedNode?.label ?? '')
    setShortNameDraft(selectedNode?.shortName ?? '')
    setReleaseNoteDraft(Array.isArray(selectedNode?.levels) && selectedNode.levels[0] ? (selectedNode.levels[0].releaseNote ?? '') : '')
  }, [selectedNode])

  

  if (!selectedNode) {
    // If multiple nodes selected, render a multi-select inspector
    if (Array.isArray(selectedNodeIds) && selectedNodeIds.length > 1) {
      const count = selectedNodeIds.length

      // build flat node list for lookup
      const allNodes = []
      const queue = [...(roadmapData?.children ?? [])]
      while (queue.length > 0) {
        const n = queue.shift()
        allNodes.push(n)
        queue.push(...(n.children ?? []))
      }

      const selectedNodes = selectedNodeIds.map((id) => allNodes.find((n) => n.id === id)).filter(Boolean)

      const segmentData = (roadmapData?.segments ?? []).map((s) => ({ value: s.id, label: s.label }))

      const parentData = allNodes
        .filter((n) => !selectedNodeIds.includes(n.id))
        .map((n) => ({ value: n.id, label: n.label }))

      const additionalDependencyData = allNodes
        .filter((n) => !selectedNodeIds.includes(n.id))
        .map((n) => ({ id: n.id, label: n.label, shortName: n.shortName }))

      // Show up to three names in the header then truncate with ellipsis
      const visibleNames = selectedNodes.slice(0, 3).map((n) => n.label).filter(Boolean).join(', ')
      const hasMore = selectedNodes.length > 3
      const headerNames = hasMore ? `${visibleNames} (...)` : visibleNames

      return (
        <Paper className="skill-panel skill-panel--inspector" radius={0} shadow="none">
          <div className="skill-panel__header">
            <div>
              <Text className="skill-panel__eyebrow">Inspector</Text>
              <Text className="skill-panel__title skill-panel__title--large">{`${count} Ausgewählt${headerNames ? ' - ' + headerNames : ''}`}</Text>
            </div>
            <div className="skill-panel__header-actions">
              <ActionIcon variant="subtle" color="gray" onClick={() => { /* noop: parent closes */ }} aria-label="Inspector schließen">
                ✕
              </ActionIcon>
            </div>
          </div>
          <div className="skill-panel__body skill-panel__body--scrollable">
            <Stack gap="md">
              {/* Selected nodes row */}
              <div className="multi-inspector__selected-row" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6 }}>
                {selectedNodes.map((n) => (
                  <Badge
                    key={n.id}
                    variant="filled"
                    radius="sm"
                    sx={{ cursor: onFocusNode ? 'pointer' : 'default', padding: '6px 10px', whiteSpace: 'nowrap' }}
                    onClick={() => onFocusNode?.(n.id)}
                  >
                    {n.shortName ?? n.label}
                  </Badge>
                ))}
              </div>

              <Select
                label="Segment (für alle)"
                data={segmentData}
                onChange={(value) => value && onSegmentChange(value)}
                allowDeselect={false}
                classNames={{ input: 'mantine-dark-input', label: 'mantine-dark-label', dropdown: 'mantine-dark-dropdown', option: 'mantine-dark-option' }}
                comboboxProps={{ withinPortal: true, zIndex: 450 }}
              />

              <Select
                label="Parent (für alle)"
                data={parentData}
                onChange={(value) => value && onParentChange(value)}
                allowDeselect={false}
                classNames={{ input: 'mantine-dark-input', label: 'mantine-dark-label', dropdown: 'mantine-dark-dropdown', option: 'mantine-dark-option' }}
                comboboxProps={{ withinPortal: true, zIndex: 450 }}
              />

              <MultiSelect
                label="Additional Dependencies (für alle)"
                data={additionalDependencyData.map((d) => ({ value: d.id, label: d.shortName ? `${d.label} (${d.shortName})` : d.label }))}
                onChange={(values) => onAdditionalDependenciesChange(values)}
                searchable
                clearable
                classNames={{ input: 'mantine-dark-input', label: 'mantine-dark-label', dropdown: 'mantine-dark-dropdown', option: 'mantine-dark-option', pill: 'mantine-dark-pill' }}
                comboboxProps={{ withinPortal: true, zIndex: 450 }}
              />

              <Select
                label="Status (für alle)"
                data={STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                onChange={(value) => value && onStatusChange(value)}
                allowDeselect={false}
                classNames={{ input: 'mantine-dark-input', label: 'mantine-dark-label', dropdown: 'mantine-dark-dropdown', option: 'mantine-dark-option' }}
                comboboxProps={{ withinPortal: true, zIndex: 450 }}
              />

              <MultiSelect
                label="Scopes (für alle)"
                data={(scopeOptions ?? []).map((s) => ({ value: s.value, label: s.label }))}
                onChange={(values) => onScopeIdsChange(values)}
                searchable
                clearable
                classNames={{ input: 'mantine-dark-input', label: 'mantine-dark-label', dropdown: 'mantine-dark-dropdown', option: 'mantine-dark-option', pill: 'mantine-dark-pill' }}
                comboboxProps={{ withinPortal: true, zIndex: 450 }}
              />


              <Divider />

              <div className="skill-panel__danger-zone">
                <Text className="skill-panel__danger-title">Löschen (für ausgewählte Knoten)</Text>
                <Button variant="default" onClick={onDeleteNodeOnly}>Skill löschen (für alle)</Button>
                <Button color="red" variant="outline" onClick={onDeleteNodeBranch}>Zweig löschen (für alle)</Button>
              </div>

            </Stack>
          </div>
        </Paper>
      )
    }

    return null
  }

  const nodeLevels = Array.isArray(selectedNode.levels) && selectedNode.levels.length > 0
    ? selectedNode.levels.map((level, index) => ({
      id: level.id,
      label: level.label ?? `Level ${index + 1}`,
      status: normalizeStatusKey(level.status),
      releaseNote: level.releaseNote ?? '',
      scopeIds: Array.isArray(level.scopeIds) ? level.scopeIds : [],
    }))
    : [{ id: 'level-1', label: 'Level 1', status: normalizeStatusKey(selectedNode.status), releaseNote: '', scopeIds: [] }]

  const activeProgressLevelId = selectedProgressLevelId ?? nodeLevels[0].id
  const activeProgressLevel = nodeLevels.find((level) => level.id === activeProgressLevelId) ?? nodeLevels[0]
  const scopeSelectData = (scopeOptions ?? []).map((scope) => ({
    value: scope.value,
    label: scope.label,
  }))

  // Keep release note draft synced when the active progress level changes
  useEffect(() => {
    // activeProgressLevel may be undefined in some states
    // we only update the draft when the activeProgressLevel changes
    const next = Array.isArray(selectedNode?.levels) && selectedNode.levels[0] ? (selectedNode.levels[0].releaseNote ?? '') : ''
    setReleaseNoteDraft(next)
  }, [selectedNode?.levels])

  const handleCreateScope = () => {
    const result = onCreateScope?.(scopeDraft)

    if (!result?.ok) {
      setScopeError(result?.error ?? 'Scope konnte nicht angelegt werden.')
      return
    }

    setScopeError(null)
    setScopeDraft('')
  }

  const handleStartRenameScope = (scopeId, label) => {
    setScopeError(null)
    setEditingScopeId(scopeId)
    setEditingScopeLabel(label)
  }

  const handleRenameScope = () => {
    if (!editingScopeId) {
      return
    }

    const result = onRenameScope?.(editingScopeId, editingScopeLabel)
    if (!result?.ok) {
      setScopeError(result?.error ?? 'Scope konnte nicht umbenannt werden.')
      return
    }

    setScopeError(null)
    setEditingScopeId(null)
    setEditingScopeLabel('')
  }

  const handleDeleteScope = (scopeId) => {
    const result = onDeleteScope?.(scopeId)
    if (!result?.ok) {
      setScopeError(result?.error ?? 'Scope konnte nicht gelöscht werden.')
      return
    }

    setScopeError(null)
    if (editingScopeId === scopeId) {
      setEditingScopeId(null)
      setEditingScopeLabel('')
    }
  }

  const handleScopeIdsChange = (nextScopeIds) => {
    const prevScopeIds = activeProgressLevel.scopeIds ?? []
    onScopeIdsChange?.(nextScopeIds)

    try {
      const key = 'roadmap-skilltree.e2e.scopeTrace'
      const raw = localStorage.getItem(key)
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

      localStorage.setItem(key, JSON.stringify(trace))
    } catch (err) {
      // ignore tracing errors during normal runtime
    }
  }

  const selectedSegmentKey = selectedNode.segmentId ?? UNASSIGNED_SEGMENT_ID
  const blockedLevelHint = levelOptions.find((option) => !option.isAllowed)?.reasons?.[0] ?? null
  const blockedSegmentHint = segmentOptions?.find((option) => !option.isAllowed)?.reasons?.[0] ?? null
  const levelData = levelOptions.map((option) => ({
    value: String(option.value),
    label: `Ebene ${option.value}`,
    disabled: !option.isAllowed,
  }))
  const segmentData = (segmentOptions ?? []).map((option) => ({
    value: option.id,
    label: option.label,
    disabled: !option.isAllowed,
  }))
  const parentData = (parentOptions ?? []).map((option) => ({
    value: option.id,
    label: option.label,
    disabled: !option.isAllowed,
  }))
  const selectedParentKey = selectedParentId ?? '__root__'
  const additionalDependencyData = (additionalDependencyOptions ?? []).map((option) => ({
    value: option.id,
    label: option.shortName ? `${option.label} (${option.shortName})` : option.label,
    disabled: !option.isAllowed,
  }))

  return (
    <Paper
      className="skill-panel skill-panel--inspector"
      radius={0}
      shadow="none"
      data-selected-node-id={selectedNode.id}
    >
      <div className="skill-panel__header">
        <div>
          <Text className="skill-panel__eyebrow">Inspector</Text>
          <Text className="skill-panel__title skill-panel__title--large">Skill bearbeiten</Text>
        </div>
        <div className="skill-panel__header-actions">
          <ActionIcon variant="subtle" color="gray" onClick={onClose} aria-label="Inspector schließen">
            ✕
          </ActionIcon>
        </div>
      </div>

      <div className="skill-panel__body skill-panel__body--scrollable">
        <Stack gap="md">
          <Paper className="skill-panel__selected" radius="lg" withBorder>
            <Text className="skill-panel__selected-label">Ausgewählt</Text>
            <Text className="skill-panel__selected-value">{selectedNode.label}</Text>
          </Paper>

          <Textarea
            label="Name"
            placeholder="Skill-Name eingeben …"
            value={nameDraft}
            onChange={(event) => setNameDraft(event.currentTarget.value)}
            onBlur={() => {
              if (nameDraft !== (selectedNode.label ?? '')) {
                onLabelChange?.(nameDraft)
                setSaveToast({ visible: true, message: 'Name gespeichert' })
                setTimeout(() => setSaveToast({ visible: false, message: '' }), 1400)
                try {
                  window.dispatchEvent(new CustomEvent('roadmap-skilltree.toast', { detail: { type: 'success', message: 'Name gespeichert' } }))
                } catch (e) {
                  // ignore
                }
              }
            }}
            minRows={2}
            maxRows={4}
            classNames={{
              input: 'mantine-dark-input',
              label: 'mantine-dark-label',
            }}
          />

          <TextInput
            label="Shortname"
            placeholder="z.B. API"
            value={shortNameDraft}
            onChange={(event) => setShortNameDraft(event.currentTarget.value)}
            onBlur={() => {
              if (shortNameDraft !== (selectedNode.shortName ?? '')) {
                onShortNameChange?.(shortNameDraft, selectedNode.id)
                // dispatch a global toast event so the window (app) can show a global toast
                try {
                  window.dispatchEvent(new CustomEvent('roadmap-skilltree.toast', { detail: { type: 'success', message: 'Shortname gespeichert' } }))
                } catch (e) {
                  // ignore if window not available
                }

                // validation: warn if sanitized shortname exceeds 3 characters
                try {
                  const sanitized = String(shortNameDraft ?? '')
                    .replace(/[^A-Za-z0-9]/g, '')
                    .toUpperCase()
                  if (sanitized && sanitized.length > 3) {
                    window.dispatchEvent(new CustomEvent('roadmap-skilltree.toast', { detail: { type: 'warning', message: 'Shortname länger als 3 Zeichen (nur Warnung)' } }))
                  }
                } catch (e) {
                  // ignore
                }
              }
            }}
            /* allow longer input; show a warning on blur if >3 */
            classNames={{
              input: 'mantine-dark-input',
              label: 'mantine-dark-label',
            }}
          />

          <Select
            label="Ebene"
            data={levelData}
            value={String(currentLevel)}
            onChange={(value) => value && onLevelChange(parseInt(value, 10))}
            allowDeselect={false}
            description={blockedLevelHint ?? undefined}
            classNames={{
              input: 'mantine-dark-input',
              label: 'mantine-dark-label',
              description: 'mantine-dark-description',
              dropdown: 'mantine-dark-dropdown',
              option: 'mantine-dark-option',
            }}
            comboboxProps={{ withinPortal: true, zIndex: 450 }}
          />

          {segmentOptions && segmentOptions.length > 0 && (
            <Select
              label="Segment"
              data={segmentData}
              value={selectedSegmentKey}
              onChange={(value) => value && onSegmentChange(value)}
              allowDeselect={false}
              description={blockedSegmentHint ?? undefined}
              classNames={{
                input: 'mantine-dark-input',
                label: 'mantine-dark-label',
                description: 'mantine-dark-description',
                dropdown: 'mantine-dark-dropdown',
                option: 'mantine-dark-option',
              }}
              comboboxProps={{ withinPortal: true, zIndex: 450 }}
            />
          )}

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

          {additionalDependencyData.length > 0 && (
            <MultiSelect
              label="Additional Dependencies"
              data={additionalDependencyData}
              value={selectedAdditionalDependencyIds ?? []}
              onChange={onAdditionalDependenciesChange}
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
          )}

          <div>
            <Text className="mantine-dark-label" size="sm" mb="xs">Incoming Dependencies</Text>
            {incomingDependencyLabels && incomingDependencyLabels.length > 0 ? (
              <Stack gap={6}>
                {incomingDependencyLabels.map((entry) => (
                  <Paper key={entry.id} radius="md" px="sm" py={6} className="skill-panel__incoming-item" withBorder>
                    <Text size="sm">{entry.shortName ? `${entry.label} (${entry.shortName})` : entry.label}</Text>
                  </Paper>
                ))}
              </Stack>
            ) : (
              <Text size="sm" c="dimmed">Keine eingehenden Dependencies.</Text>
            )}
          </div>

          <div>
            <Text className="mantine-dark-label" size="sm" mb="xs">Ausbaustufen</Text>
            <Tabs value={activeProgressLevelId} onChange={(value) => value && onSelectProgressLevel(value)}>
              <Tabs.List className="skill-panel__level-tabs">
                {nodeLevels.map((level, index) => (
                  <div key={level.id} className="skill-panel__level-tab-item">
                    <Tabs.Tab value={level.id}>{`L${index + 1}`}</Tabs.Tab>
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color="gray"
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        onDeleteProgressLevel(level.id)
                      }}
                      aria-label={`Level ${index + 1} löschen`}
                      disabled={nodeLevels.length <= 1}
                    >
                      ✕
                    </ActionIcon>
                  </div>
                ))}
                <ActionIcon
                  size="sm"
                  variant="filled"
                  color="cyan"
                  onClick={onAddProgressLevel}
                  aria-label="Level hinzufügen"
                >
                  +
                </ActionIcon>
              </Tabs.List>
            </Tabs>
          </div>

          <Select
            label="Status"
            data={STATUS_OPTIONS}
            value={activeProgressLevel.status}
            onChange={(value) => value && onStatusChange(value)}
            allowDeselect={false}
            classNames={{
              input: 'mantine-dark-input',
              label: 'mantine-dark-label',
              dropdown: 'mantine-dark-dropdown',
              option: 'mantine-dark-option',
            }}
            comboboxProps={{ withinPortal: true, zIndex: 450 }}
          />

          <div className="skill-panel__scope-block">
            <Group justify="space-between" align="center" mb={6}>
              <Text className="mantine-dark-label" size="sm">Scope</Text>
              <Tooltip label="Ohne Zuordnung gilt die Ausbaustufe fuer alle Produktgruppen." withArrow>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="sm"
                  aria-label="Scope-Hinweis"
                >
                  <TablerInfoCircleIcon size={15} />
                </ActionIcon>
              </Tooltip>
            </Group>

            <Group gap="xs" align="center" wrap="nowrap">
              <MultiSelect
                data={scopeSelectData}
                value={activeProgressLevel.scopeIds ?? []}
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

              <ActionIcon
                variant="light"
                color="gray"
                onClick={() => setScopeManagerOpen((open) => !open)}
                aria-label="Scopes verwalten"
                title="Scopes verwalten"
              >
                <TablerAdjustmentsIcon size={15} />
              </ActionIcon>
            </Group>

            <div className={`skill-panel__scope-accordion ${scopeManagerOpen ? 'skill-panel__scope-accordion--open' : ''}`}>
              <Stack gap="sm">
                <Group align="flex-end" wrap="nowrap">
                  <TextInput
                    label="Scopes verwalten"
                    placeholder="z.B. Serie A"
                    value={scopeDraft}
                    onChange={(event) => setScopeDraft(event.currentTarget.value)}
                    style={{ flex: 1 }}
                    classNames={{
                      input: 'mantine-dark-input',
                      label: 'mantine-dark-label',
                    }}
                  />
                  <Tooltip label="Scope hinzufügen" withArrow>
                    <ActionIcon
                      variant="light"
                      color="cyan"
                      size="lg"
                      onClick={handleCreateScope}
                      aria-label="Scope hinzufügen"
                    >
                      <TablerCirclePlusIcon size={20} />
                    </ActionIcon>
                  </Tooltip>
                </Group>

                <Divider />

                <Stack gap={8}>
                  {scopeSelectData.length === 0 && (
                    <Text size="sm" c="dimmed">Noch keine Scopes vorhanden.</Text>
                  )}

                  {scopeSelectData.map((scope) => (
                    <Paper key={scope.value} withBorder radius="md" p="xs">
                      {editingScopeId === scope.value ? (
                        <Stack gap={8}>
                          <TextInput
                            value={editingScopeLabel}
                            onChange={(event) => setEditingScopeLabel(event.currentTarget.value)}
                            classNames={{
                              input: 'mantine-dark-input',
                            }}
                          />
                          <Group justify="space-between">
                            <Button
                              size="xs"
                              variant="light"
                              onClick={() => {
                                setEditingScopeId(null)
                                setEditingScopeLabel('')
                              }}
                            >
                              Abbrechen
                            </Button>
                            <Button size="xs" onClick={handleRenameScope}>Speichern</Button>
                          </Group>
                        </Stack>
                      ) : (
                        <Group justify="space-between" wrap="nowrap">
                          <Text size="sm" truncate>{scope.label}</Text>
                          <Group gap={6} wrap="nowrap">
                            <ActionIcon
                              size="sm"
                              variant="subtle"
                              color="gray"
                              onClick={() => handleStartRenameScope(scope.value, scope.label)}
                              aria-label="Scope umbenennen"
                            >
                              ✎
                            </ActionIcon>
                            <ActionIcon
                              size="sm"
                              variant="subtle"
                              color="red"
                              onClick={() => handleDeleteScope(scope.value)}
                              aria-label="Scope löschen"
                            >
                              ✕
                            </ActionIcon>
                          </Group>
                        </Group>
                      )}
                    </Paper>
                  ))}
                </Stack>

                {scopeError && (
                  <Alert color="red" variant="light">
                    {scopeError}
                  </Alert>
                )}
              </Stack>
            </div>
          </div>

          <Textarea
            label="Release Note"
            placeholder="Beschreibe aus Kundensicht, was in dieser Ausbaustufe geliefert wurde oder als Nächstes kommt ..."
            value={releaseNoteDraft}
            onChange={(event) => setReleaseNoteDraft(event.currentTarget.value)}
            onBlur={() => {
              if (releaseNoteDraft !== (activeProgressLevel.releaseNote ?? '')) {
                onReleaseNoteChange?.(releaseNoteDraft)
                setSaveToast({ visible: true, message: 'Release Note gespeichert' })
                setTimeout(() => setSaveToast({ visible: false, message: '' }), 1400)
                try {
                  window.dispatchEvent(new CustomEvent('roadmap-skilltree.toast', { detail: { type: 'success', message: 'Release Note gespeichert' } }))
                } catch (e) {
                  // ignore
                }
              }
            }}
            minRows={5}
            autosize
            classNames={{
              input: 'mantine-dark-input',
              label: 'mantine-dark-label',
            }}
          />

          {saveToast.visible && (
            <Alert color="teal" variant="light">
              {saveToast.message}
            </Alert>
          )}

          {validationMessage && (
            <Alert color="yellow" variant="light" className="skill-panel__alert">
              {validationMessage}
            </Alert>
          )}

          <div className="skill-panel__danger-zone">
            <Text className="skill-panel__danger-title">Löschen</Text>
            <Button variant="default" onClick={onDeleteNodeOnly}>
              Skill löschen
            </Button>
            <Button color="red" variant="outline" onClick={onDeleteNodeBranch}>
              Zweig löschen
            </Button>
          </div>
        </Stack>
      </div>
    </Paper>
  )
}
