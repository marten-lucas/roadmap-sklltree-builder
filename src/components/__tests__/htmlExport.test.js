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
    expect(html).toContain('width: 156px;')
    expect(html).toContain('max-width: none;')
    expect(html).toContain('aria-label="Filter"')
    expect(html).not.toContain('Visualisierung')
    expect(html).not.toContain('html-export__section-title')
    expect(html).toContain('The introduction uses <strong>markdown</strong>')
    expect(html).toContain('Rollout fuer die neue Plattform laeuft.')
    expect(html).toContain('<strong>Now</strong> is live')
    expect(html).toContain('<h1>Release Overview</h1>')
    expect(html).toContain('<h2>Release Impact</h2>')
    expect(html).toContain('origButtonWidth')
    expect(html).toContain('applyInnerSize')
    expect(html).toContain('const getOccupiedBounds = () =>')
    expect(html).toContain('let contentGroupBounds = null')
    expect(html).toContain('const getVisibleViewportBounds = () =>')
    expect(html).toContain('window.htmlToImage?.toBlob')
  })

  it('omits level labels for single-level release notes and keeps them for multi-level nodes', () => {
    const singleLevelDocument = createDocument()
    const singleLevelHtml = buildHtmlExportDocument({
      svgMarkup: '<svg viewBox="0 0 100 100"></svg>',
      roadmapDocument: singleLevelDocument,
      styleText: '',
      title: 'Skill Tree Viewer',
    })

    expect(singleLevelHtml).toContain('<span>Now</span>')
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

    expect(multiLevelHtml).toContain('Level 1 · Now')
    expect(multiLevelHtml).toContain('Level 2 · Now')
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
