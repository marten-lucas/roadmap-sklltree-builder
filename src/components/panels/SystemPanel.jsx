import { ActionIcon, Button, Checkbox, NumberInput, Paper, Stack, Tabs, Text, TextInput } from '@mantine/core'
import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react'
import { MarkdownField } from './MarkdownField'
import {
  DEFAULT_STORY_POINT_MAP,
  STATUS_BUDGET_KEYS,
  computeStatusBudgetSummaries,
  normalizeFeatureStatuses,
  normalizeStatusBudgets,
} from '../utils/effortBenefit'
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
  const [voiceOfCustomerDraft, setVoiceOfCustomerDraft] = useState('')
  const [fictionalCustomerNameDraft, setFictionalCustomerNameDraft] = useState('')

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
    setVoiceOfCustomerDraft(activeRelease?.voiceOfCustomer ?? '')
    setFictionalCustomerNameDraft(activeRelease?.fictionalCustomerName ?? '')
  }, [
    activeRelease?.id,
    activeRelease?.name,
    activeRelease?.motto,
    activeRelease?.date,
    activeRelease?.introduction,
    activeRelease?.voiceOfCustomer,
    activeRelease?.fictionalCustomerName,
  ])

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
      voiceOfCustomer: voiceOfCustomerDraft,
      fictionalCustomerName: fictionalCustomerNameDraft,
    }

    onDraftChange(draftRelease)
  }, [
    releaseDraftId,
    releaseNameDraft,
    releaseMottoDraft,
    releaseDateDraft,
    introductionDraft,
    voiceOfCustomerDraft,
    fictionalCustomerNameDraft,
    onDraftChange,
  ])

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
        if (voiceOfCustomerDraft !== (release.voiceOfCustomer ?? '')) {
          releasePatch.voiceOfCustomer = voiceOfCustomerDraft
        }
        if (fictionalCustomerNameDraft !== (release.fictionalCustomerName ?? '')) {
          releasePatch.fictionalCustomerName = fictionalCustomerNameDraft
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

  const storyPointMap = roadmapData.storyPointMap ?? DEFAULT_STORY_POINT_MAP

  const updateReleaseStatusBudget = useCallback((release, statusKey, nextBudgetValue) => {
    const nextStatusBudgets = normalizeStatusBudgets({
      ...(release?.statusBudgets ?? {}),
      [statusKey]: nextBudgetValue,
    })

    const combinedBudget = Object.values(nextStatusBudgets).reduce((sum, value) => (
      value != null ? sum + Number(value) : sum
    ), 0)

    commitDocument({
      ...roadmapData,
      releases: updateRelease(releases, release.id, {
        statusBudgets: nextStatusBudgets,
        storyPointBudget: combinedBudget > 0 ? combinedBudget : null,
      }),
    })
  }, [commitDocument, releases, roadmapData])

  const updateReleaseFeatureStatus = useCallback((release, statusKey, checked) => {
    const nextFeatureStatuses = normalizeFeatureStatuses({
      ...(release?.featureStatuses ?? {}),
      [statusKey]: checked,
    })

    commitDocument({
      ...roadmapData,
      releases: updateRelease(releases, release.id, {
        featureStatuses: nextFeatureStatuses,
      }),
    })
  }, [commitDocument, releases, roadmapData])

  return (
    <Paper className="skill-panel skill-panel--system" radius={0} shadow="none">
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
                <div className="skill-panel__compact-grid" style={{ flexShrink: 0 }}>
                  <TextInput
                    size="xs"
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
                    size="xs"
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

                  <div className="skill-panel__compact-grid-span">
                    <TextInput
                      size="xs"
                      label="Motto"
                      value={releaseDraftId === release.id ? releaseMottoDraft : (release.motto ?? '')}
                      onChange={(e) => {
                        setReleaseDraftId(release.id)
                        setReleaseMottoDraft(e.currentTarget.value)
                      }}
                      onBlur={() => commitTextDrafts(release.id)}
                      classNames={{ input: 'mantine-dark-input', label: 'mantine-dark-label' }}
                    />
                  </div>
                </div>

                <div className="skill-panel__compact-section">
                  <Text size="xs" fw={600} tt="uppercase" c="dimmed" lts="0.1em">Status budgets</Text>
                  <div className="skill-panel__compact-budget-list">
                    {(() => {
                      const releaseSummaries = computeStatusBudgetSummaries(allNodes, storyPointMap, release.statusBudgets ?? null, release.id)
                      const featureStatuses = normalizeFeatureStatuses(release.featureStatuses)

                      return STATUS_BUDGET_KEYS.map((statusKey) => {
                        const statusSummary = releaseSummaries[statusKey] ?? {
                          total: 0,
                          budget: null,
                          isOverBudget: false,
                          utilization: null,
                        }
                        const hasBudget = statusSummary.budget != null
                        const countsAsFeature = Boolean(featureStatuses[statusKey])

                        return (
                          <div
                            key={`${release.id}-${statusKey}`}
                            className={`skill-panel__compact-budget-row${statusSummary.isOverBudget ? ' skill-panel__compact-budget-row--over' : ''}`}
                          >
                            <div className="skill-panel__compact-budget-copy">
                              <Text size="sm" fw={600}>{STATUS_LABELS[statusKey]}</Text>
                            </div>

                            <Checkbox
                              size="xs"
                              checked={countsAsFeature}
                              onChange={(event) => updateReleaseFeatureStatus(release, statusKey, event.currentTarget.checked)}
                              label="Inscope"
                            />

                            <Checkbox
                              size="xs"
                              checked={hasBudget}
                              onChange={(event) => {
                                const checked = event.currentTarget.checked
                                updateReleaseStatusBudget(release, statusKey, checked ? (statusSummary.budget ?? 0) : null)
                              }}
                              label="Budget"
                            />

                            <NumberInput
                              size="xs"
                              aria-label={`Budget for ${STATUS_LABELS[statusKey]}`}
                              placeholder="SP"
                              value={statusSummary.budget ?? ''}
                              onChange={(val) => updateReleaseStatusBudget(release, statusKey, val === '' ? null : Number(val))}
                              min={0}
                              allowDecimal={false}
                              hideControls
                              disabled={!hasBudget}
                              classNames={{ input: 'mantine-dark-input', label: 'mantine-dark-label' }}
                            />
                          </div>
                        )
                      })
                    })()}
                  </div>
                </div>

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
                    minRows={8}
                  />
                </div>

                <div className="skill-panel__compact-section">
                  <TextInput
                    size="xs"
                    label="Fictional Customer's Name"
                    value={releaseDraftId === release.id ? fictionalCustomerNameDraft : (release.fictionalCustomerName ?? '')}
                    onChange={(e) => {
                      setReleaseDraftId(release.id)
                      setFictionalCustomerNameDraft(e.currentTarget.value)
                    }}
                    onBlur={() => commitTextDrafts(release.id)}
                    classNames={{ input: 'mantine-dark-input', label: 'mantine-dark-label' }}
                  />
                </div>

                <div className="skill-panel__release-note-fill">
                  <MarkdownField
                    label="Voice of Customer"
                    value={releaseDraftId === release.id ? voiceOfCustomerDraft : (release.voiceOfCustomer ?? '')}
                    onChange={(nextValue) => {
                      setReleaseDraftId(release.id)
                      setVoiceOfCustomerDraft(nextValue)
                    }}
                    onBlur={() => commitTextDrafts(release.id)}
                    minRows={5}
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
              <Stack gap="xs">
                <TextInput
                  size="xs"
                  label="Systemname"
                  value={systemNameDraft}
                  onChange={(e) => setSystemNameDraft(e.currentTarget.value)}
                  onBlur={() => commitTextDrafts()}
                  classNames={{ input: 'mantine-dark-input', label: 'mantine-dark-label' }}
                />

                <Text size="xs" fw={600} tt="uppercase" c="dimmed" lts="0.1em">Status descriptions</Text>
                <div className="skill-panel__compact-grid">
                  {STATUS_DESCRIPTION_KEYS.map((key) => (
                    <TextInput
                      key={key}
                      size="xs"
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
                </div>

                <Text size="xs" fw={600} tt="uppercase" c="dimmed" lts="0.1em">Story Point Scale</Text>
                <div className="skill-panel__compact-grid skill-panel__compact-grid--sp">
                  {T_SHIRT_KEYS.map((key) => (
                    <NumberInput
                      key={key}
                      size="xs"
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
                </div>
              </Stack>
            </div>
          </Tabs.Panel>

          {/* ── Icon Tab ── */}
          <Tabs.Panel value="icon">
            <div className="skill-panel__tab-scroll">
              <Stack gap="xs">
                <Paper className="skill-panel__icon-preview" radius="lg" withBorder>
                  <img src={iconSource} alt="Center icon preview" className="skill-panel__icon-preview-image" />
                </Paper>

                <Button size="xs" onClick={() => fileInputRef.current?.click()}>
                  Upload SVG
                </Button>

                <Button size="xs" variant="outline" color="gray" onClick={onResetDefault}>
                  Restore default icon
                </Button>

                <Text size="xs" c="dimmed">
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

