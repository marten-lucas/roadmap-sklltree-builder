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
} from '../utils/documentPersistence'

const createDocument = () => ({
  segments: [{ id: 'segment-1', label: 'Frontend' }],
  scopes: [],
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

  it('migrates schemaVersion 1 document by moving additionalDependencyIds to level', () => {
    const v1doc = {
      segments: [{ id: 'seg-1', label: 'S' }],
      children: [
        {
          id: 'node-alpha',
          label: 'Alpha',
          additionalDependencyIds: ['node-beta'],
          levels: [{ id: 'lvl-alpha-1', status: 'later', releaseNote: '' }],
          children: [],
        },
        {
          id: 'node-beta',
          label: 'Beta',
          additionalDependencyIds: [],
          levels: [{ id: 'lvl-beta-1', status: 'done', releaseNote: '' }],
          children: [],
        },
      ],
    }

    const v1payload = JSON.stringify({ schemaVersion: 1, document: v1doc })
    const parsed = parseDocumentPayload(v1payload)

    expect(parsed.ok).toBe(true)

    const migratedAlpha = parsed.value.children.find((c) => c.id === 'node-alpha')
    expect(migratedAlpha.additionalDependencyIds).toBeUndefined()
    expect(migratedAlpha.levels[0].additionalDependencyLevelIds).toContain('lvl-beta-1')
  })
})
