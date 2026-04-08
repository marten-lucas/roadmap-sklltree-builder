import { describe, it, expect } from 'vitest'
import { serializeDocumentToCsv, parseDocumentFromCsvText, CSV_EXPORT_HEADERS } from '../utils/csv'
import { createEmptyDocument } from '../utils/documentState'
import { generateUUID } from '../utils/uuid'

const makeDoc = (...nodes) => {
  const doc = createEmptyDocument()
  doc.children = nodes
  return doc
}

const makeNode = (shortName, label, effort, benefit) => ({
  id: generateUUID(),
  shortName,
  label,
  status: 'later',
  levels: [{ id: generateUUID(), label: 'Level 1', status: 'later', releaseNote: '', scopeIds: [] }],
  ebene: 1,
  segmentId: null,
  additionalDependencyIds: [],
  additionalDependentIds: [],
  children: [],
  effort,
  benefit,
})

describe('CSV effort/benefit export', () => {
  it('includes Effort, EffortCustomPoints, Benefit in headers', () => {
    expect(CSV_EXPORT_HEADERS).toContain('Effort')
    expect(CSV_EXPORT_HEADERS).toContain('EffortCustomPoints')
    expect(CSV_EXPORT_HEADERS).toContain('Benefit')
  })

  it('exports effort and benefit values', () => {
    const node = makeNode('A1', 'Alpha', { size: 'm', customPoints: null }, { size: 'l' })
    const doc = makeDoc(node)
    const csv = serializeDocumentToCsv(doc)
    expect(csv).toContain('m')
    expect(csv).toContain('l')
  })

  it('exports custom effort with custom points', () => {
    const node = makeNode('B1', 'Beta', { size: 'custom', customPoints: 7 }, { size: 'xs' })
    const doc = makeDoc(node)
    const csv = serializeDocumentToCsv(doc)
    expect(csv).toContain('custom')
    expect(csv).toContain('7')
    expect(csv).toContain('xs')
  })

  it('exports unclear as "unclear"', () => {
    const node = makeNode('C1', 'Gamma', { size: 'unclear', customPoints: null }, { size: 'unclear' })
    const doc = makeDoc(node)
    const csv = serializeDocumentToCsv(doc)
    const lines = csv.split('\n')
    const dataLine = lines[1] ?? ''
    expect(dataLine).toContain('unclear')
  })

  it('leaves EffortCustomPoints empty for non-custom effort', () => {
    const node = makeNode('D1', 'Delta', { size: 'xl', customPoints: null }, { size: 's' })
    const doc = makeDoc(node)
    const csv = serializeDocumentToCsv(doc)
    // After ReleaseNotes column: Effort=xl, EffortCustomPoints=(empty), Benefit=s
    const lines = csv.split('\n')
    const headerLine = lines[0]
    const headerCols = headerLine.split(',')
    const effortIdx = headerCols.indexOf('Effort')
    const effortCPIdx = headerCols.indexOf('EffortCustomPoints')
    const benefitIdx = headerCols.indexOf('Benefit')
    const dataLine = lines[1]
    const dataCols = dataLine.split(',')
    expect(dataCols[effortIdx]).toBe('xl')
    expect(dataCols[effortCPIdx]).toBe('')
    expect(dataCols[benefitIdx]).toBe('s')
  })
})

describe('CSV effort/benefit roundtrip', () => {
  it('roundtrips named effort and benefit sizes', () => {
    const node = makeNode('R1', 'Roundtrip', { size: 'l', customPoints: null }, { size: 'm' })
    const doc = makeDoc(node)
    const csv = serializeDocumentToCsv(doc)
    const result = parseDocumentFromCsvText(csv)
    expect(result.ok).toBe(true)
    const importedNode = result.value.children[0]
    expect(importedNode.effort.size).toBe('l')
    expect(importedNode.benefit.size).toBe('m')
  })

  it('roundtrips custom effort with custom points', () => {
    const node = makeNode('R2', 'Custom', { size: 'custom', customPoints: 42 }, { size: 'xl' })
    const doc = makeDoc(node)
    const csv = serializeDocumentToCsv(doc)
    const result = parseDocumentFromCsvText(csv)
    expect(result.ok).toBe(true)
    const importedNode = result.value.children[0]
    expect(importedNode.effort.size).toBe('custom')
    expect(importedNode.effort.customPoints).toBe(42)
    expect(importedNode.benefit.size).toBe('xl')
  })

  it('roundtrips unclear effort and benefit', () => {
    const node = makeNode('R3', 'Unclear', { size: 'unclear', customPoints: null }, { size: 'unclear' })
    const doc = makeDoc(node)
    const csv = serializeDocumentToCsv(doc)
    const result = parseDocumentFromCsvText(csv)
    expect(result.ok).toBe(true)
    const importedNode = result.value.children[0]
    expect(importedNode.effort.size).toBe('unclear')
    expect(importedNode.benefit.size).toBe('unclear')
  })

  it('imports CSV without effort/benefit columns using defaults', () => {
    const csvWithoutEffortBenefit = [
      'ShortName,Name,Scope,Ebene,Segment,Parent,AdditionalDependency,ProgressLevel,Status,ReleaseNotes',
      'X1,Xray,,1,,,,,later,',
    ].join('\n')
    const result = parseDocumentFromCsvText(csvWithoutEffortBenefit)
    expect(result.ok).toBe(true)
    const importedNode = result.value.children[0]
    // No effort/benefit columns → should default to unclear
    expect(importedNode.effort?.size ?? 'unclear').toBe('unclear')
    expect(importedNode.benefit?.size ?? 'unclear').toBe('unclear')
  })

  it('roundtrips all named effort sizes correctly', () => {
    const EFFORT_SIZES = ['xs', 's', 'm', 'l', 'xl', 'unclear']
    const nodes = EFFORT_SIZES.map((size, i) =>
      makeNode(`E${i}`, `Effort ${size}`, { size, customPoints: null }, { size: 'xs' }),
    )
    const doc = makeDoc(...nodes)
    const csv = serializeDocumentToCsv(doc)
    const result = parseDocumentFromCsvText(csv)
    expect(result.ok).toBe(true)
    for (let i = 0; i < EFFORT_SIZES.length; i++) {
      expect(result.value.children[i].effort.size).toBe(EFFORT_SIZES[i])
    }
  })
})
