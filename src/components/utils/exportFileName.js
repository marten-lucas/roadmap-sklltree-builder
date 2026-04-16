export const DEFAULT_EXPORT_BASE_NAME = 'skilltree-roadmap'

const normalizeFileNameToken = (value) => String(value ?? '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')

export const sanitizeFileNamePart = (value, fallback = DEFAULT_EXPORT_BASE_NAME, options = {}) => {
  const { allowEmpty = false } = options

  const normalizedValue = normalizeFileNameToken(value)
  if (normalizedValue) {
    return normalizedValue
  }

  const normalizedFallback = normalizeFileNameToken(fallback)
  if (normalizedFallback) {
    return normalizedFallback
  }

  return allowEmpty ? '' : DEFAULT_EXPORT_BASE_NAME
}

const padTimestampPart = (value) => String(value ?? '').padStart(2, '0')

export const formatExportTimestamp = (now = new Date()) => {
  const resolvedDate = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date()

  const datePart = [
    resolvedDate.getFullYear(),
    padTimestampPart(resolvedDate.getMonth() + 1),
    padTimestampPart(resolvedDate.getDate()),
  ].join('-')

  const timePart = [
    padTimestampPart(resolvedDate.getHours()),
    padTimestampPart(resolvedDate.getMinutes()),
  ].join('-')

  return `${datePart}_${timePart}`
}

export const buildExportFileName = (roadmapDocument, extension, options = {}) => {
  const {
    now = new Date(),
    suffix = '',
    fallbackBaseName = DEFAULT_EXPORT_BASE_NAME,
  } = options

  const baseName = sanitizeFileNamePart(roadmapDocument?.systemName, fallbackBaseName)
  const suffixPart = sanitizeFileNamePart(suffix, '', { allowEmpty: true })
  const normalizedExtension = String(extension ?? '')
    .trim()
    .replace(/^\.+/, '')
    .toLowerCase() || 'txt'

  return `${baseName}_${formatExportTimestamp(now)}${suffixPart ? `_${suffixPart}` : ''}.${normalizedExtension}`
}
