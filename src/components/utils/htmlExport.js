import { buildPersistedDocumentPayload, parseDocumentPayload } from './documentPersistence'
import { collectReleaseNoteEntries } from './pdfExport'
import { renderMarkdownToHtml } from './markdown'
import { renderScopeLabelsMarkup } from './scopeDisplay'
import { buildExportFileName, sanitizeFileNamePart } from './exportFileName'
import { serializeSvgElementForExport } from './svgExport'
import { VIEWPORT_DEFAULTS, VIEWPORT_ZOOM_STEPS } from './viewport'
import { EMPTY_RELEASE_NOTE, getNodeLabelMode } from './nodePresentation'
import { getPortalCounterpartNodeIdFromData, isDoubleActivation } from './nodeInteraction'
import { INTERACTIVE_SVG_RUNTIME_SCRIPT, INTERACTIVE_SVG_RUNTIME_STYLE_TEXT } from './interactiveSvgRuntime'
import { DEFAULT_STATUS_DESCRIPTIONS, NODE_LABEL_ZOOM, STATUS_LABELS, STATUS_STYLES } from '../config'
import { AXIS_SIZES, AXIS_COUNT, MATRIX_PADDING, NODE_RADIUS, computeMatrixLayout } from './matrixLayout'
import { getNodeDisplayEffort, getNodeDisplayBenefit, EFFORT_SIZE_LABELS, BENEFIT_SIZE_LABELS } from './effortBenefit'
import { getDisplayStatusKey } from './nodeStatus'
import { buildStatusSummaryGroups, getOrderedNodeRankMap, getStatusSummarySortLabel } from './statusSummary'
import { RELEASE_FILTER_OPTIONS, SCOPE_FILTER_ALL, getReleaseVisibilityMode as getSharedReleaseVisibilityMode } from './visibility'
import { getPortalViewModel } from './portalPresentation'
import htmlToImageBundle from 'html-to-image/dist/html-to-image.js?raw'
import printFocusedCssText from './printed.css?raw'

export const HTML_EXPORT_DATA_SCRIPT_ID = 'skilltree-export-data'
const HTML_TO_IMAGE_BUNDLE = String(htmlToImageBundle).replace(/<\/script/gi, '<\\/script')
const PRINT_FOCUSED_CSS_TEXT = (() => {
  if (typeof printFocusedCssText === 'string' && printFocusedCssText.includes('@page')) {
    return printFocusedCssText
  }

  if (printFocusedCssText && typeof printFocusedCssText === 'object') {
    const fallbackText = printFocusedCssText.default
    if (typeof fallbackText === 'string' && fallbackText.includes('@page')) {
      return fallbackText
    }
  }

  return `@page { size: A4 portrait; margin: 12mm; }
@media print {
  body { margin: 0 !important; background: #ffffff !important; color: #111827 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .html-export__actions,
  .html-export__roadmap-actions,
  .html-export__menu-panel,
  .html-export__menu,
  .html-export__action,
  .html-export__menu-button { display: none !important; }
  .html-export__tree-shell { overflow: visible !important; }
}`
})()

const XML_PREFIX_PATTERN = /^<\?xml[^>]*\?>\s*/i

const normalizeScopeKey = (label) => String(label ?? '').trim().toLowerCase()

const getResolvedReleaseIds = (roadmapDocument, selectedReleaseIds = null) => {
  const allReleaseIds = (Array.isArray(roadmapDocument?.releases) ? roadmapDocument.releases : [])
    .map((release) => release?.id)
    .filter(Boolean)

  if (allReleaseIds.length === 0) {
    return []
  }

  if (!Array.isArray(selectedReleaseIds) || selectedReleaseIds.length === 0) {
    return allReleaseIds
  }

  const allowedIds = new Set(allReleaseIds)
  const filteredIds = selectedReleaseIds.filter((releaseId) => allowedIds.has(releaseId))
  return filteredIds.length > 0 ? filteredIds : allReleaseIds
}

const filterDocumentByReleaseIds = (roadmapDocument, releaseIds) => {
  if (!roadmapDocument || typeof roadmapDocument !== 'object') {
    return roadmapDocument
  }

  if (!Array.isArray(roadmapDocument.releases) || roadmapDocument.releases.length === 0) {
    return roadmapDocument
  }

  const releaseIdSet = new Set(releaseIds)
  const filteredDocument = JSON.parse(JSON.stringify(roadmapDocument))
  filteredDocument.releases = (filteredDocument.releases ?? []).filter((release) => releaseIdSet.has(release?.id))

  const walk = (node) => {
    if (!node || typeof node !== 'object') {
      return
    }

    const levels = Array.isArray(node.levels) ? node.levels : []
    node.levels = levels.map((level) => {
      if (!level || typeof level !== 'object' || !level.statuses || typeof level.statuses !== 'object') {
        return level
      }

      const nextStatuses = {}
      for (const [releaseId, status] of Object.entries(level.statuses)) {
        if (releaseIdSet.has(releaseId)) {
          nextStatuses[releaseId] = status
        }
      }

      return {
        ...level,
        statuses: nextStatuses,
      }
    })

    for (const child of node.children ?? []) {
      walk(child)
    }
  }

  for (const root of filteredDocument.children ?? []) {
    walk(root)
  }

  return filteredDocument
}

const canonicalizeDocumentForExport = (doc) => {
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.scopes)) return doc

  const seen = new Map()
  const idMap = new Map()
  const scopes = []

  for (const scope of doc.scopes) {
    const rawLabel = typeof scope?.label === 'string' ? scope.label : ''
    const label = String(rawLabel).trim()
    const key = normalizeScopeKey(label)
    if (!key) continue

    const scopeEntry = {
      ...scope,
      id: scope?.id,
      label,
    }

    if (!seen.has(key)) {
      seen.set(key, scopeEntry)
    } else {
      const existing = seen.get(key)
      if (!existing?.color && scopeEntry.color) {
        seen.set(key, {
          ...existing,
          color: scopeEntry.color,
        })
      }
    }
    idMap.set(scope.id, seen.get(key).id)
  }

  for (const scope of Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label))) {
    scopes.push(scope)
  }

  const canonicalDoc = JSON.parse(JSON.stringify(doc))
  canonicalDoc.scopes = scopes

  const allowedScopeIds = new Set(scopes.map((s) => s.id))

  const remapScopeId = (oldId) => {
    const mapped = idMap.get(oldId) ?? oldId
    return allowedScopeIds.has(mapped) ? mapped : null
  }

  const remapLevels = (levels) => (Array.isArray(levels) ? levels.map((lvl) => ({
    ...lvl,
    scopeIds: Array.from(new Set((lvl.scopeIds ?? []).map(remapScopeId).filter(Boolean))),
  })) : levels)

  const walk = (node) => {
    if (!node || typeof node !== 'object') return
    node.levels = remapLevels(node.levels)
    for (const child of node.children ?? []) walk(child)
  }

  for (const root of canonicalDoc.children ?? []) walk(root)

  return canonicalDoc
}

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

const escapeJsonForScriptTag = (value) => value
  .replace(/</g, '\\u003c')
  .replace(/-->/g, '--\\u003e')

const compareText = (left, right) => String(left ?? '').localeCompare(String(right ?? ''), undefined, {
  sensitivity: 'base',
  numeric: true,
})

const formatDisplayDate = (value) => {
  const rawValue = String(value ?? '').trim()
  if (!rawValue) {
    return ''
  }

  const parsed = new Date(rawValue)
  if (Number.isNaN(parsed.getTime())) {
    return rawValue
  }

  return parsed.toLocaleDateString()
}

const HTML_EXPORT_LEGEND_STATUS_ORDER = ['done', 'now', 'next', 'later', 'someday']
const HTML_EXPORT_PORTAL_LEGEND = [
  {
    className: 'html-export__roadmap-legend-portal--incoming',
    glyph: '◌',
    title: 'Incoming portal',
    copy: 'This node depends on another skill.',
  },
  {
    className: 'html-export__roadmap-legend-portal--outgoing',
    glyph: '◆',
    title: 'Outgoing portal',
    copy: 'This node enables or links to another skill.',
  },
]

