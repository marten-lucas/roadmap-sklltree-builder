import { buildPersistedDocumentPayload, parseDocumentPayload } from './documentPersistence'
import { collectReleaseNoteEntries } from './pdfExport'
import { renderMarkdownToHtml } from './markdown'
import { renderScopeLabelsMarkup } from './scopeDisplay'
import { serializeSvgElementForExport } from './svgExport'
import { VIEWPORT_DEFAULTS } from './viewport'
import { NODE_LABEL_ZOOM } from '../config'
import htmlToImageBundle from 'html-to-image/dist/html-to-image.js?raw'

export const HTML_EXPORT_DATA_SCRIPT_ID = 'skilltree-export-data'
const HTML_TO_IMAGE_BUNDLE = String(htmlToImageBundle).replace(/<\/script/gi, '<\\/script')

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
  .replace(/-->/g, '--\\u003e')

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

const buildReleaseNotesMarkup = (entries, introductionMarkdown = '') => {
  const introductionHtml = renderMarkdownToHtml(introductionMarkdown)

  if (entries.length === 0) {
    return `${introductionHtml ? `<article class="html-export__intro">${introductionHtml}</article>` : ''}<p class="html-export__empty">Keine Release Notes vorhanden.</p>`
  }

  let currentSegment = null
  const parts = []

  if (introductionHtml) {
    parts.push(`<article class="html-export__intro">${introductionHtml}</article>`)
  }

  entries.forEach((entry) => {
    if (entry.segmentLabel !== currentSegment) {
      currentSegment = entry.segmentLabel
      parts.push(`<section class="html-export__release-group"><p class="html-export__release-group-label">${escapeHtml(currentSegment)}</p></section>`)
    }

    const title = entry.shortName
      ? `${escapeHtml(entry.nodeLabel)} (${escapeHtml(entry.shortName)})`
      : escapeHtml(entry.nodeLabel)
    const levelText = entry.levelCount > 1 ? escapeHtml(entry.levelLabel) : ''
    const statusText = escapeHtml(entry.statusLabel)
    const scopeMarkup = renderScopeLabelsMarkup(entry.scopeLabels)

    parts.push(`
      <article class="html-export__note-card">
        <header>
          <strong>${title}</strong>
          <span>${levelText ? `${levelText} · ` : ''}${statusText}</span>
        </header>
        ${scopeMarkup ? `<div class="skill-node-tooltip__scopes" aria-label="Scopes">${scopeMarkup}</div>` : ''}
        <div class="html-export__note-markdown">${renderMarkdownToHtml(entry.releaseNote)}</div>
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
      const VIEWPORT_ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2]
      const VIEWPORT = {
        minScale: ${VIEWPORT_DEFAULTS.minScale},
        maxScale: ${VIEWPORT_DEFAULTS.maxScale},
        fitPadding: ${VIEWPORT_DEFAULTS.fitPadding},
      }

      // Zoom thresholds for responsive node labels (mirrors NODE_LABEL_ZOOM in config.js)
      const NODE_LABEL_ZOOM = {
        farToMid: ${NODE_LABEL_ZOOM.farToMid},
        midToClose: ${NODE_LABEL_ZOOM.midToClose},
      }
      const CLOSE_CARD_WIDTH = 144
      const CLOSE_CARD_GAP = 0

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

      const getReleaseVisibilityMode = (statusKey, releaseFilter) => {
        if (releaseFilter === RELEASE_FILTER.now) {
          if (statusKey === 'now') {
            return 'full'
          }

          return 'minimal'
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

      const treeCanvas = document.getElementById('html-export-tree-canvas')
      const svgRoot = treeCanvas?.querySelector('svg')
      const treeShell = document.getElementById('html-export-tree-shell')
      const zoomToggleButton = document.getElementById('html-export-zoom-toggle')
      const zoomOutButton = document.getElementById('html-export-zoom-out')
      const zoomInButton = document.getElementById('html-export-zoom-in')
      const zoomSlider = document.getElementById('html-export-zoom-slider')
      const zoomValue = document.getElementById('html-export-zoom-value')
      const fitButton = document.getElementById('html-export-fit')
      const scopeFilterSelect = document.getElementById('html-export-filter-scope')
      const releaseFilterSelect = document.getElementById('html-export-filter-release')
      const printButton = document.getElementById('html-export-print')
      const pngButton = document.getElementById('html-export-png')
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

      // --- Responsive label mode logic ------------------------------------

      const escapeLabelHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

      const getLabelMode = (scale) => {
        if (scale < NODE_LABEL_ZOOM.farToMid) return 'far'
        if (scale >= NODE_LABEL_ZOOM.midToClose) return 'close'
        return 'mid'
      }

      let currentLabelMode = null

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

      const STATUS_RING_COLORS = {
        done: '#9eabbb',
        now: '#ef4444',
        next: '#06b6d4',
        later: '#4f5f75',
      }

      const buildCardNoteHtml = (note) =>
        '<div class="skill-node-tooltip__note skill-node-tooltip__note--markdown" style="font-size:8px;line-height:1.35;">' +
        '<p style="margin:0;">' + escapeLabelHtml(note || 'Keine Release Note hinterlegt.') + '</p>' +
        '</div>'

      const buildCardScopeHtml = (scopeLabels) => {
        if (!Array.isArray(scopeLabels) || scopeLabels.length === 0) return ''
        return '<div class="skill-node-tooltip__scopes" aria-label="Scopes">' +
          scopeLabels.map((l) => '<span class="skill-node-tooltip__scope">' + escapeLabelHtml(l) + '</span>').join('') +
          '</div>'
      }

      const buildCardChipsHtml = (anchor) => {
        const effort = anchor.getAttribute('data-export-effort') || ''
        const benefit = anchor.getAttribute('data-export-benefit') || ''
        if (!effort && !benefit) return ''
        return '<div class="skill-node-tooltip__chips" style="margin-bottom:3px;">' +
          (effort ? '<span class="skill-node-chip skill-node-chip--effort" style="font-size:7px;padding:1px 4px;">⚡ ' + escapeLabelHtml(effort) + '</span>' : '') +
          (benefit ? '<span class="skill-node-chip skill-node-chip--benefit" style="font-size:7px;padding:1px 4px;">★ ' + escapeLabelHtml(benefit) + '</span>' : '') +
          '</div>'
      }

      const addNodeCard = (anchor) => {
        const levelsRaw = anchor.getAttribute('data-export-levels')
        let levels = []
        try { levels = levelsRaw ? JSON.parse(levelsRaw) : [] } catch { levels = [] }

        // Pick best initial level (prefer one with a release note)
        let activeIndex = 0
        for (let i = 0; i < levels.length; i++) {
          if (String(levels[i]?.releaseNote ?? '').trim()) { activeIndex = i; break }
        }

        let card = anchor.querySelector('.skill-node-label-card')
        if (!card) {
          card = document.createElement('div')
          card.className = 'skill-node-label-card'
        }

        const activeLevel = levels[activeIndex] ?? { releaseNote: '', scopeLabels: [] }

        let tabBarHtml = ''
        if (levels.length > 1) {
          tabBarHtml = '<div class="skill-node-level-tab-bar">' +
            levels.map((level, i) => {
              const statusKey = String(level?.status ?? 'later').trim().toLowerCase()
              const dotColor = STATUS_RING_COLORS[statusKey] ?? STATUS_RING_COLORS.later
              const shortLabel = 'L' + (i + 1)
              const isActive = i === activeIndex
              return '<button type="button"' +
                ' class="skill-node-level-tab' + (isActive ? ' skill-node-level-tab--active' : '') + '"' +
                ' data-level-index="' + i + '"' +
                ' title="' + escapeLabelHtml(String(level?.label ?? ('Level ' + (i + 1)))) + '">' +
                '<span class="skill-node-level-tab__dot" style="background:' + dotColor + ';display:inline-block;width:5px;height:5px;border-radius:50%;flex-shrink:0;"></span>' +
                shortLabel +
                '</button>'
            }).join('') +
            '</div>'
        }

        card.innerHTML = tabBarHtml +
          buildCardChipsHtml(anchor) +
          buildCardNoteHtml(activeLevel.releaseNote) +
          buildCardScopeHtml(activeLevel.scopeLabels ?? [])

        if (levels.length > 1) {
          const noteEl = card.querySelector('.skill-node-tooltip__note--markdown')
          card.querySelectorAll('.skill-node-level-tab').forEach((tab) => {
            tab.style.cursor = 'pointer'
            tab.onclick = (e) => {
              e.stopPropagation()
              const idx = Number(tab.dataset.levelIndex)
              card.querySelectorAll('.skill-node-level-tab').forEach((t) => t.classList.remove('skill-node-level-tab--active'))
              tab.classList.add('skill-node-level-tab--active')
              const lev = levels[idx] ?? {}
              noteEl.innerHTML = '<p style="margin:0;">' + escapeLabelHtml(String(lev.releaseNote ?? '') || 'Keine Release Note hinterlegt.') + '</p>'
              const existingScopes = card.querySelector('.skill-node-tooltip__scopes')
              if (existingScopes) existingScopes.remove()
              const scopeHtml = buildCardScopeHtml(lev.scopeLabels ?? [])
              if (scopeHtml) card.insertAdjacentHTML('beforeend', scopeHtml)
            }
          })
        }

        const cardSide = anchor.getAttribute('data-card-side') || 'right'
        const isLeftSide = cardSide === 'left'

        const wrapper = anchor.querySelector('.skill-node-foreign')
        if (wrapper && !anchor.querySelector('.skill-node-label-card')) {
          wrapper.style.display = 'flex'
          wrapper.style.flexDirection = isLeftSide ? 'row-reverse' : 'row'
          wrapper.style.alignItems = 'center'
          wrapper.style.gap = '0'
          card.style.marginLeft = isLeftSide ? '0' : '-12px'
          card.style.marginRight = isLeftSide ? '-12px' : '0'
          card.style.width = '144px'
          wrapper.appendChild(card)
        }
        if (!anchor.dataset.origFwHeight) {
          anchor.dataset.origFwHeight = anchor.getAttribute('height') || ''
          anchor.dataset.origFwWidth = anchor.getAttribute('width') || ''
          anchor.dataset.origFwX = anchor.getAttribute('x') || ''
        }
        const origW = Number.parseFloat(anchor.dataset.origFwWidth) || 0
        const origX = Number.parseFloat(anchor.dataset.origFwX) || 0
        anchor.setAttribute('width', String(origW + CLOSE_CARD_WIDTH + CLOSE_CARD_GAP))
        if (isLeftSide) {
          anchor.setAttribute('x', String(origX - CLOSE_CARD_WIDTH))
        }
      }

      const applyLabelMode = (mode) => {
        if (mode === currentLabelMode) return
        currentLabelMode = mode
        nodeAnchors.forEach((anchor) => {
          if (anchor.style.display === 'none') return
          if (anchor.classList.contains('html-export__node--minimal')) {
            if (mode !== 'close') removeNodeCard(anchor)
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

          if (mode === 'far') {
            content.className = 'skill-node-button__content'
            content.innerHTML = '<p class="skill-node-button__shortname" style="font-size:2rem;font-weight:' + fontWeight + ';line-height:1;letter-spacing:0.08em;color:' + textColor + ';">' + escapeLabelHtml(shortName) + '</p>'
            removeNodeCard(anchor)
          } else if (mode === 'mid') {
            content.className = 'skill-node-button__content skill-node-button__content--labeled'
            content.innerHTML =
              '<p class="skill-node-button__label" style="color:#f8fafc;font-weight:500;white-space:normal;word-break:break-word;">' + escapeLabelHtml(label) + '</p>' +
              '<p class="skill-node-button__shortname" style="font-size:0.7rem;font-weight:' + fontWeight + ';line-height:1;letter-spacing:0.12em;opacity:0.65;color:' + textColor + ';">' + escapeLabelHtml(shortName) + '</p>'
            removeNodeCard(anchor)
          } else if (mode === 'close') {
            content.className = 'skill-node-button__content skill-node-button__content--labeled'
            content.innerHTML =
              '<p class="skill-node-button__label" style="color:#f8fafc;font-weight:500;white-space:normal;word-break:break-word;">' + escapeLabelHtml(label) + '</p>' +
              '<p class="skill-node-button__shortname" style="font-size:0.7rem;font-weight:' + fontWeight + ';line-height:1;letter-spacing:0.12em;opacity:0.65;color:' + textColor + ';">' + escapeLabelHtml(shortName) + '</p>'
            addNodeCard(anchor)
          }
        })
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

      const getViewportKeyboardAction = ({ key, ctrlKey = false, metaKey = false, shiftKey = false, isEditableTarget = false }) => {
        if (isEditableTarget) {
          return null
        }

        if (key === ' ') {
          return 'pan-hold'
        }

        const normalizedKey = String(key ?? '').toLowerCase()
        const hasPrimaryModifier = ctrlKey || metaKey

        if (shiftKey && normalizedKey === 'arrowleft') return 'pan-left'
        if (shiftKey && normalizedKey === 'arrowright') return 'pan-right'
        if (shiftKey && normalizedKey === 'arrowup') return 'pan-up'
        if (shiftKey && normalizedKey === 'arrowdown') return 'pan-down'
        if (!hasPrimaryModifier) return null

        if (normalizedKey === '+' || normalizedKey === '=' || normalizedKey === 'add') return 'zoom-in'
        if (normalizedKey === '-' || normalizedKey === '_' || normalizedKey === 'subtract') return 'zoom-out'
        if (normalizedKey === '0') return 'fit'
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
        treeCanvas.style.width = String(baseWidth) + 'px'
        treeCanvas.style.height = String(baseHeight) + 'px'
        treeCanvas.style.transformOrigin = '0 0'
        treeCanvas.style.transform = 'translate(' + panZoomState.translateX + 'px, ' + panZoomState.translateY + 'px) scale(' + panZoomState.scale + ')'
        treeCanvas.style.visibility = 'visible'

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

        applyLabelMode(getLabelMode(panZoomState.scale))
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
        const boundsX = occupied.minX - viewBoxX
        const boundsY = occupied.minY - viewBoxY
        const contentWidth = Math.max(1, occupied.maxX - occupied.minX)
        const contentHeight = Math.max(1, occupied.maxY - occupied.minY)
        const centerGroup = svgRoot?.querySelector('.skill-tree-center-icon')
        const centerTransform = String(centerGroup?.getAttribute('transform') ?? '').trim()
        let centerX = boundsX + contentWidth / 2
        let centerY = boundsY + contentHeight / 2

        const centerMatch = centerTransform.match(/translate[(] *([-0-9.]+)(?:[, ]+)([-0-9.]+) *[)]/)
        if (centerMatch) {
          const parsedX = Number.parseFloat(centerMatch[1])
          const parsedY = Number.parseFloat(centerMatch[2])

          if (Number.isFinite(parsedX)) centerX = parsedX - viewBoxX
          if (Number.isFinite(parsedY)) centerY = parsedY - viewBoxY
        }
        const boundsMaxX = boundsX + contentWidth
        const boundsMaxY = boundsY + contentHeight
        const halfWidth = Math.max(centerX - boundsX, boundsMaxX - centerX)
        const halfHeight = Math.max(centerY - boundsY, boundsMaxY - centerY)
        const fittedBoundsWidth = Math.max(contentWidth, halfWidth * 2)
        const fittedBoundsHeight = Math.max(contentHeight, halfHeight * 2)
        const fittedBoundsX = centerX - halfWidth
        const fittedBoundsY = centerY - halfHeight
        const fittedScale = clamp(
            Math.min(shellWidth / (fittedBoundsWidth + padding * 2), shellHeight / (fittedBoundsHeight + padding * 2)),
          VIEWPORT.minScale,
          VIEWPORT.maxScale,
        )

        if (!Number.isFinite(fittedScale) || !Number.isFinite(fittedBoundsX) || !Number.isFinite(fittedBoundsY)) {
          panZoomState.scale = 1
          panZoomState.translateX = 0
          panZoomState.translateY = 0
          applyPanZoom()
          return
        }

        panZoomState.scale = fittedScale
        panZoomState.translateX = ((shellWidth - fittedBoundsWidth * fittedScale) / 2) - (fittedBoundsX * fittedScale)
        panZoomState.translateY = ((shellHeight - fittedBoundsHeight * fittedScale) / 2) - (fittedBoundsY * fittedScale)
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
        window.addEventListener('pointermove', moveDrag)
        window.addEventListener('pointerup', endDrag)
        window.addEventListener('pointercancel', endDrag)
        treeShell.addEventListener('wheel', (event) => {
          event.preventDefault()
          const zoomFactor = event.deltaY < 0 ? 1.08 : 0.92
          zoomAtPoint(event.clientX, event.clientY, zoomFactor)
        }, { passive: false })

        treeShell.addEventListener('dblclick', (event) => {
          if (event.target !== treeShell && event.target !== svgRoot) {
            return
          }

          event.preventDefault()
          fitToWidth()
        })

        window.addEventListener('keydown', (event) => {
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
            panZoomState.translateX += 48
            applyPanZoom()
            return
          }

          if (action === 'pan-right') {
            panZoomState.translateX -= 48
            applyPanZoom()
            return
          }

          if (action === 'pan-up') {
            panZoomState.translateY += 48
            applyPanZoom()
            return
          }

          if (action === 'pan-down') {
            panZoomState.translateY -= 48
            applyPanZoom()
            return
          }
        })

        window.addEventListener('keyup', (event) => {
          if (event.key === ' ') {
            panZoomState.isPanModeActive = false
          }
        })

        zoomToggleButton?.addEventListener('click', () => {
          zoomToggleButton.setAttribute('aria-expanded', String(zoomToggleButton.getAttribute('aria-expanded') !== 'true'))
        })

        zoomOutButton?.addEventListener('click', () => zoomByDirection(-1))
        zoomInButton?.addEventListener('click', () => zoomByDirection(1))
        fitButton?.addEventListener('click', () => fitToWidth())

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

        if (mode === 'hidden') {
          anchor.style.display = 'none'
          return
        }

        anchor.style.display = ''

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
          return
        }

        anchor.setAttribute('x', String(originalX))
        anchor.setAttribute('y', String(originalY))
        anchor.setAttribute('width', String(originalWidth))
        anchor.setAttribute('height', String(originalHeight))
        applyInnerSize(originalButtonWidth, originalButtonHeight, originalPadding)
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

          const scopeVisible = selectedScopeId === SCOPE_FILTER_ALL
            || nodeInfo.scopeIds.size === 0
            || nodeInfo.scopeIds.has(selectedScopeId)

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

      const prepareSvgCloneForExport = (sourceSvg, { clean = false } = {}) => {
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
        const prepared = prepareSvgCloneForExport(sourceSvg, { clean })
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

      printButton?.addEventListener('click', () => {
        window.print()
      })

      pngButton?.addEventListener('click', () => {
        void downloadPng(svgRoot, 'skilltree-roadmap.png')
      })

      svgButton?.addEventListener('click', () => {
        downloadSvg(svgRoot, 'skilltree-roadmap.svg')
      })

      cleanSvgButton?.addEventListener('click', () => {
        downloadSvg(svgRoot, 'skilltree-roadmap-clean.svg', { clean: true })
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
}) => {
  const releaseNoteEntries = collectReleaseNoteEntries(roadmapDocument)
  const exportDate = new Date().toLocaleDateString()
  const systemName = String(roadmapDocument?.systemName ?? '').trim() || 'Roadmap'
  const releaseData = roadmapDocument?.release ?? {}
  const releaseTitle = String(releaseData?.name ?? '').trim()
  const releaseMotto = String(releaseData?.motto ?? '').trim()
  const releaseDate = String(releaseData?.date ?? '').trim()
  const releaseIntroduction = String(releaseData?.introduction ?? '')
  const pageTitle = [systemName, releaseTitle].filter(Boolean).join(' · ') || systemName
  const subtitleBits = [releaseMotto, `Exportiert am ${exportDate}`]

  if (releaseDate) {
    subtitleBits.push(`Release Date: ${formatDisplayDate(releaseDate)}`)
  }
  const canonicalDoc = canonicalizeDocumentForExport(roadmapDocument)
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

    .html-export__action--fit {
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

    .html-export__panel--roadmap {
      display: flex;
      flex-direction: column;
      min-height: 0;
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
      will-change: transform;
      overflow: visible;
    }

    .html-export__tree-canvas svg {
      display: block;
      max-width: 100%;
      height: auto;
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
      width: 156px;
      height: 156px;
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

    .html-export__intro p,
    .html-export__note-markdown p {
      margin: 8px 0 0;
      line-height: 1.55;
    }

    .html-export__intro h1,
    .html-export__intro h2,
    .html-export__intro h3,
    .html-export__note-markdown h1,
    .html-export__note-markdown h2,
    .html-export__note-markdown h3 {
      margin: 12px 0 0;
      line-height: 1.15;
      color: #f8fafc;
    }

    .html-export__intro h1,
    .html-export__note-markdown h1 {
      font-size: 1.45rem;
    }

    .html-export__intro h2,
    .html-export__note-markdown h2 {
      font-size: 1.2rem;
    }

    .html-export__intro h3,
    .html-export__note-markdown h3 {
      font-size: 1.05rem;
    }

    .html-export__intro ul,
    .html-export__note-markdown ul {
      margin: 8px 0 0;
      padding-left: 18px;
    }

    .html-export__intro li,
    .html-export__note-markdown li {
      margin: 4px 0;
    }

    .html-export__intro a,
    .html-export__note-markdown a {
      color: #67e8f9;
    }

    .html-export__intro code,
    .html-export__note-markdown code {
      padding: 0.1rem 0.3rem;
      border-radius: 6px;
      background: rgba(15, 23, 42, 0.18);
    }

    .html-export__release-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
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

      .html-export__panel--roadmap {
        min-height: 0;
      }

      .html-export__actions {
        justify-content: flex-start;
      }

      .html-export__note-card header {
        flex-direction: column;
        align-items: flex-start;
      }

      .html-export__roadmap-actions {
        justify-content: flex-start;
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
                <input id="html-export-zoom-slider" class="html-export__zoom-slider" type="range" min="25" max="200" step="1" value="100" aria-label="Zoom">
                <span id="html-export-zoom-value" class="html-export__zoom-value">100%</span>
                <button id="html-export-zoom-in" class="html-export__menu-action html-export__menu-action--icon" type="button" aria-label="Zoom in">+</button>
              </div>
            </div>
          </details>
          <details class="html-export__menu">
            <summary class="html-export__menu-button" aria-label="Filter">
              <span class="html-export__menu-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 6h16" />
                  <path d="M7 12h10" />
                  <path d="M10 18h4" />
                </svg>
              </span>
            </summary>
            <div class="html-export__menu-panel html-export__menu-panel--filters">
              <div class="html-export__menu-filter">
                <label>
                  <span>Scope</span>
                  <select id="html-export-filter-scope">
                    <option value="__all__">Alle Scopes</option>
                    ${(roadmapDocument.scopes ?? []).map((scope) => (`
                      <option value="${escapeHtml(scope.id)}">${escapeHtml(scope.label)}</option>
                    `)).join('')}
                  </select>
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
      <div id="html-export-tree-shell" class="html-export__tree-shell">
        <div id="html-export-tree-canvas" class="html-export__tree-canvas">${svgMarkup}</div>
      </div>
    </section>

    <section class="html-export__panel">
      <header class="html-export__section-header">
        <p class="html-export__eyebrow">Release Notes</p>
      </header>
      <div class="html-export__release-list">${buildReleaseNotesMarkup(releaseNoteEntries, releaseIntroduction)}</div>
    </section>
  </main>

  <script id="${HTML_EXPORT_DATA_SCRIPT_ID}" type="application/json">${canonicalPayloadJson}</script>
  <script>${HTML_TO_IMAGE_BUNDLE}</script>
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
