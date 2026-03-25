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

    if (selector.startsWith('.')) {
      const className = selector.slice(1)
      return this.children.filter((child) => child.attributes.has('class') && child.attributes.get('class').includes(className))
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

  it('uses builder-like tooltip colors, font and sizing', () => {
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
    foreignObject.setAttribute('data-export-note', 'Now is live')
    svg.appendChild(foreignObject)

    const serialized = serializeSvgElementForExport(svg)

    expect(serialized).toContain('rgba(2, 6, 23, 0.96)')
    expect(serialized).toContain('rgba(56, 189, 248, 0.25)')
    expect(serialized).toContain('filter: drop-shadow(0 18px 40px rgba(2, 6, 23, 0.45))')
    expect(serialized).toContain('font-family: "Space Grotesk", "Rajdhani", sans-serif')
    expect(serialized).toContain('font-size: 13px')
    expect(serialized).toContain('font-size: 12px')
    expect(serialized).toContain('height="62"')
  })

  it('keeps the center icon inside the exported viewport', () => {
    installSvgDomShim()

    const svg = new MockElement('svg')

    const centerIcon = new MockElement('g')
    centerIcon.setAttribute('class', 'skill-tree-center-icon')
    centerIcon.setAttribute('transform', 'translate(500, 500)')
    centerIcon.getBBox = () => ({ x: 500, y: 500, width: 120, height: 120 })
    svg.appendChild(centerIcon)

    const foreignObject = new MockElement('foreignObject')
    foreignObject.setAttribute('class', 'skill-node-export-anchor')
    foreignObject.setAttribute('x', '1000')
    foreignObject.setAttribute('y', '1200')
    foreignObject.setAttribute('width', '120')
    foreignObject.setAttribute('height', '120')
    svg.appendChild(foreignObject)

    const serialized = serializeSvgElementForExport(svg, { includeTooltips: false })

    expect(serialized).toContain('skill-tree-center-icon')
    expect(serialized).toContain('viewBox="404 404 812 1012"')
  })

  it('sizes the export viewport to the occupied content bounds', () => {
    installSvgDomShim()

    const svg = new MockElement('svg')
    svg.getBBox = () => ({ x: 0, y: 0, width: 7564, height: 7564 })

    const foreignObject = new MockElement('foreignObject')
    foreignObject.setAttribute('class', 'skill-node-export-anchor')
    foreignObject.setAttribute('x', '100')
    foreignObject.setAttribute('y', '200')
    foreignObject.setAttribute('width', '400')
    foreignObject.setAttribute('height', '300')
    foreignObject.setAttribute('data-node-id', 'node-1')
    foreignObject.setAttribute('data-export-label', 'React Platform')
    foreignObject.setAttribute('data-export-note', 'Now is **live**')
    foreignObject.getBBox = () => ({ x: 100, y: 200, width: 400, height: 300 })
    svg.appendChild(foreignObject)

    const serialized = serializeSvgElementForExport(svg)

    expect(serialized).toContain('viewBox="4 104 592 492"')
    expect(serialized).toContain('width="592"')
    expect(serialized).toContain('height="492"')
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

  it('embeds source styles when exporting a standalone svg', () => {
    installSvgDomShim()

    const svg = new MockElement('svg')
    const foreignObject = new MockElement('foreignObject')

    foreignObject.setAttribute('class', 'skill-node-export-anchor')
    foreignObject.setAttribute('x', '10')
    foreignObject.setAttribute('y', '20')
    foreignObject.setAttribute('width', '120')
    foreignObject.setAttribute('height', '120')
    svg.appendChild(foreignObject)

    const sourceDocument = {
      styleSheets: [
        {
          cssRules: [
            { cssText: '.skill-node-button { background: red; }' },
            { cssText: '.skill-tree-canvas { display: block; }' },
          ],
        },
      ],
    }

    const serialized = serializeSvgElementForExport(svg, {
      embedStyles: true,
      sourceDocument,
    })

    expect(serialized).toContain('.skill-node-button { background: red; }')
    expect(serialized).toContain('.skill-tree-canvas { display: block; }')
  })

  it('uses the builder tooltip font stack for exported text', () => {
    installSvgDomShim()

    const svg = new MockElement('svg')
    const foreignObject = new MockElement('foreignObject')

    foreignObject.setAttribute('class', 'skill-node-export-anchor')
    foreignObject.setAttribute('x', '10')
    foreignObject.setAttribute('y', '20')
    foreignObject.setAttribute('width', '120')
    foreignObject.setAttribute('height', '120')
    svg.appendChild(foreignObject)

    const serialized = serializeSvgElementForExport(svg, { includeTooltips: true })

    expect(serialized).toContain('"Space Grotesk", "Rajdhani", sans-serif')
  })
})
