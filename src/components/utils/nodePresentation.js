import { NODE_LABEL_ZOOM, STATUS_LABELS } from '../config'
import { getDisplayStatusKey, getLevelStatusKeys } from './nodeStatus'
import { resolveScopeEntries } from './scopeDisplay'
import { getLevelDisplayLabel } from './treeData'
import { renderMarkdownToHtml } from './markdown'

export const EMPTY_RELEASE_NOTE = 'Keine Release Note hinterlegt.'

export const getNodeLabelMode = (scale) => {
  if (scale < NODE_LABEL_ZOOM.farToMid) return 'far'
  if (scale >= NODE_LABEL_ZOOM.closeToVeryClose) return 'very-close'
  if (scale >= NODE_LABEL_ZOOM.midToClose) return 'close'
  return 'mid'
}

export const getNodeShortName = (node) => {
  const explicitShortName = String(node?.shortName ?? '').trim().toLowerCase().slice(0, 3)
  if (explicitShortName) {
    return explicitShortName
  }

  const letters = String(node?.label ?? '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toLowerCase()
    .slice(0, 3)

  return letters || 'skl'
}

export const getNodeTooltipLevel = (node, releaseId = null) => {
  const levels = Array.isArray(node?.levels) ? node.levels : []
  const levelStatusKeys = getLevelStatusKeys(node, releaseId)
  const preferredStatus = getDisplayStatusKey(node, releaseId)
  const preferredLevel = levels.find((level, index) => (
    levelStatusKeys[index] === preferredStatus && String(level?.releaseNote ?? '').trim()
  ))

  if (preferredLevel) {
    return preferredLevel
  }

  return levels.find((level) => String(level?.releaseNote ?? '').trim()) ?? null
}

export const getNodeTooltipReleaseNote = (node, releaseId = null) => {
  const tooltipLevel = getNodeTooltipLevel(node, releaseId)
  const releaseNote = String(tooltipLevel?.releaseNote ?? '').trim()
  return releaseNote || EMPTY_RELEASE_NOTE
}

export const getPreferredVeryCloseLevel = (levels, fallbackNote = EMPTY_RELEASE_NOTE) => {
  if (!Array.isArray(levels) || levels.length === 0) {
    return {
      label: 'L1',
      releaseNote: String(fallbackNote ?? EMPTY_RELEASE_NOTE).trim() || EMPTY_RELEASE_NOTE,
      releaseNoteHtml: renderMarkdownToHtml(String(fallbackNote ?? EMPTY_RELEASE_NOTE).trim() || EMPTY_RELEASE_NOTE),
      scopeLabels: [],
      effort: null,
      benefit: null,
    }
  }

  const withNotes = levels.find((level) => String(level?.releaseNote ?? '').trim())
  const first = levels[0] ?? null
  const selected = withNotes ?? first

  return {
    ...selected,
    label: String(selected?.label ?? 'L1'),
    releaseNote: String(selected?.releaseNote ?? fallbackNote ?? EMPTY_RELEASE_NOTE).trim() || EMPTY_RELEASE_NOTE,
    releaseNoteHtml: String(selected?.releaseNoteHtml ?? '').trim() || renderMarkdownToHtml(String(selected?.releaseNote ?? fallbackNote ?? EMPTY_RELEASE_NOTE).trim() || EMPTY_RELEASE_NOTE),
  }
}

export const buildNodeExportLevelEntries = (node, scopeOptions = [], releaseId = null) => {
  const levels = Array.isArray(node?.levels) ? node.levels : []
  const levelStatusKeys = getLevelStatusKeys(node, releaseId)

  return levels.map((level, index) => {
    const statusKey = String(levelStatusKeys[index] ?? level?.status ?? 'later').trim().toLowerCase() || 'later'

    return {
      id: level?.id ?? `level-${index + 1}`,
      label: getLevelDisplayLabel(level?.label, index),
      status: statusKey,
      statusLabel: STATUS_LABELS[statusKey] ?? String(level?.status ?? 'Later'),
      releaseNote: String(level?.releaseNote ?? ''),
      releaseNoteHtml: renderMarkdownToHtml(String(level?.releaseNote ?? '')),
      scopeLabels: resolveScopeEntries(level?.scopeIds, scopeOptions),
      effort: level?.effort ?? node?.effort ?? null,
      benefit: level?.benefit ?? node?.benefit ?? null,
    }
  })
}

export const getNodeTooltipViewModel = ({
  node,
  scopeOptions = [],
  releaseId = null,
  hoveredLevelIndex = null,
}) => {
  const levels = Array.isArray(node?.levels) ? node.levels : []
  const tooltipLevel = getNodeTooltipLevel(node, releaseId)
  const exportLevelEntries = buildNodeExportLevelEntries(node, scopeOptions, releaseId)
  const initialVeryCloseIndex = Math.max(0, levels.indexOf(tooltipLevel))
  const hasHoveredLevel = Number.isInteger(hoveredLevelIndex) && hoveredLevelIndex >= 0 && hoveredLevelIndex < levels.length
  const activeEntry = hasHoveredLevel ? exportLevelEntries[hoveredLevelIndex] ?? null : null
  const tooltipScopeLabels = resolveScopeEntries(tooltipLevel?.scopeIds, scopeOptions)
  const tooltipEffort = tooltipLevel?.effort ?? node?.effort
  const tooltipBenefit = tooltipLevel?.benefit ?? node?.benefit
  const tooltipReleaseNote = getNodeTooltipReleaseNote(node, releaseId)

  return {
    shortName: getNodeShortName(node),
    tooltipLevel,
    tooltipReleaseNote,
    tooltipScopeLabels,
    tooltipEffort,
    tooltipBenefit,
    activeTooltipReleaseNote: activeEntry
      ? (String(activeEntry.releaseNote ?? '').trim() || EMPTY_RELEASE_NOTE)
      : tooltipReleaseNote,
    activeTooltipScopeLabels: activeEntry?.scopeLabels ?? tooltipScopeLabels,
    activeTooltipEffort: activeEntry?.effort ?? tooltipEffort,
    activeTooltipBenefit: activeEntry?.benefit ?? tooltipBenefit,
    activeLevelLabel: activeEntry?.label ?? '',
    activeTooltipTitle: activeEntry && exportLevelEntries.length > 1
      ? `${String(node?.label ?? '')} – ${activeEntry.label}`
      : String(node?.label ?? ''),
    exportLevelEntries,
    initialVeryCloseIndex,
  }
}
