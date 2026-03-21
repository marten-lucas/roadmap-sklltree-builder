import { describe, expect, it } from 'vitest'
import { buildPdfExportHtml, collectReleaseNoteEntries } from '../pdfExport'

const createDocument = () => ({
  segments: [
    { id: 'segment-frontend', label: 'Frontend' },
    { id: 'segment-backend', label: 'Backend' },
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
        { id: 'level-2', label: 'Level 2', status: 'next', releaseNote: '' },
      ],
      children: [],
    },
    {
      id: 'node-2',
      label: 'API Design',
      shortName: 'API',
      status: 'next',
      segmentId: 'segment-backend',
      levels: [
        { id: 'level-a', label: 'Level 1', status: 'next', releaseNote: 'Neue Schnittstellen werden mit Pilotkunden abgestimmt.' },
      ],
      children: [],
    },
  ],
})

describe('pdfExport', () => {
  it('collects release note entries from nodes and levels', () => {
    const entries = collectReleaseNoteEntries(createDocument())

    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({
      segmentLabel: 'Backend',
      nodeLabel: 'API Design',
      shortName: 'API',
      statusLabel: 'Next',
    })
    expect(entries[1]).toMatchObject({
      segmentLabel: 'Frontend',
      nodeLabel: 'React Platform',
      shortName: 'RCT',
      statusLabel: 'Now',
    })
  })

  it('builds a printable html document with roadmap and release notes pages', () => {
    const html = buildPdfExportHtml({
      svgMarkup: '<svg viewBox="0 0 100 100"></svg>',
      releaseNoteEntries: collectReleaseNoteEntries(createDocument()),
      styleText: '.skill-tree-canvas { color: red; }',
      title: 'Roadmap Export',
    })

    expect(html).toContain('Roadmap Export')
    expect(html).toContain('Release Notes')
    expect(html).toContain('<svg viewBox="0 0 100 100"></svg>')
    expect(html).toContain('React Platform')
    expect(html).toContain('API Design')
    expect(html).toContain('window.print()')
  })
})
