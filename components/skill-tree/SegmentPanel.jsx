import { Button, Input } from '@heroui/react'

export function SegmentPanel({ selectedSegment, onClose, onLabelChange, onDelete }) {
  if (!selectedSegment) {
    return null
  }

  return (
    <div className="absolute right-6 top-6 z-50 flex w-80 flex-col rounded-2xl border border-slate-700/60 bg-slate-950/90 text-slate-100 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Segment</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-white">Segment bearbeiten</h2>
        </div>
        <Button
          isIconOnly
          size="sm"
          variant="light"
          onPress={onClose}
          aria-label="Segment-Editor schließen"
        >
          ✕
        </Button>
      </div>

      <div className="flex flex-col gap-5 px-5 py-5">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="mb-1 text-xs uppercase tracking-widest text-slate-500">Ausgewählt</p>
          <p className="text-xl font-bold text-white">{selectedSegment.label}</p>
        </div>

        <Input
          label="Name"
          labelPlacement="outside-top"
          placeholder="Segment-Name eingeben …"
          value={selectedSegment.label}
          onValueChange={onLabelChange}
          variant="bordered"
          classNames={{
            label: 'text-slate-300 font-medium pb-1',
            inputWrapper: 'border-slate-700 hover:border-slate-500 focus-within:!border-cyan-400',
            input: 'text-white placeholder:text-slate-500',
          }}
        />

        <Button
          color="danger"
          variant="bordered"
          fullWidth
          onPress={onDelete}
        >
          Segment löschen
        </Button>
      </div>
    </div>
  )
}