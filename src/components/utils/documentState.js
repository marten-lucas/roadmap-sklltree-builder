import { DEFAULT_STORY_POINT_MAP, normalizeStoryPointMap } from './effortBenefit'
import { createRelease, normalizeRelease } from './releases'
import { DEFAULT_STATUS_DESCRIPTIONS } from '../config'

const HISTORY_LIMIT = 100
const DEFAULT_CENTER_ICON_SVG = `<svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
    <path stroke="none" stroke-width="0" fill="#709dea" d="M128,238.96860494092107C163.3025754180683,239.47544119843428,202.58254795690218,232.4526234417673,222.02157944173297,202.97970758547496C240.35945748362056,175.17632978173717,224.1381987062536,140.11101182007903,214.1605283385898,108.3344216567093C205.5979750032754,81.06465446034225,195.21259188869655,54.04788824297445,170.6620398512028,39.41136142755575C143.154758502594,23.012094296482317,109.77314709327557,16.52385171220826,80.01603770687902,28.360275606014028C47.72725015866906,41.20371988936116,21.97098601367017,68.16300344787757,13.594661196484907,101.88772798270345C5.035005343876296,136.3505791784787,14.55088843709899,173.0649989848688,37.303894604759776,200.32773052797788C59.456823739614975,226.87144767228563,93.43014522914265,238.4722882952559,128,238.96860494092107"/>
</svg>`
const DEFAULT_CENTER_ICON_SRC = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(DEFAULT_CENTER_ICON_SVG)}`
const LEGACY_CENTER_ICON_SRC = '/blob.svg'

export { DEFAULT_CENTER_ICON_SRC }

export const normalizeCenterIconSrc = (value) => {
  const rawValue = String(value ?? '').trim()
  if (!rawValue || rawValue === LEGACY_CENTER_ICON_SRC) {
    return DEFAULT_CENTER_ICON_SRC
  }

  return rawValue
}

const isObject = (value) => typeof value === 'object' && value !== null

const normalizeReleases = (rawReleases) => {
  if (!Array.isArray(rawReleases) || rawReleases.length === 0) {
    return [createRelease('Release 1')]
  }
  return rawReleases.map(normalizeRelease)
}

const ensureDocumentDefaults = (document) => {
  if (!isObject(document)) {
    return createEmptyDocument()
  }

  const nextScopes = Array.isArray(document.scopes) ? document.scopes : []
  const nextReleases = normalizeReleases(document.releases)
  const hasSPMap = isObject(document.storyPointMap)
  const hasShowHiddenNodes = 'showHiddenNodes' in document
  const hasReleases = Array.isArray(document.releases) && document.releases.length > 0
  const hasStatusDescriptions = !('statusDescriptions' in document) || isObject(document.statusDescriptions)

  if (
    normalizeCenterIconSrc(document.centerIconSrc) === document.centerIconSrc
    && Array.isArray(document.scopes)
    && hasReleases
    && hasSPMap
    && hasShowHiddenNodes
    && hasStatusDescriptions
  ) {
    return document
  }

  return {
    ...document,
    centerIconSrc: normalizeCenterIconSrc(document.centerIconSrc),
    scopes: nextScopes,
    releases: nextReleases,
    storyPointMap: hasSPMap ? normalizeStoryPointMap(document.storyPointMap) : { ...DEFAULT_STORY_POINT_MAP },
    showHiddenNodes: hasShowHiddenNodes ? document.showHiddenNodes : false,
    statusDescriptions: {
      ...DEFAULT_STATUS_DESCRIPTIONS,
      ...(hasStatusDescriptions ? document.statusDescriptions : {}),
    },
  }
}

const trimPast = (past) => {
  if (past.length <= HISTORY_LIMIT) {
    return past
  }

  return past.slice(past.length - HISTORY_LIMIT)
}

export const createEmptyDocument = () => ({
  segments: [],
  scopes: [],
  children: [],
  centerIconSrc: DEFAULT_CENTER_ICON_SRC,
  releases: [createRelease('Release 1')],
  storyPointMap: { ...DEFAULT_STORY_POINT_MAP },
  showHiddenNodes: false,
  statusDescriptions: { ...DEFAULT_STATUS_DESCRIPTIONS },
})

export const cloneDocument = (document) => {
  if (!document) {
    return createEmptyDocument()
  }

  return ensureDocumentDefaults(structuredClone(document))
}

export const createDocumentHistoryState = (initialDocument) => ({
  past: [],
  present: cloneDocument(initialDocument),
  future: [],
})

export const documentHistoryReducer = (state, action) => {
  switch (action.type) {
    case 'apply': {
      const nextDocument = ensureDocumentDefaults(action.document)

      if (!nextDocument || nextDocument === state.present) {
        return state
      }

      return {
        past: trimPast([...state.past, state.present]),
        present: nextDocument,
        future: [],
      }
    }

    case 'undo': {
      if (state.past.length === 0) {
        return state
      }

      const previousDocument = state.past[state.past.length - 1]
      const nextPast = state.past.slice(0, -1)

      return {
        past: nextPast,
        present: previousDocument,
        future: [state.present, ...state.future],
      }
    }

    case 'redo': {
      if (state.future.length === 0) {
        return state
      }

      const [nextDocument, ...remainingFuture] = state.future

      return {
        past: trimPast([...state.past, state.present]),
        present: nextDocument,
        future: remainingFuture,
      }
    }

    case 'replace': {
      const replacementDocument = ensureDocumentDefaults(action.document)

      if (!replacementDocument) {
        return state
      }

      return {
        past: [],
        present: replacementDocument,
        future: [],
      }
    }

    default:
      return state
  }
}
