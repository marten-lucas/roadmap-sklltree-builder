import { describe, expect, it } from 'vitest'
import {
  HTML_EXPORT_DATA_SCRIPT_ID,
  buildHtmlExportDocument,
  extractDocumentPayloadFromHtml,
  readDocumentFromHtmlText,
} from '../utils/htmlExport'

const createDocument = () => ({
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
        { id: 'level-1', label: 'Level 1', status: 'now', releaseNote: 'Rollout fuer die neue Plattform laeuft.' },
      ],
      children: [],
    },
  ],
})

describe('htmlExport', () => {
  it('builds standalone html with tabs and embedded document payload', () => {
    const document = createDocument()
    const html = buildHtmlExportDocument({
      svgMarkup: '<svg viewBox="0 0 100 100"></svg>',
      roadmapDocument: document,
      styleText: '.skill-tree-canvas { color: red; }',
      title: 'Skill Tree Viewer',
      metadata: {
        brandName: 'Roadmap Studio',
        author: 'QA Team',
      },
    })

    expect(html).toContain('Skill Tree Viewer')
    expect(html).toContain('Skilltree')
    expect(html).toContain('Release Notes')
    expect(html).toContain('<svg viewBox="0 0 100 100"></svg>')
    expect(html).toContain(`id="${HTML_EXPORT_DATA_SCRIPT_ID}"`)
    expect(html).toContain('PDF drucken')
    expect(html).toContain('SVG herunterladen')
    expect(html).toContain('SVG clean')
    expect(html).toContain('Roadmap Studio')
    expect(html).toContain('Autor: QA Team')
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
