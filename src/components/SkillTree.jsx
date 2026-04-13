import { Alert, Button, Checkbox, Group, Modal, Radio, Stack, Text } from '@mantine/core'
import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch'
import './skillTree.css'
import { TREE_CONFIG, STATUS_STYLES, NODE_LABEL_ZOOM } from './config'
import {
  saveDocumentToLocalStorage,
  downloadDocumentJson,
  readDocumentFromJsonText,
} from './utils/documentPersistence'
import {
  createDocumentHistoryState,
  createEmptyDocument,
  DEFAULT_CENTER_ICON_SRC,
  documentHistoryReducer,
} from './utils/documentState'
import { SystemPanel, InspectorPanel, SegmentPanel, ToolbarScopeManager, ToolbarSegmentManager } from './panels'
import { PriorityMatrix } from './panels/PriorityMatrix'
import { ListViewDrawer } from './panels/ListViewDrawer'
import { solveSkillTreeLayout } from './utils/layoutSolver'
import { UNASSIGNED_SEGMENT_ID } from './utils/layoutShared'
import { getSkillTreeShortcutAction } from './utils/keyboardShortcuts'
import { togglePanel, PANEL_INSPECTOR, PANEL_CENTER, PANEL_SCOPES, PANEL_SEGMENTS } from './utils/panelsState'
import { getDisplayStatusKey } from './utils/nodeStatus'
import {
  getAdditionalDependencyOptionsForLevel,
  getParentOptionsForNode,
  getLevelOptionsForNode,
  getSegmentOptionsForNode,
  validateNodeLevelChange,
  validateNodeSegmentChange,
} from './utils/treeValidation'
import {
  addChildNodeWithResult,
  addScopeWithResult,
  addNodeProgressLevel,
  addInitialRootNodeWithResult,
  addInitialSegmentWithResult,
  addRootNodeNearWithResult,
  addSegmentNearWithResult,
  buildHiddenNodeIdSet,
  buildLevelIdToNodeIdMap,
  deleteScopeWithResult,
  setScopeColorWithResult,
  deleteSegment,
  deleteNodeBranch,
  deleteNodeOnly,
  findParentNodeId,
  findNodeById,
  getNodeAdditionalDependencies,
  getNodeLevelInfo,
  getLevelAdditionalDependencies,
  moveNodeToParent,
  renameScopeWithResult,
  removeNodeProgressLevel,
  setLevelAdditionalDependencies,
  updateNodeData as updateNodeDataInTree,
  updateNodeProgressLevel,
  updateNodeShortName,
  updateSegmentLabel,
} from './utils/treeData'
import { normalizeEffort, normalizeBenefit } from './utils/effortBenefit'
import { toDegrees, toRadians } from './utils/layoutMath'
import { SkillTreeCanvas } from './canvas'
import { SkillTreeToolbar } from './toolbar'

import { useSkillTreeUiState } from '../hooks/useSkillTreeUiState'
import { isAngleNear } from './utils/angle'
import { uniqueArray } from './utils/array'
import { downloadDocumentCsv, readDocumentFromCsvText } from './utils/csv'
import { isEditableElement } from './utils/dom'
import { getCsvExportErrorMessage, getCsvImportErrorMessage, getHtmlImportErrorMessage, confirmResetDocument } from './utils/messages'
import { readFileAsText, readFileAsDataUrl, isValidSvgMarkup } from './utils/file'
import {
  RELEASE_FILTER_LABELS,
  RELEASE_FILTER_OPTIONS,
  SCOPE_FILTER_ALL,
  getReleaseVisibilityMode,
  nodeMatchesScopeFilter,
} from './utils/visibility'
import { VIEWPORT_DEFAULTS, computeFitScale, computeFitTransform, getNextZoomStep, getViewportKeyboardAction } from './utils/viewport'
import { getInitialRoadmapDocument } from './utils/document'
import { getSelectedReleaseId } from './utils/releases'
import { resolveInspectorSelectedNode } from './utils/selection'

// `resolveInspectorSelectedNode` is exported from `src/components/utils/selection.js`
// Tests/importers should import from that module instead of re-exporting from here.

const AUTOSAVE_DEBOUNCE_MS = 450
const MINIMAL_NODE_SIZE = 36
const MAX_SEGMENT_LABEL_CHARS_PER_LINE = 15
const CENTER_LABEL_GAP_PX = 12
const LABEL_LEVEL_ONE_GAP_PX = 14
const DEFAULT_CSV_IMPORT_PROCESS_OPTIONS = {
  processSegments: true,
  processManualLevels: true,
}

const estimateWrappedLineCount = (text) => {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) {
    return 1
  }

  let lineCount = 0
  let currentLine = ''
  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word
    if (candidate.length <= MAX_SEGMENT_LABEL_CHARS_PER_LINE) {
      currentLine = candidate
      continue
    }

    if (currentLine) {
      lineCount += 1
    }
    currentLine = word
  }

  if (currentLine) {
    lineCount += 1
  }

  return Math.max(lineCount, 1)
}

const getEstimatedSegmentLabelHeightPx = (label) => {
  const lineCount = estimateWrappedLineCount(label)
  return 24 + Math.max(0, lineCount - 1) * 16
}

