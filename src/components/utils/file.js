export const readFileAsText = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result ?? ''))
  reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'))
  reader.readAsText(file)
})

export const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result ?? ''))
  reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'))
  reader.readAsDataURL(file)
})

export const isValidSvgMarkup = (markup) => {
  if (typeof markup !== 'string' || markup.trim().length === 0) {
    return false
  }

  const parser = new DOMParser()
  const parsed = parser.parseFromString(markup, 'image/svg+xml')

  if (parsed.querySelector('parsererror')) {
    return false
  }

  return parsed.documentElement?.tagName?.toLowerCase() === 'svg'
}
