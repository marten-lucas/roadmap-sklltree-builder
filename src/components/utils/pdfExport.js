import { STATUS_LABELS, normalizeStatusKey } from '../config'

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

  clone.style.width = '100%'
  clone.style.height = 'auto'
  clone.style.maxHeight = '65vh'

  return clone.outerHTML
}

export const collectReleaseNoteEntries = (roadmapDocument) => {
  const segmentLabelById = new Map((roadmapDocument?.segments ?? []).map((segment) => [segment.id, segment.label]))
  const entries = []
  const queue = [...(roadmapDocument?.children ?? [])]

  while (queue.length > 0) {
    const node = queue.shift()
    const levels = Array.isArray(node.levels) ? node.levels : []

    levels.forEach((level, index) => {
      const releaseNote = String(level?.releaseNote ?? '').trim()
      if (!releaseNote) {
        return
      }

      const statusKey = normalizeStatusKey(level.status ?? node.status)
      entries.push({
        nodeId: node.id,
        nodeLabel: node.label,
        shortName: String(node.shortName ?? '').trim(),
        segmentLabel: segmentLabelById.get(node.segmentId) ?? 'Unassigned',
        levelLabel: level.label ?? `Level ${index + 1}`,
        statusLabel: STATUS_LABELS[statusKey] ?? STATUS_LABELS.later,
        releaseNote,
      })
    })

    queue.push(...(node.children ?? []))
  }

  return entries.sort((left, right) => {
    if (left.segmentLabel !== right.segmentLabel) {
      return left.segmentLabel.localeCompare(right.segmentLabel)
    }

    if (left.nodeLabel !== right.nodeLabel) {
      return left.nodeLabel.localeCompare(right.nodeLabel)
    }

    return left.levelLabel.localeCompare(right.levelLabel)
  })
}

const buildReleaseNotesMarkup = (entries) => {
  if (entries.length === 0) {
    return '<p class="pdf-export__empty">Keine Release Notes vorhanden.</p>'
  }

  let currentSegment = null
  const parts = []

  entries.forEach((entry) => {
    if (entry.segmentLabel !== currentSegment) {
      currentSegment = entry.segmentLabel
      parts.push(`<section class="pdf-export__segment"><h2>${escapeHtml(currentSegment)}</h2></section>`)
    }

    const badge = entry.shortName ? `${escapeHtml(entry.nodeLabel)} (${escapeHtml(entry.shortName)})` : escapeHtml(entry.nodeLabel)
    parts.push(`
      <article class="pdf-export__note-card">
        <div class="pdf-export__note-meta">
          <span class="pdf-export__badge">${badge}</span>
          <span>${escapeHtml(entry.levelLabel)}</span>
          <span>${escapeHtml(entry.statusLabel)}</span>
        </div>
        <p>${escapeHtml(entry.releaseNote)}</p>
      </article>
    `)
  })

  return parts.join('\n')
}

export const buildPdfExportHtml = ({
  svgMarkup,
  releaseNoteEntries,
  styleText,
  title = 'Skill Tree Roadmap',
  metadata = {},
}) => {
  const exportDate = new Date().toLocaleDateString()
  const exportOwner = String(metadata.author ?? '').trim()
  const exportBrand = String(metadata.brandName ?? '').trim()
  const subtitleBits = [`Exportiert am ${exportDate}`]

  if (exportOwner) {
    subtitleBits.push(`Autor: ${exportOwner}`)
  }

  if (exportBrand) {
    subtitleBits.push(exportBrand)
  }

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    ${styleText}

    :root {
      color-scheme: light;
    }

    * {
      box-sizing: border-box;
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
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      padding: 12px 14px;
      background: #f8fafc;
      break-inside: avoid;
    }

    .pdf-export__note-card p {
      margin: 8px 0 0;
      line-height: 1.45;
      color: #1e293b;
      font-size: 13px;
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
</head>
<body>
  <section class="pdf-export__page">
    <header class="pdf-export__header">
      <div>
        <h1 class="pdf-export__title">${escapeHtml(title)}</h1>
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
        <p class="pdf-export__subtitle">Zusammenfassung aller gepflegten Notes</p>
      </div>
    </header>
    <div class="pdf-export__notes">${buildReleaseNotesMarkup(releaseNoteEntries)}</div>
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
  title = 'Skill Tree Roadmap',
  metadata = {},
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

  const popup = window.open('', '_blank', 'noopener,noreferrer')
  if (!popup) {
    return {
      ok: false,
      errorCode: 'popup-blocked',
    }
  }

  const styleText = collectStyleText(window.document)
  const releaseNoteEntries = collectReleaseNoteEntries(roadmapDocument)
  const html = buildPdfExportHtml({
    svgMarkup,
    releaseNoteEntries,
    styleText,
    title,
    metadata,
  })

  popup.document.open()
  popup.document.write(html)
  popup.document.close()

  return {
    ok: true,
    errorCode: null,
  }
}

export const exportPdfFromSkillTree = (options) => tryExportPdfFromSkillTree(options).ok
