import { createEmptyDocument } from './documentState'
import { loadDocumentFromLocalStorage } from './documentPersistence'

export const getInitialRoadmapDocument = () => loadDocumentFromLocalStorage() ?? createEmptyDocument()
