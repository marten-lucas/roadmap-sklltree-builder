import { getPortalCounterpartNodeIdFromData } from './nodeInteraction'

const SVG_NS = 'http://www.w3.org/2000/svg'

export const INTERACTIVE_SVG_RUNTIME_STYLE_TEXT = `
.skill-node-export-anchor[data-selected="true"] .skill-node-button {
  box-shadow: 0 0 0 2px rgba(103, 232, 249, 0.92), 0 0 0 6px rgba(103, 232, 249, 0.14);
}

.skill-tree-segment-label.skill-tree-segment-label--selected {
  fill: #a5f3fc;
}
`

export const buildInteractiveSvgRuntimeScript = () => `
(() => {
  const currentScript = typeof document !== 'undefined' ? document.currentScript : null
  const svgRoot = currentScript?.ownerSVGElement || document.querySelector('svg')
  if (!svgRoot || svgRoot.__skilltreeInteractiveSvgReady) {
    return
  }

  svgRoot.__skilltreeInteractiveSvgReady = true

  const nodeAnchors = Array.from(svgRoot.querySelectorAll('foreignObject.skill-node-export-anchor'))
  const portalElements = Array.from(svgRoot.querySelectorAll('[data-portal-key]'))
  const segmentLabels = Array.from(svgRoot.querySelectorAll('[data-segment-id]'))
  const nodeAnchorById = new Map(
    nodeAnchors
      .map((anchor) => [String(anchor.getAttribute('data-node-id') ?? ''), anchor])
      .filter(([nodeId]) => nodeId),
  )
  const portalElementsByBaseKey = new Map()
  const readonlySelectionState = {
    nodeId: null,
    segmentId: null,
    portalKey: null,
  }
  const defaultViewBox = String(svgRoot.getAttribute('viewBox') ?? '').trim()
  const getPortalCounterpartNodeId = ${getPortalCounterpartNodeIdFromData.toString()}

  portalElements.forEach((portalElement) => {
    const portalKey = String(portalElement.getAttribute('data-portal-key') ?? '')
    const baseKey = portalKey.replace(/:(?:source|target)$/, '')
    if (!baseKey) {
      return
    }

    const relatedElements = portalElementsByBaseKey.get(baseKey) ?? []
    relatedElements.push(portalElement)
    portalElementsByBaseKey.set(baseKey, relatedElements)
  })

  const parseViewBox = (rawValue) => {
    const parts = String(rawValue ?? '').trim().split(/[,\t\r\n\f ]+/).map((part) => Number.parseFloat(part))
    if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
      return null
    }

    return {
      x: parts[0],
      y: parts[1],
      width: parts[2],
      height: parts[3],
    }
  }

  const syncReadonlySelection = () => {
    nodeAnchors.forEach((anchor) => {
      const isSelected = !!readonlySelectionState.nodeId && anchor.getAttribute('data-node-id') === readonlySelectionState.nodeId
      anchor.setAttribute('data-selected', isSelected ? 'true' : 'false')
    })

    segmentLabels.forEach((label) => {
      const segmentId = label.getAttribute('data-segment-id')
      const isSelected = !!segmentId && segmentId === readonlySelectionState.segmentId
      const text = label.querySelector('.skill-tree-segment-label') || label.querySelector('text')
      text?.classList.toggle('skill-tree-segment-label--selected', isSelected)
    })

    portalElements.forEach((portalElement) => {
      const portalKey = String(portalElement.getAttribute('data-portal-key') ?? '')
      portalElement.classList.toggle('skill-tree-portal--selected', !!portalKey && portalKey === readonlySelectionState.portalKey)
    })
  }

  const clearPortalPeerHighlight = () => {
    portalElements.forEach((portalElement) => {
      portalElement.classList.remove('skill-tree-portal--peer-hovered')
    })

    nodeAnchors.forEach((anchor) => {
      const nodeButton = anchor.querySelector('.skill-node-button')
      nodeButton?.classList.remove('skill-node-button--portal-peer-hovered')
    })
  }

  const getCounterpartNodeIdForElement = (portalElement) => getPortalCounterpartNodeId({
    nodeId: portalElement?.getAttribute('data-portal-node-id') ?? '',
    sourceId: portalElement?.getAttribute('data-portal-source-id') ?? '',
    targetId: portalElement?.getAttribute('data-portal-target-id') ?? '',
    portalKey: portalElement?.getAttribute('data-portal-key') ?? '',
  })

  const setPortalPeerHighlight = (portalElement) => {
    clearPortalPeerHighlight()
    if (!portalElement || portalElement.style.display === 'none') {
      return
    }

    const portalKey = String(portalElement.getAttribute('data-portal-key') ?? '')
    const baseKey = portalKey.replace(/:(?:source|target)$/, '')
    const relatedPortals = baseKey ? (portalElementsByBaseKey.get(baseKey) ?? []) : []

    relatedPortals.forEach((candidate) => {
      if (candidate !== portalElement && candidate.style.display !== 'none') {
        candidate.classList.add('skill-tree-portal--peer-hovered')
      }
    })

    const counterpartNodeId = getCounterpartNodeIdForElement(portalElement)
    if (!counterpartNodeId) {
      return
    }

    const counterpartAnchor = nodeAnchorById.get(counterpartNodeId)
    if (!counterpartAnchor || counterpartAnchor.style.display === 'none') {
      return
    }

    const counterpartNodeButton = counterpartAnchor.querySelector('.skill-node-button')
    counterpartNodeButton?.classList.add('skill-node-button--portal-peer-hovered')
  }

  const focusNodeInViewport = (nodeId, options = {}) => {
    const anchor = nodeAnchorById.get(nodeId)
    const baseViewBox = parseViewBox(defaultViewBox)
    if (!anchor || !baseViewBox) {
      return
    }

    const nodeX = Number.parseFloat(anchor.getAttribute('x') ?? '0')
    const nodeY = Number.parseFloat(anchor.getAttribute('y') ?? '0')
    const nodeWidth = Number.parseFloat(anchor.getAttribute('width') ?? '0')
    const nodeHeight = Number.parseFloat(anchor.getAttribute('height') ?? '0')

    if (![nodeX, nodeY, nodeWidth, nodeHeight].every((value) => Number.isFinite(value))) {
      return
    }

    const zoomFactor = Math.max(1.25, Number.parseFloat(String(options.zoomFactor ?? '2.4')) || 2.4)
    const nextWidth = Math.max(nodeWidth * 3.2, baseViewBox.width / zoomFactor)
    const nextHeight = Math.max(nodeHeight * 3.2, baseViewBox.height / zoomFactor)
    const centerX = nodeX + nodeWidth / 2
    const centerY = nodeY + nodeHeight / 2
    const clampedWidth = Math.min(baseViewBox.width, nextWidth)
    const clampedHeight = Math.min(baseViewBox.height, nextHeight)
    const nextX = centerX - clampedWidth / 2
    const nextY = centerY - clampedHeight / 2

    svgRoot.setAttribute('viewBox', String(nextX) + ' ' + String(nextY) + ' ' + String(clampedWidth) + ' ' + String(clampedHeight))
  }

  const clearReadonlySelection = ({ resetViewBox = true } = {}) => {
    readonlySelectionState.nodeId = null
    readonlySelectionState.segmentId = null
    readonlySelectionState.portalKey = null

    if (resetViewBox && defaultViewBox) {
      svgRoot.setAttribute('viewBox', defaultViewBox)
    }

    syncReadonlySelection()
  }

  portalElements.forEach((portalElement) => {
    portalElement.addEventListener('pointerdown', (event) => {
      event.stopPropagation()
    })

    portalElement.addEventListener('click', (event) => {
      event.stopPropagation()

      if (!portalElement.classList.contains('skill-tree-portal--interactive')) {
        return
      }

      const nextSelectedNodeId = getCounterpartNodeIdForElement(portalElement)
      if (!nextSelectedNodeId) {
        return
      }

      readonlySelectionState.segmentId = null
      readonlySelectionState.portalKey = null
      readonlySelectionState.nodeId = nextSelectedNodeId
      syncReadonlySelection()
      focusNodeInViewport(nextSelectedNodeId)
    })

    portalElement.addEventListener('pointerenter', () => {
      setPortalPeerHighlight(portalElement)
    })

    portalElement.addEventListener('pointerleave', () => {
      clearPortalPeerHighlight()
    })
  })

  nodeAnchors.forEach((anchor) => {
    anchor.addEventListener('pointerdown', (event) => {
      event.stopPropagation()
    })

    anchor.addEventListener('click', (event) => {
      event.stopPropagation()
      readonlySelectionState.nodeId = anchor.getAttribute('data-node-id') || null
      readonlySelectionState.segmentId = null
      readonlySelectionState.portalKey = null
      syncReadonlySelection()
    })
  })

  segmentLabels.forEach((label) => {
    label.addEventListener('pointerdown', (event) => {
      event.stopPropagation()
    })

    label.addEventListener('click', (event) => {
      event.stopPropagation()
      readonlySelectionState.segmentId = label.getAttribute('data-segment-id') || null
      readonlySelectionState.nodeId = null
      readonlySelectionState.portalKey = null
      syncReadonlySelection()
    })
  })

  svgRoot.addEventListener('click', (event) => {
    if (event.target === svgRoot) {
      clearReadonlySelection()
    }
  })

  syncReadonlySelection()
})()
`

export const INTERACTIVE_SVG_RUNTIME_SCRIPT = buildInteractiveSvgRuntimeScript()

export const injectInteractiveSvgRuntime = (svgRoot) => {
  if (!svgRoot) {
    return
  }

  const ownerDocument = svgRoot.ownerDocument ?? globalThis?.document
  const createElement = ownerDocument?.createElementNS
    ? (tagName) => ownerDocument.createElementNS(SVG_NS, tagName)
    : null

  if (!createElement) {
    return
  }

  if (!svgRoot.querySelector?.('.skill-tree-interactive-runtime-style')) {
    const style = createElement('style')
    style.setAttribute('class', 'skill-tree-interactive-runtime-style')
    style.textContent = INTERACTIVE_SVG_RUNTIME_STYLE_TEXT
    svgRoot.insertBefore(style, svgRoot.firstChild ?? null)
  }

  if (!svgRoot.querySelector?.('.skill-tree-interactive-runtime-script')) {
    const script = createElement('script')
    script.setAttribute('class', 'skill-tree-interactive-runtime-script')
    script.setAttribute('type', 'application/ecmascript')
    script.textContent = INTERACTIVE_SVG_RUNTIME_SCRIPT
    svgRoot.appendChild(script)
  }
}