const buildRoadmapLegendMarkup = (roadmapDocument) => {
  const statusDescriptions = {
    ...DEFAULT_STATUS_DESCRIPTIONS,
    ...(roadmapDocument?.statusDescriptions ?? {}),
  }

  const statusMarkup = HTML_EXPORT_LEGEND_STATUS_ORDER.map((statusKey) => {
    const dotColor = STATUS_STYLES[statusKey]?.ringBand ?? STATUS_STYLES[statusKey]?.base ?? '#94a3b8'
    const statusTitle = STATUS_LABELS[statusKey] ?? statusKey
    const statusCopy = statusDescriptions[statusKey] ?? ''

    return `
      <span class="html-export__roadmap-legend-item html-export__roadmap-legend-item--status">
        <span class="html-export__roadmap-legend-dot" style="background: ${escapeHtml(dotColor)};"></span>
        <span class="html-export__roadmap-legend-copy">
          <strong>${escapeHtml(statusTitle)}</strong>
          <span>${escapeHtml(statusCopy)}</span>
        </span>
      </span>
    `
  }).join('')

  const portalMarkup = HTML_EXPORT_PORTAL_LEGEND.map((item) => `
    <span class="html-export__roadmap-legend-item html-export__roadmap-legend-item--portal">
      <span class="html-export__roadmap-legend-portal ${item.className}" aria-hidden="true">${item.glyph}</span>
      <span class="html-export__roadmap-legend-copy">
        <strong>${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(item.copy)}</span>
      </span>
    </span>
  `).join('')

  return `
    <div class="html-export__roadmap-legend" aria-label="Status legend">
      <div class="html-export__roadmap-legend-title">Status legend</div>
      <div class="html-export__roadmap-legend-grid">
        ${statusMarkup}
        ${portalMarkup}
      </div>
      <div class="html-export__roadmap-legend-tip">
        <span class="html-export__roadmap-legend-tip-icon" aria-hidden="true">ⓘ</span>
        <span>Tip: Zooming in or hovering reveals more node details.</span>
      </div>
    </div>
  `
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

const buildVoiceOfCustomerMarkup = (voiceOfCustomer = '', fictionalCustomerName = '') => {
  const quoteHtml = renderMarkdownToHtml(voiceOfCustomer)
  const customerName = String(fictionalCustomerName ?? '').trim()

  if (!quoteHtml) {
    return ''
  }

  return `
    <section class="html-export__customer-quote">
      <p class="html-export__customer-quote-eyebrow">Voice of Customer</p>
      <blockquote class="html-export__customer-quote-body">
        <div class="html-export__customer-quote-markdown">${quoteHtml}</div>
        ${customerName ? `<footer>— ${escapeHtml(customerName)}</footer>` : ''}
      </blockquote>
    </section>
  `
}

const sortReleaseNoteEntries = (entries, nodeRankById = new Map()) => {
  return [...entries].sort((left, right) => {
    const leftRank = nodeRankById.get(left.nodeId) ?? Number.MAX_SAFE_INTEGER
    const rightRank = nodeRankById.get(right.nodeId) ?? Number.MAX_SAFE_INTEGER

    if (leftRank !== rightRank) {
      return leftRank - rightRank
    }

    const segmentDelta = compareText(left.segmentLabel, right.segmentLabel)
    if (segmentDelta !== 0) {
      return segmentDelta
    }

    return compareText(left.nodeLabel, right.nodeLabel)
  })
}

const buildReleaseNotesMarkup = (entries, releaseMeta = {}) => {
  const releaseData = typeof releaseMeta === 'string' ? { introduction: releaseMeta } : (releaseMeta ?? {})
  const introductionHtml = renderMarkdownToHtml(releaseData.introduction ?? '')
  const quoteMarkup = buildVoiceOfCustomerMarkup(releaseData.voiceOfCustomer ?? '', releaseData.fictionalCustomerName ?? '')

  if (entries.length === 0) {
    return `${introductionHtml ? `<article class="html-export__intro">${introductionHtml}</article>` : ''}<p class="html-export__empty">Keine Release Notes vorhanden.</p>${quoteMarkup}`
  }

  const parts = []
  const entriesBySegment = new Map()

  if (introductionHtml) {
    parts.push(`<article class="html-export__intro">${introductionHtml}</article>`)
  }

  entries.forEach((entry) => {
    if (!entriesBySegment.has(entry.segmentLabel)) {
      entriesBySegment.set(entry.segmentLabel, [])
    }

    entriesBySegment.get(entry.segmentLabel).push(entry)
  })

  for (const [segmentLabel, segmentEntries] of entriesBySegment.entries()) {
    parts.push(`<section class="html-export__release-group"><p class="html-export__release-group-label">${escapeHtml(segmentLabel)}</p></section>`)

    segmentEntries.forEach((entry) => {
      const title = entry.shortName
        ? `${escapeHtml(entry.nodeLabel)} (${escapeHtml(entry.shortName)})`
        : escapeHtml(entry.nodeLabel)
      const levelText = entry.levelCount > 1 ? escapeHtml(entry.levelLabel) : ''
      const statusText = escapeHtml(entry.statusLabel)
      const scopeMarkup = renderScopeLabelsMarkup(entry.scopeLabels)

      parts.push(`
        <article class="html-export__note-card">
          <div class="html-export__note-layout">
            <div class="html-export__note-main">
              <header class="html-export__note-header">
                <strong>${title}</strong>
                <span>${levelText ? `${levelText} · ` : ''}${statusText}</span>
              </header>
              <div class="html-export__note-markdown">${renderMarkdownToHtml(entry.releaseNote)}</div>
            </div>
            ${scopeMarkup ? `<aside class="html-export__note-aside"><div class="skill-node-tooltip__scopes" aria-label="Scopes">${scopeMarkup}</div></aside>` : ''}
          </div>
        </article>
      `)
    })
  }

  if (quoteMarkup) {
    parts.push(quoteMarkup)
  }

  return parts.join('\n')
}

const buildStatusSummaryMarkup = (roadmapDocument, { sortMode = 'manual', selectedReleaseId = null } = {}) => {
  const groups = buildStatusSummaryGroups(roadmapDocument, { sortMode, selectedReleaseId })
    .filter((group) => group.nodes.length > 0)

  if (groups.length === 0) {
    return '<p class="html-export__empty">No features available.</p>'
  }

  return `
    <div class="html-export__status-summary" data-sort-mode="${escapeHtml(sortMode)}">
      ${groups.map((group) => `
        <section class="html-export__status-group">
          <header class="html-export__status-group-header">
            <strong>${escapeHtml(group.label)}</strong>
            <span>${group.nodes.length}</span>
          </header>
          <div class="html-export__status-items">
            ${group.nodes.map((node, index) => `
              <div class="html-export__status-item">
                <span class="html-export__status-rank">${index + 1}</span>
                <span class="html-export__status-copy">${escapeHtml(node.label ?? node.shortName ?? 'Untitled feature')}</span>
              </div>
            `).join('')}
          </div>
        </section>
      `).join('')}
    </div>
  `
}

const MATRIX_CELL_SIZE = 100
const MATRIX_CONTENT_WIDTH = MATRIX_PADDING * 2 + AXIS_COUNT * MATRIX_CELL_SIZE
const MATRIX_BOTTOM_LABEL_SPACE = 44
const MATRIX_CONTENT_HEIGHT = MATRIX_PADDING + AXIS_COUNT * MATRIX_CELL_SIZE + MATRIX_BOTTOM_LABEL_SPACE

const resolveMatrixStatusKey = (node, releaseId = null) => {
  const levels = Array.isArray(node?.levels) ? node.levels : []
  if (levels.length > 0) {
    return getDisplayStatusKey(node, releaseId) ?? 'later'
  }
  return node?.status ?? 'later'
}

const collectMatrixNodes = (document) => {
  const result = []
  const queue = [...(document?.children ?? [])]
  while (queue.length > 0) {
    const node = queue.shift()
    result.push(node)
    queue.push(...(node.children ?? []))
  }
  return result
}

const buildPriorityMatrixSvgMarkup = (roadmapDocument, releaseId = null) => {
  const allNodes = collectMatrixNodes(roadmapDocument)
  const plottable = allNodes.filter((n) => {
    const effort = getNodeDisplayEffort(n)
    const benefit = getNodeDisplayBenefit(n)
    return AXIS_SIZES.includes(effort?.size) && AXIS_SIZES.includes(benefit?.size)
  })

  const positioned = computeMatrixLayout(plottable, MATRIX_CELL_SIZE)
  const entries = positioned.map((entry) => ({
    ...entry,
    statusKey: resolveMatrixStatusKey(entry.node, releaseId),
  }))

  const cellRects = AXIS_SIZES.flatMap((efKey, col) =>
    AXIS_SIZES.map((beKey, row) => {
      const invertedRow = AXIS_COUNT - 1 - row
      const cx = MATRIX_PADDING + col * MATRIX_CELL_SIZE
      const cy = MATRIX_PADDING + invertedRow * MATRIX_CELL_SIZE
      const isEvenCell = (col + invertedRow) % 2 === 0
      return `<rect x="${cx}" y="${cy}" width="${MATRIX_CELL_SIZE}" height="${MATRIX_CELL_SIZE}" fill="${isEvenCell ? 'rgba(30,41,59,0.7)' : 'rgba(15,23,42,0.7)'}" stroke="rgba(71,85,105,0.5)" stroke-width="0.5"/>`
    }),
  ).join('')

  const xAxisLabels = AXIS_SIZES.map((key, col) =>
    `<text x="${MATRIX_PADDING + col * MATRIX_CELL_SIZE + MATRIX_CELL_SIZE / 2}" y="${MATRIX_PADDING + AXIS_COUNT * MATRIX_CELL_SIZE + 18}" text-anchor="middle" fill="#94a3b8" font-size="12" font-weight="600" font-family="inherit">${escapeHtml(EFFORT_SIZE_LABELS[key] ?? key.toUpperCase())}</text>`,
  ).join('')

  const xAxisTitle = `<text x="${MATRIX_PADDING + (AXIS_COUNT * MATRIX_CELL_SIZE) / 2}" y="${MATRIX_PADDING + AXIS_COUNT * MATRIX_CELL_SIZE + 36}" text-anchor="middle" fill="#64748b" font-size="11" font-family="inherit">&#x26A1; Effort &#x2192;</text>`

  const yAxisLabels = AXIS_SIZES.map((key, row) => {
    const invertedRow = AXIS_COUNT - 1 - row
    return `<text x="${MATRIX_PADDING - 8}" y="${MATRIX_PADDING + invertedRow * MATRIX_CELL_SIZE + MATRIX_CELL_SIZE / 2 + 1}" text-anchor="end" dominant-baseline="middle" fill="#94a3b8" font-size="12" font-weight="600" font-family="inherit">${escapeHtml(BENEFIT_SIZE_LABELS[key] ?? key.toUpperCase())}</text>`
  }).join('')

  const yAxisTitle = `<text x="${MATRIX_PADDING - 36}" y="${MATRIX_PADDING + (AXIS_COUNT * MATRIX_CELL_SIZE) / 2}" text-anchor="middle" dominant-baseline="middle" fill="#64748b" font-size="11" font-family="inherit" transform="rotate(-90, ${MATRIX_PADDING - 36}, ${MATRIX_PADDING + (AXIS_COUNT * MATRIX_CELL_SIZE) / 2})">&#x2605; Benefit &#x2192;</text>`

  const nodeCircles = entries.map((entry) => {
    const { node, x, y, radius = NODE_RADIUS, statusKey } = entry
    const style = STATUS_STYLES[statusKey] ?? STATUS_STYLES.later
    const shortName = escapeHtml(String(node.shortName ?? node.label ?? '').slice(0, 3).toUpperCase())
    const effortLabel = escapeHtml(EFFORT_SIZE_LABELS[getNodeDisplayEffort(node).size] ?? getNodeDisplayEffort(node).size ?? '–')
    const benefitLabel = escapeHtml(BENEFIT_SIZE_LABELS[getNodeDisplayBenefit(node).size] ?? getNodeDisplayBenefit(node).size ?? '–')
    const labelText = escapeHtml(String(node.label ?? ''))
    // Always show shortnames in the static export; use data-* for JS tooltip
    return `<g class="pm-export-node" data-pm-label="${labelText}" data-pm-effort="${effortLabel}" data-pm-benefit="${benefitLabel}" data-pm-status="${escapeHtml(statusKey)}" style="cursor:default"><circle cx="${x}" cy="${y}" r="${radius}" fill="${style.glowSegment ?? '#1e3a5f'}" stroke="${style.ringBand ?? '#3b82f6'}" stroke-width="1.5"/><text x="${x}" y="${y + 1}" text-anchor="middle" dominant-baseline="middle" fill="${style.textColor ?? '#e2e8f0'}" font-size="10" font-weight="700" font-family="inherit" style="pointer-events:none;user-select:none">${shortName}</text></g>`
  }).join('')

  const emptyState = entries.length === 0
    ? `<text x="${MATRIX_PADDING + (AXIS_COUNT * MATRIX_CELL_SIZE) / 2}" y="${MATRIX_PADDING + (AXIS_COUNT * MATRIX_CELL_SIZE) / 2}" text-anchor="middle" dominant-baseline="middle" fill="#475569" font-size="14" font-family="inherit">No nodes with Effort &amp; Benefit set</text>`
    : ''

  return `<svg id="pm-export-svg" width="100%" viewBox="0 0 ${MATRIX_CONTENT_WIDTH} ${MATRIX_CONTENT_HEIGHT}" preserveAspectRatio="xMidYMid meet" style="display:block;max-height:520px;max-width:100%">${cellRects}${xAxisLabels}${xAxisTitle}${yAxisLabels}${yAxisTitle}${nodeCircles}${emptyState}</svg>`
}

const buildReleaseSectionsMarkup = ({
  roadmapDocument,
  releaseIds,
  releaseNoteStatusKeys = null,
  statusSummarySortMode = 'manual',
  selectedReleaseId = null,
}) => {
  const releases = Array.isArray(roadmapDocument?.releases) ? roadmapDocument.releases : []
  if (releases.length === 0 || releaseIds.length === 0) {
    const nodeRankById = getOrderedNodeRankMap(roadmapDocument, {
      sortMode: statusSummarySortMode,
      selectedReleaseId,
    })
    const releaseNoteEntries = sortReleaseNoteEntries(
      collectReleaseNoteEntries(roadmapDocument, selectedReleaseId, releaseNoteStatusKeys),
      nodeRankById,
    )
    return buildReleaseNotesMarkup(releaseNoteEntries, roadmapDocument?.release ?? {})
  }

  const releaseById = new Map(releases.map((release) => [release.id, release]))

  return releaseIds.map((releaseId) => {
    const release = releaseById.get(releaseId)
    const releaseName = String(release?.name ?? '').trim() || 'Release'
    const releaseMotto = String(release?.motto ?? '').trim()
    const releaseDate = String(release?.date ?? '').trim()
    const nodeRankById = getOrderedNodeRankMap(roadmapDocument, {
      sortMode: statusSummarySortMode,
      selectedReleaseId: releaseId ?? selectedReleaseId,
    })
    const releaseNoteEntries = sortReleaseNoteEntries(
      collectReleaseNoteEntries(roadmapDocument, releaseId, releaseNoteStatusKeys),
      nodeRankById,
    )
    const subtitleParts = []

    if (releaseMotto) {
      subtitleParts.push(releaseMotto)
    }
    if (releaseDate) {
      subtitleParts.push(`Release Date: ${formatDisplayDate(releaseDate)}`)
    }

    return `
      <section class="html-export__release-block">
        <header class="html-export__release-header">
          <h3>${escapeHtml(releaseName)}</h3>
          ${subtitleParts.length > 0 ? `<p>${escapeHtml(subtitleParts.join(' · '))}</p>` : ''}
        </header>
        <div class="html-export__release-list">${buildReleaseNotesMarkup(releaseNoteEntries, release ?? {})}</div>
      </section>
    `
  }).join('\n')
}

const buildViewerScript = (exportBaseName = 'skilltree-roadmap') => `
    (() => {
  window.__skilltreeExportViewerReady = true
      const RELEASE_FILTER = ${JSON.stringify(RELEASE_FILTER_OPTIONS)}
      const SCOPE_FILTER_ALL = ${JSON.stringify(SCOPE_FILTER_ALL)}
      const MINIMAL_NODE_SCALE = 0.32
      const VIEWPORT_ZOOM_STEPS = ${JSON.stringify(VIEWPORT_ZOOM_STEPS)}
      const VIEWPORT = {
        minScale: ${VIEWPORT_DEFAULTS.minScale},
        maxScale: ${VIEWPORT_DEFAULTS.maxScale},
        fitPadding: ${VIEWPORT_DEFAULTS.fitPadding},
      }

      // Zoom thresholds for responsive node labels (mirrors NODE_LABEL_ZOOM in config.js)
      const NODE_LABEL_ZOOM = {
        farToMid: ${NODE_LABEL_ZOOM.farToMid},
        midToClose: ${NODE_LABEL_ZOOM.midToClose},
        closeToVeryClose: ${NODE_LABEL_ZOOM.closeToVeryClose},
      }
      const EMPTY_RELEASE_NOTE = ${JSON.stringify(EMPTY_RELEASE_NOTE)}
      const INTERACTIVE_SVG_RUNTIME_SCRIPT = ${JSON.stringify(INTERACTIVE_SVG_RUNTIME_SCRIPT)}
      const INTERACTIVE_SVG_RUNTIME_STYLE_TEXT = ${JSON.stringify(INTERACTIVE_SVG_RUNTIME_STYLE_TEXT)}

      const STATUS_TEXT_COLORS = {
        done: '#5a6576',
        now: '#ffffff',
        next: '#ffffff',
        later: '#4f5f75',
      }

      const normalizeStatusKey = (status) => {
        if (!status) {
          return 'later'
        }

        const aliases = {
          done: 'done',
          now: 'now',
          next: 'next',
          later: 'later',
          fertig: 'done',
          jetzt: 'now',
          spaeter: 'later',
          später: 'later',
        }

        const normalized = String(status).trim().toLowerCase()
        return aliases[normalized] ?? 'later'
      }

      const getDisplayStatusKey = (node) => {
        const levels = Array.isArray(node?.levels) ? node.levels : []
        const levelStatusKeys = levels.length > 0
          ? levels.map((level) => normalizeStatusKey(level.status))
          : [normalizeStatusKey(node?.status)]

        if (levelStatusKeys.includes('now')) return 'now'
        if (levelStatusKeys.includes('next')) return 'next'
        if (levelStatusKeys.includes('later')) return 'later'

        return levelStatusKeys[0] ?? 'later'
      }

      const getReleaseVisibilityMode = ${getSharedReleaseVisibilityMode.toString()}
      const getPortalViewModel = ${getPortalViewModel.toString()}

      const walkNodes = (node, visitor) => {
        if (!node || !Array.isArray(node.children)) {
          return
        }

        node.children.forEach((child) => {
          visitor(child)
          walkNodes(child, visitor)
        })
      }

      const treeCanvas = document.getElementById('html-export-tree-canvas')
      const svgRoot = treeCanvas?.querySelector('svg')
      const treeShell = document.getElementById('html-export-tree-shell')
      const roadmapPanel = document.querySelector('.html-export__panel--roadmap')
      const zoomToggleButton = document.getElementById('html-export-zoom-toggle')
      const zoomOutButton = document.getElementById('html-export-zoom-out')
      const zoomInButton = document.getElementById('html-export-zoom-in')
      const zoomSlider = document.getElementById('html-export-zoom-slider')
      const zoomValue = document.getElementById('html-export-zoom-value')
      const fitButton = document.getElementById('html-export-fit')
      const fullscreenButton = document.getElementById('html-export-fullscreen')
      const scopeFilterSelect = document.getElementById('html-export-filter-scope')
      const releaseFilterSelect = document.getElementById('html-export-filter-release')
      const printButton = document.getElementById('html-export-print')
      const pngButton = document.getElementById('html-export-png')
      const svgButton = document.getElementById('html-export-svg')
      const cleanSvgButton = document.getElementById('html-export-svg-clean')
      const exportDataScript = document.getElementById('${HTML_EXPORT_DATA_SCRIPT_ID}')
      const pmExportContainer = document.getElementById('pm-export-container')
      const menuDetails = Array.from(document.querySelectorAll('.html-export__menu'))

      const syncMenuButtonState = () => {
        menuDetails.forEach((menu) => {
          const summary = menu.querySelector('.html-export__menu-button')
          summary?.setAttribute('aria-expanded', String(menu.open))
        })
      }

      const closeMenus = (exceptMenu = null) => {
        menuDetails.forEach((menu) => {
          if (menu !== exceptMenu) {
            menu.removeAttribute('open')
          }
        })
        syncMenuButtonState()
      }

      const nodeInfoById = new Map()
      const allScopeIds = new Set()
      const scopeColorById = new Map()

      const getSelectedScopeIds = () => {
        const options = Array.from(scopeFilterSelect?.options ?? [])

        if (options.length === 0) {
          return []
        }

        const allOption = options.find((option) => option.value === SCOPE_FILTER_ALL)
        const selectedScopeIds = options
          .filter((option) => option.selected)
          .map((option) => option.value)
          .filter(Boolean)

        const filteredScopeIds = selectedScopeIds.filter((scopeId) => scopeId !== SCOPE_FILTER_ALL && scopeId !== 'all')

        if (allOption && filteredScopeIds.length > 0) {
          allOption.selected = false
        }

        return filteredScopeIds
      }

      const scopeIdsMatchFilter = (scopeIds, selectedScopeIds) => {
        const normalizedSelectedScopeIds = Array.isArray(selectedScopeIds) ? selectedScopeIds.filter(Boolean) : []

        if (normalizedSelectedScopeIds.length === 0) {
          return true
        }

        const selectedGroups = new Map()

        normalizedSelectedScopeIds.forEach((selectedScopeId) => {
          const selectedColor = scopeColorById.get(selectedScopeId) ?? null
          const groupKey = selectedColor ? 'color:' + selectedColor : 'scope:' + selectedScopeId
          const existingGroup = selectedGroups.get(groupKey) ?? {
            selectedIds: new Set(),
            groupScopeIds: new Set([selectedScopeId]),
          }

          existingGroup.selectedIds.add(selectedScopeId)
          if (selectedColor) {
            scopeColorById.forEach((color, scopeId) => {
              if (color === selectedColor) {
                existingGroup.groupScopeIds.add(scopeId)
              }
            })
          }

          selectedGroups.set(groupKey, existingGroup)
        })

        const assignedScopeIds = Array.isArray(scopeIds) ? scopeIds.filter(Boolean) : []

        return [...selectedGroups.values()].every(({ selectedIds, groupScopeIds }) => {
          const hasAssignmentInSelectedGroup = assignedScopeIds.some((scopeId) => groupScopeIds.has(scopeId))

          if (!hasAssignmentInSelectedGroup) {
            return true
          }

          return assignedScopeIds.some((scopeId) => selectedIds.has(scopeId))
        })
      }

      if (exportDataScript?.textContent) {
        try {
          const payload = JSON.parse(exportDataScript.textContent)
          const documentData = payload?.document ?? null
          const scopes = Array.isArray(documentData?.scopes) ? documentData.scopes : []

          scopes.forEach((scope) => {
            if (scope?.id) {
              allScopeIds.add(scope.id)
              scopeColorById.set(
                scope.id,
                typeof scope.color === 'string' && scope.color.trim() ? scope.color.trim().toLowerCase() : null,
              )
            }
          })

          walkNodes(documentData ?? {}, (node) => {
            const levels = Array.isArray(node?.levels) ? node.levels : []
            const scopeIds = new Set()

            levels.forEach((level) => {
              if (!Array.isArray(level?.scopeIds)) {
                return
              }

              level.scopeIds.forEach((scopeId) => {
                if (scopeId) {
                  scopeIds.add(scopeId)
                  allScopeIds.add(scopeId)
                }
              })
            })

            nodeInfoById.set(node.id, {
              id: node.id,
              status: getDisplayStatusKey(node),
              segmentId: node.segmentId ?? null,
              scopeIds,
              levelScopeIds: levels.map((level) => Array.isArray(level?.scopeIds) ? level.scopeIds.filter(Boolean) : []),
            })
          })
        } catch {
          // Keep viewer usable even when embedded payload is malformed.
        }
      }

      const nodeAnchors = Array.from(document.querySelectorAll('foreignObject.skill-node-export-anchor[data-node-id]'))
      const linkElements = Array.from(document.querySelectorAll('[data-link-source-id][data-link-target-id]'))
      const segmentLabels = Array.from(document.querySelectorAll('[data-segment-id]'))
      const segmentSeparators = Array.from(document.querySelectorAll('[data-segment-left][data-segment-right]'))
      const portalElements = Array.from(document.querySelectorAll('[data-portal-node-id][data-portal-source-id][data-portal-target-id]'))
      const tooltipNodeElements = Array.from(document.querySelectorAll('[data-tooltip-node-id]'))
      const nodeAnchorById = new Map(nodeAnchors.map((anchor) => [anchor.getAttribute('data-node-id'), anchor]))
      const portalElementsByBaseKey = new Map()

      portalElements.forEach((portalElement) => {
        const portalKey = String(portalElement.getAttribute('data-portal-key') ?? '')
        const baseKey = portalKey.replace(/:(?:source|target)$/, '')
        if (!baseKey) {
          return
        }

        const existing = portalElementsByBaseKey.get(baseKey) ?? []
        existing.push(portalElement)
        portalElementsByBaseKey.set(baseKey, existing)
      })

      // --- Responsive label mode logic ------------------------------------

      const escapeLabelHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

      const renderSimpleMarkdown = (value) => {
        const escaped = escapeLabelHtml(value)
        return escaped.replace(/\\n/g, '<br/>')
      }

      const parseExportLevels = (value) => {
        try {
          const parsed = JSON.parse(String(value ?? '[]'))
          return Array.isArray(parsed) ? parsed : []
        } catch {
          return []
        }
      }

      const getPreferredVeryCloseLevel = (levels, fallbackNote) => {
        if (!Array.isArray(levels) || levels.length === 0) {
          return {
            label: 'L1',
            releaseNote: String(fallbackNote ?? EMPTY_RELEASE_NOTE).trim() || EMPTY_RELEASE_NOTE,
            releaseNoteHtml: renderSimpleMarkdown(String(fallbackNote ?? EMPTY_RELEASE_NOTE).trim() || EMPTY_RELEASE_NOTE),
            scopeLabels: [],
            effort: null,
            benefit: null,
          }
        }

        const withNotes = levels.find((level) => String(level?.releaseNote ?? '').trim())
        const first = levels[0] ?? null
        const selected = withNotes ?? first

        return {
          ...selected,
          label: String(selected?.label ?? 'L1'),
          releaseNote: String(selected?.releaseNote ?? fallbackNote ?? EMPTY_RELEASE_NOTE).trim() || EMPTY_RELEASE_NOTE,
          releaseNoteHtml: String(selected?.releaseNoteHtml ?? '').trim() || renderSimpleMarkdown(String(selected?.releaseNote ?? fallbackNote ?? EMPTY_RELEASE_NOTE).trim() || EMPTY_RELEASE_NOTE),
        }
      }

      const EFFORT_LABELS = ${JSON.stringify(EFFORT_SIZE_LABELS)}
      const BENEFIT_LABELS = ${JSON.stringify(BENEFIT_SIZE_LABELS)}
      const getLabelMode = ${getNodeLabelMode.toString()}
      const isDoubleActivation = ${isDoubleActivation.toString()}
      const getPortalCounterpartNodeId = ${getPortalCounterpartNodeIdFromData.toString()}
      const readonlySelectionState = {
        nodeId: null,
        segmentId: null,
        portalKey: null,
      }
      const nodeContentState = {
        activeVeryCloseLevelByNodeId: new Map(),
      }

      const buildScopeChipsHtml = (scopeLabels = []) => {
        if (!Array.isArray(scopeLabels) || scopeLabels.length === 0) {
          return ''
        }

        return scopeLabels.slice(0, 4).map((scope) => {
          const color = scope?.color ?? '#fbbf24'
          const label = escapeLabelHtml(scope?.label ?? '')
          return '<span class="skill-node-inner-chip skill-node-inner-chip--scope" style="background:' + color + '22;border-color:' + color + '99;color:' + color + '" title="' + label + '">' + label + '</span>'
        }).join('')
      }

      const buildMetricChipsHtml = (level) => {
        const effortSize = level?.effort?.size
        const benefitSize = level?.benefit?.size
        const parts = []

        if (effortSize && effortSize !== 'unclear') {
          const effortLabel = escapeLabelHtml(EFFORT_LABELS[effortSize] ?? effortSize)
          parts.push('<span class="skill-node-inner-chip skill-node-inner-chip--effort" title="' + effortLabel + '">⚡ ' + effortLabel + '</span>')
        }

        if (benefitSize && benefitSize !== 'unclear') {
          const benefitLabel = escapeLabelHtml(BENEFIT_LABELS[benefitSize] ?? benefitSize)
          parts.push('<span class="skill-node-inner-chip skill-node-inner-chip--benefit" title="' + benefitLabel + '">★ ' + benefitLabel + '</span>')
        }

        return parts.join('')
      }

      const buildNodeChipsHtml = (level) => {
        const chipsHtml = buildScopeChipsHtml(level?.scopeLabels) + buildMetricChipsHtml(level)
        if (!chipsHtml) {
          return ''
        }

        return '<div class="skill-node-inner-chips">' + chipsHtml + '</div>'
      }

      let currentLabelMode = null

      const getAnchorNodeMetrics = (anchor) => {
        if (!anchor) {
          return null
        }

        const x = Number.parseFloat(anchor.getAttribute('x') ?? '0')
        const y = Number.parseFloat(anchor.getAttribute('y') ?? '0')
        const width = Number.parseFloat(anchor.getAttribute('width') ?? '0')
        const height = Number.parseFloat(anchor.getAttribute('height') ?? '0')
        const button = anchor.querySelector('.skill-node-button')
        const buttonWidth = Number.parseFloat(button?.style.width ?? anchor.dataset.origButtonWidth ?? '0')
        const buttonHeight = Number.parseFloat(button?.style.height ?? anchor.dataset.origButtonHeight ?? '0')
        const nodeSize = Math.max(buttonWidth || 0, buttonHeight || 0, 1)

        return {
          nodeX: x + width / 2,
          nodeY: y + height / 2,
          nodeSize,
          isMinimal: anchor.classList.contains('html-export__node--minimal'),
        }
      }

      const refreshPortalElement = (portalElement, labelMode = currentLabelMode ?? getLabelMode(panZoomState.scale)) => {
        if (!portalElement) {
          return
        }

        const nodeId = String(portalElement.getAttribute('data-portal-node-id') ?? '')
        const anchor = nodeAnchorById.get(nodeId)
        const metrics = getAnchorNodeMetrics(anchor)
        if (!metrics) {
          return
        }

        const portalView = getPortalViewModel({
          portal: {
            key: String(portalElement.getAttribute('data-portal-key') ?? ''),
            type: String(portalElement.getAttribute('data-portal-type') ?? 'source'),
            otherLabel: String(portalElement.getAttribute('data-portal-label') ?? ''),
            angle: Number.parseFloat(portalElement.getAttribute('data-portal-angle') ?? '0'),
            orbitRatio: Number.parseFloat(portalElement.getAttribute('data-portal-orbit-ratio') ?? '0'),
            isMinimal: metrics.isMinimal,
          },
          nodeX: metrics.nodeX,
          nodeY: metrics.nodeY,
          nodeSize: metrics.nodeSize,
          minimalNodeSize: metrics.nodeSize,
          labelMode,
          currentZoomScale: panZoomState.scale,
        })

        portalElement.setAttribute('transform', portalView.groupTransform)
        portalElement.setAttribute('data-portal-minimal', metrics.isMinimal ? 'true' : 'false')

        const hoverLine = portalElement.querySelector('.skill-tree-portal__hoverline')
        if (hoverLine) {
          hoverLine.setAttribute('d', portalView.spokeLinePath)
          hoverLine.style.strokeWidth = String(portalView.portalHoverStrokeWidth)
          hoverLine.style.display = portalView.showSpoke ? '' : 'none'
        }

        const spoke = portalElement.querySelector('.skill-tree-portal__spoke')
        if (spoke) {
          spoke.setAttribute('d', portalView.spokeLinePath)
          spoke.style.display = portalView.showSpoke ? '' : 'none'
        }

        const chevrons = portalElement.querySelector('.skill-tree-portal__chevrons')
        if (chevrons) {
          chevrons.setAttribute('d', portalView.spokeChevronD)
          chevrons.style.display = portalView.showSpoke && portalView.spokeChevronD ? '' : 'none'
        }

        const ring = portalElement.querySelector('.skill-tree-portal__ring')
        if (ring) {
          ring.setAttribute('d', portalView.ringPath)
          ring.setAttribute('transform', portalView.ringTransform)
        }

        const hit = portalElement.querySelector('.skill-tree-portal__hit')
        if (hit) {
          hit.setAttribute('rx', String(portalView.portalHitWidth))
          hit.setAttribute('ry', String(portalView.portalHitHeight))
          hit.setAttribute('cx', String(portalView.hitCx))
          hit.setAttribute('cy', String(portalView.hitCy))
        }

        const label = portalElement.querySelector('.skill-tree-portal__label')
        if (label) {
          label.textContent = portalView.labelName
          label.setAttribute('x', String(portalView.hitCx))
          label.setAttribute('y', String(portalView.hitCy))
          label.style.display = portalView.showLabel ? '' : 'none'
        }
      }

      const refreshPortalElements = (labelMode = currentLabelMode ?? getLabelMode(panZoomState.scale)) => {
        portalElements.forEach((portalElement) => {
          if (portalElement.style.display === 'none') {
            return
          }
          refreshPortalElement(portalElement, labelMode)
        })
      }

      const removeNodeCard = (anchor) => {
        const card = anchor.querySelector('.skill-node-label-card')
        if (!card) return
        card.remove()
        const wrapper = anchor.querySelector('.skill-node-foreign')
        if (wrapper) {
          wrapper.style.display = ''
          wrapper.style.flexDirection = ''
          wrapper.style.alignItems = ''
          wrapper.style.gap = ''
        }
        if (anchor.dataset.origFwHeight) {
          anchor.setAttribute('height', anchor.dataset.origFwHeight)
          anchor.setAttribute('width', anchor.dataset.origFwWidth)
          anchor.setAttribute('x', anchor.dataset.origFwX)
        }
      }

      const setTooltipMode = (mode) => {
        const hideTooltips = mode === 'close' || mode === 'very-close'

        tooltipNodeElements.forEach((tooltipNode) => {
          const nodeId = tooltipNode.getAttribute('data-tooltip-node-id')
          if (!nodeId) {
            return
          }

          const anchor = nodeAnchorById.get(nodeId)
          const isVisible = anchor && anchor.style.display !== 'none'
          tooltipNode.style.display = hideTooltips || !isVisible ? 'none' : ''
        })
      }

      const renderLabeledContent = ({ label, shortName, textColor, fontWeight, preferredLevel }) => (
        '<p class="skill-node-button__label" style="color:#f8fafc;font-weight:500;white-space:normal;word-break:break-word;">' + escapeLabelHtml(label) + '</p>' +
        '<p class="skill-node-button__shortname" style="font-size:0.7rem;font-weight:' + fontWeight + ';line-height:1;letter-spacing:0.12em;opacity:0.65;color:' + textColor + ';">' + escapeLabelHtml(shortName) + '</p>' +
        buildNodeChipsHtml(preferredLevel)
      )

      const renderVeryCloseContent = ({ anchor, label, levels, fallbackNote }) => {
        const nodeId = anchor.getAttribute('data-node-id') || ''
        const preferredLevel = getPreferredVeryCloseLevel(levels, fallbackNote)
        const defaultIndex = Math.max(0, levels.findIndex((level) => String(level?.label ?? '') === String(preferredLevel?.label ?? '')))
        const activeIndex = nodeContentState.activeVeryCloseLevelByNodeId.get(nodeId) ?? defaultIndex
        const activeLevel = levels[activeIndex] ?? preferredLevel
        const tabsHtml = levels.length > 1
          ? '<div class="skill-node-vc__tabs">' + levels.map((level, index) => {
            const isActive = index === activeIndex
            const statusKey = escapeLabelHtml(level?.status ?? 'later')
            const tabLabel = escapeLabelHtml(level?.label ?? ('L' + (index + 1)))
            return '<button type="button" class="skill-node-vc__tab' + (isActive ? ' skill-node-vc__tab--active' : '') + '" data-level-index="' + index + '" style="--tab-color:' + (STATUS_STYLES[level?.status ?? 'later']?.ringBand ?? STATUS_STYLES.later.ringBand) + '">' + tabLabel + '</button>'
          }).join('') + '</div>'
          : ''
        const noteHtml = String(activeLevel?.releaseNoteHtml ?? '').trim() || renderSimpleMarkdown(activeLevel?.releaseNote || EMPTY_RELEASE_NOTE)
        const chipsHtml = buildNodeChipsHtml(activeLevel)

        return '<p class="skill-node-vc__headline">' + escapeLabelHtml(label) + '</p>' + tabsHtml + '<div class="skill-node-vc__body skill-node-vc__body--markdown">' + noteHtml + '</div>' + chipsHtml
      }

      const bindVeryCloseTabs = (anchor, label, levels, fallbackNote) => {
        const nodeId = anchor.getAttribute('data-node-id') || ''
        anchor.querySelectorAll('.skill-node-vc__tab').forEach((tab) => {
          tab.addEventListener('click', (event) => {
            event.stopPropagation()
            const nextIndex = Number.parseInt(tab.getAttribute('data-level-index') ?? '0', 10)
            nodeContentState.activeVeryCloseLevelByNodeId.set(nodeId, Number.isFinite(nextIndex) ? nextIndex : 0)
            const content = anchor.querySelector('.skill-node-button__content')
            if (!content) {
              return
            }
            content.innerHTML = renderVeryCloseContent({ anchor, label, levels, fallbackNote })
            bindVeryCloseTabs(anchor, label, levels, fallbackNote)
          })
        })
      }

      const applyLabelMode = (mode) => {
        if (mode === currentLabelMode) return
        currentLabelMode = mode
        nodeAnchors.forEach((anchor) => {
          if (anchor.style.display === 'none') return
          if (anchor.classList.contains('html-export__node--minimal')) {
            removeNodeCard(anchor)
            return
          }
          const label = anchor.getAttribute('data-export-label') || ''
          const shortName = anchor.getAttribute('data-short-name') || ''
          const nodeId = anchor.getAttribute('data-node-id') || ''
          const nodeInfo = nodeInfoById.get(nodeId)
          const status = nodeInfo?.status ?? 'later'
          const textColor = STATUS_TEXT_COLORS[status] ?? STATUS_TEXT_COLORS.later
          const fontWeight = status === 'now' ? 900 : 800
          const content = anchor.querySelector('.skill-node-button__content')
          if (!content) return

          const levels = parseExportLevels(anchor.getAttribute('data-export-levels'))
          const fallbackNote = anchor.getAttribute('data-export-note') || ''
          const preferredLevel = getPreferredVeryCloseLevel(levels, fallbackNote)

          if (mode === 'far') {
            content.className = 'skill-node-button__content'
            content.innerHTML = '<p class="skill-node-button__shortname" style="font-size:2rem;font-weight:' + fontWeight + ';line-height:1;letter-spacing:0.08em;color:' + textColor + ';">' + escapeLabelHtml(shortName) + '</p>'
            removeNodeCard(anchor)
          } else if (mode === 'mid') {
            content.className = 'skill-node-button__content skill-node-button__content--labeled'
            content.innerHTML = renderLabeledContent({ label, shortName, textColor, fontWeight, preferredLevel })
            removeNodeCard(anchor)
          } else if (mode === 'close') {
            content.className = 'skill-node-button__content skill-node-button__content--labeled'
            content.innerHTML = renderLabeledContent({ label, shortName, textColor, fontWeight, preferredLevel })
            removeNodeCard(anchor)
            const wrapper = anchor.querySelector('.skill-node-foreign')
            if (wrapper) {
              wrapper.classList.remove('skill-node-foreign--veryclose')
            }
            const btn = anchor.querySelector('.skill-node-button')
            if (btn) {
              btn.style.borderRadius = ''
            }
          } else if (mode === 'very-close') {
            const wrapper = anchor.querySelector('.skill-node-foreign')
            if (wrapper) {
              wrapper.classList.add('skill-node-foreign--veryclose')
            }

            content.className = 'skill-node-button__content skill-node-button__content--veryclose'
            content.innerHTML = renderVeryCloseContent({ anchor, label, levels, fallbackNote })
            bindVeryCloseTabs(anchor, label, levels, fallbackNote)

            const btn = anchor.querySelector('.skill-node-button')
            if (btn) {
              btn.style.borderRadius = '14px'
            }
            removeNodeCard(anchor)
          }
        })

        setTooltipMode(mode)
        refreshPortalElements(mode)
      }

      // -------------------------------------------------------------------

      const panZoomState = {
        scale: 1,
        translateX: 0,
        translateY: 0,
        isDragging: false,
        isPanModeActive: false,
        dragStartX: 0,
        dragStartY: 0,
        dragOriginX: 0,
        dragOriginY: 0,
      }

      const ensureFinitePanZoomState = () => {
        if (!Number.isFinite(panZoomState.scale)) {
          panZoomState.scale = 1
        }

        panZoomState.scale = clamp(panZoomState.scale, VIEWPORT.minScale, VIEWPORT.maxScale)

        if (!Number.isFinite(panZoomState.translateX)) {
          panZoomState.translateX = 0
        }

        if (!Number.isFinite(panZoomState.translateY)) {
          panZoomState.translateY = 0
        }
      }

      const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

      const snapToDevicePixel = (value) => {
        if (!Number.isFinite(value)) {
          return 0
        }

        const ratio = Math.max(1, window.devicePixelRatio || 1)
        return Math.round(value * ratio) / ratio
      }

      const snapScaleToStep = (value, steps = VIEWPORT_ZOOM_STEPS) => {
        if (!Number.isFinite(value)) {
          return steps[0]
        }

        return steps.reduce((closest, step) => (
          Math.abs(step - value) < Math.abs(closest - value) ? step : closest
        ), steps[0])
      }

      const findStepIndex = (value, steps = VIEWPORT_ZOOM_STEPS) => {
        const snapped = snapScaleToStep(value, steps)
        const exactIndex = steps.findIndex((step) => step === snapped)
        return exactIndex >= 0 ? exactIndex : 0
      }

      const getNextZoomStep = (currentScale, direction, steps = VIEWPORT_ZOOM_STEPS) => {
        const clampedCurrent = clamp(currentScale, VIEWPORT.minScale, VIEWPORT.maxScale)
        const currentIndex = findStepIndex(clampedCurrent, steps)

        if (direction > 0) {
          return clamp(steps[Math.min(steps.length - 1, currentIndex + 1)], VIEWPORT.minScale, VIEWPORT.maxScale)
        }

        if (direction < 0) {
          return clamp(steps[Math.max(0, currentIndex - 1)], VIEWPORT.minScale, VIEWPORT.maxScale)
        }

        return clamp(snapScaleToStep(clampedCurrent, steps), VIEWPORT.minScale, VIEWPORT.maxScale)
      }

      const getViewportKeyboardAction = ({
        key,
        ctrlKey = false,
        metaKey = false,
        shiftKey = false,
        spaceKey = false,
        isEditableTarget = false,
      }) => {
        if (isEditableTarget) {
          return null
        }

        if (spaceKey || key === ' ') {
          return 'pan-hold'
        }

        const normalizedKey = String(key ?? '').toLowerCase()
        const hasPrimaryModifier = ctrlKey || metaKey

        if (shiftKey && normalizedKey === 'arrowleft') return 'pan-left'
        if (shiftKey && normalizedKey === 'arrowright') return 'pan-right'
        if (shiftKey && normalizedKey === 'arrowup') return 'pan-up'
        if (shiftKey && normalizedKey === 'arrowdown') return 'pan-down'

        if (!hasPrimaryModifier) {
          return null
        }

        if (normalizedKey === '+' || normalizedKey === '=' || normalizedKey === 'add') {
          return 'zoom-in'
        }

        if (normalizedKey === '-' || normalizedKey === '_' || normalizedKey === 'subtract') {
          return 'zoom-out'
        }

        if (normalizedKey === '0') {
          return 'fit'
        }

        return null
      }

      const getSvgMetrics = () => {
        const viewBox = svgRoot?.viewBox?.baseVal
        const baseWidth = viewBox?.width || Number.parseFloat(svgRoot?.getAttribute('width') ?? '') || treeShell?.clientWidth || 1
        const baseHeight = viewBox?.height || Number.parseFloat(svgRoot?.getAttribute('height') ?? '') || treeShell?.clientHeight || 1

        return { baseWidth, baseHeight }
      }

      const getOccupiedBounds = () => {
        const contentGroup = svgRoot?.querySelector('.skill-tree-canvas__content')
        let contentGroupBounds = null

        if (contentGroup && typeof contentGroup.getBBox === 'function') {
          try {
            const bounds = contentGroup.getBBox()
            if (Number.isFinite(bounds.x) && Number.isFinite(bounds.y) && Number.isFinite(bounds.width) && Number.isFinite(bounds.height)) {
              contentGroupBounds = bounds
            }
          } catch {
            // Fall back to manual bounds collection below.
          }
        }

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

        if (contentGroupBounds) {
          includeRect(
            contentGroupBounds.x,
            contentGroupBounds.y,
            contentGroupBounds.width,
            contentGroupBounds.height,
          )
        }

        nodeAnchors.forEach((anchor) => {
          if (anchor.style.display === 'none') {
            return
          }

          includeRect(
            Number.parseFloat(anchor.getAttribute('x') ?? ''),
            Number.parseFloat(anchor.getAttribute('y') ?? ''),
            Number.parseFloat(anchor.getAttribute('width') ?? ''),
            Number.parseFloat(anchor.getAttribute('height') ?? ''),
          )
        })

        const centerGroups = svgRoot?.querySelectorAll('.skill-tree-center-icon') ?? []
        centerGroups.forEach((centerGroup) => {
          const transform = centerGroup.getAttribute('transform') ?? ''
          const match = transform.match(/translate[(] *([-0-9.]+)(?:[, ]+)([-0-9.]+) *[)]/)
          const centerX = match ? Number.parseFloat(match[1]) : Number.NaN
          const centerY = match ? Number.parseFloat(match[2]) : Number.NaN

          if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) {
            return
          }

          const centerImage = centerGroup.querySelector('.skill-tree-center-icon__image')
          const centerForeign = centerGroup.querySelector('.skill-tree-center-icon__foreign')
          const centerHitArea = centerGroup.querySelector('.skill-tree-center-icon__hit-area')

          if (centerImage) {
            includeRect(
              centerX + Number.parseFloat(centerImage.getAttribute('x') ?? '0'),
              centerY + Number.parseFloat(centerImage.getAttribute('y') ?? '0'),
              Number.parseFloat(centerImage.getAttribute('width') ?? '0'),
              Number.parseFloat(centerImage.getAttribute('height') ?? '0'),
            )
          }

          if (centerForeign) {
            includeRect(
              centerX + Number.parseFloat(centerForeign.getAttribute('x') ?? '0'),
              centerY + Number.parseFloat(centerForeign.getAttribute('y') ?? '0'),
              Number.parseFloat(centerForeign.getAttribute('width') ?? '0'),
              Number.parseFloat(centerForeign.getAttribute('height') ?? '0'),
            )
          }

          if (centerHitArea) {
            const radius = Number.parseFloat(centerHitArea.getAttribute('r') ?? '0')
            includeRect(centerX - radius, centerY - radius, radius * 2, radius * 2)
          }
        })

        if (!Number.isFinite(bounds.minX) || !Number.isFinite(bounds.minY) || !Number.isFinite(bounds.maxX) || !Number.isFinite(bounds.maxY)) {
          const viewBox = svgRoot?.viewBox?.baseVal
          return {
            minX: viewBox?.x ?? 0,
            minY: viewBox?.y ?? 0,
            maxX: (viewBox?.x ?? 0) + (viewBox?.width ?? 0),
            maxY: (viewBox?.y ?? 0) + (viewBox?.height ?? 0),
          }
        }

        return bounds
      }

      const applyPanZoom = () => {
        if (!treeCanvas) {
          return
        }

        ensureFinitePanZoomState()

        const { baseWidth, baseHeight } = getSvgMetrics()
        const scaledWidth = Math.max(1, baseWidth * panZoomState.scale)
        const scaledHeight = Math.max(1, baseHeight * panZoomState.scale)
        const snappedTranslateX = snapToDevicePixel(panZoomState.translateX)
        const snappedTranslateY = snapToDevicePixel(panZoomState.translateY)

        treeCanvas.style.width = String(scaledWidth) + 'px'
        treeCanvas.style.height = String(scaledHeight) + 'px'
        treeCanvas.style.transformOrigin = '0 0'
        treeCanvas.style.transform = 'translate(' + snappedTranslateX + 'px, ' + snappedTranslateY + 'px)'
        treeCanvas.style.visibility = 'visible'

        if (svgRoot) {
          svgRoot.style.width = String(baseWidth * panZoomState.scale) + 'px'
          svgRoot.style.height = String(baseHeight * panZoomState.scale) + 'px'
          svgRoot.style.maxWidth = 'none'
          svgRoot.style.maxHeight = 'none'
        }

        if (zoomSlider) {
          zoomSlider.value = String(Math.round(panZoomState.scale * 100))
        }

        if (zoomValue) {
          zoomValue.textContent = Math.round(panZoomState.scale * 100) + '%'
        }

        if (treeShell) {
          treeShell.style.cursor = panZoomState.isDragging ? 'grabbing' : 'grab'
        }

        if (treeCanvas) {
          treeCanvas.style.cursor = panZoomState.isDragging ? 'grabbing' : 'grab'
        }

        const activeLabelMode = getLabelMode(panZoomState.scale)
        applyLabelMode(activeLabelMode)
        refreshPortalElements(activeLabelMode)
      }

      const zoomToScale = (nextScale, anchorX, anchorY) => {
        if (!treeShell || !treeCanvas) {
          return
        }

        ensureFinitePanZoomState()

        const nextClampedScale = clamp(nextScale, VIEWPORT.minScale, VIEWPORT.maxScale)
        const scaleRatio = nextClampedScale / panZoomState.scale

        panZoomState.translateX = anchorX - (anchorX - panZoomState.translateX) * scaleRatio
        panZoomState.translateY = anchorY - (anchorY - panZoomState.translateY) * scaleRatio
        panZoomState.scale = nextClampedScale
        applyPanZoom()
      }

      const zoomAtPoint = (clientX, clientY, factor) => {
        if (!treeShell || !treeCanvas) {
          return
        }

        const rect = treeShell.getBoundingClientRect()
        const pointX = clientX - rect.left
        const pointY = clientY - rect.top
        zoomToScale(panZoomState.scale * factor, pointX, pointY)
      }

      const zoomByDirection = (direction) => {
        const nextScale = getNextZoomStep(panZoomState.scale, direction)
        const rect = treeShell?.getBoundingClientRect()
        if (!rect) {
          return
        }

        zoomToScale(nextScale, rect.width / 2, rect.height / 2)
      }

      const fitToWidth = () => {
        if (!treeCanvas || !treeShell) {
          return
        }

        const { baseWidth, baseHeight } = getSvgMetrics()
        const viewBox = svgRoot?.viewBox?.baseVal
        const viewBoxX = viewBox?.x ?? 0
        const viewBoxY = viewBox?.y ?? 0
        const shellWidth = treeShell.clientWidth || baseWidth
        const shellHeight = treeShell.clientHeight || baseHeight
        const occupied = getOccupiedBounds()
        const padding = VIEWPORT.fitPadding
        const contentBounds = {
          x: occupied.minX - viewBoxX,
          y: occupied.minY - viewBoxY,
          width: Math.max(1, occupied.maxX - occupied.minX),
          height: Math.max(1, occupied.maxY - occupied.minY),
        }
        const fittedScale = clamp(
          Math.min(shellWidth / (contentBounds.width + padding * 2), shellHeight / (contentBounds.height + padding * 2)),
          VIEWPORT.minScale,
          VIEWPORT.maxScale,
        )

        if (!Number.isFinite(fittedScale)) {
          panZoomState.scale = 1
          panZoomState.translateX = 0
          panZoomState.translateY = 0
          applyPanZoom()
          return
        }

        const centerX = contentBounds.x + contentBounds.width / 2
        const centerY = contentBounds.y + contentBounds.height / 2

        panZoomState.scale = fittedScale
        panZoomState.translateX = shellWidth / 2 - centerX * fittedScale
        panZoomState.translateY = shellHeight / 2 - centerY * fittedScale
        applyPanZoom()
      }

      const focusNodeInViewport = (nodeId, options = {}) => {
        const anchor = nodeAnchorById.get(nodeId)
        if (!anchor || !treeShell) {
          return
        }

        ensureFinitePanZoomState()

        const { scale } = options
        const activeScale = Number.isFinite(scale)
          ? clamp(scale, VIEWPORT.minScale, VIEWPORT.maxScale)
          : panZoomState.scale
        const nodeX = Number.parseFloat(anchor.dataset.origX ?? anchor.getAttribute('x') ?? '0')
        const nodeY = Number.parseFloat(anchor.dataset.origY ?? anchor.getAttribute('y') ?? '0')
        const nodeWidth = Number.parseFloat(anchor.dataset.origWidth ?? anchor.getAttribute('width') ?? '0')
        const nodeHeight = Number.parseFloat(anchor.dataset.origHeight ?? anchor.getAttribute('height') ?? '0')
        const centerX = nodeX + nodeWidth / 2
        const centerY = nodeY + nodeHeight / 2

        panZoomState.scale = activeScale
        panZoomState.translateX = treeShell.clientWidth / 2 - centerX * activeScale
        panZoomState.translateY = treeShell.clientHeight / 2 - centerY * activeScale
        applyPanZoom()
      }

      const getVisibleViewportBounds = () => {
        const { baseWidth, baseHeight } = getSvgMetrics()
        const shellWidth = treeShell?.clientWidth || baseWidth
        const shellHeight = treeShell?.clientHeight || baseHeight
        const scale = Number.isFinite(panZoomState.scale) && panZoomState.scale > 0 ? panZoomState.scale : 1
        const translateX = Number.isFinite(panZoomState.translateX) ? panZoomState.translateX : 0
        const translateY = Number.isFinite(panZoomState.translateY) ? panZoomState.translateY : 0

        return {
          x: -translateX / scale,
          y: -translateY / scale,
          width: shellWidth / scale,
          height: shellHeight / scale,
          shellWidth,
          shellHeight,
        }
      }

      const syncFullscreenButton = () => {
        if (!fullscreenButton) {
          return
        }

        const isNativeFullscreen = document.fullscreenElement === roadmapPanel
        const isFallbackFullscreen = roadmapPanel?.classList.contains('html-export__panel--fullscreen')
        const isFullscreenActive = isNativeFullscreen || isFallbackFullscreen

        fullscreenButton.setAttribute('aria-label', isFullscreenActive ? 'Exit fullscreen roadmap' : 'Open fullscreen roadmap')
        fullscreenButton.setAttribute('title', isFullscreenActive ? 'Exit fullscreen' : 'Open fullscreen')
        fullscreenButton.setAttribute('aria-pressed', String(isFullscreenActive))
      }

      const exitFallbackFullscreen = () => {
        roadmapPanel?.classList.remove('html-export__panel--fullscreen')
        document.body.classList.remove('html-export--fullscreen-fallback')
        syncFullscreenButton()
        window.requestAnimationFrame(() => {
          fitToWidth()
        })
      }

      const enterFallbackFullscreen = () => {
        roadmapPanel?.classList.add('html-export__panel--fullscreen')
        document.body.classList.add('html-export--fullscreen-fallback')
        syncFullscreenButton()
        window.requestAnimationFrame(() => {
          fitToWidth()
        })
      }

      const toggleFullscreen = async () => {
        if (!roadmapPanel) {
          return
        }

        if (document.fullscreenElement === roadmapPanel) {
          try {
            if (typeof document.exitFullscreen === 'function') {
              await document.exitFullscreen()
            }
          } catch {
            // Keep the viewer usable even if fullscreen exit is blocked.
          }
          syncFullscreenButton()
          window.requestAnimationFrame(() => {
            fitToWidth()
          })
          return
        }

        if (roadmapPanel.classList.contains('html-export__panel--fullscreen')) {
          exitFallbackFullscreen()
          return
        }

        if (typeof roadmapPanel.requestFullscreen === 'function') {
          try {
            await roadmapPanel.requestFullscreen()
            syncFullscreenButton()
            window.requestAnimationFrame(() => {
              fitToWidth()
            })
            return
          } catch {
            // Fall back to CSS fullscreen when the browser API is unavailable.
          }
        }

        enterFallbackFullscreen()
      }

      syncFullscreenButton()

      const beginDrag = (event) => {
        if (!treeShell || !treeCanvas || event.button !== 0) {
          return
        }

        panZoomState.isDragging = true
        panZoomState.dragStartX = event.clientX
        panZoomState.dragStartY = event.clientY
        panZoomState.dragOriginX = panZoomState.translateX
        panZoomState.dragOriginY = panZoomState.translateY
        treeShell.setAttribute('data-dragging', 'true')
        treeShell.style.cursor = 'grabbing'
      }

      const moveDrag = (event) => {
        if (!panZoomState.isDragging) {
          return
        }

        const deltaX = event.clientX - panZoomState.dragStartX
        const deltaY = event.clientY - panZoomState.dragStartY
        panZoomState.translateX = panZoomState.dragOriginX + deltaX
        panZoomState.translateY = panZoomState.dragOriginY + deltaY
        applyPanZoom()
      }

      const endDrag = () => {
        if (!panZoomState.isDragging) {
          return
        }

        panZoomState.isDragging = false
        if (treeShell) {
          treeShell.removeAttribute('data-dragging')
          treeShell.style.cursor = 'grab'
        }
      }

      const isEditableTarget = (target) => {
        if (!target || typeof target.matches !== 'function') {
          return false
        }

        return target.matches('input, textarea, select, [contenteditable="true"]')
      }

      if (treeShell && treeCanvas) {
        treeCanvas.style.touchAction = 'none'
        treeCanvas.style.cursor = 'grab'
        treeShell.style.cursor = 'grab'
        treeCanvas.style.visibility = 'hidden'
        treeShell.addEventListener('pointerdown', beginDrag)
        treeShell.addEventListener('click', (event) => {
          if (event.target === treeShell || event.target === treeCanvas || event.target === svgRoot) {
            clearReadonlySelection()
          }
        })
        window.addEventListener('pointermove', moveDrag)
        window.addEventListener('pointerup', endDrag)
        window.addEventListener('pointercancel', endDrag)
        let lastRightClick = 0

        treeShell.addEventListener('wheel', (event) => {
          event.preventDefault()
          const adaptiveStep = 0.0018 * Math.sqrt(panZoomState.scale)
          const delta = Math.min(Math.abs(event.deltaY), 200)
          const direction = event.deltaY < 0 ? 1 : -1
          const ratio = Math.exp(adaptiveStep * delta * direction)
          const rect = treeShell.getBoundingClientRect()
          const pointX = event.clientX - rect.left
          const pointY = event.clientY - rect.top
          zoomToScale(panZoomState.scale * ratio, pointX, pointY)
        }, { passive: false })

        treeShell.addEventListener('contextmenu', (event) => {
          event.preventDefault()
          const now = Date.now()
          if (isDoubleActivation(lastRightClick, now)) {
            fitToWidth()
            lastRightClick = 0
          } else {
            lastRightClick = now
          }
        })

        window.addEventListener('keydown', (event) => {
          if (event.key === 'Escape' && roadmapPanel?.classList.contains('html-export__panel--fullscreen')) {
            event.preventDefault()
            exitFallbackFullscreen()
            return
          }

          const editableTarget = isEditableTarget(event.target)
          const action = getViewportKeyboardAction({
            key: event.key,
            ctrlKey: event.ctrlKey,
            metaKey: event.metaKey,
            shiftKey: event.shiftKey,
            isEditableTarget: editableTarget,
          })

          if (!action) {
            const hasSelectionModifiers = event.ctrlKey || event.metaKey || event.shiftKey || event.altKey
            if (!editableTarget && !hasSelectionModifiers && (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
              event.preventDefault()
              if (event.key === 'ArrowLeft') panZoomState.translateX -= 48
              if (event.key === 'ArrowRight') panZoomState.translateX += 48
              if (event.key === 'ArrowUp') panZoomState.translateY -= 48
              if (event.key === 'ArrowDown') panZoomState.translateY += 48
              applyPanZoom()
            }
            return
          }

          event.preventDefault()

          if (action === 'pan-hold') {
            panZoomState.isPanModeActive = true
            return
          }

          if (action === 'zoom-in') {
            zoomByDirection(1)
            return
          }

          if (action === 'zoom-out') {
            zoomByDirection(-1)
            return
          }

          if (action === 'fit') {
            fitToWidth()
            return
          }

          if (action === 'pan-left') {
            panZoomState.translateX -= 48
            applyPanZoom()
            return
          }

          if (action === 'pan-right') {
            panZoomState.translateX += 48
            applyPanZoom()
            return
          }

          if (action === 'pan-up') {
            panZoomState.translateY -= 48
            applyPanZoom()
            return
          }

          if (action === 'pan-down') {
            panZoomState.translateY += 48
            applyPanZoom()
            return
          }
        })

        window.addEventListener('keyup', (event) => {
          if (event.key === ' ') {
            panZoomState.isPanModeActive = false
          }
        })

        menuDetails.forEach((menu) => {
          menu.addEventListener('toggle', () => {
            if (menu.open) {
              closeMenus(menu)
              return
            }

            syncMenuButtonState()
          })
        })

        document.addEventListener('pointerdown', (event) => {
          if (event.target && typeof event.target.closest === 'function' && event.target.closest('.html-export__menu')) {
            return
          }

          closeMenus()
        })

        treeShell?.addEventListener('pointerenter', () => {
          closeMenus()
        })

        pmExportContainer?.addEventListener('pointerenter', () => {
          closeMenus()
        })

        window.addEventListener('keydown', (event) => {
          if (event.key === 'Escape') {
            closeMenus()
          }
        })

        syncMenuButtonState()

        zoomOutButton?.addEventListener('click', () => zoomByDirection(-1))
        zoomInButton?.addEventListener('click', () => zoomByDirection(1))
        fitButton?.addEventListener('click', () => fitToWidth())
        fullscreenButton?.addEventListener('click', () => {
          void toggleFullscreen()
        })

        document.addEventListener('fullscreenchange', () => {
          syncFullscreenButton()
          if (document.fullscreenElement === roadmapPanel || !document.fullscreenElement) {
            window.requestAnimationFrame(() => {
              fitToWidth()
            })
          }
        })

        zoomSlider?.addEventListener('input', (event) => {
          const nextValue = Number.parseFloat(event.currentTarget.value) / 100
          zoomToScale(snapScaleToStep(nextValue, VIEWPORT_ZOOM_STEPS), treeShell.clientWidth / 2, treeShell.clientHeight / 2)
        })

        zoomSlider?.addEventListener('change', (event) => {
          const nextValue = Number.parseFloat(event.currentTarget.value) / 100
          zoomToScale(snapScaleToStep(nextValue, VIEWPORT_ZOOM_STEPS), treeShell.clientWidth / 2, treeShell.clientHeight / 2)
        })

        window.addEventListener('resize', () => {
          if (panZoomState.scale <= 1.6) {
            fitToWidth()
          }
        })

        const fitWhenReady = () => {
          const shellRect = treeShell.getBoundingClientRect()
          if (shellRect.width <= 0 || shellRect.height <= 0) {
            window.requestAnimationFrame(fitWhenReady)
            return
          }

          fitToWidth()
        }

        const scheduleInitialFit = () => {
          const delays = [0, 64, 180, 420]
          delays.forEach((delay) => {
            window.setTimeout(() => {
              fitWhenReady()
            }, delay)
          })
        }

        if (typeof window.ResizeObserver === 'function') {
          const resizeObserver = new window.ResizeObserver(() => {
            if (panZoomState.scale <= 1.6) {
              fitToWidth()
            }
          })
          resizeObserver.observe(treeShell)
        }

        window.requestAnimationFrame(fitWhenReady)
        window.addEventListener('load', scheduleInitialFit, { once: true })
        scheduleInitialFit()
      }

      const setNodeMode = (anchor, mode) => {
        if (!anchor) {
          return
        }

        const originalX = Number.parseFloat(anchor.dataset.origX ?? anchor.getAttribute('x') ?? '0')
        const originalY = Number.parseFloat(anchor.dataset.origY ?? anchor.getAttribute('y') ?? '0')
        const originalWidth = Number.parseFloat(anchor.dataset.origWidth ?? anchor.getAttribute('width') ?? '0')
        const originalHeight = Number.parseFloat(anchor.dataset.origHeight ?? anchor.getAttribute('height') ?? '0')
        const button = anchor.querySelector('.skill-node-button')
        const wrapper = anchor.querySelector('.skill-node-foreign')
        const originalButtonWidth = Number.parseFloat(anchor.dataset.origButtonWidth ?? button?.style.width ?? button?.getAttribute('width') ?? '0')
        const originalButtonHeight = Number.parseFloat(anchor.dataset.origButtonHeight ?? button?.style.height ?? button?.getAttribute('height') ?? '0')
        const originalPadding = Number.parseFloat(anchor.dataset.origPadding ?? wrapper?.style.padding ?? '0')

        if (!anchor.dataset.origX) {
          anchor.dataset.origX = String(originalX)
          anchor.dataset.origY = String(originalY)
          anchor.dataset.origWidth = String(originalWidth)
          anchor.dataset.origHeight = String(originalHeight)
        }

        if (!anchor.dataset.origButtonWidth) {
          anchor.dataset.origButtonWidth = String(originalButtonWidth)
          anchor.dataset.origButtonHeight = String(originalButtonHeight)
        }

        if (!anchor.dataset.origPadding) {
          anchor.dataset.origPadding = String(originalPadding)
        }

        const applyInnerSize = (buttonWidth, buttonHeight, padding) => {
          if (button) {
            button.style.width = String(buttonWidth) + 'px'
            button.style.height = String(buttonHeight) + 'px'
          }

          if (wrapper) {
            wrapper.style.padding = String(padding) + 'px'
          }
        }

        anchor.style.display = ''
        anchor.setAttribute('x', String(originalX))
        anchor.setAttribute('y', String(originalY))
        anchor.setAttribute('width', String(originalWidth))
        anchor.setAttribute('height', String(originalHeight))
        applyInnerSize(originalButtonWidth, originalButtonHeight, originalPadding)
        anchor.classList.remove('html-export__node--minimal')

        if (mode === 'hidden') {
          anchor.style.display = 'none'
          return
        }

        if (mode === 'minimal') {
          const centerX = originalX + originalWidth / 2
          const centerY = originalY + originalHeight / 2
          const buttonWidth = Math.max(30, originalButtonWidth * MINIMAL_NODE_SCALE)
          const buttonHeight = Math.max(30, originalButtonHeight * MINIMAL_NODE_SCALE)
          const padding = Math.max(4, originalPadding * MINIMAL_NODE_SCALE)
          const width = buttonWidth + padding * 2
          const height = buttonHeight + padding * 2

          anchor.setAttribute('x', String(centerX - width / 2))
          anchor.setAttribute('y', String(centerY - height / 2))
          anchor.setAttribute('width', String(width))
          anchor.setAttribute('height', String(height))
          applyInnerSize(buttonWidth, buttonHeight, padding)
          anchor.classList.add('html-export__node--minimal')
        }
      }

      const applyTreeFilters = () => {
        const selectedScopeIds = getSelectedScopeIds()
        const selectedReleaseFilter = releaseFilterSelect?.value || RELEASE_FILTER.all
        const visibleNodeIds = new Set()
        const visibleSegmentIds = new Set()

        nodeAnchors.forEach((anchor) => {
          const nodeId = anchor.dataset.nodeId
          const nodeInfo = nodeInfoById.get(nodeId)

          if (!nodeInfo) {
            setNodeMode(anchor, 'full')
            visibleNodeIds.add(nodeId)
            return
          }

          const scopeVisible = selectedScopeIds.length === 0
            || (Array.isArray(nodeInfo.levelScopeIds) && nodeInfo.levelScopeIds.length === 0)
            || (Array.isArray(nodeInfo.levelScopeIds)
              ? nodeInfo.levelScopeIds.some((scopeIds) => scopeIdsMatchFilter(scopeIds, selectedScopeIds))
              : scopeIdsMatchFilter(Array.from(nodeInfo.scopeIds ?? []), selectedScopeIds))

          if (!scopeVisible) {
            setNodeMode(anchor, 'hidden')
            return
          }

          const visibilityMode = getReleaseVisibilityMode(nodeInfo.status, selectedReleaseFilter)
          setNodeMode(anchor, visibilityMode)

          if (visibilityMode !== 'hidden') {
            visibleNodeIds.add(nodeId)
            if (nodeInfo.segmentId) {
              visibleSegmentIds.add(nodeInfo.segmentId)
            }
          }
        })

        linkElements.forEach((link) => {
          const sourceId = link.getAttribute('data-link-source-id')
          const targetId = link.getAttribute('data-link-target-id')
          const isVisible = (!sourceId || visibleNodeIds.has(sourceId)) && (!targetId || visibleNodeIds.has(targetId))
          link.style.display = isVisible ? '' : 'none'
        })

        portalElements.forEach((portal) => {
          const nodeId = portal.getAttribute('data-portal-node-id')
          const sourceId = portal.getAttribute('data-portal-source-id')
          const targetId = portal.getAttribute('data-portal-target-id')
          const isVisible = visibleNodeIds.has(nodeId) && visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId)
          portal.style.display = isVisible ? '' : 'none'
        })

        segmentLabels.forEach((label) => {
          const segmentId = label.getAttribute('data-segment-id')
          const isVisible = !segmentId || visibleSegmentIds.has(segmentId)
          label.style.display = isVisible ? '' : 'none'
        })

        segmentSeparators.forEach((separator) => {
          const leftSegmentId = separator.getAttribute('data-segment-left')
          const rightSegmentId = separator.getAttribute('data-segment-right')
          const isVisible = (!leftSegmentId || visibleSegmentIds.has(leftSegmentId))
            && (!rightSegmentId || visibleSegmentIds.has(rightSegmentId))
          separator.style.display = isVisible ? '' : 'none'
        })

        tooltipNodeElements.forEach((tooltipNode) => {
          const nodeId = tooltipNode.getAttribute('data-tooltip-node-id')
          const isVisible = !!nodeId && visibleNodeIds.has(nodeId)
          tooltipNode.style.display = isVisible ? '' : 'none'
        })

        const activeLabelMode = currentLabelMode ?? getLabelMode(panZoomState.scale)
        setTooltipMode(activeLabelMode)
        refreshPortalElements(activeLabelMode)
        syncReadonlySelection()
      }

      let hoveredPortalElement = null

      const syncReadonlySelection = () => {
        nodeAnchors.forEach((anchor) => {
          const isSelected = !!readonlySelectionState.nodeId && anchor.getAttribute('data-node-id') === readonlySelectionState.nodeId
          anchor.classList.toggle('html-export__node--selected', isSelected)
          anchor.setAttribute('data-selected', isSelected ? 'true' : 'false')
        })

        segmentLabels.forEach((label) => {
          const segmentId = label.getAttribute('data-segment-id')
          const isSelected = !!segmentId && segmentId === readonlySelectionState.segmentId
          const text = label.querySelector('.skill-tree-segment-label') || label.querySelector('text')
          text?.classList.toggle('html-export__segment-label--selected', isSelected)
          if (text?.classList.contains('skill-tree-segment-label')) {
            text.classList.toggle('skill-tree-segment-label--selected', isSelected)
          }
        })

        portalElements.forEach((portalElement) => {
          const portalKey = String(portalElement.getAttribute('data-portal-key') ?? '')
          portalElement.classList.toggle('skill-tree-portal--selected', !!portalKey && portalKey === readonlySelectionState.portalKey)
        })
      }

      const clearReadonlySelection = () => {
        readonlySelectionState.nodeId = null
        readonlySelectionState.segmentId = null
        readonlySelectionState.portalKey = null
        syncReadonlySelection()
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
          hoveredPortalElement = portalElement
          setPortalPeerHighlight(portalElement)
        })

        portalElement.addEventListener('pointerleave', () => {
          if (hoveredPortalElement === portalElement) {
            hoveredPortalElement = null
          }
          clearPortalPeerHighlight()
        })
      })

      nodeAnchors.forEach((anchor) => {
        anchor.addEventListener('pointerdown', (event) => {
          event.stopPropagation()
        })

        anchor.addEventListener('click', (event) => {
          event.stopPropagation()
          const nodeId = anchor.getAttribute('data-node-id')
          readonlySelectionState.nodeId = nodeId || null
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
          const segmentId = label.getAttribute('data-segment-id')
          readonlySelectionState.segmentId = segmentId || null
          readonlySelectionState.nodeId = null
          readonlySelectionState.portalKey = null
          syncReadonlySelection()
        })
      })

      const centerGroups = svgRoot?.querySelectorAll('.skill-tree-center-icon') ?? []
      centerGroups.forEach((centerGroup) => {
        centerGroup.addEventListener('pointerdown', (event) => {
          event.stopPropagation()
        })
      })

      syncReadonlySelection()

      if (scopeFilterSelect) {
        const existingValues = new Set(Array.from(scopeFilterSelect.options).map((option) => option.value))
        allScopeIds.forEach((scopeId) => {
          if (existingValues.has(scopeId)) {
            return
          }

          const option = document.createElement('option')
          option.value = scopeId
          option.textContent = scopeId
          scopeFilterSelect.appendChild(option)
        })
      }

      const getExportBackgroundColor = () => {
        const element = treeShell ?? document.body

        if (!element || typeof window.getComputedStyle !== 'function') {
          return null
        }

        const backgroundColor = window.getComputedStyle(element).backgroundColor
        if (!backgroundColor || backgroundColor === 'transparent' || backgroundColor === 'rgba(0, 0, 0, 0)') {
          return null
        }

        return backgroundColor
      }

      const collectStandaloneSvgStyles = () => Array.from(document.querySelectorAll('style'))
        .map((styleElement) => String(styleElement.textContent ?? '').trim())
        .filter(Boolean)
        .join('\n')

      const injectStandaloneSvgStyles = (svgElement) => {
        if (!svgElement || svgElement.querySelector('.skill-tree-interactive-runtime-style')) {
          return
        }

        const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
        style.setAttribute('class', 'skill-tree-interactive-runtime-style')
        style.textContent = collectStandaloneSvgStyles() + '\n' + INTERACTIVE_SVG_RUNTIME_STYLE_TEXT
        svgElement.insertBefore(style, svgElement.firstChild)
      }

      const injectInteractiveSvgRuntime = (svgElement) => {
        if (!svgElement || svgElement.querySelector('.skill-tree-interactive-runtime-script')) {
          return
        }

        const script = document.createElementNS('http://www.w3.org/2000/svg', 'script')
        script.setAttribute('class', 'skill-tree-interactive-runtime-script')
        script.setAttribute('type', 'application/ecmascript')
        script.textContent = INTERACTIVE_SVG_RUNTIME_SCRIPT
        svgElement.appendChild(script)
      }

      const prepareSvgCloneForExport = (sourceSvg, { clean = false, interactive = false } = {}) => {
        if (!sourceSvg) {
          return null
        }

        const clone = sourceSvg.cloneNode(true)
        const visibleBounds = getVisibleViewportBounds()
        clone.setAttribute('viewBox', String(visibleBounds.x) + ' ' + String(visibleBounds.y) + ' ' + String(visibleBounds.width) + ' ' + String(visibleBounds.height))
        clone.setAttribute('width', String(visibleBounds.shellWidth))
        clone.setAttribute('height', String(visibleBounds.shellHeight))
        clone.style.transform = ''
        clone.style.transformOrigin = ''
        clone.style.cursor = ''
        clone.style.touchAction = ''

        if (clean) {
          clone.querySelectorAll('.skill-node-tooltip-layer').forEach((node) => node.remove())
          clone.querySelectorAll('style').forEach((style) => {
            if (style.textContent && style.textContent.includes('.skill-node-tooltip-trigger')) {
              style.remove()
            }
          })
        }

        injectStandaloneSvgStyles(clone)
        if (interactive && !clean) {
          injectInteractiveSvgRuntime(clone)
        }

        return { clone, visibleBounds }
      }

      const downloadBlob = (blob, fileName) => {
        const objectUrl = URL.createObjectURL(blob)
        const anchor = document.createElement('a')

        anchor.href = objectUrl
        anchor.download = fileName
        anchor.style.display = 'none'

        document.body.appendChild(anchor)
        anchor.click()
        document.body.removeChild(anchor)
        URL.revokeObjectURL(objectUrl)
      }

      const downloadSvg = (sourceSvg, fileName, { clean = false } = {}) => {
        const prepared = prepareSvgCloneForExport(sourceSvg, { clean, interactive: !clean })
        if (!prepared) {
          return
        }

        const { clone } = prepared
        const svgMarkup = '<?xml version="1.0" encoding="UTF-8"?>\\n' + clone.outerHTML
        const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' })
        const objectUrl = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = objectUrl
        anchor.download = fileName
        anchor.style.display = 'none'
        document.body.appendChild(anchor)
        anchor.click()
        document.body.removeChild(anchor)
        URL.revokeObjectURL(objectUrl)
      }

      const downloadPng = async (sourceSvg, fileName) => {
        const prepared = prepareSvgCloneForExport(sourceSvg)
        if (!prepared || !window.htmlToImage?.toBlob) {
          return
        }

        const { clone } = prepared
        const tempContainer = document.createElement('div')
        tempContainer.style.position = 'fixed'
        tempContainer.style.left = '-100000px'
        tempContainer.style.top = '-100000px'
        tempContainer.style.width = '0'
        tempContainer.style.height = '0'
        tempContainer.style.overflow = 'hidden'
        tempContainer.style.pointerEvents = 'none'
        tempContainer.appendChild(clone)
        document.body.appendChild(tempContainer)

        try {
          if (document.fonts?.ready) {
            await document.fonts.ready
          }

          const backgroundColor = getExportBackgroundColor()
          const pngBlob = await window.htmlToImage.toBlob(clone, {
            cacheBust: true,
            skipFonts: true,
            skipAutoScale: true,
            backgroundColor: backgroundColor ?? undefined,
          })

          if (!pngBlob) {
            return
          }

          downloadBlob(pngBlob, fileName)
        } finally {
          tempContainer.remove()
        }
      }

      const buildViewerExportFileName = (extension, suffix = '') => {
        const padPart = (value) => String(value ?? '').padStart(2, '0')
        const normalizedSuffix = String(suffix ?? '')
          .trim()
          .replace(/[^a-zA-Z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
        const now = new Date()
        const datePart = [
          now.getFullYear(),
          padPart(now.getMonth() + 1),
          padPart(now.getDate()),
        ].join('-')
        const timePart = [
          padPart(now.getHours()),
          padPart(now.getMinutes()),
        ].join('-')
        const normalizedExtension = String(extension ?? '')
          .trim()
          .replace(/^[.]+/, '')
          .toLowerCase() || 'txt'

        return ${JSON.stringify(exportBaseName)} + '_' + datePart + '_' + timePart + (normalizedSuffix ? '_' + normalizedSuffix : '') + '.' + normalizedExtension
      }

      printButton?.addEventListener('click', () => {
        closeMenus()
        window.print()
      })

      pngButton?.addEventListener('click', () => {
        closeMenus()
        void downloadPng(svgRoot, buildViewerExportFileName('png'))
      })

      svgButton?.addEventListener('click', () => {
        closeMenus()
        downloadSvg(svgRoot, buildViewerExportFileName('svg'))
      })

      cleanSvgButton?.addEventListener('click', () => {
        closeMenus()
        downloadSvg(svgRoot, buildViewerExportFileName('svg', 'clean'), { clean: true })
      })

      scopeFilterSelect?.addEventListener('change', applyTreeFilters)
      releaseFilterSelect?.addEventListener('change', applyTreeFilters)

      applyTreeFilters()
    })()
  `

export const buildHtmlExportDocument = ({
  svgMarkup,
  roadmapDocument,
  styleText,
  selectedReleaseIds = null,
  selectedReleaseId = null,
  selectedReleaseNoteStatuses = null,
  statusSummarySortMode = 'manual',
  includePriorityMatrix = true,
}) => {
  const resolvedReleaseIds = getResolvedReleaseIds(roadmapDocument, selectedReleaseIds)
  const releaseFilteredDocument = filterDocumentByReleaseIds(roadmapDocument, resolvedReleaseIds)
  const releases = Array.isArray(releaseFilteredDocument?.releases) ? releaseFilteredDocument.releases : []
  const primaryRelease = releases[0] ?? null
  const exportDate = new Date().toLocaleDateString()
  const systemName = String(releaseFilteredDocument?.systemName ?? '').trim() || 'Roadmap'
  const releaseData = primaryRelease ?? releaseFilteredDocument?.release ?? {}
  const singleReleaseTitle = String(releaseData?.name ?? '').trim()
  const releaseTitle = releases.length > 1
    ? `${releases.length} Releases`
    : singleReleaseTitle
  const releaseMotto = String(releaseData?.motto ?? '').trim()
  const releaseDate = String(releaseData?.date ?? '').trim()
  const pageTitle = [systemName, releaseTitle].filter(Boolean).join(' · ') || systemName
  const subtitleBits = [releaseMotto, `Exportiert am ${exportDate}`]
  const exportBaseName = sanitizeFileNamePart(releaseFilteredDocument?.systemName)

  if (releaseDate) {
    subtitleBits.push(`Release Date: ${formatDisplayDate(releaseDate)}`)
  }
  const canonicalDoc = canonicalizeDocumentForExport(releaseFilteredDocument)
  const canonicalPayloadJson = escapeJsonForScriptTag(JSON.stringify(buildPersistedDocumentPayload(canonicalDoc), null, 2))

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(pageTitle)}</title>
  <style>
    ${styleText}

    :root {
      color-scheme: dark;
      --export-surface: rgba(15, 23, 42, 0.88);
      --export-border: rgba(71, 85, 105, 0.55);
      --export-text: #e2e8f0;
      --export-muted: #94a3b8;
      --export-accent: #67e8f9;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      color: var(--export-text);
      background: #000000;
    }

    body.html-export--fullscreen-fallback {
      overflow: hidden;
    }

    .html-export {
      max-width: 1440px;
      margin: 0 auto;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 18px;
      min-height: 100vh;
    }

    .html-export__header,
    .html-export__panel {
      background: var(--export-surface);
      border: 1px solid var(--export-border);
      border-radius: 20px;
      backdrop-filter: blur(12px);
    }

    .html-export__header {
      position: relative;
      z-index: 30;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      padding: 22px 24px;
    }

    .html-export__title {
      margin: 0;
      font-size: clamp(1.8rem, 2vw, 2.6rem);
      line-height: 1.05;
    }

    .html-export__subtitle {
      margin: 6px 0 0;
      color: var(--export-muted);
      font-size: 0.95rem;
    }

    .html-export__brand {
      display: inline-flex;
      margin-top: 10px;
      padding: 6px 10px;
      border-radius: 999px;
      border: 1px solid rgba(103, 232, 249, 0.35);
      color: #cffafe;
      font-size: 0.78rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .html-export__actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: flex-end;
      position: relative;
      z-index: 40;
    }

    .html-export__menu {
      position: relative;
    }

    .html-export__menu > summary {
      list-style: none;
    }

    .html-export__menu > summary::-webkit-details-marker {
      display: none;
    }

    .html-export__menu-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      min-width: 44px;
      min-height: 44px;
      padding: 0 14px;
      border-radius: 999px;
      border: 1px solid rgba(103, 232, 249, 0.22);
      background: rgba(8, 47, 73, 0.35);
      color: #ecfeff;
      cursor: pointer;
    }

    .html-export__menu-button:hover {
      border-color: rgba(103, 232, 249, 0.4);
      background: rgba(8, 47, 73, 0.52);
    }

    .html-export__menu-icon {
      width: 16px;
      height: 16px;
      display: inline-flex;
    }

    .html-export__menu-panel {
      position: absolute;
      right: 0;
      top: calc(100% + 8px);
      z-index: 80;
      min-width: 240px;
      padding: 10px;
      border-radius: 16px;
      border: 1px solid rgba(71, 85, 105, 0.55);
      background: rgba(2, 6, 23, 0.98);
      box-shadow: 0 18px 36px rgba(2, 6, 23, 0.35);
    }

    .html-export__menu-panel--zoom {
      min-width: 330px;
    }

    .html-export__menu-panel--filters {
      min-width: 280px;
    }

    .html-export__menu-actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .html-export__zoom-controls {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .html-export__zoom-slider {
      flex: 1 1 auto;
      min-width: 160px;
      accent-color: #67e8f9;
    }

    .html-export__zoom-value {
      min-width: 52px;
      color: #e2e8f0;
      text-align: right;
      font-variant-numeric: tabular-nums;
    }

    .html-export__menu-action {
      width: 100%;
      border: 1px solid rgba(103, 232, 249, 0.16);
      border-radius: 12px;
      padding: 10px 12px;
      background: rgba(8, 47, 73, 0.35);
      color: #ecfeff;
      text-align: left;
      cursor: pointer;
    }

    .html-export__menu-action--icon {
      width: 40px;
      min-width: 40px;
      padding-inline: 0;
      text-align: center;
    }

    .html-export__action--fit,
    .html-export__action--fullscreen {
      align-self: center;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 44px;
      min-height: 44px;
      padding: 0;
    }

    .html-export__action-icon {
      width: 16px;
      height: 16px;
      display: inline-flex;
    }

    .html-export__menu-action:hover {
      background: rgba(8, 47, 73, 0.55);
    }

    .html-export__menu-filter {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 10px;
    }

    .html-export__menu-filter label {
      display: flex;
      flex-direction: column;
      gap: 5px;
      color: #cbd5e1;
      font-size: 0.82rem;
    }

    .html-export__menu-filter select {
      appearance: none;
      border: 1px solid rgba(103, 232, 249, 0.25);
      border-radius: 10px;
      padding: 7px 10px;
      background: rgba(8, 47, 73, 0.35);
      color: #ecfeff;
      font-size: 0.88rem;
    }

    .html-export__menu-filter select[multiple] {
      min-height: 116px;
      padding-block: 6px;
    }

    .html-export__menu-filter-hint {
      color: #94a3b8;
      font-size: 0.72rem;
    }

    .html-export__action,
    .html-export__tab {
      appearance: none;
      border: 1px solid rgba(103, 232, 249, 0.22);
      background: rgba(8, 47, 73, 0.35);
      color: #ecfeff;
      padding: 10px 14px;
      border-radius: 999px;
      cursor: pointer;
      font-size: 0.95rem;
    }

    .html-export__panel {
      position: relative;
      z-index: 1;
      padding: 18px;
    }

    .html-export__status-summary {
      display: grid;
      gap: 12px;
    }

    .html-export__status-group {
      border: 1px solid rgba(71, 85, 105, 0.45);
      border-radius: 14px;
      padding: 12px;
      background: rgba(8, 47, 73, 0.22);
    }

    .html-export__status-group-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 10px;
      color: #f8fafc;
    }

    .html-export__status-items {
      display: grid;
      gap: 8px;
    }

    .html-export__status-item {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border-radius: 10px;
      background: rgba(2, 6, 23, 0.75);
      border: 1px solid rgba(71, 85, 105, 0.4);
    }

    .html-export__status-rank {
      display: inline-flex;
      width: 24px;
      height: 24px;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      background: rgba(103, 232, 249, 0.18);
      color: #a5f3fc;
      font-size: 0.78rem;
      font-weight: 700;
    }

    .html-export__status-copy {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .html-export__always-on-top {
      z-index:120;
    }

    .html-export__panel--roadmap {
      display: flex;
      flex-direction: column;
      min-height: 0;
    }

    .html-export__panel--roadmap:fullscreen,
    .html-export__panel--roadmap.html-export__panel--fullscreen {
      width: 100vw;
      height: 100vh;
      max-width: 100vw;
      min-height: 100vh;
      margin: 0;
      padding: 16px;
      border-radius: 0;
      background: #000000;
    }

    .html-export__panel--roadmap:fullscreen .html-export__section-header,
    .html-export__panel--roadmap.html-export__panel--fullscreen .html-export__section-header {
      position: relative;
      z-index: 2;
      margin-bottom: 10px;
    }

    .html-export__panel--roadmap:fullscreen .html-export__tree-shell,
    .html-export__panel--roadmap.html-export__panel--fullscreen .html-export__tree-shell {
      flex: 1 1 auto;
      width: 100%;
      height: 100%;
      min-height: 0;
      padding: 8px;
    }

    .html-export__node--selected .skill-node-button {
      box-shadow: 0 0 0 2px rgba(103, 232, 249, 0.92), 0 0 0 6px rgba(103, 232, 249, 0.14);
    }

    .skill-tree-segment-label.html-export__segment-label--selected {
      fill: #a5f3fc;
    }

    .html-export__section-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 14px;
    }

    .html-export__roadmap-actions {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .html-export__roadmap-legend {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 12px;
      padding: 12px 14px;
      border-radius: 12px;
      border: 1px solid rgba(71, 85, 105, 0.45);
      background: rgba(15, 23, 42, 0.82);
    }

    .html-export__roadmap-legend-title {
      color: #cbd5e1;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .html-export__roadmap-legend-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 10px 14px;
    }

    .html-export__roadmap-legend-item {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      min-width: 180px;
      flex: 1 1 220px;
      color: #cbd5e1;
      font-size: 0.82rem;
    }

    .html-export__roadmap-legend-dot,
    .html-export__roadmap-legend-portal {
      width: 14px;
      height: 14px;
      flex: 0 0 14px;
      margin-top: 2px;
      border-radius: 999px;
    }

    .html-export__roadmap-legend-portal {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid currentColor;
      background: rgba(2, 6, 23, 0.55);
      font-size: 0.64rem;
      font-weight: 700;
      line-height: 1;
    }

    .html-export__roadmap-legend-portal--incoming {
      color: #67e8f9;
    }

    .html-export__roadmap-legend-portal--outgoing {
      color: #fbbf24;
    }

    .html-export__roadmap-legend-copy {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .html-export__roadmap-legend-copy strong {
      color: #e2e8f0;
      font-size: 0.8rem;
      line-height: 1.15;
    }

    .html-export__roadmap-legend-copy span {
      color: #94a3b8;
      line-height: 1.3;
      white-space: normal;
    }

    .html-export__roadmap-legend-tip {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      color: #94a3b8;
      font-size: 0.82rem;
      line-height: 1.35;
      white-space: normal;
    }

    .html-export__roadmap-legend-tip-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1rem;
      height: 1rem;
      flex: 0 0 1rem;
      border-radius: 999px;
      color: #bfdbfe;
      background: rgba(30, 41, 59, 0.85);
      border: 1px solid rgba(71, 85, 105, 0.55);
    }

    .html-export__eyebrow {
      margin: 0 0 6px;
      color: var(--export-muted);
      font-size: 0.74rem;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }

    .html-export__filters {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 12px;
      padding: 10px 12px;
      border-radius: 12px;
      border: 1px solid rgba(71, 85, 105, 0.45);
      background: rgba(15, 23, 42, 0.82);
    }

    .html-export__filter-group {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--export-muted);
      font-size: 0.85rem;
    }

    .html-export__filter-select {
      appearance: none;
      border: 1px solid rgba(103, 232, 249, 0.25);
      border-radius: 10px;
      padding: 7px 10px;
      background: rgba(8, 47, 73, 0.35);
      color: #ecfeff;
      min-width: 150px;
      font-size: 0.88rem;
    }

    .html-export__node--minimal .skill-node-level-glow,
    .html-export__node--minimal .skill-node-level-ring,
    .html-export__node--minimal .skill-node-button__shortname,
    .html-export__node--minimal .skill-node-button__name,
    .html-export__node--minimal .skill-node-button__status {
      display: none !important;
    }

    .html-export__node--minimal .skill-node-button__content {
      padding: 0;
    }

    .html-export__node--minimal .skill-node-button {
      box-shadow: 0 0 0 2px rgba(148, 163, 184, 0.28);
    }

    .html-export__tree-shell {
      position: relative;
      z-index: 0;
      flex: 0 0 auto;
      display: block;
      height: 78vh;
      min-height: 58vh;
      overflow: hidden;
      overscroll-behavior: none;
      border-radius: 16px;
      background: #000000;
      padding: 16px;
      scrollbar-width: none;
    }

    .html-export__tree-shell::-webkit-scrollbar {
      display: none;
    }

    .html-export__tree-shell[data-dragging="true"] {
      cursor: grabbing;
    }

    .html-export__tree-canvas {
      position: absolute;
      top: 0;
      left: 0;
      transform-origin: 0 0;
      overflow: visible;
    }

    .html-export__tree-canvas svg {
      display: block;
      width: 100%;
      height: 100%;
      max-width: none;
      max-height: none;
      overflow: visible;
    }

    .html-export__tree-shell .skill-tree-center-icon__foreign {
      overflow: visible;
    }

    .html-export__tree-shell .skill-tree-center-icon {
      overflow: visible;
    }

    .html-export__tree-shell .skill-tree-center-icon__image {
      display: block;
      width: 100%;
      height: 100%;
      max-width: none;
      max-height: none;
      object-fit: contain;
      object-position: center center;
    }

    .html-export__intro {
      margin-bottom: 16px;
      padding: 14px 16px;
      border-radius: 16px;
      border: 1px solid rgba(71, 85, 105, 0.48);
      background: rgba(15, 23, 42, 0.9);
    }

    .html-export__customer-quote {
      margin-top: 12px;
      padding: 14px 16px;
      border-radius: 16px;
      border: 1px solid rgba(103, 232, 249, 0.4);
      background: rgba(8, 47, 73, 0.38);
    }

    .html-export__customer-quote-eyebrow {
      margin: 0 0 8px;
      color: #a5f3fc;
      font-size: 0.74rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .html-export__customer-quote-body {
      margin: 0;
      padding-left: 14px;
      border-left: 3px solid rgba(103, 232, 249, 0.75);
      color: #e2e8f0;
    }

    .html-export__customer-quote-body footer {
      margin-top: 10px;
      color: #bae6fd;
      font-size: 0.84rem;
      font-style: normal;
      font-weight: 600;
    }

    .html-export__intro p,
    .html-export__note-markdown p,
    .html-export__customer-quote-markdown p {
      margin: 8px 0 0;
      line-height: 1.55;
    }

    .html-export__intro h1,
    .html-export__intro h2,
    .html-export__intro h3,
    .html-export__note-markdown h1,
    .html-export__note-markdown h2,
    .html-export__note-markdown h3,
    .html-export__customer-quote-markdown h1,
    .html-export__customer-quote-markdown h2,
    .html-export__customer-quote-markdown h3 {
      margin: 12px 0 0;
      line-height: 1.15;
      color: #f8fafc;
    }

    .html-export__intro h1,
    .html-export__note-markdown h1,
    .html-export__customer-quote-markdown h1 {
      font-size: 1.45rem;
    }

    .html-export__intro h2,
    .html-export__note-markdown h2,
    .html-export__customer-quote-markdown h2 {
      font-size: 1.2rem;
    }

    .html-export__intro h3,
    .html-export__note-markdown h3,
    .html-export__customer-quote-markdown h3 {
      font-size: 1.05rem;
    }

    .html-export__intro ul,
    .html-export__note-markdown ul,
    .html-export__customer-quote-markdown ul {
      margin: 8px 0 0;
      padding-left: 18px;
    }

    .html-export__intro li,
    .html-export__note-markdown li,
    .html-export__customer-quote-markdown li {
      margin: 4px 0;
    }

    .html-export__intro a,
    .html-export__note-markdown a,
    .html-export__customer-quote-markdown a {
      color: #67e8f9;
    }

    .html-export__intro code,
    .html-export__note-markdown code,
    .html-export__customer-quote-markdown code {
      padding: 0.1rem 0.3rem;
      border-radius: 6px;
      background: rgba(15, 23, 42, 0.18);
    }

    .html-export__release-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .html-export__release-block {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 14px;
      border-radius: 16px;
      border: 1px solid rgba(71, 85, 105, 0.48);
      background: rgba(2, 6, 23, 0.25);
    }

    .html-export__release-header h3 {
      margin: 0;
      font-size: 1.08rem;
      color: #f8fafc;
    }

    .html-export__release-header p {
      margin: 4px 0 0;
      color: #cbd5e1;
      font-size: 0.82rem;
    }

    .html-export__release-group-label {
      margin: 0;
      color: #f8fafc;
      font-size: 0.82rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .html-export__note-card {
      margin-top: 10px;
      padding: 0 0 14px;
      border: 0;
      border-bottom: 1px solid rgba(71, 85, 105, 0.4);
      background: transparent;
    }

    .html-export__note-card:last-child {
      border-bottom: 0;
      padding-bottom: 0;
    }

    .html-export__note-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: start;
      gap: 14px 18px;
    }

    .html-export__note-main {
      min-width: 0;
    }

    .html-export__note-header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      color: var(--export-muted);
      font-size: 0.82rem;
    }

    .html-export__note-aside {
      display: flex;
      justify-content: flex-end;
      min-width: 170px;
      max-width: 240px;
      padding-top: 2px;
    }

    .html-export__note-aside .skill-node-tooltip__scopes {
      justify-content: flex-end;
    }

    .html-export__note-card strong {
      color: #f8fafc;
      font-size: 1rem;
    }

    .html-export__note-card p {
      margin: 10px 0 0;
      line-height: 1.55;
    }

    .html-export__empty {
      margin: 0;
      color: var(--export-muted);
    }

    @media (max-width: 960px) {
      .html-export {
        padding: 14px;
      }

      .html-export__header {
        flex-direction: column;
      }

      .html-export__panel--roadmap {
        min-height: 0;
      }

      .html-export__actions {
        justify-content: flex-start;
      }

      .html-export__note-layout {
        grid-template-columns: 1fr;
      }

      .html-export__note-header {
        flex-direction: column;
        align-items: flex-start;
      }

      .html-export__note-aside {
        min-width: 0;
        max-width: none;
        justify-content: flex-start;
      }

      .html-export__note-aside .skill-node-tooltip__scopes {
        justify-content: flex-start;
      }

      .html-export__roadmap-actions {
        justify-content: flex-start;
      }
    }

    .html-export__priority-matrix-svg {
      display: block;
      width: 100%;
      max-height: 520px;
      border-radius: 12px;
      background: rgba(2, 6, 23, 0.35);
      padding: 12px 0;
    }

    .html-export__matrix-legend {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
      margin-top: 12px;
    }

    .html-export__matrix-legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.8rem;
      color: #94a3b8;
    }

    .html-export__matrix-legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    @media print {
      body {
        background: #ffffff;
        color: #111827;
      }

      .html-export {
        max-width: none;
        padding: 0;
        min-height: auto;
      }

      .html-export__header,
      .html-export__tabs,
      .html-export__panel {
        background: #ffffff;
        color: #111827;
        border-color: #dbe3ee;
        box-shadow: none;
        backdrop-filter: none;
      }

      .html-export__actions {
        display: none;
      }

      .html-export__tree-shell {
        background: #ffffff;
        height: auto;
        min-height: auto;
        overflow: hidden;
        padding: 0;
      }

      .html-export__note-card strong {
        color: #111827;
      }

      .html-export__note-card {
        background: transparent;
        border-color: #dbe3ee;
      }

      .html-export__customer-quote {
        background: #ffffff;
        border-color: #dbe3ee;
      }
    }
  </style>
  <style data-export-print="printed.css">
    ${PRINT_FOCUSED_CSS_TEXT}
  </style>
