import { ActionIcon, Alert, Button, NumberInput, Paper, Stack, Tabs, Text, TextInput } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'
import { MarkdownField } from './MarkdownField'
import { DEFAULT_STORY_POINT_MAP, computeBudgetSummary } from '../utils/effortBenefit'
import { addRelease, deleteRelease, updateRelease } from '../utils/releases'

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
  selectedReleaseId,
  onReleaseChange,
}) {
  const fileInputRef = useRef(null)
  const [newReleaseName, setNewReleaseName] = useState('')
  const [newReleaseDialogOpen, setNewReleaseDialogOpen] = useState(false)
  const [activeTabValue, setActiveTabValue] = useState(selectedReleaseId ?? 'system')

  const releases = roadmapData.releases ?? []

  useEffect(() => {
    const releaseTabIds = new Set(releases.map((release) => release.id))

    setActiveTabValue((currentValue) => {
      if (currentValue === 'system' || currentValue === 'icon' || currentValue === '__add__') {
        return currentValue === '__add__' ? 'system' : currentValue
      }

      if (selectedReleaseId && releaseTabIds.has(selectedReleaseId)) {
        return selectedReleaseId
      }

      if (currentValue && releaseTabIds.has(currentValue)) {
        return currentValue
      }

      return releases[0]?.id ?? 'system'
    })
  }, [releases, selectedReleaseId])

  if (!isOpen) {
    return null
  }

  const activeRelease = releases.find((r) => r.id === selectedReleaseId) ?? releases[0] ?? null
  const allNodes = collectAllNodes(roadmapData)

  const handleUpdateRelease = (field, value) => {
    if (!activeRelease) return
    commitDocument({
      ...roadmapData,
      releases: updateRelease(releases, activeRelease.id, { [field]: value }),
    })
  }

  const handleAddRelease = () => {
    const name = newReleaseName.trim() || `Release ${releases.length + 1}`
    const { releases: nextReleases, newReleaseId } = addRelease(releases, name)
    commitDocument({ ...roadmapData, releases: nextReleases })
    setActiveTabValue(newReleaseId)
    onReleaseChange?.(newReleaseId)
    setNewReleaseName('')
    setNewReleaseDialogOpen(false)
  }

  const handleDeleteRelease = () => {
    if (!activeRelease || releases.length <= 1) return
    const nextReleases = deleteRelease(releases, activeRelease.id)
    commitDocument({ ...roadmapData, releases: nextReleases })
    const nextReleaseId = nextReleases[0]?.id ?? null
    setActiveTabValue(nextReleaseId ?? 'system')
    onReleaseChange?.(nextReleaseId)
  }

  const activeBudget = activeRelease?.storyPointBudget ?? null
  const summary = activeRelease
    ? computeBudgetSummary(allNodes, roadmapData.storyPointMap ?? DEFAULT_STORY_POINT_MAP, activeBudget)
    : { total: 0, budget: null, isOverBudget: false }

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
            {roadmapData?.systemName ? roadmapData.systemName : 'Configure system'}
          </Text>
        </div>
        <div className="skill-panel__header-actions">
          <ActionIcon variant="subtle" color="gray" onClick={onClose} aria-label="Close system panel">
            ✕
          </ActionIcon>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="skill-panel__tab-container">
        <Tabs
          value={activeTabValue}
          onChange={(val) => {
            if (!val || val === '__add__') {
              return
            }

            setActiveTabValue(val)

            if (releases.some((release) => release.id === val)) {
              onReleaseChange?.(val)
            }
          }}
          classNames={{
            root: 'skill-panel__tabs-root',
            panel: 'skill-panel__tab-panel',
            list: 'skill-panel__tabs-list',
          }}
        >
          <Tabs.List>
            {releases.map((release) => (
              <Tabs.Tab key={release.id} value={release.id}>
                {release.name || 'Release'}
              </Tabs.Tab>
            ))}
            <Tabs.Tab value="__add__" onClick={(e) => { e.preventDefault(); setNewReleaseDialogOpen(true) }}>
              +
            </Tabs.Tab>
            <Tabs.Tab value="system">System</Tabs.Tab>
            <Tabs.Tab value="icon">Icon</Tabs.Tab>
          </Tabs.List>

          {/* ── Per-Release Tabs ── */}
          {releases.map((release) => (
            <Tabs.Panel key={release.id} value={release.id}>
              <div className="skill-panel__tab-scroll skill-panel__tab-scroll--fill">
                <Stack gap="md" style={{ flexShrink: 0 }}>
                  <TextInput
                    label="Release name"
                    value={release.name ?? ''}
                    onChange={(e) => commitDocument({
                      ...roadmapData,
                      releases: updateRelease(releases, release.id, { name: e.currentTarget.value }),
                    })}
                    classNames={{ input: 'mantine-dark-input', label: 'mantine-dark-label' }}
                  />

                  <TextInput
                    label="Motto"
                    value={release.motto ?? ''}
                    onChange={(e) => commitDocument({
                      ...roadmapData,
                      releases: updateRelease(releases, release.id, { motto: e.currentTarget.value }),
                    })}
                    classNames={{ input: 'mantine-dark-input', label: 'mantine-dark-label' }}
                  />

                  <TextInput
                    label="Release Date"
                    placeholder="YYYY-MM-DD"
                    type="date"
                    value={release.date ?? ''}
                    onChange={(e) => commitDocument({
                      ...roadmapData,
                      releases: updateRelease(releases, release.id, { date: e.currentTarget.value }),
                    })}
                    classNames={{ input: 'mantine-dark-input', label: 'mantine-dark-label' }}
                  />

                  <NumberInput
                    label="Available Story Points (Budget)"
                    placeholder="e.g. 40"
                    value={release.storyPointBudget ?? ''}
                    onChange={(val) => commitDocument({
                      ...roadmapData,
                      releases: updateRelease(releases, release.id, { storyPointBudget: val === '' ? null : Number(val) }),
                    })}
                    min={0}
                    allowDecimal={false}
                    classNames={{ input: 'mantine-dark-input', label: 'mantine-dark-label' }}
                  />

                  {release.id === activeRelease?.id && (
                    <Alert color={summary.isOverBudget ? 'red' : 'teal'} variant="light">
                      {summary.budget != null
                        ? `Used: ${summary.total} / ${summary.budget} SP${summary.isOverBudget ? ' ⚠ Budget exceeded!' : ''}`
                        : `Used: ${summary.total} SP (no budget set)`}
                    </Alert>
                  )}
                </Stack>

                <div className="skill-panel__release-note-fill">
                  <MarkdownField
                    fill
                    label="Introduction"
                    value={release.introduction ?? ''}
                    onChange={(nextValue) => commitDocument({
                      ...roadmapData,
                      releases: updateRelease(releases, release.id, { introduction: nextValue }),
                    })}
                    minRows={4}
                  />
                </div>

                {releases.length > 1 && (
                  <div style={{ padding: '8px 0 4px' }}>
                    <Button
                      variant="subtle"
                      color="red"
                      size="xs"
                      onClick={handleDeleteRelease}
                    >
                      Delete release
                    </Button>
                  </div>
                )}
              </div>
            </Tabs.Panel>
          ))}

          {/* ── New Release Dialog (inline) ── */}
          {newReleaseDialogOpen && (
            <div style={{ padding: '12px', borderTop: '1px solid #333' }}>
              <Stack gap="xs">
                <Text size="sm" fw={600}>New Release</Text>
                <TextInput
                  placeholder="Release name"
                  value={newReleaseName}
                  onChange={(e) => setNewReleaseName(e.currentTarget.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddRelease() }}
                  classNames={{ input: 'mantine-dark-input' }}
                  autoFocus
                />
                <Stack gap={4} direction="row">
                  <Button size="xs" onClick={handleAddRelease}>Create</Button>
                  <Button size="xs" variant="default" onClick={() => { setNewReleaseDialogOpen(false); setNewReleaseName('') }}>Cancel</Button>
                </Stack>
              </Stack>
            </div>
          )}

          {/* ── SP-Skala Tab ── */}
          <Tabs.Panel value="system">
            <div className="skill-panel__tab-scroll">
              <Stack gap="md">
                <TextInput
                  label="Systemname"
                  value={roadmapData?.systemName ?? ''}
                  onChange={(e) => commitDocument({ ...roadmapData, systemName: e.currentTarget.value })}
                  classNames={{ input: 'mantine-dark-input', label: 'mantine-dark-label' }}
                />

                <Text size="xs" fw={600} tt="uppercase" c="dimmed" lts="0.1em">Story Point Scale</Text>
                <Stack gap={6}>
                  {T_SHIRT_KEYS.map((key) => (
                    <NumberInput
                      key={key}
                      label={`SP for ${key.toUpperCase()}`}
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
              </Stack>
            </div>
          </Tabs.Panel>

          {/* ── Icon Tab ── */}
          <Tabs.Panel value="icon">
            <div className="skill-panel__tab-scroll">
              <Stack gap="md">
                <Paper className="skill-panel__icon-preview" radius="lg" withBorder>
                  <img src={iconSource} alt="Center icon preview" className="skill-panel__icon-preview-image" />
                </Paper>

                <Button onClick={() => fileInputRef.current?.click()}>
                  Upload SVG
                </Button>

                <Button variant="outline" color="gray" onClick={onResetDefault}>
                  Restore default icon
                </Button>

                <Text size="sm" c="dimmed">
                  Upload an SVG file. The icon will be saved to the roadmap and included in exports.
                </Text>
              </Stack>
            </div>
          </Tabs.Panel>
        </Tabs>
      </div>
    </Paper>
  )
}
