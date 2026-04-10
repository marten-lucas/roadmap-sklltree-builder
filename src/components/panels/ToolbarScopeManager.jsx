import { ActionIcon, Alert, Button, Divider, Group, Paper, Text, TextInput, Stack } from '@mantine/core'
import { useState } from 'react'
import { SCOPE_COLORS } from '../config'

const TablerCirclePlusIcon = ({ size = 18 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 9v6" />
    <path d="M9 12h6" />
    <path d="M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0 -18" />
  </svg>
)

const ColorSwatch = ({ color, isSelected, onClick }) => (
  <button
    type="button"
    aria-label={`Farbe ${color}`}
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

export function ToolbarScopeManager({ scopeOptions = [], onCreateScope, onRenameScope, onDeleteScope, onSetScopeColor, onClose }) {
  const [scopeDraft, setScopeDraft] = useState('')
  const [scopeError, setScopeError] = useState(null)
  const [editingScopeId, setEditingScopeId] = useState(null)
  const [editingScopeLabel, setEditingScopeLabel] = useState('')
  const [colorPickerOpenId, setColorPickerOpenId] = useState(null)

  const scopeSelectData = (scopeOptions ?? []).map((s) => ({ value: s.id ?? s.value, label: s.label, color: s.color ?? null }))

  const handleCreate = () => {
    const result = onCreateScope?.(scopeDraft)
    if (!result?.ok) {
      setScopeError(result?.error ?? 'Scope konnte nicht angelegt werden.')
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
      setScopeError(result?.error ?? 'Scope konnte nicht umbenannt werden.')
      return
    }

    setScopeError(null)
    setEditingScopeId(null)
    setEditingScopeLabel('')
  }

  const handleDelete = (scopeId) => {
    const result = onDeleteScope?.(scopeId)
    if (!result?.ok) {
      setScopeError(result?.error ?? 'Scope konnte nicht gelöscht werden.')
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
    onSetScopeColor?.(scopeId, color)
    setColorPickerOpenId(null)
  }

  return (
    <Paper className="skill-panel skill-panel--scopes" radius={0} shadow="none">
      <div className="skill-panel__header">
        <div>
          <Text className="skill-panel__eyebrow">Scopes</Text>
          <Text className="skill-panel__title">Scopes verwalten</Text>
        </div>
        <div className="skill-panel__header-actions">
          <ActionIcon variant="subtle" color="gray" onClick={onClose} aria-label="Scope Manager schließen">✕</ActionIcon>
        </div>
      </div>

      <div className="skill-panel__body skill-panel__body--scrollable">
        <Stack gap="md">
          <Group align="flex-end" wrap="nowrap">
            <TextInput
              label="Scopes verwalten"
              placeholder="z.B. Serie A"
              value={scopeDraft}
              onChange={(e) => setScopeDraft(e.currentTarget.value)}
              style={{ flex: 1 }}
              classNames={{ input: 'mantine-dark-input', label: 'mantine-dark-label' }}
            />
            <ActionIcon variant="light" color="cyan" size="lg" onClick={handleCreate} aria-label="Scope hinzufügen">
              <TablerCirclePlusIcon size={20} />
            </ActionIcon>
          </Group>

          <Divider />

          <Stack gap={8}>
            {scopeSelectData.length === 0 && (
              <Text size="sm" c="dimmed">Noch keine Scopes vorhanden.</Text>
            )}

            {scopeSelectData.map((scope) => (
              <Paper key={scope.value} withBorder radius="md" p="xs">
                {editingScopeId === scope.value ? (
                  <Stack gap={8}>
                    <TextInput
                      value={editingScopeLabel}
                      onChange={(event) => setEditingScopeLabel(event.currentTarget.value)}
                      classNames={{ input: 'mantine-dark-input' }}
                    />
                    <Group justify="space-between">
                      <Button size="xs" variant="light" onClick={() => { setEditingScopeId(null); setEditingScopeLabel('') }}>Abbrechen</Button>
                      <Button size="xs" onClick={handleRename}>Speichern</Button>
                    </Group>
                  </Stack>
                ) : (
                  <Stack gap={6}>
                    <Group justify="space-between" wrap="nowrap">
                      <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
                        <button
                          type="button"
                          aria-label="Farbe ändern"
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
                        <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => handleStartRename(scope.value, scope.label)} aria-label="Scope umbenennen">✎</ActionIcon>
                        <ActionIcon size="sm" variant="subtle" color="red" onClick={() => handleDelete(scope.value)} aria-label="Scope löschen">✕</ActionIcon>
                      </Group>
                    </Group>
                    {colorPickerOpenId === scope.value && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '6px 0 2px' }}>
                        {SCOPE_COLORS.map((color) => (
                          <ColorSwatch
                            key={color}
                            color={color}
                            isSelected={scope.color === color}
                            onClick={(c) => handleSelectColor(scope.value, c)}
                          />
                        ))}
                        {scope.color && (
                          <button
                            type="button"
                            aria-label="Farbe entfernen"
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
