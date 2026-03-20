import { ActionIcon, Alert, Button, Select, Stack, Text, Textarea } from '@mantine/core'
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
    <div className="absolute inset-y-0 right-0 z-50 flex w-96 flex-col border-l border-slate-700/60 bg-slate-950/90 text-slate-100 backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-slate-800 px-6 py-5">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Inspector</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-white">Skill bearbeiten</h2>
        </div>
        <ActionIcon variant="subtle" color="gray" onClick={onClose} aria-label="Inspector schließen">
          ✕
        </ActionIcon>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <Stack gap="md">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="mb-1 text-xs uppercase tracking-widest text-slate-500">Ausgewählt</p>
            <p className="text-xl font-bold text-white">{selectedNode.label}</p>
          </div>

          <Textarea
            label="Name"
            placeholder="Skill-Name eingeben …"
            value={selectedNode.label}
            onChange={(event) => onLabelChange(event.currentTarget.value)}
            minRows={2}
            maxRows={5}
            styles={{
              label: { color: '#cbd5e1', fontWeight: 500, marginBottom: '0.25rem' },
            }}
          />

          <Select
            label="Status"
            data={STATUS_OPTIONS}
            value={selectedNode.status}
            onChange={(value) => value && onStatusChange(value)}
            allowDeselect={false}
          />

          <Select
            label="Ebene"
            data={levelData}
            value={String(currentLevel)}
            onChange={(value) => value && onLevelChange(parseInt(value, 10))}
            allowDeselect={false}
            description={blockedLevelHint ?? undefined}
          />

          {segmentOptions && segmentOptions.length > 0 && (
            <Select
              label="Segment"
              data={segmentData}
              value={selectedSegmentKey}
              onChange={(value) => value && onSegmentChange(value)}
              allowDeselect={false}
              description={blockedSegmentHint ?? undefined}
            />
          )}

          {validationMessage && (
            <Alert color="yellow" variant="light">
              {validationMessage}
            </Alert>
          )}

          <div className="mt-2 flex flex-col gap-3 border-t border-slate-800 pt-5">
            <Text size="xs" c="dimmed" tt="uppercase" style={{ letterSpacing: '0.2em' }}>Löschen</Text>
            <Button
              variant="default"
              fullWidth
              onClick={onDeleteNodeOnly}
            >
              Skill löschen
            </Button>
            <Button
              color="red"
              variant="outline"
              fullWidth
              onClick={onDeleteNodeBranch}
            >
              Zweig löschen
            </Button>
          </div>
        </Stack>
      </div>
    </div>
  )
}
