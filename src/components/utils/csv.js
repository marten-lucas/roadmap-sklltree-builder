import { normalizeStatusKey } from '../config'
import { createEmptyDocument } from './documentState'
import { buildExportFileName, DEFAULT_EXPORT_BASE_NAME } from './exportFileName'
import { normalizeEffort, normalizeBenefit } from './effortBenefit'
import { ensureNodeLevels, findAdditionalDependencyCycles } from './treeData'
import { generateUUID } from './uuid'
import { getLevelStatus } from './nodeStatus'
import { createRelease } from './releases'

export const CSV_EXPORT_FILE_NAME = `${DEFAULT_EXPORT_BASE_NAME}.csv`

export const CSV_EXPORT_HEADERS = [
  'ShortName',
  'Name',
  'Scope',
  'Ebene',
  'Segment',
  'Parent',
  'AdditionalDependency',
  'ProgressLevel',
  'Status',
  'ReleaseNotes',
  'Effort',
  'EffortCustomPoints',
  'Benefit',
]

const CSV_HEADER_ALIASES = {
  shortName: ['shortname', 'node short name'],
  name: ['name', 'node name'],
  scope: ['scope'],
  level: ['ebene', 'level'],
  segment: ['segment'],
  parent: ['parent'],
  additionalDependency: ['additionaldependency', 'additional dependency'],
  progressLevel: ['progresslevel', 'progress level'],
  status: ['status'],
  releaseNotes: ['releasenotes', 'release notes'],
  effort: ['effort'],
  effortCustomPoints: ['effortcustompoints', 'effort custom points'],
  benefit: ['benefit'],
}

const CSV_STATUS_ALIASES = new Map([
  ['done', 'done'],
  ['now', 'now'],
  ['next', 'next'],
  ['later', 'later'],
  ['fertig', 'done'],
  ['jetzt', 'now'],
  ['spaeter', 'later'],
  ['später', 'later'],
])

const normalizeHeaderName = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

const isBlankCell = (value) => String(value ?? '').trim().length === 0

const escapeCsvValue = (value) => {
  const text = String(value ?? '')
  if (text.length === 0) {
    return ''
  }

  const requiresQuotes = /[",\r\n]/.test(text) || /^\s|\s$/.test(text)
  if (!requiresQuotes) {
    return text
  }

  return `"${text.replace(/"/g, '""')}"`
}

const joinCsvRow = (values) => values.map(escapeCsvValue).join(',')

const parseCsvTable = (csvText) => {
  const text = String(csvText ?? '').replace(/^\uFEFF/, '')
  const rows = []
  const currentRow = []
  let currentCell = ''
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const nextChar = text[index + 1]

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentCell += '"'
        index += 1
        continue
      }

      if (char === '"') {
        inQuotes = false
        continue
      }

      currentCell += char
      continue
    }

    if (char === '"' && currentCell.length === 0) {
      inQuotes = true
      continue
    }

    if (char === ',') {
      currentRow.push(currentCell)
      currentCell = ''
      continue
    }

    if (char === '\r' || char === '\n') {
      if (char === '\r' && nextChar === '\n') {
        index += 1
      }

      currentRow.push(currentCell)
      if (currentRow.some((cell) => !isBlankCell(cell))) {
        rows.push([...currentRow])
      }
      currentRow.length = 0
      currentCell = ''
      continue
    }

    currentCell += char
  }

  if (inQuotes) {
    return {
      ok: false,
      error: 'CSV contains an unclosed quote.',
    }
  }

  currentRow.push(currentCell)
  if (currentRow.some((cell) => !isBlankCell(cell))) {
    rows.push([...currentRow])
  }

  return {
    ok: true,
    rows,
  }
}

const getHeaderIndex = (headerIndexByName, aliases, required = true) => {
  for (const alias of aliases) {
    const normalizedAlias = normalizeHeaderName(alias)
    if (headerIndexByName.has(normalizedAlias)) {
      return headerIndexByName.get(normalizedAlias)
    }
  }

  if (!required) {
    return null
  }

  throw new Error(`CSV is missing a column. Expected: ${aliases.join(', ')}`)
}

