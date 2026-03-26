import { commitReleaseNoteDraft } from './releaseNoteDraft'

export const commitInspectorDrafts = ({
  nameDraft,
  currentName,
  onNameChange,
  shortNameDraft,
  currentShortName,
  onShortNameChange,
  releaseNoteDraft,
  currentReleaseNote,
  onReleaseNoteChange,
}) => {
  let nameCommitted = false
  let shortNameCommitted = false
  let releaseNoteCommitted = false

  const nextName = String(nameDraft ?? '')
  const previousName = String(currentName ?? '')
  if (nextName !== previousName) {
    onNameChange?.(nextName)
    nameCommitted = true
  }

  const nextShortName = String(shortNameDraft ?? '')
  const previousShortName = String(currentShortName ?? '')
  if (nextShortName !== previousShortName) {
    onShortNameChange?.(nextShortName)
    shortNameCommitted = true
  }

  if (commitReleaseNoteDraft({ draft: releaseNoteDraft, currentValue: currentReleaseNote, onCommit: onReleaseNoteChange })) {
    releaseNoteCommitted = true
  }

  return {
    nameCommitted,
    shortNameCommitted,
    releaseNoteCommitted,
  }
}

export const shouldCenterInspectorOnCommit = (commitResult, commitSource = 'explicit') => {
  if (commitSource === 'selection-change') {
    return false
  }

  return Boolean(commitResult?.nameCommitted || commitResult?.shortNameCommitted || commitResult?.releaseNoteCommitted)
}
