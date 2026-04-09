import { describe, expect, it } from 'vitest'
import {
  createDocumentHistoryState,
  createEmptyDocument,
  DEFAULT_CENTER_ICON_SRC,
  documentHistoryReducer,
  normalizeCenterIconSrc,
} from '../utils/documentState'
import { DEFAULT_STORY_POINT_MAP } from '../utils/effortBenefit'

const createDoc = (suffix) => ({
  segments: [{ id: `segment-${suffix}`, label: `Segment ${suffix}` }],
  scopes: [],
  children: [{ id: `node-${suffix}`, label: `Node ${suffix}`, children: [] }],
  centerIconSrc: DEFAULT_CENTER_ICON_SRC,
  release: { name: `Release ${suffix}`, motto: `Motto ${suffix}`, introduction: `Intro ${suffix}`, date: `2026-07-${String(suffix).padStart(2, '0')}` },
  storyPointBudget: null,
  storyPointMap: { ...DEFAULT_STORY_POINT_MAP },
})

describe('documentState', () => {
  it('initializes history state with cloned present document', () => {
    const initialDoc = createDoc('init')
    const state = createDocumentHistoryState(initialDoc)

    expect(state.past).toEqual([])
    expect(state.future).toEqual([])
    expect(state.present).toEqual(initialDoc)
    expect(state.present).not.toBe(initialDoc)
  })

  it('applies document and pushes previous present into past', () => {
    const initialDoc = createDoc('a')
    const nextDoc = createDoc('b')
    const initialState = createDocumentHistoryState(initialDoc)

    const state = documentHistoryReducer(initialState, {
      type: 'apply',
      document: nextDoc,
    })

    expect(state.present).toBe(nextDoc)
    expect(state.past).toHaveLength(1)
    expect(state.past[0]).toEqual(initialDoc)
    expect(state.future).toEqual([])
  })

  it('ignores apply when document reference did not change', () => {
    const initialDoc = createDoc('same')
    const state = createDocumentHistoryState(initialDoc)

    const nextState = documentHistoryReducer(state, {
      type: 'apply',
      document: state.present,
    })

    expect(nextState).toBe(state)
  })

  it('supports multi-step undo and redo', () => {
    const docA = createDoc('a')
    const docB = createDoc('b')
    const docC = createDoc('c')

    const initialState = createDocumentHistoryState(docA)
    const withB = documentHistoryReducer(initialState, { type: 'apply', document: docB })
    const withC = documentHistoryReducer(withB, { type: 'apply', document: docC })

    const undo1 = documentHistoryReducer(withC, { type: 'undo' })
    expect(undo1.present).toBe(docB)

    const undo2 = documentHistoryReducer(undo1, { type: 'undo' })
    expect(undo2.present).toEqual(docA)

    const redo1 = documentHistoryReducer(undo2, { type: 'redo' })
    expect(redo1.present).toBe(docB)

    const redo2 = documentHistoryReducer(redo1, { type: 'redo' })
    expect(redo2.present).toBe(docC)
  })

  it('clears redo stack when a new apply happens after undo', () => {
    const docA = createDoc('a')
    const docB = createDoc('b')
    const docC = createDoc('c')

    const initialState = createDocumentHistoryState(docA)
    const withB = documentHistoryReducer(initialState, { type: 'apply', document: docB })
    const withC = documentHistoryReducer(withB, { type: 'apply', document: docC })
    const undo = documentHistoryReducer(withC, { type: 'undo' })

    const branchDoc = createDoc('branch')
    const branched = documentHistoryReducer(undo, { type: 'apply', document: branchDoc })

    expect(branched.future).toEqual([])
    expect(branched.present).toBe(branchDoc)
  })

  it('replaces document and clears entire history', () => {
    const docA = createDoc('a')
    const docB = createDoc('b')
    const replacement = createDoc('replacement')

    const initialState = createDocumentHistoryState(docA)
    const withB = documentHistoryReducer(initialState, { type: 'apply', document: docB })

    const replaced = documentHistoryReducer(withB, {
      type: 'replace',
      document: replacement,
    })

    expect(replaced.present).toBe(replacement)
    expect(replaced.past).toEqual([])
    expect(replaced.future).toEqual([])
  })

  it('limits past history to 100 entries', () => {
    let state = createDocumentHistoryState(createDoc('0'))

    for (let index = 1; index <= 130; index += 1) {
      state = documentHistoryReducer(state, {
        type: 'apply',
        document: createDoc(String(index)),
      })
    }

    expect(state.past).toHaveLength(100)
    expect(state.past[0].segments[0].id).toBe('segment-30')
  })

  it('creates an empty document for reset flows', () => {
    expect(createEmptyDocument()).toEqual({
      segments: [],
      scopes: [],
      children: [],
      centerIconSrc: DEFAULT_CENTER_ICON_SRC,
      release: { name: '', motto: '', introduction: '', date: '' },
      storyPointBudget: null,
      storyPointMap: { ...DEFAULT_STORY_POINT_MAP },
    })
  })

  it('defaults missing scopes without overriding existing center icon', () => {
    const state = createDocumentHistoryState({
      segments: [],
      children: [],
      centerIconSrc: '/custom.svg',
    })

    expect(state.present.scopes).toEqual([])
    expect(state.present.centerIconSrc).toBe('/custom.svg')
  })

  it('normalizes the legacy blob icon source to an embedded data url', () => {
    const normalized = normalizeCenterIconSrc('/blob.svg')

    expect(normalized).toBe(DEFAULT_CENTER_ICON_SRC)
    expect(normalized).toContain('data:image/svg+xml')
  })

  it('defaults a missing center icon to the embedded blob data url', () => {
    const state = createDocumentHistoryState({
      segments: [],
      scopes: [],
      children: [],
      release: { name: '', motto: '', introduction: '', date: '' },
    })

    expect(state.present.centerIconSrc).toBe(DEFAULT_CENTER_ICON_SRC)
    expect(state.present.centerIconSrc).toContain('data:image/svg+xml')
  })
})
