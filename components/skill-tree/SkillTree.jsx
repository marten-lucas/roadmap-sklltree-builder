import { ActionIcon, Alert, Group, Menu, Paper, Text, Tooltip } from '@mantine/core'
import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch'
import './skillTree.css'
import { TREE_CONFIG, normalizeStatusKey, STATUS_STYLES } from './config'
import { initialData } from './data'
import {
  loadDocumentFromLocalStorage,
  saveDocumentToLocalStorage,
} from './documentPersistence'
import {
  createDocumentHistoryState,
  createEmptyDocument,
  DEFAULT_CENTER_ICON_SRC,
  documentHistoryReducer,
} from './documentState'
import { CenterIconPanel } from './CenterIconPanel'
import { InspectorPanel } from './InspectorPanel'
import { solveSkillTreeLayout } from './layoutSolver'
import { UNASSIGNED_SEGMENT_ID } from './layoutShared'
import { getSkillTreeShortcutAction } from './keyboardShortcuts'
import { SegmentPanel } from './SegmentPanel'
import ToolbarScopeManager from './ToolbarScopeManager'
import ToolbarSegmentManager from './ToolbarSegmentManager'
import { togglePanel, PANEL_INSPECTOR, PANEL_CENTER, PANEL_SCOPES, PANEL_SEGMENTS } from './panelsState'
import { SkillNode } from './SkillNode'
import { getDisplayStatusKey } from './nodeStatus'
import {
  getAdditionalDependencyOptionsForNode,
  getParentOptionsForNode,
  getLevelOptionsForNode,
  getSegmentOptionsForNode,
  validateNodeLevelChange,
  validateNodeSegmentChange,
} from './treeValidation'
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
} from './treeData'
import { toDegrees, toRadians } from './layoutMath'

const normalizeAngle = (angleDeg) => {
  const normalized = angleDeg % 360
  return normalized < 0 ? normalized + 360 : normalized
}

const getAngleDelta = (leftDeg, rightDeg) => {
  const delta = normalizeAngle(leftDeg - rightDeg)
  return delta > 180 ? delta - 360 : delta
}

const uniqueArray = (values) => [...new Set(values)]

const isAngleNear = (candidate, blocked, thresholdDeg) => {
  return Math.abs(getAngleDelta(candidate, blocked)) < thresholdDeg
}

const AUTOSAVE_DEBOUNCE_MS = 450
const EXPORT_BRAND_NAME = 'Roadmap Skilltree Builder'
const EXPORT_AUTHOR = 'Skilltree Team'
const INITIAL_VIEW_SCALE = 0.7
const MINIMAL_NODE_SIZE = 36
const SCOPE_FILTER_ALL = '__all__'

const RELEASE_FILTER_OPTIONS = {
  all: 'all',
  now: 'now',
  next: 'next',
}

const RELEASE_FILTER_LABELS = {
  all: 'All',
  now: 'Now',
  next: 'Next',
}

const getReleaseVisibilityMode = (statusKey, releaseFilter) => {
  if (releaseFilter === RELEASE_FILTER_OPTIONS.now) {
    if (statusKey === 'now' || statusKey === 'next') {
      return 'full'
    }

    if (statusKey === 'done') {
      return 'minimal'
    }

    return 'hidden'
  }

  if (releaseFilter === RELEASE_FILTER_OPTIONS.next) {
    if (statusKey === 'now' || statusKey === 'next') {
      return 'full'
    }

    return 'minimal'
  }

  return 'full'
}

const nodeMatchesScopeFilter = (node, scopeId) => {
  const levels = Array.isArray(node?.levels) ? node.levels : []

  if (!scopeId || scopeId === SCOPE_FILTER_ALL) {
    return true
  }

  return levels.some((level) => Array.isArray(level?.scopeIds) && level.scopeIds.includes(scopeId))
}

const getInitialRoadmapDocument = () => loadDocumentFromLocalStorage() ?? initialData

const isEditableElement = (target) => {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
}

// Exported helper: decide which `selectedNode` the inspector should receive.
// When multiple nodes are selected the inspector should not get a single
// selected node object (it renders a multi-select UI instead).
export function resolveInspectorSelectedNode(node, nodeIds) {
  if (Array.isArray(nodeIds) && nodeIds.length > 1) return null
  return node
}

