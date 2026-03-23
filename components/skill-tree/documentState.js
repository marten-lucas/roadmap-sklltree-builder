const HISTORY_LIMIT = 100
export const DEFAULT_CENTER_ICON_SRC = '/Kyana_Visual_final.svg'

const isObject = (value) => typeof value === 'object' && value !== null

const ensureDocumentDefaults = (document) => {
  if (!isObject(document)) {
    return createEmptyDocument()
  }

  const nextScopes = Array.isArray(document.scopes) ? document.scopes : []

  // If the most important fields already exist, assume it's okay to return
  if (
    typeof document.centerIconSrc === 'string'
    && document.centerIconSrc.trim().length > 0
    && Array.isArray(document.scopes)
    && typeof document.systemName === 'string'
    && isObject(document.release)
  ) {
    return document
  }

  return {
    ...document,
    centerIconSrc:
      typeof document.centerIconSrc === 'string' && document.centerIconSrc.trim().length > 0
        ? document.centerIconSrc
        : DEFAULT_CENTER_ICON_SRC,
    scopes: nextScopes,
    systemName: typeof document.systemName === 'string' ? document.systemName : '',
    release: isObject(document.release)
      ? {
          name: typeof document.release.name === 'string' ? document.release.name : '',
          motto: typeof document.release.motto === 'string' ? document.release.motto : '',
          introduction: typeof document.release.introduction === 'string' ? document.release.introduction : '',
        }
      : { name: '', motto: '', introduction: '' },
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
  systemName: '',
  release: { name: '', motto: '', introduction: '' },
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
