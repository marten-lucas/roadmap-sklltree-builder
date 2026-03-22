import { ActionIcon, Group, Menu, Paper, Text, Tooltip } from '@mantine/core'
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
import { SkillNode } from './SkillNode'
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
  addNodeProgressLevel,
  addInitialRootNodeWithResult,
  addInitialSegmentWithResult,
  addRootNodeNearWithResult,
  addSegmentNearWithResult,
  deleteSegment,
  deleteNodeBranch,
  deleteNodeOnly,
  findParentNodeId,
  findNodeById,
  getNodeAdditionalDependencies,
  getNodeLevelInfo,
  moveNodeToParent,
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

const isAngleNear = (candidate, blocked, thresholdDeg) => {
  return Math.abs(getAngleDelta(candidate, blocked)) < thresholdDeg
}

const AUTOSAVE_DEBOUNCE_MS = 450
const EXPORT_BRAND_NAME = 'Roadmap Skilltree Builder'
const EXPORT_AUTHOR = 'Skilltree Team'

const getInitialRoadmapDocument = () => loadDocumentFromLocalStorage() ?? initialData

const isEditableElement = (target) => {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
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
  const [selectedProgressLevelId, setSelectedProgressLevelId] = useState(null)
  const [selectedSegmentId, setSelectedSegmentId] = useState(null)
  const [selectedPortalKey, setSelectedPortalKey] = useState(null)
  const [isCenterIconPanelOpen, setIsCenterIconPanelOpen] = useState(false)
  const [isToolbarCollapsed, setIsToolbarCollapsed] = useState(false)
  const addControlOffset = TREE_CONFIG.nodeSize * 0.82

  const { layout, diagnostics } = useMemo(
    () => solveSkillTreeLayout(roadmapData, TREE_CONFIG),
    [roadmapData],
  )
  const { nodes, links, segments, canvas } = layout
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
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  )

  const selectedSegmentLabel = useMemo(
    () => segments.labels.find((segmentLabel) => segmentLabel.segmentId === selectedSegmentId) ?? null,
    [segments.labels, selectedSegmentId],
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
    setIsCenterIconPanelOpen(true)
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

  const resetSelections = () => {
    setSelectedNodeId(null)
    setSelectedSegmentId(null)
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
    resetSelections()
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

      if (action === 'reset') {
        event.preventDefault()
        if (!confirmResetDocument()) {
          return
        }
        dispatchDocument({ type: 'apply', document: createEmptyDocument() })
        setSelectedNodeId(null)
        setSelectedSegmentId(null)
        setSelectedPortalKey(null)
        setSelectedProgressLevelId(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [canRedo, canUndo, roadmapData])

  const autosaveLabel = lastSavedAt
    ? `Autosave ${lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
    : 'Autosave aktiv'

  const handleAddChild = (parentId) => {
    const result = addChildNodeWithResult(roadmapData, parentId)
    const createdNodeId = result.createdNodeId
    commitDocument(result.tree)

    if (createdNodeId) {
      setSelectedNodeId(createdNodeId)
      setSelectedPortalKey(null)
    }
  }

  const handleAddRootNear = (anchorRootId, side) => {
    const result = addRootNodeNearWithResult(roadmapData, anchorRootId, side)
    const createdNodeId = result.createdNodeId
    commitDocument(result.tree)

    if (createdNodeId) {
      setSelectedNodeId(createdNodeId)
      setSelectedPortalKey(null)
    }
  }

  const handleAddSegmentNear = (anchorSegmentId, side) => {
    const result = addSegmentNearWithResult(roadmapData, anchorSegmentId, side)
    const createdSegmentId = result.createdSegmentId
    commitDocument(result.tree)

    if (createdSegmentId) {
      setSelectedNodeId(null)
      setSelectedSegmentId(createdSegmentId)
      setSelectedPortalKey(null)
    }
  }

  const handleAddInitialSegment = () => {
    const result = addInitialSegmentWithResult(roadmapData)
    const createdSegmentId = result.createdSegmentId
    commitDocument(result.tree)

    if (createdSegmentId) {
      setSelectedNodeId(null)
      setSelectedSegmentId(createdSegmentId)
      setSelectedPortalKey(null)
    }
  }

  const handleAddInitialRoot = () => {
    const result = addInitialRootNodeWithResult(roadmapData)
    const createdNodeId = result.createdNodeId
    commitDocument(result.tree)

    if (createdNodeId) {
      setSelectedNodeId(createdNodeId)
      setSelectedPortalKey(null)
    }
  }

  const handleSelectNode = (nodeId) => {
    setSelectedNodeId(nodeId)
    setSelectedSegmentId(null)
    setSelectedPortalKey(null)
  }

  const handleSelectSegment = (segmentId) => {
    setSelectedSegmentId(segmentId)
    setSelectedNodeId(null)
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

    updateNodeData(selectedNodeId, newLabel, selectedNode.status)
  }

  const handleShortNameChange = (newShortName) => {
    if (!selectedNodeId) {
      return
    }

    commitDocument(updateNodeShortName(roadmapData, selectedNodeId, newShortName))
  }

  const handleStatusChange = (newStatus) => {
    if (!selectedNodeId || !activeSelectedProgressLevelId) {
      return
    }

    commitDocument(
      updateNodeProgressLevel(roadmapData, selectedNodeId, activeSelectedProgressLevelId, {
        status: newStatus,
      }),
    )
  }

  const handleReleaseNoteChange = (releaseNote) => {
    if (!selectedNodeId || !activeSelectedProgressLevelId) {
      return
    }

    commitDocument(
      updateNodeProgressLevel(roadmapData, selectedNodeId, activeSelectedProgressLevelId, {
        releaseNote,
      }),
    )
  }

  const handleAdditionalDependenciesChange = (nextDependencyIds) => {
    if (!selectedNodeId) {
      return
    }

    commitDocument(
      setNodeAdditionalDependencies(roadmapData, selectedNodeId, nextDependencyIds),
    )
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
    if (!selectedNodeId) {
      return
    }

    commitDocument(deleteNodeOnly(roadmapData, selectedNodeId))
    setSelectedNodeId(null)
    setSelectedPortalKey(null)
  }

  const handleDeleteNodeBranch = () => {
    if (!selectedNodeId) {
      return
    }

    commitDocument(deleteNodeBranch(roadmapData, selectedNodeId))
    setSelectedNodeId(null)
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
    setSelectedSegmentId(null)
    setSelectedPortalKey(null)
  }

  return (
    <main className="skill-tree-shell">
      <input
        ref={documentFileInputRef}
        type="file"
        accept="text/html,.html"
        style={{ display: 'none' }}
        onChange={handleDocumentFileSelected}
      />

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
              <Text size="xs" c="dimmed" className="skill-tree-toolbar__status">{autosaveLabel}</Text>
            </div>
          </div>
        </Group>
      </Paper>

      <TransformWrapper
        minScale={0.2}
        maxScale={2.2}
        initialScale={0.7}
        wheel={{ step: 0.12 }}
        limitToBounds={false}
        centerOnInit
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
              setSelectedNodeId(null)
              setSelectedSegmentId(null)
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
              {segments.separators.map((separator) => (
                <path
                  key={separator.id}
                  d={separator.path}
                  fill="none"
                  stroke="#1e3a8a"
                  strokeOpacity="0.7"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              ))}
            </g>

            {segments.labels.map((segmentLabel) => {
              const isSelected = segmentLabel.segmentId === selectedSegmentId
              const labelWidth = Math.max(88, segmentLabel.text.length * 10)

              return (
                <g
                  key={segmentLabel.id}
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

            {links.filter((link) => link.linkKind === 'ring').map((link) => {
              const segmentNode = nodes.find((node) => node.id === link.id.split('-')[2])
              const nodeStatus = segmentNode ? normalizeStatusKey(segmentNode.status) : 'later'
              const statusStyle = STATUS_STYLES[nodeStatus] ?? STATUS_STYLES.later

              return (
                <path
                  key={link.id}
                  d={link.path}
                  stroke={statusStyle.linkStroke}
                  strokeWidth="4"
                  strokeOpacity={statusStyle.linkOpacity}
                  strokeLinecap="round"
                  fill="none"
                />
              )
            })}
            {links.filter((link) => link.sourceDepth > 0 && link.linkKind !== 'ring').map((link) => {
              const childNodeId = link.id.split('=>')[1]
              const childNode = nodes.find((node) => node.id === childNodeId)
              const nodeStatus = childNode ? normalizeStatusKey(childNode.status) : 'later'
              const statusStyle = STATUS_STYLES[nodeStatus] ?? STATUS_STYLES.later

              return (
                <path
                  key={link.id}
                  d={link.path}
                  stroke={statusStyle.linkStroke}
                  strokeWidth={statusStyle.linkStrokeWidth}
                  strokeOpacity={statusStyle.linkOpacity}
                  strokeDasharray={statusStyle.linkStrokeDasharray || 'none'}
                  strokeLinecap="round"
                  fill="none"
                />
              )
            })}

            {nodes.map((node) => (
              <SkillNode
                key={node.id}
                node={node}
                nodeSize={TREE_CONFIG.nodeSize}
                isSelected={node.id === selectedNodeId}
                onSelect={handleSelectNode}
              />
            ))}

            {dependencyPortals.map((portal) => {
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

      <InspectorPanel
        selectedNode={selectedNode}
        currentLevel={levelInfo.nodeLevel}
        selectedProgressLevelId={activeSelectedProgressLevelId}
        onClose={() => {
          setSelectedNodeId(null)
        }}
        onLabelChange={handleLabelChange}
        onShortNameChange={handleShortNameChange}
        onStatusChange={handleStatusChange}
        onReleaseNoteChange={handleReleaseNoteChange}
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
          if (!selectedNodeId) {
            return
          }

          const nextParentId = nextParentKey === '__root__' ? null : nextParentKey
          commitDocument(moveNodeToParent(roadmapData, selectedNodeId, nextParentId))
        }}
        onSegmentChange={(nextSegmentKey) => {
          const nextSegmentId = nextSegmentKey === UNASSIGNED_SEGMENT_ID ? null : nextSegmentKey

          const validation = validateNodeSegmentChange(roadmapData, selectedNodeId, nextSegmentId, TREE_CONFIG)
          commitDocument(validation.isAllowed ? validation.tree : roadmapData)
        }}
        onAdditionalDependenciesChange={handleAdditionalDependenciesChange}
        onDeleteNodeOnly={handleDeleteNodeOnly}
        onDeleteNodeBranch={handleDeleteNodeBranch}
      />

      <SegmentPanel
        selectedSegment={selectedSegment}
        onClose={() => setSelectedSegmentId(null)}
        onLabelChange={handleSegmentLabelChange}
        onDelete={handleDeleteSegment}
      />

      <CenterIconPanel
        isOpen={isCenterIconPanelOpen}
        iconSource={centerIconSource}
        onClose={() => setIsCenterIconPanelOpen(false)}
        onUpload={handleCenterIconUpload}
        onResetDefault={handleResetCenterIcon}
      />
    </main>
  )
}
