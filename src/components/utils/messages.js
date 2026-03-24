export const getHtmlImportErrorMessage = (error) => {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'Die Datei konnte nicht importiert werden. Bitte eine gueltige HTML-Exportdatei verwenden.'
}

export const confirmResetDocument = () => window.confirm(
  'Roadmap wirklich zuruecksetzen? Dieser Schritt kann per Undo rueckgaengig gemacht werden.',
)
