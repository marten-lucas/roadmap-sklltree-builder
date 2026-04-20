import { STATUS_LABELS, normalizeStatusKey } from '../config'
import { renderMarkdownToHtml } from './markdown'
import { buildExportFileName } from './exportFileName'
import { resolveScopeEntries, renderScopeLabelsMarkup } from './scopeDisplay'
import { getExportViewportBounds } from './svgExport'
import { getLevelStatus } from './nodeStatus'
import { getLevelDisplayLabel } from './treeData'
import printFocusedCssText from './printed.css?raw'
import { buildStatusSummaryGroups, getOrderedNodeRankMap, getStatusSummarySortLabel } from './statusSummary'

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
  .pdf-export__tree-shell { overflow: visible !important; }
}`
})()

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

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

const sanitizeSvgCloneForPrint = (svgElement) => {
  if (!svgElement) {
    return null
  }

  const clone = svgElement.cloneNode(true)

  clone.querySelectorAll('.skill-tree-export-exclude').forEach((node) => node.remove())

  const bounds = getExportViewportBounds(svgElement)
  clone.setAttribute('viewBox', `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`)
  clone.setAttribute('width', String(bounds.width))
  clone.setAttribute('height', String(bounds.height))

  clone.style.width = '100%'
  clone.style.height = 'auto'
  clone.style.maxHeight = '65vh'

  return clone.outerHTML
}

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

export const collectReleaseNoteEntries = (roadmapDocument, releaseId = null, selectedStatusKeys = null) => {
  const segmentLabelById = new Map((roadmapDocument?.segments ?? []).map((segment) => [segment.id, segment.label]))
  const scopes = Array.isArray(roadmapDocument?.scopes) ? roadmapDocument.scopes : []
  const allowedStatuses = new Set(
    (selectedStatusKeys == null ? ['now'] : selectedStatusKeys).map((statusKey) => normalizeStatusKey(statusKey)),
  )
  const entries = []
  const walk = (node) => {
    if (!node) {
      return
    }

    const levels = Array.isArray(node.levels) ? node.levels : []

    levels.forEach((level, index) => {
      const releaseNote = String(level?.releaseNote ?? '').trim()
      const statusKey = normalizeStatusKey(getLevelStatus(level, releaseId))

      if (!releaseNote || !allowedStatuses.has(statusKey)) {
        return
      }

      entries.push({
        nodeId: node.id,
        nodeLabel: node.label,
        shortName: String(node.shortName ?? '').trim(),
        segmentLabel: segmentLabelById.get(node.segmentId) ?? 'Unassigned',
        levelCount: levels.length,
        levelLabel: getLevelDisplayLabel(level.label, index),
        statusLabel: STATUS_LABELS[statusKey] ?? STATUS_LABELS.now,
        releaseNote,
        scopeLabels: resolveScopeEntries(level.scopeIds, scopes),
      })
    })

    for (const child of node.children ?? []) {
      walk(child)
    }
  }

  for (const root of roadmapDocument?.children ?? []) {
    walk(root)
  }

  return entries
}

const buildVoiceOfCustomerMarkup = (voiceOfCustomer = '', fictionalCustomerName = '') => {
  const quoteHtml = renderMarkdownToHtml(voiceOfCustomer)
  const customerName = String(fictionalCustomerName ?? '').trim()

  if (!quoteHtml) {
    return ''
  }

  return `
    <section class="pdf-export__customer-quote">
      <p class="pdf-export__customer-quote-eyebrow">Voice of Customer</p>
      <blockquote class="pdf-export__customer-quote-body">
        <div class="pdf-export__customer-quote-markdown">${quoteHtml}</div>
        ${customerName ? `<footer>— ${escapeHtml(customerName)}</footer>` : ''}
      </blockquote>
    </section>
  `
}

const compareText = (left, right) => String(left ?? '').localeCompare(String(right ?? ''), undefined, {
  sensitivity: 'base',
  numeric: true,
})

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
    return `${introductionHtml ? `<article class="pdf-export__intro">${introductionHtml}</article>` : ''}<p class="pdf-export__empty">Keine Release Notes vorhanden.</p>${quoteMarkup}`
  }

  const parts = []
  const entriesBySegment = new Map()

  if (introductionHtml) {
    parts.push(`<article class="pdf-export__intro">${introductionHtml}</article>`)
  }

  entries.forEach((entry) => {
    if (!entriesBySegment.has(entry.segmentLabel)) {
      entriesBySegment.set(entry.segmentLabel, [])
    }

    entriesBySegment.get(entry.segmentLabel).push(entry)
  })

  for (const [segmentLabel, segmentEntries] of entriesBySegment.entries()) {
    parts.push(`<section class="pdf-export__segment"><h2>${escapeHtml(segmentLabel)}</h2></section>`)

    segmentEntries.forEach((entry) => {
      const badge = entry.shortName ? `${escapeHtml(entry.nodeLabel)} (${escapeHtml(entry.shortName)})` : escapeHtml(entry.nodeLabel)
      const levelText = entry.levelCount > 1 ? escapeHtml(entry.levelLabel) : ''
      const statusText = escapeHtml(entry.statusLabel)
      const scopeMarkup = renderScopeLabelsMarkup(entry.scopeLabels)
      parts.push(`
        <article class="pdf-export__note-card">
          <div class="pdf-export__note-layout">
            <div class="pdf-export__note-main">
              <div class="pdf-export__note-meta">
                <span class="pdf-export__badge">${badge}</span>
                ${levelText ? `<span>${levelText}</span>` : ''}
                <span>${statusText}</span>
              </div>
              <div class="pdf-export__note-markdown">${renderMarkdownToHtml(entry.releaseNote)}</div>
            </div>
            ${scopeMarkup ? `<aside class="pdf-export__note-aside"><div class="skill-node-tooltip__scopes" aria-label="Scopes">${scopeMarkup}</div></aside>` : ''}
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
    return '<p class="pdf-export__empty">No features available.</p>'
  }

  return `
    <div class="pdf-export__status-summary" data-sort-mode="${escapeHtml(sortMode)}">
      ${groups.map((group) => `
        <section class="pdf-export__status-group">
          <header class="pdf-export__status-group-header">
            <strong>${escapeHtml(group.label)}</strong>
            <span>${group.nodes.length}</span>
          </header>
          <div class="pdf-export__status-items">
            ${group.nodes.map((node, index) => `
              <div class="pdf-export__status-item">
                <span class="pdf-export__status-rank">${index + 1}</span>
                <span>${escapeHtml(node.label ?? node.shortName ?? 'Untitled feature')}</span>
              </div>
            `).join('')}
          </div>
        </section>
      `).join('')}
    </div>
  `
}

