import { describe, expect, it } from 'vitest'
import { normalizeSvgMarkup, splitIntoLines } from '../svgExport'

describe('svgExport', () => {
  it('returns null for empty markup', () => {
    expect(normalizeSvgMarkup('')).toBeNull()
    expect(normalizeSvgMarkup('   ')).toBeNull()
  })

  it('returns null for non-svg markup', () => {
    expect(normalizeSvgMarkup('<div>nope</div>')).toBeNull()
  })

  it('adds xml prefix and namespaces when missing', () => {
    const normalized = normalizeSvgMarkup('<svg viewBox="0 0 10 10"></svg>')

    expect(normalized).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/)
    expect(normalized).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(normalized).toContain('xmlns:xlink="http://www.w3.org/1999/xlink"')
  })

  it('keeps existing namespaces and xml declaration', () => {
    const raw = '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"></svg>'
    const normalized = normalizeSvgMarkup(raw)

    expect(normalized).toBe(raw)
  })

  it('splits long tooltip notes into capped lines', () => {
    const lines = splitIntoLines('Dies ist ein sehr langer Text fuer Tooltips im SVG Export und sollte auf mehrere Zeilen verteilt werden', 18, 3)

    expect(lines.length).toBeLessThanOrEqual(3)
    expect(lines.length).toBeGreaterThan(1)
    expect(lines[lines.length - 1]).toMatch(/…|werden$/)
  })
})
