import { ActionIcon, Alert, Paper, Stack, Text } from '@mantine/core'
import { IconCheck, IconPencil } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import { MarkdownField } from './MarkdownField'

const normalizeCheckedMap = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => typeof key === 'string' && key)
      .map(([key, checked]) => [key, Boolean(checked)]),
  )
}

const parseChecklistItems = (markdown, checkedMap = {}) => {
  const lines = String(markdown ?? '').split(/\r?\n/)

  return lines
    .map((line, index) => {
      const trimmed = line.trim()
      if (!trimmed) return null

      const checkboxMatch = trimmed.match(/^[-*+]\s+\[(x|\s)\]\s+(.+)$/i)
      const bulletMatch = trimmed.match(/^[-*+]\s+(.+)$/)
      const numberedMatch = trimmed.match(/^\d+[.)]\s+(.+)$/)

      const text = checkboxMatch?.[2] ?? bulletMatch?.[1] ?? numberedMatch?.[1] ?? null
      if (!text) return null

      const key = `${index}:${text}`
      const fromMarkdownChecked = String(checkboxMatch?.[1] ?? '').toLowerCase() === 'x'

      return {
        key,
        text,
        checked: checkedMap[key] ?? fromMarkdownChecked,
      }
    })
    .filter(Boolean)
}

export function ReleaseNotesPanel({
  isOpen,
  release,
  onClose,
  onCommitReleaseNotes,
  initialMode = 'execute',
}) {
  const [mode, setMode] = useState(initialMode)
  const [draftMarkdown, setDraftMarkdown] = useState(release?.notesMarkdown ?? '')

  const checkedMap = useMemo(() => normalizeCheckedMap(release?.notesChecked), [release?.notesChecked])
  const items = useMemo(() => parseChecklistItems(draftMarkdown, checkedMap), [draftMarkdown, checkedMap])

  useEffect(() => {
    setDraftMarkdown(release?.notesMarkdown ?? '')
  }, [release?.id, release?.notesMarkdown])

  useEffect(() => {
    setMode(initialMode)
  }, [initialMode, release?.id])

  const commitDraft = () => {
    if (!release) return

    const validKeys = new Set(items.map((item) => item.key))
    const prunedChecked = Object.fromEntries(
      Object.entries(checkedMap).filter(([key]) => validKeys.has(key)),
    )

    if (
      draftMarkdown === (release.notesMarkdown ?? '')
      && JSON.stringify(prunedChecked) === JSON.stringify(checkedMap)
    ) {
      return
    }

    onCommitReleaseNotes?.(release.id, {
      notesMarkdown: draftMarkdown,
      notesChecked: prunedChecked,
    })
  }

  const handleToggleItem = (itemKey, nextChecked) => {
    if (!release) return

    onCommitReleaseNotes?.(release.id, {
      notesMarkdown: draftMarkdown,
      notesChecked: {
        ...checkedMap,
        [itemKey]: nextChecked,
      },
    })
  }

  if (!isOpen) {
    return null
  }

  return (
    <Paper className="skill-panel skill-panel--icon" radius={0} shadow="none">
      <div className="skill-panel__header">
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text className="skill-panel__eyebrow">Internal</Text>
          <Text className="skill-panel__title skill-panel__title--node">
            Internal notes
          </Text>
          <Text size="sm" c="dimmed">
            {release?.name ? release.name : 'Select a release to keep track of follow-up tasks.'}
          </Text>
        </div>
        <div className="skill-panel__header-actions">
          <ActionIcon
            variant="subtle"
            color={mode === 'edit' ? 'teal' : 'gray'}
            onClick={() => {
              if (mode === 'edit') {
                commitDraft()
                setMode('execute')
                return
              }
              setMode('edit')
            }}
            aria-label={mode === 'edit' ? 'Done editing' : 'Edit notes'}
          >
            {mode === 'edit' ? <IconCheck size={16} /> : <IconPencil size={16} />}
          </ActionIcon>
          <ActionIcon
            variant="subtle"
            color="gray"
            onClick={() => {
              commitDraft()
              onClose?.()
            }}
            aria-label="Close internal notes panel"
          >
            ✕
          </ActionIcon>
        </div>
      </div>

      <div className="skill-panel__tab-scroll" style={{ paddingTop: 12 }}>
        {!release ? (
          <Alert color="blue" variant="light">
            No release selected yet.
          </Alert>
        ) : (
          <Stack gap="md">
            {mode === 'edit' ? (
              <MarkdownField
                label="Markdown task list"
                placeholder={'- Add specific nodes\n- Review rollout\n- Update dependencies'}
                value={draftMarkdown}
                onChange={(nextValue) => setDraftMarkdown(nextValue)}
                onBlur={commitDraft}
                minRows={12}
                description="Write your tasks as a markdown-style list, one item per line."
              />
            ) : items.length === 0 ? (
              <Alert color="blue" variant="light">
                No checklist items yet. Use the edit button in the top right to add a markdown list.
              </Alert>
            ) : (
              <Stack gap="xs">
                <Text size="sm" c="dimmed">
                  Check off completed items for this release.
                </Text>
                {items.map((item) => (
                  <label
                    key={item.key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '6px 2px',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={(event) => handleToggleItem(item.key, event.currentTarget.checked)}
                    />
                    <span
                      style={{
                        textDecoration: item.checked ? 'line-through' : 'none',
                        opacity: item.checked ? 0.7 : 1,
                      }}
                    >
                      {item.text}
                    </span>
                  </label>
                ))}
              </Stack>
            )}
          </Stack>
        )}
      </div>
    </Paper>
  )
}
