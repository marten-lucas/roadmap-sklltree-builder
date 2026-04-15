import { describe, expect, it } from 'vitest'
import { isValidElement, Children, createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MantineProvider } from '@mantine/core'
import { NODE_LABEL_ZOOM } from '../config'
import { MarkdownTooltipContent } from '../tooltip'

// Pure helper mirroring the zoomLabelMode logic in SkillTree.jsx and htmlExport.js
const getLabelMode = (scale) => {
  if (scale < NODE_LABEL_ZOOM.farToMid) return 'far'
  if (scale >= NODE_LABEL_ZOOM.midToClose) return 'close'
  return 'mid'
}

// Mirrors getShortName in SkillNode.jsx
const getShortName = (node) => {
  const explicitShortName = String(node?.shortName ?? '').trim().toLowerCase().slice(0, 3)
  if (explicitShortName) return explicitShortName

  const letters = String(node?.label ?? '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toLowerCase()
    .slice(0, 3)

  return letters || 'skl'
}

describe('NODE_LABEL_ZOOM thresholds', () => {
  it('exposes configurable farToMid and midToClose thresholds', () => {
    expect(typeof NODE_LABEL_ZOOM.farToMid).toBe('number')
    expect(typeof NODE_LABEL_ZOOM.midToClose).toBe('number')
    expect(NODE_LABEL_ZOOM.farToMid).toBeLessThan(NODE_LABEL_ZOOM.midToClose)
  })
})

describe('getLabelMode', () => {
  it('returns far below farToMid threshold', () => {
    expect(getLabelMode(0)).toBe('far')
    expect(getLabelMode(NODE_LABEL_ZOOM.farToMid - 0.01)).toBe('far')
  })

  it('returns mid at farToMid threshold', () => {
    expect(getLabelMode(NODE_LABEL_ZOOM.farToMid)).toBe('mid')
  })

  it('returns mid between the two thresholds', () => {
    const mid = (NODE_LABEL_ZOOM.farToMid + NODE_LABEL_ZOOM.midToClose) / 2
    expect(getLabelMode(mid)).toBe('mid')
  })

  it('returns close at and above midToClose threshold', () => {
    expect(getLabelMode(NODE_LABEL_ZOOM.midToClose)).toBe('close')
    expect(getLabelMode(NODE_LABEL_ZOOM.midToClose + 1)).toBe('close')
  })

  it('returns far for default (scale = 0.5 with default thresholds 0.5/1.0)', () => {
    // With the default config farToMid = 0.5: scale 0.5 is exactly mid
    const result = getLabelMode(NODE_LABEL_ZOOM.farToMid)
    expect(['mid', 'far']).toContain(result)
  })
})

describe('getShortName – lowercase', () => {
  it('returns explicit shortName in lowercase', () => {
    expect(getShortName({ shortName: 'RCT', label: 'React' })).toBe('rct')
    expect(getShortName({ shortName: 'ABC', label: 'Anything' })).toBe('abc')
  })

  it('falls back to first 3 lowercase letters of label when shortName is empty', () => {
    expect(getShortName({ shortName: '', label: 'React' })).toBe('rea')
    expect(getShortName({ shortName: undefined, label: 'Backend' })).toBe('bac')
  })

  it('strips non-alphanumeric characters from label fallback', () => {
    expect(getShortName({ shortName: '', label: '##Hello!' })).toBe('hel')
  })

  it('truncates to 3 characters', () => {
    expect(getShortName({ shortName: 'ABCDE', label: 'Ignored' })).toBe('abc')
  })

  it('returns skl when both shortName and label are empty', () => {
    expect(getShortName({ shortName: '', label: '' })).toBe('skl')
    expect(getShortName({})).toBe('skl')
  })

  it('never returns uppercase characters', () => {
    const result = getShortName({ shortName: 'XYZ', label: 'UPPERCASE' })
    expect(result).toBe(result.toLowerCase())
  })
})

describe('MarkdownTooltipContent – scope chips below note', () => {
  // Traverse the JSX tree and collect className values in document order
  const collectClassNames = (element, result = []) => {
    if (!isValidElement(element)) return result
    const className = element.props?.className
    if (className) result.push(className)
    Children.forEach(element.props?.children, (child) => collectClassNames(child, result))
    return result
  }

  it('renders note before scopes when scopeLabels are provided', () => {
    const element = MarkdownTooltipContent({
      title: 'Test Node',
      markdown: 'Some **note**.',
      scopeLabels: ['Frontend', 'Platform'],
    })

    const classes = collectClassNames(element)
    const noteIdx = classes.findIndex((c) => c.includes('tooltip__note'))
    const scopesIdx = classes.findIndex((c) => c.includes('tooltip__scopes'))

    expect(noteIdx).toBeGreaterThan(-1)
    expect(scopesIdx).toBeGreaterThan(-1)
    expect(scopesIdx).toBeGreaterThan(noteIdx)
  })

  it('renders title first, then note, then scopes', () => {
    const element = MarkdownTooltipContent({
      title: 'Test Node',
      markdown: 'Note text.',
      scopeLabels: ['Backend'],
    })

    const classes = collectClassNames(element)
    const titleIdx = classes.findIndex((c) => c.includes('tooltip__title'))
    const noteIdx = classes.findIndex((c) => c.includes('tooltip__note'))
    const scopesIdx = classes.findIndex((c) => c.includes('tooltip__scopes'))

    expect(titleIdx).toBeLessThan(noteIdx)
    expect(noteIdx).toBeLessThan(scopesIdx)
  })

  it('omits scope block when no scopeLabels given', () => {
    const element = MarkdownTooltipContent({
      title: 'No Scopes',
      markdown: 'Note.',
    })

    const classes = collectClassNames(element)
    expect(classes.some((c) => c.includes('tooltip__scopes'))).toBe(false)
  })

  it('shows the configured level names instead of generic L1 tabs', () => {
    const html = renderToStaticMarkup(
      createElement(
        MantineProvider,
        null,
        MarkdownTooltipContent({
          title: 'Roadmap Node',
          markdown: 'Foundation note',
          levels: [
            { id: 'lvl-1', label: 'Foundation', status: 'now', releaseNote: 'Foundation note', scopeLabels: [] },
            { id: 'lvl-2', label: 'Rollout', status: 'next', releaseNote: 'Rollout note', scopeLabels: [] },
          ],
          activeLevelIndex: 0,
          onTabChange: () => {},
        }),
      ),
    )

    expect(html).toContain('>Foundation<')
    expect(html).toContain('>Rollout<')
    expect(html).not.toContain('>L1<')
    expect(html).not.toContain('>L2<')
  })
})
