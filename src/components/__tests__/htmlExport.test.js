import { describe, expect, it } from 'vitest'
import {
  HTML_EXPORT_DATA_SCRIPT_ID,
  buildHtmlExportDocument,
  extractDocumentPayloadFromHtml,
  readDocumentFromHtmlText,
} from '../utils/htmlExport'

const createDocument = () => ({
  systemName: 'myKyana',
  release: {
    name: 'July 2026 Release',
    motto: 'Reich & Schön',
    introduction: '# Release Overview\nThe introduction uses **markdown** and a [link](https://example.com).',
    voiceOfCustomer: '"This finally saves me hours every week."',
    fictionalCustomerName: 'Alex Example',
    date: '2026-07-01',
  },
  segments: [
    { id: 'segment-frontend', label: 'Frontend' },
  ],
  scopes: [
    { id: 'scope-frontend', label: 'Frontend' },
    { id: 'scope-platform', label: 'Platform' },
  ],
  children: [
    {
      id: 'node-1',
      label: 'React Platform',
      shortName: 'RCT',
      status: 'now',
      segmentId: 'segment-frontend',
      levels: [
        { id: 'level-1', label: 'Level 1', status: 'now', releaseNote: '## Release Impact\nRollout fuer die neue Plattform laeuft. **Now** is live.', scopeIds: ['scope-frontend', 'scope-platform'] },
      ],
      children: [],
    },
  ],
})

