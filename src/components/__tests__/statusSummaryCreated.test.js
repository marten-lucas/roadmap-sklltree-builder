import { describe, expect, it } from 'vitest'
import { STATUS_SUMMARY_SORT_OPTIONS, buildStatusSummaryGroups } from '../utils/statusSummary'

describe('statusSummary created sorting', () => {
  it('exposes a Created sort mode and orders newer nodes first within a status group', () => {
    expect(STATUS_SUMMARY_SORT_OPTIONS.some((option) => option.value === 'created')).toBe(true)

    const document = {
      children: [
        {
          id: 'node-older',
          label: 'Older',
          createdAt: '2026-04-28T10:00:00.000Z',
          children: [],
          levels: [{ id: 'level-older', label: 'Level 1', statuses: { rel: 'now' } }],
        },
        {
          id: 'node-newer',
          label: 'Newer',
          createdAt: '2026-04-30T10:00:00.000Z',
          children: [],
          levels: [{ id: 'level-newer', label: 'Level 1', statuses: { rel: 'now' } }],
        },
      ],
      statusSummary: { sortMode: 'created' },
    }

    const nowGroup = buildStatusSummaryGroups(document, {
      sortMode: 'created',
      selectedReleaseId: 'rel',
    }).find((group) => group.statusKey === 'now')

    expect(nowGroup?.nodes.map((node) => node.label)).toEqual(['Newer', 'Older'])
  })
})