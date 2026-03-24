import { describe, expect, it } from 'vitest'
import { buildPdfExportHtml, collectReleaseNoteEntries } from '../utils/pdfExport'

const createDocument = () => ({
  systemName: 'myKyana',
  release: {
    name: 'July 2026 Release',
    motto: 'Reich & Schön',
    introduction: '# Release Overview\nIntro with **markdown**.',
    date: '2026-07-01',
  },
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
        { id: 'level-1', label: 'Level 1', status: 'now', releaseNote: '## Release Impact\nRollout fuer die neue Plattform laeuft. **Now** is live.' },
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

    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
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
      introductionMarkdown: createDocument().release.introduction,
      styleText: '.skill-tree-canvas { color: red; }',
      roadmapDocument: createDocument(),
    })

    expect(html).toContain('myKyana')
    expect(html).toContain('July 2026 Release')
    expect(html).toContain('Release Notes')
    expect(html).toContain('<svg viewBox="0 0 100 100"></svg>')
    expect(html).toContain('React Platform')
    expect(html).toContain('<strong>markdown</strong>')
    expect(html).toContain('<h1>Release Overview</h1>')
    expect(html).toContain('<h2>Release Impact</h2>')
    expect(html).toContain('window.print()')
  })
})
