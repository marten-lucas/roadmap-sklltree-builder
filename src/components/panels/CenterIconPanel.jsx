import { ActionIcon, Alert, Button, NumberInput, Paper, Stack, Text, TextInput } from '@mantine/core'
import { useRef } from 'react'
import { MarkdownField } from './MarkdownField'
import { DEFAULT_STORY_POINT_MAP } from '../utils/effortBenefit'
import { computeBudgetSummary } from '../utils/effortBenefit'

const T_SHIRT_KEYS = ['xs', 's', 'm', 'l', 'xl']

const collectAllNodes = (document) => {
  const all = []
  const queue = [...(document?.children ?? [])]
  while (queue.length > 0) {
    const node = queue.shift()
    all.push(node)
    queue.push(...(node.children ?? []))
  }
  return all
}

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

      <div className="skill-panel__body skill-panel__body--scrollable">
        <Stack gap="md">
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

        <Text size="sm" c="dimmed" mt="xs">Story Points Konfiguration</Text>

        <Stack gap={6}>
          {T_SHIRT_KEYS.map((key) => (
            <NumberInput
              key={key}
              label={`SP für ${key.toUpperCase()}`}
              value={roadmapData?.storyPointMap?.[key] ?? DEFAULT_STORY_POINT_MAP[key]}
              onChange={(val) => {
                const v = val === '' ? DEFAULT_STORY_POINT_MAP[key] : Number(val)
                const next = { ...(roadmapData?.storyPointMap ?? DEFAULT_STORY_POINT_MAP), [key]: v }
                commitDocument({ ...roadmapData, storyPointMap: next })
              }}
              min={0}
              allowDecimal={false}
              rightSection={<Text size="xs" c="dimmed">SP</Text>}
              classNames={{ input: 'mantine-dark-input', label: 'mantine-dark-label' }}
            />
          ))}
        </Stack>

        <NumberInput
          label="Verfügbare Story Points (Budget)"
          placeholder="z.B. 40"
          value={roadmapData?.storyPointBudget ?? ''}
          onChange={(val) => {
            commitDocument({ ...roadmapData, storyPointBudget: val === '' ? null : Number(val) })
          }}
          min={0}
          allowDecimal={false}
          classNames={{ input: 'mantine-dark-input', label: 'mantine-dark-label' }}
        />

        {(() => {
          const allNodes = collectAllNodes(roadmapData)
          const summary = computeBudgetSummary(allNodes, roadmapData)
          const budgetSet = summary.budget != null
          return (
            <Alert
              color={summary.isOverBudget ? 'red' : 'teal'}
              variant="light"
            >
              {budgetSet
                ? `Verbraucht: ${summary.total} / ${summary.budget} SP${summary.isOverBudget ? ' ⚠ Budget überschritten!' : ''}`
                : `Verbraucht: ${summary.total} SP (kein Budget gesetzt)`}
            </Alert>
          )
        })()}

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
      </div>
    </Paper>
  )
}