const splitMultiValueCell = (value) => String(value ?? '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean)

const normalizeParentRef = (value) => {
  const trimmed = String(value ?? '').trim()
  if (!trimmed || trimmed === '-') {
    return null
  }

  return trimmed
}

const normalizeStatusCell = (value) => {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) {
    return 'later'
  }

  const normalized = CSV_STATUS_ALIASES.get(trimmed.toLowerCase())
  if (!normalized) {
    return null
  }

  return normalized
}

const formatImportErrors = (errors) => {
  const items = Array.isArray(errors) ? errors.filter(Boolean) : [String(errors ?? '')].filter(Boolean)
  if (items.length === 0) {
    return 'CSV-Import fehlgeschlagen.'
  }

  return `CSV-Import fehlgeschlagen:\n- ${items.join('\n- ')}`
}

const collectTreeNodes = (nodes, parentShortName = null, result = []) => {
  const orderedNodes = [...(nodes ?? [])]

  for (const node of orderedNodes) {
    result.push({
      node,
      parentShortName,
    })
    collectTreeNodes(node.children ?? [], node.shortName ?? null, result)
  }

  return result
}

const buildNodeOrderMap = (document) => {
  const nodes = collectTreeNodes(document?.children ?? [])
  const orderMap = new Map()

  nodes.forEach((entry, index) => {
    const shortName = String(entry.node?.shortName ?? '').trim()
    if (shortName && !orderMap.has(shortName)) {
      orderMap.set(shortName, index)
    }
  })

  return orderMap
}

const validateParentCycles = (parentByShortName) => {
  const stateByShortName = new Map()
  const cycles = []

  const visit = (shortName, trail = []) => {
    const state = stateByShortName.get(shortName)
    if (state === 'visiting') {
      const cycleStart = trail.indexOf(shortName)
      const cycleTrail = cycleStart >= 0 ? trail.slice(cycleStart).concat(shortName) : [...trail, shortName]
      cycles.push(cycleTrail)
      return
    }

    if (state === 'visited') {
      return
    }

    stateByShortName.set(shortName, 'visiting')
    const parentShortName = parentByShortName.get(shortName) ?? null
    if (parentShortName) {
      visit(parentShortName, [...trail, shortName])
    }
    stateByShortName.set(shortName, 'visited')
  }

  for (const shortName of parentByShortName.keys()) {
    visit(shortName)
  }

  return cycles
}

const buildLevelScopes = (scopeLabels, scopeIdByLabelKey) => {
  const scopeIds = []

  for (const scopeLabel of scopeLabels) {
    const normalizedKey = normalizeHeaderName(scopeLabel)
    const scopeId = scopeIdByLabelKey.get(normalizedKey)
    if (scopeId) {
      scopeIds.push(scopeId)
    }
  }

  return Array.from(new Set(scopeIds))
}

const normalizeCsvImportOptions = (options = {}) => ({
  ignoreSegments: options?.ignoreSegments === true,
  ignoreManualLevels: options?.ignoreManualLevels === true,
})

const applyCsvImportOptions = (document, options = {}) => {
  const { ignoreSegments, ignoreManualLevels } = normalizeCsvImportOptions(options)

  if (!ignoreSegments && !ignoreManualLevels) {
    return document
  }

  const visitNode = (node, depth) => {
    if (ignoreSegments) {
      node.segmentId = null
    }

    if (ignoreManualLevels) {
      node.ebene = depth
    }

    for (const child of node.children ?? []) {
      visitNode(child, depth + 1)
    }
  }

  for (const root of document.children ?? []) {
    visitNode(root, 1)
  }

  if (ignoreSegments) {
    document.segments = []
  }

  return document
}

