const HISTORY_LIMIT = 100

const trimPast = (past) => {
  if (past.length <= HISTORY_LIMIT) {
    return past
  }

  return past.slice(past.length - HISTORY_LIMIT)
}

export const createEmptyDocument = () => ({
  segments: [],
  children: [],
})

export const cloneDocument = (document) => {
  if (!document) {
    return createEmptyDocument()
  }

  return structuredClone(document)
}

export const createDocumentHistoryState = (initialDocument) => ({
  past: [],
  present: cloneDocument(initialDocument),
  future: [],
})

export const documentHistoryReducer = (state, action) => {
  switch (action.type) {
    case 'apply': {
      const nextDocument = action.document

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
      const replacementDocument = action.document

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
