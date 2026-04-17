import { ActionIcon, Alert, Button, Group, Paper, Stack, Text, TextInput } from '@mantine/core'
import { IconCheck, IconGripVertical, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react'
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

const sanitizeChecklistText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim()

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
      const hasExplicitCheckbox = Boolean(checkboxMatch)
      const fromMarkdownChecked = String(checkboxMatch?.[1] ?? '').toLowerCase() === 'x'

      return {
        key,
        text,
        checked: hasExplicitCheckbox ? fromMarkdownChecked : (checkedMap[key] ?? false),
      }
    })
    .filter(Boolean)
}

const buildChecklistMarkdown = (items) => items.map((item) => `- [${item.checked ? 'x' : ' '}] ${item.text}`).join('\n')

const buildCheckedMapFromItems = (items) => Object.fromEntries(
  items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.checked)
    .map(({ item, index }) => [`${index}:${item.text}`, true]),
)

export const appendChecklistItem = ({ markdown, checkedMap = {}, text }) => {
  const normalizedText = sanitizeChecklistText(text)
  const existingItems = parseChecklistItems(markdown, normalizeCheckedMap(checkedMap))

  if (!normalizedText) {
    return {
      notesMarkdown: buildChecklistMarkdown(existingItems),
      notesChecked: buildCheckedMapFromItems(existingItems),
    }
  }

  const nextItems = [...existingItems, {
    key: `new:${normalizedText}`,
    text: normalizedText,
    checked: false,
  }]

  return {
    notesMarkdown: buildChecklistMarkdown(nextItems),
    notesChecked: buildCheckedMapFromItems(nextItems),
  }
}

export const reorderChecklistItems = ({ markdown, checkedMap = {}, sourceKey, targetKey, insertPosition = 'before' }) => {
  const items = parseChecklistItems(markdown, normalizeCheckedMap(checkedMap))
  const sourceIndex = items.findIndex((item) => item.key === sourceKey)

  if (sourceIndex === -1 || !targetKey || sourceKey === targetKey) {
    return {
      notesMarkdown: buildChecklistMarkdown(items),
      notesChecked: buildCheckedMapFromItems(items),
    }
  }

  const reorderedItems = [...items]
  const [movedItem] = reorderedItems.splice(sourceIndex, 1)
  const targetIndex = reorderedItems.findIndex((item) => item.key === targetKey)

  if (!movedItem || targetIndex === -1) {
    return {
      notesMarkdown: buildChecklistMarkdown(items),
      notesChecked: buildCheckedMapFromItems(items),
    }
  }

  const nextIndex = targetIndex + (insertPosition === 'after' ? 1 : 0)
  reorderedItems.splice(nextIndex, 0, movedItem)

  return {
    notesMarkdown: buildChecklistMarkdown(reorderedItems),
    notesChecked: buildCheckedMapFromItems(reorderedItems),
  }
}