describe('htmlExport', () => {
  it('builds standalone html with a single roadmap page and embedded document payload', () => {
    const document = createDocument()
    const html = buildHtmlExportDocument({
      svgMarkup: '<svg viewBox="0 0 100 100"></svg>',
      roadmapDocument: document,
      styleText: '.skill-tree-canvas { color: red; }',
      title: 'Skill Tree Viewer',
    })

    expect(html).toContain('myKyana')
    expect(html).toContain('July 2026 Release')
    expect(html).toContain('Reich & Schön')
    expect(html).toContain('Release Notes')
    expect(html).toContain('<svg viewBox="0 0 100 100"></svg>')
    expect(html).toContain(`id="${HTML_EXPORT_DATA_SCRIPT_ID}"`)
    expect(html).toContain('Frontend')
    expect(html).toContain('Platform')
    expect(html).toContain('PDF')
    expect(html).toContain('PNG')
    expect(html).toContain('SVG (interactive)')
    expect(html).toContain('SVG clean')
    expect(html).toContain('id="html-export-png"')
    expect(html).toContain('id="html-export-fullscreen"')
    expect(html).toContain('Open fullscreen roadmap')
    expect(html).toContain('Exit fullscreen')
    expect(html).toContain('html-export--fullscreen')
    expect(html).toContain('width: 100vw;')
    expect(html).toContain('height: 100vh;')
    expect(html).toContain('html-export__panel--roadmap')
    expect(html).toContain('height: 78vh;')
    expect(html).toContain('min-height: 58vh;')
    expect(html).toContain('background: #000000;')
    expect(html).toContain('padding: 16px;')
    expect(html).toContain('scrollbar-width: none;')
    expect(html).toContain('.html-export__tree-shell::-webkit-scrollbar')
    expect(html).toContain('.html-export__tree-canvas {')
    expect(html).toContain('position: absolute;')
    expect(html).toContain('left: 0;')
    expect(html).toContain('overflow: visible;')
    expect(html).toContain('width: 100%;')
    expect(html).toContain('height: 100%;')
    expect(html).not.toContain('width: 156px;')
    expect(html).toContain('max-width: none;')
    expect(html).toContain('aria-label="Filter"')
    expect(html).toContain('id="html-export-filter-scope" multiple')
    expect(html).toContain('Ctrl/Cmd-click for multi-select')
    expect(html).toContain("scopeFilterSelect?.addEventListener('change', applyTreeFilters)")
    expect(html).toContain("releaseFilterSelect?.addEventListener('change', applyTreeFilters)")
    expect(html).not.toContain('Visualisierung')
    expect(html).not.toContain('html-export__section-title')
    expect(html).toContain('The introduction uses <strong>markdown</strong>')
    expect(html).toContain('Rollout fuer die neue Plattform laeuft.')
    expect(html).toContain('printed.css')
    expect(html).toContain('@page')
    expect(html).toContain('<strong>Now</strong> is live')
    expect(html).toContain('html-export__note-layout')
    expect(html).toContain('html-export__note-aside')
    expect(html).toContain('<h1>Release Overview</h1>')
    expect(html).toContain('<h2>Release Impact</h2>')
    expect(html).toContain('Voice of Customer')
    expect(html).toContain('This finally saves me hours every week.')
    expect(html).toContain('Alex Example')
    expect(html).toContain('origButtonWidth')
    expect(html).toContain('applyInnerSize')
    expect(html).toContain('const getOccupiedBounds = () =>')
    expect(html).toContain('minX: Number.POSITIVE_INFINITY')
    expect(html).toContain('const getVisibleViewportBounds = () =>')
    expect(html).toContain('const adaptiveStep = 0.0018 * Math.sqrt(panZoomState.scale)')
    expect(html).toContain('const ratio = Math.exp(adaptiveStep * delta * direction)')
    expect(html).toContain('const VIEWPORT_ZOOM_STEPS = [0.25,0.5,0.75,1,2,3,4,5,6,7,8,9,10]')
    expect(html).toContain("if (action === 'pan-left') {")
    expect(html).toContain('panZoomState.translateX -= 48')
    expect(html).toContain("treeShell.addEventListener('contextmenu'")
    expect(html).toContain('window.htmlToImage?.toBlob')
    expect(html).toContain('readonlySelectionState')
    expect(html).toContain('syncReadonlySelection')
    expect(html).toContain('skill-node-vc__tabs')
    expect(html).toContain('html-export__node--selected')
    expect(html).toContain('skill-tree-portal--selected')
    expect(html).toContain('const focusNodeInViewport = (nodeId, options = {}) =>')
    expect(html).toContain('const injectInteractiveSvgRuntime = (svgElement) =>')
    expect(html).toContain("anchor.classList.remove('html-export__node--minimal')")
    expect(html).toContain('const getReleaseVisibilityMode = (statusKey, releaseFilter) =>')
    expect(html).toContain('const getPortalViewModel = ({')
    expect(html).toContain('const refreshPortalElement = (portalElement, labelMode = currentLabelMode ?? getLabelMode(panZoomState.scale)) =>')
    expect(html).toContain("portalElement.setAttribute('data-portal-minimal'")
    expect(html).toContain('refreshPortalElements(activeLabelMode)')
    expect(html).toContain("treeShell?.addEventListener('pointerenter', () => {")
    expect(html).toContain("pmExportContainer?.addEventListener('pointerenter', () => {")
    expect(html).toContain('z-index:120')
  })

  it('filters rendered release notes by the selected statuses', () => {
    const document = {
      ...createDocument(),
      children: [
        {
          id: 'node-1',
          label: 'Now Item',
          shortName: 'NOW',
          status: 'now',
          segmentId: 'segment-frontend',
          levels: [
            { id: 'level-1', label: 'Level 1', status: 'now', releaseNote: 'Now note', scopeIds: [] },
          ],
          children: [],
        },
        {
          id: 'node-2',
          label: 'Next Item',
          shortName: 'NXT',
          status: 'next',
          segmentId: 'segment-frontend',
          levels: [
            { id: 'level-2', label: 'Level 1', status: 'next', releaseNote: 'Next note', scopeIds: [] },
          ],
          children: [],
        },
        {
          id: 'node-3',
          label: 'Later Item',
          shortName: 'LTR',
          status: 'later',
          segmentId: 'segment-frontend',
          levels: [
            { id: 'level-3', label: 'Level 1', status: 'later', releaseNote: 'Later note', scopeIds: [] },
          ],
          children: [],
        },
      ],
    }

    const html = buildHtmlExportDocument({
      svgMarkup: '<svg viewBox="0 0 100 100"></svg>',
      roadmapDocument: document,
      styleText: '',
      selectedReleaseNoteStatuses: ['next'],
    })

    expect(html).toContain('<strong>Next Item (NXT)</strong>')
    expect(html).toContain('<div class="html-export__note-markdown"><p>Next note</p></div>')
    expect(html).not.toContain('<div class="html-export__note-markdown"><p>Now note</p></div>')
    expect(html).not.toContain('<div class="html-export__note-markdown"><p>Later note</p></div>')
  })

  it('omits level labels and status subtitles in release notes', () => {
    const singleLevelDocument = createDocument()
    const singleLevelHtml = buildHtmlExportDocument({
      svgMarkup: '<svg viewBox="0 0 100 100"></svg>',
      roadmapDocument: singleLevelDocument,
      styleText: '',
      title: 'Skill Tree Viewer',
    })

    expect(singleLevelHtml).not.toContain('<div class="html-export__note-meta">')
    expect(singleLevelHtml).not.toContain('Level 1 · Now')

    const multiLevelDocument = createDocument()
    multiLevelDocument.children[0].levels.push({
      id: 'level-2',
      label: 'Level 2',
      status: 'now',
      releaseNote: 'Follow-up release note.',
    })

    const multiLevelHtml = buildHtmlExportDocument({
      svgMarkup: '<svg viewBox="0 0 100 100"></svg>',
      roadmapDocument: multiLevelDocument,
      styleText: '',
      title: 'Skill Tree Viewer',
    })

    expect(multiLevelHtml).not.toContain('Level 1 · Now')
    expect(multiLevelHtml).not.toContain('Level 2 · Now')
  })

  it('renders builder-like very-close node details and scope metadata into the export payload', () => {
    const document = createDocument()
    const html = buildHtmlExportDocument({
      svgMarkup: '<svg viewBox="0 0 100 100"></svg>',
      roadmapDocument: document,
      styleText: '',
    })

    expect(html).toContain('renderVeryCloseContent')
    expect(html).toContain('skill-node-inner-chip--scope')
    expect(html).toContain('buildNodeChipsHtml')
    expect(html).toContain('bindVeryCloseTabs')
  })

  it('keeps the center icon image responsive to the builder-provided size in html exports', () => {
    const document = createDocument()
    const html = buildHtmlExportDocument({
      svgMarkup: '<svg viewBox="0 0 100 100"><g class="skill-tree-center-icon" data-center-icon-size="173"><foreignObject class="skill-tree-center-icon__foreign" x="-86.5" y="-86.5" width="173" height="173"><img class="skill-tree-center-icon__image" src="/icon.svg" /></foreignObject></g></svg>',
      roadmapDocument: document,
      styleText: '',
    })

    expect(html).toContain('.html-export__tree-shell img.skill-tree-center-icon__image {')
    expect(html).toContain('width: 100%;')
    expect(html).toContain('height: 100%;')
  })

  it('keeps the export viewer crisp by resizing the svg instead of scaling the entire canvas layer', () => {
    const document = createDocument()
    const html = buildHtmlExportDocument({
      svgMarkup: '<svg viewBox="0 0 100 100"></svg>',
      roadmapDocument: document,
      styleText: '',
    })

    expect(html).not.toContain('will-change: transform;')
    expect(html).not.toContain("scale(' + panZoomState.scale + ')")
    expect(html).toContain("const snappedTranslateX = snapToDevicePixel(panZoomState.translateX)")
    expect(html).toContain("treeCanvas.style.transform = 'translate(' + snappedTranslateX + 'px, ' + snappedTranslateY + 'px)'")
    expect(html).toContain("svgRoot.style.width = String(baseWidth * panZoomState.scale) + 'px'")
    expect(html).toContain("svgRoot.style.height = String(baseHeight * panZoomState.scale) + 'px'")
  })

  it('renders a status summary ordered by the selected export sort mode', () => {
    const document = {
      ...createDocument(),
      statusSummary: {
        sortMode: 'manual',
        manualOrderByStatus: {
          now: ['node-b', 'node-a'],
        },
      },
      children: [
        {
          id: 'node-a',
          label: 'Alpha Feature',
          shortName: 'ALP',
          status: 'now',
          segmentId: 'segment-frontend',
          levels: [{ id: 'level-a', label: 'Level 1', status: 'now', releaseNote: '', scopeIds: [] }],
          children: [],
        },
        {
          id: 'node-b',
          label: 'Beta Feature',
          shortName: 'BET',
          status: 'now',
          segmentId: 'segment-frontend',
          levels: [{ id: 'level-b', label: 'Level 1', status: 'now', releaseNote: '', scopeIds: [] }],
          children: [],
        },
      ],
    }

    const manualHtml = buildHtmlExportDocument({
      svgMarkup: '<svg viewBox="0 0 100 100"></svg>',
      roadmapDocument: document,
      styleText: '',
      statusSummarySortMode: 'manual',
    })

    expect(manualHtml).toContain('Status Summary')
    expect(manualHtml.indexOf('Beta Feature')).toBeLessThan(manualHtml.indexOf('Alpha Feature'))

    const nameHtml = buildHtmlExportDocument({
      svgMarkup: '<svg viewBox="0 0 100 100"></svg>',
      roadmapDocument: document,
      styleText: '',
      statusSummarySortMode: 'name',
    })

    expect(nameHtml.indexOf('Alpha Feature')).toBeLessThan(nameHtml.indexOf('Beta Feature'))
  })

  it('extracts and reads embedded document payload from exported html', () => {
    const document = createDocument()
    const html = buildHtmlExportDocument({
      svgMarkup: '<svg viewBox="0 0 100 100"></svg>',
      roadmapDocument: document,
      styleText: '',
    })

    const extracted = extractDocumentPayloadFromHtml(html)
    expect(extracted.ok).toBe(true)
    expect(extracted.value).toEqual(document)
    expect(readDocumentFromHtmlText(html)).toEqual(document)
  })

  it('preserves extended UI data in the embedded export payload', () => {
    const document = {
      ...createDocument(),
      centerIconSrc: 'data:image/svg+xml;utf8,<svg></svg>',
      releases: [{
        id: 'release-a',
        name: 'Release A',
        motto: 'Alpha',
        introduction: 'Intro A',
        date: '2026-07-01',
        storyPointBudget: 21,
        notesMarkdown: '- Add specific nodes\n- Validate exports',
        notesChecked: { '1:Validate exports': true },
      }],
    }
    document.children[0].levels[0].hasOpenPoints = true
    document.children[0].levels[0].openPointsLabel = 'Need rollout owner'

    const html = buildHtmlExportDocument({
      svgMarkup: '<svg viewBox="0 0 100 100"></svg>',
      roadmapDocument: document,
      styleText: '',
      selectedReleaseIds: ['release-a'],
    })

    const extracted = extractDocumentPayloadFromHtml(html)
    expect(extracted.ok).toBe(true)
    expect(extracted.value.centerIconSrc).toBe(document.centerIconSrc)
    expect(extracted.value.releases[0].notesMarkdown).toBe('- Add specific nodes\n- Validate exports')
    expect(extracted.value.releases[0].notesChecked).toEqual({ '1:Validate exports': true })
    expect(extracted.value.children[0].levels[0].hasOpenPoints).toBe(true)
    expect(extracted.value.children[0].levels[0].openPointsLabel).toBe('Need rollout owner')
  })

  it('preserves scope colors and scope group labels across html export/import', () => {
    const document = {
      ...createDocument(),
      scopes: [
        { id: 'scope-frontend', label: 'Frontend', color: '#6366F1' },
        { id: 'scope-platform', label: 'Platform', color: '#16a34a' },
      ],
      scopeGroups: [
        { color: '#6366f1', label: 'Product' },
        { color: '#16a34a', label: 'Engineering' },
      ],
    }

    const html = buildHtmlExportDocument({
      svgMarkup: '<svg viewBox="0 0 100 100"></svg>',
      roadmapDocument: document,
      styleText: '',
    })

    const imported = readDocumentFromHtmlText(html)

    expect(imported.scopes).toEqual([
      { id: 'scope-frontend', label: 'Frontend', color: '#6366F1' },
      { id: 'scope-platform', label: 'Platform', color: '#16a34a' },
    ])
    expect(imported.scopeGroups).toEqual([
      { color: '#6366f1', label: 'Product' },
      { color: '#16a34a', label: 'Engineering' },
    ])
  })

  it('rejects html without embedded export payload', () => {
    const result = extractDocumentPayloadFromHtml('<html><body>Missing data</body></html>')

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/Export HTML/)
  })

  it('rejects non-html content early', () => {
    const result = extractDocumentPayloadFromHtml('{"schemaVersion":1}')

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/valid HTML document/)
  })

  it('exports only selected releases when release ids are provided', () => {
    const document = {
      systemName: 'Release Filter Demo',
      releases: [
        { id: 'release-a', name: 'Release A', motto: 'A', introduction: 'Intro A', date: '2026-07-01', storyPointBudget: null },
        { id: 'release-b', name: 'Release B', motto: 'B', introduction: 'Intro B', date: '2026-08-01', storyPointBudget: null },
      ],
      segments: [{ id: 'segment-1', label: 'Segment 1' }],
      scopes: [],
      children: [
        {
          id: 'node-1',
          label: 'Node 1',
          shortName: 'N1',
          segmentId: 'segment-1',
          levels: [
            {
              id: 'level-1',
              label: 'Level 1',
              statuses: {
                'release-a': 'now',
                'release-b': 'later',
              },
              releaseNote: 'Release note for selected release.',
              scopeIds: [],
            },
          ],
          children: [],
        },
      ],
    }

    const html = buildHtmlExportDocument({
      svgMarkup: '<svg viewBox="0 0 100 100"></svg>',
      roadmapDocument: document,
      styleText: '',
      selectedReleaseIds: ['release-a'],
    })

    expect(html).toContain('Release A')
    expect(html).not.toContain('Release B')

    const extracted = extractDocumentPayloadFromHtml(html)
    expect(extracted.ok).toBe(true)
    expect(extracted.value.releases).toEqual([
      { id: 'release-a', name: 'Release A', motto: 'A', introduction: 'Intro A', date: '2026-07-01', storyPointBudget: null },
    ])
    const statuses = extracted.value.children[0].levels[0].statuses
    expect(statuses).toEqual({ 'release-a': 'now' })
  })
})