const buildDocumentFromRows = (rows, options = {}) => {
  const { ignoreSegments, ignoreManualLevels } = normalizeCsvImportOptions(options)
  const errors = []
  const dataRows = [...rows]

  if (dataRows.length === 0) {
    return {
      ok: false,
      errors: ['CSV is empty or contains no data rows.'],
    }
  }

  const headers = dataRows.shift() ?? []
  const headerIndexByName = new Map(headers.map((header, index) => [normalizeHeaderName(header), index]))

  let shortNameIndex
  let nameIndex
  let scopeIndex
  let levelIndex
  let segmentIndex
  let parentIndex
  let additionalDependencyIndex
  let progressLevelIndex
  let statusIndex
  let releaseNotesIndex
  let effortIndex
  let effortCustomPointsIndex
  let benefitIndex

  try {
    shortNameIndex = getHeaderIndex(headerIndexByName, CSV_HEADER_ALIASES.shortName)
    nameIndex = getHeaderIndex(headerIndexByName, CSV_HEADER_ALIASES.name)
    scopeIndex = getHeaderIndex(headerIndexByName, CSV_HEADER_ALIASES.scope)
    levelIndex = getHeaderIndex(headerIndexByName, CSV_HEADER_ALIASES.level)
    segmentIndex = getHeaderIndex(headerIndexByName, CSV_HEADER_ALIASES.segment)
    parentIndex = getHeaderIndex(headerIndexByName, CSV_HEADER_ALIASES.parent)
    additionalDependencyIndex = getHeaderIndex(headerIndexByName, CSV_HEADER_ALIASES.additionalDependency, false)
    progressLevelIndex = getHeaderIndex(headerIndexByName, CSV_HEADER_ALIASES.progressLevel, false)
    statusIndex = getHeaderIndex(headerIndexByName, CSV_HEADER_ALIASES.status)
    releaseNotesIndex = getHeaderIndex(headerIndexByName, CSV_HEADER_ALIASES.releaseNotes, false)
    effortIndex = getHeaderIndex(headerIndexByName, CSV_HEADER_ALIASES.effort, false)
    effortCustomPointsIndex = getHeaderIndex(headerIndexByName, CSV_HEADER_ALIASES.effortCustomPoints, false)
    benefitIndex = getHeaderIndex(headerIndexByName, CSV_HEADER_ALIASES.benefit, false)
  } catch (error) {
    return {
      ok: false,
      errors: [error instanceof Error ? error.message : String(error)],
    }
  }

  const rowGroups = new Map()

  dataRows.forEach((row, rowOffset) => {
    const rowNumber = rowOffset + 2
    const shortName = String(row[shortNameIndex] ?? '').trim()
    const label = String(row[nameIndex] ?? '').trim()
    const levelText = String(row[levelIndex] ?? '').trim()
    const segmentText = String(row[segmentIndex] ?? '').trim()
    const scopeText = String(row[scopeIndex] ?? '')
    const parentShortName = normalizeParentRef(row[parentIndex])
    const progressLevelText = progressLevelIndex == null ? '' : String(row[progressLevelIndex] ?? '').trim()
    const status = normalizeStatusCell(row[statusIndex])
    const releaseNote = releaseNotesIndex == null ? '' : String(row[releaseNotesIndex] ?? '')
    const additionalDependencyText = additionalDependencyIndex == null ? '' : String(row[additionalDependencyIndex] ?? '')
    const effortSizeText = effortIndex == null ? '' : String(row[effortIndex] ?? '').trim().toLowerCase()
    const effortCustomPointsText = effortCustomPointsIndex == null ? '' : String(row[effortCustomPointsIndex] ?? '').trim()
    const benefitSizeText = benefitIndex == null ? '' : String(row[benefitIndex] ?? '').trim().toLowerCase()

    const rowErrors = []

    if (!shortName) {
      rowErrors.push(`Row ${rowNumber}: ShortName is missing.`)
    }

    if (!label) {
      rowErrors.push(`Row ${rowNumber}: Name is missing.`)
    }

    const parsedLevel = Number.parseInt(levelText, 10)
    const level = Number.isInteger(parsedLevel) && parsedLevel >= 1 ? parsedLevel : null
    if (!ignoreManualLevels && level == null) {
      rowErrors.push(`Row ${rowNumber}: Level is invalid: ${levelText || '(empty)'}.`)
    }

    if (!status) {
      rowErrors.push(`Reihe ${rowNumber}: Status ist ungueltig: ${String(row[statusIndex] ?? '').trim() || '(leer)'}.`)
    }

    const progressLevel = progressLevelText ? Number.parseInt(progressLevelText, 10) : 1
    if (!Number.isInteger(progressLevel) || progressLevel < 1) {
      rowErrors.push(`Row ${rowNumber}: ProgressLevel is invalid: ${progressLevelText || '(empty)'}.`)
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors)
      return
    }

    // Parse dependency refs: "BRA" → {shortName:'BRA', progressLevel:1}, "BRA:2" → {shortName:'BRA', progressLevel:2}
    const dependencyLevelRefs = splitMultiValueCell(additionalDependencyText)
      .map((ref) => {
        const colonIdx = ref.lastIndexOf(':')
        if (colonIdx > 0) {
          const sn = ref.slice(0, colonIdx).trim()
          const pl = Number.parseInt(ref.slice(colonIdx + 1), 10)
          return sn && Number.isInteger(pl) && pl >= 1 ? { shortName: sn, progressLevel: pl } : { shortName: ref.trim(), progressLevel: 1 }
        }
        return ref.trim() ? { shortName: ref.trim(), progressLevel: 1 } : null
      })
      .filter(Boolean)

    const scopeLabels = splitMultiValueCell(scopeText)

    const rowEntry = {
      rowNumber,
      shortName,
      label,
      level,
      segmentText,
      parentShortName,
      dependencyLevelRefs,
      progressLevel,
      status,
      releaseNote,
      scopeLabels,
      order: rowOffset,
      effortSizeText,
      effortCustomPointsText,
      benefitSizeText,
    }

    const group = rowGroups.get(shortName)
    if (!group) {
      rowGroups.set(shortName, {
        shortName,
        label,
        level,
        segmentText,
        parentShortName,
        rows: [rowEntry],
        firstOrder: rowOffset,
        effortSizeText,
        effortCustomPointsText,
        benefitSizeText,
      })
      return
    }

    group.rows.push(rowEntry)
    if (group.label !== label) {
      errors.push(`Node ${shortName} has inconsistent names across CSV rows.`)
    }

    if (!ignoreManualLevels && group.level !== level) {
      errors.push(`Node ${shortName} has inconsistent levels across CSV rows.`)
    }

    if (!ignoreSegments && group.segmentText !== segmentText) {
      errors.push(`Node ${shortName} has inconsistent segments across CSV rows.`)
    }

    if (group.parentShortName !== parentShortName) {
      errors.push(`Node ${shortName} has inconsistent parent values across CSV rows.`)
    }
  })

  for (const group of rowGroups.values()) {
    const progressLevels = new Set()
    for (const row of group.rows) {
      if (progressLevels.has(row.progressLevel)) {
        errors.push(`Node ${group.shortName} has duplicate ProgressLevel ${row.progressLevel}.`)
      }
      progressLevels.add(row.progressLevel)
    }
  }

  const parentByShortName = new Map([...rowGroups.values()].map((group) => [group.shortName, group.parentShortName]))
  for (const [shortName, parentShortName] of parentByShortName.entries()) {
    if (parentShortName && !rowGroups.has(parentShortName)) {
      errors.push(`Node ${shortName} referenziert unbekannten Parent ${parentShortName}.`)
    }
  }

  for (const group of rowGroups.values()) {
    for (const row of group.rows) {
      for (const ref of row.dependencyLevelRefs ?? []) {
        if (!rowGroups.has(ref.shortName)) {
          errors.push(`Node ${group.shortName} referenziert unbekannte AdditionalDependency ${ref.shortName}.`)
        }
      }
    }
  }

  const cycles = validateParentCycles(parentByShortName)
  for (const cycle of cycles) {
    errors.push(`Parent cycle detected: ${cycle.join(' -> ')}`)
  }

  const rootGroups = []
  for (const group of rowGroups.values()) {
    if (!group.parentShortName) {
      rootGroups.push(group)
    }
  }

  const orderedGroupEntries = [...rowGroups.values()].sort((left, right) => left.firstOrder - right.firstOrder)
  const orderedShortNames = orderedGroupEntries.map((group) => group.shortName)
  const orderMap = new Map(orderedShortNames.map((shortName, index) => [shortName, index]))

  const segmentsByKey = new Map()
  const scopesByKey = new Map()

  for (const group of orderedGroupEntries) {
    const segmentKey = normalizeHeaderName(group.segmentText)
    if (segmentKey && !segmentsByKey.has(segmentKey)) {
      segmentsByKey.set(segmentKey, {
        id: `segment-${generateUUID()}`,
        label: group.segmentText,
      })
    }

    for (const row of group.rows) {
      for (const scopeLabel of row.scopeLabels) {
        const scopeKey = normalizeHeaderName(scopeLabel)
        if (scopeKey && !scopesByKey.has(scopeKey)) {
          scopesByKey.set(scopeKey, {
            id: `scope-${generateUUID()}`,
            label: scopeLabel,
          })
        }
      }
    }
  }

  const scopeIdByLabelKey = new Map([...scopesByKey.entries()].map(([key, scope]) => [key, scope.id]))
  const segmentIdByLabelKey = new Map([...segmentsByKey.entries()].map(([key, segment]) => [key, segment.id]))

  const nodeByShortName = new Map()

  for (const group of orderedGroupEntries) {
    const segmentId = group.segmentText ? (segmentIdByLabelKey.get(normalizeHeaderName(group.segmentText)) ?? null) : null
    const orderedRows = [...group.rows].sort((left, right) => {
      if (left.progressLevel !== right.progressLevel) {
        return left.progressLevel - right.progressLevel
      }

      return left.order - right.order
    })

    const levels = orderedRows.map((row, index) => {
      const scopeIds = buildLevelScopes(row.scopeLabels, scopeIdByLabelKey)
      return {
        id: generateUUID(),
        label: `Level ${row.progressLevel || index + 1}`,
        statuses: {},
        _importStatus: normalizeStatusKey(row.status),
        releaseNote: row.releaseNote,
        scopeIds,
        additionalDependencyLevelIds: [],
        effort: normalizeEffort({
          size: row.effortSizeText || 'unclear',
          customPoints: row.effortCustomPointsText ? Number(row.effortCustomPointsText) || null : null,
        }),
        benefit: normalizeBenefit({
          size: row.benefitSizeText || 'unclear',
        }),
        // store raw refs temporarily; resolved below after all nodes are built
        _dependencyLevelRefs: row.dependencyLevelRefs ?? [],
      }
    })

    const node = {
      id: generateUUID(),
      label: group.label,
      shortName: group.shortName,
      levels,
      ebene: group.level,
      segmentId,
      additionalDependentIds: [],
      children: [],
      // keep root-level effort/benefit for backward compat (display helper reads from levels first)
      effort: normalizeEffort({
        size: group.effortSizeText || 'unclear',
        customPoints: group.effortCustomPointsText ? Number(group.effortCustomPointsText) || null : null,
      }),
      benefit: normalizeBenefit({
        size: group.benefitSizeText || 'unclear',
      }),
    }

    nodeByShortName.set(group.shortName, node)
  }

  for (const group of orderedGroupEntries) {
    const node = nodeByShortName.get(group.shortName)
    if (!node) {
      continue
    }

    if (group.parentShortName) {
      const parentNode = nodeByShortName.get(group.parentShortName)
      if (parentNode) {
        parentNode.children.push(node)
      }
    }
  }

  for (const node of nodeByShortName.values()) {
    node.children.sort((left, right) => {
      const leftOrder = orderMap.get(String(left.shortName ?? '')) ?? 0
      const rightOrder = orderMap.get(String(right.shortName ?? '')) ?? 0
      return leftOrder - rightOrder
    })
  }

  // Build shortName:progressLevelIndex → levelId map for ref resolution
  const levelIdByRef = new Map()
  for (const node of nodeByShortName.values()) {
    for (let i = 0; i < node.levels.length; i++) {
      const level = node.levels[i]
      const key = `${node.shortName}:${i + 1}`
      levelIdByRef.set(key, level.id)
    }
  }

  const incomingByShortName = new Map([...rowGroups.keys()].map((shortName) => [shortName, []]))

  // Resolve per-level dependency refs → level IDs
  for (const group of orderedGroupEntries) {
    const node = nodeByShortName.get(group.shortName)
    if (!node) continue

    for (const level of node.levels) {
      const rawRefs = level._dependencyLevelRefs ?? []
      const resolvedLevelIds = []
      const seenRefs = new Set()

      for (const ref of rawRefs) {
        const refKey = `${ref.shortName}:${ref.progressLevel}`
        if (seenRefs.has(refKey)) continue

        if (ref.shortName === group.shortName) {
          errors.push(`Node ${group.shortName} has an invalid AdditionalDependency ${ref.shortName} (self-reference).`)
          continue
        }

        const targetLevelId = levelIdByRef.get(refKey)
        if (targetLevelId) {
          seenRefs.add(refKey)
          resolvedLevelIds.push(targetLevelId)
          incomingByShortName.get(ref.shortName)?.push(group.shortName)
        }
      }

      level.additionalDependencyLevelIds = resolvedLevelIds
      delete level._dependencyLevelRefs
    }
  }

  for (const node of nodeByShortName.values()) {
    node.additionalDependentIds = Array.from(new Set(incomingByShortName.get(node.shortName) ?? []))
      .map((shortName) => nodeByShortName.get(shortName)?.id)
      .filter(Boolean)
  }

  const roots = rootGroups
    .map((group) => nodeByShortName.get(group.shortName))
    .filter(Boolean)
    .sort((left, right) => (orderMap.get(String(left.shortName ?? '')) ?? 0) - (orderMap.get(String(right.shortName ?? '')) ?? 0))

  const nodeById = new Map([...nodeByShortName.values()].map((node) => [node.id, node]))

  if (errors.length > 0) {
    return { ok: false, errors }
  }

  const cycleErrors = []
  const detectedCycles = findAdditionalDependencyCycles({ children: roots })

  for (const cycle of detectedCycles) {
    const cycleNodeIds = cycle[0] === cycle[cycle.length - 1] ? cycle.slice(0, -1) : cycle
    const cycleLabels = cycleNodeIds.map((nodeId) => {
      const node = nodeById.get(nodeId)
      const label = String(node?.shortName ?? node?.label ?? nodeId).trim()
      return label || nodeId
    })

    cycleErrors.push(`AdditionalDependency-Zirkelbezug gefunden: ${cycleLabels.join(' -> ')}`)
  }

  if (cycleErrors.length > 0) {
    return {
      ok: false,
      errors: cycleErrors,
    }
  }

  const document = createEmptyDocument()
  const csvRelease = document.releases[0]
  const csvReleaseId = csvRelease?.id
  // Assign imported statuses into the first release's statuses map
  if (csvReleaseId) {
    for (const node of nodeByShortName.values()) {
      for (const level of node.levels) {
        if (level._importStatus !== undefined) {
          level.statuses = { [csvReleaseId]: level._importStatus }
          delete level._importStatus
        }
      }
    }
  }
  document.segments = Array.from(segmentsByKey.values())
  document.scopes = Array.from(scopesByKey.values())
  document.children = roots

  return {
    ok: true,
    value: applyCsvImportOptions(document, { ignoreSegments, ignoreManualLevels }),
  }
}

