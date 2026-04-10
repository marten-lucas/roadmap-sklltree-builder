import { ActionIcon, Alert, Button, Divider, Group, Paper, Text, TextInput, Stack } from '@mantine/core'
import { useState } from 'react'

const TablerCirclePlusIcon = ({ size = 18 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 9v6" />
    <path d="M9 12h6" />
    <path d="M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0 -18" />
  </svg>
)

const TablerPercentIcon = ({ size = 18 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M19 5L5 19" />
    <circle cx="6.5" cy="6.5" r="2.5" />
    <circle cx="17.5" cy="17.5" r="2.5" />
  </svg>
)

export function ToolbarSegmentManager({ segmentOptions = [], onCreateSegment, onRenameSegment, onDeleteSegment, onClose }) {
  const [segmentDraft, setSegmentDraft] = useState('')
  const [segmentError, setSegmentError] = useState(null)
  const [editingSegmentId, setEditingSegmentId] = useState(null)
  const [editingSegmentLabel, setEditingSegmentLabel] = useState('')

  const segmentSelectData = (segmentOptions ?? []).map((s) => ({ value: s.id ?? s.value, label: s.label }))

  const handleCreate = () => {
    const result = onCreateSegment?.(segmentDraft)
    if (result && !result.ok) {
      setSegmentError(result.error ?? 'Segment could not be created.')
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

  const handleRename = async () => {
    if (!editingSegmentId) return
    const result = await onRenameSegment?.(editingSegmentId, editingSegmentLabel)
    if (result && !result.ok) {
      setSegmentError(result.error ?? 'Segment could not be renamed.')
      return
    }

    setSegmentError(null)
    setEditingSegmentId(null)
    setEditingSegmentLabel('')
  }

  const handleDelete = async (segmentId) => {
    const result = await onDeleteSegment?.(segmentId)
    if (result && !result.ok) {
      setSegmentError(result.error ?? 'Segment could not be deleted.')
      return
    }

    setSegmentError(null)
    if (editingSegmentId === segmentId) {
      setEditingSegmentId(null)
      setEditingSegmentLabel('')
    }
  }

  return (
    <Paper className="skill-panel skill-panel--segments" radius={0} shadow="none">
      <div className="skill-panel__header">
        <div>
          <Text className="skill-panel__eyebrow">Segmente</Text>
          <Text className="skill-panel__title">Manage segments</Text>
        </div>
        <div className="skill-panel__header-actions">
          <ActionIcon variant="subtle" color="gray" onClick={onClose} aria-label="Close segment manager">✕</ActionIcon>
        </div>
      </div>

      <div className="skill-panel__body skill-panel__body--scrollable">
        <Stack gap="md">
          <Group align="flex-end" wrap="nowrap">
            <TextInput
              label="Manage segments"
              placeholder="New segment"
              value={segmentDraft}
              onChange={(e) => setSegmentDraft(e.currentTarget.value)}
              style={{ flex: 1 }}
              classNames={{ input: 'mantine-dark-input', label: 'mantine-dark-label' }}
            />
            <ActionIcon variant="light" color="cyan" size="lg" onClick={handleCreate} aria-label="Add segment">
              <TablerCirclePlusIcon size={20} />
            </ActionIcon>
          </Group>

          <Divider />

          <Stack gap={8}>
            {segmentSelectData.length === 0 && (
              <Text size="sm" c="dimmed">No segments yet.</Text>
            )}

            {segmentSelectData.map((segment) => (
              <Paper key={segment.value} withBorder radius="md" p="xs">
                {editingSegmentId === segment.value ? (
                  <Stack gap={8}>
                    <TextInput
                      value={editingSegmentLabel}
                      onChange={(event) => setEditingSegmentLabel(event.currentTarget.value)}
                      classNames={{ input: 'mantine-dark-input' }}
                    />
                    <Group justify="space-between">
                      <Button size="xs" variant="light" onClick={() => { setEditingSegmentId(null); setEditingSegmentLabel('') }}>Cancel</Button>
                      <Button size="xs" onClick={handleRename}>Save</Button>
                    </Group>
                  </Stack>
                ) : (
                  <Group justify="space-between" wrap="nowrap">
                    <Text size="sm" truncate>{segment.label}</Text>
                    <Group gap={6} wrap="nowrap">
                      <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => handleStartRename(segment.value, segment.label)} aria-label="Rename segment">✎</ActionIcon>
                      <ActionIcon size="sm" variant="subtle" color="red" onClick={() => handleDelete(segment.value)} aria-label="Delete segment">✕</ActionIcon>
                    </Group>
                  </Group>
                )}
              </Paper>
            ))}

            {segmentError && (
              <Alert color="red" variant="light">{segmentError}</Alert>
            )}
          </Stack>
        </Stack>
      </div>
    </Paper>
  )
}

export default ToolbarSegmentManager