const getHtmlImportErrorMessage = (error) => {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'Die Datei konnte nicht importiert werden. Bitte eine gueltige HTML-Exportdatei verwenden.'
}

const confirmResetDocument = () => window.confirm(
  'Roadmap wirklich zuruecksetzen? Dieser Schritt kann per Undo rueckgaengig gemacht werden.',
)

const readFileAsText = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result ?? ''))
  reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'))
  reader.readAsText(file)
})

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result ?? ''))
  reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'))
  reader.readAsDataURL(file)
})

const isValidSvgMarkup = (markup) => {
  if (typeof markup !== 'string' || markup.trim().length === 0) {
    return false
  }

  const parser = new DOMParser()
  const parsed = parser.parseFromString(markup, 'image/svg+xml')

  if (parsed.querySelector('parsererror')) {
    return false
  }

  return parsed.documentElement?.tagName?.toLowerCase() === 'svg'
}

const ToolbarIcon = ({ children }) => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
)

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
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [selectedNodeIds, setSelectedNodeIds] = useState([])
  const [selectedProgressLevelId, setSelectedProgressLevelId] = useState(null)
  const [selectedSegmentId, setSelectedSegmentId] = useState(null)
  const [selectedPortalKey, setSelectedPortalKey] = useState(null)
  const [rightPanel, setRightPanel] = useState(null)
  
  // Ensure only one panel is visible at a time. Use these wrappers instead of
  // calling the raw setters directly so opening one panel clears others.
  const selectNodeId = (nodeId) => {
    setSelectedNodeId(nodeId)
    setSelectedNodeIds(nodeId ? [nodeId] : [])
    if (nodeId) {
      // Ensure only one right-side panel is open: show inspector
      selectSegmentId(null)
      setRightPanel(PANEL_INSPECTOR)
    } else {
      setSelectedProgressLevelId(null)
      setSelectedPortalKey(null)
      if (rightPanel === PANEL_INSPECTOR) setRightPanel(null)
    }
  }

  const selectSegmentId = (segmentId) => {
    setSelectedSegmentId(segmentId)
    if (segmentId) {
      // Selecting a segment should close inspector and hide right-side panel
      setSelectedNodeId(null)
      setRightPanel(null)
      setSelectedProgressLevelId(null)
      setSelectedPortalKey(null)
    }
  }
  const [isToolbarCollapsed, setIsToolbarCollapsed] = useState(false)
  const [selectedScopeFilterId, setSelectedScopeFilterId] = useState(SCOPE_FILTER_ALL)
  const [releaseFilter, setReleaseFilter] = useState(RELEASE_FILTER_OPTIONS.all)
  const [transformKey, setTransformKey] = useState(0)
  const addControlOffset = TREE_CONFIG.nodeSize * 0.82

  const { layout, diagnostics } = useMemo(
    () => solveSkillTreeLayout(roadmapData, TREE_CONFIG),
    [roadmapData],
  )
  const { nodes, links, segments, canvas } = layout
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : canvas.width
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : canvas.height
  const initialPositionX = viewportWidth / 2 - canvas.origin.x * INITIAL_VIEW_SCALE
  const initialPositionY = viewportHeight / 2 - canvas.origin.y * INITIAL_VIEW_SCALE
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

  const visibleSegmentIdSet = useMemo(
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

  const [toolbarSearch, setToolbarSearch] = useState('')
  const searchResults = useMemo(() => {
    const q = String(toolbarSearch ?? '').trim().toLowerCase()
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
  }, [toolbarSearch, allNodesById])

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

  const resetSelections = () => {
    selectNodeId(null)
    selectSegmentId(null)
    setSelectedPortalKey(null)
    setSelectedProgressLevelId(null)
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
      const { exportSvgFromElement } = await import('./svgExport')
      const exported = exportSvgFromElement(canvasSvgRef.current, {
        fileName: 'skilltree-roadmap.svg',
        includeTooltips: true,
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
      const { exportSvgFromElement } = await import('./svgExport')
      const exported = exportSvgFromElement(canvasSvgRef.current, {
        fileName: 'skilltree-roadmap-clean.svg',
        includeTooltips: false,
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
      const { exportHtmlFromSkillTree } = await import('./htmlExport')
      const exported = exportHtmlFromSkillTree({
        svgElement: canvasSvgRef.current,
        roadmapDocument: roadmapData,
        title: 'Skill Tree Roadmap',
        metadata: {
          brandName: EXPORT_BRAND_NAME,
          author: EXPORT_AUTHOR,
        },
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
      const { tryExportPdfFromSkillTree } = await import('./pdfExport')
      const exported = tryExportPdfFromSkillTree({
        svgElement: canvasSvgRef.current,
        roadmapDocument: roadmapData,
        title: 'Skill Tree Roadmap',
        metadata: {
          brandName: EXPORT_BRAND_NAME,
          author: EXPORT_AUTHOR,
        },
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
      const { readDocumentFromHtmlText } = await import('./htmlExport')
      const nextDocument = readDocumentFromHtmlText(rawText)
      dispatchDocument({ type: 'replace', document: nextDocument })
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

            const { exportHtmlFromSkillTree } = await import('./htmlExport')
            const exported = exportHtmlFromSkillTree({
              svgElement: canvasSvgRef.current,
              roadmapDocument: roadmapData,
              title: 'Skill Tree Roadmap',
              metadata: {
                brandName: EXPORT_BRAND_NAME,
                author: EXPORT_AUTHOR,
              },
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

  const handleCreateSegmentForManager = () => {
    try {
      handleCreateSegment()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String(e) }
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
    } catch (e) {
      return { ok: false, error: String(e) }
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
    } catch (e) {
      return { ok: false, error: String(e) }
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

  const handleStatusChange = (newStatus) => {
    if ((!selectedNodeId && !(Array.isArray(selectedNodeIds) && selectedNodeIds.length > 0)) || !activeSelectedProgressLevelId) {
      return
    }

    applyToSelectedNodes((tree, id) => {
      const node = findNodeById(tree, id)
      const levels = Array.isArray(node?.levels) ? node.levels : []
      let next = tree
      for (const level of levels) {
        next = updateNodeProgressLevel(next, id, level.id, { status: newStatus })
      }
      return next
    }, { applyToAllLevels: true, description: 'Status ändern' })
  }

  const handleReleaseNoteChange = (releaseNote) => {
    if ((!selectedNodeId && !(Array.isArray(selectedNodeIds) && selectedNodeIds.length > 0)) || !activeSelectedProgressLevelId) {
      return
    }

    applyToSelectedNodes((tree, id) => updateNodeProgressLevel(tree, id, activeSelectedProgressLevelId, { releaseNote }))
  }

  const handleLevelScopesChange = (scopeIds) => {
    if ((!selectedNodeId && !(Array.isArray(selectedNodeIds) && selectedNodeIds.length > 0)) || !activeSelectedProgressLevelId) {
      return
    }

    applyToSelectedNodes((tree, id) => {
      const node = findNodeById(tree, id)
      const levels = Array.isArray(node?.levels) ? node.levels : []
      let next = tree
      for (const level of levels) {
        next = updateNodeProgressLevel(next, id, level.id, { scopeIds })
      }
      return next
    }, { applyToAllLevels: true, description: 'Scopes (Level) ändern' })
  }

  const handleCreateScope = (scopeLabel) => {
    const result = addScopeWithResult(roadmapData, scopeLabel)

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

    const nextTree = selectedNodeId && activeSelectedProgressLevelId
      ? updateNodeProgressLevel(result.tree, selectedNodeId, activeSelectedProgressLevelId, {
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

    commitDocument(addNodeProgressLevel(roadmapData, selectedNodeId))
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
      } catch (e) {
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

      <Paper
        className={isToolbarCollapsed ? 'skill-tree-toolbar skill-tree-toolbar--collapsed' : 'skill-tree-toolbar'}
        radius="xl"
        shadow="xl"
        withBorder
      >
        <Group gap="xs" wrap="nowrap" className="skill-tree-toolbar__row">
          <Tooltip label={isToolbarCollapsed ? 'Menü aufklappen' : 'Menü einklappen'} withArrow openDelay={120}>
            <ActionIcon
              size="md"
              variant="default"
              aria-label={isToolbarCollapsed ? 'Menü aufklappen' : 'Menü einklappen'}
              onClick={() => {
                setIsToolbarCollapsed((prev) => !prev)
              }}
            >
              <ToolbarIcon>
                {isToolbarCollapsed ? (
                  <path d="m9 6 6 6-6 6" />
                ) : (
                  <path d="m15 6-6 6 6 6" />
                )}
              </ToolbarIcon>
            </ActionIcon>
          </Tooltip>

          <div className="skill-tree-toolbar__actions">
            <div className="skill-tree-toolbar__cluster">
              <Menu
                shadow="md"
                width={200}
                position="bottom-start"
                withArrow
                trigger="hover"
                openDelay={100}
                closeDelay={180}
              >
                <Menu.Target>
                  <Tooltip
                    label="Export (Klick: HTML, Hover: weitere Formate)"
                    withArrow
                    openDelay={120}
                  >
                    <ActionIcon
                      size="md"
                      variant="default"
                      aria-label="Export"
                      onClick={() => void handleExportHtml()}
                    >
                      <ToolbarIcon>
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </ToolbarIcon>
                    </ActionIcon>
                  </Tooltip>
                </Menu.Target>

                <Menu.Dropdown>
                  <Menu.Label>Export</Menu.Label>
                  <Menu.Item onClick={() => void handleExportPdf()}>
                    PDF (statisch)
                  </Menu.Item>
                  <Menu.Item onClick={() => void handleExportSvg()}>
                    SVG (interaktiv)
                  </Menu.Item>
                  <Menu.Item onClick={() => void handleExportCleanSvg()}>
                    SVG (clean)
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>

              <Tooltip label="HTML importieren (Ctrl+O)" withArrow openDelay={120}>
                <ActionIcon
                  size="md"
                  variant="default"
                  aria-label="HTML importieren"
                  onClick={handleOpenDocumentPicker}
                >
                  <ToolbarIcon>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </ToolbarIcon>
                </ActionIcon>
              </Tooltip>
            </div>

            <div className="skill-tree-toolbar__cluster">
              <Tooltip label="Undo (Ctrl+Z)" withArrow openDelay={120}>
                <ActionIcon
                  size="md"
                  variant="default"
                  aria-label="Undo"
                  onClick={handleUndo}
                  disabled={!canUndo}
                >
                  <ToolbarIcon>
                    <path d="M3 7h7" />
                    <path d="m3 7 3-3" />
                    <path d="m3 7 3 3" />
                    <path d="M21 14a7 7 0 0 0-7-7H9" />
                  </ToolbarIcon>
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Redo (Ctrl+Y / Ctrl+Shift+Z)" withArrow openDelay={120}>
                <ActionIcon
                  size="md"
                  variant="default"
                  aria-label="Redo"
                  onClick={handleRedo}
                  disabled={!canRedo}
                >
                  <ToolbarIcon>
                    <path d="M21 7h-7" />
                    <path d="m21 7-3-3" />
                    <path d="m21 7-3 3" />
                    <path d="M3 14a7 7 0 0 1 7-7h5" />
                  </ToolbarIcon>
                </ActionIcon>
              </Tooltip>
            </div>

            <div className="skill-tree-toolbar__cluster">
              <Tooltip label="Reset (Ctrl+Shift+Backspace)" withArrow openDelay={120}>
                <ActionIcon
                  size="md"
                  variant="subtle"
                  color="red"
                  aria-label="Reset"
                  onClick={handleReset}
                >
                  <ToolbarIcon>
                    <polyline points="1 4 1 10 7 10" />
                    <path d="M3.51 15a9 9 0 1 0 2.13-8.87" />
                  </ToolbarIcon>
                </ActionIcon>
              </Tooltip>
            </div>

            <div className="skill-tree-toolbar__cluster">
              <Tooltip label="Segmente verwalten" withArrow openDelay={120}>
                <ActionIcon
                  size="md"
                  variant="default"
                  aria-label="Segmente verwalten"
                  onClick={handleOpenSegmentManager}
                >
                  <ToolbarIcon>
                    <path d="M19 5L5 19" />
                    <circle cx="6.5" cy="6.5" r="2.5" />
                    <circle cx="17.5" cy="17.5" r="2.5" />
                  </ToolbarIcon>
                </ActionIcon>
              </Tooltip>
            </div>

            <div className="skill-tree-toolbar__cluster">
              <Tooltip label="Scopes verwalten" withArrow openDelay={120}>
                <ActionIcon
                  size="md"
                  variant="default"
                  aria-label="Scopes verwalten"
                  onClick={handleOpenScopeManager}
                >
                  <ToolbarIcon>
                    <path d="M3 6h18" />
                    <path d="M6 12h12" />
                    <path d="M9 18h6" />
                  </ToolbarIcon>
                </ActionIcon>
              </Tooltip>
            </div>

            <div className="skill-tree-toolbar__cluster">
              <Menu shadow="md" width={220} position="bottom-start" withArrow>
                <Menu.Target>
                  <Tooltip
                    label={scopeOptions.length > 0 ? `Scope Filter: ${selectedScopeFilterLabel}` : 'Keine Scopes vorhanden'}
                    withArrow
                    openDelay={120}
                  >
                    <ActionIcon
                      size="md"
                      variant="default"
                      aria-label="Scope Filter"
                      disabled={scopeOptions.length === 0}
                    >
                      <ToolbarIcon>
                        <path d="M3 6h18" />
                        <path d="M7 12h10" />
                        <path d="M10 18h4" />
                      </ToolbarIcon>
                    </ActionIcon>
                  </Tooltip>
                </Menu.Target>

                <Menu.Dropdown>
                  <Menu.Label>Scope Filter</Menu.Label>
                  <Menu.Item onClick={() => setSelectedScopeFilterId(SCOPE_FILTER_ALL)}>
                    {selectedScopeFilterId === SCOPE_FILTER_ALL ? '● ' : ''}
                    Alle Scopes
                  </Menu.Item>
                  <Menu.Divider />
                  {scopeOptions.map((scope) => (
                    <Menu.Item key={scope.value} onClick={() => setSelectedScopeFilterId(scope.value)}>
                      {selectedScopeFilterId === scope.value ? '● ' : ''}
                      {scope.label}
                    </Menu.Item>
                  ))}
                </Menu.Dropdown>
              </Menu>

              <Menu shadow="md" width={220} position="bottom-start" withArrow>
                <Menu.Target>
                  <Tooltip label={`Release Filter: ${selectedReleaseFilterLabel}`} withArrow openDelay={120}>
                    <ActionIcon
                      size="md"
                      variant="default"
                      aria-label="Release Filter"
                    >
                      <ToolbarIcon>
                        <path d="M4 4h16v5H4z" />
                        <path d="M4 10h16v5H4z" />
                        <path d="M4 16h16v4H4z" />
                      </ToolbarIcon>
                    </ActionIcon>
                  </Tooltip>
                </Menu.Target>

                <Menu.Dropdown>
                  <Menu.Label>Release Filter</Menu.Label>
                  <Menu.Item onClick={() => setReleaseFilter(RELEASE_FILTER_OPTIONS.all)}>
                    {releaseFilter === RELEASE_FILTER_OPTIONS.all ? '● ' : ''}
                    All
                  </Menu.Item>
                  <Menu.Item onClick={() => setReleaseFilter(RELEASE_FILTER_OPTIONS.now)}>
                    {releaseFilter === RELEASE_FILTER_OPTIONS.now ? '● ' : ''}
                    Now (Done minimal, Later ausgeblendet)
                  </Menu.Item>
                  <Menu.Item onClick={() => setReleaseFilter(RELEASE_FILTER_OPTIONS.next)}>
                    {releaseFilter === RELEASE_FILTER_OPTIONS.next ? '● ' : ''}
                    Next (Done/Later minimal)
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </div>

            <div className="skill-tree-toolbar__cluster">
              <div className="skill-tree-toolbar__search">
                <input
                  aria-label="Node search"
                  placeholder="Suche Knoten…"
                  value={toolbarSearch}
                  onChange={(e) => setToolbarSearch(e.target.value)}
                />
                {searchResults.length > 0 && (
                  <ul className="skill-tree-toolbar__search-results" role="listbox">
                    {searchResults.map((n) => (
                      <li
                        key={n.id}
                        role="option"
                        onMouseDown={(ev) => {
                          ev.preventDefault()
                          handleSelectNode(n.id)
                          setToolbarSearch('')
                        }}
                      >
                        {n.label} {n.shortName ? `(${n.shortName})` : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <Text size="xs" c="dimmed" className="skill-tree-toolbar__status">{autosaveLabel}</Text>
            </div>
          </div>
        </Group>
      </Paper>

      <TransformWrapper
        key={transformKey}
        minScale={0.2}
        maxScale={2.2}
        initialScale={INITIAL_VIEW_SCALE}
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
          <svg
            ref={canvasSvgRef}
            width={canvas.width}
            height={canvas.height}
            viewBox={`0 0 ${canvas.width} ${canvas.height}`}
            className="skill-tree-canvas"
            onClick={() => {
                selectNodeId(null)
                selectSegmentId(null)
                setSelectedPortalKey(null)
              }}
          >
            <defs>
              <radialGradient id="nodeHalo" cx="50%" cy="50%" r="60%">
                <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#020617" stopOpacity="0" />
              </radialGradient>
            </defs>

            <circle cx={canvas.origin.x} cy={canvas.origin.y} r={canvas.maxRadius + 160} fill="url(#nodeHalo)" />

            <g
              className="skill-tree-center-icon skill-tree-clickable"
              transform={`translate(${canvas.origin.x}, ${canvas.origin.y})`}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={handleOpenCenterIconPanel}
            >
              <foreignObject
                key={centerIconSource}
                x={-centerIconSize / 2}
                y={-centerIconSize / 2}
                width={centerIconSize}
                height={centerIconSize}
                className="skill-tree-center-icon__foreign"
              >
                <img
                  src={centerIconSource}
                  alt="Center Icon"
                  className="skill-tree-center-icon__image"
                />
              </foreignObject>
              <circle r={centerIconSize / 2 + 8} className="skill-tree-center-icon__hit-area" />
            </g>

            <g>
              {filteredSegmentSeparators.map((separator) => (
                <path
                  key={separator.id}
                  d={separator.path}
                  data-segment-left={separator.leftSegmentId ?? ''}
                  data-segment-right={separator.rightSegmentId ?? ''}
                  fill="none"
                  stroke="#1e3a8a"
                  strokeOpacity="0.7"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              ))}
            </g>

            {filteredSegmentLabels.map((segmentLabel) => {
              const isSelected = segmentLabel.segmentId === selectedSegmentId
              const labelWidth = Math.max(88, segmentLabel.text.length * 10)

              return (
                <g
                  key={segmentLabel.id}
                  data-segment-id={segmentLabel.segmentId}
                  transform={`translate(${segmentLabel.x} ${segmentLabel.y}) rotate(${segmentLabel.rotation})`}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    handleSelectSegment(segmentLabel.segmentId)
                  }}
                  className="skill-tree-clickable"
                >
                  <rect
                    x={-(labelWidth / 2) - 10}
                    y={-12}
                    width={labelWidth + 20}
                    height={24}
                    rx={12}
                    fill={isSelected ? 'rgba(34, 211, 238, 0.12)' : 'transparent'}
                    stroke={isSelected ? 'rgba(103, 232, 249, 0.6)' : 'transparent'}
                    strokeWidth="1.5"
                  />
                  <text
                    x="0"
                    y="1"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className={isSelected ? 'skill-tree-segment-label skill-tree-segment-label--selected' : 'skill-tree-segment-label'}
                  >
                    {segmentLabel.text}
                  </text>
                </g>
              )
            })}

            {filteredLinks.filter((link) => link.linkKind === 'ring').map((link) => {
              const segmentNode = link.targetId ? layoutNodesById.get(link.targetId) : null
              const nodeStatus = segmentNode ? normalizeStatusKey(segmentNode.status) : 'later'
              const statusStyle = STATUS_STYLES[nodeStatus] ?? STATUS_STYLES.later

              return (
                <path
                  key={link.id}
                  d={link.path}
                  data-link-source-id={link.sourceId ?? ''}
                  data-link-target-id={link.targetId ?? ''}
                  stroke={statusStyle.linkStroke}
                  strokeWidth="4"
                  strokeOpacity={statusStyle.linkOpacity}
                  strokeLinecap="round"
                  fill="none"
                />
              )
            })}
            {filteredLinks.filter((link) => link.sourceDepth > 0 && link.linkKind !== 'ring').map((link) => {
              const childNode = link.targetId ? layoutNodesById.get(link.targetId) : null
              const nodeStatus = childNode ? normalizeStatusKey(childNode.status) : 'later'
              const statusStyle = STATUS_STYLES[nodeStatus] ?? STATUS_STYLES.later

              return (
                <path
                  key={link.id}
                  d={link.path}
                  data-link-source-id={link.sourceId ?? ''}
                  data-link-target-id={link.targetId ?? ''}
                  stroke={statusStyle.linkStroke}
                  strokeWidth={statusStyle.linkStrokeWidth}
                  strokeOpacity={statusStyle.linkOpacity}
                  strokeDasharray={statusStyle.linkStrokeDasharray || 'none'}
                  strokeLinecap="round"
                  fill="none"
                />
              )
            })}

            {renderedNodes.map((node) => {
              const visibilityMode = nodeVisibilityModeById.get(node.id) ?? 'full'
              const nodeSize = visibilityMode === 'minimal' ? MINIMAL_NODE_SIZE : TREE_CONFIG.nodeSize

              return (
                <SkillNode
                  key={node.id}
                  node={node}
                  nodeSize={nodeSize}
                  displayMode={visibilityMode}
                  isSelected={node.id === selectedNodeId || selectedNodeIds.includes(node.id)}
                  onSelect={handleSelectNode}
                />
              )
            })}

            {visibleDependencyPortals.map((portal) => {
              const isPortalSelected = portal.key === selectedPortalKey
              const portalClassName = [
                'skill-tree-portal',
                portal.isInteractive ? 'skill-tree-portal--interactive' : '',
                isPortalSelected ? 'skill-tree-portal--selected' : '',
              ].filter(Boolean).join(' ')

              return (
                <Tooltip
                  key={portal.key}
                  withArrow
                  multiline
                  openDelay={80}
                  closeDelay={40}
                  transitionProps={{ transition: 'fade', duration: 120 }}
                  classNames={{ tooltip: 'skill-node-tooltip', arrow: 'skill-node-tooltip__arrow' }}
                  label={(
                    <div>
                      <Text className="skill-node-tooltip__title">{portal.otherLabel}</Text>
                      <Text className="skill-node-tooltip__note">{portal.tooltip}</Text>
                    </div>
                  )}
                >
                  <g
                    className={`${portalClassName} skill-tree-export-exclude`}
                    data-portal-node-id={portal.nodeId}
                    data-portal-source-id={portal.sourceId}
                    data-portal-target-id={portal.targetId}
                    transform={`translate(${portal.x} ${portal.y})`}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation()
                      if (portal.isInteractive) {
                        handleSelectPortal(portal)
                      }
                    }}
                  >
                    <circle className="skill-tree-portal__hit" r="30" />
                    <circle className={`skill-tree-portal__halo skill-tree-portal__halo--${portal.type}`} r="26" />
                    <circle className={`skill-tree-portal__core skill-tree-portal__core--${portal.type}`} r="16" />
                    <text
                      className="skill-tree-portal__label"
                      x="0"
                      y="0"
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      {portal.otherLabel}
                    </text>
                  </g>
                </Tooltip>
              )
            })}

            {emptyStateAddControl && (
              <g
                className="skill-tree-clickable skill-tree-export-exclude"
                data-add-control="root-initial"
                transform={`translate(${emptyStateAddControl.x}, ${emptyStateAddControl.y})`}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  handleAddInitialRoot()
                }}
              >
                <circle r="22" className="skill-tree-add-circle" strokeWidth="2.5" />
                <text
                  x="0"
                  y="1"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="skill-tree-add-text skill-tree-add-text--large"
                >
                  +
                </text>
                <text
                  x="0"
                  y="42"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="skill-tree-empty-state-label"
                >
                  Skill hinzufügen
                </text>
              </g>
            )}

            {emptySegmentAddControl && (
              <g
                className="skill-tree-clickable skill-tree-export-exclude"
                data-add-control="segment-initial"
                transform={`translate(${emptySegmentAddControl.x}, ${emptySegmentAddControl.y})`}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  handleAddInitialSegment()
                }}
              >
                <circle r="18" className="skill-tree-add-circle skill-tree-add-circle--segment" strokeWidth="2.5" />
                <text
                  x="0"
                  y="1"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="skill-tree-add-text skill-tree-add-text--secondary"
                >
                  +
                </text>
                <text
                  x="0"
                  y="36"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="skill-tree-empty-state-label"
                >
                  Segment hinzufügen
                </text>
              </g>
            )}

            {selectedSegmentLabel && selectedSegmentControlGeometry && (
              <g className="skill-tree-export-exclude">
                <g
                  data-add-control="segment-near"
                  data-segment-id={selectedSegmentLabel.segmentId}
                  data-direction="left"
                  transform={`translate(${selectedSegmentControlGeometry.left.x}, ${selectedSegmentControlGeometry.left.y})`}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    handleAddSegmentNear(selectedSegmentLabel.segmentId, 'left')
                  }}
                  className="skill-tree-clickable"
                >
                  <circle r="16" className="skill-tree-add-circle skill-tree-add-circle--segment" strokeWidth="2.5" />
                  <text
                    x="0"
                    y="1"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="skill-tree-add-text skill-tree-add-text--small skill-tree-add-text--secondary"
                  >
                    +
                  </text>
                </g>

                <g
                  data-add-control="segment-near"
                  data-segment-id={selectedSegmentLabel.segmentId}
                  data-direction="right"
                  transform={`translate(${selectedSegmentControlGeometry.right.x}, ${selectedSegmentControlGeometry.right.y})`}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    handleAddSegmentNear(selectedSegmentLabel.segmentId, 'right')
                  }}
                  className="skill-tree-clickable"
                >
                  <circle r="16" className="skill-tree-add-circle skill-tree-add-circle--segment" strokeWidth="2.5" />
                  <text
                    x="0"
                    y="1"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="skill-tree-add-text skill-tree-add-text--small skill-tree-add-text--secondary"
                  >
                    +
                  </text>
                </g>
              </g>
            )}

            {selectedLayoutNode && selectedControlGeometry && (
              <g className="skill-tree-export-exclude">
                <g
                  data-add-control="child"
                  data-node-id={selectedLayoutNode.id}
                  transform={`translate(${selectedControlGeometry.child.x}, ${selectedControlGeometry.child.y})`}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    handleAddChild(selectedLayoutNode.id)
                  }}
                  className="skill-tree-clickable"
                >
                  <circle r="18" className="skill-tree-add-circle" strokeWidth="2.5" />
                  <text
                    x="0"
                    y="1"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="skill-tree-add-text"
                  >
                    +
                  </text>
                </g>

                {selectedLayoutNode.depth === 1 && selectedLayoutNode.level === 1 && (
                  <g>
                    <g
                      data-add-control="root-near"
                      data-node-id={selectedLayoutNode.id}
                      data-direction="left"
                      transform={`translate(${selectedControlGeometry.left.x}, ${selectedControlGeometry.left.y})`}
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation()
                        handleAddRootNear(selectedLayoutNode.id, 'left')
                      }}
                      className="skill-tree-clickable"
                    >
                      <circle r="18" className="skill-tree-add-circle skill-tree-add-circle--secondary" strokeWidth="2.5" />
                      <text
                        x="0"
                        y="1"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="skill-tree-add-text skill-tree-add-text--secondary"
                      >
                        +
                      </text>
                    </g>

                    <g
                      data-add-control="root-near"
                      data-node-id={selectedLayoutNode.id}
                      data-direction="right"
                      transform={`translate(${selectedControlGeometry.right.x}, ${selectedControlGeometry.right.y})`}
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation()
                        handleAddRootNear(selectedLayoutNode.id, 'right')
                      }}
                      className="skill-tree-clickable"
                    >
                      <circle r="18" className="skill-tree-add-circle skill-tree-add-circle--secondary" strokeWidth="2.5" />
                      <text
                        x="0"
                        y="1"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="skill-tree-add-text skill-tree-add-text--secondary"
                      >
                        +
                      </text>
                    </g>
                  </g>
                )}
              </g>
            )}
          </svg>
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
        onCreateSegment={handleCreateSegmentForManager}
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
