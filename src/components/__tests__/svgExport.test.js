import { describe, expect, it, vi } from 'vitest'
import { normalizeSvgMarkup, serializeSvgElementForExport, splitIntoLines } from '../utils/svgExport'

class MockElement {
  constructor(tagName) {
    this.tagName = tagName
    this.attributes = new Map()
    this.children = []
    this.textContent = ''
    this._innerHTML = ''
    this.parentNode = null
  }

  set innerHTML(value) {
    this._innerHTML = String(value ?? '')
    this.children = []
  }

  get innerHTML() {
    return this._innerHTML
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
    child.parentNode = this
    this.children.push(child)
    return child
  }

  insertBefore(child, beforeChild) {
    child.parentNode = this
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

  replaceChild(nextChild, previousChild) {
    const index = this.children.indexOf(previousChild)
    if (index === -1) {
      return previousChild
    }

    nextChild.parentNode = this
    previousChild.parentNode = null
    this.children.splice(index, 1, nextChild)
    return previousChild
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
    const matches = this.querySelectorAll(selector)
    return matches[0] ?? null
  }

  querySelectorAll(selector) {
    const walk = (node, visitor) => {
      for (const child of node.children ?? []) {
        visitor(child)
        walk(child, visitor)
      }
    }

    const descendants = []
    walk(this, (child) => descendants.push(child))

    if (selector === 'defs') {
      return descendants.filter((child) => child.tagName === 'defs')
    }

    if (selector === 'foreignObject.skill-node-export-anchor') {
      return descendants.filter((child) => child.tagName === 'foreignObject' && child.attributes.has('class') && child.attributes.get('class').includes('skill-node-export-anchor'))
    }

    if (selector.startsWith('.')) {
      const className = selector.slice(1)
      return descendants.filter((child) => child.attributes.has('class') && child.attributes.get('class').includes(className))
    }

    if (selector === 'style') {
      return descendants.filter((child) => child.tagName === 'style')
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
    return `<${this.tagName}${attrs}>${text}${this._innerHTML}${children}</${this.tagName}>`
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
    expect(serialized).toContain('skill-node-tooltip__panel')
    expect(serialized).toContain('skill-node-tooltip__stack')
    expect(serialized).toContain('skill-node-tooltip__card')
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
    expect(serialized).toContain('box-shadow: 0 18px 40px rgba(2, 6, 23, 0.45)')
    expect(serialized).toContain('font-family: "Space Grotesk", "Rajdhani", sans-serif')
    expect(serialized).toContain('max-width: 44rem')
    expect(serialized).toContain('text-rendering: geometricPrecision')
    expect(serialized).toContain('font-size: 1rem')
    expect(serialized).toContain('font-size: 0.98rem')
    expect(serialized).toContain('border-radius: 10px')
    expect(serialized).toContain('width="440"')
    expect(serialized).toContain('height="110"')
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

  it('embeds the default center icon as inline svg data in the exported svg', () => {
    installSvgDomShim()

    const svg = new MockElement('svg')

    const centerIcon = new MockElement('g')
    centerIcon.setAttribute('class', 'skill-tree-center-icon')
    centerIcon.setAttribute('transform', 'translate(500, 500)')

    const foreignObject = new MockElement('foreignObject')
    foreignObject.setAttribute('class', 'skill-tree-center-icon__foreign')
    foreignObject.setAttribute('x', '-78')
    foreignObject.setAttribute('y', '-78')
    foreignObject.setAttribute('width', '156')
    foreignObject.setAttribute('height', '156')

    const image = new MockElement('img')
    image.setAttribute('class', 'skill-tree-center-icon__image')
    image.setAttribute('src', 'data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D"http://www.w3.org/2000/svg"%3E%3C/svg%3E')
    foreignObject.appendChild(image)

    const hitArea = new MockElement('circle')
    hitArea.setAttribute('class', 'skill-tree-center-icon__hit-area')
    hitArea.setAttribute('r', '68')

    centerIcon.appendChild(foreignObject)
    centerIcon.appendChild(hitArea)
    svg.appendChild(centerIcon)

    const serialized = serializeSvgElementForExport(svg)

    expect(serialized).not.toContain('skill-tree-center-icon__foreign')
    expect(serialized).toContain('<image')
    expect(serialized).toContain('data:image/svg+xml')
    expect(serialized).toContain('x="-78"')
    expect(serialized).toContain('y="-78"')
    expect(serialized).toContain('width="156"')
    expect(serialized).toContain('height="156"')
    expect(serialized).toContain('r="78"')
  })

  it('sizes the export viewport from the root svg bounds', () => {
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

    expect(serialized).toContain('viewBox="0 0 7564 7564"')
    expect(serialized).toContain('width="7564"')
    expect(serialized).toContain('height="7564"')
  })

  it('prefers the root svg bounds over a competing root viewBox', () => {
    installSvgDomShim()

    const svg = new MockElement('svg')
    svg.viewBox = {
      baseVal: {
        x: -200,
        y: -200,
        width: 2232.8597412109375,
        height: 1928,
      },
    }
    svg.getBBox = () => ({
      x: -200,
      y: -200,
      width: 2232.8597412109375,
      height: 1928,
    })

    const foreignObject = new MockElement('foreignObject')
    foreignObject.setAttribute('class', 'skill-node-export-anchor')
    foreignObject.setAttribute('x', '1000')
    foreignObject.setAttribute('y', '1200')
    foreignObject.setAttribute('width', '120')
    foreignObject.setAttribute('height', '120')
    svg.appendChild(foreignObject)

    const serialized = serializeSvgElementForExport(svg)

    expect(serialized).toContain('viewBox="-200 -200 2232.8597412109375 1928"')
    expect(serialized).toContain('width="2232.8597412109375"')
    expect(serialized).toContain('height="1928"')
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

    expect(serialized).toContain('skill-node-tooltip__note--markdown')
    expect(serialized).toContain('<h1>Release Impact</h1>')
    expect(serialized).toContain('<p>Rollout is live.</p>')
  })

  it('hides the level label for single-level tooltip cards', () => {
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
    foreignObject.setAttribute('data-export-levels', JSON.stringify([
      {
        id: 'level-now',
        label: 'Level 1',
        status: 'now',
        statusLabel: 'Now',
        releaseNote: 'Now is live.',
      },
    ]))
    svg.appendChild(foreignObject)

    const serialized = serializeSvgElementForExport(svg)

    expect(serialized).not.toContain('Level 1</strong><span>Now')
    expect(serialized).toContain('<span>Now</span>')
  })

  it('serializes stacked level notes and hover styles without SMIL begin values', () => {
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
    foreignObject.setAttribute('data-export-levels', JSON.stringify([
      {
        id: 'level-now',
        label: 'Level One',
        status: 'now',
        statusLabel: 'Now',
        releaseNote: 'Ready for **launch**.',
      },
      {
        id: 'level-next',
        label: 'Level Two',
        status: 'next',
        statusLabel: 'Next',
        releaseNote: '- draft\n- review',
      },
    ]))
    svg.appendChild(foreignObject)

    const serialized = serializeSvgElementForExport(svg)

    expect(serialized).toContain('skill-node-tooltip__stack')
    expect(serialized).toContain('skill-node-tooltip__card')
    expect(serialized).toContain('export-tooltip-trigger-1-level-1')
    expect(serialized).toContain('export-tooltip-trigger-1-level-2')
    expect(serialized).toContain('<strong>launch</strong>')
    expect(serialized).toContain('<ul><li>draft</li><li>review</li></ul>')
    expect(serialized).toContain('.skill-node-tooltip-trigger:hover + .skill-node-tooltip-group')
    expect(serialized).not.toContain('<animate')
    expect(serialized).not.toContain('begin="export-tooltip-trigger-1.mouseover"')
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
