import { ActionIcon, Alert, Button, NumberInput, Paper, Stack, Tabs, Text, TextInput } from '@mantine/core'
import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react'
import { MarkdownField } from './MarkdownField'
import { DEFAULT_STORY_POINT_MAP, computeBudgetSummary } from '../utils/effortBenefit'
import { addRelease, deleteRelease, updateRelease } from '../utils/releases'
import { DEFAULT_STATUS_DESCRIPTIONS, STATUS_LABELS } from '../config'

const T_SHIRT_KEYS = ['xs', 's', 'm', 'l', 'xl']
const STATUS_DESCRIPTION_KEYS = ['now', 'next', 'later', 'someday', 'done', 'hidden']

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

export const SystemPanel = forwardRef(function SystemPanel(
  {
    isOpen,
    iconSource,
    onClose,
    onUpload,
    onResetDefault,
    roadmapData,
    commitDocument,
    selectedReleaseId,
    onReleaseChange,
    onDraftChange,
  },
  forwardedRef,
) {
  const fileInputRef = useRef(null)
  const [activeTabValue, setActiveTabValue] = useState(selectedReleaseId ?? 'system')
  const [systemNameDraft, setSystemNameDraft] = useState('')
  const [statusDescriptionsDraft, setStatusDescriptionsDraft] = useState({ ...DEFAULT_STATUS_DESCRIPTIONS })
  const [releaseDraftId, setReleaseDraftId] = useState(null)
  const [releaseNameDraft, setReleaseNameDraft] = useState('')
  const [releaseMottoDraft, setReleaseMottoDraft] = useState('')
  const [releaseDateDraft, setReleaseDateDraft] = useState('')
  const [introductionDraft, setIntroductionDraft] = useState('')

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

  const activeRelease = releases.find((r) => r.id === selectedReleaseId) ?? releases[0] ?? null

  useEffect(() => {
    setSystemNameDraft(roadmapData?.systemName ?? '')
  }, [roadmapData?.systemName])

  useEffect(() => {
    setStatusDescriptionsDraft({
      ...DEFAULT_STATUS_DESCRIPTIONS,
      ...(roadmapData?.statusDescriptions ?? {}),
    })
  }, [roadmapData?.statusDescriptions])

  useEffect(() => {
    const nextReleaseId = activeRelease?.id ?? null
    setReleaseDraftId(nextReleaseId)
    setReleaseNameDraft(activeRelease?.name ?? '')
    setReleaseMottoDraft(activeRelease?.motto ?? '')
    setReleaseDateDraft(activeRelease?.date ?? '')
    setIntroductionDraft(activeRelease?.introduction ?? '')
  }, [activeRelease?.id, activeRelease?.name, activeRelease?.motto, activeRelease?.date, activeRelease?.introduction])

  useImperativeHandle(
    forwardedRef,
    () => ({
      commitDrafts: () => commitTextDrafts(),
    }),
    [releaseDraftId],
  )

  useEffect(() => {
    if (!onDraftChange) {
      return
    }

    const draftRelease = {
      id: releaseDraftId,
      name: releaseNameDraft,
      motto: releaseMottoDraft,
      date: releaseDateDraft,
      introduction: introductionDraft,
    }

    onDraftChange(draftRelease)
  }, [releaseDraftId, releaseNameDraft, releaseMottoDraft, releaseDateDraft, introductionDraft, onDraftChange])

  const commitTextDrafts = (releaseId = releaseDraftId) => {
    let nextRoadmapData = roadmapData
    let hasChanges = false

    if (systemNameDraft !== (roadmapData?.systemName ?? '')) {
      nextRoadmapData = {
        ...nextRoadmapData,
        systemName: systemNameDraft,
      }
      hasChanges = true
    }

    const currentStatusDescriptions = {
      ...DEFAULT_STATUS_DESCRIPTIONS,
      ...(roadmapData?.statusDescriptions ?? {}),
    }
    const hasStatusDescriptionChanges = STATUS_DESCRIPTION_KEYS.some(
      (key) => (statusDescriptionsDraft[key] ?? '') !== (currentStatusDescriptions[key] ?? ''),
    )

    if (hasStatusDescriptionChanges) {
      nextRoadmapData = {
        ...nextRoadmapData,
        statusDescriptions: {
          ...currentStatusDescriptions,
          ...statusDescriptionsDraft,
        },
      }
      hasChanges = true
    }

    if (releaseId) {
      const release = releases.find((entry) => entry.id === releaseId)
      if (release) {
        const releasePatch = {}

        if (releaseNameDraft !== (release.name ?? '')) {
          releasePatch.name = releaseNameDraft
        }
        if (releaseMottoDraft !== (release.motto ?? '')) {
          releasePatch.motto = releaseMottoDraft
        }
        if (releaseDateDraft !== (release.date ?? '')) {
          releasePatch.date = releaseDateDraft
        }
        if (introductionDraft !== (release.introduction ?? '')) {
          releasePatch.introduction = introductionDraft
        }

        if (Object.keys(releasePatch).length > 0) {
          nextRoadmapData = {
            ...nextRoadmapData,
            releases: updateRelease(nextRoadmapData.releases ?? releases, releaseId, releasePatch),
          }
          hasChanges = true
        }
      }
    }

    if (hasChanges) {
      commitDocument(nextRoadmapData)
    }
  }

  useImperativeHandle(
    forwardedRef,
    () => ({
      commitDrafts: () => commitTextDrafts(),
    }),
    [releaseDraftId],
  )

  if (!isOpen) {
    return null
  }

  const allNodes = collectAllNodes(roadmapData)

  const handleAddRelease = () => {
    const name = 'Neues Release'
    const { releases: nextReleases, newReleaseId } = addRelease(releases, name)
    commitDocument({ ...roadmapData, releases: nextReleases })
    setActiveTabValue(newReleaseId)
    onReleaseChange?.(newReleaseId)
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
    ? computeBudgetSummary(allNodes, roadmapData.storyPointMap ?? DEFAULT_STORY_POINT_MAP, activeBudget, activeRelease.id)
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
          <ActionIcon
            variant="subtle"
            color="gray"
            onClick={() => {
              commitTextDrafts()
              onClose()
            }}
            aria-label="Close system panel"
          >
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

            commitTextDrafts()

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
            <Tabs.Tab
              value="__add__"
              onClick={(e) => {
                e.preventDefault()
                commitTextDrafts()
                handleAddRelease()
              }}
            >
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
                    value={releaseDraftId === release.id ? releaseNameDraft : (release.name ?? '')}
                    onChange={(e) => {
                      setReleaseDraftId(release.id)
                      setReleaseNameDraft(e.currentTarget.value)
                    }}
                    onBlur={() => commitTextDrafts(release.id)}
                    classNames={{ input: 'mantine-dark-input', label: 'mantine-dark-label' }}
                  />

                  <TextInput
                    label="Motto"
                    value={releaseDraftId === release.id ? releaseMottoDraft : (release.motto ?? '')}
                    onChange={(e) => {
                      setReleaseDraftId(release.id)
                      setReleaseMottoDraft(e.currentTarget.value)
                    }}
                    onBlur={() => commitTextDrafts(release.id)}
                    classNames={{ input: 'mantine-dark-input', label: 'mantine-dark-label' }}
                  />

                  <TextInput
                    label="Release Date"
                    placeholder="YYYY-MM-DD"
                    type="date"
                    value={releaseDraftId === release.id ? releaseDateDraft : (release.date ?? '')}
                    onChange={(e) => {
                      setReleaseDraftId(release.id)
                      setReleaseDateDraft(e.currentTarget.value)
                    }}
                    onBlur={() => commitTextDrafts(release.id)}
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
                    value={releaseDraftId === release.id ? introductionDraft : (release.introduction ?? '')}
                    onChange={(nextValue) => {
                      setReleaseDraftId(release.id)
                      setIntroductionDraft(nextValue)
                    }}
                    onBlur={() => commitTextDrafts(release.id)}
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

          {/* ── SP-Skala Tab ── */}
          <Tabs.Panel value="system">
            <div className="skill-panel__tab-scroll">
              <Stack gap="md">
                <TextInput
                  label="Systemname"
                  value={systemNameDraft}
                  onChange={(e) => setSystemNameDraft(e.currentTarget.value)}
                  onBlur={() => commitTextDrafts()}
                  classNames={{ input: 'mantine-dark-input', label: 'mantine-dark-label' }}
                />

                <Text size="xs" fw={600} tt="uppercase" c="dimmed" lts="0.1em">Status descriptions</Text>
                <Stack gap={6}>
                  {STATUS_DESCRIPTION_KEYS.map((key) => (
                    <TextInput
                      key={key}
                      label={`${STATUS_LABELS[key]} description`}
                      value={statusDescriptionsDraft[key] ?? ''}
                      placeholder={DEFAULT_STATUS_DESCRIPTIONS[key]}
                      onChange={(e) => {
                        const nextValue = e.currentTarget.value
                        setStatusDescriptionsDraft((current) => ({
                          ...current,
                          [key]: nextValue,
                        }))
                      }}
                      onBlur={() => commitTextDrafts()}
                      classNames={{ input: 'mantine-dark-input', label: 'mantine-dark-label' }}
                    />
                  ))}
                </Stack>

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
})

