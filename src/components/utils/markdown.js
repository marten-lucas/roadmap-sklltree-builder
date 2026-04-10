const ESCAPE_RE = /[&<>"']/g

const escapeMap = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

const escapeHtml = (value) => String(value ?? '').replace(ESCAPE_RE, (character) => escapeMap[character] ?? character)

const sanitizeUrl = (value) => {
  const rawValue = String(value ?? '').trim()
  if (!rawValue) {
    return ''
  }

  if (/^(https?:|mailto:|tel:|\/|#)/i.test(rawValue)) {
    return rawValue
  }

  return ''
}

const renderInlineMarkdown = (value) => {
  const escaped = escapeHtml(value)

  return escaped
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
      const safeUrl = sanitizeUrl(url)
      if (!safeUrl) {
        return label
      }

      return `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noreferrer noopener">${label}</a>`
    })
}

const renderHeadingBlock = (line) => {
  const match = line.match(/^(#{1,6})\s+(.+)$/)
  if (!match) {
    return null
  }

  const level = Math.min(6, match[1].length)
  const content = renderInlineMarkdown(match[2])
  return `<h${level}>${content}</h${level}>`
}

export const renderMarkdownToHtml = (value) => {
  const text = String(value ?? '').replace(/\r\n?/g, '\n').trim()

  if (!text) {
    return ''
  }

  const lines = text.split('\n')
  const blocks = []
  let currentParagraph = []
  let currentList = []

  const flushParagraph = () => {
    if (currentParagraph.length === 0) {
      return
    }

    const paragraphText = currentParagraph.join(' ')
    blocks.push(`<p>${renderInlineMarkdown(paragraphText).replace(/\n/g, '<br />')}</p>`)
    currentParagraph = []
  }

  const flushList = () => {
    if (currentList.length === 0) {
      return
    }

    blocks.push(`<ul>${currentList.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join('')}</ul>`)
    currentList = []
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()

    if (!line) {
      flushParagraph()
      flushList()
      continue
    }

    const headingHtml = renderHeadingBlock(line)
    if (headingHtml) {
      flushParagraph()
      flushList()
      blocks.push(headingHtml)
      continue
    }

    const listMatch = line.match(/^[-*+]\s+(.+)$/)
    if (listMatch) {
      flushParagraph()
      currentList.push(listMatch[1])
      continue
    }

    flushList()
    currentParagraph.push(line)
  }

  flushParagraph()
  flushList()

  return blocks.join('\n')
}

const wrapSelection = (value, selectionStart, selectionEnd, before, after = before) => {
  const text = String(value ?? '')
  const start = Math.max(0, selectionStart ?? 0)
  const end = Math.max(start, selectionEnd ?? start)
  const selected = text.slice(start, end)
  const nextValue = `${text.slice(0, start)}${before}${selected || before}${after}${text.slice(end)}`
  const nextSelectionStart = start + before.length
  const nextSelectionEnd = nextSelectionStart + (selected || before).length

  return {
    value: nextValue,
    selectionStart: nextSelectionStart,
    selectionEnd: nextSelectionEnd,
  }
}

const wrapLinesAsList = (value, selectionStart, selectionEnd) => {
  const text = String(value ?? '')
  const start = Math.max(0, selectionStart ?? 0)
  const end = Math.max(start, selectionEnd ?? start)
  const selected = text.slice(start, end)
  const lines = selected ? selected.split('\n') : ['']
  const listText = lines.map((line) => `- ${line.replace(/^[-*+]\s+/, '')}`).join('\n')
  const nextValue = `${text.slice(0, start)}${listText}${text.slice(end)}`

  return {
    value: nextValue,
    selectionStart: start,
    selectionEnd: start + listText.length,
  }
}

const wrapSelectionAsHeading = (value, selectionStart, selectionEnd, level = 2) => {
  const text = String(value ?? '')
  const start = Math.max(0, selectionStart ?? 0)
  const end = Math.max(start, selectionEnd ?? start)
  const marker = '#'.repeat(Math.max(1, Math.min(6, level)))
  const selected = text.slice(start, end)

  if (selected.length === 0) {
    const lineStart = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1
    const lineEnd = text.indexOf('\n', start)
    const resolvedEnd = lineEnd === -1 ? text.length : lineEnd
    const currentLine = text.slice(lineStart, resolvedEnd).replace(/^#{1,6}\s+/, '')
    const headingText = `${marker} ${currentLine || 'Heading'}`
    const nextValue = `${text.slice(0, lineStart)}${headingText}${text.slice(resolvedEnd)}`

    return {
      value: nextValue,
      selectionStart: lineStart + headingText.length,
      selectionEnd: lineStart + headingText.length,
    }
  }

  const headingText = selected
    .split('\n')
    .map((line) => `${marker} ${line.replace(/^#{1,6}\s+/, '')}`)
    .join('\n')

  return {
    value: `${text.slice(0, start)}${headingText}${text.slice(end)}`,
    selectionStart: start,
    selectionEnd: start + headingText.length,
  }
}

export const applyMarkdownFormatting = (value, selectionStart, selectionEnd, action) => {
  switch (action) {
    case 'bold':
      return wrapSelection(value, selectionStart, selectionEnd, '**')
    case 'italic':
      return wrapSelection(value, selectionStart, selectionEnd, '*')
    case 'header':
      return wrapSelectionAsHeading(value, selectionStart, selectionEnd, 2)
    case 'list':
      return wrapLinesAsList(value, selectionStart, selectionEnd)
    case 'link': {
      const selected = String(value ?? '').slice(Math.max(0, selectionStart ?? 0), Math.max(selectionStart ?? 0, selectionEnd ?? selectionStart ?? 0)).trim() || 'link'
      const url = window.prompt('Link-Ziel eingeben', 'https://')?.trim() ?? ''
      if (!url) {
        return null
      }

      const start = Math.max(0, selectionStart ?? 0)
      const end = Math.max(start, selectionEnd ?? start)
      const nextValue = `${String(value ?? '').slice(0, start)}[${selected}](${url})${String(value ?? '').slice(end)}`

      return {
        value: nextValue,
        selectionStart: start + 1,
        selectionEnd: start + 1 + selected.length,
      }
    }
    default:
      return null
  }
}

export const getMarkdownPreviewHtml = (value) => renderMarkdownToHtml(value)
