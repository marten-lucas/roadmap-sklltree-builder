import { Button, Input, Radio, RadioGroup, Select, SelectItem } from '@heroui/react'

const STATUS_OPTIONS = [
  { value: 'fertig', label: 'Fertig', color: 'text-blue-300', ring: 'border-blue-400/70' },
  { value: 'jetzt', label: 'Jetzt', color: 'text-cyan-200', ring: 'border-cyan-300/70' },
  { value: 'später', label: 'Später', color: 'text-slate-300', ring: 'border-slate-400/50' },
]

export function InspectorPanel({ selectedNode, currentLevel, onClose, onLabelChange, onStatusChange, onLevelChange, minLevel, maxLevel, segments, onSegmentChange, onDeleteNodeOnly, onDeleteNodeBranch }) {
  if (!selectedNode) {
    return null
  }

  const levelOptions = []
  for (let i = minLevel; i <= maxLevel; i++) {
    levelOptions.push(i)
  }

  return (
    <div className="absolute inset-y-0 right-0 z-50 flex w-96 flex-col border-l border-slate-700/60 bg-slate-950/90 text-slate-100 backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-slate-800 px-6 py-5">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Inspector</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-white">Skill bearbeiten</h2>
        </div>
        <Button isIconOnly size="md" variant="bordered" onPress={onClose} aria-label="Inspector schließen"
          className="border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white">
          ✕
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="flex flex-col gap-8">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
            <p className="mb-2 text-xs uppercase tracking-widest text-slate-500">Ausgewählt</p>
            <p className="text-2xl font-bold text-white">{selectedNode.label}</p>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-300">Name</label>
            <Input
              placeholder="Skill-Name eingeben …"
              value={selectedNode.label}
              onValueChange={onLabelChange}
              variant="bordered"
              size="lg"
              classNames={{
                inputWrapper: [
                  'h-14 bg-slate-900/80 border-slate-700',
                  'hover:border-slate-500 focus-within:!border-cyan-400',
                ].join(' '),
                input: 'text-white text-base',
              }}
            />
          </div>

          <div className="flex flex-col gap-3">
            <label className="text-sm font-medium text-slate-300">Status</label>
            <RadioGroup
              value={selectedNode.status}
              onValueChange={onStatusChange}
              orientation="vertical"
              classNames={{ wrapper: 'gap-3' }}
            >
              {STATUS_OPTIONS.map(({ value, label, color, ring }) => (
                <Radio
                  key={value}
                  value={value}
                  classNames={{
                    base: [
                      'flex items-center w-full max-w-full m-0 rounded-xl border bg-slate-900/60 px-4 py-3',
                      'cursor-pointer transition-colors',
                      selectedNode.status === value
                        ? `${ring} bg-slate-800/80`
                        : 'border-slate-800 hover:border-slate-600',
                    ].join(' '),
                    label: `text-base font-medium ${color}`,
                    wrapper: 'hidden',
                  }}
                >
                  {label}
                </Radio>
              ))}
            </RadioGroup>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-300">Ebene</label>
            <Select
              selectedKeys={new Set([String(currentLevel)])}
              disallowEmptySelection
              onSelectionChange={(keys) => {
                const selected = Array.from(keys)[0]
                if (selected) {
                  onLevelChange(parseInt(selected, 10))
                }
              }}
              renderValue={(items) => items.map((item) => item?.textValue ?? `Ebene ${item?.key}`).join(', ')}
              variant="bordered"
              size="lg"
              className="w-full"
              classNames={{
                trigger: [
                  'h-14 bg-slate-900/80 border-slate-700',
                  'hover:border-slate-500 focus-within:!border-cyan-400',
                ].join(' '),
                value: 'text-white text-base',
              }}
            >
              {levelOptions.map((level) => (
                <SelectItem key={String(level)} textValue={`Ebene ${level}`}>
                  Ebene {level}
                </SelectItem>
              ))}
            </Select>
          </div>

          {segments && segments.length > 0 && (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-300">Segment</label>
              <Select
                selectedKeys={selectedNode.segmentId ? new Set([selectedNode.segmentId]) : new Set()}
                disallowEmptySelection
                onSelectionChange={(keys) => {
                  const selected = Array.from(keys)[0]
                  if (selected) onSegmentChange(selected)
                }}
                renderValue={(items) => items.map((item) => item?.textValue ?? item?.key).join(', ')}
                variant="bordered"
                size="lg"
                className="w-full"
                classNames={{
                  trigger: [
                    'h-14 bg-slate-900/80 border-slate-700',
                    'hover:border-slate-500 focus-within:!border-cyan-400',
                  ].join(' '),
                  value: 'text-white text-base',
                }}
              >
                {segments.map((seg) => (
                  <SelectItem key={seg.id} textValue={seg.label}>
                    {seg.label}
                  </SelectItem>
                ))}
              </Select>
            </div>
          )}

          <div className="mt-2 flex flex-col gap-3 border-t border-slate-800 pt-6">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Löschen</p>
            <Button
              variant="bordered"
              size="lg"
              onPress={onDeleteNodeOnly}
              className="h-12 border-amber-500/40 bg-amber-500/10 text-amber-200 hover:border-amber-400 hover:bg-amber-500/15"
            >
              Skill löschen
            </Button>
            <Button
              color="danger"
              variant="bordered"
              size="lg"
              onPress={onDeleteNodeBranch}
              className="h-12 border-red-500/50 bg-red-500/10 text-red-200 hover:border-red-400 hover:bg-red-500/15"
            >
              Zweig löschen
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
