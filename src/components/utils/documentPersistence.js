export const DOCUMENT_SCHEMA_VERSION = 1
export const LOCAL_STORAGE_DOCUMENT_KEY = 'roadmap-skilltree.document.v1'

const isObject = (value) => typeof value === 'object' && value !== null

const isValidDocumentShape = (document) => {
  if (!isObject(document)) {
    return false
  }

  return Array.isArray(document.segments) && Array.isArray(document.children)
}

export const buildPersistedDocumentPayload = (document) => ({
  schemaVersion: DOCUMENT_SCHEMA_VERSION,
  document,
})

export const serializeDocumentPayload = (document) =>
  JSON.stringify(buildPersistedDocumentPayload(document), null, 2)

export const parseDocumentPayload = (rawValue) => {
  if (typeof rawValue !== 'string' || rawValue.length === 0) {
    return {
      ok: false,
      error: 'Die Datei ist leer oder kein gueltiges JSON.',
    }
  }

  let parsed
  try {
    parsed = JSON.parse(rawValue)
  } catch {
    return {
      ok: false,
      error: 'Die Datei enthaelt kein gueltiges JSON.',
    }
  }

  if (!isObject(parsed)) {
    return {
      ok: false,
      error: 'Ungueltiges Dokumentformat.',
    }
  }

  if (parsed.schemaVersion !== DOCUMENT_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Nicht unterstuetzte schemaVersion: ${String(parsed.schemaVersion)}`,
    }
  }

  if (!isValidDocumentShape(parsed.document)) {
    return {
      ok: false,
      error: 'Dokumentdaten sind unvollstaendig (segments/children fehlen).',
    }
  }

  return {
    ok: true,
    value: parsed.document,
  }
}

export const saveDocumentToLocalStorage = (document, storage = globalThis?.localStorage) => {
  if (!storage || typeof storage.setItem !== 'function') {
    return false
  }

  try {
    storage.setItem(LOCAL_STORAGE_DOCUMENT_KEY, serializeDocumentPayload(document))
    return true
  } catch (err) {
    // Fail gracefully if storage quota is exceeded or other storage errors occur.
    // Tests will detect persistence failures via other means if required.
     
    console.warn('saveDocumentToLocalStorage failed:', err)
    return false
  }
}

export const loadDocumentFromLocalStorage = (storage = globalThis?.localStorage) => {
  if (!storage || typeof storage.getItem !== 'function') {
    return null
  }

  const rawValue = storage.getItem(LOCAL_STORAGE_DOCUMENT_KEY)
  if (!rawValue) {
    return null
  }

  const result = parseDocumentPayload(rawValue)
  return result.ok ? result.value : null
}

export const downloadDocumentJson = (roadmapDocument, fileName = 'skilltree-roadmap.json') => {
  if (typeof window === 'undefined' || typeof window.document === 'undefined') {
    return false
  }

  const json = serializeDocumentPayload(roadmapDocument)
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
  const url = window.URL.createObjectURL(blob)
  const link = window.document.createElement('a')

  link.href = url
  link.download = fileName
  link.style.display = 'none'
  window.document.body.appendChild(link)
  link.click()
  window.document.body.removeChild(link)
  window.URL.revokeObjectURL(url)

  return true
}

export const readDocumentFromJsonText = (jsonText) => {
  const parsed = parseDocumentPayload(jsonText)

  if (!parsed.ok) {
    throw new Error(parsed.error)
  }

  return parsed.value
}
