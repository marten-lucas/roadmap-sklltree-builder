import { describe, it, expect } from 'vitest'
import { togglePanel, PANEL_INSPECTOR, PANEL_CENTER, PANEL_SCOPES } from '../utils/panelsState'

describe('panelsState togglePanel', () => {
  it('opens a panel when none is open', () => {
    expect(togglePanel(null, PANEL_INSPECTOR)).toBe(PANEL_INSPECTOR)
  })

  it('toggles the same panel to null', () => {
    expect(togglePanel(PANEL_INSPECTOR, PANEL_INSPECTOR)).toBe(null)
  })

  it('switches from one panel to another', () => {
    expect(togglePanel(PANEL_INSPECTOR, PANEL_SCOPES)).toBe(PANEL_SCOPES)
    expect(togglePanel(PANEL_SCOPES, PANEL_CENTER)).toBe(PANEL_CENTER)
  })
})