export const serializeDocumentToCsv = (document, releaseId = null) => {
  const segmentLabelById = new Map((document?.segments ?? []).map((segment) => [segment.id, String(segment.label ?? '').trim()]))
  const scopeLabelById = new Map((document?.scopes ?? []).map((scope) => [scope.id, String(scope.label ?? '').trim()]))
  const nodeOrderMap = buildNodeOrderMap(document)
  const flattenedNodes = collectTreeNodes(document?.children ?? [])
  const nodeById = new Map(flattenedNodes.map((entry) => [entry.node?.id, entry.node]))

  // Build levelId → { shortName, progressLevel } for dep serialization
  const levelRefById = new Map()
  for (const { node } of flattenedNodes) {
    if (!node) continue
    const levels = ensureNodeLevels(node)
    levels.forEach((level, index) => {
      levelRefById.set(level.id, { shortName: String(node.shortName ?? '').trim(), progressLevel: index + 1 })
    })
  }

  const rows = [CSV_EXPORT_HEADERS]

  const visit = (node, parentShortName = '') => {
    const levels = ensureNodeLevels(node)
    const segmentLabel = segmentLabelById.get(node.segmentId ?? null) ?? ''

    levels.forEach((level, index) => {
      const scopeLabels = Array.isArray(level.scopeIds)
        ? level.scopeIds
            .map((scopeId) => scopeLabelById.get(scopeId) ?? '')
            .filter(Boolean)
        : []

      const additionalDependencyRefs = (level.additionalDependencyLevelIds ?? [])
        .map((levelId) => levelRefById.get(levelId))
        .filter(Boolean)
        .map(({ shortName, progressLevel }) => (progressLevel === 1 ? shortName : `${shortName}:${progressLevel}`))

      rows.push([
        String(node.shortName ?? '').trim(),
        String(node.label ?? '').trim(),
        scopeLabels.join(', '),
        String(node.ebene ?? index + 1),
        segmentLabel,
        parentShortName,
        additionalDependencyRefs.join(', '),
        String(index + 1),
        normalizeStatusKey(getLevelStatus(level, releaseId)),
        String(level.releaseNote ?? ''),
        String((level.effort?.size && level.effort.size !== 'unclear') ? level.effort.size : (node.effort?.size ?? 'unclear')),
        (level.effort?.size === 'custom' && level.effort?.customPoints != null)
          ? String(level.effort.customPoints)
          : (node.effort?.size === 'custom' && node.effort?.customPoints != null ? String(node.effort.customPoints) : ''),
        String((level.benefit?.size && level.benefit.size !== 'unclear') ? level.benefit.size : (node.benefit?.size ?? 'unclear')),
      ])
    })

    const orderedChildren = [...(node.children ?? [])].sort((left, right) => {
      const leftOrder = nodeOrderMap.get(String(left.shortName ?? '')) ?? 0
      const rightOrder = nodeOrderMap.get(String(right.shortName ?? '')) ?? 0
      return leftOrder - rightOrder
    })

    for (const child of orderedChildren) {
      visit(child, String(node.shortName ?? '').trim())
    }
  }

  const orderedRoots = [...(document?.children ?? [])].sort((left, right) => {
    const leftOrder = nodeOrderMap.get(String(left.shortName ?? '')) ?? 0
    const rightOrder = nodeOrderMap.get(String(right.shortName ?? '')) ?? 0
    return leftOrder - rightOrder
  })

  for (const root of orderedRoots) {
    visit(root, '')
  }

  return rows.map(joinCsvRow).join('\n')
}

