import {
  TOOLTIP_HTML_BOX_STYLES,
  TOOLTIP_HTML_NOTE_STYLES,
  TOOLTIP_HTML_TITLE_STYLES,
  TOOLTIP_FONT_FAMILY,
  TOOLTIP_SVG_LAYOUT,
  TOOLTIP_SVG_STYLES,
} from '../tooltip/tooltipStyles'
import { renderMarkdownToHtml } from './markdown'

const SVG_XML_PREFIX = '<?xml version="1.0" encoding="UTF-8"?>\n'
const SVG_NS = 'http://www.w3.org/2000/svg'
const SVG_XLINK_NS = 'http://www.w3.org/1999/xlink'
const EXPORT_VIEWPORT_PADDING = 96
const CENTER_ICON_EXPORT_SIZE = 156
const CENTER_ICON_EXPORT_HIT_RADIUS = 78
const EXPORT_VIEWPORT_SELECTORS = [
  '.skill-tree-center-icon',
  'foreignObject.skill-node-export-anchor',
  '[data-link-source-id][data-link-target-id]',
  '[data-segment-id]',
  '[data-segment-left][data-segment-right]',
]

const createSvgElement = (tagName) => document.createElementNS(SVG_NS, tagName)

const toNumber = (value, fallback = 0) => {
  const parsed = Number.parseFloat(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : fallback
}

const sanitizeText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim()

const normalizeLevelStatusKey = (value) => {
  const normalized = sanitizeText(value).toLowerCase()
  if (normalized === 'fertig') return 'done'
  if (normalized === 'jetzt') return 'now'
  if (normalized === 'spaeter' || normalized === 'später') return 'later'
  return normalized || 'later'
}

const formatStatusLabel = (value) => {
  const statusKey = normalizeLevelStatusKey(value)
  const labels = {
    done: 'Done',
    now: 'Now',
    next: 'Next',
    later: 'Later',
  }

  return labels[statusKey] ?? statusKey
}

const parseLevelTooltipData = (anchor) => {
  const raw = String(anchor.getAttribute('data-export-levels') ?? '').trim()

  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed
          .map((entry) => ({
            id: sanitizeText(entry?.id),
            label: sanitizeText(entry?.label),
            status: normalizeLevelStatusKey(entry?.status),
            statusLabel: sanitizeText(entry?.statusLabel) || formatStatusLabel(entry?.status),
            releaseNote: String(entry?.releaseNote ?? '').trim(),
          }))
          .filter((entry) => entry.id || entry.label || entry.releaseNote)
      }
    } catch {
      // fall back to legacy single-note export data
    }
  }

  const fallbackNote = String(anchor.getAttribute('data-export-note') ?? '').trim()
  return [{
    id: sanitizeText(anchor.getAttribute('data-node-id')) || 'node',
    label: sanitizeText(anchor.getAttribute('data-export-label')) || 'Skill',
    status: 'later',
    statusLabel: 'Later',
    releaseNote: fallbackNote,
  }]
}

const polarPoint = (centerX, centerY, radius, angleDegrees) => {
  const angleRadians = ((angleDegrees - 90) * Math.PI) / 180
  return {
    x: centerX + radius * Math.cos(angleRadians),
    y: centerY + radius * Math.sin(angleRadians),
  }
}

const buildDonutSectorPath = (centerX, centerY, innerRadius, outerRadius, startAngle, endAngle) => {
  const safeSpan = Math.max(0.01, endAngle - startAngle)
  const largeArc = safeSpan > 180 ? 1 : 0
  const outerStart = polarPoint(centerX, centerY, outerRadius, startAngle)
  const outerEnd = polarPoint(centerX, centerY, outerRadius, endAngle)
  const innerEnd = polarPoint(centerX, centerY, innerRadius, endAngle)
  const innerStart = polarPoint(centerX, centerY, innerRadius, startAngle)

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ')
}

const estimateTooltipCardHeight = (entry) => {
  const rendered = renderMarkdownToHtml(entry?.releaseNote) || '<p>Keine Release Note hinterlegt.</p>'
  const blockCount = Math.max(1, (rendered.match(/<(p|h[1-6]|ul)\b/gi) || []).length)
  const listItemCount = (rendered.match(/<li\b/gi) || []).length

  return 40 + (blockCount * 18) + (listItemCount * 12)
}

