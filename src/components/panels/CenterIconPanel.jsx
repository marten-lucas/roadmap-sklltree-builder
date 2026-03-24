import { ActionIcon, Button, Paper, Stack, Text, TextInput } from '@mantine/core'
import { useRef } from 'react'
import { MarkdownField } from './MarkdownField'

export function CenterIconPanel({
  isOpen,
  iconSource,
  onClose,
  onUpload,
  onResetDefault,
  roadmapData,
  commitDocument,
}) {
  const fileInputRef = useRef(null)

  if (!isOpen) {
    return null
  }

  return (
    <Paper className="skill-panel skill-panel--icon" radius="xl" shadow="xl">
      <div className="skill-panel__header">
        <div>
          <Text className="skill-panel__eyebrow">Center Icon</Text>
          <Text className="skill-panel__title">Icon konfigurieren</Text>
        </div>
        <div className="skill-panel__header-actions">
          <ActionIcon variant="subtle" color="gray" onClick={onClose} aria-label="Icon-Panel schliessen">
            ✕
          </ActionIcon>
        </div>
      </div>

      <Stack gap="md" className="skill-panel__body">
        <input
          ref={fileInputRef}
          type="file"
          accept=".svg,image/svg+xml"
          style={{ display: 'none' }}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0] ?? null
            void onUpload(file)
            event.currentTarget.value = ''
          }}
        />

        <Text size="sm" c="dimmed">System- und Release-Informationen</Text>

        <TextInput
          label="Systemname"
          value={roadmapData?.systemName ?? ''}
          onChange={(e) => commitDocument({ ...roadmapData, systemName: e.currentTarget.value })}
        />

        <TextInput
          label="Release-Name"
          value={roadmapData?.release?.name ?? ''}
          onChange={(e) => commitDocument({ ...roadmapData, release: { ...(roadmapData.release || {}), name: e.currentTarget.value } })}
        />

        <TextInput
          label="Motto"
          value={roadmapData?.release?.motto ?? ''}
          onChange={(e) => commitDocument({ ...roadmapData, release: { ...(roadmapData.release || {}), motto: e.currentTarget.value } })}
        />

        <TextInput
          label="Release Date"
          placeholder="YYYY-MM-DD"
          type="date"
          value={roadmapData?.release?.date ?? ''}
          onChange={(e) => commitDocument({ ...roadmapData, release: { ...(roadmapData.release || {}), date: e.currentTarget.value } })}
        />

        <MarkdownField
          label="Introduction"
          value={roadmapData?.release?.introduction ?? ''}
          onChange={(nextValue) => commitDocument({ ...roadmapData, release: { ...(roadmapData.release || {}), introduction: nextValue } })}
          minRows={3}
        />

        <Button onClick={() => fileInputRef.current?.click()}>
          SVG hochladen
        </Button>

        <Button variant="outline" color="gray" onClick={onResetDefault}>
          Standard-Icon wiederherstellen
        </Button>

        <Paper className="skill-panel__icon-preview" radius="lg" withBorder>
          <img src={iconSource} alt="Center Icon Vorschau" className="skill-panel__icon-preview-image" />
        </Paper>

        <Text size="sm" c="dimmed">
          Lade eine SVG-Datei hoch. Das Icon wird in der Roadmap gespeichert und in Exporten uebernommen.
        </Text>
      </Stack>
    </Paper>
  )
}
