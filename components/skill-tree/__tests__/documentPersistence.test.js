import { describe, expect, it } from 'vitest'
import {
  DOCUMENT_SCHEMA_VERSION,
  LOCAL_STORAGE_DOCUMENT_KEY,
  buildPersistedDocumentPayload,
  loadDocumentFromLocalStorage,
  parseDocumentPayload,
  readDocumentFromJsonText,
  saveDocumentToLocalStorage,
  serializeDocumentPayload,
} from '../documentPersistence'

const createDocument = () => ({
  segments: [{ id: 'segment-1', label: 'Frontend' }],
  children: [{ id: 'node-1', label: 'Root', children: [] }],
})

const createStorageMock = () => {
  const map = new Map()

  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, String(value))
    },
  }
}

describe('documentPersistence', () => {
  it('builds payload with schema version and document', () => {
    const document = createDocument()
    const payload = buildPersistedDocumentPayload(document)

    expect(payload).toEqual({
      schemaVersion: DOCUMENT_SCHEMA_VERSION,
      document,
    })
  })

  it('serializes and parses a valid payload', () => {
    const document = createDocument()
    const serialized = serializeDocumentPayload(document)
    const parsed = parseDocumentPayload(serialized)

    expect(parsed.ok).toBe(true)
    expect(parsed.value).toEqual(document)
  })

  it('rejects malformed JSON content', () => {
    const parsed = parseDocumentPayload('{bad-json}')

    expect(parsed.ok).toBe(false)
    expect(parsed.error).toMatch(/gueltiges JSON/)
  })

  it('rejects unsupported schema version', () => {
    const invalid = JSON.stringify({
      schemaVersion: 999,
      document: createDocument(),
    })

    const parsed = parseDocumentPayload(invalid)

    expect(parsed.ok).toBe(false)
    expect(parsed.error).toMatch(/schemaVersion/)
  })

  it('rejects invalid document shape', () => {
    const invalid = JSON.stringify({
      schemaVersion: DOCUMENT_SCHEMA_VERSION,
      document: { children: [] },
    })

    const parsed = parseDocumentPayload(invalid)

    expect(parsed.ok).toBe(false)
    expect(parsed.error).toMatch(/segments\/children/)
  })

  it('saves and loads from injected storage backend', () => {
    const storage = createStorageMock()
    const document = createDocument()

    const saveResult = saveDocumentToLocalStorage(document, storage)
    const loaded = loadDocumentFromLocalStorage(storage)

    expect(saveResult).toBe(true)
    expect(loaded).toEqual(document)
  })

  it('returns null when local storage entry is missing or invalid', () => {
    const storage = createStorageMock()

    expect(loadDocumentFromLocalStorage(storage)).toBeNull()

    storage.setItem(LOCAL_STORAGE_DOCUMENT_KEY, '{')
    expect(loadDocumentFromLocalStorage(storage)).toBeNull()
  })

  it('throws helpful error when JSON text is not importable', () => {
    expect(() => readDocumentFromJsonText('invalid')).toThrow(/gueltiges JSON/)
  })
})