export const buildPdfExportHtml = ({
  svgMarkup,
  releaseNoteEntries,
  introductionMarkdown = '',
  styleText,
  roadmapDocument,
  releaseMeta = null,
  statusSummarySortMode = 'manual',
  selectedReleaseId = null,
}) => {
  const exportDate = new Date().toLocaleDateString()
  const systemName = String(roadmapDocument?.systemName ?? '').trim() || 'Roadmap'
  const releaseData = releaseMeta ?? roadmapDocument?.release ?? {}
  const releaseTitle = String(releaseData?.name ?? '').trim()
  const releaseMotto = String(releaseData?.motto ?? '').trim()
  const releaseDate = String(releaseData?.date ?? '').trim()
  const pageTitle = buildExportFileName(roadmapDocument, 'pdf').replace(/\.pdf$/i, '')
  const subtitleBits = [`Exportiert am ${exportDate}`]

  if (releaseMotto) {
    subtitleBits.unshift(releaseMotto)
  }

  if (releaseDate) {
    subtitleBits.push(`Release Date: ${formatDisplayDate(releaseDate)}`)
  }

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(pageTitle)}</title>
  <style>
    ${styleText}

    :root {
      color-scheme: light;
    }

    * {
      box-sizing: border-box;
    }

    @page {
      size: A4 portrait;
      margin: 12mm;
    }

    body {
      margin: 0;
      font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
    }

    .pdf-export__page {
      min-height: 100vh;
      padding: 24mm 18mm 16mm;
      display: flex;
      flex-direction: column;
      gap: 16px;
      page-break-after: always;
    }

    .pdf-export__page:last-child {
      page-break-after: auto;
    }

    .pdf-export__header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 16px;
    }

    .pdf-export__title {
      margin: 0;
      font-size: 24px;
      line-height: 1.1;
    }

    .pdf-export__subtitle {
      margin: 4px 0 0;
      color: #475569;
      font-size: 13px;
    }

    .pdf-export__legend {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      color: #334155;
      font-size: 12px;
    }

    .pdf-export__legend-item {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      border: 1px solid #cbd5e1;
      border-radius: 999px;
    }

    .pdf-export__dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      display: inline-block;
    }

    .pdf-export__dot--done { background: #9eabbb; }
    .pdf-export__dot--now { background: #ef4444; }
    .pdf-export__dot--next { background: #06b6d4; }
    .pdf-export__dot--later { background: #4f5f75; }

    .pdf-export__tree-shell {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid #e2e8f0;
      border-radius: 20px;
      overflow: hidden;
      background: #020617;
      padding: 8px;
    }

    .pdf-export__tree-shell svg {
      display: block;
      max-width: 100%;
      height: auto;
    }

    .pdf-export__status-summary {
      display: grid;
      gap: 10px;
      margin-bottom: 12px;
    }

    .pdf-export__status-group {
      border: 1px solid #dbe3ee;
      border-radius: 14px;
      padding: 10px 12px;
      background: #f8fbff;
    }

    .pdf-export__status-group-header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 8px;
      color: #0f172a;
    }

    .pdf-export__status-items {
      display: grid;
      gap: 6px;
    }

    .pdf-export__status-item {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      border-radius: 10px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      color: #1e293b;
    }

    .pdf-export__status-rank {
      display: inline-flex;
      width: 22px;
      height: 22px;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      background: #e0f2fe;
      color: #0f172a;
      font-size: 11px;
      font-weight: 700;
    }

    .pdf-export__notes {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .pdf-export__segment h2 {
      margin: 0;
      font-size: 16px;
      color: #0f172a;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 6px;
    }

    .pdf-export__note-card {
      padding: 0 0 12px;
      border: 0;
      border-bottom: 1px solid #dbe3ee;
      background: transparent;
      break-inside: avoid;
    }

    .pdf-export__note-card:last-child {
      border-bottom: 0;
      padding-bottom: 0;
    }

    .pdf-export__note-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: start;
      gap: 12px 16px;
    }

    .pdf-export__note-main {
      min-width: 0;
    }

    .pdf-export__note-aside {
      display: flex;
      justify-content: flex-end;
      min-width: 150px;
      max-width: 220px;
      padding-top: 2px;
    }

    .pdf-export__note-aside .skill-node-tooltip__scopes {
      justify-content: flex-end;
    }

    .pdf-export__note-card p {
      margin: 8px 0 0;
      line-height: 1.45;
      color: #1e293b;
      font-size: 13px;
    }

    .pdf-export__intro {
      padding: 0 0 8px;
      color: #0f172a;
    }

    .pdf-export__customer-quote {
      padding: 12px 14px;
      border-radius: 14px;
      border: 1px solid #bae6fd;
      background: #f0f9ff;
      break-inside: avoid;
    }

    .pdf-export__customer-quote-eyebrow {
      margin: 0 0 8px;
      color: #0f766e;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .pdf-export__customer-quote-body {
      margin: 0;
      padding-left: 12px;
      border-left: 3px solid #06b6d4;
      color: #164e63;
    }

    .pdf-export__customer-quote-body footer {
      margin-top: 8px;
      color: #0f172a;
      font-size: 12px;
      font-style: normal;
      font-weight: 600;
    }

    .pdf-export__intro p,
    .pdf-export__note-markdown p,
    .pdf-export__customer-quote-markdown p {
      margin: 8px 0 0;
      line-height: 1.55;
    }

    .pdf-export__intro h1,
    .pdf-export__intro h2,
    .pdf-export__intro h3,
    .pdf-export__note-markdown h1,
    .pdf-export__note-markdown h2,
    .pdf-export__note-markdown h3,
    .pdf-export__customer-quote-markdown h1,
    .pdf-export__customer-quote-markdown h2,
    .pdf-export__customer-quote-markdown h3 {
      margin: 12px 0 0;
      line-height: 1.15;
      color: #0f172a;
    }

    .pdf-export__intro h1,
    .pdf-export__note-markdown h1,
    .pdf-export__customer-quote-markdown h1 {
      font-size: 20px;
    }

    .pdf-export__intro h2,
    .pdf-export__note-markdown h2,
    .pdf-export__customer-quote-markdown h2 {
      font-size: 17px;
    }

    .pdf-export__intro h3,
    .pdf-export__note-markdown h3,
    .pdf-export__customer-quote-markdown h3 {
      font-size: 15px;
    }

    .pdf-export__note-markdown ul,
    .pdf-export__intro ul,
    .pdf-export__customer-quote-markdown ul {
      margin: 8px 0 0;
      padding-left: 18px;
    }

    .pdf-export__note-markdown li,
    .pdf-export__intro li,
    .pdf-export__customer-quote-markdown li {
      margin: 4px 0;
    }

    .pdf-export__note-markdown a,
    .pdf-export__intro a,
    .pdf-export__customer-quote-markdown a {
      color: #0f766e;
    }

    .pdf-export__note-markdown code,
    .pdf-export__intro code,
    .pdf-export__customer-quote-markdown code {
      padding: 0.1rem 0.3rem;
      border-radius: 6px;
      background: #e2e8f0;
    }

    .pdf-export__note-meta {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      font-size: 11px;
      color: #475569;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .pdf-export__badge {
      color: #0f172a;
      font-weight: 700;
      letter-spacing: 0;
      text-transform: none;
    }

    .pdf-export__empty {
      margin: 0;
      color: #475569;
      font-size: 14px;
    }

    @media print {
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  </style>
  <style data-export-print="printed.css">
    ${PRINT_FOCUSED_CSS_TEXT}
  </style>
</head>
<body>
  <section class="pdf-export__page">
    <header class="pdf-export__header">
      <div>
        <h1 class="pdf-export__title">${escapeHtml(systemName)}</h1>
        <p class="pdf-export__subtitle">${escapeHtml(releaseTitle || systemName)}</p>
        <p class="pdf-export__subtitle">${escapeHtml(subtitleBits.join(' · '))}</p>
      </div>
      <div class="pdf-export__legend">
        <span class="pdf-export__legend-item"><span class="pdf-export__dot pdf-export__dot--done"></span>Done</span>
        <span class="pdf-export__legend-item"><span class="pdf-export__dot pdf-export__dot--now"></span>Now</span>
        <span class="pdf-export__legend-item"><span class="pdf-export__dot pdf-export__dot--next"></span>Next</span>
        <span class="pdf-export__legend-item"><span class="pdf-export__dot pdf-export__dot--later"></span>Later</span>
      </div>
    </header>
    <div class="pdf-export__tree-shell">${svgMarkup}</div>
  </section>
  <section class="pdf-export__page">
    <header class="pdf-export__header">
      <div>
        <h1 class="pdf-export__title">Release Notes</h1>
        <p class="pdf-export__subtitle">Status Summary · sorted by ${escapeHtml(getStatusSummarySortLabel(statusSummarySortMode))}</p>
      </div>
    </header>
    ${buildStatusSummaryMarkup(roadmapDocument, {
      sortMode: statusSummarySortMode,
      selectedReleaseId,
    })}
    <div class="pdf-export__notes">${buildReleaseNotesMarkup(releaseNoteEntries, {
      introduction: introductionMarkdown,
      voiceOfCustomer: releaseData?.voiceOfCustomer ?? '',
      fictionalCustomerName: releaseData?.fictionalCustomerName ?? '',
    })}</div>
  </section>
  <script>
    window.addEventListener('load', () => {
      window.setTimeout(() => {
        window.print()
      }, 180)
    })
  </script>
</body>
</html>`
}

export const tryExportPdfFromSkillTree = ({
  svgElement,
  roadmapDocument,
  selectedReleaseId = null,
  selectedReleaseNoteStatuses = null,
  statusSummarySortMode = 'manual',
}) => {
  if (typeof window === 'undefined' || typeof window.document === 'undefined') {
    return {
      ok: false,
      errorCode: 'missing-window',
    }
  }

  const svgMarkup = sanitizeSvgCloneForPrint(svgElement)
  if (!svgMarkup) {
    return {
      ok: false,
      errorCode: 'invalid-svg',
    }
  }

  const styleText = collectStyleText(window.document)
  const releases = Array.isArray(roadmapDocument?.releases) ? roadmapDocument.releases : []
  const selectedRelease = selectedReleaseId
    ? releases.find((release) => release.id === selectedReleaseId) ?? null
    : null
  const releaseMeta = selectedRelease ?? releases[0] ?? roadmapDocument?.release ?? null
  const nodeRankById = getOrderedNodeRankMap(roadmapDocument, {
    sortMode: statusSummarySortMode,
    selectedReleaseId: releaseMeta?.id ?? selectedReleaseId,
  })
  const releaseNoteEntries = sortReleaseNoteEntries(
    collectReleaseNoteEntries(roadmapDocument, releaseMeta?.id ?? null, selectedReleaseNoteStatuses),
    nodeRankById,
  )
  const html = buildPdfExportHtml({
    svgMarkup,
    releaseNoteEntries,
    introductionMarkdown: String(releaseMeta?.introduction ?? roadmapDocument?.release?.introduction ?? ''),
    styleText,
    roadmapDocument,
    releaseMeta,
    statusSummarySortMode,
    selectedReleaseId: releaseMeta?.id ?? selectedReleaseId,
  })

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const objectUrl = window.URL.createObjectURL(blob)

  const popup = window.open(objectUrl, '_blank', 'noopener,noreferrer')
  if (!popup) {
    window.URL.revokeObjectURL(objectUrl)
    return {
      ok: false,
      errorCode: 'popup-blocked',
    }
  }

  window.setTimeout(() => {
    window.URL.revokeObjectURL(objectUrl)
  }, 60_000)

  return {
    ok: true,
    errorCode: null,
  }
}

export const exportPdfFromSkillTree = (options) => tryExportPdfFromSkillTree(options).ok
