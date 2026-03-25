import { Alert } from '@mantine/core'
import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch'
import './skillTree.css'
import { TREE_CONFIG, STATUS_STYLES } from './config'
import {
  saveDocumentToLocalStorage,
} from './utils/documentPersistence'
import {
  createDocumentHistoryState,
  createEmptyDocument,
  DEFAULT_CENTER_ICON_SRC,
  documentHistoryReducer,
} from './utils/documentState'
import { CenterIconPanel, InspectorPanel, SegmentPanel, ToolbarScopeManager, ToolbarSegmentManager } from './panels'
import { solveSkillTreeLayout } from './utils/layoutSolver'
import { UNASSIGNED_SEGMENT_ID } from './utils/layoutShared'
import { getSkillTreeShortcutAction } from './utils/keyboardShortcuts'
import { togglePanel, PANEL_INSPECTOR, PANEL_CENTER, PANEL_SCOPES, PANEL_SEGMENTS } from './utils/panelsState'
import { getDisplayStatusKey } from './utils/nodeStatus'
import {
  getAdditionalDependencyOptionsForNode,
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
  deleteScopeWithResult,
  deleteSegment,
  deleteNodeBranch,
  deleteNodeOnly,
  findParentNodeId,
  findNodeById,
  getNodeAdditionalDependencies,
  getNodeLevelInfo,
  moveNodeToParent,
  renameScopeWithResult,
  removeNodeProgressLevel,
  setNodeAdditionalDependencies,
  updateNodeData as updateNodeDataInTree,
  updateNodeProgressLevel,
  updateNodeShortName,
  updateSegmentLabel,
} from './utils/treeData'
import { toDegrees, toRadians } from './utils/layoutMath'
import { SkillTreeCanvas } from './canvas'
import { SkillTreeToolbar } from './toolbar'

import { useSkillTreeUiState } from '../hooks/useSkillTreeUiState'
import { isAngleNear } from './utils/angle'
import { uniqueArray } from './utils/array'
import { isEditableElement } from './utils/dom'
import { getHtmlImportErrorMessage, confirmResetDocument } from './utils/messages'
import { readFileAsText, readFileAsDataUrl, isValidSvgMarkup } from './utils/file'
import {
  RELEASE_FILTER_LABELS,
  RELEASE_FILTER_OPTIONS,
  SCOPE_FILTER_ALL,
  getReleaseVisibilityMode,
  nodeMatchesScopeFilter,
} from './utils/visibility'
import { getInitialRoadmapDocument } from './utils/document'
import { resolveInspectorSelectedNode } from './utils/selection'

// `resolveInspectorSelectedNode` is exported from `src/components/utils/selection.js`
// Tests/importers should import from that module instead of re-exporting from here.

