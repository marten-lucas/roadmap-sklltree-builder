export const getHtmlImportErrorMessage = (error) => {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'The file could not be imported. Please provide a valid HTML export file.'
}

export const getCsvImportErrorMessage = (error) => {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'The file could not be imported. Please provide a valid CSV file.'
}

export const getCsvExportErrorMessage = (error) => {
  if (error instanceof Error && error.message) {
    return error.message.replace(/^CSV import failed:/, 'CSV export failed:')
  }

  return 'CSV export failed. Please check CSV consistency.'
}

export const confirmResetDocument = () => window.confirm(
  'Really reset the roadmap? This action can be undone with Undo.',
)
