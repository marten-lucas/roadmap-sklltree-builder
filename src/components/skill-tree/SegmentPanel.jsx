import { ActionIcon, Alert, Button, Divider, Paper, Stack, Text, TextInput, Group } from '@mantine/core'
import { useState } from 'react'

export function SegmentPanel({ selectedSegment, segmentOptions = [], isOpen = false, onClose, onLabelChange, onDelete, onCreateSegment, onRenameSegment, onDeleteSegment }) {
  const [segmentDraft, setSegmentDraft] = useState('')
  const [segmentError, setSegmentError] = useState(null)
  const [editingSegmentId, setEditingSegmentId] = useState(null)
  const [editingSegmentLabel, setEditingSegmentLabel] = useState('')

  const hasSelected = !!selectedSegment

  // Show panel when there's a selected segment or when explicitly opened (toolbar)
  if (!selectedSegment && !isOpen) {
    return null
  }

  const segmentData = (segmentOptions ?? []).map((s) => ({ value: s.id, label: s.label }))

  const handleCreate = () => {
    const result = onCreateSegment?.()
    if (result && !result.ok) {
      setSegmentError(result.error ?? 'Segment konnte nicht angelegt werden.')
      return
    }

    setSegmentError(null)
    setSegmentDraft('')
  }

  const handleStartRename = (segmentId, label) => {
    setSegmentError(null)
    setEditingSegmentId(segmentId)
    setEditingSegmentLabel(label)
  }

  const handleRename = () => {
    if (!editingSegmentId) return
    const result = onRenameSegment?.(editingSegmentId, editingSegmentLabel)
    if (result && !result.ok) {
      setSegmentError(result.error ?? 'Segment konnte nicht umbenannt werden.')
      return
    }

    setSegmentError(null)
    setEditingSegmentId(null)
    setEditingSegmentLabel('')
  }

  const handleDelete = (segmentId) => {
    const result = onDeleteSegment?.(segmentId)
    if (result && !result.ok) {
      setSegmentError(result.error ?? 'Segment konnte nicht gelöscht werden.')
      return
    }

    setSegmentError(null)
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
          <Text className="skill-panel__selected-value">{hasSelected ? selectedSegment.label : '—'}</Text>
        </Paper>

        {hasSelected ? (
          <>
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

            <Button color="red" variant="outline" onClick={onDelete}>Segment löschen</Button>
          </>
        ) : (
          <Text size="sm" c="dimmed">Kein Segment ausgewählt — öffne ein Segment oder erstelle eines unten.</Text>
        )}

        <Divider />

        <Group align="flex-end" wrap="nowrap">
          <TextInput
            label="Segmente verwalten"
            placeholder="Neues Segment"
            value={segmentDraft}
            onChange={(e) => setSegmentDraft(e.currentTarget.value)}
            style={{ flex: 1 }}
            classNames={{ input: 'mantine-dark-input', label: 'mantine-dark-label' }}
          />
          <ActionIcon variant="light" color="cyan" size="lg" onClick={handleCreate} aria-label="Segment hinzufügen">+</ActionIcon>
        </Group>

        <Stack gap={8}>
          {segmentData.length === 0 && <Text size="sm" c="dimmed">Noch keine Segmente vorhanden.</Text>}

          {segmentData.map((segment) => (
            <Paper key={segment.value} withBorder radius="md" p="xs">
              {editingSegmentId === segment.value ? (
                <Stack gap={8}>
                  <TextInput value={editingSegmentLabel} onChange={(event) => setEditingSegmentLabel(event.currentTarget.value)} classNames={{ input: 'mantine-dark-input' }} />
                  <Group justify="space-between">
                    <Button size="xs" variant="light" onClick={() => { setEditingSegmentId(null); setEditingSegmentLabel('') }}>Abbrechen</Button>
                    <Button size="xs" onClick={handleRename}>Speichern</Button>
                  </Group>
                </Stack>
              ) : (
                <Group justify="space-between" wrap="nowrap">
                  <Text size="sm" truncate>{segment.label}</Text>
                  <Group gap={6} wrap="nowrap">
                    <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => handleStartRename(segment.value, segment.label)} aria-label="Segment umbenennen">✎</ActionIcon>
                    <ActionIcon size="sm" variant="subtle" color="red" onClick={() => handleDelete(segment.value)} aria-label="Segment löschen">✕</ActionIcon>
                  </Group>
                </Group>
              )}
            </Paper>
          ))}

          {segmentError && <Alert color="red" variant="light">{segmentError}</Alert>}
        </Stack>
      </Stack>
    </Paper>
  )
}