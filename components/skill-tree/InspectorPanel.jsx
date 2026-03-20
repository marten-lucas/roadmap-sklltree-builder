import { Button, Textarea, Select, SelectItem } from '@heroui/react'
import { UNASSIGNED_SEGMENT_ID } from './layoutShared'

const STATUS_OPTIONS = [
  { value: 'fertig', label: 'Fertig' },
  { value: 'jetzt', label: 'Jetzt' },
  { value: 'später', label: 'Später' },
]

const selectClassNames = {
  label: 'text-slate-300 font-medium pb-1',
  trigger: 'border-slate-700 hover:border-slate-500 data-[open=true]:!border-cyan-400 bg-transparent',
  value: 'text-white',
  popoverContent: 'bg-slate-900 border border-slate-700 text-white',
  description: 'text-amber-300/90 text-xs',
}

export function InspectorPanel({ selectedNode, currentLevel, onClose, onLabelChange, onStatusChange, onLevelChange, levelOptions, segmentOptions, validationMessage, onSegmentChange, onDeleteNodeOnly, onDeleteNodeBranch }) {
  if (!selectedNode) {
    return null
  }

  const selectedSegmentKey = selectedNode.segmentId ?? UNASSIGNED_SEGMENT_ID
  const blockedLevelHint = levelOptions.find((option) => !option.isAllowed)?.reasons?.[0] ?? null
  const blockedSegmentHint = segmentOptions?.find((option) => !option.isAllowed)?.reasons?.[0] ?? null
  const disabledLevelKeys = levelOptions.filter(o => !o.isAllowed).map(o => String(o.value))
  const disabledSegmentKeys = segmentOptions?.filter(o => !o.isAllowed).map(o => o.id) ?? []

  const handleStatusChange = (keys) => {
    const selected = Array.from(keys)[0]
    if (selected) onStatusChange(selected)
  }

  const handleLevelChange = (keys) => {
    const selected = Array.from(keys)[0]
    if (selected) onLevelChange(parseInt(selected, 10))
  }

  const handleSegmentChange = (keys) => {
    const selected = Array.from(keys)[0]
    if (selected) onSegmentChange(selected)
  }

  return (
    <div className="absolute inset-y-0 right-0 z-50 flex w-96 flex-col border-l border-slate-700/60 bg-slate-950/90 text-slate-100 backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-slate-800 px-6 py-5">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Inspector</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-white">Skill bearbeiten</h2>
        </div>
        <Button isIconOnly variant="light" onPress={onClose} aria-label="Inspector schließen">
          ✕
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="flex flex-col gap-5">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="mb-1 text-xs uppercase tracking-widest text-slate-500">Ausgewählt</p>
            <p className="text-xl font-bold text-white">{selectedNode.label}</p>
          </div>

          <Textarea
            label="Name"
            labelPlacement="outside-top"
            placeholder="Skill-Name eingeben …"
            value={selectedNode.label}
            onValueChange={onLabelChange}
            variant="bordered"
            minRows={2}
            maxRows={5}
            classNames={{
              label: 'text-slate-300 font-medium pb-1',
              inputWrapper: 'border-slate-700 hover:border-slate-500 focus-within:!border-cyan-400',
              input: 'text-white placeholder:text-slate-500',
            }}
          />

          <Select
            label="Status"
            labelPlacement="outside-top"
            selectedKeys={new Set([selectedNode.status])}
            onSelectionChange={handleStatusChange}
            variant="bordered"
            disallowEmptySelection
            classNames={selectClassNames}
          >
            {STATUS_OPTIONS.map(({ value, label }) => (
              <SelectItem key={value}>{label}</SelectItem>
            ))}
          </Select>

          <Select
            label="Ebene"
            labelPlacement="outside-top"
            selectedKeys={new Set([String(currentLevel)])}
            onSelectionChange={handleLevelChange}
            variant="bordered"
            disallowEmptySelection
            disabledKeys={disabledLevelKeys}
            description={blockedLevelHint}
            classNames={selectClassNames}
          >
            {levelOptions.map((option) => (
              <SelectItem key={String(option.value)}>Ebene {option.value}</SelectItem>
            ))}
          </Select>

          {segmentOptions && segmentOptions.length > 0 && (
            <Select
              label="Segment"
              labelPlacement="outside-top"
              selectedKeys={new Set([selectedSegmentKey])}
              onSelectionChange={handleSegmentChange}
              variant="bordered"
              disallowEmptySelection
              disabledKeys={disabledSegmentKeys}
              description={blockedSegmentHint}
              classNames={selectClassNames}
            >
              {segmentOptions.map((segmentOption) => (
                <SelectItem key={segmentOption.id}>{segmentOption.label}</SelectItem>
              ))}
            </Select>
          )}

          {validationMessage && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              {validationMessage}
            </div>
          )}

          <div className="mt-2 flex flex-col gap-3 border-t border-slate-800 pt-5">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Löschen</p>
            <Button
              variant="bordered"
              fullWidth
              onPress={onDeleteNodeOnly}
              className="border-slate-700 text-slate-300 hover:border-slate-500"
            >
              Skill löschen
            </Button>
            <Button
              color="danger"
              variant="bordered"
              fullWidth
              onPress={onDeleteNodeBranch}
            >
              Zweig löschen
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
