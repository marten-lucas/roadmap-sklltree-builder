export const getHtmlImportErrorMessage = (error) => {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'Die Datei konnte nicht importiert werden. Bitte eine gueltige HTML-Exportdatei verwenden.'
}

export const getCsvImportErrorMessage = (error) => {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'Die Datei konnte nicht importiert werden. Bitte eine gueltige CSV-Datei verwenden.'
}

export const getCsvExportErrorMessage = (error) => {
  if (error instanceof Error && error.message) {
    return error.message.replace(/^CSV-Import fehlgeschlagen:/, 'CSV-Export fehlgeschlagen:')
  }

  return 'CSV-Export fehlgeschlagen. Bitte die CSV-Konsistenz pruefen.'
}

export const confirmResetDocument = () => window.confirm(
  'Roadmap wirklich zuruecksetzen? Dieser Schritt kann per Undo rueckgaengig gemacht werden.',
)
