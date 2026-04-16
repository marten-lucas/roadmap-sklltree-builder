import { describe, expect, it } from 'vitest'
import { buildExportFileName } from '../utils/exportFileName'

describe('exportFileName', () => {
  it('includes the system name with date and time in export filenames', () => {
    const now = new Date(2026, 3, 16, 8, 9, 27)

    expect(buildExportFileName({ systemName: 'My Kyana / Core' }, 'html', { now })).toBe(
      'My-Kyana-Core_2026-04-16_08-09.html',
    )
  })

  it('falls back safely when no system name is set', () => {
    const now = new Date(2026, 3, 16, 8, 9, 27)

    expect(buildExportFileName({}, 'json', { now })).toBe(
      'skilltree-roadmap_2026-04-16_08-09.json',
    )
    expect(buildExportFileName({ systemName: '' }, 'svg', { now, suffix: 'clean' })).toBe(
      'skilltree-roadmap_2026-04-16_08-09_clean.svg',
    )
  })
})
