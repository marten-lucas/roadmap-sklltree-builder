import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readDocumentFromCsvText, serializeDocumentToCsv } from '../utils/csv'

const createDocument = () => ({
  segments: [
    { id: 'segment-frontend', label: 'Frontend' },
    { id: 'segment-backend', label: 'Backend' },
  ],
  scopes: [
    { id: 'scope-alpha', label: 'Alpha' },
    { id: 'scope-beta', label: 'Beta' },
    { id: 'scope-gamma', label: 'Gamma' },
  ],
  children: [
    {
      id: 'node-alpha',
      label: 'Alpha Root',
      shortName: 'ALP',
      status: 'now',
      ebene: 1,
      segmentId: 'segment-frontend',
      levels: [
        {
          id: 'level-alpha-1',
          label: 'Level 1',
          status: 'now',
          releaseNote: '# Alpha Root\nIntro line',
          scopeIds: ['scope-alpha'],
        },
        {
          id: 'level-alpha-2',
          label: 'Level 2',
          status: 'next',
          releaseNote: 'Follow-up with comma, newline\nand more.',
          scopeIds: ['scope-beta', 'scope-gamma'],
        },
      ],
      additionalDependencyIds: [],
      additionalDependentIds: [],
      children: [
        {
          id: 'node-bravo',
          label: 'Bravo Child',
          shortName: 'BRA',
          status: 'later',
          ebene: 2,
          segmentId: 'segment-frontend',
          levels: [
            {
              id: 'level-bravo-1',
              label: 'Level 1',
              status: 'later',
              releaseNote: 'Bravo note',
              scopeIds: ['scope-beta'],
            },
          ],
          additionalDependencyIds: [],
          additionalDependentIds: [],
          children: [],
        },
      ],
    },
    {
      id: 'node-omega',
      label: 'Omega Root',
      shortName: 'OMG',
      status: 'done',
      ebene: 1,
      segmentId: 'segment-backend',
      levels: [
        {
          id: 'level-omega-1',
          label: 'Level 1',
          status: 'done',
          releaseNote: 'Omega note',
          scopeIds: [],
        },
      ],
      additionalDependencyIds: [],
      additionalDependentIds: [],
      children: [
        {
          id: 'node-sierra',
          label: 'Sierra Child',
          shortName: 'SIE',
          status: 'now',
          ebene: 2,
          segmentId: 'segment-backend',
          levels: [
            {
              id: 'level-sierra-1',
              label: 'Level 1',
              status: 'now',
              releaseNote: 'Sierra note',
              scopeIds: ['scope-gamma'],
            },
          ],
          additionalDependencyIds: ['node-bravo'],
          additionalDependentIds: [],
          children: [],
        },
      ],
    },
  ],
})

const normalizeCsv = (csvText) => csvText.replace(/\r\n/g, '\n').trim()

const findNodeByShortName = (nodes, shortName) => {
  for (const node of nodes ?? []) {
    if (node.shortName === shortName) {
      return node
    }

    const childMatch = findNodeByShortName(node.children, shortName)
    if (childMatch) {
      return childMatch
    }
  }

  return null
}

describe('csv', () => {
  it('roundtrips a document through CSV export and import', () => {
    const document = createDocument()
    const csv = serializeDocumentToCsv(document)
    expect(csv).toContain('ShortName,Name,Scope,Ebene,Segment,Parent,AdditionalDependency,ProgressLevel,Status,ReleaseNotes')
    expect(csv).toContain('"# Alpha Root')
    expect(csv).toContain('"Follow-up with comma, newline')

    const imported = readDocumentFromCsvText(csv)
    const reexported = serializeDocumentToCsv(imported)

    expect(normalizeCsv(reexported)).toBe(normalizeCsv(csv))
  })

  it('imports CSV even when columns are reordered', () => {
    const csv = [
      'Status,ReleaseNotes,ShortName,Name,Segment,Parent,Scope,Ebene,ProgressLevel,AdditionalDependency',
      'now,"# Root note\nSecond line",ROOT,Root,Core,,Alpha,1,1,',
      'later,"Child note",CHD,Child,Core,ROOT,"Alpha, Beta",2,1,',
    ].join('\n')

    const document = readDocumentFromCsvText(csv)

    expect(document.segments).toHaveLength(1)
    expect(document.segments[0].label).toBe('Core')
    expect(document.segments[0].id).toEqual(expect.any(String))
    expect(document.children).toHaveLength(1)
    expect(document.children[0].shortName).toBe('ROOT')
    expect(document.children[0].levels[0].releaseNote).toBe('# Root note\nSecond line')
    expect(document.children[0].children[0].shortName).toBe('CHD')
    expect(document.children[0].children[0].levels[0].scopeIds).toHaveLength(2)
  })

  it('returns a list of CSV validation problems', () => {
    const csv = [
      'ShortName,Name,Scope,Ebene,Segment,Parent,AdditionalDependency,ProgressLevel,Status,ReleaseNotes',
      'ROOT,Root,,1,Core,,,1,wat,"Bad note"',
      'CH1,Child 1,,2,Core,MISSING,ROOT,1,now,"Child note"',
      'CH2,Child 2,,2,Core,ROOT,UNKNOWN,1,next,"Child note"',
    ].join('\n')

    try {
      readDocumentFromCsvText(csv)
      throw new Error('Expected CSV import to fail')
    } catch (error) {
      expect(error.message).toContain('CSV-Import fehlgeschlagen')
      expect(error.message).toContain('Status ist ungueltig')
      expect(error.message).toContain('unbekannten Parent MISSING')
      expect(error.message).toContain('unbekannte AdditionalDependency UNKNOWN')
      expect(error.message.split('\n- ').length).toBeGreaterThan(2)
    }
  })

  it('accepts CSV rows with manually increased Ebenen', () => {
    const csvPath = resolve(process.cwd(), 'tests/e2e/datasets/minimal.csv')
    const csv = readFileSync(csvPath, 'utf8')

    const document = readDocumentFromCsvText(csv)
    const docsNode = findNodeByShortName(document.children, 'DOC')

    expect(docsNode).toBeDefined()
    expect(docsNode.ebene).toBe(4)
    expect(docsNode.levels).toHaveLength(1)
    expect(docsNode.levels[0].releaseNote).toContain('Docs include a short paragraph')
  })
})