export const downloadDocumentCsv = (roadmapDocument, releaseId = null, fileName = null) => {
  if (typeof window === 'undefined' || typeof window.document === 'undefined') {
    return false
  }

  const resolvedFileName = fileName || buildExportFileName(roadmapDocument, 'csv')
  const csvText = serializeDocumentToCsv(roadmapDocument, releaseId)
  readDocumentFromCsvText(csvText)
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' })
  const url = window.URL.createObjectURL(blob)
  const link = window.document.createElement('a')

  link.href = url
  link.download = resolvedFileName
  link.style.display = 'none'
  window.document.body.appendChild(link)
  link.click()
  window.document.body.removeChild(link)
  window.URL.revokeObjectURL(url)

  return true
}

export const parseDocumentFromCsvText = (csvText, options = {}) => {
  const parsed = parseCsvTable(csvText)
  if (!parsed.ok) {
    return {
      ok: false,
      errors: [parsed.error],
    }
  }

  return buildDocumentFromRows(parsed.rows, options)
}

export const readDocumentFromCsvText = (csvText, options = {}) => {
  const parsed = parseDocumentFromCsvText(csvText, options)
  if (!parsed.ok) {
    throw new Error(formatImportErrors(parsed.errors))
  }

  return parsed.value
}

export const formatCsvImportErrors = formatImportErrors
