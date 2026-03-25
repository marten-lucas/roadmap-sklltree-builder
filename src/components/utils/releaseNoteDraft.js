export const commitReleaseNoteDraft = ({ draft, currentValue, onCommit }) => {
  const nextValue = String(draft ?? '')
  const previousValue = String(currentValue ?? '')

  if (nextValue === previousValue) {
    return false
  }

  onCommit?.(nextValue)
  return true
}

export default commitReleaseNoteDraft