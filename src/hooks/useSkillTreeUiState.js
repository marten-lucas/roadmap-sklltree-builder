import { useState } from 'react'
import { PANEL_INSPECTOR } from '../components/utils/panelsState'
import { SCOPE_FILTER_ALL, buildDefaultStatusFilterModeMap } from '../components/utils/visibility'

export function useSkillTreeUiState() {
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [selectedNodeIds, setSelectedNodeIds] = useState([])
  const [selectedLevelKeys, setSelectedLevelKeys] = useState([])
  const [selectedProgressLevelId, setSelectedProgressLevelId] = useState(null)
  const [selectedSegmentId, setSelectedSegmentId] = useState(null)
  const [selectedPortalKey, setSelectedPortalKey] = useState(null)
  const [rightPanel, setRightPanel] = useState(null)
  const [isReleaseNotesPanelOpen, setIsReleaseNotesPanelOpen] = useState(false)
  const [isToolbarCollapsed, setIsToolbarCollapsed] = useState(false)
  const [isLegendVisible, setIsLegendVisible] = useState(true)
  const [isBudgetOverviewVisible, setIsBudgetOverviewVisible] = useState(false)
  const [selectedScopeFilterId, setSelectedScopeFilterId] = useState(SCOPE_FILTER_ALL)
  const [releaseFilter, setReleaseFilter] = useState(() => buildDefaultStatusFilterModeMap())
  const [selectedReleaseId, setSelectedReleaseId] = useState(null)
  const [transformKey, setTransformKey] = useState(0)

  const selectNodeId = (nodeId) => {
    const alreadySelected = nodeId === selectedNodeId
      && (nodeId
        ? selectedNodeIds.length === 1 && selectedNodeIds[0] === nodeId && rightPanel === PANEL_INSPECTOR
        : selectedNodeIds.length === 0 && selectedProgressLevelId == null && selectedPortalKey == null)

    if (alreadySelected) {
      return
    }

    setSelectedNodeId(nodeId)
    setSelectedNodeIds(nodeId ? [nodeId] : [])
    setSelectedLevelKeys([])
    setSelectedProgressLevelId(null)

    if (nodeId) {
      selectSegmentId(null)
      setRightPanel(PANEL_INSPECTOR)
      return
    }

    setSelectedProgressLevelId(null)
    setSelectedPortalKey(null)

    if (rightPanel === PANEL_INSPECTOR) {
      setRightPanel(null)
    }
  }

  const selectSegmentId = (segmentId) => {
    setSelectedSegmentId(segmentId)

    if (segmentId) {
      setSelectedNodeId(null)
      setSelectedNodeIds([])
      setSelectedLevelKeys([])
      setRightPanel(null)
      setSelectedProgressLevelId(null)
      setSelectedPortalKey(null)
    }
  }

  const resetSelections = () => {
    setSelectedNodeId(null)
    setSelectedNodeIds([])
    setSelectedLevelKeys([])
    setSelectedProgressLevelId(null)
    setSelectedSegmentId(null)
    setSelectedPortalKey(null)
  }

  return {
    selectedNodeId,
    setSelectedNodeId,
    selectedNodeIds,
    setSelectedNodeIds,
    selectedLevelKeys,
    setSelectedLevelKeys,
    selectedProgressLevelId,
    setSelectedProgressLevelId,
    selectedSegmentId,
    setSelectedSegmentId,
    selectedPortalKey,
    setSelectedPortalKey,
    rightPanel,
    setRightPanel,
    isReleaseNotesPanelOpen,
    setIsReleaseNotesPanelOpen,
    isToolbarCollapsed,
    setIsToolbarCollapsed,
    isLegendVisible,
    setIsLegendVisible,
    isBudgetOverviewVisible,
    setIsBudgetOverviewVisible,
    selectedScopeFilterId,
    setSelectedScopeFilterId,
    releaseFilter,
    setReleaseFilter,
    selectedReleaseId,
    setSelectedReleaseId,
    transformKey,
    setTransformKey,
    selectNodeId,
    selectSegmentId,
    resetSelections,
  }
}

export default useSkillTreeUiState