</head>
<body>
  <main class="html-export">
    <section class="html-export__header">
      <div>
        <p class="html-export__eyebrow">System</p>
        <h1 class="html-export__title">${escapeHtml(systemName)}</h1>
        <p class="html-export__subtitle">${escapeHtml(releaseTitle || systemName)}</p>
        <p class="html-export__section-subtitle">${escapeHtml(subtitleBits.filter(Boolean).join(' · '))}</p>
      </div>
      <div class="html-export__actions">
        <details class="html-export__menu">
          <summary class="html-export__menu-button" aria-label="Export">
            <span class="html-export__menu-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <path d="m7 10 5 5 5-5" />
                <path d="M12 15V3" />
              </svg>
            </span>
          </summary>
          <div class="html-export__menu-panel">
            <div class="html-export__menu-actions">
              <button id="html-export-print" class="html-export__menu-action" type="button">PDF</button>
              <button id="html-export-png" class="html-export__menu-action" type="button">PNG</button>
              <button id="html-export-svg" class="html-export__menu-action" type="button">SVG (interactive)</button>
              <button id="html-export-svg-clean" class="html-export__menu-action" type="button">SVG clean</button>
            </div>
          </div>
        </details>
      </div>
    </section>

    <section class="html-export__panel html-export__panel--roadmap">
      <header class="html-export__section-header">
        <p class="html-export__eyebrow">Roadmap</p>
        <div class="html-export__roadmap-actions">
          <button id="html-export-fit" class="html-export__action html-export__action--fit" type="button" aria-label="Fit to screen">
            <span class="html-export__action-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 4h6v2H6v4H4z" />
                <path d="M20 4h-6v2h4v4h2z" />
                <path d="M4 20h6v-2H6v-4H4z" />
                <path d="M20 20h-6v-2h4v-4h2z" />
              </svg>
            </span>
          </button>
          <button id="html-export-fullscreen" class="html-export__action html-export__action--fullscreen" type="button" aria-label="Open fullscreen roadmap" title="Open fullscreen">
            <span class="html-export__action-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8 3H3v5" />
                <path d="M16 3h5v5" />
                <path d="M3 16v5h5" />
                <path d="M21 16v5h-5" />
              </svg>
            </span>
          </button>
          <details class="html-export__menu html-export__menu--zoom">
            <summary id="html-export-zoom-toggle" class="html-export__menu-button" aria-label="Zoom" aria-expanded="false">
              <span class="html-export__menu-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20l-3.5-3.5" />
                </svg>
              </span>
            </summary>
            <div class="html-export__menu-panel html-export__menu-panel--zoom">
              <div class="html-export__zoom-controls">
                <button id="html-export-zoom-out" class="html-export__menu-action html-export__menu-action--icon" type="button" aria-label="Zoom out">−</button>
                <input id="html-export-zoom-slider" class="html-export__zoom-slider" type="range" min="25" max="1000" step="1" value="100" aria-label="Zoom">
                <span id="html-export-zoom-value" class="html-export__zoom-value">100%</span>
                <button id="html-export-zoom-in" class="html-export__menu-action html-export__menu-action--icon" type="button" aria-label="Zoom in">+</button>
              </div>
            </div>
          </details>
          <details class="html-export__menu">
            <summary class="html-export__menu-button" aria-label="Filter">
              <span class="html-export__menu-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 5h18l-7 8v5l-4 2v-7L3 5z" />
                </svg>
              </span>
            </summary>
            <div class="html-export__menu-panel html-export__menu-panel--filters">
              <div class="html-export__menu-filter">
                <label>
                  <span>Scope</span>
                  <select id="html-export-filter-scope" multiple size="${Math.min(Math.max((roadmapDocument.scopes ?? []).length + 1, 4), 8)}">
                    <option value="__all__" selected>All Scopes</option>
                    ${(roadmapDocument.scopes ?? []).map((scope) => (`
                      <option value="${escapeHtml(scope.id)}">${escapeHtml(scope.label)}</option>
                    `)).join('')}
                  </select>
                  <span class="html-export__menu-filter-hint">Ctrl/Cmd-click for multi-select</span>
                </label>
                <label>
                  <span>Release</span>
                  <select id="html-export-filter-release">
                    <option value="all">All</option>
                    <option value="now">Now</option>
                    <option value="next">Next</option>
                  </select>
                </label>
              </div>
            </div>
          </details>
        </div>
      </header>
      ${buildRoadmapLegendMarkup(roadmapDocument)}
      <div id="html-export-tree-shell" class="html-export__tree-shell">
        <div id="html-export-tree-canvas" class="html-export__tree-canvas">${svgMarkup}</div>
      </div>
    </section>

    <section class="html-export__panel">
      <header class="html-export__section-header">
        <p class="html-export__eyebrow">Status Summary</p>
        <p class="html-export__menu-filter-hint">Sorted by ${escapeHtml(getStatusSummarySortLabel(statusSummarySortMode))}</p>
      </header>
      ${buildStatusSummaryMarkup(canonicalDoc, {
        sortMode: statusSummarySortMode,
        selectedReleaseId: selectedReleaseId ?? resolvedReleaseIds[0] ?? null,
      })}
    </section>

    <section class="html-export__panel">
      <header class="html-export__section-header">
        <p class="html-export__eyebrow">Release Notes</p>
      </header>
      <div class="html-export__release-list">${buildReleaseSectionsMarkup({
        roadmapDocument: canonicalDoc,
        releaseIds: resolvedReleaseIds,
        releaseNoteStatusKeys: selectedReleaseNoteStatuses,
        statusSummarySortMode,
        selectedReleaseId: selectedReleaseId ?? resolvedReleaseIds[0] ?? null,
      })}</div>
    </section>

    ${includePriorityMatrix ? `<section class="html-export__panel">
      <header class="html-export__section-header">
        <p class="html-export__eyebrow">Priority Matrix</p>
      </header>
      <div id="pm-export-container" class="html-export__priority-matrix-svg" style="position:relative">
        ${buildPriorityMatrixSvgMarkup(canonicalDoc, resolvedReleaseIds[0] ?? null)}
        <div id="pm-export-tooltip" style="display:none;position:absolute;pointer-events:none;z-index:120;min-width:160px;padding:10px 14px;border-radius:12px;border:1px solid rgba(71,85,105,0.55);background:rgba(2,6,23,0.97);color:#e2e8f0;font-size:0.82rem;line-height:1.5;box-shadow:0 8px 24px rgba(0,0,0,0.45)"></div>
      </div>
      <div class="html-export__matrix-legend">
        ${['done', 'now', 'next', 'later'].map((s) => {
          const style = STATUS_STYLES[s] ?? STATUS_STYLES.later
          return `<div class="html-export__matrix-legend-item"><div class="html-export__matrix-legend-dot" style="background:${style.glowSegment === 'transparent' ? style.ringBand : style.glowSegment};border:1.5px solid ${style.ringBand}"></div><span>${s.charAt(0).toUpperCase() + s.slice(1)}</span></div>`
        }).join('')}
      </div>
    </section>
    <script>(function(){var c=document.getElementById('pm-export-container'),t=document.getElementById('pm-export-tooltip');if(!c||!t)return;c.addEventListener('mouseover',function(e){var n=e.target.closest('.pm-export-node');if(!n){t.style.display='none';return;}t.innerHTML='<strong style="color:#f8fafc;font-size:0.9rem">'+n.dataset.pmLabel+'</strong><br>&#x26A1; Effort: '+n.dataset.pmEffort+'<br>&#x2605; Benefit: '+n.dataset.pmBenefit+'<br>Status: '+n.dataset.pmStatus;t.style.display='block';});c.addEventListener('mousemove',function(e){var r=c.getBoundingClientRect(),tx=e.clientX-r.left+14,ty=e.clientY-r.top-20;if(tx+180>r.width)tx=e.clientX-r.left-180;t.style.left=tx+'px';t.style.top=ty+'px';});c.addEventListener('mouseleave',function(){t.style.display='none';});})();</script>` : ''}
  </main>

  <script id="${HTML_EXPORT_DATA_SCRIPT_ID}" type="application/json">${canonicalPayloadJson}</script>
  <script>${HTML_TO_IMAGE_BUNDLE}</script>
  <script>${buildViewerScript(exportBaseName)}</script>
