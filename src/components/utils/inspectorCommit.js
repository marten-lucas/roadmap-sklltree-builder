import { commitReleaseNoteDraft } from './releaseNoteDraft'
import { updateNodeData, updateNodeShortName } from './treeData'

export const applyInspectorIdentityChange = (treeData, nodeId, { name, shortName }) => {
  if (!treeData || !nodeId) {
    return treeData
  }

  let nextTree = treeData

  if (typeof name === 'string') {
    nextTree = updateNodeData(nextTree, nodeId, name)
  }

  if (typeof shortName === 'string') {
    nextTree = updateNodeShortName(nextTree, nodeId, shortName)
  }

  return nextTree
}

export const commitInspectorDrafts = ({
  nameDraft,
  currentName,
  onNameChange,
  shortNameDraft,
  currentShortName,
  onShortNameChange,
  onIdentityChange,
  releaseNoteDraft,
  currentReleaseNote,
  onReleaseNoteChange,
}) => {
  let nameCommitted = false
  let shortNameCommitted = false
  let releaseNoteCommitted = false

  const nextName = String(nameDraft ?? '')
  const previousName = String(currentName ?? '')
  const nextShortName = String(shortNameDraft ?? '')
  const previousShortName = String(currentShortName ?? '')

  if (nextName !== previousName || nextShortName !== previousShortName) {
    if (onIdentityChange) {
      onIdentityChange({
        name: nextName,
        shortName: nextShortName,
      })
    } else {
      if (nextName !== previousName) {
        onNameChange?.(nextName)
      }
      if (nextShortName !== previousShortName) {
        onShortNameChange?.(nextShortName)
      }
    }

    nameCommitted = nextName !== previousName
    shortNameCommitted = nextShortName !== previousShortName
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

export const commitLevelLabelDraft = ({
  draft,
  currentValue,
  levelId,
  onCommit,
}) => {
  const nextValue = String(draft ?? '')
  const previousValue = String(currentValue ?? '')

  if (!levelId || nextValue === previousValue) {
    return false
  }

  onCommit?.(nextValue, levelId)
  return true
}

export const shouldCenterInspectorOnCommit = (commitResult, commitSource = 'explicit') => {
  if (commitSource === 'selection-change') {
    return false
  }

  return Boolean(commitResult?.nameCommitted || commitResult?.shortNameCommitted || commitResult?.releaseNoteCommitted || commitResult?.levelLabelCommitted)
}
