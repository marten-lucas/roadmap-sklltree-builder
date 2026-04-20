import { describe, expect, it, vi } from 'vitest'
import { buildPdfExportHtml, collectReleaseNoteEntries, tryExportPdfFromSkillTree } from '../utils/pdfExport'

const createDocument = () => ({
  systemName: 'myKyana',
  release: {
    name: 'July 2026 Release',
    motto: 'Reich & Schön',
    introduction: '# Release Overview\nIntro with **markdown**.',
    voiceOfCustomer: '"This finally saves me hours every week."',
    fictionalCustomerName: 'Alex Example',
    date: '2026-07-01',
  },
  segments: [
    { id: 'segment-frontend', label: 'Frontend' },
    { id: 'segment-backend', label: 'Backend' },
  ],
  scopes: [
    { id: 'scope-frontend', label: 'Frontend' },
    { id: 'scope-platform', label: 'Platform' },
    { id: 'scope-backend', label: 'Backend' },
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
      scopeLabels: [
        { label: 'Frontend', color: null },
        { label: 'Platform', color: null },
      ],
    })
  })

  it('can collect release note entries for selected statuses', () => {
    const entries = collectReleaseNoteEntries(createDocument(), null, ['next'])

    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      nodeLabel: 'API Design',
      statusLabel: 'Next',
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
    expect(html).toContain('printed.css')
    expect(html).toContain('@page')
    expect(html).toContain('pdf-export__note-layout')
    expect(html).toContain('pdf-export__note-aside')
    expect(html).toContain('Frontend')
    expect(html).toContain('Platform')
    expect(html).toContain('<h1>Release Overview</h1>')
    expect(html).toContain('<h2>Release Impact</h2>')
    expect(html).toContain('Voice of Customer')
    expect(html).toContain('This finally saves me hours every week.')
    expect(html).toContain('Alex Example')
    expect(html).toContain('window.print()')
  })

  it('renders the status summary in the selected order for PDF export', () => {
    const document = {
      ...createDocument(),
      statusSummary: {
        sortMode: 'manual',
        manualOrderByStatus: {
          next: ['node-2', 'node-1'],
        },
      },
      children: [
        {
          id: 'node-1',
          label: 'Zeta Feature',
          shortName: 'ZET',
          status: 'next',
          segmentId: 'segment-frontend',
          levels: [{ id: 'level-1', label: 'Level 1', status: 'next', releaseNote: 'A' }],
          children: [],
        },
        {
          id: 'node-2',
          label: 'Alpha Feature',
          shortName: 'ALP',
          status: 'next',
          segmentId: 'segment-backend',
          levels: [{ id: 'level-2', label: 'Level 1', status: 'next', releaseNote: 'B' }],
          children: [],
        },
      ],
    }

    const html = buildPdfExportHtml({
      svgMarkup: '<svg viewBox="0 0 100 100"></svg>',
      releaseNoteEntries: collectReleaseNoteEntries(document, null, ['next']),
      introductionMarkdown: '',
      styleText: '',
      roadmapDocument: document,
      releaseMeta: document.release,
      statusSummarySortMode: 'manual',
    })

    expect(html).toContain('Status Summary')
    expect(html.indexOf('Alpha Feature')).toBeLessThan(html.indexOf('Zeta Feature'))
  })

  it('opens the PDF export in a blob-backed popup instead of writing to a blank tab', () => {
    const openSpy = vi.fn(() => ({ closed: false }))
    const createObjectUrlSpy = vi.fn(() => 'blob:pdf-export')
    const revokeObjectUrlSpy = vi.fn()
    const windowShim = {
      document: { styleSheets: [] },
      setTimeout: (callback) => {
        callback()
        return 1
      },
      open: openSpy,
      URL: {
        createObjectURL: createObjectUrlSpy,
        revokeObjectURL: revokeObjectUrlSpy,
      },
    }

    vi.stubGlobal('window', windowShim)

    try {
      const result = tryExportPdfFromSkillTree({
        svgElement: {
          cloneNode: () => ({
            setAttribute: () => {},
            querySelectorAll: () => [],
            style: {},
            outerHTML: '<svg viewBox="0 0 10 10"></svg>',
          }),
        },
        roadmapDocument: createDocument(),
      })

      expect(result.ok).toBe(true)
      expect(openSpy).toHaveBeenCalledWith('blob:pdf-export', '_blank', 'noopener,noreferrer')
      expect(createObjectUrlSpy).toHaveBeenCalledTimes(1)
      expect(revokeObjectUrlSpy).toHaveBeenCalledWith('blob:pdf-export')
    } finally {
      vi.unstubAllGlobals()
      vi.restoreAllMocks()
    }
  })
})