</body>
</html>`
}

export const extractDocumentPayloadFromHtml = (htmlText) => {
  if (typeof htmlText !== 'string' || htmlText.trim().length === 0) {
    return {
      ok: false,
      error: 'The HTML file is empty or invalid.',
    }
  }

  if (!/<html[\s>]/i.test(htmlText)) {
    return {
      ok: false,
      error: 'The file is not a valid HTML document. Please import an HTML export file.',
    }
  }

  const pattern = new RegExp(`<script[^>]*id=["']${HTML_EXPORT_DATA_SCRIPT_ID}["'][^>]*>([\\s\\S]*?)<\\/script>`, 'i')
  const match = pattern.exec(htmlText)

  if (!match) {
    return {
      ok: false,
      error: 'The HTML file contains no embedded skill tree data. Please use a file created via "Export HTML".',
    }
  }

  const parsed = parseDocumentPayload(match[1].trim())
  if (!parsed.ok) return parsed

  try {
    const canonical = canonicalizeDocumentForExport(parsed.value)
    return { ok: true, value: canonical }
  } catch {
    return { ok: true, value: parsed.value }
  }
}

export const readDocumentFromHtmlText = (htmlText) => {
  const result = extractDocumentPayloadFromHtml(htmlText)

  if (!result.ok) {
    throw new Error(result.error)
  }

  return result.value
}