export const deleteChecklistItem = ({ markdown, checkedMap = {}, itemKey }) => {
  const items = parseChecklistItems(markdown, normalizeCheckedMap(checkedMap))
  const remainingItems = items.filter((item) => item.key !== itemKey)

  return {
    notesMarkdown: buildChecklistMarkdown(remainingItems),
    notesChecked: buildCheckedMapFromItems(remainingItems),
  }
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
  const [draftCheckedMap, setDraftCheckedMap] = useState(() => normalizeCheckedMap(release?.notesChecked))
  const [isAddingItem, setIsAddingItem] = useState(false)
  const [newItemText, setNewItemText] = useState('')
  const [draggedItemKey, setDraggedItemKey] = useState(null)
  const [dragOverItemKey, setDragOverItemKey] = useState(null)
  const [hoveredItemKey, setHoveredItemKey] = useState(null)

  const checkedMap = useMemo(() => normalizeCheckedMap(draftCheckedMap), [draftCheckedMap])
  const items = useMemo(() => parseChecklistItems(draftMarkdown, checkedMap), [draftMarkdown, checkedMap])

  useEffect(() => {
    setDraftMarkdown(release?.notesMarkdown ?? '')
    setDraftCheckedMap(normalizeCheckedMap(release?.notesChecked))
    setIsAddingItem(false)
    setNewItemText('')
    setDraggedItemKey(null)
    setDragOverItemKey(null)
    setHoveredItemKey(null)
  }, [release?.id, release?.notesMarkdown, release?.notesChecked])

  useEffect(() => {
    setMode(initialMode)
  }, [initialMode, release?.id])

  const commitDraft = () => {
    if (!release) return

    const prunedChecked = buildCheckedMapFromItems(items)

    setDraftCheckedMap(prunedChecked)

    if (
      draftMarkdown === (release.notesMarkdown ?? '')
      && JSON.stringify(prunedChecked) === JSON.stringify(normalizeCheckedMap(release.notesChecked))
    ) {
      return
    }

    onCommitReleaseNotes?.(release.id, {
      notesMarkdown: draftMarkdown,
      notesChecked: prunedChecked,
    })
  }

  const commitImmediateChange = (nextMarkdown, nextChecked) => {
    if (!release) return

    const normalizedChecked = normalizeCheckedMap(nextChecked)
    setDraftMarkdown(nextMarkdown)
    setDraftCheckedMap(normalizedChecked)

    onCommitReleaseNotes?.(release.id, {
      notesMarkdown: nextMarkdown,
      notesChecked: normalizedChecked,
    })
  }

  const handleToggleItem = (itemKey, nextChecked) => {
    commitImmediateChange(draftMarkdown, {
      ...checkedMap,
      [itemKey]: nextChecked,
    })
  }

  const handleAddItem = () => {
    const nextPayload = appendChecklistItem({
      markdown: draftMarkdown,
      checkedMap,
      text: newItemText,
    })

    if (nextPayload.notesMarkdown === draftMarkdown) {
      return
    }

    commitImmediateChange(nextPayload.notesMarkdown, nextPayload.notesChecked)
    setNewItemText('')
    setIsAddingItem(false)
  }

  const handleDeleteItem = (itemKey) => {
    const nextPayload = deleteChecklistItem({
      markdown: draftMarkdown,
      checkedMap,
      itemKey,
    })

    commitImmediateChange(nextPayload.notesMarkdown, nextPayload.notesChecked)
    setHoveredItemKey(null)
  }

  const resetDragState = () => {
    setDraggedItemKey(null)
    setDragOverItemKey(null)
  }

  const handleDropOnItem = (targetKey) => (event) => {
    event.preventDefault()

    const sourceKey = event.dataTransfer?.getData('text/plain') || draggedItemKey
    if (!sourceKey || sourceKey === targetKey) {
      resetDragState()
      return
    }

    const bounds = event.currentTarget.getBoundingClientRect()
    const insertPosition = event.clientY > (bounds.top + bounds.height / 2) ? 'after' : 'before'
    const nextPayload = reorderChecklistItems({
      markdown: draftMarkdown,
      checkedMap,
      sourceKey,
      targetKey,
      insertPosition,
    })

    commitImmediateChange(nextPayload.notesMarkdown, nextPayload.notesChecked)
    resetDragState()
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
            ) : (
              <Stack gap="xs">
                <Text size="sm" c="dimmed">
                  Check off completed items for this release. Drag to reorder or add a new item below.
                </Text>

                {items.length === 0 ? (
                  <Alert color="blue" variant="light">
                    No checklist items yet. Add your first item below.
                  </Alert>
                ) : (
                  items.map((item) => (
                    <div
                      key={item.key}
                      onMouseEnter={() => setHoveredItemKey(item.key)}
                      onMouseLeave={() => setHoveredItemKey((current) => (current === item.key ? null : current))}
                      onFocus={() => setHoveredItemKey(item.key)}
                      onBlur={() => setHoveredItemKey((current) => (current === item.key ? null : current))}
                      onDragOver={(event) => {
                        event.preventDefault()
                        setDragOverItemKey(item.key)
                      }}
                      onDrop={handleDropOnItem(item.key)}
                      onDragLeave={() => {
                        if (dragOverItemKey === item.key) {
                          setDragOverItemKey(null)
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 6px',
                        cursor: 'pointer',
                        borderRadius: 8,
                        border: dragOverItemKey === item.key ? '1px dashed #4dabf7' : '1px solid transparent',
                        background: dragOverItemKey === item.key ? 'rgba(77, 171, 247, 0.08)' : 'transparent',
                      }}
                    >
                      <span
                        draggable
                        title="Drag to reorder"
                        aria-label={`Drag to reorder ${item.text}`}
                        onDragStart={(event) => {
                          setDraggedItemKey(item.key)
                          event.dataTransfer.effectAllowed = 'move'
                          event.dataTransfer.setData('text/plain', item.key)
                        }}
                        onDragEnd={resetDragState}
                        style={{ display: 'inline-flex', color: '#94a3b8', cursor: 'grab' }}
                      >
                        <IconGripVertical size={16} />
                      </span>
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={(event) => handleToggleItem(item.key, event.currentTarget.checked)}
                      />
                      <span
                        style={{
                          flex: 1,
                          textDecoration: item.checked ? 'line-through' : 'none',
                          opacity: item.checked ? 0.7 : 1,
                        }}
                      >
                        {item.text}
                      </span>
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="red"
                        aria-label={`Delete item ${item.text}`}
                        title="Delete item"
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          handleDeleteItem(item.key)
                        }}
                        style={{
                          opacity: hoveredItemKey === item.key ? 1 : 0,
                          pointerEvents: hoveredItemKey === item.key ? 'auto' : 'none',
                          transition: 'opacity 120ms ease',
                        }}
                      >
                        <IconTrash size={14} />
                      </ActionIcon>
                    </div>
                  ))
                )}

                {isAddingItem ? (
                  <Group align="flex-end" gap="xs" wrap="wrap">
                    <TextInput
                      style={{ flex: 1, minWidth: 220 }}
                      label="New item"
                      placeholder="Add a follow-up task"
                      value={newItemText}
                      autoFocus
                      onChange={(event) => setNewItemText(event.currentTarget.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          handleAddItem()
                        }
                        if (event.key === 'Escape') {
                          setIsAddingItem(false)
                          setNewItemText('')
                        }
                      }}
                    />
                    <Button size="xs" onClick={handleAddItem} disabled={!sanitizeChecklistText(newItemText)}>
                      Add
                    </Button>
                    <Button
                      size="xs"
                      variant="subtle"
                      color="gray"
                      onClick={() => {
                        setIsAddingItem(false)
                        setNewItemText('')
                      }}
                    >
                      Cancel
                    </Button>
                  </Group>
                ) : (
                  <Button
                    size="xs"
                    variant="light"
                    leftSection={<IconPlus size={14} />}
                    style={{ alignSelf: 'flex-start' }}
                    onClick={() => setIsAddingItem(true)}
                  >
                    Add item
                  </Button>
                )}
              </Stack>
            )}
          </Stack>
        )}
      </div>
    </Paper>
  )
}
