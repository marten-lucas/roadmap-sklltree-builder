import { ActionIcon, Button, Paper, Stack, Text } from '@mantine/core'
import { useRef } from 'react'

export function CenterIconPanel({ isOpen, iconSource, onClose, onUpload, onResetDefault }) {
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
        <Paper className="skill-panel__icon-preview" radius="lg" withBorder>
          <img src={iconSource} alt="Center Icon Vorschau" className="skill-panel__icon-preview-image" />
        </Paper>

        <Text size="sm" c="dimmed">
          Lade eine SVG-Datei hoch. Das Icon wird in der Roadmap gespeichert und in Exporten uebernommen.
        </Text>

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

        <Button onClick={() => fileInputRef.current?.click()}>
          SVG hochladen
        </Button>

        <Button variant="outline" color="gray" onClick={onResetDefault}>
          Standard-Icon wiederherstellen
        </Button>
      </Stack>
    </Paper>
  )
}
