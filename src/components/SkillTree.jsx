import { Alert, Button, Checkbox, Group, Modal, Radio, Stack, Text } from '@mantine/core'
import { Fragment, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch'
import './styles/skillTree.base.css'
import './styles/skillTree.nodes.css'
import './styles/skillTree.list-view.css'
import './styles/skillTree.priority-matrix.css'
import './styles/skillTree.layout.css'
import './styles/skillTree.legend.css'
import './styles/skillTree.status-summary.css'
import { DEFAULT_STATUS_DESCRIPTIONS, TREE_CONFIG, STATUS_LABELS } from './config'
import { renderLegendMarkup, LEGEND_STATUS_ORDER } from './utils/LegendShared'
import { getNodeLabelMode } from './utils/nodePresentation'
import { computeCenterIconSize } from './utils/centerIconPresentation'
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
import { SystemPanel, InspectorPanel, SegmentPanel, ReleaseNotesPanel, StatusSummaryPanel, ToolbarScopeManager } from './panels'
import { PriorityMatrix } from './panels/PriorityMatrix'
import { ListViewDrawer } from './panels/ListViewDrawer'
import { solveSkillTreeLayout } from './utils/layoutSolver'
import { UNASSIGNED_SEGMENT_ID } from './utils/layoutShared'
import { getSkillTreeShortcutAction } from './utils/keyboardShortcuts'
import {
  togglePanel,
  PANEL_INSPECTOR,
  PANEL_CENTER,
  PANEL_SCOPES,
  PANEL_SEGMENTS,
  PANEL_RELEASE_NOTES,
  PANEL_STATUS_SUMMARY,
} from './utils/panelsState'
import { getVisibleLevelStatusKeys } from './utils/nodeStatus'
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
  moveNodeToParent,
  renameScopeGroupWithResult,
  renameScopeWithResult,
  removeNodeProgressLevel,
  reorderNodeProgressLevels,
  reorderScopesWithResult,
  setLevelAdditionalDependencies,
  updateNodeData as updateNodeDataInTree,
  updateNodeEffort,
  updateNodeBenefit,
  updateNodeProgressLevel,
  updateNodeShortName,
  updateSegmentLabel,
} from './utils/treeData'
import {
  DEFAULT_STORY_POINT_MAP,
  computeStatusBudgetSummaries,
  normalizeEffort,
  normalizeBenefit,
  normalizeFeatureStatuses,
} from './utils/effortBenefit'
import { applyInspectorIdentityChange } from './utils/inspectorCommit'
import { toDegrees, toRadians } from './utils/layoutMath'
import { SkillTreeCanvas } from './canvas'
import { SkillTreeToolbar } from './toolbar'

import { useSkillTreeUiState } from '../hooks/useSkillTreeUiState'
import { uniqueArray } from './utils/array'
import { pickPortalSlotAngle } from './utils/portalPlacement'
import { downloadDocumentCsv, readDocumentFromCsvText } from './utils/csv'
import { isEditableElement } from './utils/dom'
import { buildExportFileName } from './utils/exportFileName'
import { getCsvExportErrorMessage, getCsvImportErrorMessage, getHtmlImportErrorMessage, confirmCopyScopesToNewLevel, confirmResetDocument } from './utils/messages'
import { readFileAsText, readFileAsDataUrl, isValidSvgMarkup } from './utils/file'
import {
  RELEASE_FILTER_LABELS,
  SCOPE_FILTER_ALL,
  getReleaseVisibilityModeForStatuses,
  hasActiveStatusFilterModes,
  nodeMatchesScopeFilter,
  normalizeStatusFilterModeMap,
  normalizeScopeFilterIds,
} from './utils/visibility'
import { VIEWPORT_DEFAULTS, computeFitScale, computeFitTransform, computeCenterTransform, getNextZoomStep, getViewportKeyboardAction } from './utils/viewport'
import { getInitialRoadmapDocument } from './utils/document'
import { getSelectedReleaseId } from './utils/releases'
import { resolveInspectorSelectedNode } from './utils/selection'
import { LEGEND_DENSITY_MODES, resolveLegendDensity } from './utils/legendDensity'
import { DEFAULT_STATUS_SUMMARY_SETTINGS, normalizeStatusSummarySettings, STATUS_SUMMARY_SORT_OPTIONS } from './utils/statusSummary'
import { resolveStatusStyles } from './utils/statusStyles'

// `resolveInspectorSelectedNode` is exported from `src/components/utils/selection.js`
// Tests/importers should import from that module instead of re-exporting from here.

const AUTOSAVE_DEBOUNCE_MS = 450
const MINIMAL_NODE_SIZE = 36
const MATRIX_SELECTION_ZOOM_SCALE = 4
const LEFT_SIDEBAR_MIN_WIDTH = 320
const LEFT_SIDEBAR_DEFAULT_WIDTH = 460
const RIGHT_SIDEBAR_MIN_WIDTH = 340
const RIGHT_SIDEBAR_DEFAULT_WIDTH = 420
const MIN_STAGE_WIDTH = 360
const BULK_APPLY_CONFIRM_STORAGE_KEY = 'roadmap-skilltree.bulk-apply-confirm.dismissed'

const getPortalCounterpartNodeId = (portal) => {
  if (!portal) return null
  if (portal.nodeId === portal.sourceId) return portal.targetId
  if (portal.nodeId === portal.targetId) return portal.sourceId
  return portal.type === 'source' ? portal.targetId : portal.sourceId
}
const MAX_SEGMENT_LABEL_CHARS_PER_LINE = 15
const CENTER_LABEL_GAP_PX = 12
const LABEL_LEVEL_ONE_GAP_PX = 14
const DEFAULT_CSV_IMPORT_PROCESS_OPTIONS = {
  processSegments: true,
  processManualLevels: true,
}
const DIRECT_IMPORT_ACCEPT = 'text/html,.html,text/csv,.csv,application/json,.json'


const collectAllNodes = (document) => {
  const all = []
  const queue = [...(document?.children ?? [])]

  while (queue.length > 0) {
    const node = queue.shift()
    all.push(node)
    queue.push(...(node.children ?? []))
  }

  return all
}

