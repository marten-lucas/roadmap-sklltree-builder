export const PANEL_INSPECTOR = 'inspector'
export const PANEL_CENTER = 'center'
export const PANEL_SCOPES = 'scopes'
export const PANEL_SEGMENTS = 'segments'

export const togglePanel = (currentPanel, panelToToggle) => {
  return currentPanel === panelToToggle ? null : panelToToggle
}

export const openPanel = (panelToOpen) => panelToOpen

export default { PANEL_INSPECTOR, PANEL_CENTER, PANEL_SCOPES, PANEL_SEGMENTS, togglePanel, openPanel }
