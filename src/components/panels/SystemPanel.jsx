import { ActionIcon, Alert, Button, NumberInput, Paper, Stack, Tabs, Text, TextInput } from '@mantine/core'
import { useRef } from 'react'
import { MarkdownField } from './MarkdownField'
import { DEFAULT_STORY_POINT_MAP, computeBudgetSummary } from '../utils/effortBenefit'

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

export function SystemPanel({
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

  const allNodes = collectAllNodes(roadmapData)
  const summary = computeBudgetSummary(allNodes, roadmapData)

  return (
    <Paper className="skill-panel skill-panel--icon" radius={0} shadow="none">
      {/* hidden file input */}
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

      {/* ── Header ── */}
      <div className="skill-panel__header">
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text className="skill-panel__eyebrow">System</Text>
          <Text className="skill-panel__title skill-panel__title--node">
            {roadmapData?.systemName ? roadmapData.systemName : 'System konfigurieren'}
          </Text>
        </div>
        <div className="skill-panel__header-actions">
          <ActionIcon variant="subtle" color="gray" onClick={onClose} aria-label="System-Panel schliessen">
            ✕
          </ActionIcon>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="skill-panel__tab-container">
        <Tabs
          defaultValue="release"
          classNames={{
            root: 'skill-panel__tabs-root',
            panel: 'skill-panel__tab-panel',
            list: 'skill-panel__tabs-list',
          }}
        >
          <Tabs.List>
            <Tabs.Tab value="release">Release</Tabs.Tab>
            <Tabs.Tab value="budget">Budget</Tabs.Tab>
            <Tabs.Tab value="icon">Icon</Tabs.Tab>
          </Tabs.List>

          {/* ── Release Tab ── */}
          <Tabs.Panel value="release">
            <div className="skill-panel__tab-scroll skill-panel__tab-scroll--level">
              <Stack gap="md" style={{ flexShrink: 0 }}>
                <TextInput
                  label="Systemname"
                  value={roadmapData?.systemName ?? ''}
                  onChange={(e) => commitDocument({ ...roadmapData, systemName: e.currentTarget.value })}
                  classNames={{ input: 'mantine-dark-input', label: 'mantine-dark-label' }}
                />

                <TextInput
                  label="Release-Name"
                  value={roadmapData?.release?.name ?? ''}
                  onChange={(e) => commitDocument({ ...roadmapData, release: { ...(roadmapData.release || {}), name: e.currentTarget.value } })}
                  classNames={{ input: 'mantine-dark-input', label: 'mantine-dark-label' }}
                />

                <TextInput
                  label="Motto"
                  value={roadmapData?.release?.motto ?? ''}
                  onChange={(e) => commitDocument({ ...roadmapData, release: { ...(roadmapData.release || {}), motto: e.currentTarget.value } })}
                  classNames={{ input: 'mantine-dark-input', label: 'mantine-dark-label' }}
                />

                <TextInput
                  label="Release Date"
                  placeholder="YYYY-MM-DD"
                  type="date"
                  value={roadmapData?.release?.date ?? ''}
                  onChange={(e) => commitDocument({ ...roadmapData, release: { ...(roadmapData.release || {}), date: e.currentTarget.value } })}
                  classNames={{ input: 'mantine-dark-input', label: 'mantine-dark-label' }}
                />
              </Stack>

              <div className="skill-panel__release-note-fill">
                <MarkdownField
                  fill
                  label="Introduction"
                  value={roadmapData?.release?.introduction ?? ''}
                  onChange={(nextValue) => commitDocument({ ...roadmapData, release: { ...(roadmapData.release || {}), introduction: nextValue } })}
                  minRows={4}
                />
              </div>
            </div>
          </Tabs.Panel>

          {/* ── Budget Tab ── */}
          <Tabs.Panel value="budget">
            <div className="skill-panel__tab-scroll">
              <Stack gap="md">
                <Text size="xs" fw={600} tt="uppercase" c="dimmed" lts="0.1em">Story Points Konfiguration</Text>
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

                <Alert color={summary.isOverBudget ? 'red' : 'teal'} variant="light">
                  {summary.budget != null
                    ? `Verbraucht: ${summary.total} / ${summary.budget} SP${summary.isOverBudget ? ' ⚠ Budget überschritten!' : ''}`
                    : `Verbraucht: ${summary.total} SP (kein Budget gesetzt)`}
                </Alert>
              </Stack>
            </div>
          </Tabs.Panel>

          {/* ── Icon Tab ── */}
          <Tabs.Panel value="icon">
            <div className="skill-panel__tab-scroll">
              <Stack gap="md">
                <Paper className="skill-panel__icon-preview" radius="lg" withBorder>
                  <img src={iconSource} alt="Center Icon Vorschau" className="skill-panel__icon-preview-image" />
                </Paper>

                <Button onClick={() => fileInputRef.current?.click()}>
                  SVG hochladen
                </Button>

                <Button variant="outline" color="gray" onClick={onResetDefault}>
                  Standard-Icon wiederherstellen
                </Button>

                <Text size="sm" c="dimmed">
                  Lade eine SVG-Datei hoch. Das Icon wird in der Roadmap gespeichert und in Exporten uebernommen.
                </Text>
              </Stack>
            </div>
          </Tabs.Panel>
        </Tabs>
      </div>
    </Paper>
  )
}