const replaceCenterIconForeignObject = (svgRoot) => {
  const centerForeign = svgRoot.querySelector('.skill-tree-center-icon__foreign')
  const centerImage = svgRoot.querySelector('.skill-tree-center-icon__image')

  if (!centerForeign || !centerImage) {
    return
  }

  const src = String(centerImage.getAttribute('src') ?? '').trim()
  if (!src) {
    return
  }

  const image = createSvgElement('image')
  image.setAttribute('class', 'skill-tree-center-icon__image')
  const exportSize = CENTER_ICON_EXPORT_SIZE
  const exportHalf = exportSize / 2
  image.setAttribute('x', String(-exportHalf))
  image.setAttribute('y', String(-exportHalf))
  image.setAttribute('width', String(exportSize))
  image.setAttribute('height', String(exportSize))
  image.setAttribute('href', src)
  if (typeof image.setAttributeNS === 'function') {
    image.setAttributeNS(SVG_XLINK_NS, 'xlink:href', src)
  }

  const parentNode = centerForeign.parentNode
  if (parentNode && typeof parentNode.replaceChild === 'function') {
    parentNode.replaceChild(image, centerForeign)
  } else if (typeof centerForeign.replaceWith === 'function') {
    centerForeign.replaceWith(image)
  }

  const hitArea = svgRoot.querySelector('.skill-tree-center-icon__hit-area')
  if (hitArea) {
    hitArea.setAttribute('r', String(CENTER_ICON_EXPORT_HIT_RADIUS))
  }
}

const collectStyleText = (sourceDocument) => {
  if (!sourceDocument?.styleSheets) {
    return ''
  }

  const styleChunks = []

  for (const styleSheet of Array.from(sourceDocument.styleSheets)) {
    try {
      const cssRules = Array.from(styleSheet.cssRules ?? [])
      styleChunks.push(cssRules.map((rule) => rule.cssText).join('\n'))
    } catch {
      // Ignore cross-origin or unavailable stylesheets.
    }
  }

  return styleChunks.filter(Boolean).join('\n')
}

const isFiniteNumber = (value) => Number.isFinite(value) && !Number.isNaN(value)

const getBoundsFromElement = (element) => {
  if (!element) {
    return null
  }

  if (typeof element.getBBox === 'function') {
    try {
      const box = element.getBBox()
      if (
        box
        && isFiniteNumber(box.x)
        && isFiniteNumber(box.y)
        && isFiniteNumber(box.width)
        && isFiniteNumber(box.height)
        && box.width > 0
        && box.height > 0
      ) {
        return {
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
        }
      }
    } catch {
      // Detached or unsupported elements can throw here; fall back to attributes.
    }
  }

  const x = toNumber(element.getAttribute?.('x'), Number.NaN)
  const y = toNumber(element.getAttribute?.('y'), Number.NaN)
  const width = toNumber(element.getAttribute?.('width'), Number.NaN)
  const height = toNumber(element.getAttribute?.('height'), Number.NaN)

  if (
    isFiniteNumber(x)
    && isFiniteNumber(y)
    && isFiniteNumber(width)
    && isFiniteNumber(height)
    && width > 0
    && height > 0
  ) {
    return {
      x,
      y,
      width,
      height,
    }
  }

  return null
}

const getRootBounds = (svgElement) => {
  if (!svgElement || typeof svgElement.getBBox !== 'function') {
    return null
  }

  const removableNodes = []
  const removalSelectors = ['.skill-node-tooltip-layer', '.skill-tree-export-exclude']

  if (typeof svgElement.querySelectorAll === 'function') {
    removalSelectors.forEach((selector) => {
      Array.from(svgElement.querySelectorAll(selector)).forEach((node) => {
        const parentNode = node?.parentNode
        if (!parentNode || typeof parentNode.removeChild !== 'function') {
          return
        }

        removableNodes.push({
          node,
          parentNode,
          nextSibling: node.nextSibling ?? null,
        })
        parentNode.removeChild(node)
      })
    })
  }

  try {
    const box = svgElement.getBBox()
    if (
      box
      && isFiniteNumber(box.x)
      && isFiniteNumber(box.y)
      && isFiniteNumber(box.width)
      && isFiniteNumber(box.height)
      && box.width > 0
      && box.height > 0
    ) {
      return {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      }
    }
  } catch {
    // Detached or unsupported root SVG elements can throw here.
  } finally {
    for (let index = removableNodes.length - 1; index >= 0; index -= 1) {
      const { node, parentNode, nextSibling } = removableNodes[index]
      if (!parentNode || typeof parentNode.insertBefore !== 'function') {
        continue
      }

      if (nextSibling && nextSibling.parentNode === parentNode) {
        parentNode.insertBefore(node, nextSibling)
      } else {
        parentNode.appendChild(node)
      }
    }
  }

  return null
}

