import { ActionIcon, Alert, Button, Divider, Group, Paper, Stack, Text, TextInput } from '@mantine/core'
import { useCallback, useMemo, useState } from 'react'
import { SCOPE_COLORS } from '../config'

const NO_COLOR_GROUP_KEY = '__none__'

const TablerCirclePlusIcon = ({ size = 18 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 9v6" />
    <path d="M9 12h6" />
    <path d="M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0 -18" />
  </svg>
)

const getScopeGroupKey = (color) => color ?? NO_COLOR_GROUP_KEY
const getDefaultGroupLabel = (color) => (color ? color.toUpperCase() : 'Uncolored')

const getScopeDragInsertPosition = (sourceId, targetId, event) => {
  if (!sourceId || !targetId || sourceId === targetId) {
    return null
  }

  const bounds = event.currentTarget?.getBoundingClientRect?.()
  if (!bounds) {
    return 'before'
  }

  const middleY = bounds.top + (bounds.height / 2)
  return event.clientY >= middleY ? 'after' : 'before'
}

const ColorSwatch = ({ color, isSelected, onClick }) => (
  <button
    type="button"
    aria-label={`Color ${color}`}
    onClick={() => onClick(color)}
    style={{
      width: 20,
      height: 20,
      borderRadius: '50%',
      background: color,
      border: isSelected ? '2px solid #f8fafc' : '2px solid transparent',
      outline: isSelected ? '2px solid #06b6d4' : 'none',
      cursor: 'pointer',
      padding: 0,
      flexShrink: 0,
    }}
  />
)

export function ToolbarScopeManager({
  scopeOptions = [],
  onCreateScope,
  onRenameScope,
  onRenameScopeGroup,
  onDeleteScope,
  onSetScopeColor,
  onReorderScope,
  onClose,
}) {
  const [scopeDraft, setScopeDraft] = useState('')
  const [scopeError, setScopeError] = useState(null)
  const [editingScopeId, setEditingScopeId] = useState(null)
  const [editingScopeLabel, setEditingScopeLabel] = useState('')
  const [editingGroupKey, setEditingGroupKey] = useState(null)
  const [editingGroupColor, setEditingGroupColor] = useState(null)
  const [editingGroupLabel, setEditingGroupLabel] = useState('')
  const [colorPickerOpenId, setColorPickerOpenId] = useState(null)
  const [draggedScopeId, setDraggedScopeId] = useState(null)
  const [dragOverScopeId, setDragOverScopeId] = useState(null)
  const [dragInsertPosition, setDragInsertPosition] = useState(null)

  const scopeSelectData = useMemo(
    () => (scopeOptions ?? []).map((scope) => ({
      value: scope.id ?? scope.value,
      label: scope.label,
      color: scope.color ?? null,
      groupLabel: scope.groupLabel ?? null,
    })),
    [scopeOptions],
  )

  const groupedScopes = useMemo(() => {
    const groups = []
    const groupByKey = new Map()

    for (const scope of scopeSelectData) {
      const key = getScopeGroupKey(scope.color)
      if (!groupByKey.has(key)) {
        const group = {
          key,
          color: scope.color ?? null,
          label: String(scope.groupLabel ?? '').trim() || getDefaultGroupLabel(scope.color),
          scopes: [],
        }
        groupByKey.set(key, group)
        groups.push(group)
      }

      groupByKey.get(key).scopes.push(scope)
    }

    return groups
  }, [scopeSelectData])

  const resetDragState = useCallback(() => {
    setDraggedScopeId(null)
    setDragOverScopeId(null)
    setDragInsertPosition(null)
  }, [])

  const cancelGroupRename = useCallback(() => {
    setEditingGroupKey(null)
    setEditingGroupColor(null)
    setEditingGroupLabel('')
  }, [])

  const handleCreate = () => {
    const result = onCreateScope?.(scopeDraft)
    if (!result?.ok) {
      setScopeError(result?.error ?? 'Scope could not be created.')
      return
    }

    setScopeError(null)
    setScopeDraft('')
  }

  const handleStartRename = (scopeId, label) => {
    setScopeError(null)
    setEditingScopeId(scopeId)
    setEditingScopeLabel(label)
    setColorPickerOpenId(null)
  }

  const handleRename = () => {
    if (!editingScopeId) return
    const result = onRenameScope?.(editingScopeId, editingScopeLabel)
    if (!result?.ok) {
      setScopeError(result?.error ?? 'Scope could not be renamed.')
      return
    }

    setScopeError(null)
    setEditingScopeId(null)
    setEditingScopeLabel('')
  }

  const handleStartGroupRename = (group) => {
    setScopeError(null)
    setEditingGroupKey(group.key)
    setEditingGroupColor(group.color ?? null)
    setEditingGroupLabel(group.label)
  }

  const handleRenameGroup = () => {
    if (editingGroupKey == null) {
      return
    }

    const result = onRenameScopeGroup?.(editingGroupColor, editingGroupLabel)
    if (result && !result.ok) {
      setScopeError(result.error ?? 'Group label could not be updated.')
      return
    }

    setScopeError(null)
    cancelGroupRename()
  }

  const handleDelete = (scopeId) => {
    const result = onDeleteScope?.(scopeId)
    if (!result?.ok) {
      setScopeError(result?.error ?? 'Scope could not be deleted.')
      return
    }

    setScopeError(null)
    if (editingScopeId === scopeId) {
      setEditingScopeId(null)
      setEditingScopeLabel('')
    }
    if (colorPickerOpenId === scopeId) {
      setColorPickerOpenId(null)
    }
  }

  const handleToggleColorPicker = (scopeId) => {
    setColorPickerOpenId((prev) => (prev === scopeId ? null : scopeId))
  }

  const handleSelectColor = (scopeId, color) => {
    const result = onSetScopeColor?.(scopeId, color)
    if (result && !result.ok) {
      setScopeError(result.error ?? 'Scope color could not be updated.')
      return
    }

    setScopeError(null)
    setColorPickerOpenId(null)
  }

  const handleScopeDragStart = useCallback((scopeId) => (event) => {
    if (scopeSelectData.length <= 1) {
      return
    }

    setDraggedScopeId(scopeId)
    setDragOverScopeId(null)
    setDragInsertPosition(null)

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      try {
        event.dataTransfer.setData('text/plain', scopeId)
      } catch {
        // Ignore environments that restrict drag payloads.
      }
    }
  }, [scopeSelectData.length])

  const handleScopeDragOver = useCallback((scopeId) => (event) => {
    const sourceId = draggedScopeId || event.dataTransfer?.getData('text/plain')
    if (!sourceId || sourceId === scopeId) {
      return
    }

    event.preventDefault()
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move'
    }

    const insertPosition = getScopeDragInsertPosition(sourceId, scopeId, event)
    setDragOverScopeId(scopeId)
    setDragInsertPosition(insertPosition)
  }, [draggedScopeId])

  const handleScopeDrop = useCallback((scopeId) => (event) => {
    event.preventDefault()

    const sourceId = draggedScopeId || event.dataTransfer?.getData('text/plain')
    const insertPosition = getScopeDragInsertPosition(sourceId, scopeId, event)
    resetDragState()

    if (!sourceId || sourceId === scopeId || !insertPosition) {
      return
    }

    const result = onReorderScope?.(sourceId, scopeId, insertPosition)
    if (result && !result.ok) {
      setScopeError(result.error ?? 'Scope order could not be updated.')
      return
    }

    setScopeError(null)
  }, [draggedScopeId, onReorderScope, resetDragState])

  return (
    <Paper className="skill-panel skill-panel--scopes" radius={0} shadow="none">
      <div className="skill-panel__header">
        <div>
          <Text className="skill-panel__eyebrow">Scopes</Text>
          <Text className="skill-panel__title">Manage scopes</Text>
        </div>
        <div className="skill-panel__header-actions">
          <ActionIcon variant="subtle" color="gray" onClick={onClose} aria-label="Close scope manager">✕</ActionIcon>
        </div>
      </div>

      <div className="skill-panel__body skill-panel__body--scrollable">
        <Stack gap="md">
          <Group align="flex-end" wrap="nowrap">
            <TextInput
              label="Manage scopes"
              placeholder="e.g. Series A"
              value={scopeDraft}
              onChange={(e) => setScopeDraft(e.currentTarget.value)}
              style={{ flex: 1 }}
              classNames={{ input: 'mantine-dark-input', label: 'mantine-dark-label' }}
            />
            <ActionIcon variant="light" color="cyan" size="lg" onClick={handleCreate} aria-label="Add scope">
              <TablerCirclePlusIcon size={20} />
            </ActionIcon>
          </Group>

          <Divider />

          <Stack gap="md">
            {scopeSelectData.length === 0 && (
              <Text size="sm" c="dimmed">No scopes yet.</Text>
            )}

            {groupedScopes.map((group) => (
              <Stack key={group.key} gap={8}>
                {editingGroupKey === group.key ? (
                  <Paper withBorder radius="md" p="xs">
                    <Stack gap={8}>
                      <TextInput
                        value={editingGroupLabel}
                        onChange={(event) => setEditingGroupLabel(event.currentTarget.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            handleRenameGroup()
                          }
                          if (event.key === 'Escape') {
                            event.preventDefault()
                            cancelGroupRename()
                          }
                        }}
                        classNames={{ input: 'mantine-dark-input' }}
                      />
                      <Group justify="space-between">
                        <Button size="xs" variant="light" onClick={cancelGroupRename}>Cancel</Button>
                        <Button size="xs" onClick={handleRenameGroup}>Save</Button>
                      </Group>
                    </Stack>
                  </Paper>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, height: 1, background: 'rgba(71,85,105,0.55)' }} />
                    <button
                      type="button"
                      onDoubleClick={() => handleStartGroupRename(group)}
                      title="Double-click to rename group"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        border: 'none',
                        background: 'transparent',
                        color: '#94a3b8',
                        padding: '0 2px',
                        cursor: 'text',
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: group.color ?? 'transparent',
                          border: group.color ? '1px solid rgba(255,255,255,0.25)' : '1px dashed rgba(148,163,184,0.55)',
                          flexShrink: 0,
                        }}
                      />
                      <Text size="xs" fw={700} c="dimmed" style={{ letterSpacing: '0.03em' }}>
                        {group.label}
                      </Text>
                    </button>
                    <div style={{ flex: 1, height: 1, background: 'rgba(71,85,105,0.55)' }} />
                  </div>
                )}

                {group.scopes.map((scope) => {
                  const isDragging = draggedScopeId === scope.value
                  const isDropTarget = dragOverScopeId === scope.value && draggedScopeId && draggedScopeId !== scope.value

                  return (
                    <Paper
                      key={scope.value}
                      withBorder
                      radius="md"
                      p="xs"
                      draggable={scopeSelectData.length > 1}
                      onDragStart={handleScopeDragStart(scope.value)}
                      onDragOver={handleScopeDragOver(scope.value)}
                      onDrop={handleScopeDrop(scope.value)}
                      onDragEnd={resetDragState}
                      title={scopeSelectData.length > 1 ? 'Drag to reorder' : scope.label}
                      style={{
                        opacity: isDragging ? 0.55 : 1,
                        cursor: scopeSelectData.length > 1 ? 'grab' : 'default',
                        borderTop: isDropTarget && dragInsertPosition === 'before' ? '2px solid #67e8f9' : undefined,
                        borderBottom: isDropTarget && dragInsertPosition === 'after' ? '2px solid #67e8f9' : undefined,
                        boxShadow: isDropTarget ? '0 0 0 1px rgba(103, 232, 249, 0.18), 0 0 10px rgba(6, 182, 212, 0.25)' : undefined,
                      }}
                    >
                      {editingScopeId === scope.value ? (
                        <Stack gap={8}>
                          <TextInput
                            value={editingScopeLabel}
                            onChange={(event) => setEditingScopeLabel(event.currentTarget.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                handleRename()
                              }
                              if (event.key === 'Escape') {
                                event.preventDefault()
                                setEditingScopeId(null)
                                setEditingScopeLabel('')
                              }
                            }}
                            classNames={{ input: 'mantine-dark-input' }}
                          />
                          <Group justify="space-between">
                            <Button size="xs" variant="light" onClick={() => { setEditingScopeId(null); setEditingScopeLabel('') }}>Cancel</Button>
                            <Button size="xs" onClick={handleRename}>Save</Button>
                          </Group>
                        </Stack>
                      ) : (
                        <Stack gap={6}>
                          <Group justify="space-between" wrap="nowrap">
                            <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
                              <Text size="xs" c="dimmed" fw={700} style={{ letterSpacing: '-0.08em', cursor: scopeSelectData.length > 1 ? 'grab' : 'default' }}>⋮⋮</Text>
                              <button
                                type="button"
                                aria-label="Change color"
                                onClick={() => handleToggleColorPicker(scope.value)}
                                style={{
                                  width: 16,
                                  height: 16,
                                  borderRadius: '50%',
                                  background: scope.color ?? 'rgba(100,116,139,0.4)',
                                  border: '1.5px solid rgba(148,163,184,0.35)',
                                  cursor: 'pointer',
                                  padding: 0,
                                  flexShrink: 0,
                                }}
                              />
                              <Text size="sm" truncate>{scope.label}</Text>
                            </Group>
                            <Group gap={6} wrap="nowrap">
                              <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => handleStartRename(scope.value, scope.label)} aria-label="Rename scope">✎</ActionIcon>
                              <ActionIcon size="sm" variant="subtle" color="red" onClick={() => handleDelete(scope.value)} aria-label="Delete scope">✕</ActionIcon>
                            </Group>
                          </Group>
                          {colorPickerOpenId === scope.value && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '6px 0 2px' }}>
                              {SCOPE_COLORS.map((color) => (
                                <ColorSwatch
                                  key={color}
                                  color={color}
                                  isSelected={scope.color === color}
                                  onClick={(selectedColor) => handleSelectColor(scope.value, selectedColor)}
                                />
                              ))}
                              {scope.color && (
                                <button
                                  type="button"
                                  aria-label="Remove color"
                                  onClick={() => handleSelectColor(scope.value, null)}
                                  style={{
                                    width: 20,
                                    height: 20,
                                    borderRadius: '50%',
                                    background: 'transparent',
                                    border: '1.5px dashed rgba(148,163,184,0.5)',
                                    cursor: 'pointer',
                                    padding: 0,
                                    flexShrink: 0,
                                    fontSize: 10,
                                    color: '#94a3b8',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}
                                >✕</button>
                              )}
                            </div>
                          )}
                        </Stack>
                      )}
                    </Paper>
                  )
                })}
              </Stack>
            ))}

            {scopeError && (
              <Alert color="red" variant="light">{scopeError}</Alert>
            )}
          </Stack>
        </Stack>
      </div>
    </Paper>
  )
}

export default ToolbarScopeManager
