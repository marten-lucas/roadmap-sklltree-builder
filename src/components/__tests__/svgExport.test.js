import { describe, expect, it, vi } from 'vitest'
import { normalizeSvgMarkup, serializeSvgElementForExport, splitIntoLines } from '../utils/svgExport'

class MockElement {
  constructor(tagName) {
    this.tagName = tagName
    this.attributes = new Map()
    this.children = []
    this.textContent = ''
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value))
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null
  }

  removeAttribute(name) {
    this.attributes.delete(name)
  }

  appendChild(child) {
    this.children.push(child)
    return child
  }

  insertBefore(child, beforeChild) {
    if (!beforeChild) {
      this.children.unshift(child)
      return child
    }

    const index = this.children.indexOf(beforeChild)
    if (index === -1) {
      this.children.push(child)
    } else {
      this.children.splice(index, 0, child)
    }

    return child
  }

  cloneNode(deep = false) {
    const clone = new MockElement(this.tagName)
    for (const [name, value] of this.attributes.entries()) {
      clone.setAttribute(name, value)
    }
    clone.textContent = this.textContent

    if (deep) {
      this.children.forEach((child) => {
        clone.appendChild(child.cloneNode(true))
      })
    }

    return clone
  }

  querySelector(selector) {
    if (selector === 'defs') {
      return this.children.find((child) => child.tagName === 'defs') ?? null
    }

    return null
  }

  querySelectorAll(selector) {
    if (selector === 'foreignObject.skill-node-export-anchor') {
      return this.children.filter((child) => child.tagName === 'foreignObject' && child.attributes.has('class') && child.attributes.get('class').includes('skill-node-export-anchor'))
    }

    if (selector === 'style') {
      return this.children.filter((child) => child.tagName === 'style')
    }

    return []
  }

  get firstChild() {
    return this.children[0] ?? null
  }

  get outerHTML() {
    const attrs = Array.from(this.attributes.entries())
      .map(([name, value]) => ` ${name}="${value}"`)
      .join('')
    const children = this.children.map((child) => child.outerHTML).join('')
    const text = this.textContent || ''
    return `<${this.tagName}${attrs}>${text}${children}</${this.tagName}>`
  }
}

const installSvgDomShim = () => {
  const documentShim = {
    createElementNS: (_namespace, tagName) => new MockElement(tagName),
  }

  class XMLSerializerShim {
    serializeToString(node) {
      return node.outerHTML
    }
  }

  vi.stubGlobal('document', documentShim)
  vi.stubGlobal('XMLSerializer', XMLSerializerShim)
}

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

  it('injects export tooltip markup with builder-like tooltip classes', () => {
    installSvgDomShim()

    const svg = new MockElement('svg')
    const foreignObject = new MockElement('foreignObject')

    foreignObject.setAttribute('class', 'skill-node-export-anchor')
    foreignObject.setAttribute('x', '10')
    foreignObject.setAttribute('y', '20')
    foreignObject.setAttribute('width', '120')
    foreignObject.setAttribute('height', '120')
    foreignObject.setAttribute('data-node-id', 'node-1')
    foreignObject.setAttribute('data-export-label', 'React Platform')
    foreignObject.setAttribute('data-export-note', 'Now is **live**')
    svg.appendChild(foreignObject)

    const serialized = serializeSvgElementForExport(svg)

    expect(serialized).toContain('skill-node-tooltip-layer')
    expect(serialized).toContain('skill-node-tooltip-trigger')
    expect(serialized).toContain('skill-node-tooltip')
    expect(serialized).toContain('skill-node-tooltip__title')
    expect(serialized).toContain('skill-node-tooltip__note')
  })

  it('renders markdown headings inside tooltip notes', () => {
    installSvgDomShim()

    const svg = new MockElement('svg')
    const foreignObject = new MockElement('foreignObject')

    foreignObject.setAttribute('class', 'skill-node-export-anchor')
    foreignObject.setAttribute('x', '10')
    foreignObject.setAttribute('y', '20')
    foreignObject.setAttribute('width', '120')
    foreignObject.setAttribute('height', '120')
    foreignObject.setAttribute('data-node-id', 'node-1')
    foreignObject.setAttribute('data-export-label', 'React Platform')
    foreignObject.setAttribute('data-export-note', '# Release Impact\nRollout is live.')
    svg.appendChild(foreignObject)

    const serialized = serializeSvgElementForExport(svg)

    expect(serialized).toContain('skill-node-tooltip__heading')
    expect(serialized).toContain('Release Impact')
  })
})
