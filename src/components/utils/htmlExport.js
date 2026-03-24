import { buildPersistedDocumentPayload, parseDocumentPayload } from './documentPersistence'
import { collectReleaseNoteEntries } from './pdfExport'
import { serializeSvgElementForExport } from './svgExport'

export const HTML_EXPORT_DATA_SCRIPT_ID = 'skilltree-export-data'

const XML_PREFIX_PATTERN = /^<\?xml[^>]*\?>\s*/i

const normalizeScopeKey = (label) => String(label ?? '').trim().toLowerCase()

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

    if (!seen.has(key)) {
      seen.set(key, { id: scope.id, label })
    }
    idMap.set(scope.id, seen.get(key).id)
  }

  for (const { id, label } of Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label))) {
    scopes.push({ id, label })
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
  .replace(/-->/g, '--\\>')

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

const buildReleaseNotesMarkup = (entries) => {
  if (entries.length === 0) {
    return '<p class="html-export__empty">Keine Release Notes vorhanden.</p>'
  }

  let currentSegment = null
  const parts = []

  entries.forEach((entry) => {
    if (entry.segmentLabel !== currentSegment) {
      currentSegment = entry.segmentLabel
      parts.push(`<section class="html-export__release-group"><h2>${escapeHtml(currentSegment)}</h2></section>`)
    }

    const title = entry.shortName
      ? `${escapeHtml(entry.nodeLabel)} (${escapeHtml(entry.shortName)})`
      : escapeHtml(entry.nodeLabel)

    parts.push(`
      <article class="html-export__note-card">
        <header>
          <strong>${title}</strong>
          <span>${escapeHtml(entry.levelLabel)} · ${escapeHtml(entry.statusLabel)}</span>
        </header>
        <p>${escapeHtml(entry.releaseNote)}</p>
      </article>
    `)
  })

  return parts.join('\n')
}

const buildViewerScript = () => `
    (() => {
      const RELEASE_FILTER = {
        all: 'all',
        now: 'now',
        next: 'next',
      }
      const SCOPE_FILTER_ALL = '__all__'
      const MINIMAL_NODE_SCALE = 0.32

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

      const getReleaseVisibilityMode = (statusKey, releaseFilter) => {
        if (releaseFilter === RELEASE_FILTER.now) {
          if (statusKey === 'now' || statusKey === 'next') {
            return 'full'
          }

          if (statusKey === 'done') {
            return 'minimal'
          }

          return 'hidden'
        }

        if (releaseFilter === RELEASE_FILTER.next) {
          if (statusKey === 'now' || statusKey === 'next') {
            return 'full'
          }

          return 'minimal'
        }

        return 'full'
      }

      const walkNodes = (node, visitor) => {
        if (!node || !Array.isArray(node.children)) {
          return
        }

        node.children.forEach((child) => {
          visitor(child)
          walkNodes(child, visitor)
        })
      }

      const tabButtons = Array.from(document.querySelectorAll('[data-export-tab-button]'))
      const tabPanels = Array.from(document.querySelectorAll('[data-export-tab-panel]'))
      const skillTreePanel = document.querySelector('[data-export-tab-panel="skilltree"]')
      const releaseNotesPanel = document.querySelector('[data-export-tab-panel="releasenotes"]')
      const svgRoot = document.querySelector('.html-export__tree-shell svg')
      const scopeFilterSelect = document.getElementById('html-export-filter-scope')
      const releaseFilterSelect = document.getElementById('html-export-filter-release')
      const printButton = document.getElementById('html-export-print')
      const svgButton = document.getElementById('html-export-svg')
      const cleanSvgButton = document.getElementById('html-export-svg-clean')
      const exportDataScript = document.getElementById('${HTML_EXPORT_DATA_SCRIPT_ID}')

      const nodeInfoById = new Map()
      const allScopeIds = new Set()

      if (exportDataScript?.textContent) {
        try {
          const payload = JSON.parse(exportDataScript.textContent)
          const documentData = payload?.document ?? null
          const scopes = Array.isArray(documentData?.scopes) ? documentData.scopes : []

          scopes.forEach((scope) => {
            if (scope?.id) {
              allScopeIds.add(scope.id)
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

      const setNodeMode = (anchor, mode) => {
        if (!anchor) {
          return
        }

        const originalX = Number.parseFloat(anchor.dataset.origX ?? anchor.getAttribute('x') ?? '0')
        const originalY = Number.parseFloat(anchor.dataset.origY ?? anchor.getAttribute('y') ?? '0')
        const originalWidth = Number.parseFloat(anchor.dataset.origWidth ?? anchor.getAttribute('width') ?? '0')
        const originalHeight = Number.parseFloat(anchor.dataset.origHeight ?? anchor.getAttribute('height') ?? '0')

        if (!anchor.dataset.origX) {
          anchor.dataset.origX = String(originalX)
          anchor.dataset.origY = String(originalY)
          anchor.dataset.origWidth = String(originalWidth)
          anchor.dataset.origHeight = String(originalHeight)
        }

        if (mode === 'hidden') {
          anchor.style.display = 'none'
          return
        }

        anchor.style.display = ''

        if (mode === 'minimal') {
          const centerX = originalX + originalWidth / 2
          const centerY = originalY + originalHeight / 2
          const width = Math.max(30, originalWidth * MINIMAL_NODE_SCALE)
          const height = Math.max(30, originalHeight * MINIMAL_NODE_SCALE)

          anchor.setAttribute('x', String(centerX - width / 2))
          anchor.setAttribute('y', String(centerY - height / 2))
          anchor.setAttribute('width', String(width))
          anchor.setAttribute('height', String(height))
          anchor.classList.add('html-export__node--minimal')
          return
        }

        anchor.setAttribute('x', String(originalX))
        anchor.setAttribute('y', String(originalY))
        anchor.setAttribute('width', String(originalWidth))
        anchor.setAttribute('height', String(originalHeight))
        anchor.classList.remove('html-export__node--minimal')
      }

      const applyTreeFilters = () => {
        const selectedScopeId = scopeFilterSelect?.value || SCOPE_FILTER_ALL
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

          const scopeVisible = selectedScopeId === SCOPE_FILTER_ALL || nodeInfo.scopeIds.has(selectedScopeId)

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
      }

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

      const downloadSvg = (sourceSvg, fileName, { clean = false } = {}) => {
        if (!sourceSvg) {
          return
        }

        const clone = sourceSvg.cloneNode(true)
        if (clean) {
          clone.querySelectorAll('.export-tooltip-layer').forEach((node) => node.remove())
          clone.querySelectorAll('style').forEach((style) => {
            if (style.textContent && style.textContent.includes('.export-tooltip-trigger')) {
              style.remove()
            }
          })
        }

        const svgMarkup = '<?xml version="1.0" encoding="UTF-8"?>\n' + clone.outerHTML
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

      const activateTab = (tabName) => {
        tabButtons.forEach((button) => {
          const isActive = button.dataset.exportTabButton === tabName
          button.dataset.active = isActive ? 'true' : 'false'
        })

        tabPanels.forEach((panel) => {
          const isActive = panel.dataset.exportTabPanel === tabName
          panel.hidden = !isActive
        })
      }

      tabButtons.forEach((button) => {
        button.addEventListener('click', () => {
          activateTab(button.dataset.exportTabButton)
        })
      })

      printButton?.addEventListener('click', () => {
        window.print()
      })

      svgButton?.addEventListener('click', () => {
        downloadSvg(svgRoot, 'skilltree-roadmap.svg')
      })

      cleanSvgButton?.addEventListener('click', () => {
        downloadSvg(svgRoot, 'skilltree-roadmap-clean.svg', { clean: true })
      })

      scopeFilterSelect?.addEventListener('change', applyTreeFilters)
      releaseFilterSelect?.addEventListener('change', applyTreeFilters)

      activateTab('skilltree')
      applyTreeFilters()

      if (skillTreePanel && releaseNotesPanel && window.location.hash === '#release-notes') {
        activateTab('releasenotes')
      }
    })()
  `

export const buildHtmlExportDocument = ({
  svgMarkup,
  roadmapDocument,
  styleText,
  title = 'Skill Tree Roadmap',
  metadata = {},
}) => {
  const releaseNoteEntries = collectReleaseNoteEntries(roadmapDocument)
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
  const payloadJson = escapeJsonForScriptTag(JSON.stringify(buildPersistedDocumentPayload(roadmapDocument), null, 2))
  
  const canonicalDoc = canonicalizeDocumentForExport(roadmapDocument)
  const canonicalPayloadJson = escapeJsonForScriptTag(JSON.stringify(buildPersistedDocumentPayload(canonicalDoc), null, 2))

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
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
      background:
        radial-gradient(circle at top, rgba(8, 47, 73, 0.35), transparent 34%),
        linear-gradient(180deg, #020617 0%, #0f172a 100%);
    }

    .html-export {
      max-width: 1440px;
      margin: 0 auto;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 18px;
    }

    .html-export__header,
    .html-export__tabs,
    .html-export__panel {
      background: var(--export-surface);
      border: 1px solid var(--export-border);
      border-radius: 20px;
      backdrop-filter: blur(12px);
    }

    .html-export__header {
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

    .html-export__tabs {
      display: flex;
      gap: 10px;
      padding: 12px;
    }

    .html-export__tab[data-active="true"] {
      background: rgba(34, 211, 238, 0.18);
      border-color: rgba(103, 232, 249, 0.5);
    }

    .html-export__panel {
      padding: 18px;
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
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 60vh;
      overflow: auto;
      border-radius: 16px;
      background: rgba(2, 6, 23, 0.82);
      padding: 10px;
    }

    .html-export__tree-shell svg {
      display: block;
      max-width: 100%;
      height: auto;
    }

    .html-export__release-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .html-export__release-group h2 {
      margin: 0;
      padding-bottom: 6px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.18);
      color: #f8fafc;
      font-size: 1rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .html-export__note-card {
      margin-top: 10px;
      padding: 14px 16px;
      border-radius: 16px;
      border: 1px solid rgba(71, 85, 105, 0.48);
      background: rgba(15, 23, 42, 0.9);
    }

    .html-export__note-card header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      color: var(--export-muted);
      font-size: 0.82rem;
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

      .html-export__actions {
        justify-content: flex-start;
      }

      .html-export__note-card header {
        flex-direction: column;
        align-items: flex-start;
      }
    }

    @media print {
      body {
        background: #ffffff;
        color: #111827;
      }

      .html-export {
        max-width: none;
        padding: 0;
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

      .html-export__actions,
      .html-export__tabs {
        display: none;
      }

      .html-export__panel[hidden] {
        display: block !important;
      }

      .html-export__tree-shell {
        background: #ffffff;
        min-height: auto;
        overflow: visible;
      }

      .html-export__release-group h2,
      .html-export__note-card strong {
        color: #111827;
      }

      .html-export__note-card {
        background: #ffffff;
        border-color: #dbe3ee;
      }
    }
  </style>
</head>
<body>
  <main class="html-export">
    <section class="html-export__header">
      <div>
        <h1 class="html-export__title">${escapeHtml(title)}</h1>
        <p class="html-export__subtitle">${escapeHtml(subtitleBits.join(' · '))}</p>
        ${exportBrand ? `<span class="html-export__brand">${escapeHtml(exportBrand)}</span>` : ''}
      </div>
      <div class="html-export__actions">
        <button id="html-export-print" class="html-export__action" type="button">PDF drucken</button>
        <button id="html-export-svg" class="html-export__action" type="button">SVG herunterladen</button>
        <button id="html-export-svg-clean" class="html-export__action" type="button">SVG clean</button>
      </div>
    </section>

    <section class="html-export__tabs" aria-label="Ansichten">
      <button class="html-export__tab" type="button" data-export-tab-button="skilltree">Skilltree</button>
      <button class="html-export__tab" type="button" data-export-tab-button="releasenotes">Release Notes</button>
    </section>

    <section class="html-export__panel" data-export-tab-panel="skilltree">
      <div class="html-export__filters" aria-label="Skilltree Filter">
        <label class="html-export__filter-group">
          <span>Scope</span>
          <select id="html-export-filter-scope" class="html-export__filter-select">
            <option value="__all__">Alle Scopes</option>
            ${(roadmapDocument.scopes ?? []).map((scope) => (
              `<option value="${escapeHtml(scope.id)}">${escapeHtml(scope.label)}</option>`
            )).join('')}
          </select>
        </label>
        <label class="html-export__filter-group">
          <span>Release</span>
          <select id="html-export-filter-release" class="html-export__filter-select">
            <option value="all">All</option>
            <option value="now">Now</option>
            <option value="next">Next</option>
          </select>
        </label>
      </div>
      <div class="html-export__tree-shell">${svgMarkup}</div>
    </section>

    <section class="html-export__panel" data-export-tab-panel="releasenotes" hidden>
      <div class="html-export__release-list">${buildReleaseNotesMarkup(releaseNoteEntries)}</div>
    </section>
  </main>

  <script id="${HTML_EXPORT_DATA_SCRIPT_ID}" type="application/json">${canonicalPayloadJson}</script>
  <script>${buildViewerScript()}</script>
</body>
</html>`
}

export const extractDocumentPayloadFromHtml = (htmlText) => {
  if (typeof htmlText !== 'string' || htmlText.trim().length === 0) {
    return {
      ok: false,
      error: 'Die HTML-Datei ist leer oder ungueltig.',
    }
  }

  if (!/<html[\s>]/i.test(htmlText)) {
    return {
      ok: false,
      error: 'Die Datei ist kein gueltiges HTML-Dokument. Bitte eine HTML-Exportdatei importieren.',
    }
  }

  const pattern = new RegExp(`<script[^>]*id=["']${HTML_EXPORT_DATA_SCRIPT_ID}["'][^>]*>([\\s\\S]*?)<\\/script>`, 'i')
  const match = pattern.exec(htmlText)

  if (!match) {
    return {
      ok: false,
      error: 'Die HTML-Datei enthaelt keine eingebetteten Skilltree-Daten. Bitte eine Datei verwenden, die ueber "HTML exportieren" erzeugt wurde.',
    }
  }

  const parsed = parseDocumentPayload(match[1].trim())
  if (!parsed.ok) return parsed

  try {
    const canonical = canonicalizeDocumentForExport(parsed.value)
    return { ok: true, value: canonical }
  } catch (err) {
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
  title = 'Skill Tree Roadmap',
  metadata = {},
  sourceDocument = globalThis?.document,
}) => {
  if (typeof window === 'undefined' || typeof window.document === 'undefined') {
    return false
  }

  const serializedSvg = serializeSvgElementForExport(svgElement)
  if (!serializedSvg) {
    return false
  }

  const svgMarkup = serializedSvg.replace(XML_PREFIX_PATTERN, '')
  const html = buildHtmlExportDocument({
    svgMarkup,
    roadmapDocument,
    styleText: collectStyleText(sourceDocument),
    title,
    metadata,
  })

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const objectUrl = window.URL.createObjectURL(blob)
  const anchor = window.document.createElement('a')

  anchor.href = objectUrl
  anchor.download = 'skilltree-roadmap.html'
  anchor.style.display = 'none'

  window.document.body.appendChild(anchor)
  anchor.click()
  window.document.body.removeChild(anchor)
  window.URL.revokeObjectURL(objectUrl)

  return true
}