const expandBounds = (bounds, padding) => ({
  x: bounds.x - padding,
  y: bounds.y - padding,
  width: bounds.width + (padding * 2),
  height: bounds.height + (padding * 2),
})

const unionBounds = (boundsList) => {
  if (boundsList.length === 0) {
    return null
  }

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  boundsList.forEach((bounds) => {
    minX = Math.min(minX, bounds.x)
    minY = Math.min(minY, bounds.y)
    maxX = Math.max(maxX, bounds.x + bounds.width)
    maxY = Math.max(maxY, bounds.y + bounds.height)
  })

  if (!isFiniteNumber(minX) || !isFiniteNumber(minY) || !isFiniteNumber(maxX) || !isFiniteNumber(maxY)) {
    return null
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  }
}

const getFallbackViewportBounds = (svgElement) => {
  const viewBox = svgElement?.viewBox?.baseVal
  if (
    viewBox
    && isFiniteNumber(viewBox.x)
    && isFiniteNumber(viewBox.y)
    && isFiniteNumber(viewBox.width)
    && isFiniteNumber(viewBox.height)
    && viewBox.width > 0
    && viewBox.height > 0
  ) {
    return {
      x: viewBox.x,
      y: viewBox.y,
      width: viewBox.width,
      height: viewBox.height,
    }
  }

  const width = toNumber(svgElement?.getAttribute?.('width'), Number.NaN)
  const height = toNumber(svgElement?.getAttribute?.('height'), Number.NaN)

  if (isFiniteNumber(width) && isFiniteNumber(height) && width > 0 && height > 0) {
    return {
      x: 0,
      y: 0,
      width,
      height,
    }
  }

  return {
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  }
}

export const getExportViewportBounds = (svgElement) => {
  if (!svgElement || typeof svgElement.querySelectorAll !== 'function') {
    return expandBounds(getFallbackViewportBounds(svgElement), EXPORT_VIEWPORT_PADDING)
  }

  const rootBounds = getRootBounds(svgElement)
  if (rootBounds) {
    return rootBounds
  }

  const candidateBounds = []

  EXPORT_VIEWPORT_SELECTORS.forEach((selector) => {
    Array.from(svgElement.querySelectorAll(selector)).forEach((element) => {
      if (typeof element.closest === 'function' && element.closest('.skill-tree-export-exclude')) {
        return
      }

      if (selector === '.skill-tree-center-icon') {
        const transform = String(element.getAttribute?.('transform') ?? '')
        const match = transform.match(/translate[(]([-0-9.]+)[, ]+([-0-9.]+)[)]/)
        const centerX = match ? Number.parseFloat(match[1]) : Number.NaN
        const centerY = match ? Number.parseFloat(match[2]) : Number.NaN
        let pushedChildBounds = false

        if (Number.isFinite(centerX) && Number.isFinite(centerY)) {
          const centerImage = element.querySelector?.('.skill-tree-center-icon__image')
          const centerForeign = element.querySelector?.('.skill-tree-center-icon__foreign')
          const centerHitArea = element.querySelector?.('.skill-tree-center-icon__hit-area')

          if (centerImage) {
            const bounds = getBoundsFromElement(centerImage)
            if (bounds) {
              candidateBounds.push({
                x: centerX + bounds.x,
                y: centerY + bounds.y,
                width: bounds.width,
                height: bounds.height,
              })
              pushedChildBounds = true
            }
          }

          if (centerForeign) {
            const bounds = getBoundsFromElement(centerForeign)
            if (bounds) {
              candidateBounds.push({
                x: centerX + bounds.x,
                y: centerY + bounds.y,
                width: bounds.width,
                height: bounds.height,
              })
              pushedChildBounds = true
            }
          }

          if (centerHitArea) {
            const radius = toNumber(centerHitArea.getAttribute?.('r'), Number.NaN)
            if (isFiniteNumber(radius) && radius > 0) {
              candidateBounds.push({
                x: centerX - radius,
                y: centerY - radius,
                width: radius * 2,
                height: radius * 2,
              })
              pushedChildBounds = true
            }
          }
        }

        if (!pushedChildBounds) {
          const bounds = getBoundsFromElement(element)
          if (bounds) {
            candidateBounds.push(bounds)
          }
        }

        return
      }

      const bounds = getBoundsFromElement(element)
      if (bounds) {
        candidateBounds.push(bounds)
      }
    })
  })

  const mergedBounds = unionBounds(candidateBounds)
  if (mergedBounds) {
    return expandBounds(mergedBounds, EXPORT_VIEWPORT_PADDING)
  }

  return expandBounds(getFallbackViewportBounds(svgElement), EXPORT_VIEWPORT_PADDING)
}

