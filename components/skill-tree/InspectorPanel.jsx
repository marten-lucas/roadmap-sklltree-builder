import { ActionIcon, Alert, Button, MultiSelect, Paper, Select, Stack, Tabs, Text, TextInput, Textarea } from '@mantine/core'
import { normalizeStatusKey, STATUS_LABELS } from './config'
import { UNASSIGNED_SEGMENT_ID } from './layoutShared'

const STATUS_OPTIONS = [
  { value: 'done', label: STATUS_LABELS.done },
  { value: 'now', label: STATUS_LABELS.now },
  { value: 'next', label: STATUS_LABELS.next },
  { value: 'later', label: STATUS_LABELS.later },
]

export function InspectorPanel({
  selectedNode,
  currentLevel,
  selectedProgressLevelId,
  onClose,
  onCollapse,
  onLabelChange,
  onShortNameChange,
  onStatusChange,
  onReleaseNoteChange,
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
}) {
  if (!selectedNode) {
    return null
  }

  const nodeLevels = Array.isArray(selectedNode.levels) && selectedNode.levels.length > 0
    ? selectedNode.levels.map((level, index) => ({
      id: level.id,
      label: level.label ?? `Level ${index + 1}`,
      status: normalizeStatusKey(level.status),
      releaseNote: level.releaseNote ?? '',
    }))
    : [{ id: 'level-1', label: 'Level 1', status: normalizeStatusKey(selectedNode.status), releaseNote: '' }]

  const activeProgressLevelId = selectedProgressLevelId ?? nodeLevels[0].id
  const activeProgressLevel = nodeLevels.find((level) => level.id === activeProgressLevelId) ?? nodeLevels[0]

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
    <Paper className="skill-panel skill-panel--inspector" radius={0} shadow="none">
      <div className="skill-panel__header">
        <div>
          <Text className="skill-panel__eyebrow">Inspector</Text>
          <Text className="skill-panel__title skill-panel__title--large">Skill bearbeiten</Text>
        </div>
        <div className="skill-panel__header-actions">
          <ActionIcon variant="subtle" color="gray" onClick={onCollapse} aria-label="Inspector einklappen">
            ⇤
          </ActionIcon>
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
            value={selectedNode.label}
            onChange={(event) => onLabelChange(event.currentTarget.value)}
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
            value={selectedNode.shortName ?? ''}
            onChange={(event) => onShortNameChange(event.currentTarget.value)}
            maxLength={3}
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

          <Textarea
            label="Release Note"
            placeholder="Beschreibe aus Kundensicht, was in dieser Ausbaustufe geliefert wurde oder als Nächstes kommt ..."
            value={activeProgressLevel.releaseNote}
            onChange={(event) => onReleaseNoteChange(event.currentTarget.value)}
            minRows={5}
            autosize
            classNames={{
              input: 'mantine-dark-input',
              label: 'mantine-dark-label',
            }}
          />

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
