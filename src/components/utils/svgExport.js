import {
  TOOLTIP_FONT_FAMILY,
  TOOLTIP_SVG_LAYOUT,
  TOOLTIP_SVG_STYLES,
} from '../tooltip/tooltipStyles'

const SVG_XML_PREFIX = '<?xml version="1.0" encoding="UTF-8"?>\n'
const SVG_NS = 'http://www.w3.org/2000/svg'
const SVG_XLINK_NS = 'http://www.w3.org/1999/xlink'
const EXPORT_VIEWPORT_PADDING = 96
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

  const candidateBounds = []

  EXPORT_VIEWPORT_SELECTORS.forEach((selector) => {
    Array.from(svgElement.querySelectorAll(selector)).forEach((element) => {
      if (typeof element.closest === 'function' && element.closest('.skill-tree-export-exclude')) {
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

const parseTooltipMarkdownLines = (value) => {
  const normalized = String(value ?? '').replace(/\r\n?/g, '\n').trim()
  if (!normalized) {
    return []
  }

  const blocks = []

  for (const rawLine of normalized.split('\n')) {
    const line = rawLine.trim()
    if (!line) {
      blocks.push({ type: 'spacer' })
      continue
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        text: headingMatch[2],
      })
      continue
    }

    splitIntoLines(line).forEach((wrappedLine) => {
      blocks.push({
        type: 'body',
        text: wrappedLine,
      })
    })
  }

  return blocks
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

    .skill-node-tooltip {
      fill: ${TOOLTIP_SVG_STYLES.backgroundFill};
      stroke: ${TOOLTIP_SVG_STYLES.borderStroke};
      stroke-width: ${TOOLTIP_SVG_STYLES.borderWidth};
      filter: ${TOOLTIP_SVG_STYLES.boxShadow};
    }

    .skill-node-tooltip__title {
      fill: ${TOOLTIP_SVG_STYLES.titleFill};
      font-size: ${TOOLTIP_SVG_STYLES.titleFontSize};
      font-weight: 700;
      font-family: ${TOOLTIP_FONT_FAMILY};
    }

    .skill-node-tooltip__note {
      fill: ${TOOLTIP_SVG_STYLES.noteFill};
      font-size: ${TOOLTIP_SVG_STYLES.noteFontSize};
      font-family: ${TOOLTIP_FONT_FAMILY};
    }

    .skill-node-tooltip__heading {
      fill: ${TOOLTIP_SVG_STYLES.titleFill};
      font-size: ${TOOLTIP_SVG_STYLES.headingFontSize};
      font-weight: 700;
      font-family: ${TOOLTIP_FONT_FAMILY};
    }
  `

  let defs = svgRoot.querySelector('defs')
  if (!defs) {
    defs = createSvgElement('defs')
    svgRoot.insertBefore(defs, svgRoot.firstChild)
  }

  defs.appendChild(style)
}

const buildTooltipGroup = ({ id, centerX, centerY, title, note }) => {
  const group = createSvgElement('g')
  group.setAttribute('class', 'skill-node-tooltip')
  group.setAttribute('opacity', '0')
  group.setAttribute('pointer-events', 'none')

  const textBlocks = parseTooltipMarkdownLines(note)
  const lineCount = Math.max(1, textBlocks.filter((block) => block.type !== 'spacer').length)
  const tooltipWidth = TOOLTIP_SVG_LAYOUT.width
  const tooltipHeight = TOOLTIP_SVG_LAYOUT.heightBase + lineCount * TOOLTIP_SVG_LAYOUT.rowHeight
  const boxX = centerX - tooltipWidth / 2
  const boxY = centerY - TOOLTIP_SVG_LAYOUT.centerGap - tooltipHeight

  const rect = createSvgElement('rect')
  rect.setAttribute('class', 'skill-node-tooltip')
  rect.setAttribute('x', String(boxX))
  rect.setAttribute('y', String(boxY))
  rect.setAttribute('width', String(tooltipWidth))
  rect.setAttribute('height', String(tooltipHeight))
  rect.setAttribute('rx', '10')

  const titleText = createSvgElement('text')
  titleText.setAttribute('class', 'skill-node-tooltip__title')
  titleText.setAttribute('x', String(boxX + TOOLTIP_SVG_LAYOUT.paddingX))
  titleText.setAttribute('y', String(boxY + TOOLTIP_SVG_LAYOUT.titleOffsetY))
  titleText.textContent = title || 'Skill'

  const noteText = createSvgElement('text')
  noteText.setAttribute('class', 'skill-node-tooltip__note')
  noteText.setAttribute('x', String(boxX + TOOLTIP_SVG_LAYOUT.paddingX))
  noteText.setAttribute('y', String(boxY + TOOLTIP_SVG_LAYOUT.noteOffsetY))

  if (textBlocks.length === 0) {
    noteText.textContent = 'Keine Release Note hinterlegt.'
  } else {
    let lineIndex = 0
    textBlocks.forEach((block) => {
      if (block.type === 'spacer') {
        lineIndex += 0.6
        return
      }

      const tspan = createSvgElement('tspan')
      tspan.setAttribute('x', String(boxX + TOOLTIP_SVG_LAYOUT.paddingX))
      tspan.setAttribute('dy', lineIndex === 0 ? '0' : String(TOOLTIP_SVG_LAYOUT.rowHeight))
      if (block.type === 'heading') {
        tspan.setAttribute('class', 'skill-node-tooltip__heading')
      }
      tspan.textContent = block.text
      noteText.appendChild(tspan)
      lineIndex += 1
    })
  }

  const fadeIn = createSvgElement('animate')
  fadeIn.setAttribute('attributeName', 'opacity')
  fadeIn.setAttribute('from', '0')
  fadeIn.setAttribute('to', '1')
  fadeIn.setAttribute('dur', '0.16s')
  fadeIn.setAttribute('begin', `${id}.mouseover`)
  fadeIn.setAttribute('fill', 'freeze')

  const fadeOut = createSvgElement('animate')
  fadeOut.setAttribute('attributeName', 'opacity')
  fadeOut.setAttribute('from', '1')
  fadeOut.setAttribute('to', '0')
  fadeOut.setAttribute('dur', '0.16s')
  fadeOut.setAttribute('begin', `${id}.mouseout`)
  fadeOut.setAttribute('fill', 'freeze')

  group.appendChild(rect)
  group.appendChild(titleText)
  group.appendChild(noteText)
  group.appendChild(fadeIn)
  group.appendChild(fadeOut)

  return group
}

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

    const centerX = x + width / 2
    const centerY = y + height / 2

    const label = sanitizeText(anchor.getAttribute('data-export-label')) || 'Skill'
    const note = sanitizeText(anchor.getAttribute('data-export-note')) || 'Keine Release Note hinterlegt.'
    const nodeId = sanitizeText(anchor.getAttribute('data-node-id'))
    const triggerId = `export-tooltip-trigger-${index + 1}`

    const trigger = createSvgElement('circle')
    trigger.setAttribute('id', triggerId)
    trigger.setAttribute('class', 'skill-node-tooltip-trigger')
    if (nodeId) {
      trigger.setAttribute('data-tooltip-node-id', nodeId)
    }
    trigger.setAttribute('cx', String(centerX))
    trigger.setAttribute('cy', String(centerY))
    trigger.setAttribute('r', String(Math.max(26, width * 0.28)))

    const title = createSvgElement('title')
    title.textContent = `${label} - ${note}`
    trigger.appendChild(title)

    const tooltipGroup = buildTooltipGroup({
      id: triggerId,
      centerX,
      centerY,
      title: label,
      note,
    })
    if (nodeId) {
      tooltipGroup.setAttribute('data-tooltip-node-id', nodeId)
    }
    overlayLayer.appendChild(tooltipGroup)
    overlayLayer.appendChild(trigger)
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
