export const getSkillTreeShortcutAction = ({
  key,
  ctrlKey = false,
  metaKey = false,
  shiftKey = false,
  isEditableTarget = false,
}) => {
  if (isEditableTarget) {
    return null
  }

  const hasPrimaryModifier = ctrlKey || metaKey
  if (!hasPrimaryModifier) {
    return null
  }

  const normalizedKey = String(key ?? '').toLowerCase()

  if (normalizedKey === 'z') {
    return shiftKey ? 'redo' : 'undo'
  }

  if (normalizedKey === 'y') {
    return 'redo'
  }

  if (normalizedKey === 's') {
    return 'export-html'
  }

  if (normalizedKey === 'o') {
    return 'import-html'
  }

  if (shiftKey && normalizedKey === 'backspace') {
    return 'reset'
  }

  return null
}
