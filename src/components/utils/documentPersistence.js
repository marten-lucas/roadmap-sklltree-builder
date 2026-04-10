export const DOCUMENT_SCHEMA_VERSION = 3
export const LOCAL_STORAGE_DOCUMENT_KEY = 'roadmap-skilltree.document.v1'
const LOCAL_STORAGE_TRACE_KEYS = [
  'roadmap-skilltree.e2e.modelTrace',
  'roadmap-skilltree.e2e.modelTraceLast',
  'roadmap-skilltree.e2e.scopeTrace',
]

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

export const serializeDocumentPayload = (document, options = {}) => {
  const { pretty = false } = options
  return JSON.stringify(buildPersistedDocumentPayload(document), null, pretty ? 2 : 0)
}

/**
 * Migrates a schema-version-1 document to version 2.
 * v1: node.additionalDependencyIds = [nodeId, ...]
 * v2: level.additionalDependencyLevelIds = [levelId, ...]  (per level)
 * Migration maps each outgoing node-level dep to the first level of the target node.
 */
const migrateV1ToV2 = (document) => {
  if (!document || !Array.isArray(document.children)) {
    return document
  }

  // Build nodeId → firstLevelId map
  const nodeFirstLevelId = new Map()
  const collectLevels = (node) => {
    const firstLevel = Array.isArray(node.levels) && node.levels.length > 0 ? node.levels[0] : null
    if (firstLevel?.id) {
      nodeFirstLevelId.set(node.id, firstLevel.id)
    }
    for (const child of node.children ?? []) {
      collectLevels(child)
    }
  }
  for (const root of document.children) {
    collectLevels(root)
  }

  const migrateNode = (node) => {
    const oldDeps = Array.isArray(node.additionalDependencyIds) ? node.additionalDependencyIds : []
    const targetLevelIds = oldDeps.map((targetNodeId) => nodeFirstLevelId.get(targetNodeId)).filter(Boolean)

    const migratedLevels = Array.isArray(node.levels)
      ? node.levels.map((level, index) => ({
        ...level,
        additionalDependencyLevelIds: index === 0 ? targetLevelIds : (level.additionalDependencyLevelIds ?? []),
      }))
      : node.levels

    const { additionalDependencyIds: _removed, ...rest } = node

    return {
      ...rest,
      levels: migratedLevels,
      children: (node.children ?? []).map(migrateNode),
    }
  }

  return {
    ...document,
    children: document.children.map(migrateNode),
  }
}

/**
 * Migrates a schema-version-2 document to version 3.
 * v2: single `release` object + `storyPointBudget` at document root, level.status = string
 * v3: `releases` array where each release has its own storyPointBudget,
 *     level.statuses = { [releaseId]: string } replaces level.status
 */
const migrateV2ToV3 = (document) => {
  if (!document) return document

  // Build first release from old release object
  const oldRelease = (document.release && typeof document.release === 'object') ? document.release : {}
  const firstReleaseId = oldRelease.id ?? `release-${Math.random().toString(36).slice(2, 10)}`
  const firstReleaseName = (typeof oldRelease.name === 'string' && oldRelease.name.trim()) ? oldRelease.name.trim() : 'Release 1'

  const firstRelease = {
    id: firstReleaseId,
    name: firstReleaseName,
    motto: typeof oldRelease.motto === 'string' ? oldRelease.motto : '',
    introduction: typeof oldRelease.introduction === 'string' ? oldRelease.introduction : '',
    date: typeof oldRelease.date === 'string' ? oldRelease.date : '',
    storyPointBudget: document.storyPointBudget != null ? Number(document.storyPointBudget) : null,
  }

  // Migrate every level: level.status → level.statuses[firstReleaseId]
  const migrateNode = (node) => {
    const migratedLevels = Array.isArray(node.levels)
      ? node.levels.map((level) => {
          // If already has statuses (partial migration), keep it; otherwise convert status
          const existingStatuses = (level.statuses && typeof level.statuses === 'object') ? level.statuses : null
          const statuses = existingStatuses ?? { [firstReleaseId]: level.status ?? 'later' }
          const { status: _removedStatus, ...levelRest } = level
          return { ...levelRest, statuses }
        })
      : []

    const { status: _removedStatus, ...nodeRest } = node

    return {
      ...nodeRest,
      levels: migratedLevels,
      children: (node.children ?? []).map(migrateNode),
    }
  }

  const { release: _r, storyPointBudget: _b, ...docRest } = document

  return {
    ...docRest,
    releases: [firstRelease],
    children: Array.isArray(document.children) ? document.children.map(migrateNode) : [],
  }
}

const isQuotaExceededError = (err) => {
  if (!err || typeof err !== 'object') {
    return false
  }

  const name = typeof err.name === 'string' ? err.name : ''
  const code = Number(err.code)
  return name === 'QuotaExceededError' || code === 22 || code === 1014
}

const cleanupStorageTraceKeys = (storage) => {
  if (!storage || typeof storage.removeItem !== 'function') {
    return
  }

  for (const key of LOCAL_STORAGE_TRACE_KEYS) {
    try {
      storage.removeItem(key)
    } catch {
      // Ignore cleanup failures and continue best-effort.
    }
  }
}

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

  if (parsed.schemaVersion !== DOCUMENT_SCHEMA_VERSION && parsed.schemaVersion !== 1 && parsed.schemaVersion !== 2) {
    return {
      ok: false,
      error: `Nicht unterstuetzte schemaVersion: ${String(parsed.schemaVersion)}`,
    }
  }

  let documentToValidate = parsed.document
  if (parsed.schemaVersion === 1) {
    documentToValidate = migrateV1ToV2(documentToValidate)
  }
  if (parsed.schemaVersion === 1 || parsed.schemaVersion === 2) {
    documentToValidate = migrateV2ToV3(documentToValidate)
  }

  if (!isValidDocumentShape(documentToValidate)) {
    return {
      ok: false,
      error: 'Dokumentdaten sind unvollstaendig (segments/children fehlen).',
    }
  }

  return {
    ok: true,
    value: documentToValidate,
  }
}

export const saveDocumentToLocalStorage = (document, storage = globalThis?.localStorage) => {
  if (!storage || typeof storage.setItem !== 'function') {
    return false
  }

  const serialized = serializeDocumentPayload(document)

  try {
    storage.setItem(LOCAL_STORAGE_DOCUMENT_KEY, serialized)
    return true
  } catch (err) {
    if (isQuotaExceededError(err)) {
      cleanupStorageTraceKeys(storage)

      try {
        storage.setItem(LOCAL_STORAGE_DOCUMENT_KEY, serialized)
        return true
      } catch {
        // Retry failed, fall through to warning below.
      }
    }

    // Fail gracefully if storage quota is exceeded or other storage errors occur.
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

  const json = serializeDocumentPayload(roadmapDocument, { pretty: true })
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
