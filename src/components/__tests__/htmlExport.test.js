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
  children: [
    {
      id: 'node-1',
      label: 'React Platform',
      shortName: 'RCT',
      status: 'now',
      segmentId: 'segment-frontend',
      levels: [
        { id: 'level-1', label: 'Level 1', status: 'now', releaseNote: '## Release Impact\nRollout fuer die neue Plattform laeuft. **Now** is live.' },
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
    expect(html).toContain('PDF')
    expect(html).toContain('SVG interaktiv')
    expect(html).toContain('SVG clean')
    expect(html).toContain('html-export__panel--roadmap')
    expect(html).toContain('height: 50vh;')
    expect(html).toContain('background: #000000;')
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

  it('rejects html without embedded export payload', () => {
    const result = extractDocumentPayloadFromHtml('<html><body>Missing data</body></html>')

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/HTML exportieren/)
  })

  it('rejects non-html content early', () => {
    const result = extractDocumentPayloadFromHtml('{"schemaVersion":1}')

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/kein gueltiges HTML/)
  })
})
