import { ActionIcon, Alert, Button, Paper, Select, Stack, Text, Textarea } from '@mantine/core'
import { UNASSIGNED_SEGMENT_ID } from './layoutShared'

const STATUS_OPTIONS = [
  { value: 'fertig', label: 'Fertig' },
  { value: 'jetzt', label: 'Jetzt' },
  { value: 'später', label: 'Später' },
]

export function InspectorPanel({ selectedNode, currentLevel, onClose, onLabelChange, onStatusChange, onLevelChange, levelOptions, segmentOptions, validationMessage, onSegmentChange, onDeleteNodeOnly, onDeleteNodeBranch }) {
  if (!selectedNode) {
    return null
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

  return (
    <Paper className="skill-panel skill-panel--inspector" radius={0} shadow="none">
      <div className="skill-panel__header">
        <div>
          <Text className="skill-panel__eyebrow">Inspector</Text>
          <Text className="skill-panel__title skill-panel__title--large">Skill bearbeiten</Text>
        </div>
        <ActionIcon variant="subtle" color="gray" onClick={onClose} aria-label="Inspector schließen">
          ✕
        </ActionIcon>
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
            maxRows={5}
            classNames={{
              input: 'mantine-dark-input',
              label: 'mantine-dark-label',
            }}
          />

          <Select
            label="Status"
            data={STATUS_OPTIONS}
            value={selectedNode.status}
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