const applyExportViewport = (svgRoot, bounds) => {
  svgRoot.setAttribute('viewBox', `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`)
  svgRoot.setAttribute('width', String(bounds.width))
  svgRoot.setAttribute('height', String(bounds.height))
}

const injectExportStyles = (svgRoot, styleText) => {
  const normalizedStyleText = String(styleText ?? '').trim()
  if (!normalizedStyleText) {
    return
  }

  let defs = svgRoot.querySelector('defs')
  if (!defs) {
    defs = createSvgElement('defs')
    svgRoot.insertBefore(defs, svgRoot.firstChild)
  }

  const style = createSvgElement('style')
  style.textContent = `${normalizedStyleText}

    .skill-tree-center-icon,
    .skill-tree-center-icon text,
    .skill-tree-segment-label,
    .skill-tree-empty-state-label,
    .skill-tree-add-text,
    .skill-node-foreign,
    .skill-node-foreign * {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    }
  `
  defs.appendChild(style)
}

export const splitIntoLines = (text, maxChars = 52, maxLines = 3) => {
  const normalized = sanitizeText(text)
  if (!normalized) {
    return []
  }

  const words = normalized.split(' ')
  const lines = []
  let current = ''

  for (const word of words) {
    const proposal = current.length > 0 ? `${current} ${word}` : word
    if (proposal.length <= maxChars) {
      current = proposal
      continue
    }

    if (current.length > 0) {
      lines.push(current)
    }
    current = word

    if (lines.length >= maxLines) {
      break
    }
  }

  if (lines.length < maxLines && current.length > 0) {
    lines.push(current)
  }

  if (words.length > 0 && lines.length === maxLines) {
    const joined = lines.join(' ')
    if (joined.length < normalized.length) {
      lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, Math.max(0, maxChars - 1))}…`
    }
  }

  return lines
}

const injectExportTooltipStyles = (svgRoot) => {
  const style = createSvgElement('style')
  style.textContent = `
    .skill-node-tooltip-trigger {
      fill: transparent;
      cursor: pointer;
      pointer-events: all;
    }

    .skill-node-tooltip-group {
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.16s ease;
    }

    .skill-node-tooltip-trigger:hover + .skill-node-tooltip-group,
    .skill-node-tooltip-trigger:focus + .skill-node-tooltip-group,
    .skill-node-tooltip-trigger:focus-visible + .skill-node-tooltip-group {
      opacity: 1;
    }

    .skill-node-tooltip__panel {
      max-width: ${TOOLTIP_HTML_BOX_STYLES.maxWidth};
      padding: ${TOOLTIP_HTML_BOX_STYLES.padding};
      color: ${TOOLTIP_HTML_BOX_STYLES.color};
      background: ${TOOLTIP_HTML_BOX_STYLES.backgroundColor};
      border: ${TOOLTIP_HTML_BOX_STYLES.border};
      box-shadow: ${TOOLTIP_HTML_BOX_STYLES.boxShadow};
      backdrop-filter: ${TOOLTIP_HTML_BOX_STYLES.backdropFilter};
      -webkit-backdrop-filter: ${TOOLTIP_HTML_BOX_STYLES.WebkitBackdropFilter};
      border-radius: ${TOOLTIP_HTML_BOX_STYLES.borderRadius};
      box-sizing: border-box;
      overflow: visible;
      font-family: ${TOOLTIP_FONT_FAMILY};
      -webkit-font-smoothing: ${TOOLTIP_HTML_BOX_STYLES.WebkitFontSmoothing};
      -moz-osx-font-smoothing: ${TOOLTIP_HTML_BOX_STYLES.MozOsxFontSmoothing};
      text-rendering: ${TOOLTIP_HTML_BOX_STYLES.textRendering};
    }

    .skill-node-tooltip__title {
      margin: 0;
      color: ${TOOLTIP_HTML_TITLE_STYLES.color};
      font-size: ${TOOLTIP_HTML_TITLE_STYLES.fontSize};
      font-weight: ${TOOLTIP_HTML_TITLE_STYLES.fontWeight};
      line-height: ${TOOLTIP_HTML_TITLE_STYLES.lineHeight};
      font-family: ${TOOLTIP_FONT_FAMILY};
    }

    .skill-node-tooltip__stack {
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
      margin-top: 0.35rem;
    }

    .skill-node-tooltip__card {
      border-top: 1px solid rgba(56, 189, 248, 0.12);
      padding-top: 0.4rem;
    }

    .skill-node-tooltip__card:first-child {
      border-top: 0;
      padding-top: 0;
    }

    .skill-node-tooltip__card-header {
      display: flex;
      justify-content: space-between;
      gap: 0.75rem;
      align-items: baseline;
      margin-bottom: 0.35rem;
      color: ${TOOLTIP_HTML_TITLE_STYLES.color};
      font-size: ${TOOLTIP_HTML_TITLE_STYLES.fontSize};
      font-weight: ${TOOLTIP_HTML_TITLE_STYLES.fontWeight};
      line-height: ${TOOLTIP_HTML_TITLE_STYLES.lineHeight};
      font-family: ${TOOLTIP_FONT_FAMILY};
    }

    .skill-node-tooltip__card-header span {
      color: ${TOOLTIP_HTML_NOTE_STYLES.color};
      font-size: ${TOOLTIP_HTML_NOTE_STYLES.fontSize};
      font-weight: 600;
      line-height: ${TOOLTIP_HTML_NOTE_STYLES.lineHeight};
    }

    .skill-node-tooltip__note {
      margin-top: ${TOOLTIP_HTML_NOTE_STYLES.marginTop};
      color: ${TOOLTIP_HTML_NOTE_STYLES.color};
      font-size: ${TOOLTIP_HTML_NOTE_STYLES.fontSize};
      line-height: ${TOOLTIP_HTML_NOTE_STYLES.lineHeight};
      white-space: ${TOOLTIP_HTML_NOTE_STYLES.whiteSpace};
      font-family: ${TOOLTIP_FONT_FAMILY};
    }

    .skill-node-tooltip__note--markdown p,
    .skill-node-tooltip__note--markdown h1,
    .skill-node-tooltip__note--markdown h2,
    .skill-node-tooltip__note--markdown h3,
    .skill-node-tooltip__note--markdown h4,
    .skill-node-tooltip__note--markdown h5,
    .skill-node-tooltip__note--markdown h6 {
      margin: 0;
    }

    .skill-node-tooltip__note--markdown p + p,
    .skill-node-tooltip__note--markdown h1 + p,
    .skill-node-tooltip__note--markdown h2 + p,
    .skill-node-tooltip__note--markdown h3 + p,
    .skill-node-tooltip__note--markdown h4 + p,
    .skill-node-tooltip__note--markdown h5 + p,
    .skill-node-tooltip__note--markdown h6 + p,
    .skill-node-tooltip__note--markdown p + ul,
    .skill-node-tooltip__note--markdown h1 + ul,
    .skill-node-tooltip__note--markdown h2 + ul,
    .skill-node-tooltip__note--markdown h3 + ul,
    .skill-node-tooltip__note--markdown h4 + ul,
    .skill-node-tooltip__note--markdown h5 + ul,
    .skill-node-tooltip__note--markdown h6 + ul,
    .skill-node-tooltip__note--markdown ul + p,
    .skill-node-tooltip__note--markdown ul + ul {
      margin-top: 0.35rem;
    }

    .skill-node-tooltip__note--markdown ul {
      padding-left: 1rem;
      margin-left: 0;
    }

    .skill-node-tooltip__note--markdown li {
      margin: 0;
    }

    .skill-node-tooltip__note--markdown a {
      color: #7dd3fc;
      text-decoration: underline;
      text-underline-offset: 2px;
    }

    .skill-node-tooltip__note--markdown code {
      padding: 0.05rem 0.22rem;
      border-radius: 0.25rem;
      background: rgba(15, 23, 42, 0.9);
      color: #e2e8f0;
      font-size: 0.92em;
    }
  `

  let defs = svgRoot.querySelector('defs')
  if (!defs) {
    defs = createSvgElement('defs')
    svgRoot.insertBefore(defs, svgRoot.firstChild)
  }

  defs.appendChild(style)
}

const buildTooltipGroup = ({ centerX, centerY, title, entries }) => {
  const group = createSvgElement('g')
  group.setAttribute('class', 'skill-node-tooltip-group')
  group.setAttribute('opacity', '0')
  group.setAttribute('pointer-events', 'none')

  const tooltipWidth = TOOLTIP_SVG_LAYOUT.width
  const cardsHeight = entries.reduce((sum, entry) => sum + estimateTooltipCardHeight(entry), 0)
  const tooltipHeight = TOOLTIP_SVG_LAYOUT.heightBase + cardsHeight + Math.max(0, (entries.length - 1) * 8)
  const tooltipHeightSafety = 6
  const boxX = centerX - tooltipWidth / 2
  const boxY = centerY - TOOLTIP_SVG_LAYOUT.centerGap - tooltipHeight

  const foreignObject = createSvgElement('foreignObject')
  foreignObject.setAttribute('x', String(boxX))
  foreignObject.setAttribute('y', String(boxY))
  foreignObject.setAttribute('width', String(tooltipWidth))
  foreignObject.setAttribute('height', String(tooltipHeight + tooltipHeightSafety))

  const wrapper = document.createElementNS('http://www.w3.org/1999/xhtml', 'div')
  wrapper.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
  wrapper.setAttribute('class', 'skill-node-tooltip__panel')

  const titleText = document.createElementNS('http://www.w3.org/1999/xhtml', 'div')
  titleText.setAttribute('class', 'skill-node-tooltip__title')
  titleText.textContent = title || 'Skill'
  wrapper.appendChild(titleText)

  const stack = document.createElementNS('http://www.w3.org/1999/xhtml', 'div')
  stack.setAttribute('class', 'skill-node-tooltip__stack')

  entries.forEach((entry) => {
    const card = document.createElementNS('http://www.w3.org/1999/xhtml', 'article')
    card.setAttribute('class', 'skill-node-tooltip__card')

    const header = document.createElementNS('http://www.w3.org/1999/xhtml', 'header')
    header.setAttribute('class', 'skill-node-tooltip__card-header')

    const statusLabel = document.createElementNS('http://www.w3.org/1999/xhtml', 'span')
    statusLabel.textContent = entry.statusLabel || ''

    if (entries.length > 1) {
      const headerTitle = document.createElementNS('http://www.w3.org/1999/xhtml', 'strong')
      headerTitle.textContent = entry.label || title || 'Skill'
      header.appendChild(headerTitle)
    }
    header.appendChild(statusLabel)

    const noteWrapper = document.createElementNS('http://www.w3.org/1999/xhtml', 'div')
    noteWrapper.setAttribute('class', 'skill-node-tooltip__note skill-node-tooltip__note--markdown')
    noteWrapper.innerHTML = renderMarkdownToHtml(entry.releaseNote) || '<p>Keine Release Note hinterlegt.</p>'

    card.appendChild(header)
    card.appendChild(noteWrapper)
    stack.appendChild(card)
  })

  wrapper.appendChild(stack)
  foreignObject.appendChild(wrapper)

  group.appendChild(foreignObject)

  return group
}

const buildCenterTooltipGroup = ({ id, centerX, centerY, title, levelEntries }) => buildTooltipGroup({
  id,
  centerX,
  centerY,
  title,
  entries: levelEntries,
})

const buildLevelTooltipGroup = ({ id, centerX, centerY, title, entry }) => buildTooltipGroup({
  id,
  centerX,
  centerY,
  title,
  entries: [entry],
})

const appendAnimatedTooltips = (svgRoot) => {
  const anchors = Array.from(svgRoot.querySelectorAll('foreignObject.skill-node-export-anchor'))
  if (anchors.length === 0) {
    return
  }

  const overlayLayer = createSvgElement('g')
  overlayLayer.setAttribute('class', 'skill-node-tooltip-layer')

  anchors.forEach((anchor, index) => {
    const x = toNumber(anchor.getAttribute('x'))
    const y = toNumber(anchor.getAttribute('y'))
    const width = toNumber(anchor.getAttribute('width'))
    const height = toNumber(anchor.getAttribute('height'))
    const buttonWidth = toNumber(anchor.getAttribute('data-orig-button-width'), width)

    const centerX = x + width / 2
    const centerY = y + height / 2

    const label = sanitizeText(anchor.getAttribute('data-export-label')) || 'Skill'
    const nodeId = sanitizeText(anchor.getAttribute('data-node-id'))
    const triggerId = `export-tooltip-trigger-${index + 1}`
    const levelEntries = parseLevelTooltipData(anchor)
    const centerEntries = levelEntries.length > 0 ? levelEntries : [{
      id: nodeId || 'node',
      label,
      status: 'later',
      statusLabel: 'Later',
      releaseNote: 'Keine Release Note hinterlegt.',
    }]

    const trigger = createSvgElement('circle')
    trigger.setAttribute('id', triggerId)
    trigger.setAttribute('class', 'skill-node-tooltip-trigger')
    if (nodeId) {
      trigger.setAttribute('data-tooltip-node-id', nodeId)
    }
    trigger.setAttribute('cx', String(centerX))
    trigger.setAttribute('cy', String(centerY))
    trigger.setAttribute('r', String(Math.max(26, width * 0.28)))

    const tooltipGroup = buildCenterTooltipGroup({
      id: triggerId,
      centerX,
      centerY,
      title: label,
      levelEntries: centerEntries,
    })
    if (nodeId) {
      tooltipGroup.setAttribute('data-tooltip-node-id', nodeId)
    }
    overlayLayer.appendChild(trigger)
    overlayLayer.appendChild(tooltipGroup)

    if (levelEntries.length > 1) {
      const ringInnerRadius = Math.max(0, buttonWidth * 0.37)
      const ringOuterRadius = Math.max(ringInnerRadius + 8, buttonWidth / 2)
      const angleSlice = 360 / levelEntries.length

      levelEntries.forEach((entry, levelIndex) => {
        const startAngle = levelIndex * angleSlice
        const endAngle = (levelIndex + 1) * angleSlice
        const sector = createSvgElement('path')
        const sectorId = `export-tooltip-trigger-${index + 1}-level-${levelIndex + 1}`
        sector.setAttribute('id', sectorId)
        sector.setAttribute('class', 'skill-node-tooltip-trigger')
        if (nodeId) {
          sector.setAttribute('data-tooltip-node-id', nodeId)
        }
        sector.setAttribute('d', buildDonutSectorPath(centerX, centerY, ringInnerRadius, ringOuterRadius, startAngle, endAngle))

        const sectorGroup = buildLevelTooltipGroup({
          id: sectorId,
          centerX,
          centerY,
          title: label,
          entry,
        })
        if (nodeId) {
          sectorGroup.setAttribute('data-tooltip-node-id', nodeId)
        }
        overlayLayer.appendChild(sector)
        overlayLayer.appendChild(sectorGroup)
      })
    }
  })

  svgRoot.appendChild(overlayLayer)
}

export const normalizeSvgMarkup = (rawMarkup) => {
  if (typeof rawMarkup !== 'string' || rawMarkup.trim().length === 0) {
    return null
  }

  let markup = rawMarkup.trim()
  const withoutXmlPrefix = markup.replace(/^<\?xml[^>]*\?>\s*/i, '')

  if (!withoutXmlPrefix.startsWith('<svg')) {
    return null
  }

  if (!/\sxmlns=/.test(markup)) {
    markup = markup.replace('<svg', `<svg xmlns="${SVG_NS}"`)
  }

  if (!/\sxmlns:xlink=/.test(markup)) {
    markup = markup.replace('<svg', `<svg xmlns:xlink="${SVG_XLINK_NS}"`)
  }

  if (!markup.startsWith('<?xml')) {
    markup = `${SVG_XML_PREFIX}${markup}`
  }

  return markup
}

export const serializeSvgElementForExport = (svgElement, options = {}) => {
  if (!svgElement || typeof XMLSerializer === 'undefined') {
    return null
  }

  const {
    includeTooltips = true,
    embedStyles = false,
    styleText = '',
    sourceDocument = globalThis?.document,
  } = options

  const clone = svgElement.cloneNode(true)
  clone.removeAttribute('class')
  clone.setAttribute('xmlns', SVG_NS)
  clone.setAttribute('xmlns:xlink', SVG_XLINK_NS)

  applyExportViewport(clone, getExportViewportBounds(svgElement))
  replaceCenterIconForeignObject(clone)

  if (embedStyles) {
    injectExportStyles(clone, styleText || collectStyleText(sourceDocument))
  }

  clone.querySelectorAll('.skill-tree-export-exclude').forEach((node) => node.remove())

  if (includeTooltips) {
    injectExportTooltipStyles(clone)
    appendAnimatedTooltips(clone)
  }

  const serialized = new XMLSerializer().serializeToString(clone)
  return normalizeSvgMarkup(serialized)
}

export const downloadSvgMarkup = (markup, fileName = 'skilltree-roadmap.svg') => {
  if (typeof window === 'undefined' || typeof window.document === 'undefined') {
    return false
  }

  const normalizedMarkup = normalizeSvgMarkup(markup)
  if (!normalizedMarkup) {
    return false
  }

  const blob = new Blob([normalizedMarkup], { type: 'image/svg+xml;charset=utf-8' })
  const objectUrl = window.URL.createObjectURL(blob)
  const anchor = window.document.createElement('a')

  anchor.href = objectUrl
  anchor.download = fileName
  anchor.style.display = 'none'

  window.document.body.appendChild(anchor)
  anchor.click()
  window.document.body.removeChild(anchor)
  window.URL.revokeObjectURL(objectUrl)

  return true
}

const downloadBlob = (blob, fileName) => {
  if (typeof window === 'undefined' || typeof window.document === 'undefined') {
    return false
  }

  const objectUrl = window.URL.createObjectURL(blob)
  const anchor = window.document.createElement('a')

  anchor.href = objectUrl
  anchor.download = fileName
  anchor.style.display = 'none'

  window.document.body.appendChild(anchor)
  anchor.click()
  window.document.body.removeChild(anchor)
  window.URL.revokeObjectURL(objectUrl)

  return true
}

const getExportBackgroundColor = (svgElement, sourceDocument) => {
  const shellElement = svgElement?.closest?.('.skill-tree-shell') ?? null
  const element = shellElement ?? sourceDocument?.body ?? null

  if (!element || typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') {
    return null
  }

  const backgroundColor = window.getComputedStyle(element).backgroundColor
  if (!backgroundColor || backgroundColor === 'transparent' || backgroundColor === 'rgba(0, 0, 0, 0)') {
    return null
  }

  return backgroundColor
}

export const exportPngFromElement = async (svgElement, options = {}) => {
  const {
    fileName = 'skilltree-roadmap.png',
    includeTooltips = false,
    sourceDocument = globalThis?.document,
    styleText = '',
    scale = 1,
  } = options

  if (typeof window === 'undefined' || typeof window.document === 'undefined' || typeof document === 'undefined') {
    return false
  }

  const markup = serializeSvgElementForExport(svgElement, {
    includeTooltips,
    embedStyles: true,
    sourceDocument,
    styleText,
  })

  if (!markup) {
    return false
  }

  const tempContainer = window.document.createElement('div')
  tempContainer.style.position = 'fixed'
  tempContainer.style.left = '-100000px'
  tempContainer.style.top = '-100000px'
  tempContainer.style.width = '0'
  tempContainer.style.height = '0'
  tempContainer.style.overflow = 'hidden'
  tempContainer.style.pointerEvents = 'none'
  tempContainer.innerHTML = markup

  const tempSvg = tempContainer.querySelector('svg')
  if (!tempSvg) {
    return false
  }

  window.document.body.appendChild(tempContainer)

  try {
    const { toBlob } = await import('html-to-image')
    const pngBlob = await toBlob(tempSvg, {
      cacheBust: true,
      skipFonts: true,
      skipAutoScale: true,
      pixelRatio: scale,
      backgroundColor: getExportBackgroundColor(svgElement, sourceDocument) ?? undefined,
    })

    if (!pngBlob) {
      return false
    }

    return downloadBlob(pngBlob, fileName)
  } finally {
    tempContainer.remove()
  }
}

export const exportSvgFromElement = (svgElement, options = {}) => {
  const {
    fileName = 'skilltree-roadmap.svg',
    includeTooltips = true,
    sourceDocument = globalThis?.document,
    styleText = '',
  } = options

  const markup = serializeSvgElementForExport(svgElement, {
    includeTooltips,
    embedStyles: true,
    sourceDocument,
    styleText,
  })

  if (!markup) {
    return false
  }

  return downloadSvgMarkup(markup, fileName)
}