export function SkillTree() {
  const [documentHistory, dispatchDocument] = useReducer(
    documentHistoryReducer,
    null,
    () => createDocumentHistoryState(getInitialRoadmapDocument()),
  )
  const roadmapData = documentHistory.present
  const canUndo = documentHistory.past.length > 0
  const canRedo = documentHistory.future.length > 0
  const documentFileInputRef = useRef(null)
  const csvDocumentFileInputRef = useRef(null)
  const jsonDocumentFileInputRef = useRef(null)
  const canvasSvgRef = useRef(null)
  const transformApiRef = useRef(null)
  const canvasAreaRef = useRef(null)
  const [isPanModeActive, setIsPanModeActive] = useState(false)
  const [currentZoomScale, setCurrentZoomScale] = useState(1)
  const [exportLabelModeOverride, setExportLabelModeOverride] = useState(null)
  const [exportLabelDialogOpen, setExportLabelDialogOpen] = useState(false)
  const [exportLabelDialogMode, setExportLabelDialogMode] = useState('mid')
  const exportLabelDialogResolveRef = useRef(null)
  const [lastSavedAt, setLastSavedAt] = useState(null)
  const [csvImportDialogOpen, setCsvImportDialogOpen] = useState(false)
  const [csvImportOptions, setCsvImportOptions] = useState(DEFAULT_CSV_IMPORT_PROCESS_OPTIONS)
  const [pendingCsvImport, setPendingCsvImport] = useState(null)
  const [priorityMatrixOpen, setPriorityMatrixOpen] = useState(false)
  const [listViewOpen, setListViewOpen] = useState(false)

  const {
    selectedNodeId,
    setSelectedNodeId,
    selectedNodeIds,
    setSelectedNodeIds,
    selectedProgressLevelId,
    setSelectedProgressLevelId,
    selectedSegmentId,
    _setSelectedSegmentId,
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
    selectedReleaseId,
    setSelectedReleaseId,
  } = useSkillTreeUiState()

  const addControlOffset = TREE_CONFIG.nodeSize * 0.82

  const { layout, diagnostics } = useMemo(
    () => solveSkillTreeLayout(roadmapData, TREE_CONFIG),
    [roadmapData],
  )
  const { nodes, links, crossingEdges = [], segments, canvas } = layout
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : canvas.width
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : canvas.height
  const initialViewScale = useMemo(() => {
    if (!canvas.width || !canvas.height || !viewportWidth || !viewportHeight) {
      return 0.7
    }

    return computeFitScale({
      contentWidth: canvas.width,
      contentHeight: canvas.height,
      viewportWidth,
      viewportHeight,
      minScale: VIEWPORT_DEFAULTS.minScale,
      maxScale: VIEWPORT_DEFAULTS.maxScale,
    })
  }, [canvas.height, canvas.width, viewportHeight, viewportWidth])
  const initialPositionX = viewportWidth / 2 - canvas.origin.x * initialViewScale
  const initialPositionY = viewportHeight / 2 - canvas.origin.y * initialViewScale

  // Responsive label mode: derived from live zoom scale (or overridden for exports)
  const zoomLabelMode = useMemo(() => {
    if (currentZoomScale < NODE_LABEL_ZOOM.farToMid) return 'far'
    if (currentZoomScale >= NODE_LABEL_ZOOM.closeToVeryClose) return 'very-close'
    if (currentZoomScale >= NODE_LABEL_ZOOM.midToClose) return 'close'
    return 'mid'
  }, [currentZoomScale])
  const activeLabelMode = exportLabelModeOverride ?? zoomLabelMode

  const centerIconSource = roadmapData.centerIconSrc ?? DEFAULT_CENTER_ICON_SRC
  const maxEstimatedSegmentLabelHeightPx = useMemo(() => {
    const segments = roadmapData?.segments ?? []
    if (segments.length === 0) {
      return TREE_CONFIG.nodeSize * 0.4
    }

    return Math.max(
      TREE_CONFIG.nodeSize * 0.4,
      ...segments.map((segment) => getEstimatedSegmentLabelHeightPx(segment?.label ?? '')),
    )
  }, [roadmapData?.segments])

  const centerIconSize = useMemo(() => {
    const firstLevelNode = nodes.find((node) => node.level === 1)
    const firstLevelRadius = firstLevelNode?.radius ?? TREE_CONFIG.levelSpacing
    const additionalDependencyPortalAllowance = TREE_CONFIG.nodeSize * 0.2
    const levelOneNodeClearance = TREE_CONFIG.nodeSize * 0.5 + additionalDependencyPortalAllowance
    const minRadius = TREE_CONFIG.nodeSize * 0.5
    const preferredRadius = TREE_CONFIG.nodeSize * 0.72
    const labelBandHeight = maxEstimatedSegmentLabelHeightPx
    const maxAllowedRadius = Math.max(
      minRadius,
      firstLevelRadius - levelOneNodeClearance - LABEL_LEVEL_ONE_GAP_PX - labelBandHeight - CENTER_LABEL_GAP_PX,
    )
    const maxVisualRadius = Math.min(
      TREE_CONFIG.nodeSize * 1.35,
      firstLevelRadius * 0.42,
    )
    const targetRadius = Math.min(maxAllowedRadius, maxVisualRadius)
    const radius = Math.max(minRadius, Math.max(preferredRadius, targetRadius))

    return radius * 2
  }, [maxEstimatedSegmentLabelHeightPx, nodes])

  const selectedNode = useMemo(
    () => findNodeById(roadmapData, selectedNodeId),
    [roadmapData, selectedNodeId],
  )

  // Use exported helper above to decide inspector node resolution.

  const selectedSegment = useMemo(
    () => (roadmapData.segments ?? []).find((segment) => segment.id === selectedSegmentId) ?? null,
    [roadmapData, selectedSegmentId],
  )

  const selectedNodeLevels = useMemo(() => {
    if (!selectedNode) {
      return []
    }

    if (Array.isArray(selectedNode.levels) && selectedNode.levels.length > 0) {
      return selectedNode.levels
    }

    return [
      {
        id: 'level-1',
        label: 'Level 1',
        status: selectedNode.status,
        releaseNote: '',
        scopeIds: [],
      },
    ]
  }, [selectedNode])

  const activeSelectedProgressLevelId = useMemo(() => {
    if (!selectedNode) {
      return null
    }

    const fallbackLevelId = selectedNodeLevels[0]?.id ?? null
    const stillExists = selectedNodeLevels.some((entry) => entry.id === selectedProgressLevelId)

    return stillExists ? selectedProgressLevelId : fallbackLevelId
  }, [selectedNode, selectedNodeLevels, selectedProgressLevelId])

  const activeSelectedProgressLevel = useMemo(
    () => selectedNodeLevels.find((entry) => entry.id === activeSelectedProgressLevelId) ?? null,
    [activeSelectedProgressLevelId, selectedNodeLevels],
  )

  const scopeOptions = useMemo(
    () => (roadmapData.scopes ?? []).map((scope) => ({
      value: scope.id,
      label: scope.label,
      color: scope.color ?? null,
    })),
    [roadmapData.scopes],
  )

  useEffect(() => {
    if (selectedScopeFilterId === SCOPE_FILTER_ALL) {
      return
    }

    const scopeStillExists = scopeOptions.some((scope) => scope.value === selectedScopeFilterId)
    if (!scopeStillExists) {
      setSelectedScopeFilterId(SCOPE_FILTER_ALL)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeOptions, selectedScopeFilterId])

  const activeReleaseId = useMemo(
    () => getSelectedReleaseId(roadmapData.releases ?? [], selectedReleaseId),
    [roadmapData.releases, selectedReleaseId],
  )

  useEffect(() => {
    const releases = roadmapData.releases ?? []
    if (releases.length === 0) return
    const stillExists = releases.some((r) => r.id === selectedReleaseId)
    if (!stillExists) {
      setSelectedReleaseId(releases[0].id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roadmapData.releases])

  const hiddenNodeIdSet = useMemo(
    () => buildHiddenNodeIdSet(roadmapData, activeReleaseId),
    [roadmapData, activeReleaseId],
  )

  const nodeVisibilityModeById = useMemo(() => {
    const byId = new Map()
    const showHiddenNodes = roadmapData.showHiddenNodes ?? false

    for (const node of nodes) {
      if (hiddenNodeIdSet.has(node.id)) {
        byId.set(node.id, showHiddenNodes ? 'ghost' : 'hidden')
        continue
      }

      const matchesScope = nodeMatchesScopeFilter(node, selectedScopeFilterId)

      if (!matchesScope) {
        byId.set(node.id, 'hidden')
        continue
      }

      const statusKey = getDisplayStatusKey(node, activeReleaseId)
      byId.set(node.id, getReleaseVisibilityMode(statusKey, releaseFilter))
    }

    return byId
  }, [nodes, hiddenNodeIdSet, selectedScopeFilterId, releaseFilter, roadmapData.showHiddenNodes, activeReleaseId])

  const renderedNodes = useMemo(
    () => nodes.filter((node) => (nodeVisibilityModeById.get(node.id) ?? 'full') !== 'hidden'),
    [nodes, nodeVisibilityModeById],
  )

  const renderedNodeIds = useMemo(
    () => new Set(renderedNodes.map((node) => node.id)),
    [renderedNodes],
  )

  const layoutNodesById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes],
  )

  const visibleSegmentIds = useMemo(() => {
    const ids = new Set()

    for (const node of renderedNodes) {
      if (node.segmentId) {
        ids.add(node.segmentId)
      }
    }

    // Segments with no nodes (e.g. freshly created) are always visible
    const segmentIdsWithNodes = new Set(nodes.map((n) => n.segmentId).filter(Boolean))
    for (const segment of roadmapData.segments ?? []) {
      if (!segmentIdsWithNodes.has(segment.id)) {
        ids.add(segment.id)
      }
    }

    return ids
  }, [renderedNodes, nodes, roadmapData.segments])

  const filteredSegmentLabels = useMemo(
    () => segments.labels.filter((segmentLabel) => visibleSegmentIds.has(segmentLabel.segmentId)),
    [segments.labels, visibleSegmentIds],
  )

  const filteredSegmentSeparators = useMemo(
    () => segments.separators.filter((separator) => {
      if (!separator.leftSegmentId || !separator.rightSegmentId) {
        return true
      }

      return visibleSegmentIds.has(separator.leftSegmentId) && visibleSegmentIds.has(separator.rightSegmentId)
    }),
    [segments.separators, visibleSegmentIds],
  )

  const filteredLinks = useMemo(
    () => links.filter((link) => {
      if (link.sourceId && !renderedNodeIds.has(link.sourceId)) {
        return false
      }

      if (link.targetId && !renderedNodeIds.has(link.targetId)) {
        return false
      }

      return true
    }),
    [links, renderedNodeIds],
  )

  const _visibleSegmentIdSet = useMemo(
    () => new Set(filteredSegmentLabels.map((segmentLabel) => segmentLabel.segmentId)),
    [filteredSegmentLabels],
  )

  const selectedScopeFilterLabel = useMemo(() => {
    if (selectedScopeFilterId === SCOPE_FILTER_ALL) {
      return 'All Scopes'
    }

    return scopeOptions.find((scope) => scope.value === selectedScopeFilterId)?.label ?? 'All Scopes'
  }, [scopeOptions, selectedScopeFilterId])

  const selectedReleaseFilterLabel = RELEASE_FILTER_LABELS[releaseFilter] ?? RELEASE_FILTER_LABELS.all

  useEffect(() => {
    if (!selectedNodeId) {
      return
    }

    if (findNodeById(roadmapData, selectedNodeId)) {
      return
    }

    selectNodeId(null)
    setSelectedProgressLevelId(null)
    setSelectedPortalKey(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roadmapData, selectedNodeId])

  useEffect(() => {
    if (!selectedSegmentId) {
      return
    }

    // Keep selection as long as the segment still exists in the document.
    // Deselect only when it was deleted (e.g. via the segment panel delete button).
    const segmentStillExists = (roadmapData.segments ?? []).some((s) => s.id === selectedSegmentId)
    if (segmentStillExists) {
      return
    }

    selectSegmentId(null)
    setSelectedPortalKey(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSegmentId, roadmapData.segments])

  const levelInfo = useMemo(() => {
    if (!selectedNodeId) return { nodeLevel: 1, minLevel: 1, maxLevel: 2 }
    const info = getNodeLevelInfo(roadmapData, selectedNodeId)
    return {
      nodeLevel: info.nodeLevel,
      minLevel: info.parentLevel + 1,
      maxLevel: info.maxLevel + 1, // Always allow +1 above highest current level
    }
  }, [roadmapData, selectedNodeId])

  const selectedNodeLevelOptions = useMemo(
    () => (selectedNodeId ? getLevelOptionsForNode(roadmapData, selectedNodeId, TREE_CONFIG) : []),
    [roadmapData, selectedNodeId],
  )

  const selectedNodeSegmentOptions = useMemo(
    () => (selectedNodeId ? getSegmentOptionsForNode(roadmapData, selectedNodeId, TREE_CONFIG) : []),
    [roadmapData, selectedNodeId],
  )

  const selectedNodeParentOptions = useMemo(
    () => (selectedNodeId ? getParentOptionsForNode(roadmapData, selectedNodeId) : []),
    [roadmapData, selectedNodeId],
  )

  const selectedNodeParentId = useMemo(
    () => (selectedNodeId ? findParentNodeId(roadmapData, selectedNodeId) : null),
    [roadmapData, selectedNodeId],
  )

  const selectedNodeLevelDependencyOptions = useMemo(() => {
    if (!selectedNodeId) return {}
    const selectedNode = findNodeById(roadmapData, selectedNodeId)
    if (!selectedNode) return {}
    const result = {}
    for (const level of (selectedNode.levels ?? [])) {
      result[level.id] = getAdditionalDependencyOptionsForLevel(roadmapData, selectedNodeId, level.id)
    }
    return result
  }, [roadmapData, selectedNodeId])

  const selectedNodeAdditionalDependencies = useMemo(() => {
    if (!selectedNodeId) {
      return {
        outgoingIds: [],
        incomingIds: [],
      }
    }

    return getNodeAdditionalDependencies(roadmapData, selectedNodeId)
  }, [roadmapData, selectedNodeId])

  const allNodesById = useMemo(() => {
    const map = new Map()
    const queue = [...(roadmapData.children ?? [])]

    while (queue.length > 0) {
      const current = queue.shift()
      map.set(current.id, current)
      queue.push(...(current.children ?? []))
    }

    return map
  }, [roadmapData])

  const [_toolbarSearch, _setToolbarSearch] = useState('')
  const _searchResults = useMemo(() => {
    const q = String(_toolbarSearch ?? '').trim().toLowerCase()
    if (!q) return []
    const results = []
    for (const node of allNodesById.values()) {
      const label = String(node.label ?? '').toLowerCase()
      const short = String(node.shortName ?? '').toLowerCase()
      if (label.includes(q) || short.includes(q)) {
        results.push(node)
      }
      if (results.length >= 10) break
    }
    return results
  }, [_toolbarSearch, allNodesById])

  const selectedNodeIncomingDependencyLabels = useMemo(() => {
    const incomingIds = selectedNodeAdditionalDependencies.incomingIds ?? []
    return incomingIds
      .map((id) => allNodesById.get(id))
      .filter(Boolean)
      .map((node) => ({
        id: node.id,
        label: node.label,
        shortName: node.shortName ?? '',
      }))
  }, [allNodesById, selectedNodeAdditionalDependencies])

  const selectedNodeDependencySummary = useMemo(() => {
    if (!selectedNodeId) {
      return {
        requires: [],
        enables: [],
      }
    }

    const requiresById = new Map()
    const enablesById = new Map()

    const scopeById = new Map((roadmapData.scopes ?? []).map((scope) => [scope.id, scope]))

    const resolveNodeScopes = (node) => {
      const seen = new Set()
      const entries = []

      for (const level of (node.levels ?? [])) {
        for (const scopeId of (level.scopeIds ?? [])) {
          if (seen.has(scopeId)) {
            continue
          }

          seen.add(scopeId)
          const scope = scopeById.get(scopeId)
          if (!scope) {
            continue
          }

          entries.push({
            id: scope.id,
            label: scope.label,
            color: scope.color ?? null,
          })
        }
      }

      return entries
    }

    const upsert = (map, nodeId, relationType) => {
      if (!nodeId || nodeId === selectedNodeId) {
        return
      }

      const node = allNodesById.get(nodeId)
      if (!node) {
        return
      }

      const existing = map.get(nodeId)
      if (existing) {
        existing.relationTypes.add(relationType)
        return
      }

      map.set(nodeId, {
        id: node.id,
        label: node.label,
        shortName: node.shortName ?? '',
        scopes: resolveNodeScopes(node),
        relationTypes: new Set([relationType]),
      })
    }

    if (selectedNodeParentId) {
      upsert(requiresById, selectedNodeParentId, 'hierarchy')
    }

    for (const child of (selectedNode?.children ?? [])) {
      upsert(enablesById, child.id, 'hierarchy')
    }

    for (const nodeId of (selectedNodeAdditionalDependencies.outgoingIds ?? [])) {
      upsert(requiresById, nodeId, 'additional')
    }

    for (const nodeId of (selectedNodeAdditionalDependencies.incomingIds ?? [])) {
      upsert(enablesById, nodeId, 'additional')
    }

    const toSortedList = (map) => [...map.values()]
      .map((entry) => ({
        ...entry,
        relationTypes: [...entry.relationTypes],
      }))
      .sort((left, right) => String(left.label ?? '').localeCompare(String(right.label ?? '')))

    return {
      requires: toSortedList(requiresById),
      enables: toSortedList(enablesById),
    }
  }, [allNodesById, roadmapData.scopes, selectedNode, selectedNodeAdditionalDependencies, selectedNodeId, selectedNodeParentId])

  const selectedNodeValidationMessage = useMemo(() => {
    if (!selectedNodeId || diagnostics.isValid) {
      return null
    }

    const relevantIssue = diagnostics.issues.find(
      (issue) => issue.nodeIds?.includes(selectedNodeId) && issue.type !== 'segment-boundary',
    )

    return relevantIssue?.message ?? null
  }, [diagnostics, selectedNodeId])

  const selectedLayoutNode = useMemo(
    () => renderedNodes.find((node) => node.id === selectedNodeId) ?? null,
    [renderedNodes, selectedNodeId],
  )

  const selectedSegmentLabel = useMemo(
    () => filteredSegmentLabels.find((segmentLabel) => segmentLabel.segmentId === selectedSegmentId) ?? null,
    [filteredSegmentLabels, selectedSegmentId],
  )

  const selectedControlGeometry = useMemo(() => {
    if (!selectedLayoutNode) {
      return null
    }

    const dx = selectedLayoutNode.x - canvas.origin.x
    const dy = selectedLayoutNode.y - canvas.origin.y
    const length = Math.hypot(dx, dy) || 1
    const radial = { x: dx / length, y: dy / length }
    const tangent = { x: -radial.y, y: radial.x }

    return {
      child: {
        x: selectedLayoutNode.x + radial.x * addControlOffset,
        y: selectedLayoutNode.y + radial.y * addControlOffset,
      },
      left: {
        x: selectedLayoutNode.x - tangent.x * addControlOffset,
        y: selectedLayoutNode.y - tangent.y * addControlOffset,
      },
      right: {
        x: selectedLayoutNode.x + tangent.x * addControlOffset,
        y: selectedLayoutNode.y + tangent.y * addControlOffset,
      },
    }
  }, [selectedLayoutNode, canvas.origin.x, canvas.origin.y, addControlOffset])

  const selectedSegmentControlGeometry = useMemo(() => {
    if (!selectedSegmentLabel) {
      return null
    }

    const baselineRadians = (selectedSegmentLabel.rotation * Math.PI) / 180
    const baseline = {
      x: Math.cos(baselineRadians),
      y: Math.sin(baselineRadians),
    }
    const labelWidth = Math.max(88, selectedSegmentLabel.text.length * 10)
    const controlOffset = labelWidth / 2 + 28

    return {
      left: {
        x: selectedSegmentLabel.x - baseline.x * controlOffset,
        y: selectedSegmentLabel.y - baseline.y * controlOffset,
      },
      right: {
        x: selectedSegmentLabel.x + baseline.x * controlOffset,
        y: selectedSegmentLabel.y + baseline.y * controlOffset,
      },
    }
  }, [selectedSegmentLabel])

  const dependencyPortals = useMemo(() => {
    if (!nodes.length) {
      return []
    }

    const layoutNodeById = layoutNodesById
    const levelIdToNodeId = buildLevelIdToNodeIdMap(roadmapData)
    const dependencies = []
    const queue = [...(roadmapData.children ?? [])]

    while (queue.length > 0) {
      const current = queue.shift()

      for (const level of (current.levels ?? [])) {
        for (const targetLevelId of (level.additionalDependencyLevelIds ?? [])) {
          const targetNodeId = levelIdToNodeId.get(targetLevelId)
          if (targetNodeId && layoutNodeById.has(current.id) && layoutNodeById.has(targetNodeId)) {
            dependencies.push({
              sourceId: current.id,
              targetId: targetNodeId,
              sourceLevelId: level.id,
              targetLevelId,
            })
          }
        }
      }

      queue.push(...(current.children ?? []))
    }

    const endpointsByNodeId = new Map()
    const pushEndpoint = (nodeId, endpoint) => {
      const list = endpointsByNodeId.get(nodeId) ?? []
      list.push(endpoint)
      endpointsByNodeId.set(nodeId, list)
    }

    for (const dependency of dependencies) {
      const sourceNode = layoutNodeById.get(dependency.sourceId)
      const targetNode = layoutNodeById.get(dependency.targetId)
      const sourceDataNode = allNodesById.get(dependency.sourceId)
      const targetDataNode = allNodesById.get(dependency.targetId)
      const sourceLabel = sourceDataNode?.shortName ?? sourceNode.shortName ?? sourceNode.label
      const targetLabel = targetDataNode?.shortName ?? targetNode.shortName ?? targetNode.label

      const targetLevelIndex = (targetDataNode?.levels ?? []).findIndex((l) => l.id === dependency.targetLevelId)
      const sourceLevelIndex = (sourceDataNode?.levels ?? []).findIndex((l) => l.id === dependency.sourceLevelId)
      const targetLevelSuffix = targetLevelIndex >= 0 ? `\u00B7L${targetLevelIndex + 1}` : ''
      const sourceLevelSuffix = sourceLevelIndex >= 0 ? `\u00B7L${sourceLevelIndex + 1}` : ''

      const depKey = `${dependency.sourceId}:${dependency.sourceLevelId}->${dependency.targetId}:${dependency.targetLevelId}`

      pushEndpoint(dependency.sourceId, {
        key: `${depKey}:source`,
        type: 'source',
        sourceId: dependency.sourceId,
        targetId: dependency.targetId,
        tooltip: `Needs ${targetNode.label}`,
        isInteractive: true,
        otherLabel: `${String(targetLabel).slice(0, 3).toUpperCase()}${targetLevelSuffix}`,
      })

      pushEndpoint(dependency.targetId, {
        key: `${depKey}:target`,
        type: 'target',
        sourceId: dependency.sourceId,
        targetId: dependency.targetId,
        tooltip: `Required by ${sourceNode.label}`,
        isInteractive: true,
        otherLabel: `${String(sourceLabel).slice(0, 3).toUpperCase()}${sourceLevelSuffix}`,
      })
    }

    // ── Auto-crossing portals ──────────────────────────────────────────────
    // When the layout solver detects that a hierarchy edge would visually cross
    // another edge it removes the line and places it in `crossingEdges`.  We
    // turn those into portal pairs so the connection remains discoverable.
    // They are marked `isCrossing: true` to exclude them from the inspector
    // dependency summary (they are parent→child relationships, not additional
    // dependencies).
    // NOTE: must be registered into endpointsByNodeId BEFORE the position loop
    // below so that the coordinates are computed together with other portals.
    for (const crossing of crossingEdges) {
      const parentNode = layoutNodeById.get(crossing.parentId)
      const childNode = layoutNodeById.get(crossing.childId)
      if (!parentNode || !childNode) continue

      const parentDataNode = allNodesById.get(crossing.parentId)
      const childDataNode = allNodesById.get(crossing.childId)
      const parentLabel = parentDataNode?.shortName ?? parentNode.shortName ?? String(parentNode.label ?? '').slice(0, 3)
      const childLabel = childDataNode?.shortName ?? childNode.shortName ?? String(childNode.label ?? '').slice(0, 3)

      const key = `crossing:${crossing.parentId}->${crossing.childId}`

      pushEndpoint(crossing.parentId, {
        key: `${key}:source`,
        type: 'source',
        sourceId: crossing.parentId,
        targetId: crossing.childId,
        tooltip: `Verbindung zu ${childNode.label}`,
        isInteractive: false,
        isCrossing: true,
        otherLabel: String(childLabel).slice(0, 3).toUpperCase(),
      })

      pushEndpoint(crossing.childId, {
        key: `${key}:target`,
        type: 'target',
        sourceId: crossing.parentId,
        targetId: crossing.childId,
        tooltip: `Connection from ${parentNode.label}`,
        isInteractive: false,
        isCrossing: true,
        otherLabel: String(parentLabel).slice(0, 3).toUpperCase(),
      })
    }

    const endpoints = []
    // ── Slot-based portal placement ──────────────────────────────────────────
    // Each hemisphere is divided into N fixed slots (step=20°, ±80° from axis).
    // Source portals use the outward hemisphere; target portals the inward hemisphere.
    // Slots are tried in order of closeness to the hemisphere axis (center-first),
    // so portals prefer the radial direction and fall back sideways only when blocked.
    const SLOT_STEP = 20         // degrees between adjacent slots
    const HEMI_SPAN = 80         // hemisphere spans ±80° from axis (9 slots total)
    const LINK_BLOCK = 32        // block zone around each connection-line angle
    const PORTAL_SEP = 20        // minimum separation between portals on same node

    // Build ordered slot list for a hemisphere — center first, then alternating ±
    const buildSlots = (center) => {
      const slots = [center]
      for (let o = SLOT_STEP; o <= HEMI_SPAN; o += SLOT_STEP) {
        slots.push(center + o)
        slots.push(center - o)
      }
      return slots
    }

    // Pick the first slot not blocked by link-lines or already-placed portals.
    // Falls back to least-conflicted slot if every slot is blocked.
    const pickSlot = (slots, blockedDirs, reservedAngles) => {
      for (const slot of slots) {
        const hitLink = blockedDirs.some((a) => isAngleNear(slot, a, LINK_BLOCK))
        const hitPortal = reservedAngles.some((a) => isAngleNear(slot, a, PORTAL_SEP))
        if (!hitLink && !hitPortal) return slot
      }
      let bestSlot = slots[0]; let bestScore = Infinity
      for (const slot of slots) {
        const s = blockedDirs.filter((a) => isAngleNear(slot, a, LINK_BLOCK)).length * 1000
             + reservedAngles.filter((a) => isAngleNear(slot, a, PORTAL_SEP)).length * 50
        if (s < bestScore) { bestScore = s; bestSlot = slot }
      }
      return bestSlot
    }

    for (const [nodeId, nodeEndpoints] of endpointsByNodeId.entries()) {
      const layoutNode = layoutNodeById.get(nodeId)
      if (!layoutNode) continue

      const isNodeMinimal = nodeVisibilityModeById.get(nodeId) === 'minimal'
      const effectiveNodeSize = isNodeMinimal ? MINIMAL_NODE_SIZE : TREE_CONFIG.nodeSize
      const portalOrbit = effectiveNodeSize * 0.74
      const endpointOrbitStep = effectiveNodeSize * 0.06

      // Collect the directions to hierarchy connection lines (parent + children).
      const childAngles = nodes
        .filter((candidate) => candidate.parentId === nodeId)
        .map((candidate) => {
          const expanded = layoutNodeById.get(candidate.id) ?? candidate
          return toDegrees(Math.atan2(expanded.y - layoutNode.y, expanded.x - layoutNode.x))
        })
      const linkBlockedAngles = [...childAngles]
      if (layoutNode.parentId) {
        const parentNode = layoutNodeById.get(layoutNode.parentId)
        if (parentNode) {
          linkBlockedAngles.push(toDegrees(Math.atan2(parentNode.y - layoutNode.y, parentNode.x - layoutNode.x)))
        }
      }

      // Radial axis: inward = toward canvas center, outward = away from center.
      const inwardAngle = toDegrees(Math.atan2(canvas.origin.y - layoutNode.y, canvas.origin.x - layoutNode.x))
      const outwardAngle = inwardAngle + 180

      const sourceEndpoints = nodeEndpoints.filter((ep) => ep.type === 'source')
        .sort((a, b) => a.key.localeCompare(b.key))
      const targetEndpoints = nodeEndpoints.filter((ep) => ep.type === 'target')
        .sort((a, b) => a.key.localeCompare(b.key))

      // Source slots: outer hemisphere (centered on outwardAngle).
      // Target slots: inner hemisphere (centered on inwardAngle).
      // Each set is ordered center-first so portals prefer the radial axis.
      const sourceSlots = buildSlots(outwardAngle)
      const targetSlots = buildSlots(inwardAngle)
      const reservedAngles = []

      // Place source portals (outgoing — outer hemisphere)
      sourceEndpoints.forEach((endpoint, index) => {
        const angle = pickSlot(sourceSlots, linkBlockedAngles, reservedAngles)
        reservedAngles.push(angle)
        const orbit = portalOrbit + Math.abs(index - (sourceEndpoints.length - 1) / 2) * endpointOrbitStep
        const radians = toRadians(angle)
        endpoints.push({
          ...endpoint,
          nodeId,
          x: layoutNode.x + Math.cos(radians) * orbit,
          y: layoutNode.y + Math.sin(radians) * orbit,
          angle,
          rotation: angle + 180,
          scale: isNodeMinimal ? MINIMAL_NODE_SIZE / TREE_CONFIG.nodeSize : 1,
          isMinimal: isNodeMinimal,
        })
      })

      // Place target portals (incoming — inner hemisphere)
      targetEndpoints.forEach((endpoint, index) => {
        const angle = pickSlot(targetSlots, linkBlockedAngles, reservedAngles)
        reservedAngles.push(angle)
        const orbit = portalOrbit + Math.abs(index - (targetEndpoints.length - 1) / 2) * endpointOrbitStep
        const radians = toRadians(angle)
        endpoints.push({
          ...endpoint,
          nodeId,
          x: layoutNode.x + Math.cos(radians) * orbit,
          y: layoutNode.y + Math.sin(radians) * orbit,
          angle,
          rotation: angle + 180,
          scale: isNodeMinimal ? MINIMAL_NODE_SIZE / TREE_CONFIG.nodeSize : 1,
          isMinimal: isNodeMinimal,
        })
      })
    }

    return endpoints
  }, [allNodesById, layoutNodesById, canvas.origin.x, canvas.origin.y, nodeVisibilityModeById, nodes, roadmapData.children, crossingEdges])

  const visibleDependencyPortals = useMemo(
    () => dependencyPortals.filter((portal) => (
      renderedNodeIds.has(portal.nodeId)
      && renderedNodeIds.has(portal.sourceId)
      && renderedNodeIds.has(portal.targetId)
    )),
    [dependencyPortals, renderedNodeIds],
  )

  // For the close-zoom release-note card: requires/requiredBy labels per node
  const depSummaryByNodeId = useMemo(() => {
    const map = new Map()
    for (const portal of dependencyPortals) {
      if (portal.isCrossing) continue // hierarchy crossings are not additional dependencies
      if (!map.has(portal.nodeId)) map.set(portal.nodeId, { requires: [], requiredBy: [] })
      const entry = map.get(portal.nodeId)
      if (portal.type === 'source') entry.requires.push(portal.otherLabel)
      else entry.requiredBy.push(portal.otherLabel)
    }
    return map
  }, [dependencyPortals])

  const visibleDependencyLines = useMemo(() => {
    // Pair source portals with their matching target portals so connections can be drawn.
    const sourceByKey = new Map()
    const targetByKey = new Map()
    for (const portal of visibleDependencyPortals) {
      // portal.key format: `${depKey}:source` or `${depKey}:target`
      const baseKey = portal.key.replace(/:(?:source|target)$/, '')
      if (portal.type === 'source') {
        sourceByKey.set(baseKey, portal)
      } else {
        targetByKey.set(baseKey, portal)
      }
    }
    const lines = []
    for (const [baseKey, src] of sourceByKey.entries()) {
      const tgt = targetByKey.get(baseKey)
      if (tgt) {
        lines.push({ key: baseKey, x1: src.x, y1: src.y, x2: tgt.x, y2: tgt.y })
      }
    }
    return lines
  }, [visibleDependencyPortals])

  const emptyStateAddControl = useMemo(() => {
    if (nodes.length > 0) {
      return null
    }

    return {
      x: canvas.origin.x,
      y: canvas.origin.y - centerIconSize / 2 - 72,
    }
  }, [nodes.length, canvas.origin.x, canvas.origin.y, centerIconSize])

  const emptySegmentAddControl = useMemo(() => {
    if ((roadmapData.segments ?? []).length > 0) {
      return null
    }

    const separatorInnerRadius = Math.max(TREE_CONFIG.nodeSize * 0.9, TREE_CONFIG.levelSpacing * 0.9)
    const segmentLabelRadius = Math.max(
      canvas.maxRadius + TREE_CONFIG.nodeSize * 0.95,
      separatorInnerRadius + TREE_CONFIG.nodeSize * 0.7,
    )

    return {
      x: canvas.origin.x,
      y: canvas.origin.y - segmentLabelRadius * 1.32,
    }
  }, [roadmapData.segments, canvas.origin.x, canvas.origin.y, canvas.maxRadius])

  const fitContentBounds = useMemo(() => {
    const bounds = {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    }

    const includeRect = (x, y, width, height) => {
      if (![x, y, width, height].every(Number.isFinite)) {
        return
      }

      bounds.minX = Math.min(bounds.minX, x)
      bounds.minY = Math.min(bounds.minY, y)
      bounds.maxX = Math.max(bounds.maxX, x + width)
      bounds.maxY = Math.max(bounds.maxY, y + height)
    }

    includeRect(
      canvas.origin.x - centerIconSize / 2 - 8,
      canvas.origin.y - centerIconSize / 2 - 8,
      centerIconSize + 16,
      centerIconSize + 16,
    )

    for (const node of renderedNodes) {
      const visibilityMode = nodeVisibilityModeById.get(node.id) ?? 'full'
      const glowPadding = visibilityMode === 'minimal' ? 8 : 18
      const nodeSizeForFit = (visibilityMode === 'minimal' ? MINIMAL_NODE_SIZE : TREE_CONFIG.nodeSize) + glowPadding * 2

      includeRect(
        node.x - nodeSizeForFit / 2,
        node.y - nodeSizeForFit / 2,
        nodeSizeForFit,
        nodeSizeForFit,
      )
    }

    for (const segmentLabel of filteredSegmentLabels) {
      const labelWidth = Math.max(88, String(segmentLabel.text ?? '').length * 10)
      includeRect(segmentLabel.x - (labelWidth / 2) - 10, segmentLabel.y - 12, labelWidth + 20, 24)
    }

    for (const separator of filteredSegmentSeparators) {
      const path = String(separator.path ?? '')
      const matches = [...path.matchAll(/[-0-9.]+/g)].map((match) => Number.parseFloat(match[0]))
      if (matches.length >= 4) {
        const xs = matches.filter((_, index) => index % 2 === 0)
        const ys = matches.filter((_, index) => index % 2 === 1)
        includeRect(Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
      }
    }

    for (const portal of visibleDependencyPortals) {
      includeRect(portal.x - 30, portal.y - 30, 60, 60)
    }

    if (emptyStateAddControl) {
      includeRect(emptyStateAddControl.x - 22, emptyStateAddControl.y - 22, 44, 82)
    }

    if (emptySegmentAddControl) {
      includeRect(emptySegmentAddControl.x - 18, emptySegmentAddControl.y - 18, 36, 68)
    }

    if (selectedControlGeometry) {
      includeRect(selectedControlGeometry.child.x - 18, selectedControlGeometry.child.y - 18, 36, 36)
      includeRect(selectedControlGeometry.left.x - 18, selectedControlGeometry.left.y - 18, 36, 36)
      includeRect(selectedControlGeometry.right.x - 18, selectedControlGeometry.right.y - 18, 36, 36)
    }

    if (selectedSegmentControlGeometry) {
      includeRect(selectedSegmentControlGeometry.left.x - 16, selectedSegmentControlGeometry.left.y - 16, 32, 32)
      includeRect(selectedSegmentControlGeometry.right.x - 16, selectedSegmentControlGeometry.right.y - 16, 32, 32)
    }

    if (!Number.isFinite(bounds.minX) || !Number.isFinite(bounds.minY) || !Number.isFinite(bounds.maxX) || !Number.isFinite(bounds.maxY)) {
      return {
        x: canvas.origin.x - centerIconSize / 2 - 8,
        y: canvas.origin.y - centerIconSize / 2 - 8,
        width: centerIconSize + 16,
        height: centerIconSize + 16,
      }
    }

    const centerX = canvas.origin.x
    const centerY = canvas.origin.y
    const halfWidth = Math.max(centerX - bounds.minX, bounds.maxX - centerX)
    const halfHeight = Math.max(centerY - bounds.minY, bounds.maxY - centerY)

    return {
      x: centerX - halfWidth,
      y: centerY - halfHeight,
      width: halfWidth * 2,
      height: halfHeight * 2,
    }
  }, [
    canvas.origin.x,
    canvas.origin.y,
    centerIconSize,
    emptySegmentAddControl,
    emptyStateAddControl,
    filteredSegmentLabels,
    filteredSegmentSeparators,
    nodeVisibilityModeById,
    renderedNodes,
    selectedControlGeometry,
    selectedSegmentControlGeometry,
    visibleDependencyPortals,
  ])

  const handleOpenCenterIconPanel = (event) => {
    event.stopPropagation()
    // Toggle center panel; ensure only one right-side panel visible
    selectNodeId(null)
    selectSegmentId(null)
    setRightPanel((prev) => togglePanel(prev, PANEL_CENTER))
  }

  const handleOpenScopeManager = (event) => {
    event?.stopPropagation()
    selectNodeId(null)
    selectSegmentId(null)
    setRightPanel((prev) => togglePanel(prev, PANEL_SCOPES))
  }

  const handleOpenSegmentManager = (event) => {
    event?.stopPropagation()
    selectNodeId(null)
    selectSegmentId(null)
    setRightPanel((prev) => togglePanel(prev, PANEL_SEGMENTS))
  }

  const handleCloseScopeManager = () => {
    if (rightPanel === PANEL_SCOPES) setRightPanel(null)
  }

  const handleCloseSegmentManager = () => {
    if (rightPanel === PANEL_SEGMENTS) setRightPanel(null)
  }

  const handleResetCenterIcon = () => {
    commitDocument({
      ...roadmapData,
      centerIconSrc: DEFAULT_CENTER_ICON_SRC,
    })
  }

  const handleToggleShowHiddenNodes = () => {
    commitDocument({ ...roadmapData, showHiddenNodes: !(roadmapData.showHiddenNodes ?? false) })
  }

  const handleCenterIconUpload = async (file) => {
    if (!file) {
      return
    }

    const isSvgFile = file.type.includes('svg') || file.name.toLowerCase().endsWith('.svg')
    if (!isSvgFile) {
      window.alert('Bitte eine gueltige SVG-Datei auswaehlen.')
      return
    }

    try {
      const [svgMarkup, svgDataUrl] = await Promise.all([
        readFileAsText(file),
        readFileAsDataUrl(file),
      ])

      if (!isValidSvgMarkup(svgMarkup)) {
        window.alert('Die Datei ist kein gueltiges SVG.')
        return
      }

      commitDocument({
        ...roadmapData,
        centerIconSrc: svgDataUrl,
      })
    } catch (error) {
      console.error('Center icon upload failed', error)
      window.alert('SVG file could not be loaded.')
    }
  }

  const commitDocument = (nextDocument) => {
    if (!nextDocument || nextDocument === roadmapData) {
      return
    }

    dispatchDocument({ type: 'apply', document: nextDocument })
  }

  const applyToSelectedNodes = (applier, opts = {}) => {
    const ids = Array.isArray(selectedNodeIds) && selectedNodeIds.length > 0
      ? selectedNodeIds
      : selectedNodeId
        ? [selectedNodeId]
        : []

    if (ids.length === 0) return

    const applyOnce = () => {
      let next = roadmapData
      for (const id of ids) {
        next = applier(next, id)
      }
      commitDocument(next)
    }

    if (ids.length > 1 && !opts.skipConfirm) {
      let message = opts.description
        ? `Apply "${opts.description}" to ${ids.length} selected nodes?`
        : `Apply change to ${ids.length} selected nodes?`

      if (opts.applyToAllLevels) {
        message += '\n\nNote: The change will be applied to all levels of each selected node.'
      }

      const confirmed = window.confirm(message)
      if (!confirmed) return
    }

    applyOnce()
  }

  const handleOpenDocumentPicker = () => {
    documentFileInputRef.current?.click()
  }

  const handleOpenCsvDocumentPicker = () => {
    csvDocumentFileInputRef.current?.click()
  }

  const handleOpenJsonDocumentPicker = () => {
    jsonDocumentFileInputRef.current?.click()
  }

  const handleExportJson = () => {
    try {
      const exported = downloadDocumentJson(roadmapData)
      if (!exported) {
        window.alert('JSON export failed.')
      }
    } catch (error) {
      console.error('JSON export failed', error)
      window.alert('JSON export failed.')
    }
  }

  const handleJsonDocumentFileSelected = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const rawText = await file.text()
      const nextDocument = readDocumentFromJsonText(rawText)
      dispatchDocument({ type: 'replace', document: nextDocument })
      setTransformKey((current) => current + 1)
      resetSelections()
    } catch (error) {
      console.error('JSON import failed', error)
      window.alert(`JSON import failed: ${error?.message ?? 'Unknown error'}`)
    } finally {
      event.target.value = ''
    }
  }

  const closeCsvImportDialog = () => {
    setCsvImportDialogOpen(false)
    setPendingCsvImport(null)
    setCsvImportOptions(DEFAULT_CSV_IMPORT_PROCESS_OPTIONS)
  }

  const handleUndo = () => {
    if (!canUndo) {
      return
    }

    dispatchDocument({ type: 'undo' })
  }

  const handleRedo = () => {
    if (!canRedo) {
      return
    }

    dispatchDocument({ type: 'redo' })
  }

  const handleReset = () => {
    if (!confirmResetDocument()) {
      return
    }

    dispatchDocument({ type: 'apply', document: createEmptyDocument() })
    selectNodeId(null)
    selectSegmentId(null)
    setSelectedPortalKey(null)
    setSelectedProgressLevelId(null)
  }

  // --- Export label-mode dialog helpers ---

  const openExportLabelDialog = () => new Promise((resolve) => {
    exportLabelDialogResolveRef.current = resolve
    setExportLabelDialogMode('mid')
    setExportLabelDialogOpen(true)
  })

  const confirmExportLabelDialog = () => {
    setExportLabelDialogOpen(false)
    exportLabelDialogResolveRef.current?.(exportLabelDialogMode)
    exportLabelDialogResolveRef.current = null
  }

  const cancelExportLabelDialog = () => {
    setExportLabelDialogOpen(false)
    exportLabelDialogResolveRef.current?.(null)
    exportLabelDialogResolveRef.current = null
  }

  const handleExportSvg = async () => {
    if (!canvasSvgRef.current) {
      window.alert('SVG export not available.')
      return
    }

    try {
      flushSync(() => resetSelections())
      const selectedMode = await openExportLabelDialog()
      if (selectedMode === null) return
      flushSync(() => setExportLabelModeOverride(selectedMode))
      const { exportSvgFromElement } = await import('./utils/svgExport')
      const exported = exportSvgFromElement(canvasSvgRef.current, {
        fileName: 'skilltree-roadmap.svg',
        includeTooltips: true,
        sourceDocument: window.document,
      })
      if (!exported) {
        window.alert('SVG export failed.')
        return
      }

    } catch (error) {
      console.error('SVG export failed', error)
      window.alert('SVG export failed.')
    } finally {
      setExportLabelModeOverride(null)
    }
  }

  const handleExportPng = async () => {
    if (!canvasSvgRef.current) {
      window.alert('PNG export not available.')
      return
    }

    try {
      flushSync(() => resetSelections())
      const selectedMode = await openExportLabelDialog()
      if (selectedMode === null) return
      flushSync(() => setExportLabelModeOverride(selectedMode))
      const { exportPngFromElement } = await import('./utils/svgExport')
      const exported = await exportPngFromElement(canvasSvgRef.current, {
        fileName: 'skilltree-roadmap.png',
        includeTooltips: false,
        sourceDocument: window.document,
      })

      if (!exported) {
        window.alert('PNG export failed.')
        return
      }
    } catch (error) {
      console.error('PNG export failed', error)
      window.alert('PNG export failed.')
    } finally {
      setExportLabelModeOverride(null)
    }
  }

  const handleExportCleanSvg = async () => {
    if (!canvasSvgRef.current) {
      window.alert('SVG export not available.')
      return
    }

    try {
      flushSync(() => resetSelections())
      const selectedMode = await openExportLabelDialog()
      if (selectedMode === null) return
      flushSync(() => setExportLabelModeOverride(selectedMode))
      const { exportSvgFromElement } = await import('./utils/svgExport')
      const exported = exportSvgFromElement(canvasSvgRef.current, {
        fileName: 'skilltree-roadmap-clean.svg',
        includeTooltips: false,
        sourceDocument: window.document,
      })
      if (!exported) {
        window.alert('Clean SVG export failed.')
        return
      }

    } catch (error) {
      console.error('Clean SVG export failed', error)
      window.alert('Clean SVG export failed.')
    } finally {
      setExportLabelModeOverride(null)
    }
  }

  const handleExportHtml = async () => {
    if (!canvasSvgRef.current) {
      window.alert('HTML export not available.')
      return
    }

    try {
      flushSync(() => resetSelections())
      // Render in 'far' mode so the HTML viewer script has the base dimensions
      // and can apply responsive label modes dynamically.
      flushSync(() => setExportLabelModeOverride('far'))
      const { exportHtmlFromSkillTree } = await import('./utils/htmlExport')
      const exported = exportHtmlFromSkillTree({
        svgElement: canvasSvgRef.current,
        roadmapDocument: roadmapData,
      })

      if (!exported) {
        window.alert('HTML export failed.')
        return
      }

    } catch (error) {
      console.error('HTML export failed', error)
      window.alert('HTML export failed.')
    } finally {
      setExportLabelModeOverride(null)
    }
  }

  const handleExportCsv = () => {
    try {
      const exported = downloadDocumentCsv(roadmapData, activeReleaseId)
      if (!exported) {
        window.alert('CSV export failed.')
      }
    } catch (error) {
      console.error('CSV export failed', error)
      const message = getCsvExportErrorMessage(error)
      window.alert(message)
    }
  }

  const handleExportPdf = async () => {
    if (!canvasSvgRef.current) {
      window.alert('PDF export not available.')
      return
    }

    try {
      flushSync(() => resetSelections())
      const selectedMode = await openExportLabelDialog()
      if (selectedMode === null) return
      flushSync(() => setExportLabelModeOverride(selectedMode))
      const { tryExportPdfFromSkillTree } = await import('./utils/pdfExport')
      const exported = tryExportPdfFromSkillTree({
        svgElement: canvasSvgRef.current,
        roadmapDocument: roadmapData,
      })

      if (!exported.ok) {
        if (exported.errorCode === 'popup-blocked') {
          window.alert('PDF window was blocked. Please allow pop-ups for this page and retry the export.')
        } else {
          window.alert('PDF export failed. Please try again.')
        }
        return
      }

    } catch (error) {
      console.error('PDF export failed', error)
      window.alert('PDF export failed. Please try again.')
    } finally {
      setExportLabelModeOverride(null)
    }
  }

  const handleDocumentFileSelected = async (event) => {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    try {
      const rawText = await file.text()
      const { readDocumentFromHtmlText } = await import('./utils/htmlExport')
      const nextDocument = readDocumentFromHtmlText(rawText)
      dispatchDocument({ type: 'replace', document: nextDocument })
      setTransformKey((current) => current + 1)
      resetSelections()
    } catch (error) {
      console.error('HTML import failed', error)
      const message = getHtmlImportErrorMessage(error)
      window.alert(message)
    } finally {
      event.target.value = ''
    }
  }

  const handleCsvDocumentFileSelected = async (event) => {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    try {
      const rawText = await file.text()
      setPendingCsvImport({ fileName: file.name || 'skilltree-roadmap.csv', rawText })
      setCsvImportOptions(DEFAULT_CSV_IMPORT_PROCESS_OPTIONS)
      setCsvImportDialogOpen(true)
    } catch (error) {
      console.error('CSV import failed', error)
      const message = getCsvImportErrorMessage(error)
      window.alert(message)
    } finally {
      event.target.value = ''
    }
  }

  const handleConfirmCsvImport = () => {
    if (!pendingCsvImport) {
      return
    }

    try {
      const nextDocument = readDocumentFromCsvText(pendingCsvImport.rawText, {
        ignoreSegments: !csvImportOptions.processSegments,
        ignoreManualLevels: !csvImportOptions.processManualLevels,
      })
      dispatchDocument({ type: 'replace', document: nextDocument })
      setTransformKey((current) => current + 1)
      resetSelections()
      closeCsvImportDialog()
    } catch (error) {
      console.error('CSV import failed', error)
      const message = getCsvImportErrorMessage(error)
      window.alert(message)
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      saveDocumentToLocalStorage(roadmapData)
      setLastSavedAt(new Date())
    }, AUTOSAVE_DEBOUNCE_MS)

    return () => window.clearTimeout(timeoutId)
  }, [roadmapData])

  useEffect(() => {
    const handleKeyDown = (event) => {
      const action = getSkillTreeShortcutAction({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        isEditableTarget: isEditableElement(event.target),
      })

      if (action === 'undo') {
        event.preventDefault()
        if (canUndo) {
          dispatchDocument({ type: 'undo' })
        }
        return
      }

      if (action === 'redo') {
        event.preventDefault()
        if (canRedo) {
          dispatchDocument({ type: 'redo' })
        }
        return
      }

      if (action === 'export-html') {
        event.preventDefault()
        void (async () => {
          try {
            if (!canvasSvgRef.current) {
              window.alert('HTML export not available.')
              return
            }

            flushSync(() => resetSelections())
            const { exportHtmlFromSkillTree } = await import('./utils/htmlExport')
            const exported = exportHtmlFromSkillTree({
              svgElement: canvasSvgRef.current,
              roadmapDocument: roadmapData,
            })

            if (!exported) {
              window.alert('HTML export failed.')
            }
          } catch (error) {
            console.error('HTML export shortcut failed', error)
            window.alert('HTML export failed.')
          }
        })()
        return
      }

      if (action === 'import-html') {
        event.preventDefault()
        handleOpenDocumentPicker()
        return
      }

      if (action === 'create-segment') {
        event.preventDefault()
        handleCreateSegment()
        return
      }

      if (action === 'reset') {
        event.preventDefault()
        handleReset()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRedo, canUndo, roadmapData, selectedSegmentId])

  const autosaveLabel = lastSavedAt
    ? `Autosave ${lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
    : 'Autosave aktiv'

  const handleFitToScreen = () => {
    if (!transformApiRef.current) return
    const vw = window.innerWidth
    const vh = window.innerHeight
    const { positionX, positionY, scale } = computeFitTransform({
      contentBounds: fitContentBounds,
      viewportWidth: vw,
      viewportHeight: vh,
      padding: VIEWPORT_DEFAULTS.fitPadding,
      minScale: VIEWPORT_DEFAULTS.minScale,
      maxScale: VIEWPORT_DEFAULTS.maxScale,
    })
    transformApiRef.current.setTransform(positionX, positionY, scale, 300, 'easeOut')
  }

  const handleZoomToNode = (nodeX, nodeY) => {
    if (!transformApiRef.current || !canvasAreaRef.current) return
    const rect = canvasAreaRef.current.getBoundingClientRect()
    const newScale = Math.min(3.0, VIEWPORT_DEFAULTS.maxScale)
    const newPositionX = rect.width / 2 - nodeX * newScale
    const newPositionY = rect.height / 2 - nodeY * newScale
    transformApiRef.current.setTransform(newPositionX, newPositionY, newScale, 400, 'easeOut')
  }

  const handleZoomToScale = (scale) => {
    if (!transformApiRef.current) return
    const { positionX, positionY, scale: currentScale } = transformApiRef.current.state
    const cx = window.innerWidth / 2
    const cy = window.innerHeight / 2
    transformApiRef.current.setTransform(
      cx - (cx - positionX) * (scale / currentScale),
      cy - (cy - positionY) * (scale / currentScale),
      scale,
      200,
      'easeOut',
    )
  }

  const handleZoomIn = () => {
    if (!transformApiRef.current) return
    handleZoomToScale(getNextZoomStep(transformApiRef.current.state.scale, 1))
  }

  const handleZoomOut = () => {
    if (!transformApiRef.current) return
    handleZoomToScale(getNextZoomStep(transformApiRef.current.state.scale, -1))
  }

  const compareNodesForKeyboardNavigation = (leftNode, rightNode) => (
    leftNode.angle - rightNode.angle
    || leftNode.x - rightNode.x
    || String(leftNode.label ?? '').localeCompare(String(rightNode.label ?? ''))
  )

  const getKeyboardNavigationTarget = (nodeId, key) => {
    const currentNode = layoutNodesById.get(nodeId)
    if (!currentNode) {
      return null
    }

    const siblings = nodes
      .filter((candidate) => candidate.parentId === currentNode.parentId && candidate.id !== nodeId)
      .sort(compareNodesForKeyboardNavigation)
    const children = nodes
      .filter((candidate) => candidate.parentId === nodeId)
      .sort(compareNodesForKeyboardNavigation)

    if (key === 'ArrowLeft') {
      const leftSibling = [...siblings].reverse().find((candidate) => candidate.x < currentNode.x)
      return leftSibling?.id ?? null
    }

    if (key === 'ArrowRight') {
      const rightSibling = siblings.find((candidate) => candidate.x > currentNode.x)
      return rightSibling?.id ?? null
    }

    if (key === 'ArrowUp') {
      return children[0]?.id ?? null
    }

    if (key === 'ArrowDown') {
      return currentNode.parentId ?? null
    }

    return null
  }

  useEffect(() => {
    const fitToScreen = () => {
      if (!transformApiRef.current) return
      const vw = window.innerWidth
      const vh = window.innerHeight
      const { positionX, positionY, scale } = computeFitTransform({
        contentBounds: fitContentBounds,
        viewportWidth: vw,
        viewportHeight: vh,
        padding: VIEWPORT_DEFAULTS.fitPadding,
        minScale: VIEWPORT_DEFAULTS.minScale,
        maxScale: VIEWPORT_DEFAULTS.maxScale,
      })
      transformApiRef.current.setTransform(positionX, positionY, scale, 300, 'easeOut')
    }

    const zoomByStep = (direction) => {
      if (!transformApiRef.current) return
      const { positionX, positionY, scale: currentScale } = transformApiRef.current.state
      const targetScale = getNextZoomStep(currentScale, direction)
      const cx = window.innerWidth / 2
      const cy = window.innerHeight / 2
      transformApiRef.current.setTransform(
        cx - (cx - positionX) * (targetScale / currentScale),
        cy - (cy - positionY) * (targetScale / currentScale),
        targetScale,
        200,
        'easeOut',
      )
    }

    const panBy = (dx, dy) => {
      if (!transformApiRef.current) return
      const { positionX, positionY, scale } = transformApiRef.current.state
      transformApiRef.current.setTransform(positionX + dx, positionY + dy, scale, 120, 'linear')
    }

    const handleViewportKeyDown = (event) => {
      const hasSelection = Boolean(selectedNodeId)
        || Boolean(selectedSegmentId)
        || (Array.isArray(selectedNodeIds) && selectedNodeIds.length > 0)

      if (selectedNodeId && (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown') && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && !isEditableElement(event.target)) {
        const nextNodeId = getKeyboardNavigationTarget(selectedNodeId, event.key)
        if (nextNodeId) {
          event.preventDefault()
          handleSelectNode(nextNodeId)
        }
        return
      }

      if (!hasSelection && (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown') && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && !isEditableElement(event.target)) {
        event.preventDefault()
        if (event.key === 'ArrowLeft') { panBy(-48, 0); return }
        if (event.key === 'ArrowRight') { panBy(48, 0); return }
        if (event.key === 'ArrowUp') { panBy(0, -48); return }
        if (event.key === 'ArrowDown') { panBy(0, 48); return }
      }

      const action = getViewportKeyboardAction({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        isEditableTarget: isEditableElement(event.target),
      })
      if (!action) return
      event.preventDefault()
      if (action === 'pan-hold') { setIsPanModeActive(true); return }
      if (action === 'pan-left') { panBy(-48, 0); return }
      if (action === 'pan-right') { panBy(48, 0); return }
      if (action === 'pan-up') { panBy(0, -48); return }
      if (action === 'pan-down') { panBy(0, 48); return }
      if (action === 'zoom-in') { zoomByStep(1); return }
      if (action === 'zoom-out') { zoomByStep(-1); return }
      if (action === 'fit') { fitToScreen(); return }
    }

    const handleViewportKeyUp = (event) => {
      if (event.key === ' ') setIsPanModeActive(false)
    }

    window.addEventListener('keydown', handleViewportKeyDown)
    window.addEventListener('keyup', handleViewportKeyUp)
    return () => {
      window.removeEventListener('keydown', handleViewportKeyDown)
      window.removeEventListener('keyup', handleViewportKeyUp)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas.width, canvas.height, canvas.origin.x, canvas.origin.y, selectedNodeId, selectedNodeIds, selectedSegmentId, layoutNodesById, nodes])

  const handleAddChild = (parentId) => {
    const result = addChildNodeWithResult(roadmapData, parentId)
    const createdNodeId = result.createdNodeId
    commitDocument(result.tree)

    if (createdNodeId) {
      selectNodeId(createdNodeId)
      setSelectedPortalKey(null)
    }
  }

  const handleAddRootNear = (anchorRootId, side) => {
    const result = addRootNodeNearWithResult(roadmapData, anchorRootId, side)
    const createdNodeId = result.createdNodeId
    commitDocument(result.tree)

    if (createdNodeId) {
      selectNodeId(createdNodeId)
      setSelectedPortalKey(null)
    }
  }

  const handleAddSegmentNear = (anchorSegmentId, side) => {
    const result = addSegmentNearWithResult(roadmapData, anchorSegmentId, side)
    const createdSegmentId = result.createdSegmentId
    commitDocument(result.tree)

    if (createdSegmentId) {
      selectNodeId(null)
      selectSegmentId(createdSegmentId)
      setSelectedPortalKey(null)
    }
  }

  const handleAddInitialSegment = () => {
    const result = addInitialSegmentWithResult(roadmapData)
    const createdSegmentId = result.createdSegmentId
    commitDocument(result.tree)

    if (createdSegmentId) {
      selectNodeId(null)
      selectSegmentId(createdSegmentId)
      setSelectedPortalKey(null)
    }
  }

  const handleCreateSegment = () => {
    const existingSegments = roadmapData.segments ?? []

    if (existingSegments.length === 0) {
      handleAddInitialSegment()
      return
    }

    const anchorSegmentId = selectedSegmentId ?? existingSegments[existingSegments.length - 1]?.id
    if (!anchorSegmentId) {
      return
    }

    handleAddSegmentNear(anchorSegmentId, 'right')
  }

  const handleCreateSegmentForManager = (label) => {
    try {
      const existingSegments = roadmapData.segments ?? []
      let createdSegmentId = null

      if (existingSegments.length === 0) {
        const result = addInitialSegmentWithResult(roadmapData)
        createdSegmentId = result.createdSegmentId
        let nextTree = result.tree
        if (createdSegmentId && label) {
          nextTree = updateSegmentLabel(nextTree, createdSegmentId, label)
        }
        commitDocument(nextTree)
      } else {
        const anchorSegmentId = selectedSegmentId ?? existingSegments[existingSegments.length - 1]?.id
        if (!anchorSegmentId) {
          return { ok: false, error: 'No anchor segment found.' }
        }
        const result = addSegmentNearWithResult(roadmapData, anchorSegmentId, 'right')
        createdSegmentId = result.createdSegmentId
        let nextTree = result.tree
        if (createdSegmentId && label) {
          nextTree = updateSegmentLabel(nextTree, createdSegmentId, label)
        }
        commitDocument(nextTree)
      }

      // Do NOT auto-select the created segment.
      // The segment manager should stay open and let the user create or edit more segments
      // without being unmounted by the selection state reset.
      // Manual selection (if desired) happens via UI interaction, not auto-selection.

      return { ok: true }
      } catch {
        return { ok: false, error: String('Failed to create segment.') }
      }
  }

  // Create segment from Inspector without auto-selecting it
  const handleCreateSegmentForInspector = (label) => {
    try {
      const existingSegments = roadmapData.segments ?? []
      let createdSegmentId = null

      if (existingSegments.length === 0) {
        const result = addInitialSegmentWithResult(roadmapData)
        createdSegmentId = result.createdSegmentId
        let nextTree = result.tree
        if (createdSegmentId && label) {
          nextTree = updateSegmentLabel(nextTree, createdSegmentId, label)
        }
        commitDocument(nextTree)
      } else {
        const anchorSegmentId = selectedSegmentId ?? existingSegments[existingSegments.length - 1]?.id
        if (!anchorSegmentId) {
          return { ok: false, error: 'No anchor segment found.' }
        }
        const result = addSegmentNearWithResult(roadmapData, anchorSegmentId, 'right')
        createdSegmentId = result.createdSegmentId
        let nextTree = result.tree
        if (createdSegmentId && label) {
          nextTree = updateSegmentLabel(nextTree, createdSegmentId, label)
        }
        commitDocument(nextTree)
      }

      // Do NOT select the created segment; inspector should stay open
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  }

  const handleRenameSegmentForManager = (segmentId, nextLabel) => {
    const exists = (roadmapData.segments ?? []).some((s) => s.id === segmentId)
    if (!exists) {
      return { ok: false, error: 'Segment not found.' }
    }

    try {
      commitDocument(updateSegmentLabel(roadmapData, segmentId, nextLabel))
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  }

  const handleDeleteSegmentForManager = (segmentId) => {
    const exists = (roadmapData.segments ?? []).some((s) => s.id === segmentId)
    if (!exists) {
      return { ok: false, error: 'Segment not found.' }
    }

    try {
      commitDocument(deleteSegment(roadmapData, segmentId))
      if (selectedSegmentId === segmentId) {
        selectSegmentId(null)
      }
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  }

  const handleAddInitialRoot = () => {
    const result = addInitialRootNodeWithResult(roadmapData)
    const createdNodeId = result.createdNodeId
    commitDocument(result.tree)

    if (createdNodeId) {
      selectNodeId(createdNodeId)
      setSelectedPortalKey(null)
    }
  }

  const handleSelectNode = (nodeId, event) => {
    const isCtrl = event && (event.ctrlKey || event.metaKey)
    if (isCtrl) {
      setSelectedNodeIds((prev = []) => {
        const exists = prev.includes(nodeId)
        const next = exists ? prev.filter((id) => id !== nodeId) : [...prev, nodeId]
        // open inspector when starting a multiselect (added item and inspector closed)
        if (!exists && rightPanel !== PANEL_INSPECTOR) {
          setRightPanel(PANEL_INSPECTOR)
        }
        // close inspector if we removed the last selection
        if (next.length === 0 && rightPanel === PANEL_INSPECTOR) {
          setRightPanel(null)
        }
        return next
      })
      // update last focused selected node id
      setSelectedNodeId((prev) => (prev === nodeId ? null : nodeId))
    } else {
      selectNodeId(nodeId)
    }

    setSelectedPortalKey(null)
  }

  const handleSelectNodeFromListView = (nodeId) => {
    const layoutNode = layoutNodesById.get(nodeId)
    // Commit the selection (opens inspector) synchronously so the layout
    // stabilises before we start animating the viewport.
    flushSync(() => {
      selectNodeId(nodeId)
    })
    if (layoutNode && transformApiRef.current) {
      const TARGET_SCALE = 3
      const vw = window.innerWidth
      const vh = window.innerHeight
      const positionX = vw / 2 - layoutNode.x * TARGET_SCALE
      const positionY = vh / 2 - layoutNode.y * TARGET_SCALE
      transformApiRef.current.setTransform(positionX, positionY, TARGET_SCALE, 500, 'easeOut')
    }
  }

  const handleSelectLevelFromListView = (nodeId, levelId) => {
    const layoutNode = layoutNodesById.get(nodeId)
    flushSync(() => {
      selectNodeId(nodeId)
      setSelectedProgressLevelId(levelId)
    })
    if (layoutNode && transformApiRef.current) {
      const TARGET_SCALE = 3
      const vw = window.innerWidth
      const vh = window.innerHeight
      const positionX = vw / 2 - layoutNode.x * TARGET_SCALE
      const positionY = vh / 2 - layoutNode.y * TARGET_SCALE
      transformApiRef.current.setTransform(positionX, positionY, TARGET_SCALE, 500, 'easeOut')
    }
  }

  const handleSelectSegment = (segmentId) => {
    selectSegmentId(segmentId)
    setSelectedPortalKey(null)
  }

  const handleSelectPortal = (portal) => {
    if (!portal?.isInteractive) {
      return
    }

    const nextSelectedNodeId = portal.type === 'source' ? portal.targetId : portal.sourceId
    handleSelectNode(nextSelectedNodeId)
  }

  const updateNodeData = (id, newLabel) => {
    commitDocument(updateNodeDataInTree(roadmapData, id, newLabel))
  }

  const handleLabelChange = (newLabel) => {
    if (!selectedNodeId || !selectedNode) {
      return
    }

    if (Array.isArray(selectedNodeIds) && selectedNodeIds.length > 1) {
      // When multiple nodes are selected, label edits are disabled.
      return
    }

    updateNodeData(selectedNodeId, newLabel)
  }

  const handleShortNameChange = (newShortName, nodeIdParam) => {
    const targetId = nodeIdParam || selectedNodeId

    if (!targetId) {
      return
    }

    if (Array.isArray(selectedNodeIds) && selectedNodeIds.length > 1) {
      // Do not allow shortname edits for multi-select
      return
    }

    commitDocument(updateNodeShortName(roadmapData, targetId, newShortName))
  }

  const handleStatusChange = (newStatus, levelId = activeSelectedProgressLevelId) => {
    if ((!selectedNodeId && !(Array.isArray(selectedNodeIds) && selectedNodeIds.length > 0))) {
      return
    }

    // Determine the source level index for the active level id so we can
    // apply the same positional level to every selected node. This ensures
    // multi-select bulk changes map to the equivalent level on each node
    // (or fallback to the primary level when a node has fewer levels).
    let sourceLevelIndex = 0
    if (levelId && selectedNodeId) {
      try {
        const srcNode = findNodeById(roadmapData, selectedNodeId)
        if (srcNode && Array.isArray(srcNode.levels)) {
          const idx = srcNode.levels.findIndex((l) => l.id === levelId)
          sourceLevelIndex = idx >= 0 ? idx : 0
        }
      } catch {
        sourceLevelIndex = 0
      }
    }

    applyToSelectedNodes((tree, id) => {
      const targetNode = findNodeById(tree, id)
      const levels = Array.isArray(targetNode?.levels) ? targetNode.levels : []
      const targetLevelId = levels[sourceLevelIndex]?.id ?? (levels[0]?.id ?? null)
      if (!targetLevelId) return tree
      return updateNodeProgressLevel(tree, id, targetLevelId, { status: newStatus }, activeReleaseId)
    })
  }

  const handleReleaseNoteChange = (releaseNote, levelId = activeSelectedProgressLevelId) => {
    if ((!selectedNodeId && !(Array.isArray(selectedNodeIds) && selectedNodeIds.length > 0)) || !levelId) {
      return
    }

    applyToSelectedNodes((tree, id) => updateNodeProgressLevel(tree, id, levelId, { releaseNote }))
  }

  const handleLevelLabelChange = (label, levelId = activeSelectedProgressLevelId) => {
    if (!selectedNodeId || !levelId) {
      return
    }

    commitDocument(updateNodeProgressLevel(roadmapData, selectedNodeId, levelId, { label }))
  }

  const handleLevelScopesChange = (scopeIds, levelId = activeSelectedProgressLevelId) => {
    if ((!selectedNodeId && !(Array.isArray(selectedNodeIds) && selectedNodeIds.length > 0)) || !levelId) {
      return
    }

    applyToSelectedNodes((tree, id) => updateNodeProgressLevel(tree, id, levelId, { scopeIds }))
  }

  const handleCreateScope = (scopeLabel, levelId = activeSelectedProgressLevelId) => {
    const normalizedScopeLabel = String(scopeLabel ?? '').trim() || 'Inspector Scope'
    const result = addScopeWithResult(roadmapData, normalizedScopeLabel)

    if (!result.ok || !result.scope) {
      return {
        ok: false,
        error: result.error,
      }
    }

    const activeScopeIds = Array.isArray(activeSelectedProgressLevel?.scopeIds)
      ? activeSelectedProgressLevel.scopeIds
      : []
    const nextScopeIds = uniqueArray([...activeScopeIds, result.scope.id])

    const nextTree = selectedNodeId && levelId
      ? updateNodeProgressLevel(result.tree, selectedNodeId, levelId, {
          scopeIds: nextScopeIds,
        })
      : result.tree

    commitDocument(nextTree)

    return {
      ok: true,
      error: null,
    }
  }

  const handleRenameScope = (scopeId, scopeLabel) => {
    const result = renameScopeWithResult(roadmapData, scopeId, scopeLabel)

    if (!result.ok) {
      return {
        ok: false,
        error: result.error,
      }
    }

    commitDocument(result.tree)

    return {
      ok: true,
      error: null,
    }
  }

  const handleSetScopeColor = (scopeId, color) => {
    const result = setScopeColorWithResult(roadmapData, scopeId, color)

    if (!result.ok) {
      return {
        ok: false,
        error: result.error,
      }
    }

    commitDocument(result.tree)

    return {
      ok: true,
      error: null,
    }
  }

  const handleDeleteScope = (scopeId) => {
    const result = deleteScopeWithResult(roadmapData, scopeId)

    if (!result.ok) {
      return {
        ok: false,
        error: result.error,
      }
    }

    commitDocument(result.tree)

    return {
      ok: true,
      error: null,
    }
  }

  const handleLevelAdditionalDependenciesChange = (levelId, nextTargetLevelIds) => {
    if (!selectedNodeId) return
    const nextDocument = setLevelAdditionalDependencies(roadmapData, selectedNodeId, levelId, nextTargetLevelIds)
    commitDocument(nextDocument)
  }

  const handleAddProgressLevel = () => {
    if (!selectedNodeId) {
      return
    }

    const nextDocument = addNodeProgressLevel(roadmapData, selectedNodeId)
    const nextNode = findNodeById(nextDocument, selectedNodeId)
    const nextLevelId = nextNode?.levels?.[nextNode.levels.length - 1]?.id ?? null

    commitDocument(nextDocument)
    setSelectedProgressLevelId(nextLevelId)
  }

  const handleDeleteProgressLevel = (levelId) => {
    if (!selectedNodeId) {
      return
    }

    commitDocument(removeNodeProgressLevel(roadmapData, selectedNodeId, levelId))
  }

  const handleEffortChange = (effort, levelId = activeSelectedProgressLevelId) => {
    if (!selectedNodeId && !(Array.isArray(selectedNodeIds) && selectedNodeIds.length > 0)) {
      return
    }

    applyToSelectedNodes((tree, id) => updateNodeProgressLevel(tree, id, levelId, { effort: normalizeEffort(effort) }))
  }

  const handleBenefitChange = (benefit, levelId = activeSelectedProgressLevelId) => {
    if (!selectedNodeId && !(Array.isArray(selectedNodeIds) && selectedNodeIds.length > 0)) {
      return
    }

    applyToSelectedNodes((tree, id) => updateNodeProgressLevel(tree, id, levelId, { benefit: normalizeBenefit(benefit) }))
  }

  const handleLevelChange = (newLevel) => {
    if (!selectedNodeId) {
      return
    }

    const validation = validateNodeLevelChange(roadmapData, selectedNodeId, newLevel, TREE_CONFIG)
    commitDocument(validation.isAllowed ? validation.tree : roadmapData)
  }

  const handleDeleteNodeOnly = () => {
    if ((!selectedNodeId && !(Array.isArray(selectedNodeIds) && selectedNodeIds.length > 0))) {
      return
    }

    applyToSelectedNodes((tree, id) => deleteNodeOnly(tree, id), { description: 'Delete node' })
    selectNodeId(null)
    setSelectedPortalKey(null)
  }

  const handleDeleteNodeBranch = () => {
    if ((!selectedNodeId && !(Array.isArray(selectedNodeIds) && selectedNodeIds.length > 0))) {
      return
    }

    applyToSelectedNodes((tree, id) => deleteNodeBranch(tree, id), { description: 'Delete branch' })
    selectNodeId(null)
    setSelectedPortalKey(null)
  }

  const handleSegmentLabelChange = (newLabel) => {
    if (!selectedSegmentId) {
      return
    }

    commitDocument(updateSegmentLabel(roadmapData, selectedSegmentId, newLabel))
  }

  const handleDeleteSegment = () => {
    if (!selectedSegmentId) {
      return
    }

    commitDocument(deleteSegment(roadmapData, selectedSegmentId))
    selectSegmentId(null)
    setSelectedPortalKey(null)
  }

  // Global toast state (listens for window events dispatched by child components)
  const [globalToast, setGlobalToast] = useState({ visible: false, message: '', type: 'info' })

  useEffect(() => {
    const handler = (event) => {
      try {
        const detail = event?.detail || {}
        setGlobalToast({ visible: true, message: detail.message || String(detail || ''), type: detail.type || 'info' })
        const id = window.setTimeout(() => setGlobalToast({ visible: false, message: '', type: 'info' }), 1600)
        return () => window.clearTimeout(id)
      } catch {
        // ignore
      }
    }

    window.addEventListener('roadmap-skilltree.toast', handler)
    return () => window.removeEventListener('roadmap-skilltree.toast', handler)
  }, [])

  useEffect(() => {
    const el = canvasAreaRef.current
    if (!el) return
    const onWheel = (e) => {
      if (!transformApiRef.current) return
      e.preventDefault()
      const { positionX, positionY, scale } = transformApiRef.current.state
      const { minScale, maxScale } = VIEWPORT_DEFAULTS
      // Step grows with sqrt(scale): slow when zoomed out, fast when zoomed in
      const adaptiveStep = 0.0018 * Math.sqrt(scale)
      const delta = Math.min(Math.abs(e.deltaY), 200)
      const direction = e.deltaY < 0 ? 1 : -1
      const ratio = Math.exp(adaptiveStep * delta * direction)
      const newScale = Math.max(minScale, Math.min(maxScale, scale * ratio))
      if (newScale === scale) return
      const rect = el.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      const newPositionX = cx - (cx - positionX) * (newScale / scale)
      const newPositionY = cy - (cy - positionY) * (newScale / scale)
      transformApiRef.current.setTransform(newPositionX, newPositionY, newScale, 80)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    const el = canvasAreaRef.current
    if (!el) return
    let lastRightClick = 0
    const onContextMenu = (e) => {
      e.preventDefault()
      const now = Date.now()
      if (now - lastRightClick < 400) {
        handleFitToScreen()
        lastRightClick = 0
      } else {
        lastRightClick = now
      }
    }
    el.addEventListener('contextmenu', onContextMenu)
    return () => el.removeEventListener('contextmenu', onContextMenu)
  }, [handleFitToScreen])

  return (
    <main className="skill-tree-shell">
      <input
        ref={documentFileInputRef}
        type="file"
        accept="text/html,.html"
        style={{ display: 'none' }}
        onChange={handleDocumentFileSelected}
      />

      <input
        ref={csvDocumentFileInputRef}
        type="file"
        accept="text/csv,.csv"
        style={{ display: 'none' }}
        onChange={handleCsvDocumentFileSelected}
      />

      <input
        ref={jsonDocumentFileInputRef}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={handleJsonDocumentFileSelected}
      />

      <Modal
        opened={csvImportDialogOpen}
        onClose={closeCsvImportDialog}
        title="CSV Import Options"
        centered
        size="lg"
        closeOnClickOutside={false}
        closeOnEscape={false}
        zIndex={1000}
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Select what to process during import.
          </Text>

          <Text size="sm" fw={600}>
            {pendingCsvImport?.fileName ?? 'CSV-Datei'}
          </Text>

          <Checkbox
            checked={csvImportOptions.processSegments}
            onChange={(event) => {
              const checked = event.currentTarget.checked
              setCsvImportOptions((current) => ({
                ...current,
                processSegments: checked,
              }))
            }}
            label="Process segments"
          />

          <Checkbox
            checked={csvImportOptions.processManualLevels}
            onChange={(event) => {
              const checked = event.currentTarget.checked
              setCsvImportOptions((current) => ({
                ...current,
                processManualLevels: checked,
              }))
            }}
            label="Process manual levels"
          />

          <Text size="xs" c="dimmed">
            If an option is disabled, that aspect will be ignored during import.
          </Text>

          <Group justify="flex-end">
            <Button variant="default" onClick={closeCsvImportDialog}>
              Cancel
            </Button>
            <Button onClick={handleConfirmCsvImport} disabled={!pendingCsvImport}>
              Import
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={exportLabelDialogOpen}
        onClose={cancelExportLabelDialog}
        title="Node label in export"
        size="sm"
      >
        <Stack gap="md">
          <Radio.Group
            value={exportLabelDialogMode}
            onChange={setExportLabelDialogMode}
            label="Choose zoom level for export"
          >
            <Stack gap="xs" mt="xs">
              <Radio value="far" label="Far – abbreviation only (abc)" />
              <Radio value="mid" label="Normal – name + abbreviation" />
              <Radio value="close" label="Close – name + abbreviation + release note" />
            </Stack>
          </Radio.Group>
          <Group justify="flex-end">
            <Button variant="default" onClick={cancelExportLabelDialog}>
              Cancel
            </Button>
            <Button onClick={confirmExportLabelDialog}>
              Export
            </Button>
          </Group>
        </Stack>
      </Modal>

      {globalToast.visible && (
        <div style={{ position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 9999 }}>
          <Alert color={globalToast.type === 'warning' ? 'yellow' : globalToast.type === 'success' ? 'teal' : 'blue'}>
            {globalToast.message}
          </Alert>
        </div>
      )}

      <SkillTreeToolbar
        isCollapsed={isToolbarCollapsed}
        onToggleCollapsed={() => {
          setIsToolbarCollapsed((prev) => !prev)
        }}
        onOpenDocumentPicker={handleOpenDocumentPicker}
        onOpenCsvDocumentPicker={handleOpenCsvDocumentPicker}
        onOpenJsonDocumentPicker={handleOpenJsonDocumentPicker}
        onExportHtml={() => void handleExportHtml()}
        onExportCsv={handleExportCsv}
        onExportJson={handleExportJson}
        onExportPdf={() => void handleExportPdf()}
        onExportSvg={() => void handleExportSvg()}
        onExportPng={() => void handleExportPng()}
        onExportCleanSvg={() => void handleExportCleanSvg()}
        onUndo={handleUndo}
        canUndo={canUndo}
        onRedo={handleRedo}
        canRedo={canRedo}
        onReset={handleReset}
        onOpenSegmentManager={handleOpenSegmentManager}
        onOpenScopeManager={handleOpenScopeManager}
        onOpenPriorityMatrix={() => {
          setPriorityMatrixOpen((v) => !v)
          setListViewOpen(false)
        }}
        onOpenListView={() => {
          setListViewOpen((v) => !v)
          setPriorityMatrixOpen(false)
        }}
        releaseFilter={releaseFilter}
        setReleaseFilter={setReleaseFilter}
        selectedReleaseFilterLabel={selectedReleaseFilterLabel}
        selectedScopeFilterId={selectedScopeFilterId}
        setSelectedScopeFilterId={setSelectedScopeFilterId}
        selectedScopeFilterLabel={selectedScopeFilterLabel}
        scopeOptions={scopeOptions}
        autosaveLabel={autosaveLabel}
        allNodesById={allNodesById}
        onSelectNode={handleSelectNode}
        currentZoomScale={currentZoomScale}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomToScale={handleZoomToScale}
        onFitToScreen={handleFitToScreen}
        hiddenNodeCount={hiddenNodeIdSet.size}
        showHiddenNodes={roadmapData.showHiddenNodes ?? false}
        onToggleShowHiddenNodes={handleToggleShowHiddenNodes}
        releases={roadmapData.releases ?? []}
        selectedReleaseId={activeReleaseId}
        onReleaseChange={setSelectedReleaseId}
      />

      <div ref={canvasAreaRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <TransformWrapper
        key={transformKey}
        minScale={VIEWPORT_DEFAULTS.minScale}
        maxScale={VIEWPORT_DEFAULTS.maxScale}
        initialScale={initialViewScale}
        initialPositionX={initialPositionX}
        initialPositionY={initialPositionY}
        wheel={{ disabled: true }}
        limitToBounds={false}
        centerOnInit={false}
        onInit={(api) => {
          transformApiRef.current = api
          setCurrentZoomScale(api.state.scale)
        }}
        onTransformed={(_ref, state) => {
          setCurrentZoomScale(state.scale)
        }}
      >
        <TransformComponent
          wrapperClass="skill-tree-transform-wrapper"
          wrapperStyle={{ cursor: isPanModeActive ? 'grabbing' : 'grab' }}
          contentClass="skill-tree-transform-content"
        >
          <SkillTreeCanvas
            canvasRef={canvasSvgRef}
            canvas={canvas}
            centerIconSource={centerIconSource}
            centerIconSize={centerIconSize}
            filteredSegmentSeparators={filteredSegmentSeparators}
            filteredSegmentLabels={filteredSegmentLabels}
            filteredLinks={filteredLinks}
            layoutNodesById={layoutNodesById}
            renderedNodes={renderedNodes}
            nodeVisibilityModeById={nodeVisibilityModeById}
            selectedNodeId={selectedNodeId}
            selectedNodeIds={selectedNodeIds}
            selectedSegmentId={selectedSegmentId}
            selectedPortalKey={selectedPortalKey}
            visibleDependencyPortals={visibleDependencyPortals}
            visibleDependencyLines={visibleDependencyLines}
            depSummaryByNodeId={depSummaryByNodeId}
            selectedLayoutNode={selectedLayoutNode}
            selectedControlGeometry={selectedControlGeometry}
            selectedSegmentLabel={selectedSegmentLabel}
            selectedSegmentControlGeometry={selectedSegmentControlGeometry}
            emptyStateAddControl={emptyStateAddControl}
            emptySegmentAddControl={emptySegmentAddControl}
            nodeSize={TREE_CONFIG.nodeSize}
            minimalNodeSize={MINIMAL_NODE_SIZE}
            labelMode={activeLabelMode}
            currentZoomScale={currentZoomScale}
            scopeOptions={scopeOptions}
            onCanvasClick={() => {
              selectNodeId(null)
              selectSegmentId(null)
              setSelectedPortalKey(null)
            }}
            onOpenCenterIconPanel={handleOpenCenterIconPanel}
            onSelectSegment={handleSelectSegment}
            onSelectPortal={handleSelectPortal}
            onAddInitialRoot={handleAddInitialRoot}
            onAddInitialSegment={handleAddInitialSegment}
            onAddRootNear={handleAddRootNear}
            onAddSegmentNear={handleAddSegmentNear}
            onAddChild={handleAddChild}
            onSelectNode={handleSelectNode}
            onZoomToNode={handleZoomToNode}
            storyPointMap={roadmapData.storyPointMap}
            releaseId={activeReleaseId}
          />
        </TransformComponent>
      </TransformWrapper>
      </div>

      {rightPanel === PANEL_INSPECTOR && (
        <InspectorPanel
        selectedNode={resolveInspectorSelectedNode(selectedNode, selectedNodeIds)}
        selectedNodeIds={selectedNodeIds}
        roadmapData={roadmapData}
        currentLevel={levelInfo.nodeLevel}
        selectedProgressLevelId={activeSelectedProgressLevelId}
        onClose={() => {
          selectNodeId(null)
        }}
        onFocusNode={selectNodeId}
        onLabelChange={handleLabelChange}
        onShortNameChange={handleShortNameChange}
        onStatusChange={handleStatusChange}
        onReleaseNoteChange={handleReleaseNoteChange}
        onLevelLabelChange={handleLevelLabelChange}
        onScopeIdsChange={handleLevelScopesChange}
        scopeOptions={scopeOptions}
        onCreateScope={handleCreateScope}
        onRenameScope={handleRenameScope}
        onDeleteScope={handleDeleteScope}
        onSetScopeColor={handleSetScopeColor}
        onCreateSegment={handleCreateSegmentForInspector}
        onRenameSegment={handleRenameSegmentForManager}
        onDeleteSegment={handleDeleteSegmentForManager}
        onSelectProgressLevel={setSelectedProgressLevelId}
        onAddProgressLevel={handleAddProgressLevel}
        onDeleteProgressLevel={handleDeleteProgressLevel}
        onLevelChange={handleLevelChange}
        levelOptions={selectedNodeLevelOptions}
        segmentOptions={selectedNodeSegmentOptions}
        parentOptions={selectedNodeParentOptions}
        selectedParentId={selectedNodeParentId}
        levelDependencyOptions={selectedNodeLevelDependencyOptions}
        incomingDependencyLabels={selectedNodeIncomingDependencyLabels}
        dependencyRequires={selectedNodeDependencySummary.requires}
        dependencyEnables={selectedNodeDependencySummary.enables}
        validationMessage={selectedNodeValidationMessage}
        onParentChange={(nextParentKey) => {
          if (!selectedNodeId && !(Array.isArray(selectedNodeIds) && selectedNodeIds.length > 0)) {
            return
          }

          const nextParentId = nextParentKey === '__root__' ? null : nextParentKey
          applyToSelectedNodes((tree, id) => moveNodeToParent(tree, id, nextParentId))
        }}
        onSegmentChange={(nextSegmentKey) => {
          if (!selectedNodeId && !(Array.isArray(selectedNodeIds) && selectedNodeIds.length > 0)) {
            return
          }

          const nextSegmentId = nextSegmentKey === UNASSIGNED_SEGMENT_ID ? null : nextSegmentKey

          applyToSelectedNodes((tree, id) => {
            const validation = validateNodeSegmentChange(tree, id, nextSegmentId, TREE_CONFIG)
            return validation.tree
          })
        }}
        onLevelAdditionalDependenciesChange={handleLevelAdditionalDependenciesChange}
        onDeleteNodeOnly={handleDeleteNodeOnly}
        onDeleteNodeBranch={handleDeleteNodeBranch}
        onEffortChange={handleEffortChange}
        onBenefitChange={handleBenefitChange}
        selectedReleaseId={activeReleaseId}
        />
      )}

      {rightPanel === PANEL_SCOPES && (
        <ToolbarScopeManager
          scopeOptions={scopeOptions}
          onCreateScope={handleCreateScope}
          onRenameScope={handleRenameScope}
          onDeleteScope={handleDeleteScope}
          onSetScopeColor={handleSetScopeColor}
          onClose={handleCloseScopeManager}
        />
      )}

      {rightPanel === PANEL_SEGMENTS && (
        <ToolbarSegmentManager
          segmentOptions={roadmapData.segments ?? []}
          onCreateSegment={handleCreateSegmentForManager}
          onRenameSegment={handleRenameSegmentForManager}
          onDeleteSegment={handleDeleteSegmentForManager}
          onClose={handleCloseSegmentManager}
        />
      )}

      <SegmentPanel
        selectedSegment={selectedSegment}
        segmentOptions={roadmapData.segments ?? []}
        isOpen={rightPanel === PANEL_SEGMENTS}
        onClose={() => selectSegmentId(null)}
        onLabelChange={handleSegmentLabelChange}
        onDelete={handleDeleteSegment}
        onCreateSegment={handleCreateSegmentForManager}
        onRenameSegment={handleRenameSegmentForManager}
        onDeleteSegment={handleDeleteSegmentForManager}
      />

      <SystemPanel
        isOpen={rightPanel === PANEL_CENTER}
        iconSource={centerIconSource}
        onClose={() => { if (rightPanel === PANEL_CENTER) setRightPanel(null) }}
        onUpload={handleCenterIconUpload}
        onResetDefault={handleResetCenterIcon}
        roadmapData={roadmapData}
        commitDocument={commitDocument}
        selectedReleaseId={activeReleaseId}
        onReleaseChange={setSelectedReleaseId}
      />

      <PriorityMatrix
        opened={priorityMatrixOpen}
        onClose={() => setPriorityMatrixOpen(false)}
        document={roadmapData}
      />

      <ListViewDrawer
        opened={listViewOpen}
        onClose={() => setListViewOpen(false)}
        document={roadmapData}
        onSelectNode={handleSelectNodeFromListView}
        onSelectLevel={handleSelectLevelFromListView}
      />
    </main>
  )
}