export const exportHtmlFromSkillTree = ({
  svgElement,
  roadmapDocument,
  selectedReleaseIds = null,
  selectedReleaseId = null,
  selectedReleaseNoteStatuses = null,
  statusSummarySortMode = 'manual',
  includePriorityMatrix = true,
  sourceDocument = globalThis?.document,
}) => {
  if (typeof window === 'undefined' || typeof window.document === 'undefined') {
    return false
  }

  const serializedSvg = serializeSvgElementForExport(svgElement, {
    includeRuntime: false,
  })
  if (!serializedSvg) {
    return false
  }

  const svgMarkup = serializedSvg.replace(XML_PREFIX_PATTERN, '')
  const html = buildHtmlExportDocument({
    svgMarkup,
    roadmapDocument,
    styleText: collectStyleText(sourceDocument),
    selectedReleaseIds,
    selectedReleaseId,
    selectedReleaseNoteStatuses,
    statusSummarySortMode,
    includePriorityMatrix,
  })

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const objectUrl = window.URL.createObjectURL(blob)
  const anchor = window.document.createElement('a')

  anchor.href = objectUrl
  anchor.download = buildExportFileName(roadmapDocument, 'html')
  anchor.style.display = 'none'

  window.document.body.appendChild(anchor)
  anchor.click()
  window.document.body.removeChild(anchor)
  window.URL.revokeObjectURL(objectUrl)

  return true
}