const collectVisibleNodeTree = (nodes, visibleNodeIds) => {
  const sourceNodes = Array.isArray(nodes) ? nodes : []

  const visit = (node) => {
    if (!node || typeof node !== 'object') {
      return []
    }

    const nextChildren = (Array.isArray(node.children) ? node.children : []).flatMap(visit)

    if (visibleNodeIds.has(node.id)) {
      return [{
        ...node,
        children: nextChildren,
      }]
    }

    // Promote visible descendants when a filtered parent is hidden.
    return nextChildren
  }

  return sourceNodes.flatMap(visit)
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
  const importFileInputRef = useRef(null)
  const documentFileInputRef = useRef(null)
  const csvDocumentFileInputRef = useRef(null)
  const jsonDocumentFileInputRef = useRef(null)
  const canvasSvgRef = useRef(null)
  const transformApiRef = useRef(null)
  const canvasAreaRef = useRef(null)
  const shellRef = useRef(null)
  const leftSidebarRef = useRef(null)
  const rightSidebarRef = useRef(null)
  const legendRef = useRef(null)
  const leftSidebarWidthRef = useRef(LEFT_SIDEBAR_DEFAULT_WIDTH)
  const rightSidebarWidthRef = useRef(RIGHT_SIDEBAR_DEFAULT_WIDTH)
  const resizeFrameRef = useRef(null)
  const lastCanvasViewportRef = useRef(null)
  const systemPanelRef = useRef(null)
  const lastRightClickRef = useRef(0)
  const [isPanModeActive, setIsPanModeActive] = useState(false)
  const [currentZoomScale, setCurrentZoomScale] = useState(1)
  const [exportLabelModeOverride, setExportLabelModeOverride] = useState(null)
  const [exportLabelDialogOpen, setExportLabelDialogOpen] = useState(false)
  const [exportLabelDialogKind, setExportLabelDialogKind] = useState('visual')
  const [exportLabelDialogMode, setExportLabelDialogMode] = useState('mid')
  const [exportTreeStatuses, setExportTreeStatuses] = useState(() => normalizeFeatureStatuses({
    done: true,
    now: true,
    next: true,
    later: true,
    someday: true,
  }))
  const [exportReleaseNoteStatuses, setExportReleaseNoteStatuses] = useState(() => normalizeFeatureStatuses(null))
  const [exportStatusSummarySortMode, setExportStatusSummarySortMode] = useState(DEFAULT_STATUS_SUMMARY_SETTINGS.sortMode)
  const [includePriorityMatrixInExport, setIncludePriorityMatrixInExport] = useState(false)
  const exportLabelDialogResolveRef = useRef(null)
  const [lastSavedAt, setLastSavedAt] = useState(null)
  const [csvImportDialogOpen, setCsvImportDialogOpen] = useState(false)
  const [csvImportOptions, setCsvImportOptions] = useState(DEFAULT_CSV_IMPORT_PROCESS_OPTIONS)
  const [pendingCsvImport, setPendingCsvImport] = useState(null)
  const [priorityMatrixOpen, setPriorityMatrixOpen] = useState(false)
  const [listViewOpen, setListViewOpen] = useState(false)
  const [draftRelease, setDraftRelease] = useState(null)
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(LEFT_SIDEBAR_DEFAULT_WIDTH)
  const [rightSidebarWidth, setRightSidebarWidth] = useState(RIGHT_SIDEBAR_DEFAULT_WIDTH)
  const [, setLegendDensity] = useState(LEGEND_DENSITY_MODES.full)
  const bulkApplyActionRef = useRef(null)
  const [bulkApplyConfirmState, setBulkApplyConfirmState] = useState({
    opened: false,
    message: '',
    rememberChoice: false,
  })

  const {
    selectedNodeId,
    setSelectedNodeId,
    selectedNodeIds,
    setSelectedNodeIds,
    selectedLevelKeys,
    setSelectedLevelKeys,
    selectedProgressLevelId,
    setSelectedProgressLevelId,
    selectedSegmentId,
    _setSelectedSegmentId,
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
    transformKey,
    setTransformKey,
    selectNodeId,
    selectSegmentId,
    resetSelections,
    selectedReleaseId,
    setSelectedReleaseId,
  } = useSkillTreeUiState()

  const statusFilterModeByKey = useMemo(
    () => normalizeStatusFilterModeMap(releaseFilter),
    [releaseFilter],
  )

  const hasActiveStatusFilters = useMemo(
    () => hasActiveStatusFilterModes(statusFilterModeByKey),
    [statusFilterModeByKey],
  )

  const selectedScopeFilterIds = useMemo(
    () => normalizeScopeFilterIds(selectedScopeFilterId),
    [selectedScopeFilterId],
  )

  const hasActiveLayoutFilters = hasActiveStatusFilters || selectedScopeFilterIds.length > 0

  const getCanvasViewportMetrics = useCallback(() => {
    const rect = canvasAreaRef.current?.getBoundingClientRect()
    if (rect && rect.width > 0 && rect.height > 0) {
      return { width: rect.width, height: rect.height }
    }

    if (typeof window !== 'undefined') {
      return { width: window.innerWidth, height: window.innerHeight }
    }

    return { width: 0, height: 0 }
  }, [])

  const handleSidebarResizeStart = useCallback((side) => (event) => {
    event.preventDefault()
    const startX = event.clientX
    const widthRef = side === 'left' ? leftSidebarWidthRef : rightSidebarWidthRef
    const targetRef = side === 'left' ? leftSidebarRef : rightSidebarRef
    const startWidth = widthRef.current

    const applyWidth = () => {
      resizeFrameRef.current = null
      if (targetRef.current) {
        targetRef.current.style.width = `${widthRef.current}px`
      }
    }

    const onMove = (moveEvent) => {
      const delta = moveEvent.clientX - startX
      const totalWidth = shellRef.current?.getBoundingClientRect().width ?? (typeof window !== 'undefined' ? window.innerWidth : 0)
      const otherWidth = side === 'left'
        ? (rightPanel != null || selectedSegmentId || isReleaseNotesPanelOpen ? rightSidebarWidthRef.current : 0)
        : (listViewOpen || priorityMatrixOpen ? leftSidebarWidthRef.current : 0)
      const minWidth = side === 'left' ? LEFT_SIDEBAR_MIN_WIDTH : RIGHT_SIDEBAR_MIN_WIDTH
      const signedDelta = side === 'left' ? delta : -delta
      const maxWidth = Math.max(minWidth, totalWidth - otherWidth - MIN_STAGE_WIDTH)
      widthRef.current = Math.max(minWidth, Math.min(maxWidth, startWidth + signedDelta))

      if (!resizeFrameRef.current) {
        resizeFrameRef.current = window.requestAnimationFrame(applyWidth)
      }
    }

    const onUp = () => {
      if (resizeFrameRef.current) {
        window.cancelAnimationFrame(resizeFrameRef.current)
        applyWidth()
      }

      if (side === 'left') {
        setLeftSidebarWidth(widthRef.current)
      } else {
        setRightSidebarWidth(widthRef.current)
      }

      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [listViewOpen, priorityMatrixOpen, rightPanel, selectedSegmentId])

  const addControlOffset = TREE_CONFIG.nodeSize * 0.82

  const { layout: fullLayout, diagnostics } = useMemo(
    () => solveSkillTreeLayout(roadmapData, TREE_CONFIG),
    [roadmapData],
  )
  const {
    nodes: fullNodes,
    canvas: fullCanvas,
  } = fullLayout
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : fullCanvas.width
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : fullCanvas.height
  const initialViewScale = useMemo(() => {
    if (!fullCanvas.width || !fullCanvas.height || !viewportWidth || !viewportHeight) {
      return 0.7
    }

    return computeFitScale({
      contentWidth: fullCanvas.width,
      contentHeight: fullCanvas.height,
      viewportWidth,
      viewportHeight,
      minScale: VIEWPORT_DEFAULTS.minScale,
      maxScale: VIEWPORT_DEFAULTS.maxScale,
    })
  }, [fullCanvas.height, fullCanvas.width, viewportHeight, viewportWidth])
  const initialPositionX = viewportWidth / 2 - fullCanvas.origin.x * initialViewScale
  const initialPositionY = viewportHeight / 2 - fullCanvas.origin.y * initialViewScale

  // Responsive label mode: derived from live zoom scale (or overridden for exports)
  const zoomLabelMode = useMemo(() => getNodeLabelMode(currentZoomScale), [currentZoomScale])
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

  const hasSegmentLabels = useMemo(() => {
    return (roadmapData?.segments ?? []).some((segment) => String(segment?.label ?? '').trim().length > 0)
  }, [roadmapData?.segments])

  const centerIconSize = useMemo(() => computeCenterIconSize({
    nodes: fullNodes,
    maxEstimatedSegmentLabelHeightPx,
    labelLevelOneGapPx: LABEL_LEVEL_ONE_GAP_PX,
    centerLabelGapPx: CENTER_LABEL_GAP_PX,
    hasSegmentLabels,
  }), [hasSegmentLabels, maxEstimatedSegmentLabelHeightPx, fullNodes])

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

  const selectedNode = useMemo(
    () => (selectedNodeId ? allNodesById.get(selectedNodeId) ?? null : null),
    [allNodesById, selectedNodeId],
  )

  const [isInspectorHeavyDataReady, setIsInspectorHeavyDataReady] = useState(false)

  useEffect(() => {
    if (rightPanel !== PANEL_INSPECTOR || !selectedNodeId) {
      setIsInspectorHeavyDataReady(false)
      return
    }

    setIsInspectorHeavyDataReady(false)
    const rafId = window.requestAnimationFrame(() => {
      setIsInspectorHeavyDataReady(true)
    })

    return () => {
      window.cancelAnimationFrame(rafId)
    }
  }, [rightPanel, selectedNodeId])

  // Use exported helper above to decide inspector node resolution.

  const selectedSegment = useMemo(
    () => (roadmapData.segments ?? []).find((segment) => segment.id === selectedSegmentId) ?? null,
    [roadmapData.segments, selectedSegmentId],
  )

  const isLeftSidebarVisible = listViewOpen || priorityMatrixOpen
  const releaseNotesPanelVisible = isReleaseNotesPanelOpen || rightPanel === PANEL_RELEASE_NOTES
  const isRightSidebarVisible = Boolean(selectedSegment)
    || rightPanel === PANEL_INSPECTOR
    || rightPanel === PANEL_CENTER
    || rightPanel === PANEL_SCOPES
    || rightPanel === PANEL_SEGMENTS
    || rightPanel === PANEL_STATUS_SUMMARY
    || releaseNotesPanelVisible

  useEffect(() => {
    leftSidebarWidthRef.current = leftSidebarWidth
    if (leftSidebarRef.current) {
      leftSidebarRef.current.style.width = `${leftSidebarWidth}px`
    }
  }, [leftSidebarWidth])

  useEffect(() => {
    rightSidebarWidthRef.current = rightSidebarWidth
    if (rightSidebarRef.current) {
      rightSidebarRef.current.style.width = `${rightSidebarWidth}px`
    }
  }, [rightSidebarWidth])

  useEffect(() => {
    if (!isLegendVisible) {
      setLegendDensity(LEGEND_DENSITY_MODES.full)
      return undefined
    }

    if (typeof ResizeObserver === 'undefined' || typeof window === 'undefined' || !legendRef.current) {
      return undefined
    }

    const legendWrapper = legendRef.current
    let frameId = null

    const syncLegendDensity = () => {
      frameId = null

      if (!legendRef.current) {
        return
      }

      const legendSurface = legendRef.current.querySelector('.skill-tree-legend')
      if (!legendSurface) {
        return
      }

      const availableWidth = legendWrapper.clientWidth
      if (!availableWidth) {
        return
      }

      const measureWidthForMode = (mode) => {
        legendSurface.dataset.legendDensity = mode
        return legendSurface.scrollWidth
      }

      const nextDensity = resolveLegendDensity({
        availableWidth,
        fullWidth: measureWidthForMode(LEGEND_DENSITY_MODES.full),
        compactWidth: measureWidthForMode(LEGEND_DENSITY_MODES.compact),
        portalLessWidth: measureWidthForMode(LEGEND_DENSITY_MODES.noPortals),
        iconOnlyWidth: measureWidthForMode(LEGEND_DENSITY_MODES.iconsOnly),
      })

      legendSurface.dataset.legendDensity = nextDensity
      setLegendDensity((current) => (current === nextDensity ? current : nextDensity))
    }

    syncLegendDensity()

    const observer = new ResizeObserver(() => {
      if (!frameId) {
        frameId = window.requestAnimationFrame(syncLegendDensity)
      }
    })
    observer.observe(legendWrapper)

    if (legendWrapper.parentElement) {
      observer.observe(legendWrapper.parentElement)
    }

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId)
      }
      observer.disconnect()
    }
  }, [isLegendVisible, roadmapData?.statusDescriptions, roadmapData?.statusStyles])

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined' || !canvasAreaRef.current) {
      return undefined
    }

    let frameId = null

    const syncViewportCenter = () => {
      frameId = null
      const rect = canvasAreaRef.current?.getBoundingClientRect()
      if (!rect) {
        return
      }

      const previous = lastCanvasViewportRef.current
      lastCanvasViewportRef.current = { width: rect.width, height: rect.height }

      if (!previous || !transformApiRef.current) {
        return
      }

      const dx = (rect.width - previous.width) / 2
      const dy = (rect.height - previous.height) / 2
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
        return
      }

      const { positionX, positionY, scale } = transformApiRef.current.state
      transformApiRef.current.setTransform(positionX + dx, positionY + dy, scale, 0)
    }

    syncViewportCenter()

    const observer = new ResizeObserver(() => {
      if (!frameId) {
        frameId = window.requestAnimationFrame(syncViewportCenter)
      }
    })
    observer.observe(canvasAreaRef.current)

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId)
      }
      observer.disconnect()
    }
  }, [transformKey])

  useEffect(() => {
    const totalWidth = shellRef.current?.getBoundingClientRect().width ?? (typeof window !== 'undefined' ? window.innerWidth : 0)

    if (isLeftSidebarVisible) {
      const maxLeftWidth = Math.max(
        LEFT_SIDEBAR_MIN_WIDTH,
        totalWidth - (isRightSidebarVisible ? rightSidebarWidth : 0) - MIN_STAGE_WIDTH,
      )
      if (leftSidebarWidth > maxLeftWidth) {
        setLeftSidebarWidth(maxLeftWidth)
      }
    }

    if (isRightSidebarVisible) {
      const maxRightWidth = Math.max(
        RIGHT_SIDEBAR_MIN_WIDTH,
        totalWidth - (isLeftSidebarVisible ? leftSidebarWidth : 0) - MIN_STAGE_WIDTH,
      )
      if (rightSidebarWidth > maxRightWidth) {
        setRightSidebarWidth(maxRightWidth)
      }
    }
  }, [isLeftSidebarVisible, isRightSidebarVisible, leftSidebarWidth, rightSidebarWidth])

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
        hasOpenPoints: false,
        scopeIds: [],
      },
    ]
  }, [selectedNode])

  const activeSelectedProgressLevelId = useMemo(() => {
    if (!selectedNode) {
      return null
    }

    const stillExists = selectedNodeLevels.some((entry) => entry.id === selectedProgressLevelId)

    return stillExists ? selectedProgressLevelId : null
  }, [selectedNode, selectedNodeLevels, selectedProgressLevelId])

  const activeSelectedProgressLevel = useMemo(
    () => selectedNodeLevels.find((entry) => entry.id === activeSelectedProgressLevelId) ?? null,
    [activeSelectedProgressLevelId, selectedNodeLevels],
  )

  const scopeOptions = useMemo(() => {
    const groupLabelByKey = new Map(
      (roadmapData.scopeGroups ?? []).map((group) => [group.color ?? '__none__', group.label ?? null]),
    )

    return (roadmapData.scopes ?? []).map((scope) => ({
      value: scope.id,
      label: scope.label,
      color: scope.color ?? null,
      groupLabel: groupLabelByKey.get(scope.color ?? '__none__') ?? null,
    }))
  }, [roadmapData.scopeGroups, roadmapData.scopes])

  useEffect(() => {
    if (selectedScopeFilterIds.length === 0) {
      return
    }

    const validScopeIds = selectedScopeFilterIds.filter((scopeId) => scopeOptions.some((scope) => scope.value === scopeId))

    if (validScopeIds.length !== selectedScopeFilterIds.length) {
      setSelectedScopeFilterId(validScopeIds.length > 0 ? validScopeIds : SCOPE_FILTER_ALL)
    }
  }, [scopeOptions, selectedScopeFilterIds, setSelectedScopeFilterId])

  const activeReleaseId = useMemo(
    () => getSelectedReleaseId(roadmapData.releases ?? [], selectedReleaseId),
    [roadmapData.releases, selectedReleaseId],
  )

  const activeRelease = useMemo(
    () => (roadmapData.releases ?? []).find((release) => release.id === activeReleaseId) ?? null,
    [roadmapData.releases, activeReleaseId],
  )

  const activeStatusBudgetSummaries = useMemo(() => {
    if (!activeRelease) {
      return {}
    }

    const allNodes = collectAllNodes(roadmapData)
    const storyPointMap = roadmapData.storyPointMap ?? DEFAULT_STORY_POINT_MAP
    return computeStatusBudgetSummaries(allNodes, storyPointMap, activeRelease.statusBudgets ?? null, activeRelease.id)
  }, [activeRelease, roadmapData])

  const activeStatusBudgetEntries = useMemo(
    () => LEGEND_STATUS_ORDER.map((statusKey) => ({
      statusKey,
      ...(activeStatusBudgetSummaries[statusKey] ?? {
        total: 0,
        budget: null,
        isOverBudget: false,
        utilization: null,
      }),
    })).filter((entry) => entry.statusKey !== 'done' && entry.total > 0),
    [activeStatusBudgetSummaries],
  )

  const hasBudgetAlert = activeStatusBudgetEntries.some((entry) => entry.isOverBudget)

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


  const legendStatusDescriptions = useMemo(
    () => ({
      ...DEFAULT_STATUS_DESCRIPTIONS,
      ...(roadmapData?.statusDescriptions ?? {}),
    }),
    [roadmapData?.statusDescriptions],
  )

  const resolvedStatusStyles = useMemo(
    () => resolveStatusStyles(roadmapData?.statusStyles ?? {}),
    [roadmapData?.statusStyles],
  )

  // Render the legend using the shared markup
  const legendFooter = isLegendVisible && (
    <div className="skill-tree-legend-footer">
      <aside
        ref={legendRef}
        className="skill-tree-legend-wrapper"
        aria-label="Status legend"
        dangerouslySetInnerHTML={{
          __html: renderLegendMarkup({ legendStatusDescriptions, showPortals: true, statusStyles: resolvedStatusStyles }),
        }}
      />
      {isBudgetOverviewVisible && activeRelease && activeStatusBudgetEntries.length > 0 && (
        <div className="skill-tree-budget-overview" aria-label="Budget overview">
          <div className="skill-tree-budget-overview__grid">
            {activeStatusBudgetEntries.map((entry) => {
              const accent = resolvedStatusStyles[entry.statusKey]?.ringBand ?? '#94a3b8'
              const budgetStateClass = entry.budget == null
                ? ''
                : entry.isOverBudget
                  ? ' skill-tree-budget-overview__card--over'
                  : (entry.utilization ?? 0) >= 80
                    ? ' skill-tree-budget-overview__card--warn'
                    : ' skill-tree-budget-overview__card--good'
              const cardClassName = entry.budget != null
                ? `skill-tree-budget-overview__card skill-tree-budget-overview__card--budgeted${budgetStateClass}`
                : 'skill-tree-budget-overview__card'
              const valueClassName = entry.budget == null
                ? 'skill-tree-budget-overview__value'
                : entry.isOverBudget
                  ? 'skill-tree-budget-overview__value skill-tree-budget-overview__value--over'
                  : (entry.utilization ?? 0) >= 80
                    ? 'skill-tree-budget-overview__value skill-tree-budget-overview__value--warn'
                    : 'skill-tree-budget-overview__value skill-tree-budget-overview__value--good'

              return (
                <div
                  key={entry.statusKey}
                  className={cardClassName}
                  style={{ '--budget-accent': accent }}
                >
                  <div className="skill-tree-budget-overview__label">{STATUS_LABELS[entry.statusKey]}</div>
                  <div className={valueClassName}>
                    {entry.budget != null ? `${entry.total}/${entry.budget}` : `${entry.total} SP`}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )

  const nodeVisibilityModeById = useMemo(() => {
    const byId = new Map()
    const showHiddenNodes = roadmapData.showHiddenNodes ?? false

    for (const node of fullNodes) {
      if (hiddenNodeIdSet.has(node.id)) {
        byId.set(node.id, showHiddenNodes ? 'ghost' : 'hidden')
        continue
      }

      const matchesScope = nodeMatchesScopeFilter(node, selectedScopeFilterId, scopeOptions)

      if (!matchesScope) {
        byId.set(node.id, 'hidden')
        continue
      }

      const statusKeys = getVisibleLevelStatusKeys(node, activeReleaseId)
      byId.set(node.id, getReleaseVisibilityModeForStatuses(statusKeys, releaseFilter))
    }

    return byId
  }, [fullNodes, hiddenNodeIdSet, selectedScopeFilterId, scopeOptions, releaseFilter, roadmapData.showHiddenNodes, activeReleaseId])

  const filteredRoadmapData = useMemo(() => {
    if (!hasActiveLayoutFilters) {
      return roadmapData
    }

    const visibleNodeIds = new Set(
      [...nodeVisibilityModeById.entries()]
        .filter(([, mode]) => mode !== 'hidden')
        .map(([nodeId]) => nodeId),
    )

    return {
      ...roadmapData,
      children: collectVisibleNodeTree(roadmapData.children, visibleNodeIds),
    }
  }, [hasActiveLayoutFilters, nodeVisibilityModeById, roadmapData])

  const layoutForRender = useMemo(() => {
    if (!hasActiveLayoutFilters) {
      return fullLayout
    }

    return solveSkillTreeLayout(filteredRoadmapData, TREE_CONFIG).layout
  }, [filteredRoadmapData, fullLayout, hasActiveLayoutFilters])

  const {
    nodes,
    links,
    crossingEdges = [],
    segments,
    canvas,
  } = layoutForRender

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
    if (selectedScopeFilterIds.length === 0) {
      return 'All Scopes'
    }

    const selectedLabels = selectedScopeFilterIds
      .map((scopeId) => scopeOptions.find((scope) => scope.value === scopeId)?.label)
      .filter(Boolean)

    if (selectedLabels.length === 0) {
      return 'All Scopes'
    }

    if (selectedLabels.length <= 2) {
      return selectedLabels.join(', ')
    }

    return `${selectedLabels.length} Scopes`
  }, [scopeOptions, selectedScopeFilterIds])

  const selectedReleaseFilterLabel = useMemo(() => {
    if (!hasActiveStatusFilters) {
      return RELEASE_FILTER_LABELS.all
    }

    const counts = {
      visible: 0,
      minimized: 0,
      hidden: 0,
    }

    for (const visibilityMode of Object.values(statusFilterModeByKey)) {
      if (visibilityMode === 'visible') counts.visible += 1
      if (visibilityMode === 'minimized') counts.minimized += 1
      if (visibilityMode === 'hidden') counts.hidden += 1
    }

    return `${counts.visible} visible · ${counts.minimized} min · ${counts.hidden} hidden`
  }, [hasActiveStatusFilters, statusFilterModeByKey])

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
    () => (selectedNodeId && isInspectorHeavyDataReady ? getLevelOptionsForNode(roadmapData, selectedNodeId, TREE_CONFIG) : []),
    [isInspectorHeavyDataReady, roadmapData, selectedNodeId],
  )

  const selectedNodeSegmentOptions = useMemo(
    () => (selectedNodeId && isInspectorHeavyDataReady ? getSegmentOptionsForNode(roadmapData, selectedNodeId, TREE_CONFIG) : []),
    [isInspectorHeavyDataReady, roadmapData, selectedNodeId],
  )

  const selectedNodeParentOptions = useMemo(
    () => (selectedNodeId && isInspectorHeavyDataReady ? getParentOptionsForNode(roadmapData, selectedNodeId) : []),
    [isInspectorHeavyDataReady, roadmapData, selectedNodeId],
  )

  const selectedNodeParentId = useMemo(
    () => (selectedNodeId && isInspectorHeavyDataReady ? findParentNodeId(roadmapData, selectedNodeId) : null),
    [isInspectorHeavyDataReady, roadmapData, selectedNodeId],
  )

  const selectedNodeLevelDependencyOptions = useMemo(() => {
    if (!selectedNodeId || !selectedProgressLevelId || !isInspectorHeavyDataReady) return {}
    const selectedNode = findNodeById(roadmapData, selectedNodeId)
    if (!selectedNode) return {}

    const levels = Array.isArray(selectedNode.levels) ? selectedNode.levels : []
    if (levels.length === 0) {
      return {}
    }

    // Dependency candidates are level-agnostic; only the selected values differ per level.
    // Compute once to avoid repeated full-graph cycle checks on every node selection.
    const baseOptions = getAdditionalDependencyOptionsForLevel(roadmapData, selectedNodeId, levels[0]?.id)
    const result = {}
    for (const level of levels) {
      result[level.id] = baseOptions
    }
    return result
  }, [isInspectorHeavyDataReady, roadmapData, selectedNodeId, selectedProgressLevelId])

  const selectedNodeAdditionalDependencies = useMemo(() => {
    if (!selectedNodeId || !isInspectorHeavyDataReady) {
      return {
        outgoingIds: [],
        incomingIds: [],
      }
    }

    return getNodeAdditionalDependencies(roadmapData, selectedNodeId)
  }, [isInspectorHeavyDataReady, roadmapData, selectedNodeId])

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
    if (!isInspectorHeavyDataReady) {
      return []
    }

    const incomingIds = selectedNodeAdditionalDependencies.incomingIds ?? []
    return incomingIds
      .map((id) => allNodesById.get(id))
      .filter(Boolean)
      .map((node) => ({
        id: node.id,
        label: node.label,
        shortName: node.shortName ?? '',
      }))
  }, [allNodesById, isInspectorHeavyDataReady, selectedNodeAdditionalDependencies])

  const selectedNodeDependencySummary = useMemo(() => {
    if (!selectedNodeId || !isInspectorHeavyDataReady) {
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
  }, [allNodesById, isInspectorHeavyDataReady, roadmapData.scopes, selectedNode, selectedNodeAdditionalDependencies, selectedNodeId, selectedNodeParentId])

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
        tooltip: `Requires ${targetNode.label}`,
        isInteractive: true,
        otherLabel: `${String(targetLabel).slice(0, 3).toUpperCase()}${targetLevelSuffix}`,
      })

      pushEndpoint(dependency.targetId, {
        key: `${depKey}:target`,
        type: 'target',
        sourceId: dependency.sourceId,
        targetId: dependency.targetId,
        tooltip: `Enables ${sourceNode.label}`,
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
    // Source portals are anchored on the inward radial toward the skill-tree centre.
    // Target portals are anchored on the outward radial away from the centre.
    // Additional portals on the same side fan out to nearby slots as needed.

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
      const sourceEndpoints = nodeEndpoints.filter((ep) => ep.type === 'source')
        .sort((a, b) => a.key.localeCompare(b.key))
      const targetEndpoints = nodeEndpoints.filter((ep) => ep.type === 'target')
        .sort((a, b) => a.key.localeCompare(b.key))

      const reservedAngles = []

      // Place source portals (requires — inner hemisphere)
      sourceEndpoints.forEach((endpoint, index) => {
        const angle = pickPortalSlotAngle({
          type: endpoint.type,
          inwardAngle,
          blockedDirs: linkBlockedAngles,
          reservedAngles,
        })
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

      // Place target portals (enables — outer hemisphere)
      targetEndpoints.forEach((endpoint, index) => {
        const angle = pickPortalSlotAngle({
          type: endpoint.type,
          inwardAngle,
          blockedDirs: linkBlockedAngles,
          reservedAngles,
        })
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
  }, [allNodesById, layoutNodesById, canvas.origin.x, canvas.origin.y, nodeVisibilityModeById, nodes, roadmapData, crossingEdges])

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

    if (!Number.isFinite(bounds.minX) || !Number.isFinite(bounds.minY) || !Number.isFinite(bounds.maxX) || !Number.isFinite(bounds.maxY)) {
      return {
        x: canvas.origin.x - centerIconSize / 2 - 8,
        y: canvas.origin.y - centerIconSize / 2 - 8,
        width: centerIconSize + 16,
        height: centerIconSize + 16,
      }
    }

    return {
      x: bounds.minX,
      y: bounds.minY,
      width: Math.max(1, bounds.maxX - bounds.minX),
      height: Math.max(1, bounds.maxY - bounds.minY),
    }
  }, [
    canvas.origin.x,
    canvas.origin.y,
    centerIconSize,
    renderedNodes,
    nodeVisibilityModeById,
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

  const handleOpenReleaseNotes = (event) => {
    event?.stopPropagation()
    setIsReleaseNotesPanelOpen((current) => !current)
  }

  const handleCloseScopeManager = () => {
    if (rightPanel === PANEL_SCOPES) setRightPanel(null)
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

  const handleDraftChange = useCallback((draft) => {
    setDraftRelease(draft)
  }, [])

  const commitDocument = (nextDocument) => {
    if (!nextDocument || nextDocument === roadmapData) {
      return
    }

    dispatchDocument({ type: 'apply', document: nextDocument })
  }

  const requestBulkApplyConfirmation = useCallback((message, onConfirm) => {
    if (typeof window === 'undefined') {
      onConfirm()
      return
    }

    const suppressed = window.localStorage.getItem(BULK_APPLY_CONFIRM_STORAGE_KEY) === 'true'
    if (suppressed) {
      onConfirm()
      return
    }

    bulkApplyActionRef.current = onConfirm
    setBulkApplyConfirmState({
      opened: true,
      message,
      rememberChoice: false,
    })
  }, [])

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

      requestBulkApplyConfirmation(message, applyOnce)
      return
    }

    applyOnce()
  }

  const applyToSelectedLevels = useCallback((applier, opts = {}) => {
    const entries = Array.isArray(selectedLevelKeys)
      ? selectedLevelKeys
          .map((key) => {
            const [nodeId, levelId] = String(key ?? '').split('::')
            return nodeId && levelId ? { key, nodeId, levelId } : null
          })
          .filter(Boolean)
      : []

    if (entries.length === 0) {
      return false
    }

    const applyOnce = () => {
      let next = roadmapData
      for (const entry of entries) {
        next = applier(next, entry)
      }
      commitDocument(next)
    }

    if (entries.length > 1 && !opts.skipConfirm) {
      const message = opts.description
        ? `Apply "${opts.description}" to ${entries.length} selected items?`
        : `Apply change to ${entries.length} selected items?`
      requestBulkApplyConfirmation(message, applyOnce)
      return true
    }

    applyOnce()
    return true
  }, [commitDocument, requestBulkApplyConfirmation, roadmapData, selectedLevelKeys])

  const closeBulkApplyConfirm = useCallback(() => {
    bulkApplyActionRef.current = null
    setBulkApplyConfirmState({
      opened: false,
      message: '',
      rememberChoice: false,
    })
  }, [])

  const confirmBulkApply = useCallback(() => {
    const action = bulkApplyActionRef.current
    const rememberChoice = bulkApplyConfirmState.rememberChoice

    if (typeof window !== 'undefined' && rememberChoice) {
      window.localStorage.setItem(BULK_APPLY_CONFIRM_STORAGE_KEY, 'true')
    }

    closeBulkApplyConfirm()
    action?.()
  }, [bulkApplyConfirmState.rememberChoice, closeBulkApplyConfirm])

  const handleOpenImportPicker = () => {
    importFileInputRef.current?.click()
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

  // --- Export dialog helpers ---

  const openExportLabelDialog = ({ kind = 'visual', initialReleaseNoteStatuses = null } = {}) => new Promise((resolve) => {
    exportLabelDialogResolveRef.current = resolve
    setExportLabelDialogKind(kind)
    setExportLabelDialogMode('mid')
    setExportTreeStatuses(normalizeFeatureStatuses({
      done: true,
      now: true,
      next: true,
      later: true,
      someday: true,
    }))
    setExportReleaseNoteStatuses(normalizeFeatureStatuses(initialReleaseNoteStatuses))
    setExportStatusSummarySortMode(normalizeStatusSummarySettings(roadmapData?.statusSummary).sortMode)
    setExportLabelDialogOpen(true)
  })

  const confirmExportLabelDialog = () => {
    setExportLabelDialogOpen(false)
    exportLabelDialogResolveRef.current?.({
      labelMode: exportLabelDialogMode,
      treeStatuses: exportTreeStatuses,
      releaseNoteStatuses: exportReleaseNoteStatuses,
      statusSummarySortMode: exportStatusSummarySortMode,
      includePriorityMatrix: includePriorityMatrixInExport,
    })
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
      const selectedOptions = await openExportLabelDialog({ kind: 'visual' })
      if (selectedOptions === null) return
      flushSync(() => setExportLabelModeOverride(selectedOptions.labelMode))
      const selectedTreeStatuses = LEGEND_STATUS_ORDER.filter((statusKey) => selectedOptions.treeStatuses?.[statusKey])
      const { exportSvgFromElement } = await import('./utils/svgExport')
      const exported = exportSvgFromElement(canvasSvgRef.current, {
        fileName: buildExportFileName(roadmapData, 'svg'),
        includeTooltips: true,
        selectedStatusKeys: selectedTreeStatuses,
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
      const selectedOptions = await openExportLabelDialog({ kind: 'visual' })
      if (selectedOptions === null) return
      flushSync(() => setExportLabelModeOverride(selectedOptions.labelMode))
      const selectedTreeStatuses = LEGEND_STATUS_ORDER.filter((statusKey) => selectedOptions.treeStatuses?.[statusKey])
      const { exportPngFromElement } = await import('./utils/svgExport')
      const exported = await exportPngFromElement(canvasSvgRef.current, {
        fileName: buildExportFileName(roadmapData, 'png'),
        includeTooltips: false,
        selectedStatusKeys: selectedTreeStatuses,
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
      const selectedOptions = await openExportLabelDialog({ kind: 'visual' })
      if (selectedOptions === null) return
      flushSync(() => setExportLabelModeOverride(selectedOptions.labelMode))
      const selectedTreeStatuses = LEGEND_STATUS_ORDER.filter((statusKey) => selectedOptions.treeStatuses?.[statusKey])
      const { exportSvgFromElement } = await import('./utils/svgExport')
      const exported = exportSvgFromElement(canvasSvgRef.current, {
        fileName: buildExportFileName(roadmapData, 'svg', { suffix: 'clean' }),
        includeTooltips: false,
        selectedStatusKeys: selectedTreeStatuses,
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
      const selectedOptions = await openExportLabelDialog({
        kind: 'html',
        initialReleaseNoteStatuses: activeRelease?.featureStatuses ?? null,
      })
      if (selectedOptions === null) return

      const selectedTreeStatuses = LEGEND_STATUS_ORDER.filter(
        (statusKey) => selectedOptions.treeStatuses?.[statusKey],
      )
      const selectedReleaseNoteStatuses = LEGEND_STATUS_ORDER.filter(
        (statusKey) => statusKey !== 'hidden' && selectedOptions.releaseNoteStatuses?.[statusKey],
      )

      // Keep the current canvas geometry for export so builder and exported SVG
      // share the same source of truth for routing markers and node presentation.
      flushSync(() => setExportLabelModeOverride(null))
      const { exportHtmlFromSkillTree } = await import('./utils/htmlExport')
      const exported = exportHtmlFromSkillTree({
        svgElement: canvasSvgRef.current,
        roadmapDocument: roadmapData,
        selectedReleaseId: activeRelease?.id ?? null,
        selectedTreeStatuses,
        selectedReleaseNoteStatuses,
        statusSummarySortMode: selectedOptions.statusSummarySortMode,
        includePriorityMatrix: selectedOptions.includePriorityMatrix,
        statusStyles: resolvedStatusStyles,
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
      const selectedOptions = await openExportLabelDialog({
        kind: 'pdf',
        initialReleaseNoteStatuses: activeRelease?.featureStatuses ?? null,
      })
      if (selectedOptions === null) return
      flushSync(() => setExportLabelModeOverride(selectedOptions.labelMode))
      const selectedTreeStatuses = LEGEND_STATUS_ORDER.filter(
        (statusKey) => selectedOptions.treeStatuses?.[statusKey],
      )
      const selectedReleaseNoteStatuses = LEGEND_STATUS_ORDER.filter(
        (statusKey) => statusKey !== 'hidden' && selectedOptions.releaseNoteStatuses?.[statusKey],
      )
      const { tryExportPdfFromSkillTree } = await import('./utils/pdfExport')
      const exported = tryExportPdfFromSkillTree({
        svgElement: canvasSvgRef.current,
        roadmapDocument: roadmapData,
        selectedReleaseId: activeRelease?.id ?? null,
        selectedTreeStatuses,
        selectedReleaseNoteStatuses,
        statusSummarySortMode: selectedOptions.statusSummarySortMode,
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

  const handleImportFileSelected = async (event) => {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    const fileName = String(file.name ?? '').toLowerCase()
    const fileType = String(file.type ?? '').toLowerCase()
    const isCsvFile = fileName.endsWith('.csv') || fileType.includes('csv')
    const isJsonFile = fileName.endsWith('.json') || fileType.includes('json')

    try {
      const rawText = await file.text()

      if (isCsvFile) {
        setPendingCsvImport({ fileName: file.name || 'skilltree-roadmap.csv', rawText })
        setCsvImportOptions(DEFAULT_CSV_IMPORT_PROCESS_OPTIONS)
        setCsvImportDialogOpen(true)
        return
      }

      if (isJsonFile) {
        const nextDocument = readDocumentFromJsonText(rawText)
        dispatchDocument({ type: 'replace', document: nextDocument })
        setTransformKey((current) => current + 1)
        resetSelections()
        return
      }

      const { readDocumentFromHtmlText } = await import('./utils/htmlExport')
      const nextDocument = readDocumentFromHtmlText(rawText)
      dispatchDocument({ type: 'replace', document: nextDocument })
      setTransformKey((current) => current + 1)
      resetSelections()
    } catch (error) {
      if (isCsvFile) {
        console.error('CSV import failed', error)
        const message = getCsvImportErrorMessage(error)
        window.alert(message)
      } else if (isJsonFile) {
        console.error('JSON import failed', error)
        window.alert(`JSON import failed: ${error?.message ?? 'Unknown error'}`)
      } else {
        console.error('HTML import failed', error)
        const message = getHtmlImportErrorMessage(error)
        window.alert(message)
      }
    } finally {
      event.target.value = ''
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
      const normalizedKey = String(event.key ?? '').toLowerCase()
      const isPrimarySave = (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && normalizedKey === 's'
      const isTextareaTarget = event.target instanceof HTMLElement && event.target.tagName === 'TEXTAREA'

      if (isPrimarySave && isTextareaTarget) {
        event.preventDefault()
        systemPanelRef.current?.commitDrafts?.()
        try {
          window.dispatchEvent(new CustomEvent('roadmap-skilltree.commit-text-drafts'))
        } catch {
          // Ignore environments where CustomEvent is unavailable.
        }
        return
      }

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
        void handleExportHtml()
        return
      }

      if (action === 'import-html') {
        event.preventDefault()
        handleOpenImportPicker()
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

  const handleFitToScreen = useCallback(() => {
    if (!transformApiRef.current) return
    const { width: vw, height: vh } = getCanvasViewportMetrics()
    const { positionX, positionY, scale } = computeFitTransform({
      contentBounds: fitContentBounds,
      viewportWidth: vw,
      viewportHeight: vh,
      padding: VIEWPORT_DEFAULTS.fitPadding,
      minScale: VIEWPORT_DEFAULTS.minScale,
      maxScale: VIEWPORT_DEFAULTS.maxScale,
    })
    transformApiRef.current.setTransform(positionX, positionY, scale, 300, 'easeOut')
  }, [fitContentBounds, getCanvasViewportMetrics])

  useEffect(() => {
    if (!transformApiRef.current) {
      return
    }

    const rafId = window.requestAnimationFrame(() => {
      handleFitToScreen()
    })

    return () => {
      window.cancelAnimationFrame(rafId)
    }
  }, [handleFitToScreen, hasActiveLayoutFilters, hasActiveStatusFilters, selectedScopeFilterIds, statusFilterModeByKey])

  const handleZoomToNode = (nodeX, nodeY) => {
    if (!transformApiRef.current || !canvasAreaRef.current) return
    const rect = canvasAreaRef.current.getBoundingClientRect()
    const newScale = Math.min(3.0, VIEWPORT_DEFAULTS.maxScale)
    const { positionX, positionY } = computeCenterTransform({
      x: nodeX,
      y: nodeY,
      scale: newScale,
      viewportWidth: rect.width,
      viewportHeight: rect.height,
    })
    transformApiRef.current.setTransform(positionX, positionY, newScale, 400, 'easeOut')
  }

  const focusNodeInViewport = (nodeId, options = {}) => {
    const layoutNode = layoutNodesById.get(nodeId)
    if (!layoutNode || !transformApiRef.current || !canvasAreaRef.current) {
      return
    }

    const { scale, duration = 360 } = options
    const rect = canvasAreaRef.current.getBoundingClientRect()
    const activeScale = Number.isFinite(scale)
      ? Math.max(VIEWPORT_DEFAULTS.minScale, Math.min(VIEWPORT_DEFAULTS.maxScale, scale))
      : transformApiRef.current.state.scale
    const { positionX, positionY } = computeCenterTransform({
      x: layoutNode.x,
      y: layoutNode.y,
      scale: activeScale,
      viewportWidth: rect.width,
      viewportHeight: rect.height,
    })
    transformApiRef.current.setTransform(positionX, positionY, activeScale, duration, 'easeOut')
  }

  const handleZoomToScale = (scale) => {
    if (!transformApiRef.current) return
    const { positionX, positionY, scale: currentScale } = transformApiRef.current.state
    const { width: viewportWidthPx, height: viewportHeightPx } = getCanvasViewportMetrics()
    const cx = viewportWidthPx / 2
    const cy = viewportHeightPx / 2
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
      const { width: vw, height: vh } = getCanvasViewportMetrics()
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
      const { width: viewportWidthPx, height: viewportHeightPx } = getCanvasViewportMetrics()
      const cx = viewportWidthPx / 2
      const cy = viewportHeightPx / 2
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
    setSelectedLevelKeys([])
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
      flushSync(() => {
        selectNodeId(nodeId)
      })
    }

    setSelectedPortalKey(null)
  }

  const handleSelectAllNodes = useCallback(() => {
    const allIds = collectAllNodes(roadmapData).map((node) => node.id).filter(Boolean)
    if (allIds.length === 0) {
      return
    }

    setSelectedNodeId(allIds[0] ?? null)
    setSelectedNodeIds(allIds)
    setSelectedLevelKeys([])
    setSelectedProgressLevelId(null)
    setSelectedPortalKey(null)
    setRightPanel(PANEL_INSPECTOR)
  }, [roadmapData, setRightPanel, setSelectedNodeId, setSelectedNodeIds, setSelectedPortalKey, setSelectedProgressLevelId])

  const handleSelectNodeFromListView = (nodeId, options = {}) => {
    const { openInspector = false, multiSelect = false } = options
    const layoutNode = layoutNodesById.get(nodeId)

    flushSync(() => {
      setSelectedLevelKeys([])

      if (multiSelect) {
        setSelectedNodeIds((prev = []) => {
          const exists = prev.includes(nodeId)
          const next = exists ? prev.filter((id) => id !== nodeId) : [...prev, nodeId]
          setSelectedNodeId(next[next.length - 1] ?? null)
          return next
        })
        setSelectedProgressLevelId(null)
        setSelectedPortalKey(null)
        return
      }

      if (openInspector) {
        selectNodeId(nodeId)
        setRightPanel(PANEL_INSPECTOR)
      } else {
        setSelectedNodeId(nodeId)
        setSelectedNodeIds([nodeId])
      }
      setSelectedProgressLevelId(null)
      setSelectedPortalKey(null)
    })

    if (layoutNode && transformApiRef.current && canvasAreaRef.current) {
      const TARGET_SCALE = 4 // 400% zoom
      const rect = canvasAreaRef.current.getBoundingClientRect()
      const positionX = rect.width / 2 - layoutNode.x * TARGET_SCALE
      const positionY = rect.height / 2 - layoutNode.y * TARGET_SCALE
      transformApiRef.current.setTransform(positionX, positionY, TARGET_SCALE, 500, 'easeOut')
    }
  }

  const handleSelectNodeFromMatrix = (nodeId) => {
    flushSync(() => {
      selectNodeId(nodeId)
      setRightPanel(null)
      setSelectedPortalKey(null)
    })

    const applyMatrixZoom = () => {
      const layoutNode = layoutNodesById.get(nodeId) ?? nodes.find((node) => node.id === nodeId)
      if (!layoutNode || !transformApiRef.current) {
        return
      }

      const { width: vw, height: vh } = getCanvasViewportMetrics()
      const positionX = vw / 2 - layoutNode.x * MATRIX_SELECTION_ZOOM_SCALE
      const positionY = vh / 2 - layoutNode.y * MATRIX_SELECTION_ZOOM_SCALE
      transformApiRef.current.setTransform(positionX, positionY, MATRIX_SELECTION_ZOOM_SCALE, 500, 'easeOut')
    }

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(applyMatrixZoom)
    } else {
      applyMatrixZoom()
    }
  }

  const handleMoveNodeFromMatrix = (nodeId, effortSize, benefitSize) => {
    if (!nodeId) return

    const targetNode = findNodeById(roadmapData, nodeId)
    if (!targetNode) return

    const nextEffort = normalizeEffort({ size: effortSize, customPoints: null })
    const nextBenefit = normalizeBenefit({ size: benefitSize })

    let nextTree = roadmapData
    const levels = Array.isArray(targetNode.levels) ? targetNode.levels : []
    const effortLevel = levels.find((level) => level?.effort?.size && level.effort.size !== 'unclear') ?? levels[0] ?? null
    const benefitLevel = levels.find((level) => level?.benefit?.size && level.benefit.size !== 'unclear') ?? levels[0] ?? null

    if (effortLevel?.id) {
      nextTree = updateNodeProgressLevel(nextTree, nodeId, effortLevel.id, { effort: nextEffort })
    } else {
      nextTree = updateNodeEffort(nextTree, nodeId, nextEffort)
    }

    if (benefitLevel?.id) {
      nextTree = updateNodeProgressLevel(nextTree, nodeId, benefitLevel.id, { benefit: nextBenefit })
    } else {
      nextTree = updateNodeBenefit(nextTree, nodeId, nextBenefit)
    }

    commitDocument(nextTree)
  }

  const handleSelectLevelFromListView = (nodeId, levelId, options = {}) => {
    const { openInspector = false, multiSelect = false } = options
    const layoutNode = layoutNodesById.get(nodeId)

    if (multiSelect) {
      flushSync(() => {
        const nextKey = `${nodeId}::${levelId}`

        setSelectedLevelKeys((prev = []) => {
          const exists = prev.includes(nextKey)
          const next = exists ? prev.filter((key) => key !== nextKey) : [...prev, nextKey]
          const nextNodeIds = [...new Set(next.map((key) => String(key).split('::')[0]).filter(Boolean))]
          const anchorKey = next[next.length - 1] ?? null

          setSelectedNodeIds(nextNodeIds)
          if (anchorKey) {
            const [anchorNodeId, anchorLevelId] = anchorKey.split('::')
            setSelectedNodeId(anchorNodeId || null)
            setSelectedProgressLevelId(anchorLevelId || null)
          } else {
            setSelectedNodeId(null)
            setSelectedProgressLevelId(null)
          }

          return next
        })

        setSelectedPortalKey(null)
      })
      return
    }

    flushSync(() => {
      setSelectedLevelKeys([])
      if (openInspector) {
        selectNodeId(nodeId)
        setRightPanel(PANEL_INSPECTOR)
      } else {
        setSelectedNodeId(nodeId)
        setSelectedNodeIds([nodeId])
      }
      setSelectedProgressLevelId(levelId)
      setSelectedPortalKey(null)
    })

    if (layoutNode && transformApiRef.current && canvasAreaRef.current) {
      const TARGET_SCALE = 4 // 400% zoom
      const rect = canvasAreaRef.current.getBoundingClientRect()
      const positionX = rect.width / 2 - layoutNode.x * TARGET_SCALE
      const positionY = rect.height / 2 - layoutNode.y * TARGET_SCALE
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

    const nextSelectedNodeId = getPortalCounterpartNodeId(portal)
    if (!nextSelectedNodeId) {
      return
    }

    handleSelectNode(nextSelectedNodeId)
    focusNodeInViewport(nextSelectedNodeId)
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

  const handleInspectorIdentityChange = (nodeId, { name, shortName }) => {
    const targetId = nodeId || selectedNodeId

    if (!targetId) {
      return
    }

    if (Array.isArray(selectedNodeIds) && selectedNodeIds.length > 1) {
      return
    }

    commitDocument(applyInspectorIdentityChange(roadmapData, targetId, { name, shortName }))
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

  const handleOpenPointsChange = (hasOpenPoints, levelId = activeSelectedProgressLevelId) => {
    if ((!selectedNodeId && !(Array.isArray(selectedNodeIds) && selectedNodeIds.length > 0))) {
      return
    }

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
      return updateNodeProgressLevel(tree, id, targetLevelId, { hasOpenPoints: Boolean(hasOpenPoints) })
    }, {
      description: hasOpenPoints ? 'Set open points' : 'Mark done',
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

  const handleRenameScopeGroup = (color, label) => {
    const result = renameScopeGroupWithResult(roadmapData, color, label)

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

  const handleReorderScope = (sourceScopeId, targetScopeId, dropPosition = 'before', nextColor = undefined) => {
    let result = reorderScopesWithResult(roadmapData, sourceScopeId, targetScopeId, dropPosition)

    if (!result.ok) {
      return {
        ok: false,
        error: result.error,
      }
    }

    if (nextColor !== undefined) {
      const recolorResult = setScopeColorWithResult(result.tree, sourceScopeId, nextColor)
      if (!recolorResult.ok) {
        return {
          ok: false,
          error: recolorResult.error,
        }
      }
      result = recolorResult
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

    const currentScopeIds = Array.isArray(activeSelectedProgressLevel?.scopeIds)
      ? uniqueArray(activeSelectedProgressLevel.scopeIds)
      : []

    const shouldCopyScopes = currentScopeIds.length > 0
      ? confirmCopyScopesToNewLevel(currentScopeIds.length)
      : false

    const nextDocument = addNodeProgressLevel(
      roadmapData,
      selectedNodeId,
      undefined,
      shouldCopyScopes ? { scopeIds: currentScopeIds } : undefined,
    )
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

  const handleReorderProgressLevel = (fromLevelId, toLevelId, dropPosition = 'before') => {
    if (!selectedNodeId || !fromLevelId || !toLevelId || fromLevelId === toLevelId) {
      return
    }

    const selectedNodeEntry = findNodeById(roadmapData, selectedNodeId)
    const levels = Array.isArray(selectedNodeEntry?.levels) ? selectedNodeEntry.levels : []
    const fromIndex = levels.findIndex((level) => level.id === fromLevelId)
    const toIndex = levels.findIndex((level) => level.id === toLevelId)

    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
      return
    }

    const normalizedPosition = dropPosition === 'after' ? 'after' : 'before'
    const nextIndex = normalizedPosition === 'after'
      ? (fromIndex < toIndex ? toIndex : toIndex + 1)
      : (fromIndex < toIndex ? toIndex - 1 : toIndex)

    if (nextIndex === fromIndex) {
      return
    }

    commitDocument(reorderNodeProgressLevels(roadmapData, selectedNodeId, fromIndex, nextIndex))
    setSelectedProgressLevelId(fromLevelId)
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

  const handleListViewLevelEffortChange = useCallback((nodeId, levelId, effort, options = {}) => {
    if (!nodeId || !levelId) {
      return
    }

    if (options.applyToSelection && selectedLevelKeys.length > 1) {
      applyToSelectedLevels(
        (tree, entry) => updateNodeProgressLevel(tree, entry.nodeId, entry.levelId, { effort: normalizeEffort(effort) }),
        { description: 'Effort' },
      )
      return
    }

    commitDocument(updateNodeProgressLevel(roadmapData, nodeId, levelId, { effort: normalizeEffort(effort) }))
  }, [applyToSelectedLevels, commitDocument, roadmapData, selectedLevelKeys])

  const handleListViewLevelBenefitChange = useCallback((nodeId, levelId, benefit, options = {}) => {
    if (!nodeId || !levelId) {
      return
    }

    if (options.applyToSelection && selectedLevelKeys.length > 1) {
      applyToSelectedLevels(
        (tree, entry) => updateNodeProgressLevel(tree, entry.nodeId, entry.levelId, { benefit: normalizeBenefit(benefit) }),
        { description: 'Value' },
      )
      return
    }

    commitDocument(updateNodeProgressLevel(roadmapData, nodeId, levelId, { benefit: normalizeBenefit(benefit) }))
  }, [applyToSelectedLevels, commitDocument, roadmapData, selectedLevelKeys])

  const handleListViewLevelStatusChange = useCallback((nodeId, levelId, status, options = {}) => {
    if (!nodeId || !levelId || !status) {
      return
    }

    if (options.applyToSelection && selectedLevelKeys.length > 1) {
      applyToSelectedLevels(
        (tree, entry) => updateNodeProgressLevel(tree, entry.nodeId, entry.levelId, { status }, activeReleaseId),
        { description: 'Status' },
      )
      return
    }

    commitDocument(updateNodeProgressLevel(roadmapData, nodeId, levelId, { status }, activeReleaseId))
  }, [activeReleaseId, applyToSelectedLevels, commitDocument, roadmapData, selectedLevelKeys])

  const handleListViewLevelScopesChange = useCallback((nodeId, levelId, scopeIds, options = {}) => {
    if (!nodeId || !levelId) {
      return
    }

    if (options.applyToSelection && selectedLevelKeys.length > 1) {
      applyToSelectedLevels(
        (tree, entry) => updateNodeProgressLevel(tree, entry.nodeId, entry.levelId, { scopeIds }),
        { description: 'Scopes' },
      )
      return
    }

    commitDocument(updateNodeProgressLevel(roadmapData, nodeId, levelId, { scopeIds }))
  }, [applyToSelectedLevels, commitDocument, roadmapData, selectedLevelKeys])

  const handleListViewLevelOpenPointsChange = useCallback((nodeId, levelId, hasOpenPoints, options = {}) => {
    if (!nodeId || !levelId) {
      return
    }

    if (options.applyToSelection && selectedLevelKeys.length > 1) {
      applyToSelectedLevels(
        (tree, entry) => updateNodeProgressLevel(tree, entry.nodeId, entry.levelId, { hasOpenPoints: Boolean(hasOpenPoints) }),
        { description: hasOpenPoints ? 'Set open points' : 'Mark done' },
      )
      return
    }

    commitDocument(updateNodeProgressLevel(roadmapData, nodeId, levelId, { hasOpenPoints: Boolean(hasOpenPoints) }))
  }, [applyToSelectedLevels, commitDocument, roadmapData, selectedLevelKeys])

  const handleListViewLevelReleaseNoteChange = useCallback((nodeId, levelId, releaseNote) => {
    if (!nodeId || !levelId) {
      return
    }

    commitDocument(updateNodeProgressLevel(roadmapData, nodeId, levelId, { releaseNote }))
  }, [commitDocument, roadmapData])

  const handleListViewNodeSegmentChange = useCallback((nodeId, nextSegmentKey) => {
    if (!nodeId) {
      return
    }

    const nextSegmentId = !nextSegmentKey || nextSegmentKey === UNASSIGNED_SEGMENT_ID ? null : nextSegmentKey
    const validation = validateNodeSegmentChange(roadmapData, nodeId, nextSegmentId, TREE_CONFIG)
    commitDocument(validation.tree)
  }, [commitDocument, roadmapData])

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

  const handleCanvasWheel = useCallback((e) => {
    if (!transformApiRef.current || !canvasAreaRef.current) return

    e.preventDefault()
    const { positionX, positionY, scale } = transformApiRef.current.state
    const { minScale, maxScale } = VIEWPORT_DEFAULTS
    const adaptiveStep = 0.0018 * Math.sqrt(scale)
    const delta = Math.min(Math.abs(e.deltaY), 200)
    const direction = e.deltaY < 0 ? 1 : -1
    const ratio = Math.exp(adaptiveStep * delta * direction)
    const newScale = Math.max(minScale, Math.min(maxScale, scale * ratio))

    if (newScale === scale) return

    const rect = canvasAreaRef.current.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const newPositionX = cx - (cx - positionX) * (newScale / scale)
    const newPositionY = cy - (cy - positionY) * (newScale / scale)
    transformApiRef.current.setTransform(newPositionX, newPositionY, newScale, 80)
  }, [])

  useEffect(() => {
    const el = canvasAreaRef.current
    if (!el) return
    const onContextMenu = (e) => {
      e.preventDefault()
      const now = Date.now()
      if (now - lastRightClickRef.current < 400) {
        handleFitToScreen()
        lastRightClickRef.current = 0
      } else {
        lastRightClickRef.current = now
      }
    }
    el.addEventListener('contextmenu', onContextMenu)
    return () => el.removeEventListener('contextmenu', onContextMenu)
  }, [handleFitToScreen])

  useEffect(() => {
    if (!transformApiRef.current) return

    const fitWhenReady = () => {
      if (!transformApiRef.current || !canvasAreaRef.current) return

      const rect = canvasAreaRef.current.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) {
        window.requestAnimationFrame(fitWhenReady)
        return
      }

      handleFitToScreen()
    }

    const delays = [0, 64, 180, 420]
    delays.forEach((delay) => {
      window.setTimeout(fitWhenReady, delay)
    })
  }, [transformKey])

  const handleListViewWidthChange = useCallback((nextWidth) => {
    setLeftSidebarWidth((current) => Math.max(current, Math.min(nextWidth, 900)))
  }, [])

  const leftSidebarContent = priorityMatrixOpen ? (
    <PriorityMatrix
      embedded
      opened={priorityMatrixOpen}
      onClose={() => setPriorityMatrixOpen(false)}
      document={roadmapData}
      onSelectNode={handleSelectNodeFromMatrix}
      onMoveNode={handleMoveNodeFromMatrix}
      selectedReleaseId={activeReleaseId}
      statusStyles={resolvedStatusStyles}
    />
  ) : listViewOpen ? (
    <ListViewDrawer
      embedded
      opened={listViewOpen}
      onClose={() => setListViewOpen(false)}
      document={roadmapData}
      onSelectNode={handleSelectNodeFromListView}
      onSelectLevel={handleSelectLevelFromListView}
      onSetLevelEffort={handleListViewLevelEffortChange}
      onSetLevelBenefit={handleListViewLevelBenefitChange}
      onSetLevelStatus={handleListViewLevelStatusChange}
      onSetLevelScopeIds={handleListViewLevelScopesChange}
      onSetLevelOpenPoints={handleListViewLevelOpenPointsChange}
      onSetLevelReleaseNote={handleListViewLevelReleaseNoteChange}
      onSetNodeSegment={handleListViewNodeSegmentChange}
      selectedReleaseId={activeReleaseId}
      selectedNodeId={selectedNodeId}
      selectedNodeIds={selectedNodeIds}
      selectedLevelKeys={selectedLevelKeys}
      selectedProgressLevelId={selectedProgressLevelId}
      onClearLevelSelection={() => {
        setSelectedLevelKeys([])
        setSelectedNodeIds([])
        setSelectedNodeId(null)
        setSelectedProgressLevelId(null)
      }}
      onWidthChange={handleListViewWidthChange}
      statusStyles={resolvedStatusStyles}
    />
  ) : null

  const primaryRightSidebarContent = rightPanel === PANEL_INSPECTOR ? (
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
      onSelectAllNodes={handleSelectAllNodes}
      onLabelChange={handleLabelChange}
      onShortNameChange={handleShortNameChange}
      onIdentityChange={handleInspectorIdentityChange}
      onStatusChange={handleStatusChange}
      onOpenPointsChange={handleOpenPointsChange}
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
      onReorderProgressLevel={handleReorderProgressLevel}
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
      statusStyles={resolvedStatusStyles}
    />
  ) : rightPanel === PANEL_SCOPES ? (
    <ToolbarScopeManager
      scopeOptions={scopeOptions}
      onCreateScope={handleCreateScope}
      onRenameScope={handleRenameScope}
      onRenameScopeGroup={handleRenameScopeGroup}
      onDeleteScope={handleDeleteScope}
      onSetScopeColor={handleSetScopeColor}
      onReorderScope={handleReorderScope}
      onClose={handleCloseScopeManager}
    />
  ) : rightPanel === PANEL_CENTER ? (
    <SystemPanel
      ref={systemPanelRef}
      isOpen={rightPanel === PANEL_CENTER}
      iconSource={centerIconSource}
      onClose={() => { if (rightPanel === PANEL_CENTER) setRightPanel(null) }}
      onUpload={handleCenterIconUpload}
      onResetDefault={handleResetCenterIcon}
      roadmapData={roadmapData}
      commitDocument={commitDocument}
      selectedReleaseId={activeReleaseId}
      onReleaseChange={setSelectedReleaseId}
      onDraftChange={handleDraftChange}
    />
  ) : rightPanel === PANEL_STATUS_SUMMARY ? (
    <StatusSummaryPanel
      roadmapData={roadmapData}
      selectedReleaseId={activeReleaseId}
      onClose={() => {
        if (rightPanel === PANEL_STATUS_SUMMARY) setRightPanel(null)
      }}
      onCommitDocument={commitDocument}
      onSelectNode={handleSelectNode}
    />
  ) : isRightSidebarVisible ? (
    <SegmentPanel
      selectedSegment={selectedSegment}
      segmentOptions={roadmapData.segments ?? []}
      isOpen={rightPanel === PANEL_SEGMENTS}
      onClose={() => {
        selectSegmentId(null)
        if (rightPanel === PANEL_SEGMENTS) setRightPanel(null)
      }}
      onLabelChange={handleSegmentLabelChange}
      onDelete={handleDeleteSegment}
      onCreateSegment={handleCreateSegmentForManager}
      onRenameSegment={handleRenameSegmentForManager}
      onDeleteSegment={handleDeleteSegmentForManager}
    />
  ) : null

  const releaseNotesSidebarContent = releaseNotesPanelVisible ? (
    <ReleaseNotesPanel
      isOpen={releaseNotesPanelVisible}
      release={activeRelease}
      onClose={() => {
        setIsReleaseNotesPanelOpen(false)
        if (rightPanel === PANEL_RELEASE_NOTES) {
          setRightPanel(null)
        }
      }}
      onCommitReleaseNotes={(releaseId, updates) => {
        commitDocument({
          ...roadmapData,
          releases: (roadmapData.releases ?? []).map((release) => (
            release.id === releaseId ? { ...release, ...updates } : release
          )),
        })
      }}
    />
  ) : null

  const showInspectorWithInternalNotes = rightPanel === PANEL_INSPECTOR
    && Boolean(primaryRightSidebarContent)
    && Boolean(releaseNotesSidebarContent)

  return (
    <main ref={shellRef} className="skill-tree-shell">
      <input
        ref={importFileInputRef}
        type="file"
        accept={DIRECT_IMPORT_ACCEPT}
        style={{ display: 'none' }}
        onChange={handleImportFileSelected}
      />

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
        opened={bulkApplyConfirmState.opened}
        onClose={closeBulkApplyConfirm}
        title="Apply change to selected items?"
        centered
        size="sm"
        closeOnClickOutside={false}
      >
        <Stack gap="md">
          <Text size="sm">
            {bulkApplyConfirmState.message}
          </Text>
          <Checkbox
            checked={bulkApplyConfirmState.rememberChoice}
            onChange={(event) => {
              const checked = event.currentTarget.checked
              setBulkApplyConfirmState((current) => ({
                ...current,
                rememberChoice: checked,
              }))
            }}
            label="Don't show again"
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={closeBulkApplyConfirm}>
              Cancel
            </Button>
            <Button onClick={confirmBulkApply}>
              Apply to all
            </Button>
          </Group>
        </Stack>
      </Modal>

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
        title={exportLabelDialogKind === 'html' ? 'HTML export' : exportLabelDialogKind === 'pdf' ? 'PDF export' : 'Node label in export'}
        size="sm"
      >
        <Stack gap="md">
          {exportLabelDialogKind !== 'html' && (
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
          )}
            <div>
              <Text size="sm" fw={600} mb={8}>Status filter per export section</Text>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: exportLabelDialogKind === 'html' || exportLabelDialogKind === 'pdf' ? 'minmax(0, 1fr) auto auto' : 'minmax(0, 1fr) auto',
                  gap: '10px 12px',
                  alignItems: 'center',
                }}
              >
                <Text size="xs" c="dimmed">Status</Text>
                <Text size="xs" c="dimmed" ta="center">Baum</Text>
                {(exportLabelDialogKind === 'html' || exportLabelDialogKind === 'pdf') && (
                  <Text size="xs" c="dimmed" ta="center">Release Notes</Text>
                )}
                {LEGEND_STATUS_ORDER.map((statusKey) => (
                  <Fragment key={`export-status-row-${statusKey}`}>
                    <Text size="sm">{STATUS_LABELS[statusKey]}</Text>
                    <Checkbox
                      checked={Boolean(exportTreeStatuses[statusKey])}
                      onChange={(event) => {
                        const checked = event.currentTarget.checked
                        setExportTreeStatuses((current) => ({
                          ...current,
                          [statusKey]: checked,
                        }))
                      }}
                      aria-label={`${STATUS_LABELS[statusKey]} in tree export`}
                    />
                    {(exportLabelDialogKind === 'html' || exportLabelDialogKind === 'pdf') && (
                      <Checkbox
                        checked={Boolean(exportReleaseNoteStatuses[statusKey])}
                        onChange={(event) => {
                          const checked = event.currentTarget.checked
                          setExportReleaseNoteStatuses((current) => ({
                            ...current,
                            [statusKey]: checked,
                          }))
                        }}
                        aria-label={`${STATUS_LABELS[statusKey]} in release notes export`}
                      />
                    )}
                  </Fragment>
                ))}
              </div>
              <Text size="xs" c="dimmed" mt={8}>
                Baum filtert den exportierten Skilltree. Release Notes filtert nur die Notizsektion in HTML und PDF.
              </Text>
              {(exportLabelDialogKind === 'html' || exportLabelDialogKind === 'pdf') && (
                <Text size="xs" c="dimmed" mt={4}>
                  Die Vorbelegung der Release Notes kommt aus dem Inscope-Setup des System-Panels und gilt nur fuer diesen Export.
                </Text>
              )}
            </div>

            {(exportLabelDialogKind === 'html' || exportLabelDialogKind === 'pdf') && (
            <div>
              <Text size="sm" fw={600} mb={8}>Status summary sort order</Text>
              <select
                value={exportStatusSummarySortMode}
                onChange={(event) => setExportStatusSummarySortMode(event.currentTarget.value)}
                aria-label="Status summary sort order"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(71, 85, 105, 0.7)',
                  background: 'rgba(15, 23, 42, 0.92)',
                  color: '#e2e8f0',
                }}
              >
                {STATUS_SUMMARY_SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <Text size="xs" c="dimmed" mt={8}>
                Applies to the export status summary and the ordering of release-note items.
              </Text>
            </div>
          )}

          {(exportLabelDialogKind === 'html') && (
            <Checkbox
              checked={includePriorityMatrixInExport}
              onChange={(event) => setIncludePriorityMatrixInExport(event.currentTarget.checked)}
              label="Priority Matrix in Export einschließen"
            />
          )}

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
        isLegendVisible={isLegendVisible}
        onToggleLegend={() => {
          setIsLegendVisible((prev) => !prev)
        }}
        isBudgetOverviewVisible={isBudgetOverviewVisible}
        onToggleBudgetOverview={() => {
          setIsLegendVisible(true)
          setIsBudgetOverviewVisible((prev) => !prev)
        }}
        hasBudgetAlert={hasBudgetAlert}
        onOpenDocumentPicker={handleOpenImportPicker}
        onOpenHtmlDocumentPicker={handleOpenDocumentPicker}
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
        onOpenStatusSummary={() => {
          setRightPanel((current) => togglePanel(current, PANEL_STATUS_SUMMARY))
          selectSegmentId(null)
        }}
        onOpenReleaseNotes={handleOpenReleaseNotes}
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
        statusStyles={resolvedStatusStyles}
      />

      <div className="skill-tree-workspace">
        <div className="skill-tree-main-row">
          {isLeftSidebarVisible && (
            <>
              <aside ref={leftSidebarRef} className="skill-tree-sidebar skill-tree-sidebar--left" style={{ width: `${leftSidebarWidth}px` }}>
                {leftSidebarContent}
              </aside>
              <div
                className="skill-tree-column-resizer skill-tree-column-resizer--left"
                role="separator"
                aria-label="Resize left sidebar"
                onPointerDown={handleSidebarResizeStart('left')}
              />
            </>
          )}

          <div className="skill-tree-center-column">
            <section className="skill-tree-stage">
              <div ref={canvasAreaRef} className="skill-tree-canvas-area" onWheelCapture={handleCanvasWheel}>
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
                      systemName={roadmapData?.systemName ?? ''}
                      activeRelease={activeRelease}
                      draftRelease={draftRelease}
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
                      onSelectLevel={(nodeId, levelId) => handleSelectLevelFromListView(nodeId, levelId, { openInspector: true })}
                      onZoomToNode={handleZoomToNode}
                      storyPointMap={roadmapData.storyPointMap}
                      releaseId={activeReleaseId}
                      statusStyles={resolvedStatusStyles}
                    />
                  </TransformComponent>
                </TransformWrapper>
              </div>
            </section>

            {legendFooter}
          </div>

          {isRightSidebarVisible && (
          <>
            <div
              className="skill-tree-column-resizer skill-tree-column-resizer--right"
              role="separator"
              aria-label="Resize right sidebar"
              onPointerDown={handleSidebarResizeStart('right')}
            />
            <aside ref={rightSidebarRef} className="skill-tree-sidebar skill-tree-sidebar--right" style={{ width: `${rightSidebarWidth}px` }}>
              {showInspectorWithInternalNotes ? (
                <div className="skill-tree-sidebar-stack">
                  <div className="skill-tree-sidebar__section skill-tree-sidebar__section--primary">
                    {primaryRightSidebarContent}
                  </div>
                  <div className="skill-tree-sidebar__section skill-tree-sidebar__section--secondary">
                    {releaseNotesSidebarContent}
                  </div>
                </div>
              ) : releaseNotesSidebarContent ?? primaryRightSidebarContent}
            </aside>
          </>
        )}
        </div>

      </div>
    </main>
  )
}
