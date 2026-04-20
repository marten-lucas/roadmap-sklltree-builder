import { describe, expect, it } from 'vitest'
import { isValidElement, Children, createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MantineProvider } from '@mantine/core'
import { NODE_LABEL_ZOOM } from '../config'
import { MarkdownTooltipContent } from '../tooltip'
import { EMPTY_RELEASE_NOTE, buildNodeExportLevelEntries, getNodeLabelMode, getNodeShortName, getNodeTooltipReleaseNote } from '../utils/nodePresentation'

describe('NODE_LABEL_ZOOM thresholds', () => {
  it('exposes configurable farToMid and midToClose thresholds', () => {
    expect(typeof NODE_LABEL_ZOOM.farToMid).toBe('number')
    expect(typeof NODE_LABEL_ZOOM.midToClose).toBe('number')
    expect(NODE_LABEL_ZOOM.farToMid).toBeLessThan(NODE_LABEL_ZOOM.midToClose)
  })
})

describe('getNodeLabelMode', () => {
  it('returns far below farToMid threshold', () => {
    expect(getNodeLabelMode(0)).toBe('far')
    expect(getNodeLabelMode(NODE_LABEL_ZOOM.farToMid - 0.01)).toBe('far')
  })

  it('returns mid at farToMid threshold', () => {
    expect(getNodeLabelMode(NODE_LABEL_ZOOM.farToMid)).toBe('mid')
  })

  it('returns close between midToClose and closeToVeryClose', () => {
    expect(getNodeLabelMode(NODE_LABEL_ZOOM.midToClose)).toBe('close')
    expect(getNodeLabelMode(NODE_LABEL_ZOOM.closeToVeryClose - 0.01)).toBe('close')
  })

  it('returns very-close at and above closeToVeryClose', () => {
    expect(getNodeLabelMode(NODE_LABEL_ZOOM.closeToVeryClose)).toBe('very-close')
    expect(getNodeLabelMode(NODE_LABEL_ZOOM.closeToVeryClose + 1)).toBe('very-close')
  })
})

describe('getNodeShortName – lowercase', () => {
  it('returns explicit shortName in lowercase', () => {
    expect(getNodeShortName({ shortName: 'RCT', label: 'React' })).toBe('rct')
    expect(getNodeShortName({ shortName: 'ABC', label: 'Anything' })).toBe('abc')
  })

  it('falls back to first 3 lowercase letters of label when shortName is empty', () => {
    expect(getNodeShortName({ shortName: '', label: 'React' })).toBe('rea')
    expect(getNodeShortName({ shortName: undefined, label: 'Backend' })).toBe('bac')
  })

  it('strips non-alphanumeric characters from label fallback', () => {
    expect(getNodeShortName({ shortName: '', label: '##Hello!' })).toBe('hel')
  })

  it('truncates to 3 characters', () => {
    expect(getNodeShortName({ shortName: 'ABCDE', label: 'Ignored' })).toBe('abc')
  })

  it('returns skl when both shortName and label are empty', () => {
    expect(getNodeShortName({ shortName: '', label: '' })).toBe('skl')
    expect(getNodeShortName({})).toBe('skl')
  })

  it('never returns uppercase characters', () => {
    const result = getNodeShortName({ shortName: 'XYZ', label: 'UPPERCASE' })
    expect(result).toBe(result.toLowerCase())
  })
})

describe('shared node presentation helpers', () => {
  it('returns the empty note fallback when no tooltip note exists', () => {
    expect(getNodeTooltipReleaseNote({ label: 'Node', levels: [] })).toBe(EMPTY_RELEASE_NOTE)
  })

  it('builds export level entries with display labels and scope labels', () => {
    const entries = buildNodeExportLevelEntries({
      levels: [
        {
          id: 'level-1',
          label: 'Foundation',
          status: 'now',
          releaseNote: 'Ship it',
          scopeIds: ['scope-a'],
          effort: { size: 'm' },
          benefit: { size: 'l' },
        },
      ],
    }, [
      { value: 'scope-a', label: 'Platform', color: '#0ea5e9' },
      { id: 'scope-a', label: 'Platform', color: '#0ea5e9' },
    ])

    expect(entries).toHaveLength(1)
    expect(entries[0].label).toContain('Foundation')
    expect(entries[0].scopeLabels).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: 'Platform' })]),
    )
    expect(entries[0].releaseNote).toBe('Ship it')
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
