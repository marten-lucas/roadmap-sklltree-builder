import { describe, expect, it } from 'vitest'
import { getSkillTreeShortcutAction } from '../keyboardShortcuts'

describe('keyboardShortcuts', () => {
  it('maps ctrl+s and ctrl+o to html export/import actions', () => {
    expect(getSkillTreeShortcutAction({ key: 's', ctrlKey: true })).toBe('export-html')
    expect(getSkillTreeShortcutAction({ key: 'o', ctrlKey: true })).toBe('import-html')
  })

  it('maps ctrl+alt+s to segment creation', () => {
    expect(getSkillTreeShortcutAction({ key: 's', ctrlKey: true, altKey: true })).toBe('create-segment')
  })

  it('maps undo and redo combinations', () => {
    expect(getSkillTreeShortcutAction({ key: 'z', ctrlKey: true })).toBe('undo')
    expect(getSkillTreeShortcutAction({ key: 'z', ctrlKey: true, shiftKey: true })).toBe('redo')
    expect(getSkillTreeShortcutAction({ key: 'y', ctrlKey: true })).toBe('redo')
  })

  it('ignores shortcuts in editable targets', () => {
    expect(getSkillTreeShortcutAction({ key: 's', ctrlKey: true, isEditableTarget: true })).toBeNull()
  })

  it('maps ctrl+shift+backspace to reset', () => {
    expect(getSkillTreeShortcutAction({ key: 'Backspace', ctrlKey: true, shiftKey: true })).toBe('reset')
  })
})
