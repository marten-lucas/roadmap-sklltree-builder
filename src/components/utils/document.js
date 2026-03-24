import { initialData } from './data'
import { loadDocumentFromLocalStorage } from './documentPersistence'

export const getInitialRoadmapDocument = () => loadDocumentFromLocalStorage() ?? initialData
