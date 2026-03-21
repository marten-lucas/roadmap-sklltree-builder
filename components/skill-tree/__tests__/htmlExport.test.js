import { describe, expect, it } from 'vitest'
import {
  HTML_EXPORT_DATA_SCRIPT_ID,
  buildHtmlExportDocument,
  extractDocumentPayloadFromHtml,
  readDocumentFromHtmlText,
} from '../htmlExport'

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
    })

    expect(html).toContain('Skill Tree Viewer')
    expect(html).toContain('Skilltree')
    expect(html).toContain('Release Notes')
    expect(html).toContain('<svg viewBox="0 0 100 100"></svg>')
    expect(html).toContain(`id="${HTML_EXPORT_DATA_SCRIPT_ID}"`)
    expect(html).toContain('PDF drucken')
    expect(html).toContain('SVG herunterladen')
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
    expect(result.error).toMatch(/Skilltree-Daten/)
  })
})
