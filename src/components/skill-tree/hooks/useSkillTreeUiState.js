import { useState } from 'react'
import { PANEL_INSPECTOR } from '../panelsState'
import { RELEASE_FILTER_OPTIONS, SCOPE_FILTER_ALL } from '../utils/visibility'

export function useSkillTreeUiState() {
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [selectedNodeIds, setSelectedNodeIds] = useState([])
  const [selectedProgressLevelId, setSelectedProgressLevelId] = useState(null)
  const [selectedSegmentId, setSelectedSegmentId] = useState(null)
  const [selectedPortalKey, setSelectedPortalKey] = useState(null)
  const [rightPanel, setRightPanel] = useState(null)
  const [isToolbarCollapsed, setIsToolbarCollapsed] = useState(false)
  const [selectedScopeFilterId, setSelectedScopeFilterId] = useState(SCOPE_FILTER_ALL)
  const [releaseFilter, setReleaseFilter] = useState(RELEASE_FILTER_OPTIONS.all)
  const [transformKey, setTransformKey] = useState(0)

  const selectNodeId = (nodeId) => {
    setSelectedNodeId(nodeId)
    setSelectedNodeIds(nodeId ? [nodeId] : [])

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
      setRightPanel(null)
      setSelectedProgressLevelId(null)
      setSelectedPortalKey(null)
    }
  }

  const resetSelections = () => {
    setSelectedNodeId(null)
    setSelectedNodeIds([])
    setSelectedProgressLevelId(null)
    setSelectedSegmentId(null)
    setSelectedPortalKey(null)
  }

  return {
    selectedNodeId,
    setSelectedNodeId,
    selectedNodeIds,
    setSelectedNodeIds,
    selectedProgressLevelId,
    setSelectedProgressLevelId,
    selectedSegmentId,
    setSelectedSegmentId,
    selectedPortalKey,
    setSelectedPortalKey,
    rightPanel,
    setRightPanel,
    isToolbarCollapsed,
    setIsToolbarCollapsed,
    selectedScopeFilterId,
    setSelectedScopeFilterId,
    releaseFilter,
    setReleaseFilter,
    transformKey,
    setTransformKey,
    selectNodeId,
    selectSegmentId,
    resetSelections,
  }
}

export default useSkillTreeUiState
