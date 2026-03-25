import { describe, expect, it, vi } from 'vitest'
import { commitReleaseNoteDraft } from '../utils/releaseNoteDraft'

describe('releaseNoteDraft', () => {
  it('commits when the draft changed', () => {
    const onCommit = vi.fn()

    const didCommit = commitReleaseNoteDraft({
      draft: 'New note',
      currentValue: 'Old note',
      onCommit,
    })

    expect(didCommit).toBe(true)
    expect(onCommit).toHaveBeenCalledWith('New note')
  })

  it('does not commit when the draft is unchanged', () => {
    const onCommit = vi.fn()

    const didCommit = commitReleaseNoteDraft({
      draft: 'Same note',
      currentValue: 'Same note',
      onCommit,
    })

    expect(didCommit).toBe(false)
    expect(onCommit).not.toHaveBeenCalled()
  })
})