const AUTOSAVE_DEBOUNCE_MS = 450
const INITIAL_VIEW_SCALE = 0.7
const MINIMAL_NODE_SIZE = 36

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
  const canvasSvgRef = useRef(null)
  const [lastSavedAt, setLastSavedAt] = useState(null)

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
  } = useSkillTreeUiState()

  const addControlOffset = TREE_CONFIG.nodeSize * 0.82

  const { layout, diagnostics } = useMemo(
    () => solveSkillTreeLayout(roadmapData, TREE_CONFIG),
    [roadmapData],
  )
  const { nodes, links, segments, canvas } = layout
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : canvas.width
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : canvas.height
  const initialViewScale = useMemo(() => {
    if (!canvas.width || !canvas.height || !viewportWidth || !viewportHeight) {
      return INITIAL_VIEW_SCALE
    }

    const availableWidth = Math.max(1, viewportWidth - 80)
    const availableHeight = Math.max(1, viewportHeight - 80)
    const fittedScale = Math.min(availableWidth / canvas.width, availableHeight / canvas.height)

    return Math.max(0.2, Math.min(1.5, fittedScale))
  }, [canvas.height, canvas.width, viewportHeight, viewportWidth])
  const initialPositionX = viewportWidth / 2 - canvas.origin.x * initialViewScale
  const initialPositionY = viewportHeight / 2 - canvas.origin.y * initialViewScale
  const centerIconSource = roadmapData.centerIconSrc ?? DEFAULT_CENTER_ICON_SRC

  const centerIconSize = useMemo(() => {
    const firstLevelNode = nodes.find((node) => node.level === 1)
    const firstLevelRadius = firstLevelNode?.radius ?? TREE_CONFIG.levelSpacing
    const innerGap = TREE_CONFIG.nodeSize * 0.2
    const minSize = TREE_CONFIG.nodeSize * 1.15
    const preferredSize = firstLevelRadius * 1.16
    const maxAllowedSize = Math.max(
      minSize,
      (firstLevelRadius - TREE_CONFIG.nodeSize / 2 - innerGap) * 2,
    )

    return Math.max(minSize, Math.min(preferredSize, maxAllowedSize))
  }, [nodes])

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

  const nodeVisibilityModeById = useMemo(() => {
    const byId = new Map()

    for (const node of nodes) {
      const matchesScope = nodeMatchesScopeFilter(node, selectedScopeFilterId)

      if (!matchesScope) {
        byId.set(node.id, 'hidden')
        continue
      }

      const statusKey = getDisplayStatusKey(node)
      byId.set(node.id, getReleaseVisibilityMode(statusKey, releaseFilter))
    }

    return byId
  }, [nodes, selectedScopeFilterId, releaseFilter])

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
      return 'Alle Scopes'
    }

    return scopeOptions.find((scope) => scope.value === selectedScopeFilterId)?.label ?? 'Alle Scopes'
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

  const selectedNodeAdditionalDependencyOptions = useMemo(
    () => (selectedNodeId ? getAdditionalDependencyOptionsForNode(roadmapData, selectedNodeId) : []),
    [roadmapData, selectedNodeId],
  )

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

  const selectedNodeValidationMessage = useMemo(() => {
    if (!selectedNodeId || diagnostics.isValid) {
      return null
    }

    const relevantIssue = diagnostics.issues.find((issue) => issue.nodeIds?.includes(selectedNodeId))

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

    const layoutNodeById = new Map(nodes.map((node) => [node.id, node]))
    const dependencies = []
    const queue = [...(roadmapData.children ?? [])]

    while (queue.length > 0) {
      const current = queue.shift()
      const outgoingIds = Array.isArray(current.additionalDependencyIds)
        ? current.additionalDependencyIds
        : []

      for (const targetId of outgoingIds) {
        if (layoutNodeById.has(current.id) && layoutNodeById.has(targetId)) {
          dependencies.push({ sourceId: current.id, targetId })
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
      const sourceLabel = allNodesById.get(dependency.sourceId)?.shortName ?? sourceNode.shortName ?? sourceNode.label
      const targetLabel = allNodesById.get(dependency.targetId)?.shortName ?? targetNode.shortName ?? targetNode.label

      pushEndpoint(dependency.sourceId, {
        key: `${dependency.sourceId}->${dependency.targetId}:source`,
        type: 'source',
        sourceId: dependency.sourceId,
        targetId: dependency.targetId,
        tooltip: `Benoetigt ${targetNode.label}`,
        isInteractive: true,
        otherLabel: String(targetLabel).slice(0, 3).toUpperCase(),
      })

      pushEndpoint(dependency.targetId, {
        key: `${dependency.sourceId}->${dependency.targetId}:target`,
        type: 'target',
        sourceId: dependency.sourceId,
        targetId: dependency.targetId,
        tooltip: `Wird benoetigt von ${sourceNode.label}`,
        isInteractive: true,
        otherLabel: String(sourceLabel).slice(0, 3).toUpperCase(),
      })
    }

    const endpoints = []
    const portalOrbit = TREE_CONFIG.nodeSize * 0.72
    const portalAvoidance = 17
    const spreadStep = 18

    for (const [nodeId, nodeEndpoints] of endpointsByNodeId.entries()) {
      const layoutNode = layoutNodeById.get(nodeId)
      if (!layoutNode) {
        continue
      }

      const childAngles = nodes
        .filter((candidate) => candidate.parentId === nodeId)
        .map((candidate) => toDegrees(Math.atan2(candidate.y - layoutNode.y, candidate.x - layoutNode.x)))
      const blockedAngles = [...childAngles]
      if (layoutNode.parentId) {
        const parentNode = layoutNodeById.get(layoutNode.parentId)
        if (parentNode) {
          blockedAngles.push(toDegrees(Math.atan2(parentNode.y - layoutNode.y, parentNode.x - layoutNode.x)))
        }
      }

      const inwardAngle = toDegrees(Math.atan2(canvas.origin.y - layoutNode.y, canvas.origin.x - layoutNode.x))
      const offsetCenter = (nodeEndpoints.length - 1) / 2

      nodeEndpoints.forEach((endpoint, index) => {
        let candidateAngle = inwardAngle + (index - offsetCenter) * spreadStep
        let safety = 0

        while (blockedAngles.some((blocked) => isAngleNear(candidateAngle, blocked, portalAvoidance)) && safety < 8) {
          const direction = index <= offsetCenter ? -1 : 1
          candidateAngle += direction * 12
          safety += 1
        }

        const radians = toRadians(candidateAngle)
        endpoints.push({
          ...endpoint,
          nodeId,
          x: layoutNode.x + Math.cos(radians) * portalOrbit,
          y: layoutNode.y + Math.sin(radians) * portalOrbit,
        })
      })
    }

    return endpoints
  }, [allNodesById, canvas.origin.x, canvas.origin.y, nodes, roadmapData.children])

  const visibleDependencyPortals = useMemo(
    () => dependencyPortals.filter((portal) => (
      renderedNodeIds.has(portal.nodeId)
      && renderedNodeIds.has(portal.sourceId)
      && renderedNodeIds.has(portal.targetId)
    )),
    [dependencyPortals, renderedNodeIds],
  )

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
      window.alert('SVG-Datei konnte nicht geladen werden.')
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
        ? `${opts.description} auf ${ids.length} ausgewählte Knoten anwenden?`
        : `Änderung auf ${ids.length} ausgewählte Knoten anwenden?`

      if (opts.applyToAllLevels) {
        message += '\n\nHinweis: Die Änderung wird auf alle Level der jeweiligen Knoten angewendet.'
      }

      const confirmed = window.confirm(message)
      if (!confirmed) return
    }

    applyOnce()
  }

  const handleOpenDocumentPicker = () => {
    documentFileInputRef.current?.click()
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
    setTransformKey((current) => current + 1)
    resetSelections()
    if (rightPanel === PANEL_CENTER) setRightPanel(null)
  }

  const handleExportSvg = async () => {
    if (!canvasSvgRef.current) {
      window.alert('SVG-Export derzeit nicht verfuegbar.')
      return
    }

    try {
      const { exportSvgFromElement } = await import('./utils/svgExport')
      const exported = exportSvgFromElement(canvasSvgRef.current, {
        fileName: 'skilltree-roadmap.svg',
        includeTooltips: true,
        sourceDocument: window.document,
      })
      if (!exported) {
        window.alert('SVG-Export fehlgeschlagen.')
        return
      }

    } catch (error) {
      console.error('SVG export failed', error)
      window.alert('SVG-Export fehlgeschlagen.')
    }
  }

  const handleExportCleanSvg = async () => {
    if (!canvasSvgRef.current) {
      window.alert('SVG-Export derzeit nicht verfuegbar.')
      return
    }

    try {
      const { exportSvgFromElement } = await import('./utils/svgExport')
      const exported = exportSvgFromElement(canvasSvgRef.current, {
        fileName: 'skilltree-roadmap-clean.svg',
        includeTooltips: false,
        sourceDocument: window.document,
      })
      if (!exported) {
        window.alert('Clean-SVG-Export fehlgeschlagen.')
        return
      }

    } catch (error) {
      console.error('Clean SVG export failed', error)
      window.alert('Clean-SVG-Export fehlgeschlagen.')
    }
  }

  const handleExportHtml = async () => {
    if (!canvasSvgRef.current) {
      window.alert('HTML-Export derzeit nicht verfuegbar.')
      return
    }

    try {
      const { exportHtmlFromSkillTree } = await import('./utils/htmlExport')
      const exported = exportHtmlFromSkillTree({
        svgElement: canvasSvgRef.current,
        roadmapDocument: roadmapData,
      })

      if (!exported) {
        window.alert('HTML-Export fehlgeschlagen.')
        return
      }

    } catch (error) {
      console.error('HTML export failed', error)
      window.alert('HTML-Export fehlgeschlagen.')
    }
  }

  const handleExportPdf = async () => {
    if (!canvasSvgRef.current) {
      window.alert('PDF-Export derzeit nicht verfuegbar.')
      return
    }

    try {
      const { tryExportPdfFromSkillTree } = await import('./utils/pdfExport')
      const exported = tryExportPdfFromSkillTree({
        svgElement: canvasSvgRef.current,
        roadmapDocument: roadmapData,
      })

      if (!exported.ok) {
        if (exported.errorCode === 'popup-blocked') {
          window.alert('PDF-Fenster wurde blockiert. Bitte Popups fuer diese Seite erlauben und den Export erneut starten.')
        } else {
          window.alert('PDF-Export fehlgeschlagen. Bitte erneut versuchen.')
        }
        return
      }

    } catch (error) {
      console.error('PDF export failed', error)
      window.alert('PDF-Export fehlgeschlagen. Bitte erneut versuchen.')
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
              window.alert('HTML-Export derzeit nicht verfuegbar.')
              return
            }

            const { exportHtmlFromSkillTree } = await import('./utils/htmlExport')
            const exported = exportHtmlFromSkillTree({
              svgElement: canvasSvgRef.current,
              roadmapDocument: roadmapData,
            })

            if (!exported) {
              window.alert('HTML-Export fehlgeschlagen.')
            }
          } catch (error) {
            console.error('HTML export shortcut failed', error)
            window.alert('HTML-Export fehlgeschlagen.')
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
        if (!confirmResetDocument()) {
          return
        }
        dispatchDocument({ type: 'apply', document: createEmptyDocument() })
        selectNodeId(null)
        selectSegmentId(null)
        setSelectedPortalKey(null)
        setSelectedProgressLevelId(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRedo, canUndo, roadmapData, selectedSegmentId])

  const autosaveLabel = lastSavedAt
    ? `Autosave ${lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
    : 'Autosave aktiv'

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
          return { ok: false, error: 'Kein Anker-Segment vorhanden.' }
        }
        const result = addSegmentNearWithResult(roadmapData, anchorSegmentId, 'right')
        createdSegmentId = result.createdSegmentId
        let nextTree = result.tree
        if (createdSegmentId && label) {
          nextTree = updateSegmentLabel(nextTree, createdSegmentId, label)
        }
        commitDocument(nextTree)
      }

      if (createdSegmentId) {
        selectNodeId(null)
        selectSegmentId(createdSegmentId)
        setSelectedPortalKey(null)
      }

      return { ok: true }
      } catch {
        return { ok: false, error: String('Fehler beim Erstellen des Segments.') }
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
          return { ok: false, error: 'Kein Anker-Segment vorhanden.' }
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
      return { ok: false, error: 'Segment wurde nicht gefunden.' }
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
      return { ok: false, error: 'Segment wurde nicht gefunden.' }
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

  const updateNodeData = (id, newLabel, newStatus) => {
    commitDocument(updateNodeDataInTree(roadmapData, id, newLabel, newStatus))
  }

  const handleLabelChange = (newLabel) => {
    if (!selectedNodeId || !selectedNode) {
      return
    }

    if (Array.isArray(selectedNodeIds) && selectedNodeIds.length > 1) {
      // When multiple nodes are selected, label edits are disabled.
      return
    }

    updateNodeData(selectedNodeId, newLabel, selectedNode.status)
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
      return updateNodeProgressLevel(tree, id, targetLevelId, { status: newStatus })
    })
  }

  const handleReleaseNoteChange = (releaseNote, levelId = activeSelectedProgressLevelId) => {
    if ((!selectedNodeId && !(Array.isArray(selectedNodeIds) && selectedNodeIds.length > 0)) || !levelId) {
      return
    }

    applyToSelectedNodes((tree, id) => updateNodeProgressLevel(tree, id, levelId, { releaseNote }))
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

  const handleAdditionalDependenciesChange = (nextDependencyIds) => {
    if (!selectedNodeId && !(Array.isArray(selectedNodeIds) && selectedNodeIds.length > 0)) {
      return
    }

    applyToSelectedNodes((tree, id) => setNodeAdditionalDependencies(tree, id, nextDependencyIds))
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

    applyToSelectedNodes((tree, id) => deleteNodeOnly(tree, id), { description: 'Knoten löschen' })
    selectNodeId(null)
    setSelectedPortalKey(null)
  }

  const handleDeleteNodeBranch = () => {
    if ((!selectedNodeId && !(Array.isArray(selectedNodeIds) && selectedNodeIds.length > 0))) {
      return
    }

    applyToSelectedNodes((tree, id) => deleteNodeBranch(tree, id), { description: 'Zweig löschen' })
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

  return (
    <main className="skill-tree-shell">
      <input
        ref={documentFileInputRef}
        type="file"
        accept="text/html,.html"
        style={{ display: 'none' }}
        onChange={handleDocumentFileSelected}
      />

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
        onExportHtml={() => void handleExportHtml()}
        onExportPdf={() => void handleExportPdf()}
        onExportSvg={() => void handleExportSvg()}
        onExportCleanSvg={() => void handleExportCleanSvg()}
        onUndo={handleUndo}
        canUndo={canUndo}
        onRedo={handleRedo}
        canRedo={canRedo}
        onReset={handleReset}
        onOpenSegmentManager={handleOpenSegmentManager}
        onOpenScopeManager={handleOpenScopeManager}
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
      />

      <TransformWrapper
        key={transformKey}
        minScale={0.2}
        maxScale={2.2}
        initialScale={initialViewScale}
        initialPositionX={initialPositionX}
        initialPositionY={initialPositionY}
        wheel={{ step: 0.12 }}
        limitToBounds={false}
        centerOnInit={false}
      >
        <TransformComponent
          wrapperClass="skill-tree-transform-wrapper"
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
            selectedLayoutNode={selectedLayoutNode}
            selectedControlGeometry={selectedControlGeometry}
            selectedSegmentLabel={selectedSegmentLabel}
            selectedSegmentControlGeometry={selectedSegmentControlGeometry}
            emptyStateAddControl={emptyStateAddControl}
            emptySegmentAddControl={emptySegmentAddControl}
            nodeSize={TREE_CONFIG.nodeSize}
            minimalNodeSize={MINIMAL_NODE_SIZE}
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
          />
        </TransformComponent>
      </TransformWrapper>

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
        onScopeIdsChange={handleLevelScopesChange}
        scopeOptions={scopeOptions}
        onCreateScope={handleCreateScope}
        onRenameScope={handleRenameScope}
        onDeleteScope={handleDeleteScope}
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
        additionalDependencyOptions={selectedNodeAdditionalDependencyOptions}
        selectedAdditionalDependencyIds={selectedNodeAdditionalDependencies.outgoingIds}
        incomingDependencyLabels={selectedNodeIncomingDependencyLabels}
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
            return validation.isAllowed ? validation.tree : tree
          })
        }}
        onAdditionalDependenciesChange={handleAdditionalDependenciesChange}
        onDeleteNodeOnly={handleDeleteNodeOnly}
        onDeleteNodeBranch={handleDeleteNodeBranch}
        />
      )}

      {rightPanel === PANEL_SCOPES && (
        <ToolbarScopeManager
          scopeOptions={scopeOptions}
          onCreateScope={handleCreateScope}
          onRenameScope={handleRenameScope}
          onDeleteScope={handleDeleteScope}
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

      <CenterIconPanel
        isOpen={rightPanel === PANEL_CENTER}
        iconSource={centerIconSource}
        onClose={() => { if (rightPanel === PANEL_CENTER) setRightPanel(null) }}
        onUpload={handleCenterIconUpload}
        onResetDefault={handleResetCenterIcon}
        roadmapData={roadmapData}
        commitDocument={commitDocument}
      />
    </main>
  )
}
