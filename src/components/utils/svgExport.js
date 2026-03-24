const SVG_XML_PREFIX = '<?xml version="1.0" encoding="UTF-8"?>\n'
const SVG_NS = 'http://www.w3.org/2000/svg'
const SVG_XLINK_NS = 'http://www.w3.org/1999/xlink'

const createSvgElement = (tagName) => document.createElementNS(SVG_NS, tagName)

const toNumber = (value, fallback = 0) => {
  const parsed = Number.parseFloat(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : fallback
}

const sanitizeText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim()

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
      fill: rgba(2, 6, 23, 0.94);
      stroke: rgba(34, 211, 238, 0.45);
      stroke-width: 1.25;
    }

    .skill-node-tooltip__title {
      fill: #f8fafc;
      font-size: 12px;
      font-weight: 700;
      font-family: ui-sans-serif, system-ui, sans-serif;
    }

    .skill-node-tooltip__note {
      fill: #cbd5e1;
      font-size: 10px;
      font-family: ui-sans-serif, system-ui, sans-serif;
    }

    .skill-node-tooltip__heading {
      fill: #f8fafc;
      font-size: 13px;
      font-weight: 700;
      font-family: ui-sans-serif, system-ui, sans-serif;
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
  const tooltipWidth = 240
  const tooltipHeight = 42 + lineCount * 14
  const boxX = centerX - tooltipWidth / 2
  const boxY = centerY - 58 - tooltipHeight

  const rect = createSvgElement('rect')
  rect.setAttribute('class', 'skill-node-tooltip')
  rect.setAttribute('x', String(boxX))
  rect.setAttribute('y', String(boxY))
  rect.setAttribute('width', String(tooltipWidth))
  rect.setAttribute('height', String(tooltipHeight))
  rect.setAttribute('rx', '10')

  const titleText = createSvgElement('text')
  titleText.setAttribute('class', 'skill-node-tooltip__title')
  titleText.setAttribute('x', String(boxX + 12))
  titleText.setAttribute('y', String(boxY + 18))
  titleText.textContent = title || 'Skill'

  const noteText = createSvgElement('text')
  noteText.setAttribute('class', 'skill-node-tooltip__note')
  noteText.setAttribute('x', String(boxX + 12))
  noteText.setAttribute('y', String(boxY + 34))

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
      tspan.setAttribute('x', String(boxX + 12))
      tspan.setAttribute('dy', lineIndex === 0 ? '0' : '14')
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
  } = options

  const clone = svgElement.cloneNode(true)
  clone.removeAttribute('class')
  clone.setAttribute('xmlns', SVG_NS)
  clone.setAttribute('xmlns:xlink', SVG_XLINK_NS)

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
  } = options

  const markup = serializeSvgElementForExport(svgElement, { includeTooltips })

  if (!markup) {
    return false
  }

  return downloadSvgMarkup(markup, fileName)
}
