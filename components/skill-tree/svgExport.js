const SVG_XML_PREFIX = '<?xml version="1.0" encoding="UTF-8"?>\n'
const SVG_NS = 'http://www.w3.org/2000/svg'
const SVG_XLINK_NS = 'http://www.w3.org/1999/xlink'

const createSvgElement = (tagName) => document.createElementNS(SVG_NS, tagName)

const toNumber = (value, fallback = 0) => {
  const parsed = Number.parseFloat(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : fallback
}

const sanitizeText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim()

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
    .export-tooltip-trigger {
      fill: transparent;
      cursor: pointer;
      pointer-events: all;
    }

    .export-tooltip-box {
      fill: rgba(2, 6, 23, 0.94);
      stroke: rgba(34, 211, 238, 0.45);
      stroke-width: 1.25;
    }

    .export-tooltip-title {
      fill: #f8fafc;
      font-size: 12px;
      font-weight: 700;
      font-family: ui-sans-serif, system-ui, sans-serif;
    }

    .export-tooltip-note {
      fill: #cbd5e1;
      font-size: 10px;
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
  group.setAttribute('class', 'export-tooltip')
  group.setAttribute('opacity', '0')
  group.setAttribute('pointer-events', 'none')

  const textLines = splitIntoLines(note)
  const lineCount = Math.max(1, textLines.length)
  const tooltipWidth = 240
  const tooltipHeight = 42 + lineCount * 14
  const boxX = centerX - tooltipWidth / 2
  const boxY = centerY - 58 - tooltipHeight

  const rect = createSvgElement('rect')
  rect.setAttribute('class', 'export-tooltip-box')
  rect.setAttribute('x', String(boxX))
  rect.setAttribute('y', String(boxY))
  rect.setAttribute('width', String(tooltipWidth))
  rect.setAttribute('height', String(tooltipHeight))
  rect.setAttribute('rx', '10')

  const titleText = createSvgElement('text')
  titleText.setAttribute('class', 'export-tooltip-title')
  titleText.setAttribute('x', String(boxX + 12))
  titleText.setAttribute('y', String(boxY + 18))
  titleText.textContent = title || 'Skill'

  const noteText = createSvgElement('text')
  noteText.setAttribute('class', 'export-tooltip-note')
  noteText.setAttribute('x', String(boxX + 12))
  noteText.setAttribute('y', String(boxY + 34))

  if (textLines.length === 0) {
    noteText.textContent = 'Keine Release Note hinterlegt.'
  } else {
    textLines.forEach((line, index) => {
      const tspan = createSvgElement('tspan')
      tspan.setAttribute('x', String(boxX + 12))
      tspan.setAttribute('dy', index === 0 ? '0' : '14')
      tspan.textContent = line
      noteText.appendChild(tspan)
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
  overlayLayer.setAttribute('class', 'export-tooltip-layer')

  anchors.forEach((anchor, index) => {
    const x = toNumber(anchor.getAttribute('x'))
    const y = toNumber(anchor.getAttribute('y'))
    const width = toNumber(anchor.getAttribute('width'))
    const height = toNumber(anchor.getAttribute('height'))

    const centerX = x + width / 2
    const centerY = y + height / 2

    const label = sanitizeText(anchor.getAttribute('data-export-label')) || 'Skill'
    const note = sanitizeText(anchor.getAttribute('data-export-note')) || 'Keine Release Note hinterlegt.'
    const triggerId = `export-tooltip-trigger-${index + 1}`

    const trigger = createSvgElement('circle')
    trigger.setAttribute('id', triggerId)
    trigger.setAttribute('class', 'export-tooltip-trigger')
    trigger.setAttribute('cx', String(centerX))
    trigger.setAttribute('cy', String(centerY))
    trigger.setAttribute('r', String(Math.max(26, width * 0.28)))

    const title = createSvgElement('title')
    title.textContent = `${label} - ${note}`
    trigger.appendChild(title)

    overlayLayer.appendChild(buildTooltipGroup({
      id: triggerId,
      centerX,
      centerY,
      title: label,
      note,
    }))
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

export const serializeSvgElementForExport = (svgElement) => {
  if (!svgElement || typeof XMLSerializer === 'undefined') {
    return null
  }

  const clone = svgElement.cloneNode(true)
  clone.removeAttribute('class')
  clone.setAttribute('xmlns', SVG_NS)
  clone.setAttribute('xmlns:xlink', SVG_XLINK_NS)
  injectExportTooltipStyles(clone)
  appendAnimatedTooltips(clone)

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

export const exportSvgFromElement = (svgElement, fileName = 'skilltree-roadmap.svg') => {
  const markup = serializeSvgElementForExport(svgElement)

  if (!markup) {
    return false
  }

  return downloadSvgMarkup(markup, fileName)
}
