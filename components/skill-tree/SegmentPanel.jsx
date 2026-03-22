import { ActionIcon, Button, Paper, Stack, Text, TextInput } from '@mantine/core'

export function SegmentPanel({ selectedSegment, onClose, onLabelChange, onDelete }) {
  if (!selectedSegment) {
    return null
  }

  return (
    <Paper className="skill-panel skill-panel--segment" radius="xl" shadow="xl">
      <div className="skill-panel__header">
        <div>
          <Text className="skill-panel__eyebrow">Segment</Text>
          <Text className="skill-panel__title">Segment bearbeiten</Text>
        </div>
        <div className="skill-panel__header-actions">
          <ActionIcon variant="subtle" color="gray" onClick={onClose} aria-label="Segment-Editor schließen">
            ✕
          </ActionIcon>
        </div>
      </div>

      <Stack gap="md" className="skill-panel__body">
        <Paper className="skill-panel__selected" radius="lg" withBorder>
          <Text className="skill-panel__selected-label">Ausgewählt</Text>
          <Text className="skill-panel__selected-value">{selectedSegment.label}</Text>
        </Paper>

        <TextInput
          label="Name"
          placeholder="Segment-Name eingeben …"
          value={selectedSegment.label}
          onChange={(event) => onLabelChange(event.currentTarget.value)}
          classNames={{
            input: 'mantine-dark-input',
            label: 'mantine-dark-label',
          }}
        />

        <Button
          color="red"
          variant="outline"
          onClick={onDelete}
        >
          Segment löschen
        </Button>
      </Stack>
    </Paper>
  )
}